import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, createRoom, addItem, addOpening } from '../js/model.js';
import { evaluate } from '../js/codes.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';

test('ComplianceOverlayScene compiles spatial nodes for active compliance violations', () => {
  const state = newState();
  // Undersized room generates a violation
  const room = createRoom(state, 'bedroom', 0, 0, 48, 48); // 4 ft x 4 ft = 16 sq ft < 70 sq ft
  const report = evaluate(state);

  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const nodes = scene.getNodes();
  assert.ok(nodes.length > 0, 'Scene should contain overlay nodes');

  const violationNodes = scene.getNodesByType('violation');
  assert.ok(violationNodes.length > 0, 'Should compile violation nodes for active rule violations');
  assert.ok(violationNodes.some((n) => n.data.message.includes('70 sq ft')));
});

test('Fixture clearance nodes detect collision with adjacent floor objects', () => {
  const state = newState();
  const room = createRoom(state, 'bathroom', 0, 0, 120, 120);

  // Add toilet
  const toilet = addItem(state, room, 'toilet', { x: 30, y: 30, rot: 0 });
  // Add another blocking fixture right inside the toilet's clearance zone
  addItem(state, room, 'vanity', { x: 30, y: 45, rot: 0 });

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });

  const clearanceNodes = scene.getNodesByType('fixtureClearance');
  assert.ok(clearanceNodes.length >= 1, 'Should generate fixture clearance nodes');

  const toiletClearance = clearanceNodes.find((n) => n.data.itemId === toilet.id);
  assert.ok(toiletClearance, 'Toilet clearance node should exist');
  assert.equal(
    toiletClearance.data.isColliding,
    true,
    'Toilet clearance should report collision when overlapped'
  );
  assert.equal(
    toiletClearance.data.borderColor,
    '#e84040',
    'Colliding clearance should render red border'
  );
});

test('Window egress nodes display interactive compliance badges on sleeping room exterior walls', () => {
  const state = newState();
  const room = createRoom(state, 'bedroom', 0, 0, 144, 144);
  // Add an egress window on exterior wall
  const window = addOpening(state, room, 'win_hung_36x60', 'N', 36);

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });

  const egressNodes = scene.getNodesByType('egressReach');
  assert.equal(egressNodes.length, 1, 'Should create egress reach node for bedroom window');

  const egressNode = egressNodes[0];
  assert.equal(egressNode.data.openingId, window.id);
  assert.equal(egressNode.data.isSleeping, true);
  assert.equal(egressNode.data.isExterior, true);
  assert.equal(egressNode.data.isEgressCompliant, true);
  assert.ok(egressNode.data.badgeText.includes('Egress OK'));
});

test('Constraint handle nodes provide live numerical dimension text and corner handle nodes', () => {
  const state = newState();
  const room = createRoom(state, 'living', 0, 0, 144, 120); // 12' x 10'

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const handles = scene.getNodesByType('constraintHandle');
  assert.equal(handles.length, 4, 'Should generate 4 corner constraint handles for selected room');

  const dimLabels = scene.getNodesByType('dimensionLabel');
  assert.equal(dimLabels.length, 1, 'Should generate dimension label node');
  assert.equal(dimLabels[0].data.dimensionText, '12\' 0" × 10\' 0"');
  assert.equal(dimLabels[0].data.isValid, true);
});

test('ComplianceOverlayScene does not mutate underlying document state objects', () => {
  const state = newState();
  createRoom(state, 'bedroom', 0, 0, 144, 144);
  const stateJsonBefore = JSON.stringify(state);

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });

  const stateJsonAfter = JSON.stringify(state);
  assert.equal(
    stateJsonAfter,
    stateJsonBefore,
    'ComplianceOverlayScene adapter must NOT mutate state'
  );
});

test('ComplianceOverlayScene maintains persistent index maps and invalidates on state mutation', () => {
  const state = newState();
  const room = createRoom(state, 'bathroom', 0, 0, 120, 120);
  addItem(state, room, 'toilet', { x: 30, y: 30, rot: 0 });
  const report = evaluate(state);

  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });

  assert.equal(scene.roomIndex.size, 1);
  assert.equal(scene.itemIndex.size, 1);
  assert.ok(scene.lastStateHash !== null);

  const initialHash = scene.lastStateHash;

  // Second update on unchanged state reuses index maps without rebuilding
  scene.update(state, report, { curLevel: 0 });
  assert.equal(scene.lastStateHash, initialHash);

  // Mutate state (add item)
  addItem(state, room, 'vanity', { x: 80, y: 30, rot: 0 });
  const updatedReport = evaluate(state);
  scene.update(state, updatedReport, { curLevel: 0 });

  assert.equal(scene.itemIndex.size, 2);
  assert.notEqual(scene.lastStateHash, initialHash);
});

test('ComplianceOverlayScene manual cache invalidation clears indexes and forces rebuild', () => {
  const state = newState();
  createRoom(state, 'bedroom', 0, 0, 144, 144);
  const report = evaluate(state);

  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });

  assert.equal(scene.roomIndex.size, 1);
  assert.ok(scene.lastStateHash);

  // Manual cache invalidation
  scene.invalidateCache();
  assert.equal(scene.roomIndex.size, 0);
  assert.equal(scene.itemIndex.size, 0);
  assert.equal(scene.openingIndex.size, 0);
  assert.equal(scene.spatialGrid.size, 0);
  assert.equal(scene.lastStateHash, null);

  // Update rebuilds indexes cleanly
  scene.update(state, report, { curLevel: 0 });
  assert.equal(scene.roomIndex.size, 1);
});

test('2D Spatial grid accurately partitions and queries room floor items', () => {
  const state = newState();
  const room = createRoom(state, 'bathroom', 0, 0, 240, 240);

  // Item A at (30, 30)
  const itemA = addItem(state, room, 'toilet', { x: 30, y: 30, rot: 0 });
  // Item B at far corner (200, 200)
  const itemB = addItem(state, room, 'vanity', { x: 200, y: 200, rot: 0 });

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });

  // Query zone around Item A
  const zoneA = { x: 15, y: 15, w: 30, h: 50 };
  const candidates = scene.querySpatialGrid(zoneA, room.id);

  assert.ok(candidates.some((c) => c.item.id === itemA.id));
  assert.ok(
    !candidates.some((c) => c.item.id === itemB.id),
    'Far item should not be returned in spatial grid query for local zone'
  );
});

test('ComplianceOverlayScene dispose clears cached nodes, indexes, and spatial grid', () => {
  const state = newState();
  createRoom(state, 'bedroom', 0, 0, 144, 144);
  const report = evaluate(state);

  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0 });
  assert.ok(scene.getNodes().length > 0);
  assert.equal(scene.roomIndex.size, 1);

  scene.dispose();
  assert.equal(scene.getNodes().length, 0, 'dispose() must clear scene graph nodes');
  assert.equal(scene.roomIndex.size, 0, 'dispose() must clear room index');
  assert.equal(scene.itemIndex.size, 0, 'dispose() must clear item index');
  assert.equal(scene.openingIndex.size, 0, 'dispose() must clear opening index');
  assert.equal(scene.spatialGrid.size, 0, 'dispose() must clear spatial grid');
  assert.equal(scene.lastStateHash, null, 'dispose() must clear state hash');
});
