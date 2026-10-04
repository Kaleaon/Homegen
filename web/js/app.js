import './k-components.js';
import {
  WT,
  WALLS,
  snap,
  wallSeg,
  wallLength,
  wallPoint,
  interior,
  footprint,
  floorAreaSqFt,
  extractRoomEdges,
  roomToPolygon,
  itemToPolygon,
} from './geometry.js';
import {
  ROOM_TYPES,
  OPENINGS,
  OPENING_BY_ID,
  ITEMS,
  ITEM_BY_ID,
  ITEM_CATEGORIES,
  WALL_FINISHES,
  FLOOR_FINISHES,
  WALL_BY_ID,
  FLOOR_BY_ID,
  ROOM_KITS,
  ROOM_KIT_BY_ID,
  FURNITURE_KITS,
  filterItems,
} from './catalog.js';
import * as M from './model.js';
import { evaluate, blockingIds, commit, commitSequence, autoComply } from './codes.js';
import { draw, drawItem, handles, fmtLen } from './render.js';
import { patternFor } from './patterns.js';
import { initView3D } from './ui3d.js';
import { exportSVG } from './svg.js';
import {
  InteractionLayer,
  getSnappedPoint,
  validatePlacement,
  createPlacementFeedback,
  buildToggleViewModel,
  SNAP_TOGGLE_DEFINITIONS,
} from '../../designer3d/tools/index.mjs';
import { generatePDF } from './pdfEngine.js';
import { ComplianceOverlayScene } from './complianceOverlay.js';
import { SnappingBridge } from './snapping-bridge.js';
import { TEMPLATES, TEMPLATE_BY_ID, renderTemplatePreviewSVG } from './templates.js';

const $ = (s) => (typeof document !== 'undefined' ? document.querySelector(s) : null);
const canvas = typeof document !== 'undefined' ? $('#plan') : null;
const ctx = canvas ? canvas.getContext('2d') : null;
const STORE = 'homegen.plan.v1';

const interaction = new InteractionLayer({
  gridSettings: {
    unitSize: 6,
    angleSnapDegrees: 15,
    magneticThreshold: 14,
    edgeThreshold: 14,
    midpointThreshold: 14,
    perpendicularThreshold: 14,
  },
  snapModes: {
    grid: true,
    edge: true,
    midpoint: false,
    perpendicular: false,
  },
});

let doc = M.newState();
try {
  const saved = localStorage.getItem(STORE);
  if (saved) doc = M.deserialize(saved);
} catch {
  /* ignore corrupt/blocked storage */
}
let hist = new M.History(doc);
let report = evaluate(doc);
const complianceScene = new ComplianceOverlayScene();
let view = { scale: 1.6, ox: 40, oy: 40 };
let tool = { kind: 'select' }; // select | erase | room{type} | opening{type} | item{type} | wall{id} | floor{id} | roomkit{id} | furnkit{id}
let tab = 'build';
let selectionSet = new Set();
let selection = null;

function isSelected(id) {
  return selectionSet.has(id);
}

function getSelectionList() {
  return Array.from(selectionSet);
}

function rectsIntersect(r1, r2) {
  return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

let ghostRot = 0;
let hover = null; // world point
let drag = null;
let preview = null; // {next, ok, fresh}
let paintScope = 'single'; // single | room | level | plan
let curLevel = 0;
let autoFixDiffs = [];
let hoveredDiffIndex = null;
let calibPoints = [];
let catalogSearchQuery = '';
let catalogMaxWidth = '';
let catalogMaxDepth = '';

const snappingBridge = new SnappingBridge({
  canvas,
  interaction,
  getRooms: () => levelRooms(),
  toWorld: (e) => toWorld(e),
  onSnap: () => {
    redraw();
  },
});

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.view === '3d') {
        snappingBridge.detach();
      } else {
        snappingBridge.attach(canvas);
      }
    });
  });
}

// ------------------------------------------------------------- helpers
const toWorld = (e) => {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - view.ox) / view.scale,
    y: (e.clientY - r.top - view.oy) / view.scale,
  };
};
const roomOf = (state, id) => state.rooms.find((r) => r.id === id);
const inRect = (r, p, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const levelRooms = () => doc.rooms.filter((r) => (r.level || 0) === curLevel);
const roomAt = (p) =>
  levelRooms()
    .filter((r) => inRect(r, p, WT / 2))
    .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;

function toast(msg, err = false, ms = 4500) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = err ? 'err' : '';
  t.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    t.style.display = 'none';
  }, ms);
}

function persist() {
  try {
    localStorage.setItem(STORE, M.serialize(doc));
  } catch {
    /* storage unavailable */
  }
}

function renderSnapToggles() {
  const container = $('#snap-toggles');
  if (!container) return;
  const viewModels = buildToggleViewModel(interaction);
  container.innerHTML = viewModels
    .map(
      (vm) =>
        `<button data-snap-id="${vm.id}" class="${vm.enabled ? 'on' : ''}" title="${esc(vm.description)}">${esc(vm.label)}</button>`
    )
    .join('');
  container.querySelectorAll('button[data-snap-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.snapId;
      const vm = viewModels.find((x) => x.id === id);
      if (vm) {
        vm.onToggle(!vm.enabled);
        renderSnapToggles();
        redraw();
      }
    });
  });
}

function renderBgToolbar() {
  const bgBar = $('#bg-toolbar');
  if (!bgBar) return;
  if (doc.background && doc.background.dataUrl) {
    bgBar.hidden = false;
    const bg = doc.background;
    const vis = $('#bg-visible');
    if (vis) vis.checked = bg.visible !== false;
    const op = $('#bg-opacity');
    if (op) op.value = bg.opacity ?? 0.5;
    const lockBtn = $('#bg-lock-btn');
    if (lockBtn) lockBtn.textContent = bg.locked ? '🔒 Locked' : '🔓 Unlocked';
  } else {
    bgBar.hidden = true;
  }
}

function refresh() {
  report = evaluate(doc);
  renderSnapToggles();
  renderLevels();
  renderCompliance();
  renderInspector();
  renderBgToolbar();
  renderDiffDrawer();
  window.__scene3d?.update();
  $('#undo').disabled = !hist.canUndo();
  $('#redo').disabled = !hist.canRedo();
  $('#plan-name').value = doc.name;
  $('#zoom-label').textContent = `${Math.round((view.scale / 1.6) * 100)}%`;
  redraw();
}

function apply(mutate, { quiet = false } = {}) {
  const r = commit(doc, mutate, { autoFix: $('#auto').checked });
  if (!r.ok) {
    toast(
      `Blocked by building code:\n• ${[...new Set(r.reasons.map((v) => v.msg))].slice(0, 4).join('\n• ')}`,
      true
    );
    return r;
  }
  doc = r.state;
  hist.push(doc);
  persist();
  autoFixDiffs = r.changes || [];
  hoveredDiffIndex = null;
  if (!quiet && r.changes.length)
    toast(
      `Auto-complied (${r.changes.length}):\n• ${[...new Set(r.changes.map((c) => c.msg || c))].slice(0, 6).join('\n• ')}${r.changes.length > 6 ? '\n• …' : ''}`
    );
  refresh();
  return r;
}

function tryPreview(mutate) {
  const next = M.clone(doc);
  mutate(next);
  const base = blockingIds(doc);
  const rep = evaluate(next);
  const fresh = rep.violations.filter((v) => v.blocking && !base.has(v.id));
  return { next, ok: !fresh.length, fresh };
}

// ------------------------------------------------------------- geometry picking
function nearestWall(p, maxDist = 14, only = null) {
  let best = null;
  for (const room of only ? [only] : levelRooms())
    for (const wall of WALLS) {
      const s = wallSeg(room, wall);
      const t = Math.max(0, Math.min(s.len, (p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy));
      const cx = s.ax + s.dx * t;
      const cy = s.ay + s.dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      const inside = inRect(room, p, 0) ? 0 : 1; // prefer the room the pointer is inside of
      const score = d + inside * 0.01 * 0 + (inside ? 0.3 : 0);
      if (d <= maxDist && (!best || score < best.score)) best = { room, wall, t, d, score };
    }
  return best;
}

function pickAt(p) {
  const tol = 6 / view.scale + 2;
  for (const room of levelRooms().reverse())
    for (const it of [...room.items].reverse()) {
      const def = ITEM_BY_ID[it.type];
      if (def.mount === 'floor') {
        const fp = footprint(it, def);
        if (p.x >= fp.x && p.x <= fp.x + fp.w && p.y >= fp.y && p.y <= fp.y + fp.h && !def.flat)
          return it.id;
      } else if (def.mount === 'ceiling') {
        if (Math.hypot(p.x - it.x, p.y - it.y) <= def.w / 2 + 2) return it.id;
      } else {
        const q = wallPoint(room, it.wall, it.offset, 0);
        if (Math.hypot(p.x - q.x, p.y - q.y) <= 5) return it.id;
      }
    }
  for (const room of levelRooms())
    for (const o of room.openings) {
      const a = wallPoint(room, o.wall, o.offset, 0);
      const b = wallPoint(room, o.wall, o.offset + o.width, 0);
      if (
        p.x >= Math.min(a.x, b.x) - tol &&
        p.x <= Math.max(a.x, b.x) + tol &&
        p.y >= Math.min(a.y, b.y) - tol &&
        p.y <= Math.max(a.y, b.y) + tol
      )
        return o.id;
    }
  for (const room of levelRooms().reverse())
    for (const it of room.items) {
      const def = ITEM_BY_ID[it.type];
      if (def.flat) {
        const fp = footprint(it, def);
        if (p.x >= fp.x && p.x <= fp.x + fp.w && p.y >= fp.y && p.y <= fp.y + fp.h) return it.id;
      }
    }
  const r = roomAt(p);
  return r ? r.id : null;
}

/** Compute where an item lands for a pointer position. Returns {room, props, feedback} or null. */
function placeItem(type, p, rot = ghostRot) {
  const def = ITEM_BY_ID[type];
  const room = roomAt(p);
  if (!room) return null;
  const ir = interior(room);

  const levelRooms = doc.rooms.filter((r) => (r.level || 0) === curLevel);
  const edges = extractRoomEdges(levelRooms);
  const existingPolygons = [];
  for (const r of levelRooms) {
    for (const it of r.items) {
      const itDef = ITEM_BY_ID[it.type];
      if (itDef) existingPolygons.push(itemToPolygon(it, itDef));
    }
  }
  const context = { edges, existingPolygons };

  if (def.mount === 'wall') {
    const nw = nearestWall(p, 40, room);
    if (!nw) return null;
    const len = wallLength(room, nw.wall);
    const rawOffset = Math.max(8, Math.min(len - 8, nw.t));
    const snappedPt = getSnappedPoint({
      point: { x: rawOffset, y: 0 },
      edges: [],
      settings: interaction.gridSettings,
      snapModes: interaction.snapModes,
    }).point;
    return {
      room,
      props: { wall: nw.wall, offset: Math.max(8, Math.min(len - 8, snap(snappedPt.x, 2))) },
    };
  }
  if (def.mount === 'ceiling') {
    const candPt = { x: p.x, y: p.y };
    const entity = {
      position: candPt,
      rotation: 0,
      polygon: [
        { x: candPt.x - 6, y: candPt.y - 6 },
        { x: candPt.x + 6, y: candPt.y - 6 },
        { x: candPt.x + 6, y: candPt.y + 6 },
        { x: candPt.x - 6, y: candPt.y + 6 },
      ],
    };
    const moveRes = interaction.moveEntity(entity, candPt, context);
    const sp = moveRes.position;
    const cx = Math.max(ir.x + 6, Math.min(ir.x + ir.w - 6, sp.x));
    const cy = Math.max(ir.y + 6, Math.min(ir.y + ir.h - 6, sp.y));
    return { room, props: { x: cx, y: cy, rot: 0 }, feedback: moveRes.placementFeedback };
  }
  if (!def.flat) {
    let best = null;
    for (const wall of WALLS) {
      const s = wallSeg(room, wall);
      const dist = Math.abs(
        (p.x - s.ax - (s.nx * WT) / 2) * s.nx + (p.y - s.ay - (s.ny * WT) / 2) * s.ny
      );
      if (dist <= def.d / 2 + 10 && (!best || dist < best.dist)) best = { wall, dist };
    }
    if (best) {
      const horizontal = best.wall === 'N' || best.wall === 'S';
      const swap = best.wall === 'E' || best.wall === 'W';
      const itemLen = swap ? def.d : def.w;
      const span = horizontal ? ir.w : ir.h;
      const start = horizontal ? ir.x : ir.y;
      const rawAlong = (horizontal ? p.x : p.y) - start - itemLen / 2;
      const snappedPt = getSnappedPoint({
        point: { x: rawAlong, y: 0 },
        edges: [],
        settings: interaction.gridSettings,
        snapModes: interaction.snapModes,
      }).point;
      const along = Math.max(0, Math.min(span - itemLen, snap(snappedPt.x, 3)));
      const props = M.backToWall(room, def, best.wall, along, 0);
      const candPoly = itemToPolygon({ ...props }, def);
      const validation = validatePlacement(candPoly, existingPolygons);
      return { room, props, feedback: createPlacementFeedback(candPoly, validation) };
    }
  }

  const candidateItem = { x: p.x, y: p.y, rot };
  const candPoly = itemToPolygon(candidateItem, def);
  const entity = { position: { x: p.x, y: p.y }, rotation: rot, polygon: candPoly };
  const moveRes = interaction.moveEntity(entity, { x: p.x, y: p.y }, context);
  return {
    room,
    props: { x: moveRes.position.x, y: moveRes.position.y, rot },
    feedback: moveRes.placementFeedback,
  };
}

function moveItemMutation(id, target) {
  return (next) => {
    const hit = M.findOwner(next, id);
    const it = hit.obj;
    for (const k of ['x', 'y', 'rot', 'wall', 'offset']) delete it[k];
    Object.assign(it, target.props);
    if (hit.room.id !== target.room.id) {
      hit.room.items = hit.room.items.filter((x) => x.id !== id);
      next.rooms.find((r) => r.id === target.room.id).items.push(it);
    }
  };
}

function snapRect(rect, ignoreId) {
  const T = 14;
  let { x, y } = rect;
  for (const o of levelRooms()) {
    if (o.id === ignoreId) continue;
    for (const nx of [o.x + o.w, o.x - rect.w, o.x, o.x + o.w - rect.w])
      if (Math.abs(x - nx) < T) x = nx;
    for (const ny of [o.y + o.h, o.y - rect.h, o.y, o.y + o.h - rect.h])
      if (Math.abs(y - ny) < T) y = ny;
  }
  return { ...rect, x, y };
}

// ------------------------------------------------------------- rendering
function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  redraw();
}

function badIds(rep) {
  const s = new Set();
  for (const v of rep.violations) {
    if (v.severity !== 'error') continue;
    for (const k of ['itemId', 'openingId']) if (v[k]) s.add(v[k]);
  }
  return s;
}

function redraw() {
  const dpr = window.devicePixelRatio || 1;
  const state = preview ? preview.next : doc;
  const rep = preview ? evaluate(preview.next) : report;
  const bad = new Set([...badIds(rep)]);
  complianceScene.update(state, rep, { curLevel, selection, drag, hover, view });
  draw(ctx, { ...state, rooms: state.rooms.filter((r) => (r.level || 0) === curLevel) }, view, {
    dpr,
    complianceScene,
    snappingBridge,
    bad,
    selection,
    under: curLevel > 0 ? state.rooms.filter((r) => (r.level || 0) === curLevel - 1) : [],
    autoFixDiffs: preview ? [] : autoFixDiffs,
    hoveredDiffIndex,
    overlay: (c) => drawOverlay(c, state),
  });
}

function drawOverlay(c, state) {
  // highlight rooms with blocking-free but open compliance errors with a subtle marker
  for (const v of report.violations) {
    if (v.severity !== 'error' || !v.roomId || preview) continue;
    const r = roomOf(doc, v.roomId);
    if (!r) continue;
  }
  const errRooms = new Set(
    report.violations.filter((v) => v.severity === 'error' && v.roomId).map((v) => v.roomId)
  );
  if (!preview)
    for (const id of errRooms) {
      const r = roomOf(doc, id);
      c.save();
      c.strokeStyle = 'rgba(196,59,59,.65)';
      c.lineWidth = 2 / view.scale;
      c.setLineDash([6 / view.scale, 4 / view.scale]);
      c.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
      c.restore();
    }

  if (preview && preview.feedback) {
    const fb = preview.feedback;
    if (fb.ghostPreview && fb.ghostPreview.length >= 3) {
      c.save();
      c.fillStyle = fb.style ? fb.style.color : preview.ok ? okColor : badColor;
      c.globalAlpha = fb.style ? fb.style.alpha : 0.35;
      c.strokeStyle = fb.style ? fb.style.outline : preview.ok ? '#22c55e' : '#ef4444';
      c.lineWidth = 2 / view.scale;
      c.beginPath();
      c.moveTo(fb.ghostPreview[0].x, fb.ghostPreview[0].y);
      for (let i = 1; i < fb.ghostPreview.length; i++) {
        c.lineTo(fb.ghostPreview[i].x, fb.ghostPreview[i].y);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
  }

  if (drag && drag.kind === 'marquee' && drag.rect) {
    const rc = drag.rect;
    c.save();
    c.fillStyle = 'rgba(42, 127, 255, 0.12)';
    c.strokeStyle = '#2a7fff';
    c.lineWidth = 1 / view.scale;
    c.setLineDash([4 / view.scale, 4 / view.scale]);
    c.fillRect(rc.x, rc.y, rc.w, rc.h);
    c.strokeRect(rc.x, rc.y, rc.w, rc.h);
    c.restore();
  }

  if (!hover && !drag) return;
  const okColor = 'rgba(47,143,91,.5)';
  const badColor = 'rgba(196,59,59,.55)';
  if (drag && drag.kind === 'room-new') {
    const rc = drag.rect;
    c.save();
    c.fillStyle = preview ? (preview.ok ? okColor : badColor) : okColor;
    c.fillRect(rc.x, rc.y, rc.w, rc.h);
    c.fillStyle = '#000';
    c.font = '8px sans-serif';
    c.textAlign = 'center';
    c.fillText(`${fmtLen(rc.w)} × ${fmtLen(rc.h)}`, rc.x + rc.w / 2, rc.y + rc.h / 2);
    c.restore();
  }
  if (!hover) return;
  if (tool.kind === 'roomkit') {
    const kit = ROOM_KIT_BY_ID[tool.id];
    const rc = snapRect({
      x: snap(hover.x, 6) - kit.w / 2 + 0,
      y: snap(hover.y, 6) - kit.h / 2,
      w: kit.w,
      h: kit.h,
    });
    c.save();
    c.fillStyle = preview ? (preview.ok ? okColor : badColor) : okColor;
    c.fillRect(rc.x, rc.y, rc.w, rc.h);
    c.restore();
  } else if (tool.kind === 'item') {
    const def = ITEM_BY_ID[tool.id];
    const pl = placeItem(tool.id, hover);
    if (pl) {
      const room = roomOf(preview ? preview.next : doc, pl.room.id) || pl.room;
      drawItem(
        c,
        room,
        { id: 'ghost', type: tool.id, ...pl.props },
        def,
        preview && !preview.ok,
        false,
        true
      );
    }
  } else if (tool.kind === 'opening') {
    const nw = nearestWall(hover);
    if (nw) {
      const def = OPENING_BY_ID[tool.id];
      const a = wallPoint(nw.room, nw.wall, snap(nw.t - def.w / 2, 3), 0);
      const b = wallPoint(nw.room, nw.wall, snap(nw.t - def.w / 2, 3) + def.w, 0);
      c.save();
      c.strokeStyle = preview && !preview.ok ? '#c43b3b' : '#2f8f5b';
      c.lineWidth = 5;
      c.globalAlpha = 0.7;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.restore();
    }
  } else if (tool.kind === 'eyedropper') {
    const nw = nearestWall(hover, 24);
    if (nw) {
      c.save();
      c.strokeStyle = '#2a7fff';
      c.lineWidth = 4;
      c.globalAlpha = 0.7;
      const a = wallPoint(nw.room, nw.wall, 0, 0);
      const b = wallPoint(nw.room, nw.wall, wallLength(nw.room, nw.wall), 0);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.restore();
    } else {
      const r = roomAt(hover);
      if (r) {
        c.save();
        c.strokeStyle = '#2a7fff';
        c.lineWidth = 3;
        c.strokeRect(r.x, r.y, r.w, r.h);
        c.restore();
      }
    }
  } else if (tool.kind === 'wall') {
    const nw = nearestWall(hover, 24);
    if (nw) {
      c.save();
      c.strokeStyle = '#2a7fff';
      c.lineWidth = 4;
      c.globalAlpha = 0.7;
      const roomsToDraw =
        paintScope === 'level' || paintScope === 'plan' ? levelRooms() : [nw.room];
      for (const rm of roomsToDraw) {
        const wallsToDraw = paintScope === 'single' && rm === nw.room ? [nw.wall] : WALLS;
        for (const w of wallsToDraw) {
          const a = wallPoint(rm, w, 0, 0);
          const b = wallPoint(rm, w, wallLength(rm, w), 0);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.stroke();
        }
      }
      c.restore();
    }
  } else if (tool.kind === 'floor' || tool.kind === 'furnkit') {
    const r = roomAt(hover);
    if (r) {
      c.save();
      c.strokeStyle = '#2a7fff';
      c.lineWidth = 3;
      if (tool.kind === 'floor' && (paintScope === 'level' || paintScope === 'plan')) {
        for (const rm of levelRooms()) c.strokeRect(rm.x, rm.y, rm.w, rm.h);
      } else {
        c.strokeRect(r.x, r.y, r.w, r.h);
      }
      c.restore();
    }
  }
  if (tool.kind === 'calibrate') {
    c.save();
    c.lineWidth = 2 / view.scale;
    const p1 = calibPoints[0];
    const p2 = calibPoints[1] || hover;
    if (p1) {
      c.strokeStyle = '#e63946';
      c.fillStyle = '#e63946';
      c.beginPath();
      c.arc(p1.x, p1.y, 6 / view.scale, 0, 7);
      c.stroke();
      c.beginPath();
      c.arc(p1.x, p1.y, 2 / view.scale, 0, 7);
      c.fill();
    }
    if (p1 && p2) {
      c.strokeStyle = '#e63946';
      c.beginPath();
      c.moveTo(p1.x, p1.y);
      c.lineTo(p2.x, p2.y);
      c.stroke();
      c.fillStyle = '#e63946';
      c.beginPath();
      c.arc(p2.x, p2.y, 6 / view.scale, 0, 7);
      c.stroke();
      c.beginPath();
      c.arc(p2.x, p2.y, 2 / view.scale, 0, 7);
      c.fill();

      const distInches = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const fs = Math.max(10, 14 / view.scale);
      c.font = `${fs}px sans-serif`;
      const txt = fmtLen(distInches);
      const tw = c.measureText(txt).width + 8 / view.scale;
      c.fillStyle = 'rgba(0,0,0,0.75)';
      c.fillRect(mx - tw / 2, my - 10 / view.scale, tw, 20 / view.scale);
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(txt, mx, my);
    }
    c.restore();
  }
}

export function renderViolationItem(v) {
  const title = v.title || v.category || v.label || 'Design Guidance';
  return `<li class="${v.severity}" data-id="${v.id}" tabindex="0"><b>${esc(title)}</b><div class="msg">${esc(v.msg)}</div><span class="ref" title="${esc(v.ref)}">${esc(v.ref)}${v.fixable ? ' · auto-fixable' : ''}</span></li>`;
}

// ------------------------------------------------------------- compliance + inspector panels
function renderCompliance() {
  const el = $('#compliance');
  const errs = report.violations.filter((v) => v.severity === 'error');
  const warns = report.violations.filter((v) => v.severity !== 'error');
  const sqft = doc.rooms.reduce((a, r) => a + floorAreaSqFt(r), 0);
  const status = !doc.rooms.length
    ? '<span class="chip mid">Empty plan</span>'
    : report.compliant
      ? '<span class="chip ok">✔ Code compliant</span>'
      : `<span class="chip">${errs.length} issue${errs.length === 1 ? '' : 's'}</span>`;
  el.innerHTML = `<h3>Building code</h3><div class="score">${status}<span class="note" style="margin:0">${doc.rooms.length} rooms · ${sqft.toFixed(0)} sq ft</span></div>
    <div class="btns"><button id="fix" class="primary" ${errs.some((v) => v.fixable) ? '' : 'disabled'}>Fix automatically</button></div>
    <ul class="v">${[...errs, ...warns].map(renderViolationItem).join('') || (doc.rooms.length ? '<li style="border-color:var(--ok);cursor:default">No issues found.</li>' : '<li style="border-color:var(--muted);cursor:default">Place a room kit from the Kits tab to begin. Every edit is checked as you go.</li>')}</ul>
    <p class="note">Rules follow the 2021 IRC and NEC residential provisions plus marked “Practice” items. Hard rules (overlaps, room sizes, blocked doors, fixture clearances) reject the edit; everything else is auto-fixed. This is a design aid — your local authority having jurisdiction has the final say.</p>`;
  $('#fix')?.addEventListener('click', () => {
    const r = apply(() => {}, { quiet: true });
    if (r.ok)
      toast(
        r.changes.length
          ? `Fixed ${r.changes.length} item(s):\n• ${[...new Set(r.changes)].slice(0, 8).join('\n• ')}`
          : 'Nothing more can be fixed automatically — see the remaining issues.'
      );
  });
  el.querySelectorAll('li[data-id]').forEach((li) => {
    li.addEventListener('click', () => {
      const v = report.violations.find((x) => x.id === li.dataset.id);
      const id = v.itemId || v.openingId || v.roomId;
      if (id) {
        select(id);
        focus(id);
      }
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        li.click();
      }
    });
  });
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

export function formRow(id, labelText, controlHtml) {
  return `<div class="row"><label for="${id}">${esc(labelText)}</label>${controlHtml}</div>`;
}

function focus(id) {
  const hit = M.findOwner(doc, id);
  if (!hit) return;
  const r = hit.room;
  const rect = canvas.getBoundingClientRect();
  setLevel(r.level || 0, false);
  view.ox = rect.width / 2 - (r.x + r.w / 2) * view.scale;
  view.oy = rect.height / 2 - (r.y + r.h / 2) * view.scale;
  redraw();
}

function select(target, { toggle = false, append = false } = {}) {
  if (!target) {
    if (!toggle && !append) selectionSet.clear();
  } else if (typeof target === 'string') {
    if (toggle) {
      if (selectionSet.has(target)) selectionSet.delete(target);
      else selectionSet.add(target);
    } else if (append) {
      selectionSet.add(target);
    } else {
      selectionSet.clear();
      selectionSet.add(target);
    }
  } else if (target instanceof Set || Array.isArray(target)) {
    const items = Array.from(target);
    if (!toggle && !append) selectionSet.clear();
    for (const id of items) {
      if (toggle) {
        if (selectionSet.has(id)) selectionSet.delete(id);
        else selectionSet.add(id);
      } else {
        selectionSet.add(id);
      }
    }
  }

  selection =
    selectionSet.size === 0
      ? null
      : selectionSet.size === 1
        ? Array.from(selectionSet)[0]
        : new Set(selectionSet);

  renderInspector();
  redraw();
}

function renderInspector() {
  const el = $('#inspector');
  if (!el) return;
  const selectedList = getSelectionList();

  if (selectedList.length === 0) {
    el.innerHTML =
      '<h3>Inspector</h3><p class="note" style="margin:0">Select a room, door, window or item to edit it. Shift-click or drag marquee to select multiple. Drag to move; drag room corners to resize; <b>R</b> rotates, <b>Del</b> removes.</p>';
    return;
  }

  if (selectedList.length > 1) {
    el.innerHTML = `<h3>${selectedList.length} elements selected</h3>
      <p class="note" style="margin:0 0 10px">Multi-selection toolbar</p>
      <div class="align-section">
        <div class="align-label">Align</div>
        <div class="align-grid">
          <button id="align-left" class="align-btn" title="Align Left">⇥ Left</button>
          <button id="align-center" class="align-btn" title="Align Horizontal Center">↔ Center</button>
          <button id="align-right" class="align-btn" title="Align Right">⇤ Right</button>
          <button id="align-top" class="align-btn" title="Align Top">⤒ Top</button>
          <button id="align-middle" class="align-btn" title="Align Vertical Middle">↕ Middle</button>
          <button id="align-bottom" class="align-btn" title="Align Bottom">⤓ Bottom</button>
        </div>
      </div>
      <div class="align-section" style="margin-top:10px">
        <div class="align-label">Distribute</div>
        <div class="align-grid">
          <button id="dist-h" class="align-btn" title="Distribute Horizontally" ${selectedList.length < 3 ? 'disabled' : ''}>Horizontal</button>
          <button id="dist-v" class="align-btn" title="Distribute Vertically" ${selectedList.length < 3 ? 'disabled' : ''}>Vertical</button>
        </div>
      </div>
      <div class="btns" style="margin-top:14px">
        <button id="i-del-all">Delete all selected</button>
      </div>`;

    $('#align-left')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'left'))
    );
    $('#align-center')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'center'))
    );
    $('#align-right')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'right'))
    );
    $('#align-top')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'top'))
    );
    $('#align-middle')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'middle'))
    );
    $('#align-bottom')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'bottom'))
    );

    $('#dist-h')?.addEventListener('click', () =>
      apply((n) => M.distributeItems(n, selectedList, 'horizontal'))
    );
    $('#dist-v')?.addEventListener('click', () =>
      apply((n) => M.distributeItems(n, selectedList, 'vertical'))
    );

    $('#i-del-all')?.addEventListener('click', () => {
      apply((n) => M.removeSet(n, selectedList));
      select(null);
    });
    return;
  }

  const singleId = selectedList[0];
  const hit = singleId && M.findOwner(doc, singleId);
  if (!hit) {
    el.innerHTML =
      '<h3>Inspector</h3><p class="note" style="margin:0">Select a room, door, window or item to edit it. Drag to move; drag room corners to resize; <b>R</b> rotates, <b>Del</b> removes.</p>';
    return;
  }
  const { room, kind, obj } = hit;
  if (kind === 'room') {
    el.innerHTML = `<h3>${esc(room.name)}</h3>
      ${formRow('i-name', 'Name', `<input id="i-name" value="${esc(room.name)}">`)}
      ${formRow(
        'i-type',
        'Type',
        `<select id="i-type">${Object.entries(ROOM_TYPES)
          .map(
            ([k, v]) =>
              `<option value="${k}" ${k === room.type ? 'selected' : ''}>${v.name}</option>`
          )
          .join('')}</select>`
      )}
      ${formRow('i-w', 'Width (ft)', `<input id="i-w" type="number" step="0.5" min="3" value="${room.w / 12}">`)}
      ${formRow('i-h', 'Depth (ft)', `<input id="i-h" type="number" step="0.5" min="3" value="${room.h / 12}">`)}
      ${formRow('i-ceil', 'Ceiling (in)', `<input id="i-ceil" type="number" step="2" value="${room.ceiling}">`)}
      <div class="btns"><button id="i-del">Delete room</button></div>`;
    $('#i-name').addEventListener('change', (e) =>
      apply(
        (n) => {
          roomOf(n, room.id).name = e.target.value || room.name;
        },
        { quiet: true }
      )
    );
    $('#i-type').addEventListener('change', (e) =>
      apply((n) => {
        const r = roomOf(n, room.id);
        if (r.name === ROOM_TYPES[r.type].name) r.name = ROOM_TYPES[e.target.value].name;
        r.type = e.target.value;
      })
    );
    $('#i-w').addEventListener('change', (e) =>
      apply((n) => {
        const r = roomOf(n, room.id);
        M.resizeRoom(r, r.x, r.y, Math.max(36, snap(e.target.value * 12)), r.h);
      })
    );
    $('#i-h').addEventListener('change', (e) =>
      apply((n) => {
        const r = roomOf(n, room.id);
        M.resizeRoom(r, r.x, r.y, r.w, Math.max(36, snap(e.target.value * 12)));
      })
    );
    $('#i-ceil').addEventListener('change', (e) =>
      apply((n) => {
        roomOf(n, room.id).ceiling = Number(e.target.value);
      })
    );
    $('#i-del').addEventListener('click', () => {
      apply((n) => M.removeById(n, room.id));
      select(null);
    });
  } else {
    const def = kind === 'item' ? ITEM_BY_ID[obj.type] : OPENING_BY_ID[obj.type];
    el.innerHTML = `<h3>${esc(def.name)}</h3><p class="note" style="margin:0 0 6px">in ${esc(room.name)}</p><div class="btns">
      ${kind === 'item' && def.mount === 'floor' ? '<button id="i-rot">Rotate 90° (R)</button>' : ''}
      ${kind === 'opening' && def.kind === 'door' ? '<button id="i-swing">Flip swing</button>' : ''}
      <button id="i-del">Delete</button></div>
      ${
        kind === 'opening'
          ? formRow(
              'i-otype',
              'Style',
              `<select id="i-otype">${OPENINGS.filter((o) => o.kind === def.kind)
                .map(
                  (o) =>
                    `<option value="${o.id}" ${o.id === obj.type ? 'selected' : ''}>${o.name}</option>`
                )
                .join('')}</select>`
            )
          : ''
      }`;
    $('#i-rot')?.addEventListener('click', rotateSelected);
    $('#i-swing')?.addEventListener('click', () =>
      apply((n) => {
        const o = M.findOwner(n, obj.id).obj;
        o.swing = o.swing === 'in' ? 'out' : 'in';
      })
    );
    $('#i-otype')?.addEventListener('change', (e) =>
      apply((n) => {
        const o = M.findOwner(n, obj.id).obj;
        const nd = OPENING_BY_ID[e.target.value];
        o.type = nd.id;
        o.width = nd.w;
      })
    );
    $('#i-del').addEventListener('click', () => {
      apply((n) => M.removeById(n, obj.id));
      select(null);
    });
  }
}

function getSelectionLabel(id = selection) {
  if (!id) return '';
  const hit = M.findOwner(doc, id);
  if (!hit) return '';
  const { room, kind, obj } = hit;
  if (kind === 'room') return `${room.name} (${ROOM_TYPES[room.type].name})`;
  if (kind === 'item') return `${ITEM_BY_ID[obj.type].name} in ${room.name}`;
  if (kind === 'opening') return `${OPENING_BY_ID[obj.type].name} in ${room.name}`;
  return '';
}

function getSpatialElements() {
  const list = [];
  for (const r of levelRooms()) {
    list.push({
      id: r.id,
      kind: 'room',
      label: `${r.name} (${ROOM_TYPES[r.type].name})`,
      center: { x: r.x + r.w / 2, y: r.y + r.h / 2 },
    });
    for (const it of r.items) {
      const def = ITEM_BY_ID[it.type];
      let center;
      if (def.mount === 'wall') center = wallPoint(r, it.wall, it.offset, 0);
      else if (def.mount === 'ceiling') center = { x: it.x, y: it.y };
      else {
        const fp = footprint(it, def);
        center = { x: fp.x + fp.w / 2, y: fp.y + fp.h / 2 };
      }
      list.push({ id: it.id, kind: 'item', label: `${def.name} in ${r.name}`, center });
    }
    for (const o of r.openings) {
      const def = OPENING_BY_ID[o.type];
      const p = wallPoint(r, o.wall, o.offset + o.width / 2, 0);
      list.push({ id: o.id, kind: 'opening', label: `${def.name} in ${r.name}`, center: p });
    }
  }
  return list;
}

function navigateSpatial(dir) {
  const elements = getSpatialElements();
  if (!elements.length) {
    toast('Plan is empty. Select a tool or kit to add items.', false, 2000);
    return;
  }
  const current = elements.find((e) => e.id === selection);
  if (!current) {
    const first = elements[0];
    select(first.id);
    focus(first.id);
    toast(`Selected ${first.label}`, false, 2000);
    return;
  }
  const candidates = elements
    .filter((e) => e.id !== current.id)
    .map((e) => {
      const dx = e.center.x - current.center.x;
      const dy = e.center.y - current.center.y;
      return { elem: e, dx, dy };
    })
    .filter(({ dx, dy }) => {
      if (dir === 'up') return dy < -2;
      if (dir === 'down') return dy > 2;
      if (dir === 'left') return dx < -2;
      if (dir === 'right') return dx > 2;
      return false;
    })
    .map((item) => {
      const { dx, dy } = item;
      const primary = dir === 'up' || dir === 'down' ? Math.abs(dy) : Math.abs(dx);
      const secondary = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      const score = primary + 1.8 * secondary;
      return { ...item, score };
    })
    .sort((a, b) => a.score - b.score);

  if (candidates.length) {
    const next = candidates[0].elem;
    select(next.id);
    focus(next.id);
    toast(`Selected ${next.label}`, false, 2000);
  } else {
    toast(`No spatial element ${dir} of current selection`, false, 1800);
  }
}

function moveSelectedSpatial(dx, dy) {
  if (!selection) {
    toast('Select an element to move using Shift+Arrow keys', true, 2000);
    return;
  }
  const hit = M.findOwner(doc, selection);
  if (!hit) return;
  const { room, kind, obj } = hit;

  if (kind === 'item') {
    const def = ITEM_BY_ID[obj.type];
    if (def.mount === 'floor' || def.mount === 'ceiling') {
      const step = 6;
      const targetP = { x: obj.x + dx * step, y: obj.y + dy * step };
      const pl = placeItem(obj.type, targetP, obj.rot || 0);
      if (pl) {
        const r = apply(moveItemMutation(selection, pl));
        if (r.ok) toast(`Moved ${def.name} in ${pl.room.name}`, false, 1800);
      }
    } else if (def.mount === 'wall') {
      const step = 6;
      const deltaOffset = (dx !== 0 ? dx : dy) * step;
      const newOffset = Math.max(8, obj.offset + deltaOffset);
      const r = apply((n) => {
        const it = M.findOwner(n, selection).obj;
        it.offset = newOffset;
      });
      if (r.ok) toast(`Moved ${def.name} along ${obj.wall} wall in ${room.name}`, false, 1800);
    }
  } else if (kind === 'opening') {
    const def = OPENING_BY_ID[obj.type];
    const step = 6;
    const deltaOffset = (dx !== 0 ? dx : dy) * step;
    const newOffset = Math.max(0, obj.offset + deltaOffset);
    const r = apply((n) => {
      const o = M.findOwner(n, selection).obj;
      o.offset = newOffset;
    });
    if (r.ok) toast(`Moved ${def.name} along ${obj.wall} wall in ${room.name}`, false, 1800);
  } else if (kind === 'room') {
    const step = 12;
    const newX = room.x + dx * step;
    const newY = room.y + dy * step;
    const r = apply((n) => M.moveRoom(roomOf(n, room.id), newX, newY));
    if (r.ok) toast(`Moved ${room.name} to ${fmtLen(newX)}, ${fmtLen(newY)}`, false, 1800);
  }
}

function rotateSelected() {
  if (!selection) {
    const currentRad = (ghostRot * Math.PI) / 180;
    const rotated = interaction.rotateEntity({ rotation: currentRad }, currentRad + Math.PI / 2);
    ghostRot = Math.round((rotated.rotation * 180) / Math.PI) % 360;
    redraw();
    toast(`Placement rotation set to ${ghostRot}°`, false, 1500);
    return;
  }
  const hit = M.findOwner(doc, selection);
  if (hit?.kind === 'item' && ITEM_BY_ID[hit.obj.type].mount === 'floor') {
    const currentRad = ((hit.obj.rot || 0) * Math.PI) / 180;
    const rotated = interaction.rotateEntity({ rotation: currentRad }, currentRad + Math.PI / 2);
    const newRot = Math.round((rotated.rotation * 180) / Math.PI) % 360;
    const r = apply((n) => {
      const it = M.findOwner(n, selection).obj;
      it.rot = newRot;
    });
    if (r.ok) toast(`Rotated ${ITEM_BY_ID[hit.obj.type].name} to ${newRot}°`, false, 1800);
  }
}

// ------------------------------------------------------------- levels
function setLevel(l, redo = true) {
  curLevel = Math.max(0, Math.min((doc.levels || 1) - 1, l));
  selection = null;
  preview = null;
  autoFixDiffs = [];
  hoveredDiffIndex = null;
  renderLevels();
  if (redo) {
    renderInspector();
    redraw();
    window.__scene3d?.update();
  }
}

function renderLevels() {
  const n = doc.levels || 1;
  if (curLevel >= n) curLevel = n - 1;
  const el = $('#levels');
  el.innerHTML =
    Array.from(
      { length: n },
      (_, i) =>
        `<button data-level="${i}" class="${i === curLevel ? 'on' : ''}">Floor ${i + 1}</button>`
    ).join('') +
    '<button id="add-floor" title="Add a floor above" aria-label="Add floor above"><span aria-hidden="true">+</span> Floor</button>' +
    (n > 1 && !doc.rooms.some((r) => (r.level || 0) === n - 1)
      ? '<button id="del-floor" title="Remove empty top floor" aria-label="Remove top floor"><span aria-hidden="true">−</span> Floor</button>'
      : '');
  el.querySelectorAll('[data-level]').forEach((b) =>
    b.addEventListener('click', () => setLevel(Number(b.dataset.level)))
  );
  $('#add-floor').addEventListener('click', () => {
    if ((doc.levels || 1) >= 4) return toast('Up to 4 floors are supported.', true);
    doc.levels = (doc.levels || 1) + 1;
    hist.push(doc);
    persist();
    setLevel(doc.levels - 1);
    refresh();
    toast(
      `Floor ${doc.levels} added. Place a stair room on the floor below, then use Fix automatically to add its match here.`
    );
  });
  $('#del-floor')?.addEventListener('click', () => {
    doc.levels -= 1;
    hist.push(doc);
    persist();
    renderLevels();
    setLevel(Math.min(curLevel, doc.levels - 1));
    refresh();
  });
}

// ------------------------------------------------------------- palette
function swatchStyle(f) {
  const t = document.createElement('canvas');
  t.width = t.height = 34;
  const g = t.getContext('2d');
  g.scale(34 / 24, 34 / 24);
  g.fillStyle = patternFor(g, f);
  g.fillRect(0, 0, 24, 24);
  return `background-image:url(${t.toDataURL()});background-size:cover`;
}

function card(label, sub, on, attrs, swatch) {
  return `<k-card class="card ${on ? 'on' : ''}" ${on ? 'active selected' : ''} ${attrs}>${swatch ? `<div class="sw" style="${swatch}"></div>` : ''}<span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</k-card>`;
}

function renderPalette() {
  const p = $('#palette');
  if (p) p.setAttribute('aria-labelledby', `tab-${tab}`);
  if (!p) return;

  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  const activeId = activeEl ? activeEl.id : null;
  let selectionStart = null;
  let selectionEnd = null;
  if (activeEl && ['catalog-search', 'catalog-max-w', 'catalog-max-d'].includes(activeId)) {
    try {
      selectionStart = activeEl.selectionStart;
      selectionEnd = activeEl.selectionEnd;
    } catch {
      /* ignore if not supported by input type */
    }
  }

  let h = '';
  if (tab === 'build') {
    h +=
      '<h4>Draw a room (drag on the plan)</h4><div class="grid">' +
      Object.entries(ROOM_TYPES)
        .map(([k, v]) =>
          card(
            v.name,
            '',
            tool.kind === 'room' && tool.type === k,
            `data-tool="room" data-type="${k}"`,
            `background:${v.color}`
          )
        )
        .join('') +
      '</div>';
    h +=
      '<h4>Doors</h4><div class="grid">' +
      OPENINGS.filter((o) => o.kind === 'door')
        .map((o) =>
          card(
            o.name,
            '',
            tool.kind === 'opening' && tool.id === o.id,
            `data-tool="opening" data-id="${o.id}"`
          )
        )
        .join('') +
      '</div>';
    h +=
      '<h4>Windows</h4><div class="grid">' +
      OPENINGS.filter((o) => o.kind === 'window')
        .map((o) =>
          card(
            o.name,
            o.style === 'fixed' ? 'fixed' : `sill ${o.sill}"`,
            tool.kind === 'opening' && tool.id === o.id,
            `data-tool="opening" data-id="${o.id}"`
          )
        )
        .join('') +
      '</div>';
  } else if (tab === 'buy') {
    h += `<div class="catalog-search-container">
      <input type="text" id="catalog-search" class="catalog-search-input" placeholder="Search furniture..." value="${esc(catalogSearchQuery)}" aria-label="Search furniture catalog">
    </div>
    <div class="catalog-filters">
      <div class="catalog-dim-group">
        <label for="catalog-max-w">Max W (in)</label>
        <input type="number" id="catalog-max-w" class="catalog-dim-input" placeholder="Any" min="0" value="${esc(catalogMaxWidth)}" aria-label="Maximum width in inches">
      </div>
      <div class="catalog-dim-group">
        <label for="catalog-max-d">Max D (in)</label>
        <input type="number" id="catalog-max-d" class="catalog-dim-input" placeholder="Any" min="0" value="${esc(catalogMaxDepth)}" aria-label="Maximum depth in inches">
      </div>
    </div>`;

    const filtered = filterItems(ITEMS, {
      query: catalogSearchQuery,
      maxW: catalogMaxWidth,
      maxD: catalogMaxDepth,
    });

    if (filtered.length === 0) {
      h += `<div class="catalog-empty">No matching items found</div>`;
    } else {
      for (const [cat, label] of ITEM_CATEGORIES) {
        const catItems = filtered.filter((i) => i.cat === cat);
        if (catItems.length === 0) continue;
        h +=
          `<h4>${label}</h4><div class="grid">` +
          catItems
            .map((i) =>
              card(
                i.name,
                i.mount === 'floor' ? `${Math.round(i.w)}×${Math.round(i.d)}"` : i.mount,
                tool.kind === 'item' && tool.id === i.id,
                `data-tool="item" data-id="${i.id}"`,
                `background:${i.color}`
              )
            )
            .join('') +
          '</div>';
      }
    }
  } else if (tab === 'paint') {
    h += `<div class="row" style="margin:8px 0 12px"><label for="paint-scope" style="width:auto;margin-right:6px;font-weight:600">Target scope</label><select id="paint-scope" style="flex:1"><option value="single" ${paintScope === 'single' ? 'selected' : ''}>Single wall / room</option><option value="room" ${paintScope === 'room' ? 'selected' : ''}>Room (all walls)</option><option value="level" ${paintScope === 'level' ? 'selected' : ''}>Level (this floor)</option><option value="plan" ${paintScope === 'plan' ? 'selected' : ''}>Plan (entire project)</option></select></div>`;
    h +=
      '<h4>Sampler</h4><div class="grid">' +
      card(
        'Eyedropper',
        'Sample wall or floor finish',
        tool.kind === 'eyedropper',
        'data-tool="eyedropper"'
      ) +
      '</div>';
    h +=
      '<h4>Wallpaper & paint (click a wall)</h4><div class="grid">' +
      WALL_FINISHES.map((f) =>
        card(
          f.name,
          f.wet ? 'moisture-rated' : '',
          tool.kind === 'wall' && tool.id === f.id,
          `data-tool="wall" data-id="${f.id}"`,
          swatchStyle(f)
        )
      ).join('') +
      '</div>';
    h +=
      '<h4>Flooring (click a room)</h4><div class="grid">' +
      FLOOR_FINISHES.map((f) =>
        card(
          f.name,
          f.wet ? 'moisture-rated' : '',
          tool.kind === 'floor' && tool.id === f.id,
          `data-tool="floor" data-id="${f.id}"`,
          swatchStyle(f)
        )
      ).join('') +
      '</div>';
  } else {
    h +=
      '<h4>Room kits (click the plan to place)</h4><div class="grid">' +
      ROOM_KITS.map((k) =>
        card(
          k.name,
          ROOM_TYPES[k.type].name,
          tool.kind === 'roomkit' && tool.id === k.id,
          `data-tool="roomkit" data-id="${k.id}"`,
          `background:${ROOM_TYPES[k.type].color}`
        )
      ).join('') +
      '</div>';
    h +=
      '<h4>Furniture kits (click a room)</h4><div class="grid">' +
      FURNITURE_KITS.map((k) =>
        card(
          k.name,
          `${k.items.length} pieces`,
          tool.kind === 'furnkit' && tool.id === k.id,
          `data-tool="furnkit" data-id="${k.id}"`
        )
      ).join('') +
      '</div>';
    h +=
      '<p class="note">Kits arrive pre-designed and then pass through the same code checks and auto-fixes as everything else.</p>';
  }
  p.innerHTML = h;
  p.querySelectorAll('[data-tool]').forEach((b) =>
    b.addEventListener('click', () =>
      setTool({ kind: b.dataset.tool, type: b.dataset.type, id: b.dataset.id })
    )
  );
  $('#paint-scope')?.addEventListener('change', (e) => {
    paintScope = e.target.value;
    redraw();
  });

  const bindCatalogInput = (id, setter) => {
    const el = $(`#${id}`);
    if (el) {
      el.addEventListener('input', (e) => {
        setter(e.target.value);
        renderPalette();
      });
    }
  };

  bindCatalogInput('catalog-search', (v) => {
    catalogSearchQuery = v;
  });
  bindCatalogInput('catalog-max-w', (v) => {
    catalogMaxWidth = v;
  });
  bindCatalogInput('catalog-max-d', (v) => {
    catalogMaxDepth = v;
  });

  if (activeId && ['catalog-search', 'catalog-max-w', 'catalog-max-d'].includes(activeId)) {
    const restoredEl = $(`#${activeId}`);
    if (restoredEl) {
      restoredEl.focus();
      if (
        selectionStart !== null &&
        selectionEnd !== null &&
        typeof restoredEl.setSelectionRange === 'function'
      ) {
        try {
          restoredEl.setSelectionRange(selectionStart, selectionEnd);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

const HINTS = {
  select: 'Click to select · drag to move · drag room corners to resize',
  erase: 'Click anything to delete it',
  eyedropper: 'Click a wall or floor to sample its finish',
  room: 'Drag on the plan to draw the room',
  opening: 'Click a wall to place',
  item: 'Click to place · R rotates · items snap to walls',
  wall: 'Click a wall to apply',
  floor: 'Click a room to apply',
  roomkit: 'Click to place · kits snap to neighbouring rooms',
  furnkit: 'Click a room to furnish it',
  calibrate: 'Click 2 points on a dimension line to calibrate scale',
};

function setTool(t) {
  tool = t;
  preview = null;
  drag = null;
  if (t.kind !== 'calibrate') calibPoints = [];
  document
    .querySelectorAll('#toolbar [data-tool]')
    .forEach((b) => b.classList.toggle('on', b.dataset.tool === t.kind));
  if ($('#tool-hint')) $('#tool-hint').textContent = HINTS[t.kind] || '';
  if (canvas) canvas.style.cursor = t.kind === 'select' ? 'default' : 'crosshair';
  renderPalette();
  redraw();
}

// ------------------------------------------------------------- pointer interaction
function updatePreview() {
  preview = null;
  if (!hover || drag?.kind === 'pan') return;
  if (tool.kind === 'item') {
    const pl = placeItem(tool.id, hover);
    if (pl) {
      preview = tryPreview((n) => M.addItem(n, roomOf(n, pl.room.id), tool.id, { ...pl.props }));
      if (pl.feedback) preview.feedback = pl.feedback;
    }
  } else if (tool.kind === 'opening') {
    const nw = nearestWall(hover);
    if (nw) {
      const def = OPENING_BY_ID[tool.id];
      preview = tryPreview((n) =>
        M.addOpening(
          n,
          roomOf(n, nw.room.id),
          tool.id,
          nw.wall,
          Math.max(0, snap(nw.t - def.w / 2, 3))
        )
      );
    }
  } else if (tool.kind === 'roomkit') {
    const kit = ROOM_KIT_BY_ID[tool.id];
    const rc = snapRect({
      x: snap(hover.x, 6) - kit.w / 2,
      y: snap(hover.y, 6) - kit.h / 2,
      w: kit.w,
      h: kit.h,
    });
    preview = tryPreview((n) => M.placeRoomKit(n, tool.id, rc.x, rc.y, curLevel));
  }
}

canvas?.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = toWorld(e);
  hover = p;
  if (e.button === 1 || e.button === 2 || e.altKey) {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
    return;
  }
  switch (tool.kind) {
    case 'select': {
      const id = pickAt(p);
      if (e.shiftKey) {
        if (id) {
          select(id, { toggle: true });
        } else {
          drag = {
            kind: 'marquee',
            x0: p.x,
            y0: p.y,
            rect: { x: p.x, y: p.y, w: 0, h: 0 },
            isShift: true,
          };
        }
        break;
      }
      if (!id) {
        if (
          doc.background &&
          doc.background.dataUrl &&
          doc.background.visible &&
          !doc.background.locked
        ) {
          drag = {
            kind: 'background',
            sx: p.x,
            sy: p.y,
            x0: doc.background.x || 0,
            y0: doc.background.y || 0,
            moved: false,
          };
        } else {
          drag = {
            kind: 'marquee',
            x0: p.x,
            y0: p.y,
            rect: { x: p.x, y: p.y, w: 0, h: 0 },
            isShift: false,
          };
        }
        break;
      }
      if (!isSelected(id)) {
        select(id);
      }
      const hit = M.findOwner(doc, id);
      if (hit.kind === 'item') {
        const selectedList = getSelectionList();
        const itemsInitial = new Map();
        for (const sId of selectedList) {
          const h = M.findOwner(doc, sId);
          if (h && (h.kind === 'item' || h.kind === 'room')) {
            const b = M.getBounds(doc, sId);
            if (b) itemsInitial.set(sId, b);
          }
        }
        drag = { kind: 'item', id, moved: false, sx: p.x, sy: p.y, itemsInitial };
      } else if (hit.kind === 'opening') {
        drag = { kind: 'opening', id, moved: false };
      } else {
        const r = hit.room;
        const hs = handles(r).findIndex(
          ([hx, hy]) => Math.hypot(hx - p.x, hy - p.y) < 8 / view.scale + 2
        );
        drag =
          hs >= 0
            ? { kind: 'resize', id, corner: hs, moved: false }
            : { kind: 'room', id, dx: p.x - r.x, dy: p.y - r.y, moved: false };
      }
      break;
    }
    case 'calibrate': {
      if (!doc.background) {
        toast('Import a blueprint image first.', true, 2000);
        break;
      }
      if (calibPoints.length === 0) {
        calibPoints.push({ x: p.x, y: p.y });
        toast('Point 1 set. Click Point 2 on the dimension line.');
        redraw();
      } else if (calibPoints.length === 1) {
        calibPoints.push({ x: p.x, y: p.y });
        redraw();
        triggerCalibrationDialog(calibPoints[0], calibPoints[1]);
      }
      break;
    }
    case 'erase': {
      const id = pickAt(p);
      if (id) {
        apply((n) => M.removeById(n, id));
        if (selection === id) select(null);
      }
      break;
    }
    case 'room':
      drag = {
        kind: 'room-new',
        x0: snap(p.x, 6),
        y0: snap(p.y, 6),
        rect: { x: snap(p.x, 6), y: snap(p.y, 6), w: 0, h: 0 },
      };
      break;
    case 'item': {
      const pl = placeItem(tool.id, p);
      if (!pl) {
        toast('Place items inside a room.', true, 2000);
        break;
      }
      const r = apply((n) => {
        const it = M.addItem(n, roomOf(n, pl.room.id), tool.id, { ...pl.props });
        selection = it.id;
      });
      if (!r.ok) selection = null;
      else renderInspector();
      break;
    }
    case 'opening': {
      const nw = nearestWall(p);
      if (!nw) {
        toast('Click on a wall.', true, 2000);
        break;
      }
      const def = OPENING_BY_ID[tool.id];
      apply((n) =>
        M.addOpening(
          n,
          roomOf(n, nw.room.id),
          tool.id,
          nw.wall,
          Math.max(0, snap(nw.t - def.w / 2, 3))
        )
      );
      break;
    }
    case 'eyedropper': {
      const sampled = M.sampleFinishAt(doc, p, curLevel, 24);
      if (sampled) {
        setTool({ kind: sampled.kind, id: sampled.finishId });
        const finishObj =
          sampled.kind === 'wall' ? WALL_BY_ID[sampled.finishId] : FLOOR_BY_ID[sampled.finishId];
        toast(`Sampled ${finishObj ? finishObj.name : sampled.finishId}`);
      }
      break;
    }
    case 'wall': {
      const nw = nearestWall(p, 24);
      if (!nw) break;
      apply((n) => {
        const r = roomOf(n, nw.room.id);
        M.applyWallFinish(n, tool.id, {
          scope: paintScope,
          room: r,
          wall: nw.wall,
          level: curLevel,
        });
      });
      break;
    }
    case 'floor': {
      const r = roomAt(p);
      if (!r) break;
      apply((n) => {
        const rm = roomOf(n, r.id);
        M.applyFloorFinish(n, tool.id, { scope: paintScope, room: rm, level: curLevel });
      });
      break;
    }
    case 'roomkit': {
      const kit = ROOM_KIT_BY_ID[tool.id];
      const rc = snapRect({
        x: snap(p.x, 6) - kit.w / 2,
        y: snap(p.y, 6) - kit.h / 2,
        w: kit.w,
        h: kit.h,
      });
      apply((n) => {
        const r = M.placeRoomKit(n, tool.id, rc.x, rc.y, curLevel);
        selection = r.id;
      });
      break;
    }
    case 'furnkit': {
      const r = roomAt(p);
      if (!r) {
        toast('Click inside a room to furnish it.', true, 2000);
        break;
      }
      const kit = FURNITURE_KITS.find((k) => k.id === tool.id);
      const walls = [...WALLS].sort((a, b) => wallLength(r, b) - wallLength(r, a));
      const longest = walls[0];
      const opp = { N: 'S', S: 'N', E: 'W', W: 'E' };
      const res = (w) => (w === 'longest' ? longest : w === 'opposite-longest' ? opp[longest] : w);
      const out = commitSequence(
        doc,
        kit.items.map(
          (spec) => (n) => M.placeFromSpec(n, roomOf(n, r.id), { ...spec, wall: res(spec.wall) })
        ),
        { autoFix: $('#auto').checked }
      );
      if (out.placed) {
        doc = out.state;
        hist.push(doc);
        persist();
        autoFixDiffs = out.changes || [];
        hoveredDiffIndex = null;
        refresh();
      }
      toast(
        `${kit.name}: placed ${out.placed} of ${kit.items.length}${out.skipped.length ? `\nSkipped (would break code or not fit): ${[...new Set(out.skipped)].slice(0, 3).join('; ')}` : ''}`,
        !out.placed
      );
      break;
    }
    default:
      break;
  }
});

canvas?.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  hover = p;
  if (drag) {
    if (drag.kind === 'pan') {
      view.ox = drag.ox + e.clientX - drag.sx;
      view.oy = drag.oy + e.clientY - drag.sy;
      redraw();
      return;
    }
    if (drag.kind === 'background') {
      drag.moved = true;
      doc.background.x = drag.x0 + (p.x - drag.sx);
      doc.background.y = drag.y0 + (p.y - drag.sy);
      redraw();
      return;
    }
    if (drag.kind === 'marquee') {
      const x0 = Math.min(drag.x0, p.x);
      const y0 = Math.min(drag.y0, p.y);
      const w = Math.abs(p.x - drag.x0);
      const h = Math.abs(p.y - drag.y0);
      drag.rect = { x: x0, y: y0, w, h };
      redraw();
      return;
    }
    drag.moved = true;
    if (drag.kind === 'item') {
      if (drag.itemsInitial && drag.itemsInitial.size > 1) {
        const dx = p.x - drag.sx;
        const dy = p.y - drag.sy;
        preview = tryPreview((n) => {
          for (const [sId, initial] of drag.itemsInitial.entries()) {
            const h = M.findOwner(n, sId);
            if (h) {
              M.setItemPosition(n, h, initial.cx + dx, initial.cy + dy);
            }
          }
        });
      } else {
        const it = M.findOwner(doc, drag.id).obj;
        const pl = placeItem(it.type, p, it.rot || 0);
        if (pl) {
          drag.target = pl;
          preview = tryPreview(moveItemTo(drag.id, pl));
        }
      }
    } else if (drag.kind === 'opening') {
      const { room, obj } = M.findOwner(doc, drag.id);
      const nw = nearestWall(p, 40, room);
      if (nw) {
        drag.target = { wall: nw.wall, offset: Math.max(0, snap(nw.t - obj.width / 2, 3)) };
        preview = tryPreview((n) => {
          const o = M.findOwner(n, drag.id).obj;
          Object.assign(o, drag.target);
        });
      }
    } else if (drag.kind === 'room') {
      const r = roomOf(doc, drag.id);
      const rc = snapRect(
        { x: snap(p.x - drag.dx, 6), y: snap(p.y - drag.dy, 6), w: r.w, h: r.h },
        r.id
      );
      drag.target = rc;
      preview = tryPreview((n) => M.moveRoom(roomOf(n, drag.id), rc.x, rc.y));
    } else if (drag.kind === 'resize') {
      const r = roomOf(doc, drag.id);
      const sx = snap(p.x, 6);
      const sy = snap(p.y, 6);
      const right = drag.corner % 2 === 1;
      const bottom = drag.corner >= 2;
      const x0 = right ? r.x : Math.min(sx, r.x + r.w - 36);
      const y0 = bottom ? r.y : Math.min(sy, r.y + r.h - 36);
      const x1 = right ? Math.max(sx, r.x + 36) : r.x + r.w;
      const y1 = bottom ? Math.max(sy, r.y + 36) : r.y + r.h;
      drag.target = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      preview = tryPreview((n) => M.resizeRoom(roomOf(n, drag.id), x0, y0, x1 - x0, y1 - y0));
    } else if (drag.kind === 'room-new') {
      const x1 = snap(p.x, 6);
      const y1 = snap(p.y, 6);
      drag.rect = {
        x: Math.min(drag.x0, x1),
        y: Math.min(drag.y0, y1),
        w: Math.abs(x1 - drag.x0),
        h: Math.abs(y1 - drag.y0),
      };
      drag.rect = snapRect(drag.rect);

      const candPoly = roomToPolygon(drag.rect);
      const existingRooms = doc.rooms.filter((r) => (r.level || 0) === curLevel).map(roomToPolygon);
      const validation = validatePlacement(candPoly, existingRooms);
      const placementFeedback = createPlacementFeedback(candPoly, validation);

      preview =
        drag.rect.w >= 36 && drag.rect.h >= 36
          ? tryPreview((n) =>
              M.createRoom(n, tool.type, drag.rect.x, drag.rect.y, drag.rect.w, drag.rect.h, {
                level: curLevel,
              })
            )
          : null;
      if (preview) preview.feedback = placementFeedback;
    }
    redraw();
    return;
  }
  updatePreview();
  redraw();
});

function moveItemTo(id, pl) {
  return moveItemMutation(id, pl);
}

canvas?.addEventListener('pointerup', () => {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.kind === 'pan') return;
  if (d.kind === 'background') {
    if (d.moved) {
      hist.push(doc);
      persist();
      refresh();
    }
    return;
  }
  if (d.kind === 'marquee') {
    if (d.rect && (d.rect.w > 2 || d.rect.h > 2)) {
      const intersected = [];
      for (const room of levelRooms()) {
        const roomBounds = M.getBounds(doc, room.id);
        if (roomBounds && rectsIntersect(roomBounds, d.rect)) intersected.push(room.id);
        for (const it of room.items) {
          const itBounds = M.getBounds(doc, it.id);
          if (itBounds && rectsIntersect(itBounds, d.rect)) intersected.push(it.id);
        }
        for (const o of room.openings) {
          const oBounds = M.getBounds(doc, o.id);
          if (oBounds && rectsIntersect(oBounds, d.rect)) intersected.push(o.id);
        }
      }
      if (d.isShift) {
        select(intersected, { append: true });
      } else {
        select(intersected);
      }
    } else {
      if (!d.isShift) select(null);
    }
    refresh();
    return;
  }
  const pv = preview;
  preview = null;
  if (d.kind === 'room-new') {
    if (d.rect.w >= 36 && d.rect.h >= 36) {
      const r = apply((n) => {
        const room = M.createRoom(n, tool.type, d.rect.x, d.rect.y, d.rect.w, d.rect.h, {
          level: curLevel,
        });
        select(room.id);
      });
      if (!r.ok) select(null);
    } else toast('Drag to size the room.', true, 1800);
    refresh();
    return;
  }
  if (!d.moved) {
    refresh();
    return;
  }
  if (pv && !pv.ok) {
    toast(
      `Can't go there:\n• ${[...new Set(pv.fresh.map((v) => v.msg))].slice(0, 3).join('\n• ')}`,
      true
    );
    refresh();
    return;
  }
  if (d.kind === 'item') {
    if (d.itemsInitial && d.itemsInitial.size > 1) {
      const dx = hover ? hover.x - d.sx : 0;
      const dy = hover ? hover.y - d.sy : 0;
      apply((n) => {
        for (const [sId, initial] of d.itemsInitial.entries()) {
          const h = M.findOwner(n, sId);
          if (h) {
            M.setItemPosition(n, h, initial.cx + dx, initial.cy + dy);
          }
        }
      });
    } else if (d.target) {
      apply(moveItemTo(d.id, d.target));
    }
  } else if (d.kind === 'opening') apply((n) => Object.assign(M.findOwner(n, d.id).obj, d.target));
  else if (d.kind === 'room') apply((n) => M.moveRoom(roomOf(n, d.id), d.target.x, d.target.y));
  else if (d.kind === 'resize')
    apply((n) => M.resizeRoom(roomOf(n, d.id), d.target.x, d.target.y, d.target.w, d.target.h));
});

canvas?.addEventListener('pointerleave', () => {
  hover = null;
  preview = null;
  redraw();
});
canvas?.addEventListener('dblclick', (e) => {
  const p = toWorld(e);
  const hitNode = complianceScene.hitTest(p, view);
  if (hitNode && (hitNode.type === 'dimensionLabel' || hitNode.type === 'constraintHandle')) {
    const r = roomOf(doc, hitNode.data.roomId);
    if (r) {
      const currentFtW = (r.w / 12).toFixed(1);
      const currentFtH = (r.h / 12).toFixed(1);
      const input = prompt(
        `Enter new dimensions for ${r.name} in feet (width × depth, e.g. "12 × 10" or width in inches "144"):`,
        `${currentFtW} × ${currentFtH}`
      );
      if (input) {
        const parts = input
          .split(/[×x,]/)
          .map((s) => parseFloat(s.trim()))
          .filter((n) => !isNaN(n) && n > 0);
        if (parts.length >= 1) {
          const newWInches = parts[0] < 30 ? Math.round(parts[0] * 12) : Math.round(parts[0]);
          const newHInches =
            parts.length >= 2
              ? parts[1] < 30
                ? Math.round(parts[1] * 12)
                : Math.round(parts[1])
              : r.h;
          apply((n) =>
            M.resizeRoom(
              roomOf(n, r.id),
              r.x,
              r.y,
              Math.max(36, newWInches),
              Math.max(36, newHInches)
            )
          );
        }
      }
    }
  }
});
canvas?.addEventListener('contextmenu', (e) => e.preventDefault());
canvas?.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    zoomAt(mx, my, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  },
  { passive: false }
);

function zoomAt(mx, my, f) {
  const ns = Math.max(0.4, Math.min(8, view.scale * f));
  view.ox = mx - ((mx - view.ox) / view.scale) * ns;
  view.oy = my - ((my - view.oy) / view.scale) * ns;
  view.scale = ns;
  $('#zoom-label').textContent = `${Math.round((view.scale / 1.6) * 100)}%`;
  redraw();
}

function fit() {
  const r = canvas.getBoundingClientRect();
  if (!doc.rooms.length) {
    view = { scale: 1.6, ox: 40, oy: 40 };
    return refresh();
  }
  const x0 = Math.min(...doc.rooms.map((q) => q.x));
  const y0 = Math.min(...doc.rooms.map((q) => q.y));
  const x1 = Math.max(...doc.rooms.map((q) => q.x + q.w));
  const y1 = Math.max(...doc.rooms.map((q) => q.y + q.h));
  view.scale = Math.max(
    0.4,
    Math.min(5, Math.min((r.width - 80) / (x1 - x0), (r.height - 80) / (y1 - y0)))
  );
  view.ox = (r.width - (x1 - x0) * view.scale) / 2 - x0 * view.scale;
  view.oy = (r.height - (y1 - y0) * view.scale) / 2 - y0 * view.scale;
  refresh();
}

// ------------------------------------------------------------- toolbar / keyboard / file
function setDoc(next, label) {
  doc = next;
  hist.push(doc);
  persist();
  curLevel = 0;
  selection = null;
  autoFixDiffs = [];
  hoveredDiffIndex = null;
  refresh();
}

function renderDiffDrawer() {
  const drawer = $('#diff-drawer');
  const countEl = $('#diff-count');
  const listEl = $('#diff-list');
  const closeBtn = $('#diff-close');

  if (!drawer || !countEl || !listEl) return;

  if (!autoFixDiffs || !autoFixDiffs.length) {
    drawer.hidden = true;
    return;
  }

  drawer.hidden = false;
  countEl.textContent = String(autoFixDiffs.length);

  listEl.innerHTML = autoFixDiffs
    .map(
      (d, i) =>
        `<li data-idx="${i}" class="${hoveredDiffIndex === i ? 'hovered' : ''}"><span class="diff-num">${i + 1}</span><span class="diff-msg">${esc(d.msg || d)}</span></li>`
    )
    .join('');

  listEl.querySelectorAll('li[data-idx]').forEach((li) => {
    const idx = Number(li.dataset.idx);
    li.addEventListener('mouseenter', () => {
      hoveredDiffIndex = idx;
      li.classList.add('hovered');
      redraw();
    });
    li.addEventListener('mouseleave', () => {
      hoveredDiffIndex = null;
      li.classList.remove('hovered');
      redraw();
    });
    li.addEventListener('click', () => {
      const d = autoFixDiffs[idx];
      if (d && d.id) {
        select(d.id);
        focus(d.id);
      }
    });
  });

  if (closeBtn) {
    closeBtn.onclick = () => {
      autoFixDiffs = [];
      hoveredDiffIndex = null;
      renderDiffDrawer();
      redraw();
    };
  }
}

function sampleHome() {
  let s = M.newState();
  s.name = 'Sample home';
  s.levels = 2;
  const plan = [
    ['kit_living', 0, 0, 0],
    ['kit_hall', 192, 0, 0],
    ['kit_bedroom', 240, 0, 0],
    ['kit_bath', 240, 144, 0],
    ['kit_kitchen', 0, 168, 0],
    ['kit_laundry', 240, 264, 0],
    ['kit_stairs', 192, 120, 0],
    ['kit_hall', 192, 0, 1],
    ['kit_bedroom', 240, 0, 1],
    ['kit_bedroom', 48, 0, 1],
    ['kit_bath', 234, 144, 1],
  ];
  for (const [k, x, y, l] of plan) {
    const r = commit(s, (n) => M.placeRoomKit(n, k, x, y, l));
    if (r.ok) s = r.state;
  }
  curLevel = 0;
  setDoc(s);
  fit();
  toast(
    `Sample two-storey home built. ${evaluate(doc).errors === 0 ? 'Fully code-compliant.' : 'Open issues are listed on the right.'}`
  );
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function reportText() {
  const rep = evaluate(doc);
  const lines = [
    `# ${doc.name} — building code report`,
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} · ${doc.rooms.length} rooms · ${doc.rooms.reduce((a, r) => a + floorAreaSqFt(r), 0).toFixed(0)} sq ft`,
    '',
    rep.compliant
      ? '**Status: no open code issues in the checked rule set.**'
      : `**Status: ${rep.errors} open issue(s).**`,
    '',
  ];
  for (const v of rep.violations)
    lines.push(`- [${v.severity.toUpperCase()}] ${v.msg} _(${v.ref})_`);
  lines.push('', '## Rooms');
  for (const r of doc.rooms) {
    const ir = interior(r);
    lines.push(
      `- ${r.name} (${ROOM_TYPES[r.type].name}): ${fmtLen(ir.w)} × ${fmtLen(ir.h)}, ${floorAreaSqFt(r).toFixed(0)} sq ft, ceiling ${r.ceiling}"`
    );
  }
  lines.push(
    '',
    '> Design aid based on the 2021 IRC and NEC residential provisions plus common practice. It is not a permit review; your local authority having jurisdiction (AHJ) governs.'
  );
  return lines.join('\n');
}

let templateTriggerEl = null;

function openTemplatePicker(triggerEl = null) {
  templateTriggerEl = triggerEl || $('#new');
  const dlg = $('#dlg-templates');
  const gallery = $('#template-gallery');
  if (!dlg || !gallery) return;

  gallery.innerHTML = TEMPLATES.map((t) => {
    const previewState = t.createState();
    const previewSvg = renderTemplatePreviewSVG(previewState);
    return `<div class="template-card" tabindex="0" role="radio" aria-checked="false" data-template-id="${t.id}">
      <div class="template-preview">${previewSvg}</div>
      <div class="template-header">
        <span class="template-title">${esc(t.title)}</span>
        <span class="template-dim">${esc(t.dimensions)}</span>
      </div>
      <p class="template-summary">${esc(t.summary)}</p>
      <button type="button" class="template-action primary">Use Template</button>
    </div>`;
  }).join('');

  gallery.querySelectorAll('.template-card').forEach((card) => {
    const templateId = card.dataset.templateId;
    const handleSelect = (e) => {
      e.preventDefault();
      selectTemplate(templateId);
    };
    card.addEventListener('click', handleSelect);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleSelect(e);
      }
    });
  });

  if (typeof dlg.showModal === 'function') {
    dlg.showModal();
    const firstCard = gallery.querySelector('.template-card');
    if (firstCard) firstCard.focus();
  }
}

function selectTemplate(templateId) {
  const template = TEMPLATE_BY_ID(templateId);
  if (!template) return;

  if (doc.rooms.length > 0) {
    if (!confirm('Start a new project? Unsaved changes in your active plan will be replaced.')) {
      return;
    }
  }

  const nextState = template.createState();
  setDoc(nextState);
  fit();
  $('#dlg-templates')?.close();
  toast(`Loaded ${template.title} starter template.`);
}

if (typeof document !== 'undefined') {
  const dlgTemplates = $('#dlg-templates');
  if (dlgTemplates) {
    dlgTemplates.addEventListener('close', () => {
      if (templateTriggerEl && typeof templateTriggerEl.focus === 'function') {
        templateTriggerEl.focus();
      }
    });
  }
}

$('#undo')?.addEventListener('click', () => {
  const s = hist.undo();
  if (s) {
    doc = s;
    persist();
    selection = null;
    autoFixDiffs = [];
    hoveredDiffIndex = null;
    refresh();
  }
});
$('#redo')?.addEventListener('click', () => {
  const s = hist.redo();
  if (s) {
    doc = s;
    persist();
    selection = null;
    autoFixDiffs = [];
    hoveredDiffIndex = null;
    refresh();
  }
});
$('#new')?.addEventListener('click', (e) => {
  openTemplatePicker(e.currentTarget);
});
$('#sample')?.addEventListener('click', sampleHome);
$('#save')?.addEventListener('click', () =>
  download(
    `${doc.name.replace(/\W+/g, '_') || 'plan'}.homegen.json`,
    M.serialize(doc),
    'application/json'
  )
);
$('#load')?.addEventListener('click', () => $('#file').click());
$('#file')?.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    setDoc(M.deserialize(await f.text()));
    fit();
  } catch (err) {
    toast(`Could not open file: ${err.message}`, true);
  }
  e.target.value = '';
});
$('#png')?.addEventListener('click', () => {
  redraw();
  canvas?.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `${doc.name || 'plan'}.png`;
    a.click();
  });
});
$('#export-pdf')?.addEventListener('click', () => {
  $('#pdf-title').value = doc.name || 'My home';
  $('#pdf-date').value = new Date().toISOString().slice(0, 10);
  const levelSelect = $('#pdf-level');
  if (levelSelect) {
    levelSelect.innerHTML = '<option value="all" selected>All levels (Multi-page)</option>';
    const maxLevel = Math.max(
      0,
      ...(doc.rooms || []).map((r) => r.level || 0),
      (doc.levels || 1) - 1
    );
    for (let l = 0; l <= maxLevel; l++) {
      const opt = document.createElement('option');
      opt.value = String(l);
      opt.textContent = `Level ${l + 1}${l === curLevel ? ' (Current)' : ''}`;
      levelSelect.appendChild(opt);
    }
  }
  $('#pdf-export')?.showModal();
});
$('#pdf-cancel')?.addEventListener('click', () => {
  $('#pdf-export')?.close();
});
$('#pdf-generate')?.addEventListener('click', () => {
  try {
    const opts = {
      pageSize: $('#pdf-size').value,
      orientation: $('#pdf-orientation').value,
      scale: $('#pdf-scale').value,
      level: $('#pdf-level').value,
      projectTitle: $('#pdf-title').value,
      designer: $('#pdf-designer').value,
      date: $('#pdf-date').value,
      sheetTitle: $('#pdf-subtitle').value,
      notes: $('#pdf-notes').value,
      includeTitleBlock: $('#pdf-tb').checked,
      includeScaleBar: $('#pdf-scalebar').checked,
      includeRoomSchedule: $('#pdf-schedule').checked,
    };
    const pdf = generatePDF(doc, opts);
    const fileName = `${(doc.name || 'plan').replace(/\W+/g, '_')}_scaled_plan.pdf`;
    pdf.save(fileName);
    $('#pdf-export')?.close();
    toast('Vector PDF sheet generated.');
  } catch (err) {
    toast(`Failed to export PDF: ${err.message}`, true);
  }
});
$('#report')?.addEventListener('click', () =>
  download(
    `${doc.name.replace(/\W+/g, '_') || 'plan'}-code-report.md`,
    reportText(),
    'text/markdown'
  )
);

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
    let options = Array.from(
      { length: numLevels },
      (_, i) => `<option value="${i}">Floor ${i + 1}</option>`
    ).join('');
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
$('#plan-name')?.addEventListener('change', (e) => {
  doc.name = e.target.value;
  hist.push(doc);
  persist();
});
$('#zoom-in')?.addEventListener('click', () => {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, 1.2);
});
$('#zoom-out')?.addEventListener('click', () => {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  zoomAt(r.width / 2, r.height / 2, 1 / 1.2);
});
$('#fit')?.addEventListener('click', fit);
$('#auto')?.addEventListener('change', (e) => {
  if (e.target.checked) apply(() => {});
  else
    toast(
      'Auto-comply is off: hard rules still block bad edits, but required items are no longer added for you.'
    );
});
if (typeof document !== 'undefined')
  document
    .querySelectorAll('#toolbar [data-tool]')
    .forEach((b) => b.addEventListener('click', () => setTool({ kind: b.dataset.tool })));
function switchTab(targetBtn, shouldFocus = false) {
  if (!targetBtn) return;
  tab = targetBtn.dataset.tab;
  const buttons = document.querySelectorAll('#tabs button, #tabs k-tab');
  buttons.forEach((x) => {
    const isSelected = x === targetBtn;
    x.classList.toggle('on', isSelected);
    if (typeof x.active !== 'undefined') x.active = isSelected;
    else if (isSelected) x.setAttribute('active', '');
    else x.removeAttribute('active');
    x.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    x.setAttribute('tabindex', isSelected ? '0' : '-1');
  });
  const palette = document.getElementById('palette');
  if (palette && targetBtn.id) {
    palette.setAttribute('aria-labelledby', targetBtn.id);
  }
  renderPalette();
  if (shouldFocus) {
    targetBtn.focus();
  }
}

if (typeof document !== 'undefined') {
  const tabsNav = document.getElementById('tabs');
  if (tabsNav) {
    const buttons = Array.from(tabsNav.querySelectorAll('button, k-tab'));
    buttons.forEach((b) => {
      b.addEventListener('click', () => switchTab(b, false));
    });

    tabsNav.addEventListener('keydown', (e) => {
      const activeElement = document.activeElement;
      const currentButtons = Array.from(tabsNav.querySelectorAll('button, k-tab'));
      const currentIndex = currentButtons.indexOf(activeElement);
      if (currentIndex === -1) return;

      let newIndex = -1;
      if (e.key === 'ArrowRight') {
        newIndex = (currentIndex + 1) % currentButtons.length;
      } else if (e.key === 'ArrowLeft') {
        newIndex = (currentIndex - 1 + currentButtons.length) % currentButtons.length;
      } else if (e.key === 'Home') {
        newIndex = 0;
      } else if (e.key === 'End') {
        newIndex = currentButtons.length - 1;
      }

      if (newIndex !== -1) {
        e.preventDefault();
        e.stopPropagation();
        switchTab(currentButtons[newIndex], true);
      }
    });
  }
}

let view3d = null;
if (typeof window !== 'undefined') {
  initCommandPaletteUI();

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    const lk = k ? k.toLowerCase() : '';

    // Cmd+K or Ctrl+K triggers Command Palette (works globally)
    if ((e.ctrlKey || e.metaKey) && lk === 'k') {
      e.preventDefault();
      const cmdDlg = $('#command-palette');
      if (cmdDlg && (cmdDlg.open || cmdDlg.hasAttribute('open'))) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
      return;
    }

    if (
      /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName) ||
      document.activeElement?.closest('#tabs')
    )
      return;

    if (k === '?') {
      e.preventDefault();
      const shortcutDlg = $('#shortcut-overlay');
      if (shortcutDlg && (shortcutDlg.open || shortcutDlg.hasAttribute('open'))) {
        closeShortcutOverlay();
      } else {
        openShortcutOverlay();
      }
      return;
    }

    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      const map = {
        ArrowUp: [0, -1, 'up'],
        ArrowDown: [0, 1, 'down'],
        ArrowLeft: [-1, 0, 'left'],
        ArrowRight: [1, 0, 'right'],
      };
      const [dx, dy, dir] = map[k];
      if (e.shiftKey) moveSelectedSpatial(dx, dy);
      else navigateSpatial(dir);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && lk === 'z') {
      e.preventDefault();
      $(e.shiftKey ? '#redo' : '#undo').click();
    } else if ((e.ctrlKey || e.metaKey) && lk === 'y') {
      e.preventDefault();
      $('#redo').click();
    } else if (lk === 'r') rotateSelected();
    else if (lk === 'escape') {
      setTool({ kind: 'select' });
      select(null);
      toast('Selection cleared', false, 1800);
    } else if (lk === 'delete' || lk === 'backspace') {
      const selectedList = getSelectionList();
      if (selectedList.length > 0) {
        const label = getSelectionLabel();
        apply((n) => M.removeSet(n, selectedList));
        select(null);
        toast(`Deleted ${label || 'selected element(s)'}`, false, 2000);
      }
    } else if (lk === 'v') setTool({ kind: 'select' });
    else if (lk === 'x') setTool({ kind: 'erase' });
    else if (lk === 'i') setTool({ kind: 'eyedropper' });
    else if (k === '+' || k === '=') $('#zoom-in').click();
    else if (k === '-') $('#zoom-out').click();
  });

  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined' && canvas) new ResizeObserver(resize).observe(canvas);
  view3d = initView3D({
    getDoc: () => doc,
    getLevel: () => curLevel,
    getSelectedRoomId: () => {
      const h = selection && M.findOwner(doc, selection);
      return h ? h.room.id : null;
    },
    toast,
    setLevel,
  });
  renderPalette();
  setTool({ kind: 'select' });
  resize();
  refresh();
  if (doc.rooms.length) fit();
}
function triggerCalibrationDialog(p1, p2) {
  const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (distPx <= 0) {
    calibPoints = [];
    toast('Invalid calibration points.', true);
    redraw();
    return;
  }
  const dlg = $('#calib-dlg');
  const input = $('#calib-distance');
  if (input) input.value = fmtLen(distPx);
  if (dlg && typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    const str = prompt('Enter real-world distance (e.g. 10 ft, 120 in, 10\' 6"):', fmtLen(distPx));
    applyCalibration(p1, p2, distPx, str);
  }
}

function applyCalibration(p1, p2, distPx, valStr) {
  const targetInches = M.parseDistanceInInches(valStr);
  if (!targetInches || targetInches <= 0) {
    toast('Invalid distance entered. Calibration cancelled.', true);
    calibPoints = [];
    setTool({ kind: 'select' });
    redraw();
    return;
  }
  if (!doc.background) return;
  const factor = targetInches / distPx;
  const bg = doc.background;
  bg.scale = (bg.scale || 1) * factor;
  bg.x = p1.x - (p1.x - (bg.x || 0)) * factor;
  bg.y = p1.y - (p1.y - (bg.y || 0)) * factor;
  hist.push(doc);
  persist();
  calibPoints = [];
  setTool({ kind: 'select' });
  refresh();
  toast(`Blueprint scale calibrated (${fmtLen(targetInches)}).`);
}

function handleBlueprintImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      let finalDataUrl = dataUrl;
      let w = img.width;
      let h = img.height;
      const MAX_DIM = 2048;
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const cctx = cv.getContext('2d');
        cctx.drawImage(img, 0, 0, w, h);
        finalDataUrl = cv.toDataURL('image/jpeg', 0.85);
      }
      doc.background = {
        dataUrl: finalDataUrl,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 0.5,
        visible: true,
        locked: false,
        width: w,
        height: h,
      };
      hist.push(doc);
      persist();
      calibPoints = [];
      setTool({ kind: 'calibrate' });
      refresh();
      toast(
        'Blueprint image imported. Click 2 points on a known dimension line to calibrate scale.'
      );
    };
    img.onerror = () => toast('Failed to load blueprint image.', true);
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

$('#import-blueprint')?.addEventListener('click', () => $('#blueprint-file')?.click());
$('#blueprint-file')?.addEventListener('change', (e) => {
  handleBlueprintImport(e.target.files[0]);
  e.target.value = '';
});
$('#bg-visible')?.addEventListener('change', (e) => {
  if (doc.background) {
    doc.background.visible = e.target.checked;
    hist.push(doc);
    persist();
    redraw();
  }
});
$('#bg-opacity')?.addEventListener('input', (e) => {
  if (doc.background) {
    doc.background.opacity = parseFloat(e.target.value);
    hist.push(doc);
    persist();
    redraw();
  }
});
$('#bg-lock-btn')?.addEventListener('click', () => {
  if (doc.background) {
    doc.background.locked = !doc.background.locked;
    hist.push(doc);
    persist();
    refresh();
  }
});
$('#bg-calibrate-btn')?.addEventListener('click', () => {
  calibPoints = [];
  setTool({ kind: 'calibrate' });
});
$('#bg-remove-btn')?.addEventListener('click', () => {
  if (confirm('Remove blueprint image?')) {
    doc.background = null;
    hist.push(doc);
    persist();
    setTool({ kind: 'select' });
    refresh();
    toast('Blueprint removed.');
  }
});

$('#calib-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const valStr = $('#calib-distance')?.value;
  $('#calib-dlg')?.close();
  if (calibPoints.length === 2) {
    const distPx = Math.hypot(
      calibPoints[1].x - calibPoints[0].x,
      calibPoints[1].y - calibPoints[0].y
    );
    applyCalibration(calibPoints[0], calibPoints[1], distPx, valStr);
  }
});
$('#calib-cancel')?.addEventListener('click', () => {
  $('#calib-dlg')?.close();
  calibPoints = [];
  setTool({ kind: 'select' });
  refresh();
});
$('#calib-close')?.addEventListener('click', () => {
  $('#calib-dlg')?.close();
  calibPoints = [];
  setTool({ kind: 'select' });
  refresh();
});

// ------------------------------------------------------------- Command Palette & Shortcut Overlay
let selectedCmdIndex = 0;
let filteredCommands = [];

const COMMAND_REGISTRY = [
  // Tools
  { id: 'tool-select', name: 'Select Tool', category: 'Tools', shortcut: 'V', action: () => setTool({ kind: 'select' }) },
  { id: 'tool-eyedropper', name: 'Eyedropper Tool', category: 'Tools', shortcut: 'I', action: () => setTool({ kind: 'eyedropper' }) },
  { id: 'tool-erase', name: 'Erase Tool', category: 'Tools', shortcut: 'X', action: () => setTool({ kind: 'erase' }) },

  // Views
  { id: 'view-2d', name: '2D Plan View', category: 'Views', shortcut: '', action: () => $('#toolbar [data-view="2d"]')?.click() },
  { id: 'view-3d', name: '3D View', category: 'Views', shortcut: '', action: () => $('#toolbar [data-view="3d"]')?.click() },
  { id: 'view-eye', name: 'Eye Level View', category: 'Views', shortcut: '', action: () => $('#o-eye')?.click() },
  { id: 'view-reset', name: 'Reset 3D View', category: 'Views', shortcut: '', action: () => $('#o-reset')?.click() },
  { id: 'view-photo', name: 'Photoreal Render', category: 'Views', shortcut: '', action: () => $('#o-photo')?.click() },
  { id: 'view-zoom-in', name: 'Zoom In', category: 'Views', shortcut: '+', action: () => $('#zoom-in')?.click() },
  { id: 'view-zoom-out', name: 'Zoom Out', category: 'Views', shortcut: '-', action: () => $('#zoom-out')?.click() },
  { id: 'view-fit', name: 'Fit View to Screen', category: 'Views', shortcut: '', action: () => $('#fit')?.click() },

  // Sidebar Tabs
  { id: 'tab-build', name: 'Build Tab', category: 'Sidebar Tabs', shortcut: '', action: () => $('#tabs [data-tab="build"]')?.click() },
  { id: 'tab-buy', name: 'Buy Tab', category: 'Sidebar Tabs', shortcut: '', action: () => $('#tabs [data-tab="buy"]')?.click() },
  { id: 'tab-paint', name: 'Paint Tab', category: 'Sidebar Tabs', shortcut: '', action: () => $('#tabs [data-tab="paint"]')?.click() },
  { id: 'tab-kits', name: 'Kits Tab', category: 'Sidebar Tabs', shortcut: '', action: () => $('#tabs [data-tab="kits"]')?.click() },

  // File Operations
  { id: 'file-new', name: 'New Plan', category: 'File Operations', shortcut: '', action: () => $('#new')?.click() },
  { id: 'file-sample', name: 'Sample Home', category: 'File Operations', shortcut: '', action: () => $('#sample')?.click() },
  { id: 'file-save', name: 'Save Plan', category: 'File Operations', shortcut: '', action: () => $('#save')?.click() },
  { id: 'file-load', name: 'Open Plan', category: 'File Operations', shortcut: '', action: () => $('#load')?.click() },
  { id: 'file-import-bp', name: 'Import Blueprint Image', category: 'File Operations', shortcut: '', action: () => $('#import-blueprint')?.click() },
  { id: 'file-undo', name: 'Undo Action', category: 'File Operations', shortcut: 'Ctrl+Z', action: () => $('#undo')?.click() },
  { id: 'file-redo', name: 'Redo Action', category: 'File Operations', shortcut: 'Ctrl+Y', action: () => $('#redo')?.click() },

  // Export
  { id: 'export-png', name: 'Export PNG Image', category: 'Export', shortcut: '', action: () => $('#png')?.click() },
  { id: 'export-svg', name: 'Export SVG Vector Sheet', category: 'Export', shortcut: '', action: () => $('#svg-btn')?.click() },
  { id: 'print-sheet', name: 'Print Sheet', category: 'Export', shortcut: '', action: () => $('#print-btn')?.click() },
  { id: 'export-pdf', name: 'Export Scaled Vector PDF', category: 'Export', shortcut: '', action: () => $('#export-pdf')?.click() },
  { id: 'export-report', name: 'Code Compliance Report', category: 'Export', shortcut: '', action: () => $('#report')?.click() },

  // Help & Settings
  { id: 'help-shortcuts', name: 'Keyboard Shortcuts Cheat Sheet', category: 'Help', shortcut: '?', action: () => openShortcutOverlay() },
  { id: 'setting-autocomply', name: 'Toggle Auto-Comply', category: 'Settings', shortcut: '', action: () => $('#auto')?.click() },
];

function openCommandPalette() {
  const dlg = $('#command-palette');
  if (!dlg) return;
  const input = $('#cmd-search');
  selectedCmdIndex = 0;
  if (input) input.value = '';
  renderCommandList('');
  if (typeof dlg.showModal === 'function') {
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  } else {
    dlg.setAttribute('open', '');
  }
  dlg.open = true;
  if (input) input.focus();
}

function closeCommandPalette() {
  const dlg = $('#command-palette');
  if (!dlg) return;
  if (typeof dlg.close === 'function') {
    try { dlg.close(); } catch { dlg.removeAttribute('open'); }
  } else {
    dlg.removeAttribute('open');
  }
  dlg.open = false;
}

function openShortcutOverlay() {
  const dlg = $('#shortcut-overlay');
  if (!dlg) return;
  if (typeof dlg.showModal === 'function') {
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  } else {
    dlg.setAttribute('open', '');
  }
  dlg.open = true;
}

function closeShortcutOverlay() {
  const dlg = $('#shortcut-overlay');
  if (!dlg) return;
  if (typeof dlg.close === 'function') {
    try { dlg.close(); } catch { dlg.removeAttribute('open'); }
  } else {
    dlg.removeAttribute('open');
  }
  dlg.open = false;
}

function renderCommandList(query = '') {
  const listEl = $('#cmd-list');
  if (!listEl) return;
  const q = query.trim().toLowerCase();
  filteredCommands = COMMAND_REGISTRY.filter((cmd) => {
    if (!q) return true;
    return (
      cmd.name.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
    );
  });

  if (selectedCmdIndex >= filteredCommands.length) {
    selectedCmdIndex = Math.max(0, filteredCommands.length - 1);
  }

  if (filteredCommands.length === 0) {
    listEl.innerHTML = `<li class="cmd-no-results">No matching commands found</li>`;
    return;
  }

  listEl.innerHTML = filteredCommands
    .map((cmd, idx) => {
      const isSelected = idx === selectedCmdIndex;
      const kbdHtml = cmd.shortcut
        ? `<span class="keys"><kbd>${esc(cmd.shortcut)}</kbd></span>`
        : '';
      return `<li data-cmd-idx="${idx}" class="${isSelected ? 'selected' : ''}" role="option" aria-selected="${isSelected ? 'true' : 'false'}">
        <div class="cmd-item-main">
          <span class="cmd-name">${esc(cmd.name)}</span>
          <span class="cmd-category">${esc(cmd.category)}</span>
        </div>
        ${kbdHtml}
      </li>`;
    })
    .join('');

  listEl.querySelectorAll('li[data-cmd-idx]').forEach((li) => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.cmdIdx, 10);
      if (filteredCommands[idx]) {
        closeCommandPalette();
        filteredCommands[idx].action();
      }
    });
  });

  const activeLi = listEl.querySelector('li.selected');
  if (activeLi && typeof activeLi.scrollIntoView === 'function') {
    activeLi.scrollIntoView({ block: 'nearest' });
  }
}

function initCommandPaletteUI() {
  const searchInput = $('#cmd-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      selectedCmdIndex = 0;
      renderCommandList(e.target.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          selectedCmdIndex = (selectedCmdIndex + 1) % filteredCommands.length;
          renderCommandList(searchInput.value);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredCommands.length > 0) {
          selectedCmdIndex =
            (selectedCmdIndex - 1 + filteredCommands.length) % filteredCommands.length;
          renderCommandList(searchInput.value);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands.length > 0 && filteredCommands[selectedCmdIndex]) {
          const cmd = filteredCommands[selectedCmdIndex];
          closeCommandPalette();
          cmd.action();
        }
      }
    });
  }
}

// test hook for automated browser checks
if (typeof window !== 'undefined')
  window.__homegen = {
    view3d,
    setLevel,
    formRow,
    get doc() {
      return doc;
    },
    get report() {
      return report;
    },
    apply,
    sampleHome,
    openTemplatePicker,
    selectTemplate,
    TEMPLATES,
    setTool,
    select,
    isSelected,
    getSelectionList,
    navigateSpatial,
    moveSelectedSpatial,
    getSpatialElements,
    interaction,
    generatePDF,
    applyCalibration,
    handleBlueprintImport,
    renderCompliance,
    renderViolationItem,
    complianceScene,
    COMMAND_REGISTRY,
    openCommandPalette,
    closeCommandPalette,
    openShortcutOverlay,
    closeShortcutOverlay,
    renderCommandList,
  };
