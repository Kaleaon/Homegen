import { quantize } from '../../designer3d/tools/gridSettings.mjs';

// Geometry helpers. All units are inches; +x is east, +y is south (screen coordinates).
export const WT = 4.5; // wall thickness, rooms are measured centerline-to-centerline
export const GRID = 6;
export const EPS = 0.5;
export const WALLS = ['N', 'E', 'S', 'W'];
export const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

export const lv = (r) => r.level || 0;

export const snap = (v, g = GRID) => quantize(v, g);

/** Wall segment of a room. `t` offsets run west->east (N/S) or north->south (E/W). */
export function wallSeg(room, wall) {
  const { x, y, w, h } = room;
  switch (wall) {
    case 'N':
      return { ax: x, ay: y, dx: 1, dy: 0, nx: 0, ny: 1, len: w };
    case 'S':
      return { ax: x, ay: y + h, dx: 1, dy: 0, nx: 0, ny: -1, len: w };
    case 'W':
      return { ax: x, ay: y, dx: 0, dy: 1, nx: 1, ny: 0, len: h };
    case 'E':
      return { ax: x + w, ay: y, dx: 0, dy: 1, nx: -1, ny: 0, len: h };
    default:
      throw new Error(`bad wall ${wall}`);
  }
}

export const wallLength = (room, wall) => (wall === 'N' || wall === 'S' ? room.w : room.h);

/** Clear interior rectangle (inside the wall faces). */
export function interior(room) {
  const i = WT / 2;
  return { x: room.x + i, y: room.y + i, w: room.w - WT, h: room.h - WT };
}

export const floorAreaSqFt = (room) => (interior(room).w * interior(room).h) / 144;

export function overlapLen(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function rectsOverlap(a, b, eps = 0.01) {
  return (
    overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) > eps &&
    overlapLen(a.y, a.y + a.h, b.y, b.y + b.h) > eps
  );
}

export const rectInside = (inner, outer, eps = 0.01) =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.w <= outer.x + outer.w + eps &&
  inner.y + inner.h <= outer.y + outer.h + eps;

/** Rooms may touch edge-to-edge but never overlap. */
export const roomsOverlap = (a, b) => rectsOverlap(a, b, EPS);

/** World point of wall-offset `t` plus `depth` inches toward the room interior. */
export function wallPoint(room, wall, t, depth = 0) {
  const s = wallSeg(room, wall);
  return { x: s.ax + s.dx * t + s.nx * depth, y: s.ay + s.dy * t + s.ny * depth };
}

/** Neighbouring rooms flush against `wall`, with their overlap interval in this wall's offset space. */
export function wallNeighbors(rooms, room, wall) {
  const out = [];
  for (const r of rooms) {
    if (r.id === room.id || lv(r) !== lv(room)) continue;
    let from;
    let to;
    if (wall === 'N' && Math.abs(r.y + r.h - room.y) < EPS) {
      from = Math.max(r.x, room.x) - room.x;
      to = Math.min(r.x + r.w, room.x + room.w) - room.x;
    } else if (wall === 'S' && Math.abs(r.y - (room.y + room.h)) < EPS) {
      from = Math.max(r.x, room.x) - room.x;
      to = Math.min(r.x + r.w, room.x + room.w) - room.x;
    } else if (wall === 'W' && Math.abs(r.x + r.w - room.x) < EPS) {
      from = Math.max(r.y, room.y) - room.y;
      to = Math.min(r.y + r.h, room.y + room.h) - room.y;
    } else if (wall === 'E' && Math.abs(r.x - (room.x + room.w)) < EPS) {
      from = Math.max(r.y, room.y) - room.y;
      to = Math.min(r.y + r.h, room.y + room.h) - room.y;
    } else continue;
    if (to - from > EPS) out.push({ room: r, from, to });
  }
  return out;
}

/** Offset translation from neighbour `r2`'s wall space into `room`'s wall space. */
export const neighborShift = (room, r2, wall) =>
  wall === 'N' || wall === 'S' ? r2.x - room.x : r2.y - room.y;

// ---- interval helpers (arrays of [a,b]) ----
export function subtractInterval(intervals, [s0, s1]) {
  const out = [];
  for (const [a, b] of intervals) {
    if (s1 <= a || s0 >= b) {
      out.push([a, b]);
      continue;
    }
    if (s0 > a) out.push([a, s0]);
    if (s1 < b) out.push([s1, b]);
  }
  return out;
}

export function intersectInterval(intervals, [s0, s1]) {
  const out = [];
  for (const [a, b] of intervals) {
    const lo = Math.max(a, s0);
    const hi = Math.min(b, s1);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}

/** Footprint rect of a floor item (rotations are multiples of 90). */
export function footprint(item, def) {
  const swap = item.rot % 180 !== 0;
  const w = swap ? def.d : def.w;
  const d = swap ? def.w : def.d;
  return { x: item.x - w / 2, y: item.y - d / 2, w, h: d };
}

/** Unit vector the item front faces at its rotation. rot 0 faces south (+y). */
export function facing(rot) {
  const r = (rot * Math.PI) / 180;
  return { x: Math.round(-Math.sin(r)), y: Math.round(Math.cos(r)) };
}

/** Rect clear zone in front of / around a fixture: lateral +-half, back edge to `front` inches beyond the front edge. */
export function fixtureZone(item, def, half, front) {
  const f = facing(item.rot);
  const depthTotal = def.d + front;
  // Local zone: x in [-half, half], y in [-d/2, d/2+front] (y toward front). Convert to world AABB.
  const cx = item.x + f.x * (front / 2);
  const cy = item.y + f.y * (front / 2);
  const lateral = half * 2;
  const alongFront = f.x !== 0;
  const w = alongFront ? depthTotal : lateral;
  const h = alongFront ? lateral : depthTotal;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function extractRoomEdges(rooms) {
  const edges = [];
  let index = 0;
  for (const r of rooms) {
    for (const wall of WALLS) {
      const s = wallSeg(r, wall);
      const start = { x: s.ax, y: s.ay };
      const end = { x: s.ax + s.dx * s.len, y: s.ay + s.dy * s.len };
      edges.push({ start, end, index: index++, roomId: r.id, wall });
    }
  }
  return edges;
}

export function roomToPolygon(room) {
  return [
    { x: room.x, y: room.y },
    { x: room.x + room.w, y: room.y },
    { x: room.x + room.w, y: room.y + room.h },
    { x: room.x, y: room.y + room.h },
  ];
}

export function itemToPolygon(item, def) {
  const fp = footprint(item, def);
  return [
    { x: fp.x, y: fp.y },
    { x: fp.x + fp.w, y: fp.y },
    { x: fp.x + fp.w, y: fp.y + fp.h },
    { x: fp.x, y: fp.y + fp.h },
  ];
}

export function rectsTouch(a, b, margin = 0) {
  if (!a || !b) return false;
  const ax0 = a.x - margin;
  const ax1 = a.x + a.w + margin;
  const ay0 = a.y - margin;
  const ay1 = a.y + a.h + margin;
  const bx0 = b.x;
  const bx1 = b.x + b.w;
  const by0 = b.y;
  const by1 = b.y + b.h;
  return Math.max(ax0, bx0) < Math.min(ax1, bx1) && Math.max(ay0, by0) < Math.min(ay1, by1);
}
