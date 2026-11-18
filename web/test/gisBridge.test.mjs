import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GISBridge,
  SpatialRTree,
  projectGeoJSON,
  computeVariableBuffers,
  getBounds,
  boundsOverlap,
  pointInPolygon,
  lineIntersection,
  polygonArea,
} from '../js/gisBridge.js';
import {
  getBounds as geomGetBounds,
  boundsOverlap as geomBoundsOverlap,
  pointInPolygon as geomPointInPolygon,
  lineIntersection as geomLineIntersection,
  polygonArea as geomPolygonArea,
} from '../js/geometry.js';
import { newState } from '../js/model.js';
import { evaluate } from '../js/codes.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';

const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  crs: { properties: { name: 'EPSG:4326' } },
  features: [
    {
      type: 'Feature',
      id: 'lot-1',
      properties: { name: 'Main Property Lot', layer: 'lot', setback: 36 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4194, 37.7749],
            [-122.4174, 37.7749],
            [-122.4174, 37.7734],
            [-122.4194, 37.7734],
            [-122.4194, 37.7749],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'easement-1',
      properties: { name: 'Public Drainage Easement', layer: 'easement' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4194, 37.7737],
            [-122.4184, 37.7737],
            [-122.4184, 37.7734],
            [-122.4194, 37.7734],
            [-122.4194, 37.7737],
          ],
        ],
      },
    },
  ],
};

test('Requirement 1: newState initializes decoupled site subsystem property as null', () => {
  const state = newState();
  assert.equal(state.site, null, 'state.site must be initialized to null in newState()');
});

test('Requirement 2: projectGeoJSON transforms EPSG coordinates to plan canvas space', () => {
  const targetBounds = { x: 100, y: 100, w: 1000, h: 800 };
  const projected = projectGeoJSON(SAMPLE_GEOJSON, targetBounds, { crs: 'EPSG:4326' });

  assert.equal(projected.crs, 'EPSG:4326');
  assert.equal(projected.features.length, 2);
  assert.ok(projected.segments.length >= 4, 'Should extract lot line segments');
  assert.ok(projected.layers.length >= 2, 'Should extract lot line and easement layers');

  // Verify coordinates fall within target bounds
  for (const feat of projected.features) {
    for (const pt of feat.points) {
      assert.ok(pt.x >= targetBounds.x - 1, `pt.x (${pt.x}) should be >= targetBounds.x`);
      assert.ok(pt.y >= targetBounds.y - 1, `pt.y (${pt.y}) should be >= targetBounds.y`);
    }
  }
});

test('Requirement 2: computeVariableBuffers generates non-uniform setback polygons', () => {
  const segments = [
    { id: 's1', p1: { x: 0, y: 0 }, p2: { x: 500, y: 0 }, setback: 24, label: 'Front Edge' },
    { id: 's2', p1: { x: 500, y: 0 }, p2: { x: 500, y: 400 }, setback: 48, label: 'Side Edge' },
    { id: 's3', p1: { x: 500, y: 400 }, p2: { x: 0, y: 400 }, setback: 36, label: 'Rear Edge' },
    { id: 's4', p1: { x: 0, y: 400 }, p2: { x: 0, y: 0 }, setback: 24, label: 'Side Edge' },
  ];

  const bufferLayer = computeVariableBuffers(segments);
  assert.equal(bufferLayer.type, 'gisSetbackBuffer');
  assert.equal(bufferLayer.innerPoints.length, 4);

  // Inner points should be shifted inward by segment setbacks
  assert.ok(bufferLayer.innerPoints[0].y > 0, 'Front inner vertex should be shifted inward (+y)');
  assert.ok(bufferLayer.innerPoints[1].x < 500, 'Side inner vertex should be shifted inward (-x)');
});

test('Requirement 2: SpatialRTree spatial query execution speed is < 5 milliseconds', () => {
  const tree = new SpatialRTree();

  // Populate R-tree with 200 spatial features
  for (let i = 0; i < 200; i++) {
    const x = (i % 10) * 100;
    const y = Math.floor(i / 10) * 100;
    tree.insert(
      { id: `feature-${i}`, layerType: 'gisLotLine' },
      { minX: x, minY: y, maxX: x + 80, maxY: y + 80 }
    );
  }

  const queryRoomPoly = [
    { x: 150, y: 150 },
    { x: 250, y: 150 },
    { x: 250, y: 250 },
    { x: 150, y: 250 },
  ];

  const t0 = performance.now();
  for (let run = 0; run < 100; run++) {
    tree.querySetbackViolations(queryRoomPoly);
  }
  const elapsedTotal = performance.now() - t0;
  const avgQueryTime = elapsedTotal / 100;

  assert.ok(
    avgQueryTime < 5,
    `Average spatial query execution time (${avgQueryTime.toFixed(3)}ms) must be under 5ms`
  );
});

test('Requirement 2: SpatialRTree spatial miss returns empty array quickly without full dataset scan', () => {
  const tree = new SpatialRTree();
  let polygonAccessCount = 0;

  // Populate R-tree with 1,000 multi-vertex polygon features across a grid
  for (let i = 0; i < 1000; i++) {
    const x = (i % 25) * 200;
    const y = Math.floor(i / 25) * 200;
    const poly = [
      { x, y },
      { x: x + 120, y },
      { x: x + 120, y: y + 120 },
      { x, y: y + 120 },
    ];
    const feature = {
      id: `feature-${i}`,
      type: 'gisSetbackBuffer',
      get polygon() {
        polygonAccessCount++;
        return poly;
      },
    };
    tree.insert(feature, { minX: x, minY: y, maxX: x + 120, maxY: y + 120 });
  }

  let itemsMapCalls = 0;
  const origMap = tree.items.map.bind(tree.items);
  tree.items.map = (...args) => {
    itemsMapCalls++;
    return origMap(...args);
  };

  // Query 1: Room placed completely outside all site boundaries (array form)
  const outsideRoomPoly = [
    { x: 9000, y: 9000 },
    { x: 9120, y: 9000 },
    { x: 9120, y: 9120 },
    { x: 9000, y: 9120 },
  ];

  // Query 2: Room placed within a clear zone between disjoint features (rect object form)
  const clearZoneRoomRect = { x: 130, y: 130, w: 60, h: 60 };

  const t0 = performance.now();
  for (let run = 0; run < 100; run++) {
    const outsideViolations = tree.querySetbackViolations(outsideRoomPoly);
    assert.deepEqual(outsideViolations, []);

    const clearZoneViolations = tree.querySetbackViolations(clearZoneRoomRect);
    assert.deepEqual(clearZoneViolations, []);
  }
  const avgQueryTime = (performance.now() - t0) / 200;

  assert.equal(itemsMapCalls, 0, 'Spatial search miss must not fall back to this.items.map');
  assert.equal(
    polygonAccessCount,
    0,
    'Spatial search miss must not run point-in-polygon checks on unrelated site features'
  );
  assert.ok(
    avgQueryTime < 5,
    `Average spatial miss query time (${avgQueryTime.toFixed(3)}ms) must be under 5ms`
  );
});

test('Requirement 3: evaluate() flags GIS site boundary setback violations', () => {
  const state = newState();
  state.rooms = [
    {
      id: 'r1',
      name: 'Living Room',
      level: 0,
      type: 'living',
      x: 290, // Outside inner buildable area [319.83..880.17, 236..764], overlapping setback buffer
      y: 210,
      w: 120,
      h: 120,
      openings: [],
      items: [],
    },
  ];

  const bridge = new GISBridge();
  state.site = bridge.importGeoJSON(SAMPLE_GEOJSON, {
    targetBounds: { x: 200, y: 200, w: 800, h: 600 },
  });

  const report = evaluate(state);
  const setbackViolations = report.violations.filter((v) => v.rule === 'setback-clearance');

  assert.ok(
    setbackViolations.length > 0,
    'evaluate() should report setback-clearance violation when room extends into setback buffer'
  );
  assert.equal(setbackViolations[0].ref, 'Zoning / Site Code');
  assert.equal(setbackViolations[0].roomId, 'r1');
});

test('Requirement 3: evaluate() returns empty setback violations for rooms outside site boundaries or inside clear zone', () => {
  const state = newState();
  state.rooms = [
    {
      id: 'r-outside',
      name: 'Detached Studio',
      level: 0,
      type: 'living',
      x: 10, // Outside all site boundaries (spatial search miss)
      y: 10,
      w: 120,
      h: 120,
      openings: [],
      items: [],
    },
    {
      id: 'r-clear',
      name: 'Bedroom',
      level: 0,
      type: 'bedroom',
      x: 400, // Inside clear buildable zone [319.83..880.17, 236..764]
      y: 300,
      w: 120,
      h: 120,
      openings: [],
      items: [],
    },
  ];

  const bridge = new GISBridge();
  state.site = bridge.importGeoJSON(SAMPLE_GEOJSON, {
    targetBounds: { x: 200, y: 200, w: 800, h: 600 },
  });

  const report = evaluate(state);
  const setbackViolations = report.violations.filter((v) => v.rule === 'setback-clearance');

  assert.deepEqual(
    setbackViolations,
    [],
    'evaluate() must not report setback-clearance violations for non-overlapping or clear-zone rooms'
  );
});

test('Requirement 4: ComplianceOverlayScene registers site layer nodes (gisLotLine, gisEasement, gisSetbackBuffer)', () => {
  const state = newState();
  const bridge = new GISBridge();
  state.site = bridge.importGeoJSON(SAMPLE_GEOJSON);

  const scene = new ComplianceOverlayScene();
  scene.update(state, { violations: [] }, { curLevel: 0 });

  const nodes = scene.getNodes();
  const lotNodes = nodes.filter((n) => n.type === 'gisLotLine');
  const easementNodes = nodes.filter((n) => n.type === 'gisEasement');
  const setbackNodes = nodes.filter((n) => n.type === 'gisSetbackBuffer');

  assert.ok(lotNodes.length > 0, 'Compliance scene graph must contain gisLotLine nodes');
  assert.ok(easementNodes.length > 0, 'Compliance scene graph must contain gisEasement nodes');
  assert.ok(setbackNodes.length > 0, 'Compliance scene graph must contain gisSetbackBuffer nodes');
});

test('Requirement 4: projectGeoJSON transforms regional State Plane GeoJSON without NaN outputs', () => {
  const ilGeoJSON = {
    type: 'FeatureCollection',
    crs: { properties: { name: 'EPSG:3435' } },
    features: [
      {
        type: 'Feature',
        id: 'parcel-3435',
        properties: { name: 'Illinois Municipal Parcel', layer: 'lot' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [1100000, 1900000],
              [1100500, 1900000],
              [1100500, 1900500],
              [1100000, 1900500],
              [1100000, 1900000],
            ],
          ],
        },
      },
    ],
  };

  const targetBounds = { x: 50, y: 50, w: 500, h: 500 };
  const projected = projectGeoJSON(ilGeoJSON, targetBounds);

  assert.equal(projected.features.length, 1);
  const points = projected.features[0].points;
  assert.equal(points.length, 5);

  for (const pt of points) {
    assert.ok(!isNaN(pt.x), `pt.x (${pt.x}) must not be NaN`);
    assert.ok(!isNaN(pt.y), `pt.y (${pt.y}) must not be NaN`);
    assert.ok(pt.x >= targetBounds.x - 1, `pt.x (${pt.x}) should be within target bounds`);
    assert.ok(pt.y >= targetBounds.y - 1, `pt.y (${pt.y}) should be within target bounds`);
  }
});

test('Shared geometry consolidation: gisBridge re-exports canonical geometry.js functions', () => {
  assert.strictEqual(getBounds, geomGetBounds);
  assert.strictEqual(boundsOverlap, geomBoundsOverlap);
  assert.strictEqual(pointInPolygon, geomPointInPolygon);
  assert.strictEqual(lineIntersection, geomLineIntersection);
  assert.strictEqual(polygonArea, geomPolygonArea);
});

test('Shared geometry: pointInPolygon supports object {x, y}, array [x, y], and mixed coordinates', () => {
  const objectPoly = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const arrayPoly = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const mixedPoly = [{ x: 0, y: 0 }, [100, 0], { x: 100, y: 100 }, [0, 100]];

  // Inside point in both formats against all polygon formats
  assert.equal(pointInPolygon({ x: 50, y: 50 }, objectPoly), true);
  assert.equal(pointInPolygon([50, 50], objectPoly), true);
  assert.equal(pointInPolygon({ x: 50, y: 50 }, arrayPoly), true);
  assert.equal(pointInPolygon([50, 50], arrayPoly), true);
  assert.equal(pointInPolygon([50, 50], mixedPoly), true);

  // Outside point in both formats
  assert.equal(pointInPolygon({ x: 150, y: 50 }, objectPoly), false);
  assert.equal(pointInPolygon([150, 50], arrayPoly), false);
  assert.equal(pointInPolygon([0, -10], mixedPoly), false);
});

test('Shared geometry: polygonArea supports unsigned default and signed winding across object and array formats', () => {
  const ccwObjects = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];
  const cwObjects = [...ccwObjects].reverse();
  const ccwArrays = [
    [0, 0],
    [100, 0],
    [100, 50],
    [0, 50],
  ];
  const cwArrays = [...ccwArrays].reverse();

  // Default signed = false returns positive absolute area
  assert.equal(polygonArea(ccwObjects), 5000);
  assert.equal(polygonArea(cwObjects), 5000);
  assert.equal(polygonArea(ccwArrays), 5000);
  assert.equal(polygonArea(cwArrays), 5000);

  // signed = true preserves winding sign
  assert.equal(polygonArea(ccwObjects, true), 5000);
  assert.equal(polygonArea(cwObjects, true), -5000);
  assert.equal(polygonArea(ccwArrays, true), 5000);
  assert.equal(polygonArea(cwArrays, true), -5000);
});

test('Shared geometry: getBounds, boundsOverlap, lineIntersection, and CW computeVariableBuffers', () => {
  assert.deepEqual(getBounds([[10, 20], { x: 50, y: 80 }, [0, 40]]), {
    minX: 0,
    minY: 20,
    maxX: 50,
    maxY: 80,
  });
  assert.deepEqual(getBounds({ x: 10, y: 20, w: 30, h: 40 }), {
    minX: 10,
    minY: 20,
    maxX: 40,
    maxY: 60,
  });

  const b1 = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const b2 = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
  const b3 = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
  assert.equal(boundsOverlap(b1, b2), true);
  assert.equal(boundsOverlap(b1, b3), false);

  const interObj = lineIntersection(
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 10, y: 0 }
  );
  assert.deepEqual(interObj, { x: 5, y: 5 });
  const interArr = lineIntersection([0, 0], [10, 10], [0, 10], [10, 0]);
  assert.deepEqual(interArr, { x: 5, y: 5 });
  assert.equal(lineIntersection([0, 0], [10, 0], [0, 5], [10, 5]), null);

  // Verify computeVariableBuffers shifts inward even when segment winding is reversed (negative signed area)
  const reversedSegments = [
    { id: 'r1', p1: { x: 0, y: 0 }, p2: { x: 0, y: 400 }, setback: 24, label: 'West' },
    { id: 'r2', p1: { x: 0, y: 400 }, p2: { x: 500, y: 400 }, setback: 36, label: 'South' },
    { id: 'r3', p1: { x: 500, y: 400 }, p2: { x: 500, y: 0 }, setback: 48, label: 'East' },
    { id: 'r4', p1: { x: 500, y: 0 }, p2: { x: 0, y: 0 }, setback: 24, label: 'North' },
  ];
  const reversedBuffer = computeVariableBuffers(reversedSegments);
  for (const pt of reversedBuffer.innerPoints) {
    assert.ok(pt.x > 0 && pt.x < 500, `Inner x (${pt.x}) should be shifted inward inside (0, 500)`);
    assert.ok(pt.y > 0 && pt.y < 400, `Inner y (${pt.y}) should be shifted inward inside (0, 400)`);
  }
});

test('MultiPolygon: projectGeoJSON decomposes disjoint rings without cross-ring segments or corrupted buffers', () => {
  const multiPolygonGeoJSON = {
    type: 'FeatureCollection',
    crs: { properties: { name: 'EPSG:4326' } },
    features: [
      {
        type: 'Feature',
        id: 'split-lot',
        properties: { name: 'Split Parcel Lot', layer: 'lot', setback: 24 },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            // West parcel ring
            [
              [
                [-122.42, 37.775],
                [-122.419, 37.775],
                [-122.419, 37.774],
                [-122.42, 37.774],
                [-122.42, 37.775],
              ],
            ],
            // East parcel ring (disjoint across road gap)
            [
              [
                [-122.417, 37.775],
                [-122.416, 37.775],
                [-122.416, 37.774],
                [-122.417, 37.774],
                [-122.417, 37.775],
              ],
            ],
          ],
        },
      },
    ],
  };

  const projected = projectGeoJSON(multiPolygonGeoJSON, { x: 100, y: 100, w: 1000, h: 500 });

  // Should decompose into 2 independent single-ring features
  assert.equal(projected.features.length, 2);
  assert.equal(projected.features[0].id, 'split-lot-0');
  assert.equal(projected.features[1].id, 'split-lot-1');
  assert.equal(projected.features[0].parentId, 'split-lot');
  assert.equal(projected.features[1].parentId, 'split-lot');
  assert.equal(projected.features[0].points.length, 5);
  assert.equal(projected.features[1].points.length, 5);

  // Should extract 4 segments per ring = 8 segments total, with zero cross-ring segments
  assert.equal(projected.segments.length, 8);
  const westMaxX = Math.max(...projected.features[0].points.map((p) => p.x));
  const eastMinX = Math.min(...projected.features[1].points.map((p) => p.x));
  assert.ok(westMaxX < eastMinX, 'Disjoint component rings must remain spatially separated');

  for (const seg of projected.segments) {
    const spansWest = seg.p1.x <= westMaxX + 0.01 && seg.p2.x <= westMaxX + 0.01;
    const spansEast = seg.p1.x >= eastMinX - 0.01 && seg.p2.x >= eastMinX - 0.01;
    assert.ok(
      spansWest !== spansEast,
      `Segment ${seg.id} (${seg.p1.x},${seg.p1.y})->(${seg.p2.x},${seg.p2.y}) must stay within one component ring`
    );
  }

  // Should emit 2 independent gisLotLine layers and 2 independent gisSetbackBuffer layers
  const lotLayers = projected.layers.filter((l) => l.type === 'gisLotLine');
  const setbackLayers = projected.layers.filter((l) => l.type === 'gisSetbackBuffer');
  assert.equal(lotLayers.length, 2);
  assert.equal(setbackLayers.length, 2);

  for (let i = 0; i < 2; i++) {
    const lotBounds = lotLayers[i].bounds;
    const bufLayer = setbackLayers[i];
    assert.equal(bufLayer.innerPoints.length, 4);
    for (const pt of bufLayer.innerPoints) {
      assert.ok(
        pt.x > lotBounds.minX &&
          pt.x < lotBounds.maxX &&
          pt.y > lotBounds.minY &&
          pt.y < lotBounds.maxY,
        `Inner setback vertex (${pt.x}, ${pt.y}) must lie strictly inside component ring ${i}`
      );
    }
  }
});

test('MultiPolygon: computeVariableBuffers and GISBridge handle multi-ring setbacks and compliance', () => {
  // Verify raw unannotated multi-ring segment loops also group cleanly
  const rawMultiLoopSegments = [
    { id: 'w1', p1: { x: 0, y: 0 }, p2: { x: 200, y: 0 }, setback: 20 },
    { id: 'w2', p1: { x: 200, y: 0 }, p2: { x: 200, y: 200 }, setback: 20 },
    { id: 'w3', p1: { x: 200, y: 200 }, p2: { x: 0, y: 200 }, setback: 20 },
    { id: 'w4', p1: { x: 0, y: 200 }, p2: { x: 0, y: 0 }, setback: 20 },
    { id: 'e1', p1: { x: 500, y: 0 }, p2: { x: 700, y: 0 }, setback: 30 },
    { id: 'e2', p1: { x: 700, y: 0 }, p2: { x: 700, y: 200 }, setback: 30 },
    { id: 'e3', p1: { x: 700, y: 200 }, p2: { x: 500, y: 200 }, setback: 30 },
    { id: 'e4', p1: { x: 500, y: 200 }, p2: { x: 500, y: 0 }, setback: 30 },
  ];

  const multiBuf = computeVariableBuffers(rawMultiLoopSegments);
  assert.equal(multiBuf.rings.length, 2);
  assert.deepEqual(multiBuf.rings[0].innerPoints[0], { x: 20, y: 20 });
  assert.deepEqual(multiBuf.rings[1].innerPoints[0], { x: 530, y: 30 });

  // End-to-end GISBridge compliance check across MultiPolygon components
  const mpGeoJSON = {
    type: 'Feature',
    id: 'mp-parcel',
    properties: { name: 'Twin Lot', layer: 'lot', setback: 20 },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-122.42, 37.775],
            [-122.419, 37.775],
            [-122.419, 37.774],
            [-122.42, 37.774],
            [-122.42, 37.775],
          ],
        ],
        [
          [
            [-122.417, 37.775],
            [-122.416, 37.775],
            [-122.416, 37.774],
            [-122.417, 37.774],
            [-122.417, 37.775],
          ],
        ],
      ],
    },
  };

  const bridge = new GISBridge();
  const site = bridge.importGeoJSON(mpGeoJSON, {
    targetBounds: { x: 100, y: 100, w: 1000, h: 400 },
  });

  // Updating one segment setback preserves multi-ring buffer layers
  const eastSeg = site.segments.find((s) => s.ringId === 'mp-parcel-1');
  bridge.setSegmentSetback(eastSeg.id, 30);
  const setbackLayers = site.layers.filter((l) => l.type === 'gisSetbackBuffer');
  assert.equal(setbackLayers.length, 2);

  // Room placed inside East component's inner buildable bounds should have 0 violations
  const eastInnerBounds = setbackLayers[1].bounds;
  const validEastRoom = [
    { x: eastInnerBounds.minX + 40, y: eastInnerBounds.minY + 40 },
    { x: eastInnerBounds.minX + 80, y: eastInnerBounds.minY + 40 },
    { x: eastInnerBounds.minX + 80, y: eastInnerBounds.minY + 80 },
    { x: eastInnerBounds.minX + 40, y: eastInnerBounds.minY + 80 },
  ];
  assert.equal(bridge.querySetbackViolations(validEastRoom).length, 0);

  // Room placed in the gap between the two disjoint parcel rings must trigger violations
  const westLotBounds = site.layers.find((l) => l.id === 'mp-parcel-0').bounds;
  const eastLotBounds = site.layers.find((l) => l.id === 'mp-parcel-1').bounds;
  const midGapX = (westLotBounds.maxX + eastLotBounds.minX) / 2;
  const midGapY = (westLotBounds.minY + westLotBounds.maxY) / 2;
  const gapRoom = [
    { x: midGapX - 10, y: midGapY - 10 },
    { x: midGapX + 10, y: midGapY - 10 },
    { x: midGapX + 10, y: midGapY + 10 },
    { x: midGapX - 10, y: midGapY + 10 },
  ];
  const gapViolations = bridge.querySetbackViolations(gapRoom);
  assert.ok(gapViolations.some((v) => v.type === 'setback-clearance'));
  assert.ok(gapViolations.some((v) => v.type === 'lot-boundary-exceeded'));
});

test('MultiPolygon edge cases: empty coordinates and rings with fewer than 3 vertices are filtered out', () => {
  const emptyMultiPolygon = {
    type: 'Feature',
    id: 'empty-mp',
    properties: { layer: 'lot' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [],
        [[]],
        [
          [
            [-122.42, 37.775],
            [-122.419, 37.775],
            [-122.42, 37.775],
          ],
        ],
      ],
    },
  };

  const emptyRes = projectGeoJSON(emptyMultiPolygon);
  assert.equal(emptyRes.features.length, 0);
  assert.equal(emptyRes.segments.length, 0);
  assert.equal(emptyRes.layers.length, 0);

  const mixedMultiPolygon = {
    type: 'Feature',
    id: 'mixed-mp',
    properties: { layer: 'lot', setback: 24 },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [],
        [[[0, 0]]],
        [
          [
            [-122.42, 37.775],
            [-122.419, 37.775],
          ],
        ],
        // Closed 3-point degenerate line (only 2 distinct vertices)
        [
          [
            [-122.42, 37.775],
            [-122.419, 37.775],
            [-122.42, 37.775],
          ],
        ],
        // Valid 4-vertex closed polygon ring
        [
          [
            [-122.42, 37.775],
            [-122.418, 37.775],
            [-122.418, 37.773],
            [-122.42, 37.773],
            [-122.42, 37.775],
          ],
        ],
      ],
    },
  };

  const mixedRes = projectGeoJSON(mixedMultiPolygon, { x: 100, y: 100, w: 600, h: 600 });
  assert.equal(mixedRes.features.length, 1);
  assert.equal(mixedRes.features[0].id, 'mixed-mp-0');
  assert.equal(mixedRes.segments.length, 4);
  assert.equal(mixedRes.layers.filter((l) => l.type === 'gisLotLine').length, 1);
  assert.equal(mixedRes.layers.filter((l) => l.type === 'gisSetbackBuffer').length, 1);
});
