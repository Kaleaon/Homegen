// Plan state, edit helpers, kit placement and persistence. State is plain JSON.
import {
  WT,
  GRID,
  EPS,
  WALLS,
  OPPOSITE,
  snap,
  wallSeg,
  wallLength,
  interior,
  wallPoint,
} from './geometry.js';
import {
  ITEM_BY_ID,
  OPENING_BY_ID,
  ROOM_TYPES,
  ROOM_KIT_BY_ID,
  FURNITURE_KITS,
} from './catalog.js';

export function newState() {
  return { version: 2, name: 'My home', nextId: 1, levels: 1, rooms: [], background: null };
}

export const clone = (s) => JSON.parse(JSON.stringify(s));
export const nid = (state, p) => `${p}${state.nextId++}`;
export const roomById = (state, id) => state.rooms.find((r) => r.id === id);

export function createRoom(state, type, x, y, w, h, opts = {}) {
  const room = {
    id: nid(state, 'r'),
    type,
    name: ROOM_TYPES[type].name,
    level: opts.level ?? 0,
    x,
    y,
    w,
    h,
    ceiling: opts.ceiling ?? 96,
    floor: opts.floor ?? 'floor_oak',
    cladding: opts.cladding ?? undefined,
    walls: {
      N: opts.wallFinish ?? 'paint_white',
      E: opts.wallFinish ?? 'paint_white',
      S: opts.wallFinish ?? 'paint_white',
      W: opts.wallFinish ?? 'paint_white',
    },
    openings: [],
    items: [],
  };
  state.rooms.push(room);
  return room;
}

export function addOpening(state, room, type, wall, offset, props = {}) {
  const def = OPENING_BY_ID[type] || {};
  const o = {
    id: nid(state, 'o'),
    type,
    kind: def.kind,
    wall,
    offset,
    width: def.w,
    swing: 'in',
    ...props,
  };
  if (def.frameMaterial && !o.frameMaterial) o.frameMaterial = def.frameMaterial;
  if (def.frameColor && !o.frameColor) o.frameColor = def.frameColor;
  if (def.mullions && !o.mullions)
    o.mullions = typeof def.mullions === 'object' ? { ...def.mullions } : def.mullions;
  if (def.casing && !o.casing)
    o.casing = typeof def.casing === 'object' ? { ...def.casing } : def.casing;
  room.openings.push(o);
  return o;
}

/** Adds an item. Floor/ceiling items take x/y, wall items take wall+offset. */
export function addItem(state, room, type, props) {
  const def = ITEM_BY_ID[type];
  const item = { id: nid(state, 'i'), type, ...props };
  if (def.mount !== 'wall') item.rot = item.rot ?? 0;
  room.items.push(item);
  return item;
}

export function findOwner(state, id) {
  for (const room of state.rooms) {
    if (room.id === id) return { room, kind: 'room', obj: room };
    const o = room.openings.find((x) => x.id === id);
    if (o) return { room, kind: 'opening', obj: o };
    const i = room.items.find((x) => x.id === id);
    if (i) return { room, kind: 'item', obj: i };
  }
  return null;
}

export function removeById(state, id) {
  const hit = findOwner(state, id);
  if (!hit) return false;
  if (hit.kind === 'room') state.rooms = state.rooms.filter((r) => r.id !== id);
  else if (hit.kind === 'opening') hit.room.openings = hit.room.openings.filter((x) => x.id !== id);
  else hit.room.items = hit.room.items.filter((x) => x.id !== id);
  return true;
}

export function moveRoom(room, nx, ny) {
  const dx = nx - room.x;
  const dy = ny - room.y;
  room.x = nx;
  room.y = ny;
  for (const it of room.items)
    if (it.x !== undefined) {
      it.x += dx;
      it.y += dy;
    }
}

export function resizeRoom(room, x, y, w, h) {
  // Floor/ceiling items keep world position; code engine rejects any that end up outside.
  room.x = x;
  room.y = y;
  room.w = w;
  room.h = h;
  for (const o of room.openings) {
    const len = wallLength(room, o.wall);
    o.offset = Math.max(0, Math.min(o.offset, len - o.width));
  }
}

const wallDir = { N: 0, S: 180, E: 90, W: 270 }; // item rotation for a back against that wall

/** Position an item with its back on `wall`. along: 'start'|'center'|'end'|inches. Returns item props. */
export function backToWall(room, def, wall, along, off = 0) {
  const ir = interior(room);
  const rot = wallDir[wall];
  const swap = rot % 180 !== 0;
  const w = swap ? def.d : def.w;
  const d = swap ? def.w : def.d;
  const span = wall === 'N' || wall === 'S' ? ir.w : ir.h;
  const itemLen = wall === 'N' || wall === 'S' ? w : d;
  let c;
  if (along === 'start') c = itemLen / 2;
  else if (along === 'end') c = span - itemLen / 2;
  else if (along === 'center') c = span / 2;
  else c = along + itemLen / 2;
  c += off;
  if (wall === 'N') return { x: ir.x + c, y: ir.y + d / 2, rot };
  if (wall === 'S') return { x: ir.x + c, y: ir.y + ir.h - d / 2, rot };
  if (wall === 'W') return { x: ir.x + w / 2, y: ir.y + c, rot };
  return { x: ir.x + ir.w - w / 2, y: ir.y + c, rot };
}

export function placeFromSpec(state, room, spec) {
  const def = ITEM_BY_ID[spec.type];
  const ir = interior(room);
  if (spec.pos) {
    return addItem(state, room, spec.type, {
      x: ir.x + ir.w * spec.pos[0] + (spec.dx || 0),
      y: ir.y + ir.h * spec.pos[1] + (spec.dy || 0),
      rot: spec.rot || 0,
    });
  }
  return addItem(state, room, spec.type, backToWall(room, def, spec.wall, spec.along, spec.off));
}

/** Create a full room from a room kit at (x,y). Opening offsets are in wall coordinates. */
export function placeRoomKit(state, kitId, x, y, level = 0) {
  const kit = ROOM_KIT_BY_ID[kitId];
  const room = createRoom(state, kit.type, snap(x), snap(y), kit.w, kit.h, {
    floor: kit.floor,
    wallFinish: kit.wallFinish,
    level,
  });
  for (const o of kit.openings) addOpening(state, room, o.type, o.wall, o.offset);
  for (const spec of kit.items) placeFromSpec(state, room, spec);
  return room;
}

/** Furnish an existing room from a furniture kit; items that would not fit are skipped by the caller's validation. */
export function placeFurnitureKit(state, kitId, room) {
  const kit = FURNITURE_KITS.find((k) => k.id === kitId);
  const walls = [...WALLS].sort((a, b) => wallLength(room, b) - wallLength(room, a));
  const longest = walls[0];
  const resolve = (w) =>
    w === 'longest' ? longest : w === 'opposite-longest' ? OPPOSITE[longest] : w;
  const added = [];
  for (const spec of kit.items)
    added.push(placeFromSpec(state, room, { ...spec, wall: resolve(spec.wall) }));
  return added;
}

// ---- persistence ----
export function applyWallFinish(state, finishId, { scope = 'single', room, wall, level = 0 } = {}) {
  if (scope === 'plan') {
    for (const r of state.rooms) for (const w of WALLS) r.walls[w] = finishId;
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level))
      for (const w of WALLS) r.walls[w] = finishId;
  } else if (scope === 'room') {
    if (room) for (const w of WALLS) room.walls[w] = finishId;
  } else {
    if (room && wall) room.walls[wall] = finishId;
  }
}

export function applyCladding(state, finishId, { scope = 'single', room, level = 0 } = {}) {
  if (scope === 'plan') {
    for (const r of state.rooms) r.cladding = finishId;
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level)) r.cladding = finishId;
  } else {
    if (room) room.cladding = finishId;
  }
}

export function applyFloorFinish(state, finishId, { scope = 'single', room, level = 0 } = {}) {
  if (scope === 'plan') {
    for (const r of state.rooms) r.floor = finishId;
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level)) r.floor = finishId;
  } else {
    if (room) room.floor = finishId;
  }
}

export function nearestWallOnLevel(state, p, level = 0, maxDist = 24, onlyRoom = null) {
  let best = null;
  const rooms = onlyRoom ? [onlyRoom] : state.rooms.filter((r) => (r.level || 0) === level);
  for (const room of rooms)
    for (const wall of WALLS) {
      const s = wallSeg(room, wall);
      const t = Math.max(0, Math.min(s.len, (p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy));
      const cx = s.ax + s.dx * t;
      const cy = s.ay + s.dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      const inside =
        p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h ? 0 : 1;
      const score = d + inside * 0.3;
      if (d <= maxDist && (!best || score < best.score)) best = { room, wall, t, d, score };
    }
  return best;
}

export function roomAtOnLevel(state, p, level = 0) {
  return (
    state.rooms
      .filter(
        (r) =>
          (r.level || 0) === level &&
          p.x >= r.x - WT / 2 &&
          p.x <= r.x + r.w + WT / 2 &&
          p.y >= r.y - WT / 2 &&
          p.y <= r.y + r.h + WT / 2
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null
  );
}

export function sampleFinishAt(state, p, level = 0, maxDist = 24) {
  const nw = nearestWallOnLevel(state, p, level, maxDist);
  if (nw) return { kind: 'wall', finishId: nw.room.walls[nw.wall], room: nw.room, wall: nw.wall };
  const r = roomAtOnLevel(state, p, level);
  if (r) return { kind: 'floor', finishId: r.floor, room: r };
  return null;
}

export function serialize(state) {
  return JSON.stringify(state, null, 1);
}
export function deserialize(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.rooms)) throw new Error('Not a Homegen plan');
  s.nextId = s.nextId || 1000;
  s.background = s.background || null;
  for (const r of s.rooms) {
    r.openings ||= [];
    r.items ||= [];
    r.level ||= 0;
  }
  s.levels = Math.max(s.levels || 1, ...s.rooms.map((r) => r.level + 1));
  return s;
}

export function parseDistanceInInches(str) {
  if (!str) return null;
  str = String(str).trim().toLowerCase();
  if (!str) return null;
  if (str.includes('m') && !str.includes('ft')) {
    if (str.includes('cm')) return parseFloat(str) * 0.393701;
    return parseFloat(str) * 39.3701;
  }
  const hasFt = /'|ft|feet/.test(str);
  const hasIn = /"|in|inches/.test(str);
  if (hasFt) {
    const ftMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet)/);
    const inMatch =
      str.match(/(\d+(?:\.\d+)?)\s*(?:"|in|inches)/) ||
      str.match(/(?:'|ft|feet)\s*(\d+(?:\.\d+)?)/);
    const feet = ftMatch ? parseFloat(ftMatch[1]) : 0;
    const inches = inMatch ? parseFloat(inMatch[1]) : 0;
    return feet * 12 + inches;
  }
  if (hasIn) {
    const inMatch = str.match(/(\d+(?:\.\d+)?)/);
    return inMatch ? parseFloat(inMatch[1]) : null;
  }
  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) return null;
  return num <= 50 ? num * 12 : num;
}

export class History {
  constructor(state) {
    this.stack = [clone(state)];
    this.i = 0;
  }
  push(state) {
    this.stack = this.stack.slice(0, this.i + 1);
    this.stack.push(clone(state));
    this.i++;
    if (this.stack.length > 100) {
      this.stack.shift();
      this.i--;
    }
  }
  canUndo() {
    return this.i > 0;
  }
  canRedo() {
    return this.i < this.stack.length - 1;
  }
  undo() {
    return this.canUndo() ? clone(this.stack[--this.i]) : null;
  }
  redo() {
    return this.canRedo() ? clone(this.stack[++this.i]) : null;
  }
}

export { WT, GRID, EPS, wallPoint, wallSeg };
