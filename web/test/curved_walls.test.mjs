import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closestPointOnArc,
  arcPolygonEdges,
  extractRoomEdges,
  getArcParameters,
  pointOnArc,
  tessellateArc,
  wallLength,
  wallArcLength,
} from '../js/geometry.js';
import { newState, createRoom, addItem, addOpening } from '../js/model.js';
import { outletSegments, evaluate, autoComply } from '../js/codes.js';

test('extractRoomEdges extracts optional bulge parameters from room objects', () => {
  const rooms = [
    {
      id: 'room-1',
      x: 0,
      y: 0,
      w: 120,
      h: 120,
      bulges: { N: 0.5, E: 0, S: -0.3, W: 0 },
    },
    {
      id: 'room-2',
      corners: [
        { x: 0, y: 0, bulge: 0.2 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      closed: true,
    },
  ];

  const edges = extractRoomEdges(rooms);
  assert.equal(edges.length, 8);

  const room1N = edges.find((e) => e.roomId === 'room-1' && e.wall === 'N');
  assert.equal(room1N.bulge, 0.5);

  const room1S = edges.find((e) => e.roomId === 'room-1' && e.wall === 'S');
  assert.equal(room1S.bulge, -0.3);

  const room2E0 = edges.find((e) => e.roomId === 'room-2' && e.edgeIndex === 0);
  assert.equal(room2E0.bulge, 0.2);

  const arcEdges = arcPolygonEdges(rooms[1].corners);
  assert.equal(arcEdges[0].bulge, 0.2);
});

test('closestPointOnArc projects point accurately along curved wall segment', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const bulge = 0.5;

  const arcParams = getArcParameters(start, end, bulge);
  assert.equal(arcParams.isLinear, false);

  const midPt = pointOnArc(start, end, bulge, 0.5);
  assert.ok(midPt.y > 0);

  const res = closestPointOnArc({ x: 50, y: 100 }, start, end, bulge);
  assert.ok(res.point);
  assert.ok(Math.abs(res.point.x - 50) < 0.01);
  assert.ok(res.point.y > 0);
  assert.ok(res.t > 0 && res.t < 1);
});

test('tessellateArc produces smooth point chain along arc wall', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const bulge = 0.25;

  const points = tessellateArc(start, end, bulge, 8);
  assert.equal(points.length, 9);
  assert.ok(Math.abs(points[0].x - 0) < 1e-10);
  assert.ok(Math.abs(points[0].y - 0) < 1e-10);
  assert.ok(Math.abs(points[8].x - 100) < 1e-10);
  assert.ok(Math.abs(points[8].y - 0) < 1e-10);
});

test('wallArcLength computes arc perimeter across bulge formats and handles edge cases', () => {
  const room = {
    id: 'r1',
    x: 0,
    y: 0,
    w: 120,
    h: 100,
    bulges: { N: 1, E: 0, S: -1, W: 0 },
  };

  // Semicircle on 120" chord has radius 60" and arc length 60 * pi
  assert.equal(wallLength(room, 'N'), 120);
  assert.ok(Math.abs(wallArcLength(room, 'N') - 60 * Math.PI) < 1e-9);
  assert.ok(Math.abs(wallArcLength(room, 'S') - 60 * Math.PI) < 1e-9);
  assert.equal(wallArcLength(room, 'E'), 100);
  assert.equal(wallArcLength(room, 'W'), 100);

  // Vertex bulge property and bulges array formats
  const vertexBulgeRoom = {
    id: 'r2',
    corners: [
      { x: 0, y: 0, bulge: 0.5 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };
  const expectedArc = getArcParameters({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5).arcLength;
  assert.ok(Math.abs(wallArcLength(vertexBulgeRoom, 'N') - expectedArc) < 1e-9);

  const arrayBulgeRoom = {
    id: 'r3',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 80 },
      { x: 60, y: 120 },
      { x: 0, y: 80 },
    ],
    bulges: [0.5, 0, 0, 0, 0],
  };
  assert.ok(Math.abs(wallArcLength(arrayBulgeRoom, 0) - expectedArc) < 1e-9);
  assert.equal(wallArcLength(arrayBulgeRoom, 1), wallLength(arrayBulgeRoom, 1));

  // Degenerate zero-length wall returns 0 safely
  const degenerateRoom = { id: 'r4', x: 0, y: 0, w: 0, h: 0, bulges: { N: 0.8 } };
  assert.equal(wallArcLength(degenerateRoom, 'N'), 0);
  assert.equal(wallArcLength(null, 'N'), 0);
});

test('curved wall with insufficient outlets fails NEC 210.52 while properly spaced outlets pass', () => {
  const state = newState();
  const room = createRoom(state, 'living', 0, 0, 120, 120);
  // Cover straight walls E, S, W with centered outlets (120" chord -> 57.75" reach <= 72")
  addItem(state, room, 'outlet', { wall: 'E', offset: 60 });
  addItem(state, room, 'outlet', { wall: 'S', offset: 60 });
  addItem(state, room, 'outlet', { wall: 'W', offset: 60 });
  // Place a single centered outlet on N wall (passes on straight 120" wall, fails on semicircle arc ~188.5")
  const nOutlet = addItem(state, room, 'outlet', { wall: 'N', offset: 60 });

  // Straight N wall passes
  assert.equal(evaluate(state).violations.filter((v) => v.rule === 'outlets').length, 0);

  // Curve N wall with bulge = 1 (arc length = 60 * pi ~= 188.50", corner reach ~92" > 72")
  room.bulges = { N: 1, E: 0, S: 0, W: 0 };
  const segsFail = outletSegments(state, room);
  const nSegFail = segsFail.find((s) => s.wall === 'N');
  assert.ok(nSegFail);
  assert.equal(nSegFail.covered, false);
  assert.equal(nSegFail.need, 2);

  const repFail = evaluate(state);
  const outletViolations = repFail.violations.filter((v) => v.rule === 'outlets');
  assert.equal(outletViolations.length, 1);
  assert.equal(outletViolations[0].ref, 'NEC 210.52');

  // Negative bulge produces identical arc-length violation
  room.bulges.N = -1;
  assert.equal(evaluate(state).violations.filter((v) => v.rule === 'outlets').length, 1);

  // Replace single centered outlet with two properly spaced outlets along the curved wall
  // Chord offsets 30" and 90" -> arc offsets ~47.1" and ~141.4" (reach ~44.9" <= 72", spacing ~94.2" <= 144")
  room.items = room.items.filter((i) => i.id !== nOutlet.id);
  addItem(state, room, 'outlet', { wall: 'N', offset: 30 });
  addItem(state, room, 'outlet', { wall: 'N', offset: 90 });

  const segsPass = outletSegments(state, room);
  const nSegPass = segsPass.find((s) => s.wall === 'N');
  assert.ok(nSegPass);
  assert.equal(nSegPass.covered, true);
  assert.equal(evaluate(state).violations.filter((v) => v.rule === 'outlets').length, 0);

  // Verify 144-inch inter-outlet spacing along arc:
  // On 144" chord with bulge = 0.8 (arc ~= 199.18"), outlets at chord 18" and 126" satisfy
  // 72" corner reach (~22.6" <= 72") and straight-chord spacing (108" <= 144"),
  // but violate true arc spacing (~149.4" > 144").
  const spacingState = newState();
  const wideRoom = createRoom(spacingState, 'living', 0, 0, 144, 120);
  wideRoom.bulges = { N: 0.8, E: 0, S: 0, W: 0 };
  addItem(spacingState, wideRoom, 'outlet', { wall: 'E', offset: 60 });
  addItem(spacingState, wideRoom, 'outlet', { wall: 'S', offset: 72 });
  addItem(spacingState, wideRoom, 'outlet', { wall: 'W', offset: 60 });
  addItem(spacingState, wideRoom, 'outlet', { wall: 'N', offset: 18 });
  addItem(spacingState, wideRoom, 'outlet', { wall: 'N', offset: 126 });

  const spacingSegFail = outletSegments(spacingState, wideRoom).find((s) => s.wall === 'N');
  assert.equal(spacingSegFail.covered, false);
  assert.equal(evaluate(spacingState).violations.filter((v) => v.rule === 'outlets').length, 1);

  // Moving outlets to chord 36" and 108" (~99.6" arc spacing <= 144", ~47.5" reach <= 72") passes
  wideRoom.items = wideRoom.items.filter((i) => i.wall !== 'N');
  addItem(spacingState, wideRoom, 'outlet', { wall: 'N', offset: 36 });
  addItem(spacingState, wideRoom, 'outlet', { wall: 'N', offset: 108 });
  assert.equal(evaluate(spacingState).violations.filter((v) => v.rule === 'outlets').length, 0);
});

test('curved wall scales door openings and autoComply places outlets in wall coordinate space', () => {
  const state = newState();
  const room = createRoom(state, 'bedroom', 0, 0, 120, 120);
  room.bulges = { N: 1, E: 0, S: -0.8, W: 0 };
  // Add an exterior door on curved N wall at chord [6, 42]; remaining chord [42, 117.75] is 75.75",
  // which in arc space is [65.97, 186.25] (~120.28" > 72" reach if outlet sits near door).
  addOpening(state, room, 'door_entry_36', 'N', 6);
  addItem(state, room, 'outlet', { wall: 'N', offset: 46 });

  const nSegBefore = outletSegments(state, room).find((s) => s.wall === 'N');
  assert.ok(nSegBefore);
  assert.equal(nSegBefore.covered, false);

  // Reset outlets and let autoComply populate compliant receptacles across curved walls
  room.items = [];
  autoComply(state);

  const rep = evaluate(state);
  assert.equal(
    rep.violations.filter((v) => v.rule === 'outlets').length,
    0,
    rep.violations.map((v) => v.msg).join('\n')
  );
  assert.equal(
    rep.violations.filter((v) => v.blocking).length,
    0,
    rep.violations.map((v) => v.msg).join('\n')
  );

  // Verify every placed wall item has a valid chord coordinate offset within [8, chordLen - 8]
  for (const it of room.items.filter((i) => i.wall !== undefined)) {
    const chordLen = wallLength(room, it.wall);
    assert.ok(it.offset >= 8 && it.offset <= chordLen - 8);
  }
});
