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

test('True ground-scale projection: reproject and projectGeoJSON agree within 0.1 in on SAMPLE_MUNICIPAL_GIS at 6928.38 x 6573.99 in', async () => {
  const { reproject, worldfileToAffineMatrix } = await import('../js/geometry.js');
  const { SAMPLE_MUNICIPAL_GIS, exportGeoJSON } = await import('../js/app.js');
  const { buildStudio } = await import('../js/templates.js');
  const { draw, drawSpatialReferenceOverlay } = await import('../js/render.js');

  const projected = projectGeoJSON(SAMPLE_MUNICIPAL_GIS);
  assert.equal(projected.features.length, 2);
  for (const feat of projected.features) {
    assert.equal(feat.type, 'Feature');
    assert.ok(
      feat.geometry && Array.isArray(feat.geometry.coordinates),
      'Retains canonical .geometry'
    );
  }

  const lotBounds = getBounds(projected.features[0].points);
  const lotWidth = lotBounds.maxX - lotBounds.minX;
  const lotHeight = lotBounds.maxY - lotBounds.minY;

  assert.ok(
    Math.abs(lotWidth - 6928.38) < 0.1,
    `projectGeoJSON width (${lotWidth.toFixed(2)}) must match 6928.38 in within 0.1 in`
  );
  assert.ok(
    Math.abs(lotHeight - 6573.99) < 0.1,
    `projectGeoJSON height (${lotHeight.toFixed(2)}) must match 6573.99 in within 0.1 in`
  );

  // Direct reproject on SAMPLE_MUNICIPAL_GIS agrees within 0.1 in
  const reprojectedFC = reproject(SAMPLE_MUNICIPAL_GIS, 'EPSG:4326', {
    epsg: 'PLAN',
    origin: projected.origin,
  });
  const reprojLotCoords = reprojectedFC.features[0].geometry.coordinates[0];
  const rxs = reprojLotCoords.map((c) => c[0]);
  const rys = reprojLotCoords.map((c) => c[1]);
  const reprojWidth = Math.max(...rxs) - Math.min(...rxs);
  const reprojHeight = Math.max(...rys) - Math.min(...rys);

  assert.ok(
    Math.abs(reprojWidth - lotWidth) < 0.1 && Math.abs(reprojHeight - lotHeight) < 0.1,
    `reproject (${reprojWidth.toFixed(2)}x${reprojHeight.toFixed(2)}) and projectGeoJSON (${lotWidth.toFixed(2)}x${lotHeight.toFixed(2)}) must agree within 0.1 in`
  );

  // Rooms drafted at (0, 0) in Studio template evaluate with 0 false setback violations inside true-scale parcel
  const studioState = buildStudio();
  const bridge = new GISBridge();
  studioState.site = bridge.importGeoJSON(SAMPLE_MUNICIPAL_GIS);
  const report = evaluate(studioState);
  const setbackViolations = report.violations.filter((v) => v.rule === 'setback-clearance');
  assert.equal(
    setbackViolations.length,
    0,
    'True-scale parcel must produce 0 false setback violations'
  );

  // Worldfile anchored to same parcel origin aligns cleanly with true ground scale
  // 1 pixel = 0.0254 m in UTM EPSG:32610 => 1.0 inch per pixel in PLAN
  const utmOrigin = reproject(
    [projected.origin.longitude, projected.origin.latitude],
    'EPSG:4326',
    'EPSG:32610'
  );
  const utmWld = [0.0254, 0, 0, -0.0254, utmOrigin[0], utmOrigin[1]];
  const aff = worldfileToAffineMatrix(utmWld, 'EPSG:32610', {
    epsg: 'PLAN',
    origin: projected.origin,
  });
  assert.ok(Math.abs(aff[0] - 1) < 1e-4, 'Worldfile X scale (0.0254m) equals 1 plan inch/px');
  assert.ok(Math.abs(aff[3] - 1) < 1e-4, 'Worldfile Y scale (-0.0254m) equals +1 plan inch/px');
  assert.ok(
    Math.abs(aff[4]) < 1e-4 && Math.abs(aff[5]) < 1e-4,
    'Worldfile at parcel origin maps to (0,0)'
  );

  // Verify Spatial Reference ruler ticks use custom origin without error
  const tickLabels = [];
  const mockCtx = {
    canvas: { width: 800, height: 600 },
    save() {},
    restore() {},
    setTransform() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fillRect() {},
    strokeRect() {},
    measureText: (t) => ({ width: String(t).length * 6 }),
    fillText: (t) => tickLabels.push(String(t)),
  };
  studioState.crs.epsg = 'EPSG:3857';
  studioState.crs.origin = projected.origin;
  drawSpatialReferenceOverlay(mockCtx, studioState, { ox: 400, oy: 300, scale: 0.08 });
  assert.ok(
    tickLabels.some((t) => t.includes('CRS: EPSG:3857')),
    'Ruler spatial badge reflects EPSG:3857 at parcel scale'
  );

  // MultiLineString projection, open polyline rendering, and GeoJSON export
  const mlsGeoJSON = {
    type: 'FeatureCollection',
    crs: { properties: { name: 'EPSG:4326' } },
    features: [
      ...SAMPLE_MUNICIPAL_GIS.features.slice(0, 1),
      {
        type: 'Feature',
        id: 'utility-mls',
        properties: { name: 'Dual Utility Corridor', layer: 'easement' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-122.4192, 37.7746],
              [-122.4184, 37.7746],
              [-122.4178, 37.7742],
            ],
            [
              [-122.4191, 37.7739],
              [-122.4176, 37.7739],
            ],
          ],
        },
      },
    ],
  };

  const mlsSite = bridge.importGeoJSON(mlsGeoJSON);
  const easementLayers = mlsSite.layers.filter((l) => l.type === 'gisEasement');
  assert.equal(
    easementLayers.length,
    2,
    'MultiLineString with 2 lines must emit 2 gisEasement layers'
  );
  assert.equal(
    easementLayers[0].closed,
    false,
    'MultiLineString easement layer must be marked open'
  );
  assert.equal(
    easementLayers[1].closed,
    false,
    'MultiLineString easement layer must be marked open'
  );

  // Verify open gisEasement layers do NOT call closePath() in render.js
  let easementCloseCalls = 0;
  let inPurpleDash = false;
  const renderCtx = new Proxy(
    {
      canvas: { width: 800, height: 600 },
      set strokeStyle(v) {
        inPurpleDash = v === '#7e22ce';
      },
      get strokeStyle() {
        return inPurpleDash ? '#7e22ce' : '#000';
      },
      closePath() {
        if (inPurpleDash) easementCloseCalls++;
      },
      measureText: () => ({ width: 20 }),
    },
    {
      get(target, prop) {
        return prop in target ? target[prop] : () => {};
      },
    }
  );
  const mlsState = newState();
  mlsState.site = mlsSite;
  const overlayScene = new ComplianceOverlayScene();
  overlayScene.update(mlsState, { violations: [] }, { curLevel: 0 });
  draw(renderCtx, mlsState, { ox: 400, oy: 300, scale: 0.08 }, { complianceScene: overlayScene });
  assert.equal(easementCloseCalls, 0, 'Open MultiLineString easements must not call closePath()');

  // Verify GeoJSON export preserves MultiLineString without dropped polylines
  const exportedGeo = exportGeoJSON(mlsState, 'EPSG:32610');
  const exportedMls = exportedGeo.features.find((f) => f.id === 'utility-mls');
  assert.ok(exportedMls, 'Exported GeoJSON must include MultiLineString feature');
  assert.equal(exportedMls.geometry.type, 'MultiLineString');
  assert.equal(exportedMls.geometry.coordinates.length, 2);
  assert.equal(exportedMls.geometry.coordinates[0].length, 3);
  assert.equal(exportedMls.geometry.coordinates[1].length, 2);
});

test('loadGISSubsystem, #gis-crs switching, setback preservation, and fit() down to 0.02', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const listeners = {};
  const els = {};
  const makeEl = (id) => {
    if (!els[id]) {
      els[id] = {
        id,
        width: 800,
        height: 600,
        value: id === 'gis-crs' ? 'EPSG:4326' : '',
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        querySelector: (s) => makeEl(s.replace(/^#/, '')),
        querySelectorAll: () => [],
        appendChild() {},
        removeChild() {},
        addEventListener(type, fn) {
          listeners[`${id}:${type}`] ||= [];
          listeners[`${id}:${type}`].push(fn);
        },
        removeEventListener() {},
        getAttribute: () => null,
        setAttribute() {},
        removeAttribute() {},
        hasAttribute: () => false,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        getContext: () =>
          new Proxy(
            {
              canvas: { width: 800, height: 600 },
              measureText: () => ({ width: 10 }),
              createPattern: () => ({}),
              createLinearGradient: () => ({ addColorStop() {} }),
              createRadialGradient: () => ({ addColorStop() {} }),
            },
            { get: (target, prop) => (prop in target ? target[prop] : () => {}) }
          ),
      };
    }
    return els[id];
  };

  globalThis.document = {
    activeElement: makeEl('body'),
    body: makeEl('body'),
    documentElement: makeEl('html'),
    getElementById: (id) => makeEl(id),
    querySelector: (s) => makeEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag) => makeEl(`${tag}-${Object.keys(els).length}`),
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: '' },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: globalThis.window.navigator,
    configurable: true,
    writable: true,
  });

  try {
    const appMod = await import(`../js/app.js?gis_crs_test=${Date.now()}`);
    const hg = globalThis.window.__homegen;

    // Seed a room plus SAMPLE_MUNICIPAL_GIS via loadGISSubsystem
    hg.apply((n) => {
      n.rooms = [
        {
          id: 'r-main',
          name: 'Main House',
          type: 'living',
          level: 0,
          x: 0,
          y: 0,
          w: 240,
          h: 180,
          ceiling: 96,
          walls: { N: 'paint_white', E: 'paint_white', S: 'paint_white', W: 'paint_white' },
          floor: 'wood_oak',
          openings: [],
          items: [],
        },
      ];
    }, 'Seed room');

    const site4326 = appMod.loadGISSubsystem(appMod.SAMPLE_MUNICIPAL_GIS);
    const b4326 = getBounds(site4326.features[0].points);
    const w4326 = b4326.maxX - b4326.minX;
    const h4326 = b4326.maxY - b4326.minY;

    assert.ok(
      Math.abs(w4326 - 6928.38) / 6928.38 <= 0.005 && Math.abs(h4326 - 6573.99) / 6573.99 <= 0.005,
      `loadGISSubsystem parcel (${w4326.toFixed(2)}x${h4326.toFixed(2)}) within ±0.5% of 6928.38x6573.99`
    );
    assert.equal(
      evaluate(hg.doc).violations.filter((v) => v.rule === 'setback-clearance').length,
      0
    );

    // Customize segment setback before switching CRS
    appMod.setGISSegmentSetback('seg-1', 72);
    assert.equal(hg.doc.site.segments[0].setback, 72);

    // Switch #gis-crs to EPSG:3857 -> EPSG:32610 -> EPSG:4326 via event listener or loadGISSubsystem
    const crsSelect = globalThis.document.querySelector('#gis-crs');
    const triggerCrsChange = (nextCrs) => {
      if (crsSelect) crsSelect.value = nextCrs;
      const cbs = listeners['gis-crs:change'] || [];
      if (cbs.length > 0) {
        for (const cb of cbs) cb({ detail: { value: nextCrs }, target: { value: nextCrs } });
      } else {
        appMod.loadGISSubsystem(
          { type: 'FeatureCollection', features: hg.doc.site.features },
          {
            crs: nextCrs,
            sourceCRS: hg.doc.site.crs,
            origin: hg.doc.site.origin,
            preserveSetbacks: true,
          }
        );
      }
    };

    triggerCrsChange('EPSG:3857');
    assert.equal(hg.doc.site.crs, 'EPSG:3857');
    assert.equal(hg.doc.crs.epsg, 'EPSG:3857');
    assert.equal(hg.doc.crs.geojson.features.length, 2);
    assert.equal(hg.doc.site.features.length, 2);
    assert.equal(hg.doc.site.layers.length, 3, 'All lot, easement, and setback layers preserved');
    assert.equal(
      hg.doc.site.segments[0].setback,
      72,
      'Customized 72in setback preserved on CRS switch'
    );
    assert.ok(
      Math.abs(hg.doc.site.features[0].geometry.coordinates[0][0][0]) > 1000000,
      'Canonical .geometry reprojected to Web Mercator meters'
    );

    triggerCrsChange('EPSG:32610');
    assert.equal(hg.doc.site.crs, 'EPSG:32610');
    assert.equal(hg.doc.crs.epsg, 'EPSG:32610');
    assert.equal(hg.doc.site.segments[0].setback, 72);

    triggerCrsChange('EPSG:4326');
    assert.equal(hg.doc.site.crs, 'EPSG:4326');
    assert.equal(hg.doc.crs.epsg, 'EPSG:4326');
    assert.equal(hg.doc.site.segments[0].setback, 72);
    assert.ok(
      Math.abs(hg.doc.site.features[0].geometry.coordinates[0][0][0] - -122.4194) < 1e-5,
      'Canonical .geometry roundtrips cleanly back to WGS84'
    );

    // Verify fit() frames combined room and site bounds down to 0.02
    assert.ok(
      hg.view.scale < 0.2 && hg.view.scale >= 0.02,
      `Fitted parcel scale (${hg.view.scale}) < 0.2`
    );

    // Huge site bounds (~30,000 in) clamps cleanly at 0.02
    hg.doc.site.features.push({
      type: 'Feature',
      id: 'far-corner',
      properties: { layer: 'easement' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-122.4194, 37.7749],
          [-122.41, 37.76],
        ],
      },
      layerKind: 'easement',
      points: [
        { x: -20000, y: -20000 },
        { x: 20000, y: 20000 },
      ],
    });
    appMod.fit();
    assert.equal(
      hg.view.scale,
      0.02,
      'fit() frames huge combined room and site bounds down to 0.02'
    );
  } finally {
    // Wait for debounced announceZoom / persist timers from app.js to settle before restoring globals
    await new Promise((r) => setTimeout(r, 450));
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
    if (prevNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', prevNavigatorDesc);
    }
  }
});
