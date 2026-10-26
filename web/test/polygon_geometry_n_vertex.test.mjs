import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, createRoom, addItem, addOpening } from '../js/model.js';
import { evaluate } from '../js/codes.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';
import { getRoomClearSpan, interiorPolygonData, getRoomWallKeys } from '../js/geometry.js';
import { getConstraintHandles } from '../../designer3d/tools/constraintHandles.mjs';

test('AC1: Habitable non-rectangular rooms with narrow sections under 7 feet fail IRC R304.2 compliance evaluation', () => {
  const state = newState();
  // Create an L-shaped bedroom with a main section (10' x 10') and a narrow leg of 5 feet (60" wide)
  // Polygon points: (0,0), (180,0), (180,120), (60,120), (60,240), (0,240)
  const room = createRoom(state, 'bedroom', 0, 0, 180, 240);
  const polygonPts = [
    { x: 0, y: 0 },
    { x: 180, y: 0 },
    { x: 180, y: 120 },
    { x: 60, y: 120 },
    { x: 60, y: 240 },
    { x: 0, y: 240 },
  ];
  room.points = polygonPts;
  room.corners = polygonPts;
  room.vertices = polygonPts;
  delete room._clearSpanCache;

  const clearSpan = getRoomClearSpan(room);
  assert.ok(clearSpan < 84, `Clear span (${clearSpan.toFixed(1)}") should be < 84" (7 feet)`);

  const report = evaluate(state);
  const minDimViolation = report.violations.find(
    (v) => v.rule === 'min-dim' && v.roomId === room.id
  );

  assert.ok(
    minDimViolation,
    'Should trigger IRC R304.2 violation for non-rectangular room with narrow section under 7 feet'
  );
  assert.ok(
    minDimViolation.msg.includes('at least 7 ft'),
    'Violation message should mention minimum 7 ft clear dimension requirement'
  );
});

test('AC2: All N vertices of non-rectangular room polygons render constraint handle nodes in spatial overlay', () => {
  const state = newState();
  // L-shaped living room with 6 vertices
  const room = createRoom(state, 'living', 0, 0, 240, 240);
  room.points = [
    { x: 0, y: 0 },
    { x: 240, y: 0 },
    { x: 240, y: 120 },
    { x: 120, y: 120 },
    { x: 120, y: 240 },
    { x: 0, y: 240 },
  ];

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const handles = scene.getNodesByType('constraintHandle');
  assert.equal(
    handles.length,
    6,
    'Spatial overlay should render constraint handles for all 6 vertices of the L-shaped room'
  );

  const toolHandles = getConstraintHandles(room);
  assert.equal(
    toolHandles.length,
    6,
    'getConstraintHandles in 3d tool package should return 6 handles for 6-vertex room'
  );
});

test('AC3: Receptacle coverage checks evaluate all N walls for rooms with more than 4 wall segments', () => {
  const state = newState();
  // 6-wall L-shaped bedroom (all walls >= 24" space requiring outlets)
  const room = createRoom(state, 'bedroom', 0, 0, 240, 240);
  room.points = [
    { x: 0, y: 0 },
    { x: 240, y: 0 },
    { x: 240, y: 120 },
    { x: 120, y: 120 },
    { x: 120, y: 240 },
    { x: 0, y: 240 },
  ];

  const wallKeys = getRoomWallKeys(room);
  assert.equal(wallKeys.length, 6, 'Should identify all 6 wall segments');

  const report = evaluate(state);
  // Uncovered outlet violations for this room should reference walls across all 6 segments
  const outletViolations = report.violations.filter(
    (v) => v.ref === 'NEC 210.52' && v.roomId === room.id
  );
  assert.ok(
    outletViolations.length >= 6,
    `Should evaluate receptacle coverage across all 6 wall segments (found ${outletViolations.length} violations)`
  );
});

test('AC4: Door swing clearance checks on non-cardinal walls accurately detect intersecting floor items', () => {
  const state = newState();
  // Angled room (diamond / octagon / angled wall segment)
  const room = createRoom(state, 'bedroom', 0, 0, 200, 200);
  // Angled 45-degree wall segment from (0, 100) to (100, 0)
  room.points = [
    { x: 100, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    { x: 0, y: 200 },
    { x: 0, y: 100 },
  ];

  // Add door on wall index 4 (the angled wall from (0, 100) to (100, 0))
  addOpening(state, room, 'door_interior_32', 4, 20);

  // Add a floor item (dresser) right in the door's rotational swing path on the angled wall
  const item = addItem(state, room, 'dresser', { x: 40, y: 80, rot: 0 });

  const report = evaluate(state);
  const swingViolation = report.violations.find(
    (v) => v.rule === 'door-swing' && v.itemId === item.id
  );

  assert.ok(
    swingViolation,
    'Door swing clearance on non-cardinal angled wall should detect intersecting floor item'
  );
});

test('AC5: Spatial overlay dimension badges display true clear dimensions and center on interior polygon', () => {
  const state = newState();
  // L-shaped living room
  const room = createRoom(state, 'living', 0, 0, 240, 240);
  room.points = [
    { x: 0, y: 0 },
    { x: 240, y: 0 },
    { x: 240, y: 120 },
    { x: 120, y: 120 },
    { x: 120, y: 240 },
    { x: 0, y: 240 },
  ];

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const dimLabelNodes = scene.getNodesByType('dimensionLabel');
  assert.equal(dimLabelNodes.length, 1, 'Should generate 1 dimension label node');

  const dimNode = dimLabelNodes[0];
  const expectedCentroid = interiorPolygonData(room).centroid;

  assert.equal(
    dimNode.bounds.x,
    expectedCentroid.x,
    'Dimension badge X should be at polygon centroid'
  );
  assert.equal(
    dimNode.bounds.y,
    expectedCentroid.y,
    'Dimension badge Y should be at polygon centroid'
  );
  assert.ok(
    dimNode.data.dimensionText.includes('clear'),
    'Dimension badge text should display clear span notation'
  );
});
