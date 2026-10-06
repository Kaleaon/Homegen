// Plan state, edit helpers, kit placement and persistence. State is plain JSON.
import {
  WT,
  GRID,
  EPS,
  WALLS,
  snap,
  wallSeg,
  wallLength,
  interior,
  wallPoint,
  footprint,
} from './geometry.js';
import { ITEM_BY_ID, OPENING_BY_ID, ROOM_TYPES, ROOM_KIT_BY_ID } from './catalog.js';
import { registerCustomWallFinish } from './presetRegistry.js';

export function defaultBranding() {
  return {
    logoDataUrl: null,
    stamp: {
      shape: 'circle',
      titleText: 'APPROVED',
      subtitleText: 'ARCHITECTURAL PLAN',
      licenseText: '',
      dateText: '',
      borderColor: '#d32f2f',
      borderStyle: 'solid',
      textColor: '#d32f2f',
      opacity: 0.9,
      enabled: true,
    },
    watermark: {
      text: '',
      color: '#9e9e9e',
      opacity: 0.2,
      fontSize: 24,
      angle: -45,
      enabled: true,
    },
  };
}

export function validateLogoSize(dataUrl, maxKb = 500) {
  if (!dataUrl) return true;
  const base64Str = dataUrl.split(',')[1] || dataUrl;
  const sizeInBytes = Math.ceil((base64Str.length * 3) / 4);
  const maxBytes = maxKb * 1024;
  if (sizeInBytes > maxBytes) {
    throw new Error(
      `Logo asset exceeds maximum allowed size of ${maxKb}KB (${Math.round(sizeInBytes / 1024)}KB)`
    );
  }
  return true;
}

export function newState() {
  return {
    version: 2,
    name: 'My home',
    nextId: 1,
    levels: 1,
    rooms: [],
    background: null,
    site: null, // { crs: 'EPSG:4326', features: [], segments: [], layers: [] }
    customFinishes: [],
    settings: {
      branding: defaultBranding(),
    },
  };
}

export const clone = (s) => JSON.parse(JSON.stringify(s));

export function isRoomEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneWithSharing(state, prevState = null) {
  if (!state) return state;
  const clonedBase = clone(state);
  if (!prevState || !Array.isArray(prevState.rooms)) {
    return clonedBase;
  }

  const prevRoomMap = new Map();
  for (const r of prevState.rooms) {
    if (r && r.id != null) {
      prevRoomMap.set(r.id, r);
    }
  }

  clonedBase.rooms = (state.rooms || []).map((room) => {
    const prevRoom = prevRoomMap.get(room.id);
    if (prevRoom && isRoomEqual(room, prevRoom)) {
      return prevRoom;
    }
    return clone(room);
  });

  return clonedBase;
}

export function ensureRoomCopy(state, room) {
  if (!state || !Array.isArray(state.rooms) || !room || !room.id) {
    return room;
  }
  const idx = state.rooms.findIndex((r) => r.id === room.id);
  if (idx === -1) {
    return room;
  }
  return state.rooms[idx];
}

export const nid = (state, p) => `${p}${state.nextId++}`;

export const DEFAULT_UV_TRANSFORM = {
  scaleU: 1.0,
  scaleV: 1.0,
  rotation: 0,
  offsetU: 0,
  offsetV: 0,
};

export function createDefaultWallUV() {
  return {
    N: { ...DEFAULT_UV_TRANSFORM },
    E: { ...DEFAULT_UV_TRANSFORM },
    S: { ...DEFAULT_UV_TRANSFORM },
    W: { ...DEFAULT_UV_TRANSFORM },
  };
}

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
    wallUV: opts.wallUV ? JSON.parse(JSON.stringify(opts.wallUV)) : createDefaultWallUV(),
    openings: [],
    items: [],
  };
  state.rooms.push(room);
  return room;
}

export function addOpening(state, room, type, wall, offset, props = {}) {
  room = ensureRoomCopy(state, room);
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
  if (def.presetKey && !o.presetKey) o.presetKey = def.presetKey;
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
  room = ensureRoomCopy(state, room);
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
  if (hit.kind === 'room') {
    state.rooms = state.rooms.filter((r) => r.id !== id);
  } else if (hit.kind === 'opening') {
    const r = ensureRoomCopy(state, hit.room);
    r.openings = r.openings.filter((x) => x.id !== id);
  } else {
    const r = ensureRoomCopy(state, hit.room);
    r.items = r.items.filter((x) => x.id !== id);
  }
  return true;
}

export function moveRoom(room, nx, ny, state = null) {
  if (state) room = ensureRoomCopy(state, room);
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

export function resizeRoom(room, x, y, w, h, state = null) {
  if (state) room = ensureRoomCopy(state, room);
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

// ---- persistence ----
export function getWallUV(room, wall) {
  if (!room || !wall) return { ...DEFAULT_UV_TRANSFORM };
  room.wallUV ||= {};
  const uv = room.wallUV[wall] || {};
  return {
    scaleU: typeof uv.scaleU === 'number' ? uv.scaleU : 1.0,
    scaleV: typeof uv.scaleV === 'number' ? uv.scaleV : 1.0,
    rotation: typeof uv.rotation === 'number' ? uv.rotation : 0,
    offsetU: typeof uv.offsetU === 'number' ? uv.offsetU : 0,
    offsetV: typeof uv.offsetV === 'number' ? uv.offsetV : 0,
  };
}

export function setWallUV(room, wall, params = {}) {
  if (!room || !wall) return;
  room.wallUV ||= {};
  const current = getWallUV(room, wall);
  room.wallUV[wall] = {
    scaleU: typeof params.scaleU === 'number' ? params.scaleU : current.scaleU,
    scaleV: typeof params.scaleV === 'number' ? params.scaleV : current.scaleV,
    rotation: typeof params.rotation === 'number' ? params.rotation : current.rotation,
    offsetU: typeof params.offsetU === 'number' ? params.offsetU : current.offsetU,
    offsetV: typeof params.offsetV === 'number' ? params.offsetV : current.offsetV,
  };
}

export function applyWallUV(state, params, { scope = 'single', room, wall, level = 0 } = {}) {
  const applyToRoomWall = (r, w) => setWallUV(r, w, params);
  if (scope === 'plan') {
    for (const r of state.rooms) for (const w of WALLS) applyToRoomWall(r, w);
  } else if (scope === 'level') {
    for (const r of state.rooms.filter((rm) => (rm.level || 0) === level))
      for (const w of WALLS) applyToRoomWall(r, w);
  } else if (scope === 'room') {
    if (room) for (const w of WALLS) applyToRoomWall(room, w);
  } else {
    if (room && wall) applyToRoomWall(room, wall);
  }
}

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
  s.customFinishes = s.customFinishes || [];
  s.settings ||= {};
  s.settings.branding = {
    logoDataUrl: s.settings.branding?.logoDataUrl || null,
    stamp: {
      shape: 'circle',
      titleText: 'APPROVED',
      subtitleText: 'ARCHITECTURAL PLAN',
      licenseText: '',
      dateText: '',
      borderColor: '#d32f2f',
      borderStyle: 'solid',
      textColor: '#d32f2f',
      opacity: 0.9,
      enabled: true,
      ...s.settings.branding?.stamp,
    },
    watermark: {
      text: '',
      color: '#9e9e9e',
      opacity: 0.2,
      fontSize: 24,
      angle: -45,
      enabled: true,
      ...s.settings.branding?.watermark,
    },
  };
  for (const r of s.rooms) {
    r.openings ||= [];
    r.items ||= [];
    r.level ||= 0;
    r.wallUV ||= {};
    for (const w of WALLS) {
      r.wallUV[w] = getWallUV(r, w);
    }
  }
  s.levels = Math.max(s.levels || 1, ...s.rooms.map((r) => r.level + 1));
  for (const finish of s.customFinishes) {
    registerCustomWallFinish(finish, s);
  }
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
    this.stack = [cloneWithSharing(state)];
    this.i = 0;
  }
  push(state) {
    this.stack = this.stack.slice(0, this.i + 1);
    const prev = this.stack[this.i];
    this.stack.push(cloneWithSharing(state, prev));
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

export const ModelHistory = History;

export function getBounds(state, id) {
  const hit = findOwner(state, id);
  if (!hit) return null;
  const { room, kind, obj } = hit;
  if (kind === 'room') {
    return {
      id,
      kind,
      room,
      obj,
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      cx: obj.x + obj.w / 2,
      cy: obj.y + obj.h / 2,
    };
  }
  if (kind === 'item') {
    const def = ITEM_BY_ID[obj.type] || {};
    if (def.mount === 'floor') {
      const fp = footprint(obj, def);
      return {
        id,
        kind,
        room,
        obj,
        def,
        x: fp.x,
        y: fp.y,
        w: fp.w,
        h: fp.h,
        cx: obj.x !== undefined ? obj.x : fp.x + fp.w / 2,
        cy: obj.y !== undefined ? obj.y : fp.y + fp.h / 2,
      };
    }
    if (def.mount === 'ceiling') {
      const w = def.w || 12;
      const h = def.w || 12;
      return {
        id,
        kind,
        room,
        obj,
        def,
        x: obj.x - w / 2,
        y: obj.y - h / 2,
        w,
        h,
        cx: obj.x,
        cy: obj.y,
      };
    }
    if (def.mount === 'wall') {
      const p = wallPoint(room, obj.wall, obj.offset, 0);
      return {
        id,
        kind,
        room,
        obj,
        def,
        x: p.x - 4,
        y: p.y - 4,
        w: 8,
        h: 8,
        cx: p.x,
        cy: p.y,
      };
    }
  }
  if (kind === 'opening') {
    const p1 = wallPoint(room, obj.wall, obj.offset, 0);
    const p2 = wallPoint(room, obj.wall, obj.offset + obj.width, 0);
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const w = Math.max(4, maxX - minX);
    const h = Math.max(4, maxY - minY);
    return {
      id,
      kind,
      room,
      obj,
      x: minX,
      y: minY,
      w,
      h,
      cx: (p1.x + p2.x) / 2,
      cy: (p1.y + p2.y) / 2,
    };
  }
  return null;
}

export function setItemPosition(state, hit, targetCenterX, targetCenterY) {
  const { room, kind, obj } = hit;
  if (kind === 'room') {
    const newX = targetCenterX - obj.w / 2;
    const newY = targetCenterY - obj.h / 2;
    moveRoom(obj, newX, newY);
    return;
  }
  if (kind === 'item') {
    const def = ITEM_BY_ID[obj.type] || {};
    if (def.mount === 'floor' || def.mount === 'ceiling') {
      obj.x = targetCenterX;
      obj.y = targetCenterY;
      const targetRoom = roomAtOnLevel(
        state,
        { x: targetCenterX, y: targetCenterY },
        room.level || 0
      );
      if (targetRoom && targetRoom.id !== room.id) {
        room.items = room.items.filter((i) => i.id !== obj.id);
        targetRoom.items.push(obj);
      }
    } else if (def.mount === 'wall') {
      const len = wallLength(room, obj.wall);
      if (obj.wall === 'N' || obj.wall === 'S') {
        const localX = targetCenterX - room.x;
        obj.offset = Math.max(8, Math.min(len - 8, localX));
      } else {
        const localY = targetCenterY - room.y;
        obj.offset = Math.max(8, Math.min(len - 8, localY));
      }
    }
  }
  if (kind === 'opening') {
    const len = wallLength(room, obj.wall);
    if (obj.wall === 'N' || obj.wall === 'S') {
      const localX = targetCenterX - room.x - obj.width / 2;
      obj.offset = Math.max(0, Math.min(len - obj.width, localX));
    } else {
      const localY = targetCenterY - room.y - obj.width / 2;
      obj.offset = Math.max(0, Math.min(len - obj.width, localY));
    }
  }
}

export function alignItems(state, ids, alignment) {
  const idArray = Array.from(ids || []);
  const boundsList = idArray.map((id) => getBounds(state, id)).filter((b) => b !== null);

  if (boundsList.length < 2) return false;

  const minX = Math.min(...boundsList.map((b) => b.x));
  const maxX = Math.max(...boundsList.map((b) => b.x + b.w));
  const centerX = (minX + maxX) / 2;
  const minY = Math.min(...boundsList.map((b) => b.y));
  const maxY = Math.max(...boundsList.map((b) => b.y + b.h));
  const centerY = (minY + maxY) / 2;

  for (const b of boundsList) {
    const hit = findOwner(state, b.id);
    if (!hit) continue;

    let targetCX = b.cx;
    let targetCY = b.cy;

    switch (alignment) {
      case 'left':
        targetCX = minX + b.w / 2;
        break;
      case 'center':
        targetCX = centerX;
        break;
      case 'right':
        targetCX = maxX - b.w / 2;
        break;
      case 'top':
        targetCY = minY + b.h / 2;
        break;
      case 'middle':
        targetCY = centerY;
        break;
      case 'bottom':
        targetCY = maxY - b.h / 2;
        break;
      default:
        break;
    }

    setItemPosition(state, hit, targetCX, targetCY);
  }

  return true;
}

export function distributeItems(state, ids, direction) {
  const idArray = Array.from(ids || []);
  const boundsList = idArray.map((id) => getBounds(state, id)).filter((b) => b !== null);

  if (boundsList.length < 3) return false;

  if (direction === 'horizontal') {
    boundsList.sort((a, b) => a.cx - b.cx);
    const first = boundsList[0];
    const last = boundsList[boundsList.length - 1];
    const span = last.cx - first.cx;
    const step = span / (boundsList.length - 1);

    for (let i = 1; i < boundsList.length - 1; i++) {
      const b = boundsList[i];
      const hit = findOwner(state, b.id);
      if (hit) {
        setItemPosition(state, hit, first.cx + i * step, b.cy);
      }
    }
  } else if (direction === 'vertical') {
    boundsList.sort((a, b) => a.cy - b.cy);
    const first = boundsList[0];
    const last = boundsList[boundsList.length - 1];
    const span = last.cy - first.cy;
    const step = span / (boundsList.length - 1);

    for (let i = 1; i < boundsList.length - 1; i++) {
      const b = boundsList[i];
      const hit = findOwner(state, b.id);
      if (hit) {
        setItemPosition(state, hit, b.cx, first.cy + i * step);
      }
    }
  }

  return true;
}

export function removeSet(state, ids) {
  const idArray = Array.from(ids || []);
  let removedCount = 0;
  for (const id of idArray) {
    if (removeById(state, id)) {
      removedCount++;
    }
  }
  return removedCount > 0;
}

export { WT, GRID, EPS, wallPoint, wallSeg };
