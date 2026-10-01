// Canvas plan renderer.
import { WT, WALLS, wallSeg, wallLength, wallPoint, interior, footprint, floorAreaSqFt } from './geometry.js';
import { ROOM_TYPES, ITEM_BY_ID, OPENING_BY_ID, WALL_BY_ID, FLOOR_BY_ID } from './catalog.js';
import { patternFor } from './patterns.js';
import { openingInfo } from './codes.js';

const fmt = (inches) => `${Math.floor(inches / 12)}'${Math.round(inches % 12) ? ` ${Math.round(inches % 12)}"` : ''}`;
export const fmtLen = fmt;

export function draw(ctx, state, view, opts = {}) {
  const { width: w, height: h } = ctx.canvas;
  const dpr = opts.dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f7f5f0'; ctx.fillRect(0, 0, w, h);
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr);
  drawGrid(ctx, view, w / dpr, h / dpr);

  const bad = opts.bad || new Set(); // ids of violating rooms/items/openings
  for (const u of opts.under || []) { ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#6b6254'; ctx.fillRect(u.x, u.y, u.w, u.h); ctx.strokeStyle = '#3c3a38'; ctx.lineWidth = WT; ctx.strokeRect(u.x, u.y, u.w, u.h); ctx.restore(); }
  for (const room of state.rooms) drawFloor(ctx, room, opts);
  for (const room of state.rooms) drawItems(ctx, room, bad, opts.selection, true);
  for (const room of state.rooms) drawWalls(ctx, state, room, bad, opts);
  for (const room of state.rooms) drawItems(ctx, room, bad, opts.selection, false);
  for (const room of state.rooms) drawLabel(ctx, room, view);
  if (opts.selection) drawSelection(ctx, state, opts.selection, view);
  if (opts.overlay) opts.overlay(ctx, view);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawGrid(ctx, view, cw, ch) {
  const x0 = -view.ox / view.scale; const y0 = -view.oy / view.scale;
  const x1 = x0 + cw / view.scale; const y1 = y0 + ch / view.scale;
  ctx.lineWidth = 1 / view.scale;
  for (const [step, color] of [[12, '#ebe7de'], [60, '#dcd6c8']]) {
    if (step * view.scale < 6) continue;
    ctx.strokeStyle = color; ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }
}

function drawFloor(ctx, room, opts) {
  const f = FLOOR_BY_ID[room.floor];
  ctx.fillStyle = f ? patternFor(ctx, f) : ROOM_TYPES[room.type].color;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  if (room.type === 'stairs') drawStairs(ctx, room);
}

function drawStairs(ctx, room) {
  const ir = interior(room); const vertical = ir.h >= ir.w;
  const n = Math.ceil((room.ceiling + 10) / 7.75);
  ctx.strokeStyle = 'rgba(60,45,30,.55)'; ctx.lineWidth = 0.8; ctx.beginPath();
  for (let k = 1; k < n; k++) {
    if (vertical) { const y = ir.y + (ir.h * k) / n; ctx.moveTo(ir.x, y); ctx.lineTo(ir.x + ir.w, y); }
    else { const x = ir.x + (ir.w * k) / n; ctx.moveTo(x, ir.y); ctx.lineTo(x, ir.y + ir.h); }
  }
  ctx.stroke();
}

function drawWalls(ctx, state, room, bad, opts) {
  for (const wall of WALLS) {
    const s = wallSeg(room, wall); const fin = WALL_BY_ID[room.walls[wall]];
    // wall body: finish on the interior half, structure on the outside half
    ctx.save();
    ctx.translate(s.ax, s.ay);
    const horizontal = s.dx === 1;
    const len = s.len;
    const rect = (t0, t1, d0, d1) => (horizontal ? [t0, d0, t1 - t0, d1 - d0] : [d0, t0, d1 - d0, t1 - t0]);
    const side = horizontal ? s.ny : s.nx; // +1: interior is on +axis side
    const inner = side > 0 ? [0, WT / 2] : [-WT / 2, 0];
    const outer = side > 0 ? [-WT / 2, 0] : [0, WT / 2];
    ctx.fillStyle = '#3c3a38'; ctx.fillRect(...rect(-WT / 2, len + WT / 2, outer[0], outer[1]));
    ctx.fillStyle = fin ? patternFor(ctx, fin) : '#ddd'; ctx.fillRect(...rect(-WT / 2, len + WT / 2, inner[0], inner[1]));
    ctx.restore();
  }
  for (const room2 of [room]) for (const o of room2.openings) drawOpening(ctx, state, room2, o, bad);
}

function drawOpening(ctx, state, room, o, bad) {
  const def = OPENING_BY_ID[o.type];
  const a = wallPoint(room, o.wall, o.offset, 0); const b = wallPoint(room, o.wall, o.offset + o.width, 0);
  const s = wallSeg(room, o.wall);
  const horizontal = s.dx === 1;
  ctx.save();
  ctx.translate(a.x, a.y);
  const th = WT + 0.6;
  // gap in wall
  ctx.fillStyle = '#f7f5f0';
  if (horizontal) ctx.fillRect(0, -th / 2, o.width, th); else ctx.fillRect(-th / 2, 0, th, o.width);
  const isBad = bad.has(o.id);
  ctx.strokeStyle = isBad ? '#d33' : '#2d2a26'; ctx.lineWidth = 1.2; ctx.fillStyle = 'rgba(120,180,230,.55)';
  if (def.kind === 'window') {
    if (horizontal) { ctx.fillRect(0, -1.2, o.width, 2.4); ctx.strokeRect(0, -th / 2, o.width, th); }
    else { ctx.fillRect(-1.2, 0, 2.4, o.width); ctx.strokeRect(-th / 2, 0, th, o.width); }
  } else {
    const dir = o.swing === 'out' ? -1 : 1;
    const nx = s.nx * dir; const ny = s.ny * dir;
    // leaf (hinged at start) and swing arc
    const hx = 0; const hy = 0;
    const lx = nx * o.width; const ly = ny * o.width;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + lx, hy + ly); ctx.stroke();
    ctx.setLineDash([1.5, 1.5]); ctx.lineWidth = 0.7; ctx.beginPath();
    const ex = s.dx * o.width; const ey = s.dy * o.width;
    const ang0 = Math.atan2(ly, lx); const ang1 = Math.atan2(ey, ex);
    let d = ang1 - ang0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    ctx.arc(hx, hy, o.width, ang0, ang0 + d, d < 0);
    ctx.stroke(); ctx.setLineDash([]);
    if (def.exterior) { ctx.fillStyle = 'rgba(80,60,40,.5)'; if (horizontal) ctx.fillRect(0, -th / 2, o.width, th); else ctx.fillRect(-th / 2, 0, th, o.width); }
  }
  ctx.restore();
}

function drawItems(ctx, room, bad, selection, flat) {
  for (const it of room.items) {
    const def = ITEM_BY_ID[it.type];
    if (!!def.flat !== flat) continue;
    drawItem(ctx, room, it, def, bad.has(it.id), selection === it.id);
  }
}

export function drawItem(ctx, room, it, def, isBad, selected, ghost) {
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.65;
  if (def.mount === 'wall') {
    const p = wallPoint(room, it.wall, it.offset, 0);
    ctx.fillStyle = isBad ? '#d33' : def.color; ctx.strokeStyle = '#222'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 7); ctx.fill(); ctx.stroke();
    if (def.shape === 'switch') { ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 0.8, p.y - 1.4, 1.6, 2.8); }
    ctx.restore(); return;
  }
  if (def.mount === 'ceiling') {
    ctx.translate(it.x, it.y);
    const r = def.w / 2;
    ctx.fillStyle = isBad ? '#d33' : def.color; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `${Math.max(5, r * 1.1)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText({ light: '☼', fan: '✻', alarm: def.func.includes('co') && def.func.includes('smoke') ? 'S+C' : def.func.includes('co') ? 'CO' : 'S' }[def.shape] || '', 0, 0.5);
    ctx.restore(); return;
  }
  ctx.translate(it.x, it.y); ctx.rotate((it.rot * Math.PI) / 180);
  const w = def.w; const d = def.d; const x = -w / 2; const y = -d / 2;
  ctx.fillStyle = isBad ? '#e88' : def.color; ctx.strokeStyle = isBad ? '#c22' : 'rgba(0,0,0,.5)'; ctx.lineWidth = 0.8;
  const rr = (rx, ry, rw, rh, rad) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, rad) : ctx.rect(rx, ry, rw, rh); };
  switch (def.shape) {
    case 'bed': rr(x, y, w, d, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f4efe6'; rr(x + 2, y + d * 0.28, w - 4, d * 0.7, 2); ctx.fill();
      ctx.fillStyle = '#fff'; { const pw = w > 45 ? (w - 8) / 2 : w - 6; for (let k = 0; k < (w > 45 ? 2 : 1); k++) { rr(x + 3 + k * (pw + 2), y + 3, pw, d * 0.18, 3); ctx.fill(); ctx.stroke(); } } break;
    case 'sofa': rr(x, y, w, d, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,.18)'; rr(x, y, w, d * 0.28, 3); ctx.fill(); break; // back is at -y
    case 'table': rr(x, y, w, d, 3); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.strokeRect(x + 4, y + 4, w - 8, d - 8); break;
    case 'chair': rr(x, y, w, d, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, w, d * 0.2); break;
    case 'rug': ctx.globalAlpha *= 0.85; rr(x, y, w, d, 3); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 4, y + 4, w - 8, d - 8); break;
    case 'plant': ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#3f7a3f'; ctx.beginPath(); ctx.arc(0, 0, w / 3.2, 0, 7); ctx.fill(); break;
    case 'round': ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 7); ctx.fill(); ctx.stroke(); break;
    case 'toilet': rr(x + 2, y, w - 4, d * 0.32, 3); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, y + d * 0.62, w / 2 - 2, d * 0.34, 0, 0, 7); ctx.fill(); ctx.stroke(); break;
    case 'tub': rr(x, y, w, d, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#dff1f7'; rr(x + 3, y + 3, w - 6, d - 6, 10); ctx.fill(); ctx.stroke(); break;
    case 'shower': rr(x, y, w, d, 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + d); ctx.moveTo(x + w, y); ctx.lineTo(x, y + d); ctx.stroke(); break;
    case 'sink': rr(x, y, w, d, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#eaf3f7'; rr(x + w * 0.2, y + d * 0.2, w * 0.6, d * 0.55, 6); ctx.fill(); ctx.stroke(); break;
    case 'range': rr(x, y, w, d, 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#333'; for (const [bx, by] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) { ctx.beginPath(); ctx.arc(x + w * bx, y + d * by, 3.5, 0, 7); ctx.fill(); } break;
    case 'fridge': rr(x, y, w, d, 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(x, y + d * 0.5); ctx.lineTo(x + w, y + d * 0.5); ctx.stroke(); break;
    case 'shelf': rr(x, y, w, d, 1); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + (w * k) / 4, y); ctx.lineTo(x + (w * k) / 4, y + d); ctx.stroke(); } break;
    default: rr(x, y, w, d, 2); ctx.fill(); ctx.stroke();
  }
  if (def.mount === 'floor' && !def.flat) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(-3, d / 2 - 1); ctx.lineTo(3, d / 2 - 1); ctx.lineTo(0, d / 2 - 4); ctx.fill(); } // front marker
  ctx.restore();
}

function drawLabel(ctx, room, view) {
  const ir = interior(room);
  const area = floorAreaSqFt(room);
  ctx.save(); ctx.fillStyle = 'rgba(30,30,30,.82)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fs = Math.max(7, Math.min(11, Math.min(ir.w, ir.h) / 9));
  if (fs * view.scale > 5) {
    ctx.font = `600 ${fs}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    const label = `${room.name}`; const sub = `${fmt(ir.w)} × ${fmt(ir.h)} · ${area.toFixed(0)} sf`;
    const tw = Math.max(ctx.measureText(label).width, ctx.measureText(sub).width * 0.85) + 6;
    ctx.fillRect(room.x + room.w / 2 - tw / 2, room.y + room.h / 2 - fs * 1.1, tw, fs * 2.2);
    ctx.fillStyle = 'rgba(30,30,30,.9)'; ctx.fillText(label, room.x + room.w / 2, room.y + room.h / 2 - fs * 0.4);
    ctx.font = `${fs * 0.8}px sans-serif`; ctx.fillStyle = 'rgba(30,30,30,.65)'; ctx.fillText(sub, room.x + room.w / 2, room.y + room.h / 2 + fs * 0.6);
  }
  ctx.restore();
}

function drawSelection(ctx, state, id, view) {
  for (const room of state.rooms) {
    ctx.save(); ctx.strokeStyle = '#2a7fff'; ctx.lineWidth = 2 / view.scale; ctx.setLineDash([5 / view.scale, 3 / view.scale]);
    if (room.id === id) {
      ctx.strokeRect(room.x, room.y, room.w, room.h); ctx.setLineDash([]); ctx.fillStyle = '#fff';
      for (const [hx, hy] of handles(room)) { ctx.beginPath(); ctx.rect(hx - 4 / view.scale, hy - 4 / view.scale, 8 / view.scale, 8 / view.scale); ctx.fill(); ctx.stroke(); }
    }
    const it = room.items.find((x) => x.id === id);
    if (it) {
      const def = ITEM_BY_ID[it.type];
      if (def.mount === 'floor') { const fp = footprint(it, def); ctx.strokeRect(fp.x - 1, fp.y - 1, fp.w + 2, fp.h + 2); } else if (def.mount === 'ceiling') { ctx.beginPath(); ctx.arc(it.x, it.y, def.w / 2 + 2, 0, 7); ctx.stroke(); } else { const p = wallPoint(room, it.wall, it.offset, 0); ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.stroke(); }
    }
    const o = room.openings.find((x) => x.id === id);
    if (o) { const a = wallPoint(room, o.wall, o.offset, 0); const b = wallPoint(room, o.wall, o.offset + o.width, 0); ctx.lineWidth = 3 / view.scale; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
  }
}

export const handles = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
