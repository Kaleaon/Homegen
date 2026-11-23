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
import { newState, serialize, deserialize } from '../js/model.js';
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

test('True ground scale: SAMPLE_GEOJSON projects to 6928.38 in x 6573.99 in and centered 900x600 room has 0 setback violations', () => {
  const state = newState();
  const bridge = new GISBridge();
  state.site = bridge.importGeoJSON(SAMPLE_GEOJSON);

  const lotLayer = state.site.layers.find((l) => l.type === 'gisLotLine');
  assert.ok(lotLayer, 'Must emit gisLotLine layer');

  const lotWidth = Math.round((lotLayer.bounds.maxX - lotLayer.bounds.minX) * 100) / 100;
  const lotHeight = Math.round((lotLayer.bounds.maxY - lotLayer.bounds.minY) * 100) / 100;

  assert.equal(lotWidth, 6928.38, 'Lot width must equal 6928.38 inches (577.37 ft)');
  assert.equal(lotHeight, 6573.99, 'Lot height must equal 6573.99 inches (547.83 ft)');

  // Centered 900 in x 600 in room (75 ft x 50 ft) inside the parcel
  const cx = (lotLayer.bounds.minX + lotLayer.bounds.maxX) / 2;
  const cy = (lotLayer.bounds.minY + lotLayer.bounds.maxY) / 2;
  state.rooms = [
    {
      id: 'centered-home',
      name: 'Main Residence',
      level: 0,
      type: 'living',
      x: cx - 450,
      y: cy - 300,
      w: 900,
      h: 600,
      openings: [],
      items: [],
    },
  ];

  assert.deepEqual(
    bridge.querySetbackViolations({ x: cx - 450, y: cy - 300, w: 900, h: 600 }),
    [],
    'Centered 900x600 room must trigger 0 spatial setback violations'
  );

  const report = evaluate(state);
  const setbackViolations = report.violations.filter((v) => v.rule === 'setback-clearance');
  assert.equal(
    setbackViolations.length,
    0,
    'evaluate() must report 0 setback-clearance errors for centered 900x600 room'
  );

  // Room encroaching within 12" of the West lot line (< 36" setback) must still trigger violation
  const encroachingViolations = bridge.querySetbackViolations({
    x: lotLayer.bounds.minX + 12,
    y: cy - 100,
    w: 240,
    h: 200,
  });
  assert.ok(
    encroachingViolations.some((v) => v.type === 'setback-clearance'),
    'Room encroaching into 36-inch setback buffer must trigger setback-clearance violation'
  );
});

test('True ground scale: 25 ft x 40 ft parcel without targetBounds produces exact 300 in x 480 in across projected linear units', () => {
  // 1. State Plane US Survey Feet (EPSG:2227, +units=us-ft)
  const spParcel = {
    type: 'Feature',
    id: 'lot-sp',
    properties: { layer: 'lot' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [6000000, 2100000],
          [6000025, 2100000],
          [6000025, 2100040],
          [6000000, 2100040],
          [6000000, 2100000],
        ],
      ],
    },
  };
  const projSp = projectGeoJSON(spParcel, null, { crs: 'EPSG:2227' });
  const spBounds = projSp.layers.find((l) => l.type === 'gisLotLine').bounds;
  assert.equal(Math.round((spBounds.maxX - spBounds.minX) * 100) / 100, 300);
  assert.equal(Math.round((spBounds.maxY - spBounds.minY) * 100) / 100, 480);

  // 2. International Feet (+units=ft)
  const ftProj4 =
    '+proj=tmerc +lat_0=37.7749 +lon_0=-122.4194 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=ft +no_defs';
  const ftParcel = {
    type: 'Feature',
    id: 'lot-ft',
    properties: { layer: 'lot' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [25, 0],
          [25, 40],
          [0, 40],
          [0, 0],
        ],
      ],
    },
  };
  const projFt = projectGeoJSON(ftParcel, null, { crs: ftProj4 });
  const ftBounds = projFt.layers.find((l) => l.type === 'gisLotLine').bounds;
  assert.equal(Math.round((ftBounds.maxX - ftBounds.minX) * 100) / 100, 300);
  assert.equal(Math.round((ftBounds.maxY - ftBounds.minY) * 100) / 100, 480);

  // 3. UTM Meters (EPSG:32610, +units=m: 7.62 m x 12.192 m = 25 ft x 40 ft)
  const utmParcel = {
    type: 'Feature',
    id: 'lot-utm',
    properties: { layer: 'lot' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [551000, 4180000],
          [551007.62, 4180000],
          [551007.62, 4180012.192],
          [551000, 4180012.192],
          [551000, 4180000],
        ],
      ],
    },
  };
  const projUtm = projectGeoJSON(utmParcel, null, { crs: 'EPSG:32610' });
  const utmBounds = projUtm.layers.find((l) => l.type === 'gisLotLine').bounds;
  assert.equal(Math.round((utmBounds.maxX - utmBounds.minX) * 100) / 100, 300);
  assert.equal(Math.round((utmBounds.maxY - utmBounds.minY) * 100) / 100, 480);
});

test('MultiLineString: projectGeoJSON emits indexed gisEasement polylines without skewing parcel dimensions', () => {
  const surveyWithMultiLine = {
    type: 'FeatureCollection',
    crs: { properties: { name: 'EPSG:4326' } },
    features: [
      SAMPLE_GEOJSON.features[0],
      {
        type: 'Feature',
        id: 'utility-corridor',
        properties: { name: 'Multi-Part Utility Corridor', layer: 'easement' },
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            // Valid 3-vertex trunk line extending outside parcel
            [
              [-122.421, 37.7755],
              [-122.4184, 37.7745],
              [-122.416, 37.7745],
            ],
            // Degenerate 1-vertex line (must be filtered out)
            [[-122.418, 37.774]],
            // Valid 2-vertex lateral branch
            [
              [-122.4184, 37.7745],
              [-122.4184, 37.7734],
            ],
          ],
        },
      },
    ],
  };

  const projected = projectGeoJSON(surveyWithMultiLine);
  const lotLayer = projected.layers.find((l) => l.type === 'gisLotLine');
  const easementLayers = projected.layers.filter((l) => l.type === 'gisEasement');

  // Parcel dimensions remain exact 6928.38 x 6573.99 despite off-parcel MultiLineString extent
  assert.equal(Math.round((lotLayer.bounds.maxX - lotLayer.bounds.minX) * 100) / 100, 6928.38);
  assert.equal(Math.round((lotLayer.bounds.maxY - lotLayer.bounds.minY) * 100) / 100, 6573.99);

  // Two valid polylines emitted as indexed gisEasement features and layers
  assert.equal(easementLayers.length, 2);
  assert.equal(easementLayers[0].id, 'utility-corridor-0');
  assert.equal(easementLayers[0].parentId, 'utility-corridor');
  assert.equal(easementLayers[0].componentIndex, 0);
  assert.equal(easementLayers[0].points.length, 3);
  assert.equal(easementLayers[1].id, 'utility-corridor-1');
  assert.equal(easementLayers[1].parentId, 'utility-corridor');
  assert.equal(easementLayers[1].componentIndex, 1);
  assert.equal(easementLayers[1].points.length, 2);

  // Bare MultiLineString geometry object also projects cleanly
  const bareMultiLine = projectGeoJSON({
    type: 'MultiLineString',
    coordinates: [
      [
        [-122.4194, 37.7749],
        [-122.4184, 37.7749],
      ],
      [
        [-122.4184, 37.7749],
        [-122.4184, 37.7739],
      ],
    ],
  });
  assert.equal(bareMultiLine.features.length, 2);
  assert.equal(bareMultiLine.layers.filter((l) => l.type === 'gisEasement').length, 2);
  assert.equal(bareMultiLine.segments.length, 0);
});

test('Site metadata persistence and non-destructive CRS reprojection preserve rawGeoJSON, setbacks, and layers', () => {
  const state = newState();
  const bridge = new GISBridge();
  state.site = bridge.importGeoJSON(SAMPLE_GEOJSON);

  assert.ok(state.site.rawGeoJSON, 'site.rawGeoJSON must be stored');
  assert.equal(state.site.sourceCRS, 'EPSG:4326');
  assert.ok(
    Math.abs(state.site.origin.longitude - -122.4184) < 1e-6 &&
      Math.abs(state.site.origin.latitude - 37.77415) < 1e-6,
    'site.origin must match parcel centroid'
  );

  // Customize setback on first segment
  bridge.setSegmentSetback('seg-1', 96);
  assert.equal(state.site.segments.find((s) => s.id === 'seg-1').setback, 96);

  // Verify model serialize/deserialize preserves rawGeoJSON, sourceCRS, origin, and setbacks
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.site.rawGeoJSON, SAMPLE_GEOJSON);
  assert.equal(restored.site.sourceCRS, 'EPSG:4326');
  assert.deepEqual(restored.site.origin, state.site.origin);
  assert.equal(restored.site.segments.find((s) => s.id === 'seg-1').setback, 96);

  // Re-project to EPSG:3857 and EPSG:32610 without losing features, segments, setbacks, or layers
  const restoredBridge = new GISBridge(restored.site);
  restoredBridge.reprojectSite('EPSG:3857');
  assert.equal(restored.site.crs, 'EPSG:3857');
  assert.equal(restored.site.sourceCRS, 'EPSG:4326');
  assert.equal(restored.site.features.length, 2);
  assert.equal(restored.site.segments.length, 4);
  assert.equal(restored.site.segments.find((s) => s.id === 'seg-1').setback, 96);
  assert.equal(restored.site.layers.length, 3);

  const mercLot = restored.site.layers.find((l) => l.type === 'gisLotLine');
  assert.equal(Math.round((mercLot.bounds.maxX - mercLot.bounds.minX) * 100) / 100, 6928.38);
  assert.equal(Math.round((mercLot.bounds.maxY - mercLot.bounds.minY) * 100) / 100, 6573.99);

  restoredBridge.reprojectSite('EPSG:32610');
  assert.equal(restored.site.crs, 'EPSG:32610');
  assert.equal(restored.site.sourceCRS, 'EPSG:4326');
  assert.equal(restored.site.features.length, 2);
  assert.equal(restored.site.segments.length, 4);
  assert.equal(restored.site.segments.find((s) => s.id === 'seg-1').setback, 96);
  assert.equal(restored.site.layers.length, 3);

  const utmLot = restored.site.layers.find((l) => l.type === 'gisLotLine');
  const utmEdgeW = Math.hypot(
    utmLot.points[1].x - utmLot.points[0].x,
    utmLot.points[1].y - utmLot.points[0].y
  );
  const utmEdgeH = Math.hypot(
    utmLot.points[2].x - utmLot.points[1].x,
    utmLot.points[2].y - utmLot.points[1].y
  );
  assert.ok(
    Math.abs(utmEdgeW - 6928.38) / 6928.38 < 0.005 &&
      Math.abs(utmEdgeH - 6573.99) / 6573.99 < 0.005,
    `UTM Zone 10N parcel edges (${utmEdgeW.toFixed(2)} x ${utmEdgeH.toFixed(2)}) must match ground scale within 0.5%`
  );
});

test('App integration: loadGISSubsystem, #gis-crs switching, and fit() with 0 rooms frame site down to 0.02 scale', async () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) {
      const listeners = {};
      const attrs = {};
      elements[id] = {
        id,
        tagName: id === 'plan' ? 'CANVAS' : 'DIV',
        style: {},
        dataset: {},
        hidden: false,
        checked: true,
        value: id === 'gis-crs' ? 'EPSG:4326' : '',
        innerHTML: '',
        textContent: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        querySelector: (s) => getEl(s.replace(/^#/, '')),
        querySelectorAll: () => [],
        addEventListener(type, fn) {
          listeners[type] ||= [];
          listeners[type].push(fn);
        },
        removeEventListener() {},
        dispatchEvent(evt) {
          for (const cb of listeners[evt.type] || []) cb(evt);
        },
        closest: () => null,
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        setAttribute: (k, v) => {
          attrs[k] = String(v);
        },
        removeAttribute: (k) => {
          delete attrs[k];
        },
        hasAttribute: (k) => k in attrs,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        getContext: () =>
          new Proxy(
            {
              canvas: { width: 800, height: 600 },
              measureText: () => ({ width: 10 }),
              createLinearGradient: () => ({ addColorStop() {} }),
              createPattern: () => ({}),
            },
            { get: (t, p) => (p in t ? t[p] : () => {}) }
          ),
      };
    }
    return elements[id];
  };

  globalThis.document = {
    activeElement: getEl('body'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag) => getEl(tag),
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };

  const app = await import('../js/app.js');
  const homegen = globalThis.window.__homegen;

  // 1. Load SAMPLE_MUNICIPAL_GIS with 0 rooms -> true ground scale + fit() frames site
  const site = app.loadGISSubsystem(app.SAMPLE_MUNICIPAL_GIS);
  assert.equal(homegen.doc.rooms.length, 0);
  const lotLayer = site.layers.find((l) => l.type === 'gisLotLine');
  assert.equal(Math.round((lotLayer.bounds.maxX - lotLayer.bounds.minX) * 100) / 100, 6928.38);
  assert.equal(Math.round((lotLayer.bounds.maxY - lotLayer.bounds.minY) * 100) / 100, 6573.99);
  assert.ok(
    homegen.view.scale < 0.4 && homegen.view.scale >= 0.02,
    `fit() with 0 rooms should zoom out below 0.4 (got ${homegen.view.scale}) to frame municipal parcel`
  );

  // 2. Add a room and customize a segment setback, then switch #gis-crs to EPSG:3857 and EPSG:32610
  homegen.doc.rooms.push({
    id: 'r-test',
    name: 'Studio',
    level: 0,
    type: 'living',
    x: -450,
    y: -300,
    w: 900,
    h: 600,
    points: [
      { x: -450, y: -300 },
      { x: 450, y: -300 },
      { x: 450, y: 300 },
      { x: -450, y: 300 },
    ],
    openings: [],
    items: [],
  });
  const origRoomVerts = JSON.parse(JSON.stringify(homegen.doc.rooms[0].points));
  app.setGISSegmentSetback('seg-1', 84);

  const gisCrsEl = getEl('gis-crs');
  gisCrsEl.value = 'EPSG:3857';
  gisCrsEl.dispatchEvent({
    type: 'change',
    detail: { value: 'EPSG:3857' },
    target: gisCrsEl,
  });

  assert.equal(homegen.doc.site.crs, 'EPSG:3857');
  assert.equal(homegen.doc.crs.epsg, 'EPSG:3857');
  assert.equal(homegen.doc.site.features.length, 2);
  assert.equal(homegen.doc.site.segments.length, 4);
  assert.equal(homegen.doc.site.segments.find((s) => s.id === 'seg-1').setback, 84);
  assert.equal(homegen.doc.site.layers.length, 3);
  assert.deepEqual(
    homegen.doc.rooms[0].points,
    origRoomVerts,
    'Room vertices must not mutate on CRS switch'
  );

  gisCrsEl.value = 'EPSG:32610';
  gisCrsEl.dispatchEvent({
    type: 'change',
    detail: { value: 'EPSG:32610' },
    target: gisCrsEl,
  });

  assert.equal(homegen.doc.site.crs, 'EPSG:32610');
  assert.equal(homegen.doc.crs.epsg, 'EPSG:32610');
  assert.equal(homegen.doc.site.features.length, 2);
  assert.equal(homegen.doc.site.segments.length, 4);
  assert.equal(homegen.doc.site.segments.find((s) => s.id === 'seg-1').setback, 84);
  assert.equal(homegen.doc.site.layers.length, 3);
  assert.deepEqual(
    homegen.doc.rooms[0].points,
    origRoomVerts,
    'Room vertices must not mutate on CRS switch'
  );

  // 3. Multi-acre parcel (> 36,000 in wide) with 0 rooms clamps cleanly to 0.02 minimum zoom floor
  homegen.doc.rooms = [];
  const hugeParcel = {
    type: 'Feature',
    id: 'ranch-lot',
    properties: { layer: 'lot' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [550000, 4180000],
          [551500, 4180000],
          [551500, 4181500],
          [550000, 4181500],
          [550000, 4180000],
        ],
      ],
    },
  };
  app.loadGISSubsystem(hugeParcel, { crs: 'EPSG:32610' });
  app.fit();
  assert.equal(homegen.view.scale, 0.02, 'fit() with huge parcel must clamp down to 0.02 scale');
});
