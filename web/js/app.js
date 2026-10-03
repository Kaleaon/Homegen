import {
  WT, WALLS, snap, wallSeg, wallLength, wallPoint, interior, footprint, floorAreaSqFt,
} from './geometry.js';
import {
  ROOM_TYPES, OPENINGS, OPENING_BY_ID, ITEMS, ITEM_BY_ID, ITEM_CATEGORIES, WALL_FINISHES, FLOOR_FINISHES,
  ROOM_KITS, ROOM_KIT_BY_ID, FURNITURE_KITS,
} from './catalog.js';
import * as M from './model.js';
import { evaluate, blockingIds, commit, commitSequence, autoComply } from './codes.js';
import { draw, drawItem, handles, fmtLen } from './render.js';
import { patternFor } from './patterns.js';
import { initView3D } from './ui3d.js';
import { exportSVG } from './svg.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#plan'); const ctx = canvas.getContext('2d');
const STORE = 'homegen.plan.v1';

let doc = M.newState();
try { const saved = localStorage.getItem(STORE); if (saved) doc = M.deserialize(saved); } catch { /* ignore corrupt/blocked storage */ }
let hist = new M.History(doc);
let report = evaluate(doc);
let view = { scale: 1.6, ox: 40, oy: 40 };
let tool = { kind: 'select' };       // select | erase | room{type} | opening{type} | item{type} | wall{id} | floor{id} | roomkit{id} | furnkit{id}
let tab = 'build';
let selection = null;
let ghostRot = 0;
let hover = null;                    // world point
let drag = null;
let preview = null;                  // {next, ok, fresh}
let paintAll = false;
let curLevel = 0;

// ------------------------------------------------------------- helpers
const toWorld = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale }; };
const roomOf = (state, id) => state.rooms.find((r) => r.id === id);
const inRect = (r, p, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const levelRooms = () => doc.rooms.filter((r) => (r.level || 0) === curLevel);
const roomAt = (p) => levelRooms().filter((r) => inRect(r, p, WT / 2)).sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;

function toast(msg, err = false, ms = 4500) {
  const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.display = 'none'; }, ms);
}

function persist() { try { localStorage.setItem(STORE, M.serialize(doc)); } catch { /* storage unavailable */ } }

function refresh() {
  report = evaluate(doc);
  renderLevels(); renderCompliance(); renderInspector(); window.__scene3d?.update(); $('#undo').disabled = !hist.canUndo(); $('#redo').disabled = !hist.canRedo();
  $('#plan-name').value = doc.name; $('#zoom-label').textContent = `${Math.round((view.scale / 1.6) * 100)}%`;
  redraw();
}

function apply(mutate, { quiet = false } = {}) {
  const r = commit(doc, mutate, { autoFix: $('#auto').checked });
  if (!r.ok) { toast(`Blocked by building code:\n• ${[...new Set(r.reasons.map((v) => v.msg))].slice(0, 4).join('\n• ')}`, true); return r; }
  doc = r.state; hist.push(doc); persist();
  if (!quiet && r.changes.length) toast(`Auto-complied (${r.changes.length}):\n• ${[...new Set(r.changes)].slice(0, 6).join('\n• ')}${r.changes.length > 6 ? '\n• …' : ''}`);
  refresh();
  return r;
}

function tryPreview(mutate) {
  const next = M.clone(doc); mutate(next);
  const base = blockingIds(doc);
  const rep = evaluate(next);
  const fresh = rep.violations.filter((v) => v.blocking && !base.has(v.id));
  return { next, ok: !fresh.length, fresh };
}

// ------------------------------------------------------------- geometry picking
function nearestWall(p, maxDist = 14, only = null) {
  let best = null;
  for (const room of only ? [only] : levelRooms()) for (const wall of WALLS) {
    const s = wallSeg(room, wall);
    const t = Math.max(0, Math.min(s.len, (p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy));
    const cx = s.ax + s.dx * t; const cy = s.ay + s.dy * t;
    const d = Math.hypot(p.x - cx, p.y - cy);
    const inside = inRect(room, p, 0) ? 0 : 1; // prefer the room the pointer is inside of
    const score = d + inside * 0.01 * 0 + (inside ? 0.3 : 0);
    if (d <= maxDist && (!best || score < best.score)) best = { room, wall, t, d, score };
  }
  return best;
}

function pickAt(p) {
  const tol = 6 / view.scale + 2;
  for (const room of levelRooms().reverse()) for (const it of [...room.items].reverse()) {
    const def = ITEM_BY_ID[it.type];
    if (def.mount === 'floor') { const fp = footprint(it, def); if (p.x >= fp.x && p.x <= fp.x + fp.w && p.y >= fp.y && p.y <= fp.y + fp.h && !def.flat) return it.id; }
    else if (def.mount === 'ceiling') { if (Math.hypot(p.x - it.x, p.y - it.y) <= def.w / 2 + 2) return it.id; }
    else { const q = wallPoint(room, it.wall, it.offset, 0); if (Math.hypot(p.x - q.x, p.y - q.y) <= 5) return it.id; }
  }
  for (const room of levelRooms()) for (const o of room.openings) {
    const a = wallPoint(room, o.wall, o.offset, 0); const b = wallPoint(room, o.wall, o.offset + o.width, 0);
    if (p.x >= Math.min(a.x, b.x) - tol && p.x <= Math.max(a.x, b.x) + tol && p.y >= Math.min(a.y, b.y) - tol && p.y <= Math.max(a.y, b.y) + tol) return o.id;
  }
  for (const room of levelRooms().reverse()) for (const it of room.items) {
    const def = ITEM_BY_ID[it.type]; if (def.flat) { const fp = footprint(it, def); if (p.x >= fp.x && p.x <= fp.x + fp.w && p.y >= fp.y && p.y <= fp.y + fp.h) return it.id; }
  }
  const r = roomAt(p); return r ? r.id : null;
}

/** Compute where an item lands for a pointer position. Returns {room, props} or null. */
function placeItem(type, p, rot = ghostRot) {
  const def = ITEM_BY_ID[type]; const room = roomAt(p); if (!room) return null;
  const ir = interior(room);
  if (def.mount === 'wall') {
    const nw = nearestWall(p, 40, room); if (!nw) return null;
    const len = wallLength(room, nw.wall);
    return { room, props: { wall: nw.wall, offset: Math.max(8, Math.min(len - 8, snap(nw.t, 2))) } };
  }
  if (def.mount === 'ceiling') return { room, props: { x: Math.max(ir.x + 6, Math.min(ir.x + ir.w - 6, snap(p.x, 6))), y: Math.max(ir.y + 6, Math.min(ir.y + ir.h - 6, snap(p.y, 6))), rot: 0 } };
  if (!def.flat) {
    // snap flush to the nearest wall face when close
    let best = null;
    for (const wall of WALLS) {
      const s = wallSeg(room, wall);
      const dist = Math.abs((p.x - s.ax - s.nx * WT / 2) * s.nx + (p.y - s.ay - s.ny * WT / 2) * s.ny);
      if (dist <= def.d / 2 + 10 && (!best || dist < best.dist)) best = { wall, dist };
    }
    if (best) {
      const horizontal = best.wall === 'N' || best.wall === 'S';
      const swap = (best.wall === 'E' || best.wall === 'W');
      const itemLen = swap ? def.d : def.w;
      const span = horizontal ? ir.w : ir.h;
      const start = horizontal ? ir.x : ir.y;
      const along = Math.max(0, Math.min(span - itemLen, snap((horizontal ? p.x : p.y) - start - itemLen / 2, 3)));
      return { room, props: M.backToWall(room, def, best.wall, along, 0) };
    }
  }
  return { room, props: { x: snap(p.x, 3), y: snap(p.y, 3), rot } };
}

function moveItemMutation(id, target) {
  return (next) => {
    const hit = M.findOwner(next, id); const it = hit.obj;
    for (const k of ['x', 'y', 'rot', 'wall', 'offset']) delete it[k];
    Object.assign(it, target.props);
    if (hit.room.id !== target.room.id) { hit.room.items = hit.room.items.filter((x) => x.id !== id); next.rooms.find((r) => r.id === target.room.id).items.push(it); }
  };
}

function snapRect(rect, ignoreId) {
  const T = 14; let { x, y } = rect;
  for (const o of levelRooms()) {
    if (o.id === ignoreId) continue;
    for (const nx of [o.x + o.w, o.x - rect.w, o.x, o.x + o.w - rect.w]) if (Math.abs(x - nx) < T) x = nx;
    for (const ny of [o.y + o.h, o.y - rect.h, o.y, o.y + o.h - rect.h]) if (Math.abs(y - ny) < T) y = ny;
  }
  return { ...rect, x, y };
}

// ------------------------------------------------------------- rendering
function resize() {
  const r = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  redraw();
}

function badIds(rep) { const s = new Set(); for (const v of rep.violations) { if (v.severity !== 'error') continue; for (const k of ['itemId', 'openingId']) if (v[k]) s.add(v[k]); } return s; }

function redraw() {
  const dpr = window.devicePixelRatio || 1;
  const state = preview ? preview.next : doc;
  const rep = preview ? evaluate(preview.next) : report;
  const bad = new Set([...badIds(rep)]);
  draw(ctx, { ...state, rooms: state.rooms.filter((r) => (r.level || 0) === curLevel) }, view, {
    dpr, bad, selection, under: curLevel > 0 ? state.rooms.filter((r) => (r.level || 0) === curLevel - 1) : [],
    overlay: (c) => drawOverlay(c, state),
  });
}

function drawOverlay(c, state) {
  // highlight rooms with blocking-free but open compliance errors with a subtle marker
  for (const v of report.violations) {
    if (v.severity !== 'error' || !v.roomId || preview) continue;
    const r = roomOf(doc, v.roomId); if (!r) continue;
  }
  const errRooms = new Set(report.violations.filter((v) => v.severity === 'error' && v.roomId).map((v) => v.roomId));
  if (!preview) for (const id of errRooms) { const r = roomOf(doc, id); c.save(); c.strokeStyle = 'rgba(196,59,59,.65)'; c.lineWidth = 2 / view.scale; c.setLineDash([6 / view.scale, 4 / view.scale]); c.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); c.restore(); }
  if (!hover && !drag) return;
  const okColor = 'rgba(47,143,91,.5)'; const badColor = 'rgba(196,59,59,.55)';
  if (drag && drag.kind === 'room-new') {
    const rc = drag.rect; c.save(); c.fillStyle = preview ? (preview.ok ? okColor : badColor) : okColor; c.fillRect(rc.x, rc.y, rc.w, rc.h);
    c.fillStyle = '#000'; c.font = '8px sans-serif'; c.textAlign = 'center'; c.fillText(`${fmtLen(rc.w)} × ${fmtLen(rc.h)}`, rc.x + rc.w / 2, rc.y + rc.h / 2); c.restore();
  }
  if (!hover) return;
  if (tool.kind === 'roomkit') {
    const kit = ROOM_KIT_BY_ID[tool.id]; const rc = snapRect({ x: snap(hover.x, 6) - kit.w / 2 + 0, y: snap(hover.y, 6) - kit.h / 2, w: kit.w, h: kit.h });
    c.save(); c.fillStyle = preview ? (preview.ok ? okColor : badColor) : okColor; c.fillRect(rc.x, rc.y, rc.w, rc.h); c.restore();
  } else if (tool.kind === 'item') {
    const def = ITEM_BY_ID[tool.id]; const pl = placeItem(tool.id, hover);
    if (pl) { const room = roomOf(preview ? preview.next : doc, pl.room.id) || pl.room; drawItem(c, room, { id: 'ghost', type: tool.id, ...pl.props }, def, preview && !preview.ok, false, true); }
  } else if (tool.kind === 'opening') {
    const nw = nearestWall(hover); if (nw) { const def = OPENING_BY_ID[tool.id]; const a = wallPoint(nw.room, nw.wall, snap(nw.t - def.w / 2, 3), 0); const b = wallPoint(nw.room, nw.wall, snap(nw.t - def.w / 2, 3) + def.w, 0); c.save(); c.strokeStyle = preview && !preview.ok ? '#c43b3b' : '#2f8f5b'; c.lineWidth = 5; c.globalAlpha = 0.7; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.restore(); }
  } else if (tool.kind === 'wall') {
    const nw = nearestWall(hover, 24); if (nw) { const targets = paintAll ? WALLS : [nw.wall]; c.save(); c.strokeStyle = '#2a7fff'; c.lineWidth = 4; c.globalAlpha = 0.7; for (const w of targets) { const a = wallPoint(nw.room, w, 0, 0); const b = wallPoint(nw.room, w, wallLength(nw.room, w), 0); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); } c.restore(); }
  } else if (tool.kind === 'floor' || tool.kind === 'furnkit') {
    const r = roomAt(hover); if (r) { c.save(); c.strokeStyle = '#2a7fff'; c.lineWidth = 3; c.strokeRect(r.x, r.y, r.w, r.h); c.restore(); }
  }
}

// ------------------------------------------------------------- compliance + inspector panels
function renderCompliance() {
  const el = $('#compliance'); const errs = report.violations.filter((v) => v.severity === 'error'); const warns = report.violations.filter((v) => v.severity !== 'error');
  const sqft = doc.rooms.reduce((a, r) => a + floorAreaSqFt(r), 0);
  const status = !doc.rooms.length ? '<span class="chip mid">Empty plan</span>' : report.compliant ? '<span class="chip ok">✔ Code compliant</span>' : `<span class="chip">${errs.length} issue${errs.length === 1 ? '' : 's'}</span>`;
  el.innerHTML = `<h3>Building code</h3><div class="score">${status}<span class="note" style="margin:0">${doc.rooms.length} rooms · ${sqft.toFixed(0)} sq ft</span></div>
    <div class="btns"><button id="fix" class="primary" ${errs.some((v) => v.fixable) ? '' : 'disabled'}>Fix automatically</button></div>
    <ul class="v">${[...errs, ...warns].map((v) => `<li class="${v.severity}" data-id="${v.id}"><b>${esc(v.msg)}</b><span class="ref">${esc(v.ref)}${v.fixable ? ' · auto-fixable' : ''}</span></li>`).join('') || (doc.rooms.length ? '<li style="border-color:var(--ok);cursor:default">No issues found.</li>' : '<li style="border-color:var(--muted);cursor:default">Place a room kit from the Kits tab to begin. Every edit is checked as you go.</li>')}</ul>
    <p class="note">Rules follow the 2021 IRC and NEC residential provisions plus marked “Practice” items. Hard rules (overlaps, room sizes, blocked doors, fixture clearances) reject the edit; everything else is auto-fixed. This is a design aid — your local authority having jurisdiction has the final say.</p>`;
  $('#fix')?.addEventListener('click', () => {
    const r = apply(() => {}, { quiet: true });
    if (r.ok) toast(r.changes.length ? `Fixed ${r.changes.length} item(s):\n• ${[...new Set(r.changes)].slice(0, 8).join('\n• ')}` : 'Nothing more can be fixed automatically — see the remaining issues.');
  });
  el.querySelectorAll('li[data-id]').forEach((li) => li.addEventListener('click', () => {
    const v = report.violations.find((x) => x.id === li.dataset.id); const id = v.itemId || v.openingId || v.roomId; if (id) { select(id); focus(id); }
  }));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function focus(id) {
  const hit = M.findOwner(doc, id); if (!hit) return;
  const r = hit.room; const rect = canvas.getBoundingClientRect(); setLevel(r.level || 0, false);
  view.ox = rect.width / 2 - (r.x + r.w / 2) * view.scale; view.oy = rect.height / 2 - (r.y + r.h / 2) * view.scale; redraw();
}

function select(id) { selection = id; renderInspector(); redraw(); }

function renderInspector() {
  const el = $('#inspector'); const hit = selection && M.findOwner(doc, selection);
  if (!hit) { el.innerHTML = '<h3>Inspector</h3><p class="note" style="margin:0">Select a room, door, window or item to edit it. Drag to move; drag room corners to resize; <b>R</b> rotates, <b>Del</b> removes.</p>'; return; }
  const { room, kind, obj } = hit;
  if (kind === 'room') {
    el.innerHTML = `<h3>${esc(room.name)}</h3>
      <div class="row"><label>Name</label><input id="i-name" value="${esc(room.name)}"></div>
      <div class="row"><label>Type</label><select id="i-type">${Object.entries(ROOM_TYPES).map(([k, v]) => `<option value="${k}" ${k === room.type ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
      <div class="row"><label>Width (ft)</label><input id="i-w" type="number" step="0.5" min="3" value="${room.w / 12}"></div>
      <div class="row"><label>Depth (ft)</label><input id="i-h" type="number" step="0.5" min="3" value="${room.h / 12}"></div>
      <div class="row"><label>Ceiling (in)</label><input id="i-ceil" type="number" step="2" value="${room.ceiling}"></div>
      <div class="btns"><button id="i-del">Delete room</button></div>`;
    $('#i-name').addEventListener('change', (e) => apply((n) => { roomOf(n, room.id).name = e.target.value || room.name; }, { quiet: true }));
    $('#i-type').addEventListener('change', (e) => apply((n) => { const r = roomOf(n, room.id); if (r.name === ROOM_TYPES[r.type].name) r.name = ROOM_TYPES[e.target.value].name; r.type = e.target.value; }));
    $('#i-w').addEventListener('change', (e) => apply((n) => { const r = roomOf(n, room.id); M.resizeRoom(r, r.x, r.y, Math.max(36, snap(e.target.value * 12)), r.h); }));
    $('#i-h').addEventListener('change', (e) => apply((n) => { const r = roomOf(n, room.id); M.resizeRoom(r, r.x, r.y, r.w, Math.max(36, snap(e.target.value * 12))); }));
    $('#i-ceil').addEventListener('change', (e) => apply((n) => { roomOf(n, room.id).ceiling = Number(e.target.value); }));
    $('#i-del').addEventListener('click', () => { apply((n) => M.removeById(n, room.id)); select(null); });
  } else {
    const def = kind === 'item' ? ITEM_BY_ID[obj.type] : OPENING_BY_ID[obj.type];
    el.innerHTML = `<h3>${esc(def.name)}</h3><p class="note" style="margin:0 0 6px">in ${esc(room.name)}</p><div class="btns">
      ${kind === 'item' && def.mount === 'floor' ? '<button id="i-rot">Rotate 90° (R)</button>' : ''}
      ${kind === 'opening' && def.kind === 'door' ? '<button id="i-swing">Flip swing</button>' : ''}
      <button id="i-del">Delete</button></div>
      ${kind === 'opening' ? `<div class="row"><label>Style</label><select id="i-otype">${OPENINGS.filter((o) => o.kind === def.kind).map((o) => `<option value="${o.id}" ${o.id === obj.type ? 'selected' : ''}>${o.name}</option>`).join('')}</select></div>` : ''}`;
    $('#i-rot')?.addEventListener('click', rotateSelected);
    $('#i-swing')?.addEventListener('click', () => apply((n) => { const o = M.findOwner(n, obj.id).obj; o.swing = o.swing === 'in' ? 'out' : 'in'; }));
    $('#i-otype')?.addEventListener('change', (e) => apply((n) => { const o = M.findOwner(n, obj.id).obj; const nd = OPENING_BY_ID[e.target.value]; o.type = nd.id; o.width = nd.w; }));
    $('#i-del').addEventListener('click', () => { apply((n) => M.removeById(n, obj.id)); select(null); });
  }
}

function rotateSelected() {
  if (!selection) { ghostRot = (ghostRot + 90) % 360; redraw(); return; }
  const hit = M.findOwner(doc, selection);
  if (hit?.kind === 'item' && ITEM_BY_ID[hit.obj.type].mount === 'floor') apply((n) => { const it = M.findOwner(n, selection).obj; it.rot = (it.rot + 90) % 360; });
}

// ------------------------------------------------------------- levels
function setLevel(l, redo = true) {
  curLevel = Math.max(0, Math.min((doc.levels || 1) - 1, l)); selection = null; preview = null;
  renderLevels(); if (redo) { renderInspector(); redraw(); window.__scene3d?.update(); }
}

function renderLevels() {
  const n = doc.levels || 1; if (curLevel >= n) curLevel = n - 1;
  const el = $('#levels');
  el.innerHTML = Array.from({ length: n }, (_, i) => `<button data-level="${i}" class="${i === curLevel ? 'on' : ''}">Floor ${i + 1}</button>`).join('')
    + '<button id="add-floor" title="Add a floor above">+ Floor</button>'
    + (n > 1 && !doc.rooms.some((r) => (r.level || 0) === n - 1) ? '<button id="del-floor" title="Remove empty top floor">− Floor</button>' : '');
  el.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => setLevel(Number(b.dataset.level))));
  $('#add-floor').addEventListener('click', () => { if ((doc.levels || 1) >= 4) return toast('Up to 4 floors are supported.', true); doc.levels = (doc.levels || 1) + 1; hist.push(doc); persist(); setLevel(doc.levels - 1); refresh(); toast(`Floor ${doc.levels} added. Place a stair room on the floor below, then use Fix automatically to add its match here.`); });
  $('#del-floor')?.addEventListener('click', () => { doc.levels -= 1; hist.push(doc); persist(); renderLevels(); setLevel(Math.min(curLevel, doc.levels - 1)); refresh(); });
}

// ------------------------------------------------------------- palette
function swatchStyle(f) {
  const t = document.createElement('canvas'); t.width = t.height = 34; const g = t.getContext('2d');
  g.scale(34 / 24, 34 / 24); g.fillStyle = patternFor(g, f); g.fillRect(0, 0, 24, 24);
  return `background-image:url(${t.toDataURL()});background-size:cover`;
}

function card(label, sub, on, attrs, swatch) {
  return `<button class="card ${on ? 'on' : ''}" ${attrs}>${swatch ? `<div class="sw" style="${swatch}"></div>` : ''}<span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
}

function renderPalette() {
  const p = $('#palette'); let h = '';
  if (tab === 'build') {
    h += '<h4>Draw a room (drag on the plan)</h4><div class="grid">' + Object.entries(ROOM_TYPES).map(([k, v]) => card(v.name, '', tool.kind === 'room' && tool.type === k, `data-tool="room" data-type="${k}"`, `background:${v.color}`)).join('') + '</div>';
    h += '<h4>Doors</h4><div class="grid">' + OPENINGS.filter((o) => o.kind === 'door').map((o) => card(o.name, '', tool.kind === 'opening' && tool.id === o.id, `data-tool="opening" data-id="${o.id}"`)).join('') + '</div>';
    h += '<h4>Windows</h4><div class="grid">' + OPENINGS.filter((o) => o.kind === 'window').map((o) => card(o.name, o.style === 'fixed' ? 'fixed' : `sill ${o.sill}"`, tool.kind === 'opening' && tool.id === o.id, `data-tool="opening" data-id="${o.id}"`)).join('') + '</div>';
  } else if (tab === 'buy') {
    for (const [cat, label] of ITEM_CATEGORIES) h += `<h4>${label}</h4><div class="grid">` + ITEMS.filter((i) => i.cat === cat).map((i) => card(i.name, i.mount === 'floor' ? `${Math.round(i.w)}×${Math.round(i.d)}"` : i.mount, tool.kind === 'item' && tool.id === i.id, `data-tool="item" data-id="${i.id}"`, `background:${i.color}`)).join('') + '</div>';
  } else if (tab === 'paint') {
    h += `<label class="toggle" style="margin:10px 0"><input type="checkbox" id="paint-all" ${paintAll ? 'checked' : ''}> Paint all walls of the room</label>`;
    h += '<h4>Wallpaper & paint (click a wall)</h4><div class="grid">' + WALL_FINISHES.map((f) => card(f.name, f.wet ? 'moisture-rated' : '', tool.kind === 'wall' && tool.id === f.id, `data-tool="wall" data-id="${f.id}"`, swatchStyle(f))).join('') + '</div>';
    h += '<h4>Flooring (click a room)</h4><div class="grid">' + FLOOR_FINISHES.map((f) => card(f.name, f.wet ? 'moisture-rated' : '', tool.kind === 'floor' && tool.id === f.id, `data-tool="floor" data-id="${f.id}"`, swatchStyle(f))).join('') + '</div>';
  } else {
    h += '<h4>Room kits (click the plan to place)</h4><div class="grid">' + ROOM_KITS.map((k) => card(k.name, ROOM_TYPES[k.type].name, tool.kind === 'roomkit' && tool.id === k.id, `data-tool="roomkit" data-id="${k.id}"`, `background:${ROOM_TYPES[k.type].color}`)).join('') + '</div>';
    h += '<h4>Furniture kits (click a room)</h4><div class="grid">' + FURNITURE_KITS.map((k) => card(k.name, `${k.items.length} pieces`, tool.kind === 'furnkit' && tool.id === k.id, `data-tool="furnkit" data-id="${k.id}"`)).join('') + '</div>';
    h += '<p class="note">Kits arrive pre-designed and then pass through the same code checks and auto-fixes as everything else.</p>';
  }
  p.innerHTML = h;
  p.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool({ kind: b.dataset.tool, type: b.dataset.type, id: b.dataset.id })));
  $('#paint-all')?.addEventListener('change', (e) => { paintAll = e.target.checked; });
}

const HINTS = {
  select: 'Click to select · drag to move · drag room corners to resize',
  erase: 'Click anything to delete it',
  room: 'Drag on the plan to draw the room',
  opening: 'Click a wall to place',
  item: 'Click to place · R rotates · items snap to walls',
  wall: 'Click a wall to apply',
  floor: 'Click a room to apply',
  roomkit: 'Click to place · kits snap to neighbouring rooms',
  furnkit: 'Click a room to furnish it',
};

function setTool(t) {
  tool = t; preview = null; drag = null;
  document.querySelectorAll('#toolbar [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t.kind));
  $('#tool-hint').textContent = HINTS[t.kind] || '';
  canvas.style.cursor = t.kind === 'select' ? 'default' : 'crosshair';
  renderPalette(); redraw();
}

// ------------------------------------------------------------- pointer interaction
function updatePreview() {
  preview = null; if (!hover || drag?.kind === 'pan') return;
  if (tool.kind === 'item') { const pl = placeItem(tool.id, hover); if (pl) preview = tryPreview((n) => M.addItem(n, roomOf(n, pl.room.id), tool.id, { ...pl.props })); }
  else if (tool.kind === 'opening') { const nw = nearestWall(hover); if (nw) { const def = OPENING_BY_ID[tool.id]; preview = tryPreview((n) => M.addOpening(n, roomOf(n, nw.room.id), tool.id, nw.wall, Math.max(0, snap(nw.t - def.w / 2, 3)))); } }
  else if (tool.kind === 'roomkit') { const kit = ROOM_KIT_BY_ID[tool.id]; const rc = snapRect({ x: snap(hover.x, 6) - kit.w / 2, y: snap(hover.y, 6) - kit.h / 2, w: kit.w, h: kit.h }); preview = tryPreview((n) => M.placeRoomKit(n, tool.id, rc.x, rc.y, curLevel)); }
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = toWorld(e); hover = p;
  if (e.button === 1 || e.button === 2 || e.shiftKey && tool.kind === 'select' && !pickAt(p) || e.altKey) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }; return; }
  switch (tool.kind) {
    case 'select': {
      const id = pickAt(p); select(id);
      if (!id) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }; break; }
      const hit = M.findOwner(doc, id);
      if (hit.kind === 'item') drag = { kind: 'item', id, moved: false };
      else if (hit.kind === 'opening') drag = { kind: 'opening', id, moved: false };
      else {
        const r = hit.room; const hs = handles(r).findIndex(([hx, hy]) => Math.hypot(hx - p.x, hy - p.y) < 8 / view.scale + 2);
        drag = hs >= 0 ? { kind: 'resize', id, corner: hs, moved: false } : { kind: 'room', id, dx: p.x - r.x, dy: p.y - r.y, moved: false };
      }
      break;
    }
    case 'erase': { const id = pickAt(p); if (id) { apply((n) => M.removeById(n, id)); if (selection === id) select(null); } break; }
    case 'room': drag = { kind: 'room-new', x0: snap(p.x, 6), y0: snap(p.y, 6), rect: { x: snap(p.x, 6), y: snap(p.y, 6), w: 0, h: 0 } }; break;
    case 'item': {
      const pl = placeItem(tool.id, p); if (!pl) { toast('Place items inside a room.', true, 2000); break; }
      const r = apply((n) => { const it = M.addItem(n, roomOf(n, pl.room.id), tool.id, { ...pl.props }); selection = it.id; }); if (!r.ok) selection = null; else renderInspector();
      break;
    }
    case 'opening': {
      const nw = nearestWall(p); if (!nw) { toast('Click on a wall.', true, 2000); break; }
      const def = OPENING_BY_ID[tool.id];
      apply((n) => M.addOpening(n, roomOf(n, nw.room.id), tool.id, nw.wall, Math.max(0, snap(nw.t - def.w / 2, 3))));
      break;
    }
    case 'wall': {
      const nw = nearestWall(p, 24); if (!nw) break;
      apply((n) => { const r = roomOf(n, nw.room.id); for (const w of paintAll ? WALLS : [nw.wall]) r.walls[w] = tool.id; });
      break;
    }
    case 'floor': { const r = roomAt(p); if (r) apply((n) => { roomOf(n, r.id).floor = tool.id; }); break; }
    case 'roomkit': {
      const kit = ROOM_KIT_BY_ID[tool.id]; const rc = snapRect({ x: snap(p.x, 6) - kit.w / 2, y: snap(p.y, 6) - kit.h / 2, w: kit.w, h: kit.h });
      apply((n) => { const r = M.placeRoomKit(n, tool.id, rc.x, rc.y, curLevel); selection = r.id; }); break;
    }
    case 'furnkit': {
      const r = roomAt(p); if (!r) { toast('Click inside a room to furnish it.', true, 2000); break; }
      const kit = FURNITURE_KITS.find((k) => k.id === tool.id);
      const walls = [...WALLS].sort((a, b) => wallLength(r, b) - wallLength(r, a)); const longest = walls[0];
      const opp = { N: 'S', S: 'N', E: 'W', W: 'E' }; const res = (w) => (w === 'longest' ? longest : w === 'opposite-longest' ? opp[longest] : w);
      const out = commitSequence(doc, kit.items.map((spec) => (n) => M.placeFromSpec(n, roomOf(n, r.id), { ...spec, wall: res(spec.wall) })), { autoFix: $('#auto').checked });
      if (out.placed) { doc = out.state; hist.push(doc); persist(); refresh(); }
      toast(`${kit.name}: placed ${out.placed} of ${kit.items.length}${out.skipped.length ? `\nSkipped (would break code or not fit): ${[...new Set(out.skipped)].slice(0, 3).join('; ')}` : ''}`, !out.placed);
      break;
    }
    default: break;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e); hover = p;
  if (drag) {
    if (drag.kind === 'pan') { view.ox = drag.ox + e.clientX - drag.sx; view.oy = drag.oy + e.clientY - drag.sy; redraw(); return; }
    drag.moved = true;
    if (drag.kind === 'item') { const it = M.findOwner(doc, drag.id).obj; const pl = placeItem(it.type, p, it.rot || 0); if (pl) { drag.target = pl; preview = tryPreview(moveItemTo(drag.id, pl)); } }
    else if (drag.kind === 'opening') {
      const { room, obj } = M.findOwner(doc, drag.id); const nw = nearestWall(p, 40, room);
      if (nw) { drag.target = { wall: nw.wall, offset: Math.max(0, snap(nw.t - obj.width / 2, 3)) }; preview = tryPreview((n) => { const o = M.findOwner(n, drag.id).obj; Object.assign(o, drag.target); }); }
    } else if (drag.kind === 'room') {
      const r = roomOf(doc, drag.id); const rc = snapRect({ x: snap(p.x - drag.dx, 6), y: snap(p.y - drag.dy, 6), w: r.w, h: r.h }, r.id);
      drag.target = rc; preview = tryPreview((n) => M.moveRoom(roomOf(n, drag.id), rc.x, rc.y));
    } else if (drag.kind === 'resize') {
      const r = roomOf(doc, drag.id); const sx = snap(p.x, 6); const sy = snap(p.y, 6);
      const right = drag.corner % 2 === 1; const bottom = drag.corner >= 2;
      const x0 = right ? r.x : Math.min(sx, r.x + r.w - 36); const y0 = bottom ? r.y : Math.min(sy, r.y + r.h - 36);
      const x1 = right ? Math.max(sx, r.x + 36) : r.x + r.w; const y1 = bottom ? Math.max(sy, r.y + 36) : r.y + r.h;
      drag.target = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      preview = tryPreview((n) => M.resizeRoom(roomOf(n, drag.id), x0, y0, x1 - x0, y1 - y0));
    } else if (drag.kind === 'room-new') {
      const x1 = snap(p.x, 6); const y1 = snap(p.y, 6);
      drag.rect = { x: Math.min(drag.x0, x1), y: Math.min(drag.y0, y1), w: Math.abs(x1 - drag.x0), h: Math.abs(y1 - drag.y0) };
      drag.rect = snapRect(drag.rect);
      preview = drag.rect.w >= 36 && drag.rect.h >= 36 ? tryPreview((n) => M.createRoom(n, tool.type, drag.rect.x, drag.rect.y, drag.rect.w, drag.rect.h, { level: curLevel })) : null;
    }
    redraw(); return;
  }
  updatePreview(); redraw();
});

function moveItemTo(id, pl) { return moveItemMutation(id, pl); }

canvas.addEventListener('pointerup', () => {
  const d = drag; drag = null;
  if (!d) return;
  if (d.kind === 'pan') return;
  const pv = preview; preview = null;
  if (d.kind === 'room-new') {
    if (d.rect.w >= 36 && d.rect.h >= 36) {
      const r = apply((n) => { const room = M.createRoom(n, tool.type, d.rect.x, d.rect.y, d.rect.w, d.rect.h, { level: curLevel }); selection = room.id; });
      if (!r.ok) selection = null;
    } else toast('Drag to size the room.', true, 1800);
    refresh(); return;
  }
  if (!d.moved || !d.target) { refresh(); return; }
  if (pv && !pv.ok) { toast(`Can't go there:\n• ${[...new Set(pv.fresh.map((v) => v.msg))].slice(0, 3).join('\n• ')}`, true); refresh(); return; }
  if (d.kind === 'item') apply(moveItemTo(d.id, d.target));
  else if (d.kind === 'opening') apply((n) => Object.assign(M.findOwner(n, d.id).obj, d.target));
  else if (d.kind === 'room') apply((n) => M.moveRoom(roomOf(n, d.id), d.target.x, d.target.y));
  else if (d.kind === 'resize') apply((n) => M.resizeRoom(roomOf(n, d.id), d.target.x, d.target.y, d.target.w, d.target.h));
});

canvas.addEventListener('pointerleave', () => { hover = null; preview = null; redraw(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top;
  zoomAt(mx, my, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

function zoomAt(mx, my, f) {
  const ns = Math.max(0.4, Math.min(8, view.scale * f));
  view.ox = mx - ((mx - view.ox) / view.scale) * ns; view.oy = my - ((my - view.oy) / view.scale) * ns; view.scale = ns;
  $('#zoom-label').textContent = `${Math.round((view.scale / 1.6) * 100)}%`; redraw();
}

function fit() {
  const r = canvas.getBoundingClientRect();
  if (!doc.rooms.length) { view = { scale: 1.6, ox: 40, oy: 40 }; return refresh(); }
  const x0 = Math.min(...doc.rooms.map((q) => q.x)); const y0 = Math.min(...doc.rooms.map((q) => q.y));
  const x1 = Math.max(...doc.rooms.map((q) => q.x + q.w)); const y1 = Math.max(...doc.rooms.map((q) => q.y + q.h));
  view.scale = Math.max(0.4, Math.min(5, Math.min((r.width - 80) / (x1 - x0), (r.height - 80) / (y1 - y0))));
  view.ox = (r.width - (x1 - x0) * view.scale) / 2 - x0 * view.scale; view.oy = (r.height - (y1 - y0) * view.scale) / 2 - y0 * view.scale;
  refresh();
}

// ------------------------------------------------------------- toolbar / keyboard / file
function setDoc(next, label) { doc = next; hist.push(doc); persist(); selection = null; refresh(); }

function sampleHome() {
  let s = M.newState(); s.name = 'Sample home'; s.levels = 2;
  const plan = [['kit_living', 0, 0, 0], ['kit_hall', 192, 0, 0], ['kit_bedroom', 240, 0, 0], ['kit_bath', 240, 144, 0], ['kit_kitchen', 0, 168, 0], ['kit_laundry', 240, 264, 0], ['kit_stairs', 192, 120, 0],
    ['kit_hall', 192, 0, 1], ['kit_bedroom', 240, 0, 1], ['kit_bedroom', 48, 0, 1], ['kit_bath', 234, 144, 1]];
  for (const [k, x, y, l] of plan) { const r = commit(s, (n) => M.placeRoomKit(n, k, x, y, l)); if (r.ok) s = r.state; }
  curLevel = 0; setDoc(s); fit(); toast(`Sample two-storey home built. ${evaluate(doc).errors === 0 ? 'Fully code-compliant.' : 'Open issues are listed on the right.'}`);
}

function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

function reportText() {
  const rep = evaluate(doc); const lines = [`# ${doc.name} — building code report`, '', `Generated ${new Date().toISOString().slice(0, 10)} · ${doc.rooms.length} rooms · ${doc.rooms.reduce((a, r) => a + floorAreaSqFt(r), 0).toFixed(0)} sq ft`, '', rep.compliant ? '**Status: no open code issues in the checked rule set.**' : `**Status: ${rep.errors} open issue(s).**`, ''];
  for (const v of rep.violations) lines.push(`- [${v.severity.toUpperCase()}] ${v.msg} _(${v.ref})_`);
  lines.push('', '## Rooms');
  for (const r of doc.rooms) { const ir = interior(r); lines.push(`- ${r.name} (${ROOM_TYPES[r.type].name}): ${fmtLen(ir.w)} × ${fmtLen(ir.h)}, ${floorAreaSqFt(r).toFixed(0)} sq ft, ceiling ${r.ceiling}"`); }
  lines.push('', '> Design aid based on the 2021 IRC and NEC residential provisions plus common practice. It is not a permit review; your local authority having jurisdiction (AHJ) governs.');
  return lines.join('\n');
}

$('#undo').addEventListener('click', () => { const s = hist.undo(); if (s) { doc = s; persist(); selection = null; refresh(); } });
$('#redo').addEventListener('click', () => { const s = hist.redo(); if (s) { doc = s; persist(); selection = null; refresh(); } });
$('#new').addEventListener('click', () => { if (!doc.rooms.length || confirm('Start a new plan? (You can undo this.)')) setDoc(M.newState()); });
$('#sample').addEventListener('click', sampleHome);
$('#save').addEventListener('click', () => download(`${doc.name.replace(/\W+/g, '_') || 'plan'}.homegen.json`, M.serialize(doc), 'application/json'));
$('#load').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { setDoc(M.deserialize(await f.text())); fit(); } catch (err) { toast(`Could not open file: ${err.message}`, true); } e.target.value = ''; });
$('#png').addEventListener('click', () => { redraw(); canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${doc.name || 'plan'}.png`; a.click(); }); });
$('#report').addEventListener('click', () => download(`${doc.name.replace(/\W+/g, '_') || 'plan'}-code-report.md`, reportText(), 'text/markdown'));

let currentSvg = '';
function updateExportPreview() {
  const sheet = $('#e-sheet')?.value || 'letter';
  const orient = $('#e-orient')?.value || 'landscape';
  const scale = $('#e-scale')?.value || 'fit';
  const lvlVal = $('#e-level')?.value || '0';
  const level = lvlVal === 'all' ? 'all' : Number(lvlVal);
  currentSvg = exportSVG(doc, { sheetSize: sheet, orientation: orient, scale, level });
  const prevEl = $('#svg-preview');
  if (prevEl) prevEl.innerHTML = currentSvg;
}

function openExportDialog() {
  const dlg = $('#dlg-export');
  if (!dlg) return;
  const levelSel = $('#e-level');
  if (levelSel) {
    const numLevels = doc.levels || 1;
    let options = Array.from({ length: numLevels }, (_, i) => `<option value="${i}">Floor ${i + 1}</option>`).join('');
    if (numLevels > 1) options += '<option value="all">All Floors</option>';
    levelSel.innerHTML = options;
    levelSel.value = String(curLevel < numLevels ? curLevel : 0);
  }
  updateExportPreview();
  dlg.showModal();
}

$('#svg-btn')?.addEventListener('click', openExportDialog);
$('#print-btn')?.addEventListener('click', openExportDialog);
$('#e-sheet')?.addEventListener('change', updateExportPreview);
$('#e-orient')?.addEventListener('change', updateExportPreview);
$('#e-scale')?.addEventListener('change', updateExportPreview);
$('#e-level')?.addEventListener('change', updateExportPreview);

$('#e-download')?.addEventListener('click', () => {
  updateExportPreview();
  download(`${doc.name.replace(/\W+/g, '_') || 'plan'}.svg`, currentSvg, 'image/svg+xml');
});

$('#e-print')?.addEventListener('click', () => {
  updateExportPreview();
  const printSheet = $('#print-sheet');
  if (printSheet) printSheet.innerHTML = currentSvg;
  window.print();
});
$('#plan-name').addEventListener('change', (e) => { doc.name = e.target.value; hist.push(doc); persist(); });
$('#zoom-in').addEventListener('click', () => { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.2); });
$('#zoom-out').addEventListener('click', () => { const r = canvas.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.2); });
$('#fit').addEventListener('click', fit);
$('#auto').addEventListener('change', (e) => { if (e.target.checked) apply(() => {}); else toast('Auto-comply is off: hard rules still block bad edits, but required items are no longer added for you.'); });
document.querySelectorAll('#toolbar [data-tool]').forEach((b) => b.addEventListener('click', () => setTool({ kind: b.dataset.tool })));
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); renderPalette(); }));

window.addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); $(e.shiftKey ? '#redo' : '#undo').click(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); $('#redo').click(); }
  else if (k === 'r') rotateSelected();
  else if (k === 'escape') { setTool({ kind: 'select' }); select(null); }
  else if (k === 'delete' || k === 'backspace') { if (selection) { const id = selection; apply((n) => M.removeById(n, id)); select(null); } }
  else if (k === 'v') setTool({ kind: 'select' });
  else if (k === 'x') setTool({ kind: 'erase' });
  else if (k === '+' || k === '=') $('#zoom-in').click();
  else if (k === '-') $('#zoom-out').click();
});

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
const view3d = initView3D({ getDoc: () => doc, getLevel: () => curLevel, getSelectedRoomId: () => { const h = selection && M.findOwner(doc, selection); return h ? h.room.id : null; }, toast, setLevel });
renderPalette(); setTool({ kind: 'select' }); resize(); refresh();
if (doc.rooms.length) fit();
// test hook for automated browser checks
window.__homegen = { view3d, setLevel, get doc() { return doc; }, get report() { return report; }, apply, sampleHome, setTool };
