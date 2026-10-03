// Building-code engine. Rules are modelled on the 2021 International Residential Code (IRC) and
// NEC residential receptacle requirements, plus a few marked "Practice" (common design practice,
// not a code mandate). Local amendments differ: this is a design aid, not a substitute for plan
// review by your authority having jurisdiction (AHJ).
import {
  WT, EPS, WALLS, OPPOSITE, wallSeg, wallLength, interior, floorAreaSqFt, wallPoint, wallNeighbors,
  neighborShift, roomsOverlap, rectsOverlap, rectInside, footprint, fixtureZone,
  subtractInterval, intersectInterval, lv, rectsTouch, computeRoomBoundingBox,
} from './geometry.js';
import {
  ITEM_BY_ID, OPENING_BY_ID, ROOM_TYPES, openingMetrics,
} from './catalog.js';
import { clone, nid, addItem, addOpening, createRoom } from './model.js';

const habitable = (r) => !!ROOM_TYPES[r.type].habitable;
const MOISTURE_ROOMS = new Set(['bathroom', 'laundry']);
const EGRESS = { minW: 20, minH: 24, minArea: 5.7 * 144, maxSill: 44 };

// ---------------------------------------------------------------- wall/opening queries

/** Openings visible on `room`'s wall, including doors owned by a neighbouring room, in this wall's offset space. */
export function wallOpenings(state, room, wall) {
  const out = room.openings.filter((o) => o.wall === wall).map((o) => ({ o, owner: room, from: o.offset, to: o.offset + o.width }));
  for (const n of wallNeighbors(state.rooms, room, wall)) {
    const shift = neighborShift(room, n.room, wall);
    for (const o of n.room.openings) {
      if (o.wall !== OPPOSITE[wall]) continue;
      const from = o.offset + shift; const to = from + o.width;
      if (to > n.from + EPS && from < n.to - EPS) out.push({ o, owner: n.room, from, to });
    }
  }
  return out;
}

/** 'exterior' (no room behind), 'interior' (one neighbour covers it) or 'straddle' (invalid mix). */
export function openingInfo(state, room, o) {
  const from = o.offset; const to = o.offset + o.width;
  const nbs = wallNeighbors(state.rooms, room, o.wall).filter((n) => n.to > from + EPS && n.from < to - EPS);
  if (!nbs.length) return { kind: 'exterior', neighbor: null };
  const n = nbs.find((x) => x.from <= from + EPS && x.to >= to - EPS);
  return n ? { kind: 'interior', neighbor: n.room } : { kind: 'straddle', neighbor: null };
}

function doorSwingRects(state, room, o) {
  const def = OPENING_BY_ID[o.type];
  if (def.kind !== 'door' || def.pocket) return [];
  const into = (r, depthSign) => {
    const p1 = wallPoint(r, o.wall, o.offset, 0);
    const p2 = wallPoint(r, o.wall, o.offset + o.width, depthSign * o.width);
    return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p1.x - p2.x), h: Math.abs(p1.y - p2.y) };
  };
  const rects = [];
  if (o.swing === 'out') {
    const info = openingInfo(state, room, o);
    if (info.neighbor) rects.push({ roomId: info.neighbor.id, rect: into(room, -1) });
  } else rects.push({ roomId: room.id, rect: into(room, 1) });
  return rects;
}

const collidable = (it) => { const d = ITEM_BY_ID[it.type]; return d.mount === 'floor' && !d.flat; };

// ---------------------------------------------------------------- daylight / egress metrics

export function daylight(state, room) {
  let glaze = 0; let operable = 0; let egress = false; let maxSillOk = false;
  for (const o of room.openings) {
    const def = OPENING_BY_ID[o.type];
    if (openingInfo(state, room, o).kind !== 'exterior') continue;
    const m = openingMetrics(def);
    glaze += m.glaze; operable += m.operable;
    if (def.kind === 'door') { if (def.exterior) egress = true; continue; }
    if (m.clearW >= EGRESS.minW && m.clearH >= EGRESS.minH && m.clearW * m.clearH >= EGRESS.minArea && def.sill <= EGRESS.maxSill) egress = true;
  }
  const area = floorAreaSqFt(room) * 144;
  return { glaze, operable, egress, needGlaze: area * 0.08, needVent: area * 0.04, maxSillOk };
}

/** NEC 210.52(A)-style wall coverage: every wall space >= 24" needs an outlet within 72" of every point. */
export function outletSegments(state, room) {
  const segs = [];
  for (const wall of WALLS) {
    const len = wallLength(room, wall);
    let iv = [[WT / 2, len - WT / 2]];
    for (const { o, from, to } of wallOpenings(state, room, wall)) if (o.kind === 'door') iv = subtractInterval(iv, [from, to]);
    const outs = room.items.filter((i) => i.wall === wall && ITEM_BY_ID[i.type].cat === 'electrical' && ITEM_BY_ID[i.type].shape === 'outlet');
    for (const [a, b] of iv) {
      if (b - a < 24) continue;
      const mine = outs.filter((i) => i.offset >= a - EPS && i.offset <= b + EPS).map((i) => i.offset).sort((x, y) => x - y);
      let covered = mine.length > 0;
      if (covered) {
        covered = mine[0] - a <= 72 + EPS && b - mine[mine.length - 1] <= 72 + EPS;
        for (let k = 1; k < mine.length && covered; k++) covered = mine[k] - mine[k - 1] <= 144 + EPS;
      }
      segs.push({ wall, from: a, to: b, covered, need: Math.ceil((b - a) / 144) });
    }
  }
  return segs;
}

/** Stairs rooms on the adjacent levels whose footprint overlaps this one by >= 60%. */
export function stairPartners(state, room) {
  if (room.type !== 'stairs') return [];
  return state.rooms.filter((o) => o.type === 'stairs' && Math.abs(lv(o) - lv(room)) === 1 && overlapArea(o, room) >= 0.6 * Math.min(o.w * o.h, room.w * room.h));
}
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function connectivity(state) {
  const adj = new Map(state.rooms.map((r) => [r.id, new Set()]));
  const exits = new Set();
  for (const r of state.rooms) {
    for (const o of r.openings) {
      if (o.kind !== 'door') continue;
      const info = openingInfo(state, r, o);
      if (info.kind === 'exterior') { if (lv(r) === 0) exits.add(r.id); }
      else if (info.kind === 'interior') { adj.get(r.id).add(info.neighbor.id); adj.get(info.neighbor.id).add(r.id); }
    }
    for (const p of stairPartners(state, r)) { adj.get(r.id).add(p.id); adj.get(p.id).add(r.id); }
  }
  const seen = new Set(exits); const q = [...exits];
  while (q.length) { const c = q.shift(); for (const n of adj.get(c)) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  return { adj, exits, reachable: seen };
}

const has = (room, fn) => room.items.some((i) => (ITEM_BY_ID[i.type].func || []).includes(fn));
const stairRisers = (room) => Math.ceil((room.ceiling + 10) / 7.75); // floor-to-floor = ceiling + 10" framing

// ---------------------------------------------------------------- evaluation

export function computeAffectedBoundingBox(state, trial) {
  if (!state || !trial || state.levels !== trial.levels) return null;

  const sRooms = state.rooms || [];
  const tRooms = trial.rooms || [];

  if (Math.abs(sRooms.length - tRooms.length) > 1) return null;

  const sMap = new Map(sRooms.map((r) => [r.id, r]));
  const tMap = new Map(tRooms.map((r) => [r.id, r]));

  const boxes = [];

  for (const r of tRooms) {
    if (!sMap.has(r.id)) {
      boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h, level: lv(r) });
    }
  }
  for (const r of sRooms) {
    if (!tMap.has(r.id)) {
      boxes.push({ x: r.x, y: r.y, w: r.w, h: r.h, level: lv(r) });
    }
  }

  for (const [id, sRoom] of sMap) {
    const tRoom = tMap.get(id);
    if (!tRoom) continue;

    if (sRoom.x !== tRoom.x || sRoom.y !== tRoom.y || sRoom.w !== tRoom.w || sRoom.h !== tRoom.h) {
      boxes.push({ x: sRoom.x, y: sRoom.y, w: sRoom.w, h: sRoom.h, level: lv(sRoom) });
      boxes.push({ x: tRoom.x, y: tRoom.y, w: tRoom.w, h: tRoom.h, level: lv(tRoom) });
    } else if (sRoom.ceiling !== tRoom.ceiling || sRoom.type !== tRoom.type) {
      boxes.push({ x: tRoom.x, y: tRoom.y, w: tRoom.w, h: tRoom.h, level: lv(tRoom) });
    }

    const sItems = sRoom.items || [];
    const tItems = tRoom.items || [];
    if (JSON.stringify(sItems) !== JSON.stringify(tItems)) {
      const sItemMap = new Map(sItems.map((i) => [i.id, i]));
      const tItemMap = new Map(tItems.map((i) => [i.id, i]));

      for (const item of tItems) {
        const oldItem = sItemMap.get(item.id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
          pushItemBox(boxes, tRoom, item);
        }
      }
      for (const item of sItems) {
        if (!tItemMap.has(item.id)) {
          pushItemBox(boxes, sRoom, item);
        }
      }
    }

    const sOpenings = sRoom.openings || [];
    const tOpenings = tRoom.openings || [];
    if (JSON.stringify(sOpenings) !== JSON.stringify(tOpenings)) {
      const sOpMap = new Map(sOpenings.map((o) => [o.id, o]));
      const tOpMap = new Map(tOpenings.map((o) => [o.id, o]));

      for (const op of tOpenings) {
        const oldOp = sOpMap.get(op.id);
        if (!oldOp || JSON.stringify(oldOp) !== JSON.stringify(op)) {
          pushOpeningBox(boxes, tRoom, op);
        }
      }
      for (const op of sOpenings) {
        if (!tOpMap.has(op.id)) {
          pushOpeningBox(boxes, sRoom, op);
        }
      }
    }
  }

  if (boxes.length === 0) return null;

  const level = boxes[0].level;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  const margin = 36;
  return {
    x: minX - margin,
    y: minY - margin,
    w: (maxX - minX) + margin * 2,
    h: (maxY - minY) + margin * 2,
    level,
  };
}

function pushItemBox(boxes, room, item) {
  const def = ITEM_BY_ID[item.type];
  if (!def) return;
  if (def.mount === 'floor') {
    const fp = footprint(item, def);
    if (def.clearance) {
      const zone = fixtureZone(item, def, 15, 21);
      boxes.push({ x: Math.min(fp.x, zone.x), y: Math.min(fp.y, zone.y), w: Math.max(fp.w, zone.w), h: Math.max(fp.h, zone.h), level: lv(room) });
    } else {
      boxes.push({ x: fp.x, y: fp.y, w: fp.w, h: fp.h, level: lv(room) });
    }
  } else if (def.mount === 'wall') {
    const p = wallPoint(room, item.wall, item.offset || 0, 0);
    boxes.push({ x: p.x - 12, y: p.y - 12, w: 24, h: 24, level: lv(room) });
  } else {
    boxes.push({ x: (item.x !== undefined ? item.x : room.x + room.w / 2) - 12, y: (item.y !== undefined ? item.y : room.y + room.h / 2) - 12, w: 24, h: 24, level: lv(room) });
  }
}

function pushOpeningBox(boxes, room, op) {
  const p1 = wallPoint(room, op.wall, op.offset, 0);
  const p2 = wallPoint(room, op.wall, op.offset + op.width, 0);
  const x = Math.min(p1.x, p2.x) - 18;
  const y = Math.min(p1.y, p2.y) - 18;
  const w = Math.abs(p1.x - p2.x) + 36;
  const h = Math.abs(p1.y - p2.y) + 36;
  boxes.push({ x, y, w, h, level: lv(room) });
}

export function evaluate(state, options = {}) {
  const { affectedBox = null, baseReport = null } = options;
  const rooms = state.rooms;

  let affectedRoomIds = null;
  if (affectedBox) {
    affectedRoomIds = new Set();
    for (const room of rooms) {
      if (affectedBox.level !== undefined && lv(room) !== affectedBox.level) continue;
      if (rectsTouch(room, affectedBox)) {
        affectedRoomIds.add(room.id);
      }
    }
  }

  const v = [];
  const add = (rule, ref, severity, blocking, target, msg, extra = {}) =>
    v.push({ id: `${rule}:${target}`, rule, ref, severity, blocking, msg, ...extra });
  const cx = connectivity(state);

  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    if (lv(rooms[a]) === lv(rooms[b])) {
      if (!affectedRoomIds || affectedRoomIds.has(rooms[a].id) || affectedRoomIds.has(rooms[b].id)) {
        if (roomsOverlap(rooms[a], rooms[b])) add('overlap', 'Geometry', 'error', true, `${rooms[a].id}+${rooms[b].id}`, `${rooms[a].name} overlaps ${rooms[b].name}.`, { roomId: rooms[a].id });
      }
    }
  }

  for (const room of rooms) {
    if (affectedRoomIds && !affectedRoomIds.has(room.id)) continue;

    const t = ROOM_TYPES[room.type]; const ir = interior(room); const area = floorAreaSqFt(room);
    const R = (rule, ref, sev, blocking, target, msg, extra) => add(rule, ref, sev, blocking, target, `${room.name}: ${msg}`, { roomId: room.id, ...extra });
    const minDim = Math.min(ir.w, ir.h);

    // Size (R304)
    if (t.habitable && room.type !== 'kitchen') {
      if (area < 70) R('min-area', 'IRC R304.1', 'error', true, room.id, `habitable rooms need at least 70 sq ft (this is ${area.toFixed(0)}).`);
      if (minDim < 84) R('min-dim', 'IRC R304.2', 'error', true, room.id, `habitable rooms must be at least 7 ft in every horizontal dimension (this is ${(minDim / 12).toFixed(1)} ft).`);
    }
    if (room.type === 'kitchen' && minDim < 60) R('min-dim', 'Practice', 'error', true, room.id, 'kitchens need at least 5 ft clear between opposite walls.');
    if ((t.circulation || t.stairs) && minDim < 36) R('min-width', t.stairs ? 'IRC R311.7.1' : 'IRC R311.6', 'error', true, room.id, 'hallways and stairs must be at least 36 in wide.');

    // Ceiling height (R305.1)
    const needCeil = ['bathroom', 'laundry', 'closet', 'stairs'].includes(room.type) ? 80 : 84;
    if (room.ceiling < needCeil) R('ceiling', 'IRC R305.1', 'error', false, room.id, `ceiling must be at least ${needCeil} in (is ${room.ceiling}).`, { fixable: true });

    // Stairs (R311.7)
    if (t.stairs) {
      const n = stairRisers(room); const rise = (room.ceiling + 10) / n; const runNeeded = 10 * (n - 1);
      if (Math.max(ir.w, ir.h) < runNeeded) R('stair-run', 'IRC R311.7.5', 'error', true, room.id, `${n} risers (${rise.toFixed(2)}" rise, max 7.75") need a ${(runNeeded / 12).toFixed(1)} ft run at 10" treads; room is ${(Math.max(ir.w, ir.h) / 12).toFixed(1)} ft long.`);
    }

    if (t.stairs && !stairPartners(state, room).length) R('stairs-link', 'IRC R311.7', 'error', false, room.id, 'stairs must connect to a matching stair directly above or below (add a floor, then use Fix automatically).', { fixable: (state.levels || 1) > 1 });

    // Openings
    for (const o of room.openings) {
      const def = OPENING_BY_ID[o.type]; const len = wallLength(room, o.wall);
      const O = (rule, ref, sev, blocking, msg, extra) => add(rule, ref, sev, blocking, o.id, `${room.name} ${def.name}: ${msg}`, { roomId: room.id, openingId: o.id, ...extra });
      if (o.offset < 6 || o.offset + o.width > len - 6) { O('opening-bounds', 'Geometry', 'error', true, 'does not fit within the wall (keep 6" from corners).'); continue; }
      const info = openingInfo(state, room, o);
      if (info.kind === 'straddle') O('opening-straddle', 'Geometry', 'error', true, 'spans two different spaces; move it so it opens to one room or fully outside.');
      else if (def.kind === 'window' && info.kind !== 'exterior') O('window-interior', 'IRC R303', 'error', false, 'windows belong on exterior walls.', { fixable: true });
      else if (def.kind === 'door' && def.exterior && info.kind !== 'exterior') O('door-exterior', 'Geometry', 'error', false, 'entry doors belong on exterior walls.', { fixable: true });
      else if (def.kind === 'door' && !def.exterior && info.kind !== 'interior') O('door-interior', 'Geometry', 'error', false, 'interior doors must connect two rooms; use an entry door on exterior walls.', { fixable: true });
      if (def.kind === 'door') {
        if (def.exterior && def.clear < 32) O('door-egress-width', 'IRC R311.2', 'error', true, 'egress door needs 32 in clear width.');
        if (!def.exterior && !def.closet && def.clear < 28) O('door-width', 'Practice', 'error', true, 'interior doors should have at least 28 in clear width.');
        for (const { roomId, rect } of doorSwingRects(state, room, o)) {
          const tr = rooms.find((x) => x.id === roomId);
          const blocker = tr ? tr.items.find((i) => collidable(i) && rectsOverlap(rect, footprint(i, ITEM_BY_ID[i.type]))) : null;
          if (blocker) O('door-swing', 'Practice', 'error', true, `swing is blocked by ${ITEM_BY_ID[blocker.type].name}.`, { itemId: blocker.id });
        }
      }
      for (const w of wallOpenings(state, room, o.wall)) {
        if (w.o.id === o.id || !(o.id < w.o.id)) continue;
        if (Math.min(w.to, o.offset + o.width) - Math.max(w.from, o.offset) > -3) O('opening-overlap', 'Geometry', 'error', true, `is too close to another opening (keep 3").`, { other: w.o.id });
      }
    }

    // Floor items
    const floor = room.items.filter((i) => ITEM_BY_ID[i.type].mount === 'floor');
    for (const it of floor) {
      const def = ITEM_BY_ID[it.type]; const fp = footprint(it, def);
      const I = (rule, ref, sev, blocking, msg) => add(rule, ref, sev, blocking, it.id, `${room.name} ${def.name}: ${msg}`, { roomId: room.id, itemId: it.id });
      if (!rectInside(fp, ir)) { I('item-bounds', 'Geometry', 'error', true, 'extends outside the room.'); continue; }
      if (!def.flat) for (const other of floor) {
        const od = ITEM_BY_ID[other.type];
        if (other.id <= it.id || od.flat) continue;
        if ((def.tucks || od.tucks) && !(def.tucks && od.tucks)) continue;
        if (rectsOverlap(fp, footprint(other, od))) I('item-overlap', 'Geometry', 'error', true, `overlaps ${od.name}.`);
      }
      if (def.clearance) {
        const zone = fixtureZone(it, def, 15, 21);
        const bad = !rectInside(zone, ir) || floor.some((o) => o.id !== it.id && collidable(o) && rectsOverlap(zone, footprint(o, ITEM_BY_ID[o.type])));
        if (bad) I('fixture-clearance', 'IRC R307.1', 'error', true, 'needs 21 in clear in front and 15 in from centerline to walls/fixtures.');
      }
    }

    // Wall & ceiling items
    for (const it of room.items) {
      const def = ITEM_BY_ID[it.type];
      const I = (rule, ref, sev, blocking, msg) => add(rule, ref, sev, blocking, it.id, `${room.name} ${def.name}: ${msg}`, { roomId: room.id, itemId: it.id });
      if (def.mount === 'wall') {
        const len = wallLength(room, it.wall);
        if (it.offset < 8 || it.offset > len - 8) { I('wall-item-bounds', 'Geometry', 'error', true, 'must be at least 8 in from corners.'); continue; }
        if (wallOpenings(state, room, it.wall).some(({ o, from, to }) => o.kind === 'door' && it.offset > from - 2 && it.offset < to + 2)) I('wall-item-door', 'Geometry', 'error', true, 'cannot sit in a door opening.');
        for (const other of room.items) if (other.id > it.id && other.wall === it.wall && ITEM_BY_ID[other.type].mount === 'wall' && Math.abs(other.offset - it.offset) < 6) I('wall-item-overlap', 'Geometry', 'error', true, 'overlaps another wall device.');
      } else if (def.mount === 'ceiling' && !rectInside({ x: it.x - 4, y: it.y - 4, w: 8, h: 8 }, ir)) I('item-bounds', 'Geometry', 'error', true, 'extends outside the room.');
    }

    // Daylight, ventilation, egress (R303, R310)
    const dl = daylight(state, room);
    if (t.habitable) {
      if (dl.glaze < dl.needGlaze) R('light', 'IRC R303.1', 'error', false, room.id, `needs glazing of 8% of floor area (${(dl.needGlaze / 144).toFixed(1)} sq ft); has ${(dl.glaze / 144).toFixed(1)}.`, { fixable: true });
      if (dl.operable < dl.needVent) R('vent', 'IRC R303.1', 'error', false, room.id, `needs openable area of 4% of floor area (${(dl.needVent / 144).toFixed(1)} sq ft); has ${(dl.operable / 144).toFixed(1)}.`, { fixable: true });
    }
    if (t.sleeping && !dl.egress) R('egress', 'IRC R310.1', 'error', false, room.id, 'sleeping rooms need an emergency escape: window with ≥5.7 sq ft opening, ≥24" high, ≥20" wide, sill ≤44", or an exterior door.', { fixable: true });
    if (room.type === 'bathroom' && !has(room, 'fan') && !(dl.glaze >= 432 && dl.operable >= 216)) R('bath-vent', 'IRC R303.3', 'error', false, room.id, 'bathrooms need an exhaust fan or a window with 3 sq ft glazing / 1.5 sq ft openable.', { fixable: true });

    // Moisture-resistant finishes
    if (MOISTURE_ROOMS.has(room.type)) {
      if (!FLOOR_WET(room.floor)) R('wet-floor', 'IRC R307 / practice', 'error', false, room.id, 'floor finish must be moisture-resistant.', { fixable: true });
      for (const w of WALLS) if (!WALL_WET(room.walls[w])) R('wet-wall', 'IRC R702.4 / practice', 'error', false, `${room.id}:${w}`, `${w} wall finish must be moisture-resistant (tile, paint or vinyl).`, { fixable: true });
    }

    // Lighting & switches (R303.7, NEC)
    if (t.habitable || ['bathroom', 'laundry', 'hallway', 'entry', 'stairs'].includes(room.type)) {
      if (!has(room, 'light')) R('light-fixture', 'IRC R303.8 / E3903', 'error', false, room.id, 'needs a lighting outlet.', { fixable: true });
      if (!room.items.some((i) => i.type === 'switch')) R('switch', 'IRC E3903.2', 'error', false, room.id, 'needs a wall switch at an entrance.', { fixable: true });
    }

    // Receptacles (NEC 210.52)
    if (t.habitable || room.type === 'laundry') {
      for (const s of outletSegments(state, room)) if (!s.covered) R('outlets', 'NEC 210.52', 'error', false, `${room.id}:${s.wall}:${Math.round(s.from)}`, `${s.wall} wall space needs ${s.need} outlet(s) so no point is >6 ft from one.`, { fixable: true });
    }
    if (['hallway', 'entry'].includes(room.type) && !room.items.some((i) => ITEM_BY_ID[i.type].shape === 'outlet') && Math.max(ir.w, ir.h) >= 120) R('outlets', 'NEC 210.52(H)', 'error', false, `${room.id}:hall`, 'hallways 10 ft or longer need an outlet.', { fixable: true });
    if (t.wet) for (const i of room.items) if (ITEM_BY_ID[i.type].shape === 'outlet' && !ITEM_BY_ID[i.type].gfci) add('gfci', 'NEC 210.8', 'error', false, i.id, `${room.name}: outlets must be GFCI-protected.`, { roomId: room.id, itemId: i.id, fixable: true });
    if (room.type === 'bathroom') {
      const lav = room.items.find((i) => ITEM_BY_ID[i.type].fixture === 'lavatory');
      const gf = room.items.filter((i) => ITEM_BY_ID[i.type].gfci);
      const ok = gf.some((g) => { if (!lav) return true; const p = wallPoint(room, g.wall, g.offset, 0); return Math.hypot(p.x - lav.x, p.y - lav.y) <= 48; });
      if (!ok) R('bath-outlet', 'NEC 210.52(D)', 'error', false, room.id, 'needs a GFCI outlet within 3 ft of the lavatory.', { fixable: true });
    }

    // Kitchen practice
    if (room.type === 'kitchen') {
      if (!room.items.some((i) => ITEM_BY_ID[i.type].cooking)) R('kitchen-range', 'Practice', 'warn', false, room.id, 'no cooking appliance placed.');
      if (!room.items.some((i) => i.type === 'fridge')) R('kitchen-fridge', 'Practice', 'warn', false, room.id, 'no refrigerator placed.');
    }

    // Connectivity (R311)
    if (!cx.reachable.has(room.id)) R('unreachable', 'IRC R311.1', 'error', false, room.id, 'has no door path to an exterior exit.', { fixable: true });
  }

  // Smoke / CO alarms (R314, R315)
  const fuel = rooms.some((r) => r.items.some((i) => ITEM_BY_ID[i.type].fuel));
  for (const room of rooms) {
    if (!ROOM_TYPES[room.type].sleeping) continue;
    if (affectedRoomIds && !affectedRoomIds.has(room.id)) continue;
    const outside = outsideAreas(state, room, cx);
    const need = fuel ? ['smoke', 'co'] : ['smoke'];
    for (const fn of need) {
      const label = fn === 'smoke' ? 'smoke alarm' : 'CO alarm';
      if (fn === 'smoke' && !has(room, 'smoke')) add('smoke-in', 'IRC R314.3', 'error', false, room.id, `${room.name}: needs a ${label} inside.`, { roomId: room.id, fixable: true });
      if (outside.length && !outside.some((r) => has(r, fn))) add(`${fn}-outside`, fn === 'smoke' ? 'IRC R314.3' : 'IRC R315.3', 'error', false, room.id, `${room.name}: needs a ${label} outside the sleeping area${fn === 'co' ? ' (fuel-burning appliance present)' : ''}.`, { roomId: room.id, fixable: true });
      if (fn === 'co' && !outside.length && !has(room, 'co')) add('co-in', 'IRC R315.3', 'error', false, room.id, `${room.name}: needs a CO alarm (fuel-burning appliance present).`, { roomId: room.id, fixable: true });
    }
  }

  if (rooms.length && (!affectedRoomIds || rooms.some((r) => affectedRoomIds.has(r.id)))) {
    if (!cx.exits.size) add('no-exit', 'IRC R311.1', 'error', false, 'home', 'The home needs at least one exterior door (32 in clear).', { fixable: true });
    const kinds = new Set(rooms.flatMap((r) => r.items.map((i) => ITEM_BY_ID[i.type].fixture)).filter(Boolean));
    const inRoom = (type, fx) => rooms.some((r) => r.type === type && r.items.some((i) => ITEM_BY_ID[i.type].fixture === fx));
    if (!inRoom('kitchen', 'kitchen_sink')) add('need-kitchen', 'IRC R306.1', 'error', false, 'home', 'A kitchen with a sink is required.');
    if (!kinds.has('toilet')) add('need-toilet', 'IRC R306.3', 'error', false, 'home', 'A toilet (water closet) is required.');
    if (!kinds.has('lavatory')) add('need-lav', 'IRC R306.2', 'error', false, 'home', 'A lavatory (bathroom sink) is required.');
    if (!kinds.has('tub') && !kinds.has('shower')) add('need-bath', 'IRC R306.3', 'error', false, 'home', 'A bathtub or shower is required.');
  }

  if (affectedRoomIds && baseReport && baseReport.violations) {
    for (const prev of baseReport.violations) {
      const targetRoomId = prev.roomId || (prev.id ? prev.id.split(':')[1] : null);
      if (targetRoomId && !affectedRoomIds.has(targetRoomId) && !v.some((x) => x.id === prev.id)) {
        v.push(prev);
      }
    }
  }

  const errors = v.filter((x) => x.severity === 'error').length;
  const warnings = v.length - errors;
  return { violations: v, errors, warnings, compliant: rooms.length > 0 && errors === 0 };
}

function FLOOR_WET(id) { return wetOf(id, 'floor'); }
function WALL_WET(id) { return wetOf(id, 'wall'); }
import { FLOOR_BY_ID, WALL_BY_ID } from './catalog.js';
function wetOf(id, kind) { const m = kind === 'floor' ? FLOOR_BY_ID : WALL_BY_ID; return !!(m[id] && m[id].wet); }

/** Rooms outside a sleeping room: non-closet/bath rooms reached through its doors. */
function outsideAreas(state, room, cx) {
  return [...cx.adj.get(room.id)].map((id) => state.rooms.find((r) => r.id === id))
    .filter((r) => !['closet', 'bathroom'].includes(r.type) && !ROOM_TYPES[r.type].sleeping);
}

export const blockingIds = (state, options = {}) => new Set(evaluate(state, options).violations.filter((x) => x.blocking).map((x) => x.id));

// ---------------------------------------------------------------- auto-compliance

function freeSpans(state, room, wall, { exterior = false, neighbor = null, minLen = 12 } = {}) {
  const len = wallLength(room, wall);
  let iv = [[6, len - 6]];
  for (const { from, to } of wallOpenings(state, room, wall)) iv = subtractInterval(iv, [from - 3, to + 3]);
  const nbs = wallNeighbors(state.rooms, room, wall);
  if (exterior) for (const n of nbs) iv = subtractInterval(iv, [n.from, n.to]);
  if (neighbor) { const n = nbs.find((x) => x.room.id === neighbor.id); iv = n ? intersectInterval(iv, [n.from + 6, n.to - 6]) : []; }
  return iv.filter(([a, b]) => b - a >= minLen);
}

/** Try mutate(); keep it only if it introduces no new blocking violation. */
function attempt(state, mutate, baseReport = null) {
  const baseRep = baseReport || evaluate(state);
  const base = new Set(baseRep.violations.filter((x) => x.blocking).map((x) => x.id));
  const trial = clone(state);
  mutate(trial);
  const affectedBox = computeAffectedBoundingBox(state, trial);
  const trialRep = evaluate(trial, { affectedBox, baseReport: baseRep });
  for (const v of trialRep.violations) {
    if (v.blocking && !base.has(v.id)) return false;
  }
  state.rooms = trial.rooms; state.nextId = trial.nextId;
  return true;
}

function tryOpening(state, roomId, type, wall, spans, width, extra = {}, baseReport = null) {
  const swings = ['in', 'out'];
  for (const [a, b] of spans) {
    for (const off of [a + (b - a - width) / 2, a, b - width]) {
      if (off < a - EPS || off + width > b + EPS) continue;
      for (const swing of swings) {
        let createdId = null;
        const ok = attempt(state, (s) => {
          const r = s.rooms.find((x) => x.id === roomId);
          const o = addOpening(s, r, type, wall, Math.round(off * 2) / 2);
          o.swing = swing;
          Object.assign(o, extra);
          createdId = o.id;
        }, baseReport);
        if (ok) return createdId;
      }
    }
  }
  return null;
}

// Which neighbour a new door should lead to: circulation first, never "through" a bath/laundry/bedroom if avoidable.
function doorPreference(room, other) {
  const rank = { hallway: 5, entry: 5, living: 4, dining: 3, kitchen: 3, office: 2, stairs: 2, closet: 1, laundry: 0, bedroom: 0, bathroom: -1 };
  let score = rank[other.type] ?? 1;
  if (room.type === 'closet' || room.type === 'bathroom') score = Math.max(score, 1) + (other.type === 'bedroom' ? 4 : 0); // en-suite style is fine
  return score;
}

function addExteriorWindow(state, roomId, types, baseReport = null) {
  const room = state.rooms.find((r) => r.id === roomId);
  const walls = [...WALLS].sort((a, b) => wallLength(room, b) - wallLength(room, a));
  for (const type of types) {
    const def = OPENING_BY_ID[type];
    for (const wall of walls) {
      const spans = freeSpans(state, room, wall, { exterior: true, minLen: def.w });
      if (spans.length) {
        const id = tryOpening(state, roomId, type, wall, spans, def.w, {}, baseReport);
        if (id) return { name: def.name, id };
      }
    }
  }
  return null;
}

const center = (room) => { const ir = interior(room); return { x: ir.x + ir.w / 2, y: ir.y + ir.h / 2 }; };

function addCeiling(state, roomId, type, dx = 0, dy = 0, baseReport = null) {
  const room = state.rooms.find((r) => r.id === roomId); const c = center(room);
  let createdId = null;
  const ok = attempt(state, (s) => {
    const it = addItem(s, s.rooms.find((r) => r.id === roomId), type, { x: c.x + dx, y: c.y + dy, rot: 0 });
    createdId = it.id;
  }, baseReport);
  return ok ? createdId : null;
}

function addWallItem(state, roomId, type, wall, offset, baseReport = null) {
  let createdId = null;
  const ok = attempt(state, (s) => {
    const it = addItem(s, s.rooms.find((r) => r.id === roomId), type, { wall, offset: Math.round(offset * 2) / 2 });
    createdId = it.id;
  }, baseReport);
  return ok ? createdId : null;
}

/**
 * Bring a plan into compliance wherever a fix exists. Mutates `state`, returns human-readable change log.
 * Only ever adds/changes things; never moves or deletes the user's own furniture.
 */
export function autoComply(state) {
  const log = [];
  let curRep = null; let repDirty = true;
  // Re-evaluate lazily: only after a change was applied, so attempts diff against an accurate base report.
  const rep = () => { if (repDirty || !curRep) { curRep = evaluate(state); repDirty = false; } return curRep; };
  const addDiff = (id, action, type, msg) => {
    const diff = { id, action, type, msg, toString() { return this.msg; } };
    log.push(diff);
    repDirty = true;
  };
  const name = (id) => state.rooms.find((r) => r.id === id).name;
  for (let pass = 0; pass < 3; pass++) {
    const before = JSON.stringify(state.rooms);
    repDirty = true;

    // 1. Ceilings & moisture finishes
    for (const r of state.rooms) {
      const need = ['bathroom', 'laundry', 'closet', 'stairs'].includes(r.type) ? 80 : 84;
      if (r.ceiling < need) { r.ceiling = 96; addDiff(r.id, 'modify', 'ceiling', `${r.name}: ceiling raised to 8 ft`); }
      if (MOISTURE_ROOMS.has(r.type)) {
        if (!FLOOR_WET(r.floor)) { r.floor = 'floor_tile_gray'; addDiff(r.id, 'modify', 'floor', `${r.name}: moisture-resistant floor`); }
        for (const w of WALLS) if (!WALL_WET(r.walls[w])) { r.walls[w] = r.type === 'bathroom' ? 'wall_tile_white' : 'paint_white'; addDiff(`${r.id}:${w}`, 'modify', 'wall', `${r.name}: ${w} wall made moisture-resistant`); }
      }
    }

    // 1b. Openings whose wall changed character (exterior <-> interior) after rooms moved/were added
    for (const r of state.rooms) for (const o of [...r.openings]) {
      const def = OPENING_BY_ID[o.type]; const kind = openingInfo(state, r, o).kind;
      if (kind === 'straddle') continue;
      if (def.kind === 'window' && kind === 'interior') { r.openings = r.openings.filter((x) => x.id !== o.id); addDiff(o.id, 'remove', 'opening', `${r.name}: removed ${def.name} (wall is no longer exterior)`); }
      else if (def.kind === 'door' && !def.exterior && kind === 'exterior') {
        const off = o.offset + (o.width - 36) / 2;
        const ok = attempt(state, (s) => { const rr = s.rooms.find((x) => x.id === r.id); const oo = rr.openings.find((x) => x.id === o.id); Object.assign(oo, { type: 'door_entry_36', width: 36, offset: Math.max(6, off), swing: 'in' }); }, rep());
        if (ok) addDiff(o.id, 'upgrade', 'opening', `${r.name}: door on exterior wall upgraded to entry door`);
      } else if (def.kind === 'door' && def.exterior && kind === 'interior') {
        const ok = attempt(state, (s) => { const rr = s.rooms.find((x) => x.id === r.id); const oo = rr.openings.find((x) => x.id === o.id); Object.assign(oo, { type: 'door_interior_32', width: 32, offset: oo.offset + 2 }); }, rep());
        if (ok) addDiff(o.id, 'modify', 'opening', `${r.name}: entry door between rooms changed to interior door`);
      }
    }
    // 1c. Stairs need a matching stair on the next level
    for (const r of [...state.rooms]) {
      if (r.type !== 'stairs' || stairPartners(state, r).length) continue;
      for (const t of [lv(r) + 1, lv(r) - 1]) {
        if (t < 0 || t >= (state.levels || 1)) continue;
        let stairRoomId = null;
        const ok = attempt(state, (s2) => { const p = createRoom(s2, 'stairs', r.x, r.y, r.w, r.h, { level: t, floor: r.floor, ceiling: r.ceiling }); p.walls = { ...r.walls }; stairRoomId = p.id; }, rep());
        if (ok) { addDiff(stairRoomId || r.id, 'add', 'room', `${r.name}: added matching stairs on floor ${t + 1}`); break; }
      }
    }
    // 2. Exit and door connectivity
    if (state.rooms.length && !connectivity(state).exits.size) {
      const order = ['entry', 'living', 'hallway', 'kitchen', 'dining', 'office', 'bedroom'];
      const cands = state.rooms.filter((r) => lv(r) === 0).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || 0).filter((r) => order.includes(r.type) || true);
      outer: for (const r of cands) for (const wall of WALLS) {
        const spans = freeSpans(state, r, wall, { exterior: true, minLen: 36 });
        if (spans.length) {
          const openId = tryOpening(state, r.id, 'door_entry_36', wall, spans, 36, {}, rep());
          if (openId) { addDiff(openId, 'add', 'opening', `${r.name}: added entry door (required exterior exit)`); break outer; }
        }
      }
    }
    for (let guard = 0; guard < state.rooms.length; guard++) {
      const cx = connectivity(state); let progressed = false;
      for (const r of state.rooms.filter((x) => !cx.reachable.has(x.id))) {
        const type = r.type === 'closet' ? 'door_closet_24' : r.type === 'bathroom' ? 'door_interior_30' : 'door_interior_32';
        const w = OPENING_BY_ID[type].w;
        const nbrs = WALLS.flatMap((wall) => wallNeighbors(state.rooms, r, wall).map((n) => ({ wall, room: n.room })))
          .filter((n) => cx.reachable.has(n.room.id))
          .sort((a, b) => doorPreference(r, b.room) - doorPreference(r, a.room));
        for (const n of nbrs) {
          const openId = tryOpening(state, r.id, type, n.wall, freeSpans(state, r, n.wall, { neighbor: n.room, minLen: w }), w, {}, rep());
          if (openId) { addDiff(openId, 'add', 'opening', `${r.name}: added door to ${n.room.name}`); progressed = true; break; }
        }
        if (progressed) break;
      }
      if (!progressed) break;
    }
    // 3. Windows: egress, light, ventilation, bath ventilation
    for (const r of state.rooms) {
      if (ROOM_TYPES[r.type].sleeping && !daylight(state, state.rooms.find((x) => x.id === r.id)).egress) {
        const res = addExteriorWindow(state, r.id, ['win_casement_30x48', 'win_hung_36x60'], rep());
        if (res) addDiff(res.id, 'add', 'opening', `${r.name}: added ${res.name} for emergency egress`);
      }
      if (ROOM_TYPES[r.type].habitable) {
        for (let k = 0; k < 4; k++) {
          const d = daylight(state, state.rooms.find((x) => x.id === r.id));
          if (d.glaze >= d.needGlaze && d.operable >= d.needVent) break;
          const res = addExteriorWindow(state, r.id, ['win_hung_36x60', 'win_hung_30x48', 'win_casement_30x48'], rep());
          if (!res) break;
          addDiff(res.id, 'add', 'opening', `${r.name}: added ${res.name} for light/ventilation`);
        }
      }
    }
    // 4. Electrical and life safety
    for (const r0 of state.rooms) {
      const id = r0.id; const get = () => state.rooms.find((x) => x.id === id); const r = get();
      const t = ROOM_TYPES[r.type]; const ir = interior(r);
      if (r.type === 'bathroom') {
        const d = daylight(state, r);
        if (!has(r, 'fan') && !(d.glaze >= 432 && d.operable >= 216)) {
          const itemId = addCeiling(state, id, 'fan_exhaust', 24, 0, rep());
          if (itemId) addDiff(itemId, 'add', 'item', `${r.name}: added exhaust fan`);
        }
      }
      const needsLight = t.habitable || ['bathroom', 'laundry', 'hallway', 'entry', 'stairs'].includes(r.type);
      if (needsLight && !has(get(), 'light')) {
        const itemId = addCeiling(state, id, 'light_ceiling', 0, 0, rep(), rep());
        if (itemId) addDiff(itemId, 'add', 'item', `${r.name}: added ceiling light`);
      }
      if (needsLight && !get().items.some((i) => i.type === 'switch')) {
        const cands = [];
        for (const wall of WALLS) for (const { o, from, to } of wallOpenings(state, get(), wall)) {
          if (o.kind !== 'door') continue;
          const dp = wallPoint(get(), wall, (from + to) / 2, 0);
          for (const w2 of WALLS) for (let t2 = 8; t2 <= wallLength(get(), w2) - 8; t2 += 4) {
            const p = wallPoint(get(), w2, t2, 0);
            cands.push({ w2, t2, d: Math.hypot(p.x - dp.x, p.y - dp.y) });
          }
        }
        cands.sort((a, b) => a.d - b.d);
        for (const cd of cands.slice(0, 40)) {
          const itemId = addWallItem(state, id, 'switch', cd.w2, cd.t2, rep());
          if (itemId) { addDiff(itemId, 'add', 'item', `${r.name}: added light switch at door`); break; }
        }
      }
      // GFCI upgrades in wet rooms
      if (t.wet) for (const i of get().items) if (ITEM_BY_ID[i.type].shape === 'outlet' && !ITEM_BY_ID[i.type].gfci) { i.type = 'outlet_gfci'; addDiff(i.id, 'upgrade', 'item', `${r.name}: outlet upgraded to GFCI`); }
      const outType = t.wet ? 'outlet_gfci' : 'outlet';
      if (t.habitable || r.type === 'laundry') {
        for (let k = 0; k < 20; k++) {
          const seg = outletSegments(state, get()).find((s) => !s.covered);
          if (!seg) break;
          const parts = seg.need; let placed = false;
          for (let p = 0; p < parts && !placed; p++) {
            const c = seg.from + ((p + 0.5) * (seg.to - seg.from)) / parts;
            if (get().items.some((i) => i.wall === seg.wall && Math.abs(i.offset - c) < 6 && ITEM_BY_ID[i.type].shape === 'outlet')) continue;
            for (const off of [c, c - 12, c + 12, c - 24, c + 24]) if (off >= seg.from && off <= seg.to) {
              const itemId = addWallItem(state, id, outType, seg.wall, off, rep());
              if (itemId) { placed = true; addDiff(itemId, 'add', 'item', `${r.name}: added outlet on ${seg.wall} wall`); break; }
            }
          }
          if (!placed) break;
        }
      }
      if (['hallway', 'entry'].includes(r.type) && Math.max(ir.w, ir.h) >= 120 && !get().items.some((i) => ITEM_BY_ID[i.type].shape === 'outlet')) {
        const wall = ir.w >= ir.h ? 'N' : 'W';
        const itemId = addWallItem(state, id, 'outlet', wall, wallLength(get(), wall) / 2, rep());
        if (itemId) addDiff(itemId, 'add', 'item', `${r.name}: added hallway outlet`);
      }
      if (r.type === 'bathroom') {
        const lav = get().items.find((i) => ITEM_BY_ID[i.type].fixture === 'lavatory');
        const hasG = get().items.some((i) => ITEM_BY_ID[i.type].gfci);
        const near = () => { if (!lav) return get().items.some((i) => ITEM_BY_ID[i.type].gfci); return get().items.some((g) => ITEM_BY_ID[g.type].gfci && Math.hypot(wallPoint(get(), g.wall, g.offset, 0).x - lav.x, wallPoint(get(), g.wall, g.offset, 0).y - lav.y) <= 48); };
        if (!near() || !hasG) {
          if (lav) {
            outer3: for (const wall of WALLS) {
              const len = wallLength(get(), wall);
              for (let t2 = 8; t2 <= len - 8; t2 += 4) {
                const p = wallPoint(get(), wall, t2, 0);
                const d = Math.hypot(p.x - lav.x, p.y - lav.y);
                if (d > 14 && d <= 40) {
                  const itemId = addWallItem(state, id, 'outlet_gfci', wall, t2, rep());
                  if (itemId) { addDiff(itemId, 'add', 'item', `${r.name}: added GFCI outlet by lavatory`); break outer3; }
                }
              }
            }
          } else {
            const itemId = addWallItem(state, id, 'outlet_gfci', 'N', wallLength(get(), 'N') / 2, rep());
            if (itemId) addDiff(itemId, 'add', 'item', `${r.name}: added GFCI outlet`);
          }
        }
      }
    }
    // Smoke & CO alarms
    const fuel = state.rooms.some((r) => r.items.some((i) => ITEM_BY_ID[i.type].fuel));
    for (const r0 of state.rooms.filter((x) => ROOM_TYPES[x.type].sleeping)) {
      const cx = connectivity(state);
      const get = () => state.rooms.find((x) => x.id === r0.id);
      const outside = outsideAreas(state, get(), cx).sort((a, b) => (b.type === 'hallway') - (a.type === 'hallway'));
      const want = (rm, fn) => has(state.rooms.find((x) => x.id === rm.id), fn);
      if (!has(get(), 'smoke')) {
        if (fuel && !outside.length && !has(get(), 'co')) {
          const itemId = addCeiling(state, r0.id, 'smoke_co_alarm', 24, 0, rep());
          if (itemId) addDiff(itemId, 'add', 'item', `${r0.name}: added smoke + CO alarm`);
        } else {
          const itemId = addCeiling(state, r0.id, 'smoke_alarm', 24, 0, rep());
          if (itemId) addDiff(itemId, 'add', 'item', `${r0.name}: added smoke alarm`);
        }
      }
      if (fuel && !outside.length && !has(get(), 'co')) {
        const itemId = addCeiling(state, r0.id, 'co_alarm', -24, 0, rep());
        if (itemId) addDiff(itemId, 'add', 'item', `${r0.name}: added CO alarm`);
      }
      for (const fn of fuel ? ['smoke', 'co'] : ['smoke']) {
        if (outside.length && !outside.some((rm) => want(rm, fn))) {
          const target = outside[0];
          const type = fuel ? 'smoke_co_alarm' : 'smoke_alarm';
          const itemId = addCeiling(state, target.id, type, 24, 0, rep()) || addCeiling(state, target.id, type, 0, 24, rep());
          if (itemId) addDiff(itemId, 'add', 'item', `${target.name}: added ${fn === 'co' || fuel ? 'smoke + CO' : 'smoke'} alarm outside ${r0.name}`);
        }
      }
    }
    if (JSON.stringify(state.rooms) === before) break;
  }
  return log;
}

/**
 * The gate every edit goes through. Applies `mutate` to a copy, runs auto-compliance, and rejects the
 * edit if it would introduce a new hard violation (overlaps, undersized rooms, blocked doors, ...).
 */
export function commit(state, mutate, { autoFix = true } = {}) {
  const base = blockingIds(state);
  const next = clone(state);
  mutate(next);
  const changes = autoFix ? autoComply(next) : [];
  const report = evaluate(next);
  const fresh = report.violations.filter((x) => x.blocking && !base.has(x.id));
  if (fresh.length) return { ok: false, reasons: fresh, state };
  return { ok: true, state: next, changes, report };
}

/** Best-effort batch: apply each mutation as its own gated commit, skipping any that are rejected. */
export function commitSequence(state, mutations, opts) {
  let cur = state; const changes = []; let placed = 0; const skipped = [];
  for (const mut of mutations) {
    const r = commit(cur, mut, opts);
    if (r.ok) { cur = r.state; changes.push(...r.changes); placed++; } else skipped.push(r.reasons[0].msg);
  }
  return { state: cur, changes, placed, skipped };
}
