import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GISBridge,
  SpatialRTree,
  projectGeoJSON,
  computeVariableBuffers,
  ensureSpatialIndex,
} from '../js/gisBridge.js';
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

test('Requirement 3: evaluate() flags GIS site boundary setback violations', () => {
  const state = newState();
  state.rooms = [
    {
      id: 'r1',
      name: 'Living Room',
      level: 0,
      type: 'living',
      x: 10, // Outside inner buildable area
      y: 10,
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
