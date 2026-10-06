import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, createRoom, addItem, addOpening } from '../js/model.js';
import { evaluate } from '../js/codes.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';
import { getToken } from '../js/kthemeTokens.js';

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

test('ComplianceOverlayScene calculates fixButtonBounds for fixable violations and supports hitTest', () => {
  const state = newState();
  // Room with ceiling < 84 inches generates fixable ceiling violation
  const room = createRoom(state, 'living', 0, 0, 144, 144, { ceiling: 72 });
  const report = evaluate(state);

  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const violationNodes = scene.getNodesByType('violation');
  const ceilingNode = violationNodes.find((n) => n.data.violation.rule === 'ceiling');
  assert.ok(ceilingNode, 'Ceiling violation node should exist');
  assert.equal(ceilingNode.data.fixable, true);
  assert.ok(ceilingNode.data.fixButtonBounds, 'Fixable violation must have fixButtonBounds');

  const fb = ceilingNode.data.fixButtonBounds;
  assert.ok(fb.w > 0 && fb.h > 0, 'Fix button bounds must have positive dimensions');

  // hitTest inside fixButtonBounds returns the violation node
  const hit = scene.hitTest({ x: fb.x + fb.w / 2, y: fb.y + fb.h / 2 });
  assert.ok(hit, 'hitTest should match inside fix button bounds');
  assert.equal(hit.id, ceilingNode.id, 'hitTest should return the targeted violation node');

  // hitTest outside fixButtonBounds returns null for violation
  const miss = scene.hitTest({ x: fb.x - 100, y: fb.y - 100 });
  assert.equal(miss, null);
});

test('hitTest resolves overlapping violation fix buttons in favor of topmost badge', () => {
  const state = newState();
  const room = createRoom(state, 'bathroom', 0, 0, 144, 144, { ceiling: 72, floor: 'wood_oak' });
  const report = evaluate(state);

  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const violationNodes = scene.getNodesByType('violation');
  assert.ok(violationNodes.length >= 2, 'Should have multiple violations for room');

  // Both room violations will have overlapping fix buttons placed at room bounds top-right
  const lastNode = violationNodes[violationNodes.length - 1];
  const fb = lastNode.data.fixButtonBounds;
  assert.ok(fb);

  const hit = scene.hitTest({ x: fb.x + fb.w / 2, y: fb.y + fb.h / 2 });
  assert.ok(hit);
  assert.equal(hit.id, lastNode.id, 'hitTest must return the topmost (last added) violation badge');
});

test('ComplianceOverlayScene creates activeDragRejection node with red conflict halos during active drag violations', () => {
  const state = newState();
  const room = createRoom(state, 'bathroom', 0, 0, 120, 120);
  addItem(state, room, 'toilet', { x: 30, y: 30, rot: 0 });
  const vanity = addItem(state, room, 'vanity', { x: 80, y: 30, rot: 0 });

  // Simulate dragging vanity to overlap toilet
  vanity.x = 35;
  vanity.y = 30;

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  const freshViolations = [
    {
      id: 'v_overlap',
      rule: 'furniture_overlap',
      msg: 'Furniture overlap detected',
      severity: 'error',
      itemId: vanity.id,
      blocking: true,
    },
  ];

  scene.update(state, report, {
    curLevel: 0,
    drag: { kind: 'item', id: vanity.id },
    freshViolations,
  });

  const rejections = scene.getNodesByType('activeDragRejection');
  assert.equal(
    rejections.length,
    1,
    'Should generate activeDragRejection node during invalid item drag'
  );

  const rejNode = rejections[0];
  assert.equal(rejNode.data.targetId, vanity.id);
  assert.equal(rejNode.data.haloColor, '#e84040');
  assert.ok(rejNode.data.message.includes('Furniture overlap'));
});

test('Fixture clearance zones dynamically update colors from blue to red during fixture drags', () => {
  const state = newState();
  const room = createRoom(state, 'bathroom', 0, 0, 120, 120);
  const toilet = addItem(state, room, 'toilet', { x: 30, y: 30, rot: 0 });
  addItem(state, room, 'vanity', { x: 90, y: 90, rot: 0 });

  const scene = new ComplianceOverlayScene();

  // Valid position: toilet clearance should be blue
  const validReport = evaluate(state);
  scene.update(state, validReport, { curLevel: 0 });
  let clearance = scene.getNodesByType('fixtureClearance').find((n) => n.data.itemId === toilet.id);
  assert.equal(clearance.data.isColliding, false);
  assert.equal(clearance.data.borderColor, getToken('--ktheme-accent', '#2a7fff'));

  // Candidate drag position: toilet moved right into vanity clearance
  toilet.x = 90;
  toilet.y = 70;
  const collidingReport = evaluate(state);
  scene.update(state, collidingReport, { curLevel: 0, drag: { kind: 'item', id: toilet.id } });

  clearance = scene.getNodesByType('fixtureClearance').find((n) => n.data.itemId === toilet.id);
  assert.equal(clearance.data.isColliding, true);
  assert.equal(clearance.data.borderColor, '#e84040');
  assert.equal(clearance.data.fillColor, 'rgba(232, 64, 64, 0.25)');
});

test('Room resizes evaluate undersized dimensions and room overlap during active drag', () => {
  const state = newState();
  const room = createRoom(state, 'bedroom', 0, 0, 144, 144);

  const scene = new ComplianceOverlayScene();

  // Resize candidate: shrink room to 48" x 48" (16 sq ft < 70 sq ft min)
  room.w = 48;
  room.h = 48;

  const report = evaluate(state);
  scene.update(state, report, {
    curLevel: 0,
    drag: { kind: 'resize', id: room.id, corner: 3 },
  });

  const handles = scene.getNodesByType('constraintHandle');
  assert.ok(handles.length > 0);
  assert.ok(handles.every((h) => h.data.isValid === false));
  assert.ok(handles.every((h) => h.data.color === getToken('--ktheme-critical', '#f87171')));

  const dimLabel = scene.getNodesByType('dimensionLabel')[0];
  assert.ok(dimLabel);
  assert.equal(dimLabel.data.isValid, false);
  assert.ok(dimLabel.data.violations.some((v) => v.includes('70 sq ft')));
});
