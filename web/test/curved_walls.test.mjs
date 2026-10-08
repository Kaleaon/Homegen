import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closestPointOnArc,
  arcPolygonEdges,
  extractRoomEdges,
  getArcParameters,
  pointOnArc,
  tessellateArc,
} from '../js/geometry.js';

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
