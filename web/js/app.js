import './k-components.js';
import {
  WT,
  EPS,
  WALLS,
  resolveWallIndex,
  getRoomWallKeys,
  pointInPolygon,
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
  reproject,
  getRoomPoints,
  getRoomBoundingBox,
  getWallEdgeSegment,
  tessellateArc,
  sagittaFromBulge,
  bulgeFromSagitta,
  radiusFromBulge,
  bulgeFromRadius,
  parseCurveHudInput,
  polygonArea,
  parseWorldfile,
  solveAffineTransform,
  computeGeoBounds,
  worldfileToAffineMatrix,
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
import { saveTextureBlob } from './textureStore.js';
import { exportProjectZip, importProjectZip } from './archive.js';
import {
  parseElevationRaster,
  computeContoursAsync,
  ElevationGrid,
  sanitizeSlopePercent,
  sanitizeSlopeDirection,
  normalizeElevationUnit,
} from './elevationEngine.js';
import {
  evaluate,
  blockingIds,
  commit,
  commitSequence,
  autoComply,
  clampRoomWidth,
  clampRoomDepth,
  clampRoomDimensions,
} from './codes.js';
import {
  draw,
  drawItem,
  handles,
  fmtLen,
  computeOpeningOffsetHUD,
  drawOpeningOffsetHUD,
  hitTestOpeningHUD,
} from './render.js';
import { patternFor, clearPatternCache } from './patterns.js';
import {
  registerCustomWallFinish,
  getWindowPresets,
  getDoorPresets,
  getCladdingPresets,
  getBuildingPresets,
  applyBuildingPreset,
  applyCladdingMaterial,
  resolveWindowStyle,
  resolveDoorStyle,
  resolveWallAssembly,
} from './presetRegistry.js';
import {
  initView3D,
  RANGE_VALUE_FORMATTERS,
  formatRangeValueText,
  updateRangeAriaValueText,
} from './ui3d.js';
import { defaultRateLimiter } from './rateLimiter.js';
import {
  isSingleKeyShortcutDisabled as readSingleKeyShortcutDisabled,
  writeSingleKeyShortcutDisabled,
} from './shortcutPrefs.js';
export { RANGE_VALUE_FORMATTERS, formatRangeValueText, updateRangeAriaValueText };
import { exportSVG } from './svg.js';
import {
  InteractionLayer,
  parseExplicitLengthInches,
  computeVectorAngle,
  computeVertexFromAngle,
  validatePlacement,
  createPlacementFeedback,
  buildToggleViewModel,
  parseCoordinateInput,
  normalizeRotationDegrees,
  buildGridSettingsViewModel,
  parseExplicitAngleDegrees,
  fmtAngleDegrees,
} from '../../designer3d/tools/index.mjs';
import { generatePDF } from './pdfEngine.js';
import { generateBOMCSV } from './bomExporter.js';
import { exportDXF } from './dxfExporter.js';
import { renderStampCanvas } from './stampEngine.js';
import { ComplianceOverlayScene } from './complianceOverlay.js';
import { getToken } from './kthemeTokens.js';
import { ComplianceManager } from './complianceClient.js';
import { SnappingBridge } from './snapping-bridge.js';
import {
  GISBridge,
  projectGeoJSON,
  computeVariableBuffers,
  ensureSpatialIndex,
} from './gisBridge.js';
import {
  buildMultiLevel,
  TEMPLATES,
  TEMPLATE_BY_ID,
  renderTemplatePreviewSVG,
} from './templates.js';
import {
  getOnboardingStatus,
  setOnboardingStatus,
  resetOnboardingStatus,
  OnboardingTour,
  checkOnboardingOnStartup,
} from './onboardingTour.js';

const onboardingTour = new OnboardingTour();

const $ = (s) =>
  typeof document !== 'undefined' && typeof document.querySelector === 'function'
    ? document.querySelector(s)
    : null;
const canvas = typeof document !== 'undefined' ? $('#plan') : null;
const ctx = canvas ? canvas.getContext('2d') : null;
const STORE = 'homegen.plan.v1';

export const SINGLE_KEY_SHORTCUTS_KEY = 'homegen_disable_single_key_shortcuts';

export function isSingleKeyShortcutDisabled() {
  return readSingleKeyShortcutDisabled();
}

function syncShortcutToggleUI(disabled) {
  const toggleEl = $('#disable-single-key-shortcuts');
  if (toggleEl) {
    toggleEl.checked = disabled;
    toggleEl.setAttribute?.('aria-checked', String(disabled));
  }
}

export function setSingleKeyShortcutDisabled(disabled) {
  const next = writeSingleKeyShortcutDisabled(disabled);
  if (next && typeof window !== 'undefined' && window.__scene3d?.walkKeys) {
    window.__scene3d.walkKeys.forward = false;
    window.__scene3d.walkKeys.backward = false;
    window.__scene3d.walkKeys.left = false;
    window.__scene3d.walkKeys.right = false;
  }
  syncShortcutToggleUI(next);
  return next;
}

const interaction = new InteractionLayer({
  gridSettings: {
    unitSize: 6,
    angleSnapDegrees: 15,
    magneticThreshold: 14,
    edgeThreshold: 14,
    midpointThreshold: 14,
    perpendicularThreshold: 14,
    explicitAngleDegrees: null,
  },
  snapModes: {
    grid: true,
    edge: true,
    midpoint: false,
    perpendicular: false,
    angle: true,
  },
});

let doc = M.newState();
try {
  const saved = localStorage.getItem(STORE);
  if (saved) doc = M.deserialize(saved);
} catch {
  /* ignore corrupt/blocked storage */
}
let hist = new M.History(doc, 'Initial Plan');
let report = evaluate(doc);
export const complianceManager = new ComplianceManager();
complianceManager.initState(doc);
complianceManager.onReport((rep) => {
  report = rep;
  redraw();
});
let hoveredViolation = null;
const complianceScene = new ComplianceOverlayScene({
  canvas,
  onRedraw: () => {
    if (!canvas || !ctx || (typeof canvas.isConnected === 'boolean' && !canvas.isConnected)) {
      return;
    }
    redraw();
  },
});
let view = { scale: 1.6, ox: 40, oy: 40 };
let tool = { kind: 'select' }; // select | erase | room{type} | opening{type} | item{type} | wall{id} | floor{id} | roomkit{id} | furnkit{id}
let tab = 'build';
let selectionSet = new Set();
let selection = null;
let view3d = null;

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
let activeHandleIndex = 0;
let isCanvasDragOver = false;
let canvasDragDepth = 0;
let catalogSearchQuery = '';
let catalogMaxWidth = '';
let catalogMaxDepth = '';
let openingUnitMode = M.normalizeOpeningUnit(doc?.settings?.openingUnits || 'ft-in');
let hoveredOpeningHudSide = null;
let activeHudEdit = null;
let distSpacingInput = '';
let distSpacingType = 'center';
let activeDraftCurveEdge = null;
let draftConcavitySign = 1;
let inspectorConcavitySign = 1;

function formatCurveNumber(val, decimals = 2) {
  if (!Number.isFinite(val)) return '';
  const rounded = Number(val.toFixed(decimals));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function formatCurveRadiusDisplay(chordLen, bulge) {
  if (!bulge || Math.abs(bulge) < 1e-9 || !Number.isFinite(chordLen) || chordLen <= 1e-9) {
    return '';
  }
  const r = radiusFromBulge(chordLen, bulge);
  return Number.isFinite(r) ? formatCurveNumber(r, 2) : '';
}

function getDraftCurveSegments() {
  const pts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
  if (!pts || pts.length === 0) return [];
  const segments = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const start = pts[i];
    const end = pts[i + 1];
    const chordLen = Math.hypot(end.x - start.x, end.y - start.y);
    segments.push({
      key: String(i),
      edgeIndex: i,
      label: `Wall ${i + 1} (${i + 1}→${i + 2})`,
      start,
      end,
      chordLen,
      bulge: interaction.getEdgeBulge ? interaction.getEdgeBulge(i) : 0,
    });
  }
  if (pts.length >= 3) {
    const closeIdx = pts.length - 1;
    const start = pts[closeIdx];
    const end = pts[0];
    segments.push({
      key: `close:${closeIdx}`,
      edgeIndex: closeIdx,
      label: `Closing (${pts.length}→1)`,
      start,
      end,
      chordLen: Math.hypot(end.x - start.x, end.y - start.y),
      bulge: interaction.getEdgeBulge ? interaction.getEdgeBulge(closeIdx) : 0,
    });
  } else {
    const activeIdx = pts.length - 1;
    const start = pts[activeIdx];
    const end = hover || { x: start.x + 120, y: start.y };
    const rawChord = Math.hypot(end.x - start.x, end.y - start.y);
    segments.push({
      key: `preview:${activeIdx}`,
      edgeIndex: activeIdx,
      label: `Active (${pts.length}→Next)`,
      start,
      end,
      chordLen: rawChord > 1e-6 ? rawChord : 120,
      bulge: interaction.getEdgeBulge ? interaction.getEdgeBulge(activeIdx) : 0,
    });
  }
  return segments;
}

function setCurveErrorUI(errEl, inputEls, message) {
  if (!errEl) return;
  if (message) {
    errEl.textContent = message;
    errEl.hidden = false;
  } else {
    errEl.textContent = '';
    errEl.hidden = true;
    inputEls.forEach((el) => el?.removeAttribute('aria-invalid'));
  }
}

function syncDraftingCurveHud(options = {}) {
  const hud = $('#curve-drafting-hud');
  if (!hud) return;
  const pts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
  if (tool.kind !== 'room' || !pts || pts.length === 0) {
    hud.hidden = true;
    activeDraftCurveEdge = null;
    return;
  }
  hud.hidden = false;
  const segments = getDraftCurveSegments();
  if (!segments.length) return;

  const edgeSel = $('#hud-curve-edge');
  const radiusEl = $('#hud-curve-radius');
  const sagittaEl = $('#hud-curve-sagitta');
  const bulgeEl = $('#hud-curve-bulge');
  const chordEl = $('#hud-curve-chord');
  const errEl = $('#hud-curve-error');

  let selectedSeg =
    activeDraftCurveEdge !== null
      ? segments.find((s) => s.edgeIndex === activeDraftCurveEdge)
      : null;
  if (!selectedSeg) {
    selectedSeg = pts.length >= 2 ? segments[pts.length - 2] : segments[0];
    activeDraftCurveEdge = selectedSeg.edgeIndex;
  }

  if (edgeSel && document.activeElement !== edgeSel) {
    edgeSel.innerHTML = segments
      .map((s) => {
        const mark = Math.abs(s.bulge) > 1e-9 ? ' ⌒' : '';
        return `<option value="${s.edgeIndex}" ${s.edgeIndex === selectedSeg.edgeIndex ? 'selected' : ''}>${esc(s.label)}${mark}</option>`;
      })
      .join('');
  }

  if (chordEl) {
    chordEl.textContent = `Chord: ${formatCurveNumber(selectedSeg.chordLen, 1)}"`;
  }

  const preserveField = options.preserveField || null;
  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  if (radiusEl && preserveField !== 'radius' && activeEl !== radiusEl) {
    radiusEl.value = formatCurveRadiusDisplay(selectedSeg.chordLen, selectedSeg.bulge);
  }
  if (sagittaEl && preserveField !== 'sagitta' && activeEl !== sagittaEl) {
    sagittaEl.value = formatCurveNumber(
      sagittaFromBulge(selectedSeg.chordLen, selectedSeg.bulge),
      2
    );
  }
  if (bulgeEl && preserveField !== 'bulge' && activeEl !== bulgeEl) {
    bulgeEl.value = formatCurveNumber(selectedSeg.bulge, 4);
  }
  if (!options.keepError) {
    setCurveErrorUI(errEl, [radiusEl, sagittaEl, bulgeEl], null);
  }
}

function setupDraftingCurveHud() {
  const edgeSel = $('#hud-curve-edge');
  const radiusEl = $('#hud-curve-radius');
  const sagittaEl = $('#hud-curve-sagitta');
  const bulgeEl = $('#hud-curve-bulge');
  const invertBtn = $('#hud-curve-invert');
  const resetBtn = $('#hud-curve-reset');
  const errEl = $('#hud-curve-error');

  if (!edgeSel || !radiusEl || !sagittaEl || !bulgeEl) return;

  edgeSel.addEventListener('change', (e) => {
    activeDraftCurveEdge = parseInt(e.target.value, 10) || 0;
    const curB = interaction.getEdgeBulge(activeDraftCurveEdge);
    if (curB !== 0) draftConcavitySign = curB < 0 ? -1 : 1;
    syncDraftingCurveHud();
    redraw();
  });

  const handleHudFieldInput = (field, inputEl, commitNormalize = false) => {
    const segments = getDraftCurveSegments();
    const edgeIdx =
      activeDraftCurveEdge !== null ? activeDraftCurveEdge : segments[0]?.edgeIndex || 0;
    const seg = segments.find((s) => s.edgeIndex === edgeIdx) || {
      edgeIndex: edgeIdx,
      chordLen: 120,
      bulge: interaction.getEdgeBulge(edgeIdx),
    };
    const signHint = seg.bulge !== 0 ? seg.bulge : draftConcavitySign < 0 ? -1e-6 : 0;
    const res = parseCurveHudInput(field, inputEl.value, seg.chordLen, signHint);

    if (!res.ok) {
      inputEl.setAttribute('aria-invalid', 'true');
      setCurveErrorUI(errEl, [radiusEl, sagittaEl, bulgeEl], res.error);
      return;
    }

    inputEl.removeAttribute('aria-invalid');
    setCurveErrorUI(errEl, [radiusEl, sagittaEl, bulgeEl], null);
    if (res.bulge !== 0) {
      draftConcavitySign = res.bulge < 0 ? -1 : 1;
    }
    interaction.setEdgeBulge(edgeIdx, res.bulge);

    if (commitNormalize) {
      radiusEl.value = formatCurveRadiusDisplay(seg.chordLen, res.bulge);
      sagittaEl.value = formatCurveNumber(sagittaFromBulge(seg.chordLen, res.bulge), 2);
      bulgeEl.value = formatCurveNumber(res.bulge, 4);
    } else {
      syncDraftingCurveHud({ preserveField: field });
    }
    redraw();
  };

  radiusEl.addEventListener('input', () => handleHudFieldInput('radius', radiusEl, false));
  radiusEl.addEventListener('change', () => handleHudFieldInput('radius', radiusEl, true));
  sagittaEl.addEventListener('input', () => handleHudFieldInput('sagitta', sagittaEl, false));
  sagittaEl.addEventListener('change', () => handleHudFieldInput('sagitta', sagittaEl, true));
  bulgeEl.addEventListener('input', () => handleHudFieldInput('bulge', bulgeEl, false));
  bulgeEl.addEventListener('change', () => handleHudFieldInput('bulge', bulgeEl, true));

  invertBtn?.addEventListener('click', () => {
    const segments = getDraftCurveSegments();
    const edgeIdx =
      activeDraftCurveEdge !== null ? activeDraftCurveEdge : segments[0]?.edgeIndex || 0;
    const cur = interaction.getEdgeBulge(edgeIdx);
    draftConcavitySign = cur !== 0 ? (cur > 0 ? -1 : 1) : -draftConcavitySign;
    if (cur !== 0) {
      interaction.setEdgeBulge(edgeIdx, -cur);
    }
    const seg = segments.find((s) => s.edgeIndex === edgeIdx);
    const nextB = interaction.getEdgeBulge(edgeIdx);
    if (seg) {
      radiusEl.value = formatCurveRadiusDisplay(seg.chordLen, nextB);
      sagittaEl.value = formatCurveNumber(sagittaFromBulge(seg.chordLen, nextB), 2);
      bulgeEl.value = formatCurveNumber(nextB, 4);
    }
    setCurveErrorUI(errEl, [radiusEl, sagittaEl, bulgeEl], null);
    redraw();
  });

  resetBtn?.addEventListener('click', () => {
    const segments = getDraftCurveSegments();
    const edgeIdx =
      activeDraftCurveEdge !== null ? activeDraftCurveEdge : segments[0]?.edgeIndex || 0;
    draftConcavitySign = 1;
    interaction.setEdgeBulge(edgeIdx, 0);
    radiusEl.value = '';
    sagittaEl.value = '0';
    bulgeEl.value = '0';
    setCurveErrorUI(errEl, [radiusEl, sagittaEl, bulgeEl], null);
    redraw();
  });
}

const ALLOWED_BLUEPRINT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
]);
const ALLOWED_BLUEPRINT_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;

export function isValidBlueprintImageFile(file) {
  if (!file || typeof file !== 'object') return false;
  const type = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
  if (type) {
    return ALLOWED_BLUEPRINT_MIME_TYPES.has(type);
  }
  const name = typeof file.name === 'string' ? file.name.trim() : '';
  return ALLOWED_BLUEPRINT_EXT_RE.test(name);
}

const snappingBridge = new SnappingBridge({
  canvas,
  interaction,
  getRooms: () => levelRooms(),
  toWorld: (e) => toWorld(e),
  view,
  getViewScale: () => view.scale,
  onSnap: (snapState) => {
    updateWallAngleHudReadout(snapState);
    redraw();
  },
});

if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.view === '3d') {
        closeOpeningHudEditor();
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
const toRoomCollisionShape = (rm) =>
  rm?.bulges ? { points: getRoomPoints(rm), bulges: rm.bulges } : getRoomPoints(rm);
const roomAt = (p) =>
  levelRooms()
    .filter((r) => inRect(r, p, WT / 2))
    .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;

function isElementInsideToast(toastEl, dismissBtn, node) {
  if (!node || !toastEl) return false;
  if (node === toastEl || (dismissBtn && node === dismissBtn)) return true;
  if (toastEl._actionBtn && node === toastEl._actionBtn) return true;
  if (typeof toastEl.contains === 'function') return toastEl.contains(node);
  if (Array.isArray(toastEl.children) && toastEl.children.includes(node)) return true;
  return false;
}

function removeToastActionBtn(t) {
  if (!t) return;
  const prevBtn =
    t._actionBtn ||
    (typeof t.querySelector === 'function' ? t.querySelector('.toast-action-btn') : null);
  t._actionBtn = null;
  if (!prevBtn) return;
  if (typeof prevBtn.remove === 'function') {
    prevBtn.remove();
  } else if (prevBtn.parentNode && typeof prevBtn.parentNode.removeChild === 'function') {
    prevBtn.parentNode.removeChild(prevBtn);
  } else if (typeof t.removeChild === 'function') {
    t.removeChild(prevBtn);
  } else if (Array.isArray(t.children)) {
    const idx = t.children.indexOf(prevBtn);
    if (idx !== -1) t.children.splice(idx, 1);
  }
}

function ensureToastElements(t) {
  let msgEl = typeof t.querySelector === 'function' ? t.querySelector('.toast-msg') : null;
  let dismissBtn = typeof t.querySelector === 'function' ? t.querySelector('.toast-dismiss') : null;

  if (
    (!msgEl || !dismissBtn) &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof t.appendChild === 'function'
  ) {
    t.textContent = '';
    msgEl = document.createElement('span');
    msgEl.className = 'toast-msg';
    if (typeof msgEl.setAttribute === 'function') msgEl.setAttribute('class', 'toast-msg');

    dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'toast-dismiss';
    if (typeof dismissBtn.setAttribute === 'function') {
      dismissBtn.setAttribute('type', 'button');
      dismissBtn.setAttribute('class', 'toast-dismiss');
      dismissBtn.setAttribute('aria-label', 'Dismiss notification');
    }
    const iconSpan = document.createElement('span');
    if (typeof iconSpan.setAttribute === 'function') {
      iconSpan.setAttribute('aria-hidden', 'true');
    }
    iconSpan.textContent = '✕';
    if (typeof dismissBtn.appendChild === 'function') {
      dismissBtn.appendChild(iconSpan);
    } else {
      dismissBtn.textContent = '✕';
    }

    t.appendChild(msgEl);
    t.appendChild(dismissBtn);
  }

  return { msgEl, dismissBtn };
}

function focusElementCleanly(el) {
  if (!el) return false;
  const shadowFocusable =
    el.shadowRoot && typeof el.shadowRoot.querySelector === 'function'
      ? el.shadowRoot.querySelector(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      : null;
  if (shadowFocusable && typeof shadowFocusable.focus === 'function') {
    shadowFocusable.focus();
    return true;
  }
  if (typeof el.focus === 'function') {
    el.focus();
    return true;
  }
  return false;
}

export function dismissToast({ restoreFocus = false } = {}) {
  clearTimeout(toast.t);
  toast.t = null;
  const state = toast._state;
  if (state) state.active = false;

  const t = $('#toast');
  if (!t) return;

  const dismissBtn =
    typeof t.querySelector === 'function' ? t.querySelector('.toast-dismiss') : null;
  const msgEl = typeof t.querySelector === 'function' ? t.querySelector('.toast-msg') : null;
  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  const focusWasInside = isElementInsideToast(t, dismissBtn, activeEl);

  removeToastActionBtn(t);
  t._toastHovered = false;
  t._toastFocused = false;
  if (t.style) t.style.display = 'none';
  if (msgEl) msgEl.textContent = '';

  if (restoreFocus) {
    const returnEl = toast._returnFocusEl;
    toast._returnFocusEl = null;
    if (!focusElementCleanly(returnEl) && focusWasInside) {
      const fallback = ($('#plan') && !$('#plan').hidden ? $('#plan') : null) || $('#stage');
      focusElementCleanly(fallback);
    }
  }
}

function pauseActiveToastTimer() {
  const state = toast._state;
  if (!state || !state.active || state.err || state.paused || state.duration <= 0) return;
  clearTimeout(toast.t);
  toast.t = null;
  const elapsed = Math.max(0, Date.now() - state.startTime);
  state.remaining = Math.max(0, state.remaining - elapsed);
  state.paused = true;
}

function resumeActiveToastTimer(t) {
  const state = toast._state;
  if (!state || !state.active || state.err || !state.paused || state.duration <= 0) return;
  if (t && (t._toastHovered || t._toastFocused)) return;
  state.paused = false;
  state.startTime = Date.now();
  const delay = Math.max(1, state.remaining);
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    dismissToast({ restoreFocus: false });
  }, delay);
}

function bindToastListeners(t, dismissBtn) {
  if (t && !t._toastListenersAttached && typeof t.addEventListener === 'function') {
    t._toastListenersAttached = true;

    t.addEventListener('mouseenter', () => {
      t._toastHovered = true;
      pauseActiveToastTimer();
    });

    t.addEventListener('mouseleave', () => {
      t._toastHovered = false;
      resumeActiveToastTimer(t);
    });

    t.addEventListener('focusin', (e) => {
      if (
        !toast._returnFocusEl &&
        e?.relatedTarget &&
        !isElementInsideToast(t, dismissBtn, e.relatedTarget)
      ) {
        toast._returnFocusEl = e.relatedTarget;
      }
      t._toastFocused = true;
      pauseActiveToastTimer();
    });

    t.addEventListener('focusout', (e) => {
      if (e?.relatedTarget && isElementInsideToast(t, dismissBtn, e.relatedTarget)) {
        return;
      }
      t._toastFocused = false;
      resumeActiveToastTimer(t);
    });

    t.addEventListener('keydown', (e) => {
      if (e?.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        dismissToast({ restoreFocus: true });
      }
    });
  }

  if (
    dismissBtn &&
    !dismissBtn._toastDismissBound &&
    typeof dismissBtn.addEventListener === 'function'
  ) {
    dismissBtn._toastDismissBound = true;

    dismissBtn.addEventListener('click', (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      dismissToast({ restoreFocus: true });
    });

    dismissBtn.addEventListener('keydown', (e) => {
      if (e?.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        dismissToast({ restoreFocus: true });
      }
    });
  }
}

export function toast(msg, err = false, ms = 4500, action = null) {
  const t = $('#toast');
  clearTimeout(toast.t);
  toast.t = null;
  if (toast._state) toast._state.active = false;
  if (!t) return;

  const isErr = Boolean(err);
  const wasVisible = Boolean(t.style && t.style.display && t.style.display !== 'none');
  if (!wasVisible) {
    t._toastHovered = false;
    t._toastFocused = false;
  }

  removeToastActionBtn(t);
  const { msgEl, dismissBtn } = ensureToastElements(t);
  bindToastListeners(t, dismissBtn);

  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  if (
    activeEl &&
    !isElementInsideToast(t, dismissBtn, activeEl) &&
    activeEl.tagName !== 'BODY' &&
    activeEl.tagName !== 'HTML'
  ) {
    toast._returnFocusEl = activeEl;
  } else if (!isElementInsideToast(t, dismissBtn, activeEl)) {
    toast._returnFocusEl = null;
  }

  t.className = isErr ? 'err' : '';
  if (typeof t.classList?.toggle === 'function') {
    t.classList.toggle('err', isErr);
  }
  if (typeof t.setAttribute === 'function') {
    t.setAttribute('role', isErr ? 'alert' : 'status');
    t.setAttribute('aria-live', isErr ? 'assertive' : 'polite');
  }

  if (msgEl) {
    msgEl.textContent = '';
    msgEl.textContent = msg;
  } else {
    t.textContent = msg;
  }

  if (
    action &&
    action.label &&
    typeof action.onClick === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof t.appendChild === 'function'
  ) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action-btn';
    if (typeof actionBtn.setAttribute === 'function') {
      actionBtn.setAttribute('type', 'button');
      actionBtn.setAttribute('class', 'toast-action-btn');
    }
    actionBtn.textContent = action.label;
    let clicked = false;
    actionBtn.addEventListener('click', (e) => {
      e?.stopPropagation?.();
      if (clicked) return;
      clicked = true;
      dismissToast({ restoreFocus: false });
      action.onClick();
    });
    actionBtn.addEventListener('keydown', (e) => {
      if (e?.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        dismissToast({ restoreFocus: true });
      }
    });
    if (dismissBtn && typeof t.insertBefore === 'function') {
      t.insertBefore(actionBtn, dismissBtn);
    } else if (dismissBtn && Array.isArray(t.children)) {
      const idx = t.children.indexOf(dismissBtn);
      if (idx !== -1) {
        actionBtn.parentNode = t;
        t.children.splice(idx, 0, actionBtn);
      } else {
        t.appendChild(actionBtn);
      }
    } else {
      t.appendChild(actionBtn);
    }
    t._actionBtn = actionBtn;
  }

  if (t.style) t.style.display = 'flex';

  const effectiveMs = isErr ? 0 : Number(ms) || 0;
  const focusInside = isElementInsideToast(t, dismissBtn, activeEl);
  if (focusInside) t._toastFocused = true;
  const initiallyPaused = Boolean(t._toastHovered || t._toastFocused);

  const state = {
    active: true,
    err: isErr,
    duration: effectiveMs,
    remaining: effectiveMs,
    startTime: Date.now(),
    paused: initiallyPaused,
  };
  toast._state = state;

  if (effectiveMs > 0 && !initiallyPaused) {
    toast.t = setTimeout(() => {
      dismissToast({ restoreFocus: false });
    }, effectiveMs);
  }
}

const UNDO_TOAST_ACTION = {
  label: 'Undo',
  onClick: () => $('#undo')?.click(),
};

export const ZOOM_ANNOUNCE_DEBOUNCE_MS = 300;
let liveRegionTimeout = null;
let zoomAnnounceTimeout = null;
let a11yDebounceTimer = null;
export function announceToLiveRegion(msg) {
  const live3dEl = $('#view3d-a11y-live');
  if (live3dEl) live3dEl.textContent = msg;
  const liveEl = $('#plan-fallback-summary');
  if (!liveEl) return;
  if (a11yDebounceTimer) {
    clearTimeout(a11yDebounceTimer);
    a11yDebounceTimer = null;
  }
  if (liveRegionTimeout) clearTimeout(liveRegionTimeout);
  liveRegionTimeout = setTimeout(() => {
    if (a11yDebounceTimer) {
      clearTimeout(a11yDebounceTimer);
      a11yDebounceTimer = null;
    }
    liveEl.textContent = msg;
  }, 220);
}

export function announceZoom(scale) {
  if (zoomAnnounceTimeout) clearTimeout(zoomAnnounceTimeout);
  if (a11yDebounceTimer) {
    clearTimeout(a11yDebounceTimer);
    a11yDebounceTimer = null;
  }
  if (liveRegionTimeout) {
    clearTimeout(liveRegionTimeout);
    liveRegionTimeout = null;
  }
  zoomAnnounceTimeout = setTimeout(() => {
    zoomAnnounceTimeout = null;
    const liveEl =
      $('#plan-fallback-summary') ||
      (typeof document !== 'undefined' && typeof document.getElementById === 'function'
        ? document.getElementById('plan-fallback-summary')
        : null);
    if (!liveEl) return;
    if (typeof liveEl.setAttribute === 'function' && !liveEl.getAttribute?.('role')) {
      liveEl.setAttribute('role', 'status');
    }
    liveEl.textContent = `Zoom level: ${Math.round((scale / 1.6) * 100)}%`;
  }, ZOOM_ANNOUNCE_DEBOUNCE_MS);
}

export function bindHeaderQuotaBadge(
  limiter = defaultRateLimiter,
  root = typeof document !== 'undefined' ? document : null,
  options = {}
) {
  if (!root || typeof root.querySelector !== 'function') {
    return { update: () => {}, destroy: () => {} };
  }
  const q = (sel) => root.querySelector(sel);
  const badgeEl = q('#header-quota-badge');
  const countEl = q('#header-quota-count');
  const queueEl = q('#header-quota-queue');
  const upgradeBtnEl = q('#header-quota-upgrade');

  const getStoredKey =
    options.getStoredKey ||
    (() => {
      const pKey = q('#p-key');
      if (pKey && typeof pKey.value === 'string' && pKey.value.trim()) {
        return pKey.value.trim();
      }
      try {
        if (typeof localStorage !== 'undefined') {
          return (localStorage.getItem('homegen.horde.key') || '').trim();
        }
      } catch {
        /* ignore storage restrictions */
      }
      return '';
    });

  function update(state = limiter.getQuotaState('sync')) {
    const tokens = state?.tokens ?? state?.remaining ?? limiter.tokens ?? 0;
    const capacity = state?.capacity ?? limiter.capacity ?? 0;
    const queuedCount = state?.queuedCount ?? state?.queueLength ?? limiter.queue?.length ?? 0;
    const status =
      state?.status ??
      (tokens <= 0
        ? 'exhausted'
        : capacity > 1 && tokens < capacity && tokens <= Math.max(1, Math.ceil(capacity * 0.2))
          ? 'low'
          : tokens >= capacity
            ? 'full'
            : 'available');
    const isLow = status === 'low';
    const isExhausted = status === 'exhausted';
    const storedKey = getStoredKey();
    const upgraded = Boolean(storedKey && storedKey !== '0000000000');

    if (badgeEl) {
      if (badgeEl.dataset) badgeEl.dataset.quotaState = status;
      else if (typeof badgeEl.setAttribute === 'function')
        badgeEl.setAttribute('data-quota-state', status);
      badgeEl.classList?.toggle('quota-full', status === 'full');
      badgeEl.classList?.toggle('quota-low', isLow);
      badgeEl.classList?.toggle('quota-exhausted', isExhausted);
    }

    if (countEl) {
      countEl.textContent = `${tokens} / ${capacity} credits`;
    }

    if (queueEl) {
      if (queuedCount > 0) {
        queueEl.hidden = false;
        queueEl.textContent = `${queuedCount} queued`;
      } else {
        queueEl.hidden = true;
        queueEl.textContent = '';
      }
    }

    if (upgradeBtnEl) {
      upgradeBtnEl.classList?.toggle('upgraded', upgraded && !isLow && !isExhausted);
      upgradeBtnEl.classList?.toggle('quota-upgrade-urgent', isLow || isExhausted);
      if (isExhausted) {
        upgradeBtnEl.textContent = 'Refilling…';
      } else if (isLow) {
        upgradeBtnEl.textContent = upgraded ? 'Low Credits' : 'Upgrade';
      } else {
        upgradeBtnEl.textContent = upgraded ? 'HD Key' : 'Upgrade';
      }
    }
  }

  const onUpgradeClick = () => {
    if (typeof options.onUpgrade === 'function') {
      options.onUpgrade(upgradeBtnEl);
    }
  };

  if (upgradeBtnEl && typeof upgradeBtnEl.addEventListener === 'function') {
    upgradeBtnEl.addEventListener('click', onUpgradeClick);
  }

  const unsubscribe =
    typeof limiter.onQuotaChange === 'function'
      ? limiter.onQuotaChange((detail) => update(detail))
      : (() => {
          const handler = (evt) => update(evt.detail);
          limiter.addEventListener?.('quota-change', handler);
          return () => limiter.removeEventListener?.('quota-change', handler);
        })();

  const onKeySync = () => update();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('horde-key-change', onKeySync);
    window.addEventListener('storage', onKeySync);
  }

  update(limiter.getQuotaState('init'));

  return {
    update,
    destroy() {
      unsubscribe();
      if (upgradeBtnEl && typeof upgradeBtnEl.removeEventListener === 'function') {
        upgradeBtnEl.removeEventListener('click', onUpgradeClick);
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('horde-key-change', onKeySync);
        window.removeEventListener('storage', onKeySync);
      }
    },
  };
}

export function formatNumericInput(value, maxDecimals = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function persist() {
  try {
    localStorage.setItem(STORE, M.serialize(doc));
  } catch {
    /* storage unavailable */
  }
}

export function getOpeningUnitMode() {
  return M.normalizeOpeningUnit(doc?.settings?.openingUnits || openingUnitMode || 'ft-in');
}

export function setOpeningUnitMode(nextUnit) {
  const normalized = M.normalizeOpeningUnit(nextUnit);
  openingUnitMode = normalized;
  doc.settings ||= {};
  doc.settings.openingUnits = normalized;
  persist();
  const unitBtn = $('#opening-hud-unit-btn');
  if (unitBtn) {
    unitBtn.textContent = normalized === 'in' ? 'in"' : 'ft\' in"';
  }
  renderInspector();
  redraw();
  return normalized;
}

export function commitOpeningOffsetInput(openingId, rawValue, side = 'offset') {
  const hit = M.findOwner(doc, openingId);
  if (!hit || hit.kind !== 'opening') {
    return { ok: false, reason: 'not-found' };
  }
  const unit = getOpeningUnitMode();
  const parsed = M.parseOpeningOffset(rawValue, unit);
  if (parsed === null) {
    toast('Enter a valid offset distance (e.g. 3\' 6" or 42").', true, 2800);
    renderInspector();
    redraw();
    return { ok: false, reason: 'invalid-number' };
  }

  const { room, obj } = hit;
  const width = obj.width ?? OPENING_BY_ID[obj.type]?.w ?? 0;
  const len = wallLength(room, obj.wall);
  const maxOffset = Math.max(0, len - width);
  const clampedInput = M.clampOpeningOffset(room, obj.wall, parsed, width);
  const targetOffset = side === 'corner' ? Math.max(0, maxOffset - clampedInput) : clampedInput;

  if (M.hasOpeningOverlap(doc, room, obj.wall, targetOffset, width, obj.id, 0)) {
    toast('Cannot place opening there: overlaps another opening on this wall.', true, 3200);
    renderInspector();
    redraw();
    return { ok: false, reason: 'overlap' };
  }

  const actionLabel =
    side === 'corner' ? 'Update Opening Corner Distance' : 'Update Opening Offset';
  const res = apply((n) => {
    M.setOpeningOffset(n, openingId, targetOffset);
  }, actionLabel);

  if (!res.ok) {
    renderInspector();
    redraw();
    return { ok: false, reason: 'blocked', report: res };
  }

  const updatedHit = M.findOwner(doc, openingId);
  const finalOffset = updatedHit?.obj?.offset ?? targetOffset;
  const finalCorner = updatedHit
    ? M.getOpeningCornerDistance(updatedHit.room, updatedHit.obj)
    : Math.max(0, maxOffset - finalOffset);

  announceToLiveRegion(
    `Opening offset set to ${M.formatOpeningOffset(finalOffset, unit)} (corner distance ${M.formatOpeningOffset(finalCorner, unit)}).`
  );
  return { ok: true, offset: finalOffset, cornerDistance: finalCorner };
}

function syncOpeningHudPosition() {
  if (!activeHudEdit) return;
  const hudEl = $('#opening-offset-hud');
  if (!hudEl) return;
  const levelState = { ...doc, rooms: levelRooms() };
  const hud = computeOpeningOffsetHUD(levelState, selection, view, {
    openingUnits: getOpeningUnitMode(),
  });
  if (!hud || hud.opening.id !== activeHudEdit.openingId) {
    activeHudEdit = null;
    hudEl.hidden = true;
    return;
  }
  const lbl = activeHudEdit.side === 'corner' ? hud.cornerLabel : hud.offsetLabel;
  const stageRect = $('#stage')?.getBoundingClientRect?.();
  const canvasRect = canvas?.getBoundingClientRect?.();
  const offsetX = stageRect && canvasRect ? canvasRect.left - stageRect.left : 0;
  const offsetY = stageRect && canvasRect ? canvasRect.top - stageRect.top : 0;

  let left = offsetX + lbl.screenCenter.x;
  let top = offsetY + lbl.screenCenter.y;
  if (stageRect && stageRect.width > 0 && stageRect.height > 0) {
    left = Math.max(135, Math.min(stageRect.width - 135, left));
    top = Math.max(58, Math.min(stageRect.height - 28, top));
  }
  if (hudEl.style) {
    hudEl.style.left = `${Math.round(left)}px`;
    hudEl.style.top = `${Math.round(top)}px`;
  }
}

export function openOpeningHudEditor(openingId, side = 'offset') {
  const hudEl = $('#opening-offset-hud');
  const inputEl = $('#opening-hud-input');
  const labelEl = $('#opening-hud-label');
  const unitBtn = $('#opening-hud-unit-btn');
  const hit = M.findOwner(doc, openingId);
  if (!hit || hit.kind !== 'opening' || !hudEl || !inputEl) return false;

  activeHudEdit = { openingId, side };
  const unit = getOpeningUnitMode();
  const currentVal =
    side === 'corner'
      ? M.getOpeningCornerDistance(hit.room, hit.obj)
      : M.clampOpeningOffset(hit.room, hit.obj.wall, hit.obj.offset, hit.obj.width);

  if (labelEl) labelEl.textContent = side === 'corner' ? 'Corner Distance' : 'Wall Offset';
  if (unitBtn) unitBtn.textContent = unit === 'in' ? 'in"' : 'ft\' in"';
  inputEl.value = M.formatOpeningOffset(currentVal, unit);
  hudEl.hidden = false;
  syncOpeningHudPosition();
  redraw();
  inputEl.focus?.();
  inputEl.select?.();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (activeHudEdit && activeHudEdit.openingId === openingId) {
        inputEl.focus?.();
        inputEl.select?.();
      }
    });
  }
  return true;
}

export function closeOpeningHudEditor({ restoreFocus = false } = {}) {
  const wasOpen = Boolean(activeHudEdit);
  activeHudEdit = null;
  const hudEl = $('#opening-offset-hud');
  if (hudEl) hudEl.hidden = true;
  if (wasOpen) redraw();
  if (restoreFocus && canvas?.focus) canvas.focus();
}

function initOpeningHudUI() {
  const hudEl = $('#opening-offset-hud');
  if (!hudEl) return;

  hudEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeHudEdit) return;
    const { openingId, side } = activeHudEdit;
    const rawVal = $('#opening-hud-input')?.value ?? '';
    closeOpeningHudEditor({ restoreFocus: true });
    commitOpeningOffsetInput(openingId, rawVal, side);
  });

  $('#opening-hud-cancel-btn')?.addEventListener('click', () => {
    closeOpeningHudEditor({ restoreFocus: true });
  });

  $('#opening-hud-unit-btn')?.addEventListener('click', () => {
    const prevUnit = getOpeningUnitMode();
    const nextUnit = prevUnit === 'in' ? 'ft-in' : 'in';
    const inputEl = $('#opening-hud-input');
    const parsed = inputEl ? M.parseOpeningOffset(inputEl.value, prevUnit) : null;
    setOpeningUnitMode(nextUnit);
    if (inputEl && parsed !== null) {
      inputEl.value = M.formatOpeningOffset(Math.max(0, parsed), nextUnit);
      inputEl.focus?.();
      inputEl.select?.();
    }
  });

  hudEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeOpeningHudEditor({ restoreFocus: true });
    }
  });
}

function is3DViewActive() {
  if (view3d && typeof view3d.isThree === 'function' && view3d.isThree()) {
    return true;
  }
  const view3dBtn = $('#toolbar [data-view="3d"]') || $('[data-view="3d"]');
  if (
    view3dBtn &&
    view3dBtn.classList &&
    typeof view3dBtn.classList.contains === 'function' &&
    view3dBtn.classList.contains('on')
  ) {
    return true;
  }
  return false;
}

export function renderSnapToggles() {
  const container = $('#snap-toggles');
  if (!container) return;
  const is3d = is3DViewActive();
  const disabledAttr = is3d ? 'disabled' : '';
  const viewModels = buildToggleViewModel(interaction);
  const gridVm = buildGridSettingsViewModel(interaction);
  const activeCount = viewModels.filter((vm) => vm.enabled).length;

  const basicItems = viewModels.filter((vm) => (vm.category || 'basic') === 'basic');
  const advancedItems = viewModels.filter((vm) => vm.category === 'advanced');

  const existingPopover =
    typeof container.querySelector === 'function' ? container.querySelector('k-popover') : null;
  const wasOpen = !is3d && existingPopover ? existingPopover.open : false;
  const activeEl = !is3d && typeof document !== 'undefined' ? document.activeElement : null;
  const isContained =
    activeEl &&
    (typeof container.contains === 'function'
      ? container.contains(activeEl)
      : activeEl.id === 'snap-unit-size' || activeEl.id === 'snap-angle-degrees');
  const focusedInputId = isContained && activeEl.id ? activeEl.id : null;

  const renderGroup = (items) =>
    items
      .map((vm) => {
        const token = vm.token || '--ktheme-accent';
        const tokenHover = vm.tokenHover || '--ktheme-accent-hover';
        const styleAttr = `--snap-accent: var(${token}); --snap-accent-hover: var(${tokenHover});`;
        return `
        <k-button class="snap-toggle-btn ${vm.enabled ? 'on' : ''}" ${vm.enabled ? 'active' : ''} ${disabledAttr} data-snap-id="${vm.id}" style="${styleAttr}" title="${esc(vm.description)}">
          <span>${esc(vm.label)}</span>
          <span class="snap-status">${vm.enabled ? 'ON' : 'OFF'}</span>
        </k-button>
      `;
      })
      .join('');

  container.innerHTML = `
    <k-popover id="snap-popover">
      <k-button id="snap-trigger" slot="trigger" ${activeCount > 0 ? 'active' : ''} ${disabledAttr} title="Snapping modes (${activeCount} enabled)">
        <span aria-hidden="true">🧲</span> Snapping <span class="snap-badge badge">${activeCount}</span>
      </k-button>
      <div class="snap-popover-menu">
        <div class="snap-category">
          <div class="snap-category-title">Basic Drafting Snaps</div>
          <div class="snap-category-items">
            ${renderGroup(basicItems)}
          </div>
        </div>
        <div class="snap-category">
          <div class="snap-category-title">Precision CAD Snaps</div>
          <div class="snap-category-items">
            ${renderGroup(advancedItems)}
          </div>
        </div>
        <div class="snap-category snap-increments-panel">
          <div class="snap-category-title">Grid &amp; Angle Increments</div>
          <div class="snap-increment-fields">
            <div class="snap-increment-row">
              <label for="snap-unit-size" class="snap-increment-label">Grid Spacing (in)</label>
              <k-input id="snap-unit-size" class="snap-increment-input" type="number" min="0.25" step="0.25" data-grid-setting="unitSize" aria-label="Grid Spacing (in)" value="${esc(gridVm.unitSize)}"></k-input>
            </div>
            <div class="snap-increment-row">
              <label for="snap-angle-degrees" class="snap-increment-label">Angle Snap (°)</label>
              <k-input id="snap-angle-degrees" class="snap-increment-input" type="number" min="1" max="360" step="1" data-grid-setting="angleSnapDegrees" aria-label="Angle Snap (degrees)" value="${esc(gridVm.angleSnapDegrees)}"></k-input>
            </div>
          </div>
        </div>
      </div>
    </k-popover>
  `;

  const newPopover =
    typeof container.querySelector === 'function' ? container.querySelector('k-popover') : null;
  if (newPopover) {
    if (wasOpen && !is3d) {
      newPopover.open = true;
    } else if (is3d) {
      newPopover.open = false;
      if (typeof newPopover.removeAttribute === 'function') {
        newPopover.removeAttribute('open');
      }
    }
  }

  const snapTrigger =
    typeof container.querySelector === 'function' ? container.querySelector('#snap-trigger') : null;
  if (snapTrigger) {
    snapTrigger.disabled = is3d;
    if (is3d) {
      if (typeof snapTrigger.setAttribute === 'function') snapTrigger.setAttribute('disabled', '');
    } else if (typeof snapTrigger.removeAttribute === 'function') {
      snapTrigger.removeAttribute('disabled');
    }
  }

  if (focusedInputId && typeof container.querySelector === 'function') {
    const restoredInput = container.querySelector(`#${focusedInputId}`);
    if (restoredInput && typeof restoredInput.focus === 'function') {
      restoredInput.focus();
    }
  }

  container.querySelectorAll('[data-snap-id]').forEach((btn) => {
    btn.disabled = is3d;
    if (is3d) {
      if (typeof btn.setAttribute === 'function') btn.setAttribute('disabled', '');
    } else if (typeof btn.removeAttribute === 'function') {
      btn.removeAttribute('disabled');
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (
        is3DViewActive() ||
        btn.disabled ||
        (typeof btn.hasAttribute === 'function' && btn.hasAttribute('disabled'))
      ) {
        return;
      }
      const id = btn.dataset.snapId;
      const vm = viewModels.find((x) => x.id === id);
      if (vm) {
        vm.onToggle(!vm.enabled);
        renderSnapToggles();
        redraw();
      }
    });
  });

  const bindIncrementInput = (selector, settingKey, applyFn) => {
    const inputEl =
      typeof container.querySelector === 'function' ? container.querySelector(selector) : null;
    if (!inputEl) return;

    const labelEl =
      inputEl.id && typeof container.querySelector === 'function'
        ? container.querySelector(`label[for="${inputEl.id}"]`)
        : null;
    if (labelEl && typeof labelEl.addEventListener === 'function') {
      labelEl.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof inputEl.focus === 'function') inputEl.focus();
      });
    }

    const readRawValue = (e) =>
      e && e.detail && e.detail.value !== undefined ? e.detail.value : inputEl.value;

    inputEl.addEventListener('click', (e) => {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    });

    inputEl.addEventListener('input', (e) => {
      const updated = applyFn(readRawValue(e));
      if (updated) {
        if (typeof inputEl.removeAttribute === 'function') inputEl.removeAttribute('aria-invalid');
        redraw();
      } else if (typeof inputEl.setAttribute === 'function') {
        inputEl.setAttribute('aria-invalid', 'true');
      }
    });

    inputEl.addEventListener('change', (e) => {
      const updated = applyFn(readRawValue(e));
      if (updated) {
        if (typeof inputEl.removeAttribute === 'function') inputEl.removeAttribute('aria-invalid');
        redraw();
      } else {
        if (typeof inputEl.removeAttribute === 'function') inputEl.removeAttribute('aria-invalid');
        inputEl.value = String(interaction.gridSettings[settingKey]);
      }
    });
  };

  bindIncrementInput('#snap-unit-size', 'unitSize', gridVm.onUnitSizeChange);
  bindIncrementInput('#snap-angle-degrees', 'angleSnapDegrees', gridVm.onAngleSnapDegreesChange);
}

function renderBlueprintDropzone(bg = doc.background) {
  const dropzone = $('#blueprint-dropzone');
  if (!dropzone) return;
  const hasBg = Boolean(bg && (bg.dataUrl || bg.presetKey));
  const is3D = Boolean(canvas && canvas.hidden);
  dropzone.hidden = hasBg || is3D;
  dropzone.classList?.toggle('drag-over', Boolean(isCanvasDragOver));
}

export function renderBgToolbar() {
  const bg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : doc.background;
  renderBlueprintDropzone(bg);
  const bgBar = $('#bg-toolbar');
  if (!bgBar) return;
  if (bg && (bg.dataUrl || bg.presetKey)) {
    bgBar.hidden = false;
    const vis = $('#bg-visible');
    if (vis) vis.checked = bg.visible !== false;
    const op = $('#bg-opacity');
    if (op) {
      op.value = bg.opacity ?? 0.5;
      updateRangeAriaValueText(op, 'percent');
    }
    const mapSelect = $('#bg-map-preset');
    if (mapSelect) mapSelect.value = bg.presetKey || '';
    const gisMapSelect = $('#gis-map-preset');
    if (gisMapSelect) gisMapSelect.value = bg.presetKey || '';
    const lockBtn = $('#bg-lock-btn');
    if (lockBtn) {
      lockBtn.innerHTML = `<span aria-hidden="true">${bg.locked ? '🔒' : '🔓'}</span> ${bg.locked ? 'Locked' : 'Unlocked'}`;
      lockBtn.setAttribute('aria-pressed', bg.locked ? 'true' : 'false');
    }
  } else {
    bgBar.hidden = true;
    const mapSelect = $('#bg-map-preset');
    if (mapSelect) mapSelect.value = '';
    const gisMapSelect = $('#gis-map-preset');
    if (gisMapSelect) gisMapSelect.value = '';
    const lockBtn = $('#bg-lock-btn');
    if (lockBtn) {
      lockBtn.innerHTML = '<span aria-hidden="true">🔓</span> Unlocked';
      lockBtn.setAttribute('aria-pressed', 'false');
    }
  }
}

function renderHistoryTimeline() {
  const listEl = $('#history-list');
  if (!listEl) return;
  const focusedIndex =
    typeof document !== 'undefined' &&
    document.activeElement?.classList?.contains?.('history-item') &&
    (typeof listEl.contains !== 'function' || listEl.contains(document.activeElement))
      ? document.activeElement.dataset?.index
      : null;
  const timeline = hist.getTimeline();
  listEl.innerHTML = timeline
    .map((item) => {
      const timeStr = item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        : '';
      const activeClass = item.active ? 'active' : '';
      const activeAttr = item.active ? 'aria-current="true"' : '';
      return `<li class="history-item ${activeClass}" data-index="${item.index}" ${activeAttr} tabindex="0" role="button">
        <span class="history-item-label">${esc(item.label || 'Action')}</span>
        <span class="history-item-time">${esc(timeStr)}</span>
      </li>`;
    })
    .join('');

  listEl.querySelectorAll('.history-item').forEach((el) => {
    const jumpToItem = () => {
      const idx = Number(el.dataset.index);
      if (!isNaN(idx)) {
        const s = hist.jumpTo(idx);
        if (s) {
          doc = s;
          persist();
          selection = null;
          autoFixDiffs = [];
          hoveredDiffIndex = null;
          refresh();
        }
      }
    };
    el.addEventListener('click', jumpToItem);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        jumpToItem();
      }
    });
  });

  if (focusedIndex !== null && focusedIndex !== undefined) {
    const popover = $('#history-popover');
    if (popover && !popover.hidden) {
      const nextFocusEl = listEl.querySelector(`.history-item[data-index="${focusedIndex}"]`);
      nextFocusEl?.focus();
    }
  }
}

function refresh() {
  report = evaluate(doc);
  complianceManager.syncState(doc);
  renderSnapToggles();
  renderLevels();
  renderCompliance();
  renderInspector();
  renderBgToolbar();
  renderDiffDrawer();
  updateWallAngleHud();
  if (typeof window !== 'undefined') window.__scene3d?.update();
  view3d?.syncOverlay?.();
  const undoBtn = $('#undo');
  if (undoBtn) {
    undoBtn.disabled = !hist.canUndo();
    const label = hist.peekUndoLabel();
    undoBtn.title = label ? `Undo ${label} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
  }
  const redoBtn = $('#redo');
  if (redoBtn) {
    redoBtn.disabled = !hist.canRedo();
    const label = hist.peekRedoLabel();
    redoBtn.title = label ? `Redo ${label} (Ctrl+Y)` : 'Redo (Ctrl+Y)';
  }
  renderHistoryTimeline();
  const planNameEl = $('#plan-name');
  if (planNameEl) planNameEl.value = doc.name;
  const zoomLabelEl = $('#zoom-label');
  if (zoomLabelEl) zoomLabelEl.textContent = `${Math.round((view.scale / 1.6) * 100)}%`;
  redraw();
}

export function apply(mutate, opts = {}) {
  const options = typeof opts === 'string' ? { label: opts } : opts;
  const { quiet = false, label = 'Action' } = options;
  const autoEl = $('#auto');
  const r = commit(doc, mutate, { autoFix: autoEl ? autoEl.checked : false });
  if (!r.ok) {
    toast(
      `Blocked by building code:\n• ${[...new Set(r.reasons.map((v) => v.msg))].slice(0, 4).join('\n• ')}`,
      true
    );
    return r;
  }
  doc = r.state;
  hist.push(doc, label);
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

function tryPreview(mutate, options = {}) {
  const next = M.clone(doc);
  mutate(next);
  const base = blockingIds(doc);
  const rep = options.affectedBox
    ? evaluate(next, { affectedBox: options.affectedBox })
    : evaluate(next);
  const fresh = rep.violations.filter((v) => v.blocking && !base.has(v.id));
  return { next, ok: !fresh.length, fresh };
}

// ------------------------------------------------------------- geometry picking
export function nearestWall(p, maxDist = 14, only = null) {
  let best = null;
  for (const room of only ? [only] : levelRooms()) {
    const pts = getRoomPoints(room);
    const inside = pointInPolygon(p, pts) ? 0 : 1; // prefer the room the pointer is inside of
    for (const wall of getRoomWallKeys(room)) {
      const s = wallSeg(room, wall);
      const t = Math.max(0, Math.min(s.len, (p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy));
      const cx = s.ax + s.dx * t;
      const cy = s.ay + s.dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      const score = d + (inside ? 0.3 : 0);
      if (d <= maxDist && (!best || score < best.score)) best = { room, wall, t, d, score };
    }
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
  const snapRes = snappingBridge.computeSnap(p, p);
  const targetP = snapRes && snapRes.point ? snapRes.point : p;

  const room = roomAt(targetP) || roomAt(p);
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
    const nw = nearestWall(targetP, 40, room);
    if (!nw) return null;
    const len = wallLength(room, nw.wall);
    const rawOffset = Math.max(8, Math.min(len - 8, nw.t));
    const offset = rawOffset;
    return {
      room,
      props: { wall: nw.wall, offset: Math.max(8, Math.min(len - 8, offset)) },
    };
  }
  if (def.mount === 'ceiling') {
    const candPt = { x: targetP.x, y: targetP.y };
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
        (targetP.x - s.ax - (s.nx * WT) / 2) * s.nx + (targetP.y - s.ay - (s.ny * WT) / 2) * s.ny
      );
      if (dist <= def.d / 2 + 10 && (!best || dist < best.dist)) best = { wall, dist };
    }
    if (best) {
      const horizontal = best.wall === 'N' || best.wall === 'S';
      const swap = best.wall === 'E' || best.wall === 'W';
      const itemLen = swap ? def.d : def.w;
      const span = horizontal ? ir.w : ir.h;
      const start = horizontal ? ir.x : ir.y;
      const rawAlong = (horizontal ? targetP.x : targetP.y) - start - itemLen / 2;
      const along = Math.max(0, Math.min(span - itemLen, rawAlong));
      const props = M.backToWall(room, def, best.wall, along, 0);
      const candPoly = itemToPolygon({ ...props }, def);
      const validation = validatePlacement(candPoly, existingPolygons);
      return { room, props, feedback: createPlacementFeedback(candPoly, validation) };
    }
  }

  const candidateItem = { x: targetP.x, y: targetP.y, rot };
  const candPoly = itemToPolygon(candidateItem, def);
  const entity = { position: { x: targetP.x, y: targetP.y }, rotation: rot, polygon: candPoly };
  const moveRes = interaction.moveEntity(entity, { x: targetP.x, y: targetP.y }, context);
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

function _snapRect(rect, ignoreId) {
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

export function badIds(rep) {
  const s = new Set();
  if (!rep || !rep.violations) return s;
  for (const v of rep.violations) {
    if (v.severity !== 'error' && v.severity !== 'warning') continue;
    for (const k of ['itemId', 'openingId', 'roomId', 'wallId']) {
      if (v[k]) s.add(v[k]);
    }
    if (v.wall !== undefined && v.roomId) {
      s.add(`${v.roomId}:${v.wall}`);
      s.add(`${v.roomId}:wall:${v.wall}`);
    }
    if (v.target && !s.has(v.target)) {
      s.add(v.target);
    }
  }
  return s;
}

export function updatePlanA11yTree(state, curLevel = 0) {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
  if (a11yDebounceTimer) clearTimeout(a11yDebounceTimer);
  a11yDebounceTimer = setTimeout(() => {
    const summaryContainer = document.getElementById('plan-fallback-summary');
    if (!summaryContainer) return;

    const roomsOnLevel = ((state && state.rooms) || []).filter((r) => (r.level || 0) === curLevel);
    if (roomsOnLevel.length === 0) {
      summaryContainer.innerHTML = `<p>Level ${curLevel + 1} is empty. Use drafting tools to add rooms or furniture.</p>`;
      return;
    }

    let html = `<p>Level ${curLevel + 1} floorplan contains ${roomsOnLevel.length} room(s):</p><ul>`;
    for (const r of roomsOnLevel) {
      const wFeet = Math.round((r.w / 12) * 10) / 10;
      const hFeet = Math.round((r.h / 12) * 10) / 10;
      const itemList = (r.items || []).map((it) => ITEM_BY_ID[it.type]?.name || it.type).join(', ');
      const openingList = (r.openings || [])
        .map((o) => OPENING_BY_ID[o.type]?.name || o.type)
        .join(', ');

      html += `<li><strong>${r.name}</strong>: ${wFeet} ft by ${hFeet} ft. `;
      html += `Openings: ${openingList || 'None'}. `;
      html += `Items: ${itemList || 'None'}.</li>`;
    }
    html += '</ul>';
    summaryContainer.innerHTML = html;
  }, 200);
}

function redraw() {
  const state = preview ? preview.next : doc;
  if (!ctx) {
    updatePlanA11yTree(state, curLevel);
    return;
  }
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const rep = preview ? complianceManager.getLatestReport() || evaluate(preview.next) : report;
  const bad = new Set([
    ...badIds(rep),
    ...(complianceManager.getBadTargetIds ? complianceManager.getBadTargetIds() : []),
  ]);
  complianceScene.update(state, rep, {
    curLevel,
    selection,
    drag,
    hover,
    view,
    preview,
    freshViolations: preview?.fresh || [],
  });
  if (ctx && canvas) {
    draw(ctx, { ...state, rooms: state.rooms.filter((r) => (r.level || 0) === curLevel) }, view, {
      dpr,
      gridSettings: interaction.gridSettings,
      complianceScene,
      snappingBridge,
      bad,
      selection,
      hover,
      activeHudNodeId: wallHudState.open && wallHudState.focused ? wallHudState.nodeId : null,
      openingUnits: getOpeningUnitMode(),
      hoveredOpeningHudSide,
      activeOpeningHudSide: activeHudEdit?.side || null,
      under: curLevel > 0 ? state.rooms.filter((r) => (r.level || 0) === curLevel - 1) : [],
      autoFixDiffs: preview ? [] : autoFixDiffs,
      hoveredDiffIndex,
      overlay: (c) => drawOverlay(c, state),
    });
  }
  syncPassiveWallHud();
  updateWallHudPosition();
  if (activeHudEdit) syncOpeningHudPosition();
  updatePlanA11yTree(state, curLevel);
}

export function drawOverlay(c, _state) {
  if (isCanvasDragOver && c) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cw = (c.canvas?.width || 800) / dpr;
    const ch = (c.canvas?.height || 600) / dpr;
    const scale = view.scale || 1;
    const inset = 14 / scale;
    const rx = -view.ox / scale + inset;
    const ry = -view.oy / scale + inset;
    const rw = Math.max(0, cw / scale - inset * 2);
    const rh = Math.max(0, ch / scale - inset * 2);
    if (rw > 0 && rh > 0) {
      c.save();
      c.fillStyle = 'rgba(59, 130, 246, 0.08)';
      c.strokeStyle = getToken('--ktheme-accent', '#2f6f5e');
      c.lineWidth = 3 / scale;
      c.setLineDash([8 / scale, 6 / scale]);
      c.fillRect(rx, ry, rw, rh);
      c.strokeRect(rx, ry, rw, rh);
      c.restore();
    }
  }

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
      c.strokeStyle = getToken('--ktheme-critical');
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

  const sequentialPts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
  if (sequentialPts && sequentialPts.length > 0) {
    c.save();
    const hudPreviewInvalid =
      wallHudState.open && wallHudState.mode === 'draw-corner' && Boolean(wallHudState.error);
    c.strokeStyle = hudPreviewInvalid ? '#ef4444' : '#2a7fff';
    c.fillStyle = hudPreviewInvalid ? 'rgba(239, 68, 68, 0.2)' : 'rgba(42, 127, 255, 0.2)';
    c.lineWidth = 2 / view.scale;
    c.beginPath();
    c.moveTo(sequentialPts[0].x, sequentialPts[0].y);
    for (let i = 1; i < sequentialPts.length; i++) {
      const segBulge = interaction.getEdgeBulge ? interaction.getEdgeBulge(i - 1) : 0;
      if (Math.abs(segBulge) > 1e-9) {
        const arcPts = tessellateArc(sequentialPts[i - 1], sequentialPts[i], segBulge, 24);
        for (let k = 1; k < arcPts.length; k++) {
          c.lineTo(arcPts[k].x, arcPts[k].y);
        }
      } else {
        c.lineTo(sequentialPts[i].x, sequentialPts[i].y);
      }
    }
    const activeSnap = hover ? snappingBridge.getActiveSnap() : null;
    const previewTip =
      wallHudState.open && wallHudState.mode === 'draw-corner' && wallHudState.previewPoint
        ? wallHudState.previewPoint
        : hover
          ? preview?.feedback?.point || activeSnap?.point || hover
          : null;
    if (previewTip) {
      const lastIdx = sequentialPts.length - 1;
      const previewBulge =
        sequentialPts.length < 3 && interaction.getEdgeBulge
          ? interaction.getEdgeBulge(lastIdx)
          : 0;
      if (Math.abs(previewBulge) > 1e-9) {
        const arcPts = tessellateArc(sequentialPts[lastIdx], previewTip, previewBulge, 24);
        for (let k = 1; k < arcPts.length; k++) {
          c.lineTo(arcPts[k].x, arcPts[k].y);
        }
      } else {
        c.lineTo(previewTip.x, previewTip.y);
      }
    }
    c.stroke();

    if (sequentialPts.length >= 3) {
      const closeIdx = sequentialPts.length - 1;
      const closeBulge = interaction.getEdgeBulge ? interaction.getEdgeBulge(closeIdx) : 0;
      c.save();
      c.setLineDash([5 / view.scale, 4 / view.scale]);
      c.globalAlpha = 0.75;
      c.beginPath();
      c.moveTo(sequentialPts[closeIdx].x, sequentialPts[closeIdx].y);
      if (Math.abs(closeBulge) > 1e-9) {
        const arcPts = tessellateArc(sequentialPts[closeIdx], sequentialPts[0], closeBulge, 24);
        for (let k = 1; k < arcPts.length; k++) {
          c.lineTo(arcPts[k].x, arcPts[k].y);
        }
      } else {
        c.lineTo(sequentialPts[0].x, sequentialPts[0].y);
      }
      c.stroke();
      c.restore();
    }

    for (const pt of sequentialPts) {
      c.beginPath();
      c.arc(pt.x, pt.y, 4 / view.scale, 0, Math.PI * 2);
      c.fillStyle = '#2a7fff';
      c.fill();
    }
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
    const snapRes = snappingBridge.computeSnap(hover, hover);
    const targetP = snapRes && snapRes.point ? snapRes.point : hover;
    const rc = {
      x: targetP.x - kit.w / 2,
      y: targetP.y - kit.h / 2,
      w: kit.w,
      h: kit.h,
    };
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
    const snapRes = snappingBridge.computeSnap(hover, hover);
    const targetP = snapRes && snapRes.point ? snapRes.point : hover;
    const nw = nearestWall(targetP) || nearestWall(hover);
    if (nw) {
      const def = OPENING_BY_ID[tool.id];
      const offset = M.clampOpeningOffset(nw.room, nw.wall, nw.t - def.w / 2, def.w);
      const a = wallPoint(nw.room, nw.wall, offset, 0);
      const b = wallPoint(nw.room, nw.wall, offset + def.w, 0);
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
        const wallsToDraw =
          paintScope === 'single' && rm === nw.room ? [nw.wall] : getRoomWallKeys(rm);
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
  return `<li class="v-item">
    <button type="button" class="v-item-btn ${v.severity}" data-id="${v.id}" aria-label="${esc(title)}: ${esc(v.msg)} (${esc(v.ref)})">
      <b>${esc(title)}</b>
      <div class="msg">${esc(v.msg)}</div>
      <span class="ref" title="${esc(v.ref)}">${esc(v.ref)}${v.fixable ? ' · auto-fixable' : ''}</span>
    </button>
  </li>`;
}

// ------------------------------------------------------------- compliance + inspector panels
function renderCompliance() {
  const el = $('#compliance');
  if (!el) return;
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
    <ul class="v">${[...errs, ...warns].map(renderViolationItem).join('') || (doc.rooms.length ? '<li style="border-color:var(--ktheme-success);cursor:default">No issues found.</li>' : '<li style="border-color:var(--ktheme-text-muted);cursor:default">Place a room kit from the Kits tab to begin. Every edit is checked as you go.</li>')}</ul>
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
  el.querySelectorAll('.v-item-btn[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = report.violations.find((x) => x.id === btn.dataset.id);
      const id = v ? v.itemId || v.openingId || v.roomId : null;
      if (id) {
        select(id);
        focus(id);
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

export function select(target, { toggle = false, append = false } = {}) {
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

  if (activeHudEdit && selection !== activeHudEdit.openingId) {
    closeOpeningHudEditor();
  }

  renderInspector();
  updateWallAngleHud();
  redraw();
  view3d?.syncSelection?.(typeof selection === 'string' ? selection : null);
}

const isInvalidNumericInput = (raw) =>
  raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(Number(raw));

export function getDoc() {
  return doc;
}

export function renderInspector() {
  const el = $('#inspector');
  if (!el) return;
  const selectedList = getSelectionList();

  if (selectedList.length === 0) {
    const bPresets = getBuildingPresets();
    const cPresets = getCladdingPresets();
    el.innerHTML = `<h3>Inspector</h3>
      <p class="note" style="margin:0 0 10px">Select a room, door, window or item to edit it. Shift-click or drag marquee to select multiple. Drag to move; drag room corners to resize; <b>R</b> rotates, <b>Del</b> removes.</p>
      <hr style="margin:10px 0;border:none;border-top:1px solid var(--border,#ccc)">
      <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Building Design & Cladding Presets</h4>
      ${formRow(
        'i-plan-bpreset',
        'Building Preset',
        `<select id="i-plan-bpreset">${Object.values(bPresets)
          .map((bp) => `<option value="${bp.key}">${esc(bp.name)}</option>`)
          .join('')}</select>`
      )}
      <div class="btns" style="margin:6px 0 12px">
        <button id="i-plan-bpreset-apply">Apply Building Preset to Whole Plan</button>
      </div>
      ${formRow(
        'i-plan-cladding',
        'Exterior Cladding',
        `<select id="i-plan-cladding">${Object.values(cPresets)
          .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
          .join('')}</select>`
      )}
      <div class="btns" style="margin:6px 0 12px">
        <button id="i-plan-cladding-apply">Apply Exterior Cladding to Whole Plan</button>
      </div>`;

    $('#i-plan-bpreset-apply')?.addEventListener('click', () => {
      const presetKey = $('#i-plan-bpreset')?.value;
      if (presetKey) {
        apply((n) => applyBuildingPreset(n, presetKey, { scope: 'plan' }));
      }
    });

    $('#i-plan-cladding-apply')?.addEventListener('click', () => {
      const claddingKey = $('#i-plan-cladding')?.value;
      if (claddingKey) {
        apply((n) => applyCladdingMaterial(n, claddingKey, { scope: 'plan' }));
      }
    });
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
        ${formRow(
          'dist-spacing-input',
          'Spacing',
          `<input id="dist-spacing-input" type="text" placeholder="Auto (e.g. 16&quot;, 2' 6&quot;)" value="${esc(distSpacingInput)}">`
        )}
        ${formRow(
          'dist-spacing-type',
          'Mode',
          `<select id="dist-spacing-type">
            <option value="center" ${distSpacingType === 'center' ? 'selected' : ''}>Center-to-Center</option>
            <option value="gap" ${distSpacingType === 'gap' ? 'selected' : ''}>Edge-to-Edge Gap</option>
          </select>`
        )}
        <div class="align-grid" style="margin-top:6px">
          <button id="dist-h" class="align-btn" title="Distribute Horizontally" ${selectedList.length < 3 && !(M.parseDistanceInInches(distSpacingInput) > 0) ? 'disabled' : ''}>Horizontal</button>
          <button id="dist-v" class="align-btn" title="Distribute Vertically" ${selectedList.length < 3 && !(M.parseDistanceInInches(distSpacingInput) > 0) ? 'disabled' : ''}>Vertical</button>
        </div>
      </div>
      <div class="btns" style="margin-top:14px">
        <button id="i-del-all">Delete all selected</button>
      </div>`;

    $('#align-left')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'left'), 'Align Left')
    );
    $('#align-center')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'center'), 'Align Center')
    );
    $('#align-right')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'right'), 'Align Right')
    );
    $('#align-top')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'top'), 'Align Top')
    );
    $('#align-middle')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'middle'), 'Align Middle')
    );
    $('#align-bottom')?.addEventListener('click', () =>
      apply((n) => M.alignItems(n, selectedList, 'bottom'), 'Align Bottom')
    );

    const syncDistControls = () => {
      distSpacingInput = $('#dist-spacing-input')?.value ?? '';
      distSpacingType = $('#dist-spacing-type')?.value || 'center';
      const parsed = M.parseDistanceInInches(distSpacingInput);
      const hasExplicit = typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0;
      const canDistribute = selectedList.length >= 3 || (selectedList.length >= 2 && hasExplicit);
      const btnH = $('#dist-h');
      const btnV = $('#dist-v');
      if (btnH) btnH.disabled = !canDistribute;
      if (btnV) btnV.disabled = !canDistribute;
    };

    const readDistOptions = () => {
      distSpacingInput = $('#dist-spacing-input')?.value ?? '';
      distSpacingType = $('#dist-spacing-type')?.value || 'center';
      const parsed = M.parseDistanceInInches(distSpacingInput);
      const spacing =
        typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      return { spacing, spacingType: distSpacingType };
    };

    $('#dist-spacing-input')?.addEventListener('input', syncDistControls);
    $('#dist-spacing-type')?.addEventListener('change', syncDistControls);

    $('#dist-h')?.addEventListener('click', () => {
      const { spacing, spacingType } = readDistOptions();
      apply(
        (n) => M.distributeItems(n, selectedList, 'horizontal', spacing, spacingType),
        'Distribute Horizontally'
      );
    });
    $('#dist-v')?.addEventListener('click', () => {
      const { spacing, spacingType } = readDistOptions();
      apply(
        (n) => M.distributeItems(n, selectedList, 'vertical', spacing, spacingType),
        'Distribute Vertically'
      );
    });

    $('#i-del-all')?.addEventListener('click', () => {
      const count = selectedList.length;
      const r = apply((n) => M.removeSet(n, selectedList), 'Delete Selection');
      if (r.ok) {
        select(null);
        toast(`Deleted ${count} selected elements`, false, 4500, UNDO_TOAST_ACTION);
      }
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
    const win = typeof window !== 'undefined' ? window : globalThis;
    const roomPts = getRoomPoints(room);
    const wallNameMap = {
      N: 'North (N)',
      E: 'East (E)',
      S: 'South (S)',
      W: 'West (W)',
    };
    const uvWallKeys = getRoomWallKeys(room).map((wk) => String(wk));
    if (
      win.__activeUVWall === undefined ||
      win.__activeUVWall === null ||
      !uvWallKeys.includes(String(win.__activeUVWall))
    ) {
      win.__activeUVWall = uvWallKeys[0];
    }
    if (!win.__activeAssemblyScope) win.__activeAssemblyScope = 'single';
    const activeWall = String(win.__activeUVWall);
    const activeWallLabel =
      roomPts.length === 4 ? activeWall : `Wall ${resolveWallIndex(activeWall) + 1}`;
    const activeAssemblyScope = win.__activeAssemblyScope;
    const uv = M.getWallUV(room, activeWall);
    const wallFinishId = M.getWallFinish(room, activeWall);
    let activeExtFinId = room.cladding || room.exteriorCladding;
    if (!activeExtFinId && WALL_BY_ID[wallFinishId]?.exterior) {
      activeExtFinId = wallFinishId;
    }
    activeExtFinId = activeExtFinId || 'cladding_siding_white';
    const assembly = resolveWallAssembly(
      wallFinishId,
      activeExtFinId,
      M.getWallAssemblyOverrides(room, activeWall)
    );
    const fmtInches = (v) => Number(Number(v).toFixed(3));
    const finishObj = WALL_BY_ID[wallFinishId];
    const finishLabel = finishObj
      ? finishObj.name
      : wallFinishId.startsWith('tex_')
        ? `Custom Texture (${wallFinishId.slice(0, 10)})`
        : wallFinishId;

    const wallRowsHtml = roomPts
      .map((_, wIdx) => {
        const wKey = roomPts.length === 4 ? WALLS[wIdx] : String(wIdx);
        const wLabel = roomPts.length === 4 ? wallNameMap[wKey] : `Wall ${wIdx + 1}`;
        const segLen = wallLength(room, wIdx);
        const inputId = `i-wall-len-${wKey}`;
        const roundedIn = Number(segLen.toFixed(2));
        return `<tr data-wall-row="${esc(wKey)}">
          <td><label for="${esc(inputId)}">${esc(wLabel)}</label></td>
          <td class="wall-segment-table__fmt">${esc(fmtLen(segLen))}</td>
          <td>
            <input
              id="${esc(inputId)}"
              class="i-wall-len-input"
              type="text"
              data-wall-key="${esc(wKey)}"
              data-wall-index="${wIdx}"
              value="${roundedIn}"
              aria-label="${esc(wLabel)} wall length"
            />
          </td>
        </tr>`;
      })
      .join('');
    const curveWallKeys =
      roomPts.length === 4 ? ['N', 'E', 'S', 'W'] : roomPts.map((_, idx) => String(idx));
    if (!win.__activeCurveWall || !curveWallKeys.includes(String(win.__activeCurveWall))) {
      const firstCurved = curveWallKeys.find((wk) => Math.abs(M.getWallBulge(room, wk)) > 1e-9);
      win.__activeCurveWall = firstCurved || curveWallKeys[0];
    }
    const activeCurveWall = win.__activeCurveWall;
    const curveSeg = getWallEdgeSegment(room, activeCurveWall);
    const curBulge = curveSeg.bulge;
    const curChord = curveSeg.chordLen;
    const curSagitta = sagittaFromBulge(curChord, curBulge);
    const curRadiusStr = formatCurveRadiusDisplay(curChord, curBulge);

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
      ${formRow('i-w', 'Width (ft)', `<input id="i-w" type="text" value="${esc(fmtLen(room.w))}">`)}
      ${formRow('i-h', 'Depth (ft)', `<input id="i-h" type="text" value="${esc(fmtLen(room.h))}">`)}
      ${formRow('i-ceil', 'Ceiling (in)', `<input id="i-ceil" type="text" value="${esc(fmtLen(room.ceiling))}">`)}
      <div class="inspector-coords-group" style="margin-top:10px;padding:8px;background:rgba(0,0,0,0.03);border:1px solid var(--border,#ddd);border-radius:6px">
        <h4 style="margin:0 0 6px;font-size:0.85rem;font-weight:600">3D Coordinates &amp; Rotation</h4>
        ${formRow('i-pos-x', 'Position X (in)', `<input id="i-pos-x" type="number" step="any" value="${formatNumericInput(room.x)}">`)}
        ${formRow('i-pos-y', 'Position Y (in)', `<input id="i-pos-y" type="number" step="any" value="${formatNumericInput(room.y)}">`)}
        ${formRow('i-pos-z', 'Elevation Z (in)', `<input id="i-pos-z" type="number" step="any" value="${formatNumericInput(Number.isFinite(room.z) ? room.z : 0)}">`)}
        ${formRow('i-rot-deg', 'Rotation (°)', `<input id="i-rot-deg" type="number" step="15" min="0" max="360" value="${formatNumericInput(normalizeRotationDegrees(room.rot ?? 0, 0))}">`)}
      </div>
      <div class="wall-segment-editor">
        <h4 class="wall-segment-editor__title">Wall Segment Lengths</h4>
        <table class="wall-segment-table" aria-label="Wall segment lengths">
          <thead>
            <tr>
              <th scope="col">Wall</th>
              <th scope="col">Span</th>
              <th scope="col">Length</th>
            </tr>
          </thead>
          <tbody>${wallRowsHtml}</tbody>
        </table>
        <div id="i-wall-len-error" class="wall-segment-editor__error" role="alert" aria-live="assertive" hidden></div>
      </div>
      <div class="curve-inspector-group">
        <div class="curve-inspector-head">
          <h4>Parametric Wall Curve</h4>
          <span id="i-curve-chord" class="curve-chord-badge">Chord: ${formatCurveNumber(curChord, 1)}"</span>
        </div>
        ${formRow(
          'i-curve-wall',
          'Wall Segment',
          `<select id="i-curve-wall">${curveWallKeys
            .map((wk, idx) => {
              const wb = M.getWallBulge(room, wk);
              const tag = Math.abs(wb) > 1e-9 ? ' ⌒' : '';
              const label =
                roomPts.length === 4
                  ? `${{ N: 'North (N)', E: 'East (E)', S: 'South (S)', W: 'West (W)' }[wk]}${tag}`
                  : `Wall ${idx + 1}${tag}`;
              return `<option value="${wk}" ${String(wk) === String(activeCurveWall) ? 'selected' : ''}>${label}</option>`;
            })
            .join('')}</select>`
        )}
        ${formRow(
          'i-curve-radius',
          'Arc Radius (in)',
          `<input id="i-curve-radius" type="text" inputmode="decimal" placeholder="∞ (Linear)" value="${esc(curRadiusStr)}" autocomplete="off">`
        )}
        ${formRow(
          'i-curve-sagitta',
          'Sagitta (in)',
          `<input id="i-curve-sagitta" type="number" step="0.5" value="${formatCurveNumber(curSagitta, 2)}">`
        )}
        ${formRow(
          'i-curve-bulge',
          'Bulge Factor',
          `<input id="i-curve-bulge" type="number" step="0.05" value="${formatCurveNumber(curBulge, 4)}">`
        )}
        <div class="btns curve-inspector-actions">
          <button type="button" id="i-curve-invert" title="Invert curve concavity">⇄ Invert Concavity</button>
          <button type="button" id="i-curve-reset" title="Reset wall to linear (zero bulge)">Linear Wall</button>
        </div>
        <div id="i-curve-error" class="curve-input-error" role="alert" aria-live="assertive" hidden></div>
      </div>
      <div style="margin-top:10px;padding:8px;background:rgba(0,0,0,0.03);border:1px solid var(--border,#ddd);border-radius:6px">
        <h4 style="margin:0 0 6px;font-size:0.85rem;font-weight:600">Single-Pointer Step Nudge</h4>
        <div style="font-size:0.75rem;margin-bottom:2px">Position X (${formatNumericInput(room.x)}")</div>
        <div class="row" style="margin-bottom:6px;display:flex;gap:4px">
          <button type="button" class="i-nudge-btn" data-target="pos-x" data-step="-6" style="flex:1;padding:3px">-6"</button>
          <button type="button" class="i-nudge-btn" data-target="pos-x" data-step="-1" style="flex:1;padding:3px">-1"</button>
          <button type="button" class="i-nudge-btn" data-target="pos-x" data-step="1" style="flex:1;padding:3px">+1"</button>
          <button type="button" class="i-nudge-btn" data-target="pos-x" data-step="6" style="flex:1;padding:3px">+6"</button>
        </div>
        <div style="font-size:0.75rem;margin-bottom:2px">Position Y (${formatNumericInput(room.y)}")</div>
        <div class="row" style="margin-bottom:6px;display:flex;gap:4px">
          <button type="button" class="i-nudge-btn" data-target="pos-y" data-step="-6" style="flex:1;padding:3px">-6"</button>
          <button type="button" class="i-nudge-btn" data-target="pos-y" data-step="-1" style="flex:1;padding:3px">-1"</button>
          <button type="button" class="i-nudge-btn" data-target="pos-y" data-step="1" style="flex:1;padding:3px">+1"</button>
          <button type="button" class="i-nudge-btn" data-target="pos-y" data-step="6" style="flex:1;padding:3px">+6"</button>
        </div>
        <div style="font-size:0.75rem;margin-bottom:2px">Width (${room.w}")</div>
        <div class="row" style="margin-bottom:6px;display:flex;gap:4px">
          <button type="button" class="i-nudge-btn" data-target="width" data-step="-6" style="flex:1;padding:3px">-6"</button>
          <button type="button" class="i-nudge-btn" data-target="width" data-step="-1" style="flex:1;padding:3px">-1"</button>
          <button type="button" class="i-nudge-btn" data-target="width" data-step="1" style="flex:1;padding:3px">+1"</button>
          <button type="button" class="i-nudge-btn" data-target="width" data-step="6" style="flex:1;padding:3px">+6"</button>
        </div>
        <div style="font-size:0.75rem;margin-bottom:2px">Depth (${room.h}")</div>
        <div class="row" style="margin-bottom:6px;display:flex;gap:4px">
          <button type="button" class="i-nudge-btn" data-target="depth" data-step="-6" style="flex:1;padding:3px">-6"</button>
          <button type="button" class="i-nudge-btn" data-target="depth" data-step="-1" style="flex:1;padding:3px">-1"</button>
          <button type="button" class="i-nudge-btn" data-target="depth" data-step="1" style="flex:1;padding:3px">+1"</button>
          <button type="button" class="i-nudge-btn" data-target="depth" data-step="6" style="flex:1;padding:3px">+6"</button>
        </div>
      </div>
      <div class="btns"><button id="i-del">Delete room</button></div>

      <hr style="margin:14px 0 10px;border:none;border-top:1px solid var(--border,#ccc)">
      <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Advanced Material Mapping (UV)</h4>
      ${formRow(
        'i-uv-wall',
        'Wall Face',
        `<select id="i-uv-wall">${uvWallKeys
          .map((wk, idx) => {
            const label = roomPts.length === 4 ? wallNameMap[wk] : `Wall ${idx + 1}`;
            return `<option value="${esc(wk)}" ${String(wk) === activeWall ? 'selected' : ''}>${esc(label)}</option>`;
          })
          .join('')}</select>`
      )}
      <div class="row" style="margin:6px 0;display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span style="font-size:0.8rem;color:var(--text-muted,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(finishLabel)}">Finish: <b>${esc(finishLabel)}</b></span>
        <button id="i-custom-tex-btn" style="font-size:0.75rem;padding:3px 8px;white-space:nowrap">Upload Texture</button>
        <input type="file" id="i-custom-tex-file" accept="image/*" hidden aria-label="Upload custom texture image">
      </div>

      <div class="uv-controls-group" style="margin-top:8px;background:rgba(0,0,0,0.03);padding:8px;border-radius:6px;border:1px solid var(--border,#ddd)">
        <div class="row" style="margin-bottom:6px">
          <label for="i-uv-scale-u-range" style="font-size:0.8rem;font-weight:600">Scale U</label>
          <div style="display:flex;gap:6px;align-items:center;flex:1">
            <input id="i-uv-scale-u-range" type="range" min="0.1" max="10" step="0.1" value="${uv.scaleU}" style="flex:1" aria-label="Scale U range" aria-valuetext="${formatRangeValueText(uv.scaleU, 'multiplier')}">
            <input id="i-uv-scale-u-num" type="number" step="0.1" min="0.05" max="50" value="${uv.scaleU}" style="width:55px;font-size:0.8rem" aria-label="Scale U numeric">
          </div>
        </div>
        <div class="row" style="margin-bottom:6px">
          <label for="i-uv-scale-v-range" style="font-size:0.8rem;font-weight:600">Scale V</label>
          <div style="display:flex;gap:6px;align-items:center;flex:1">
            <input id="i-uv-scale-v-range" type="range" min="0.1" max="10" step="0.1" value="${uv.scaleV}" style="flex:1" aria-label="Scale V range" aria-valuetext="${formatRangeValueText(uv.scaleV, 'multiplier')}">
            <input id="i-uv-scale-v-num" type="number" step="0.1" min="0.05" max="50" value="${uv.scaleV}" style="width:55px;font-size:0.8rem" aria-label="Scale V numeric">
          </div>
        </div>
        <div class="row" style="margin-bottom:6px">
          <label for="i-uv-rot-range" style="font-size:0.8rem;font-weight:600">Rotation (°)</label>
          <div style="display:flex;gap:6px;align-items:center;flex:1">
            <input id="i-uv-rot-range" type="range" min="0" max="360" step="1" value="${uv.rotation}" style="flex:1" aria-label="Rotation range" aria-valuetext="${formatRangeValueText(uv.rotation, 'degrees')}">
            <input id="i-uv-rot-num" type="number" step="1" min="0" max="360" value="${uv.rotation}" style="width:55px;font-size:0.8rem" aria-label="Rotation numeric">
          </div>
        </div>
        <div class="row" style="margin-bottom:6px">
          <label for="i-uv-off-u-range" style="font-size:0.8rem;font-weight:600">Offset U</label>
          <div style="display:flex;gap:6px;align-items:center;flex:1">
            <input id="i-uv-off-u-range" type="range" min="-2" max="2" step="0.05" value="${uv.offsetU}" style="flex:1" aria-label="Offset U range" aria-valuetext="${formatRangeValueText(uv.offsetU, 'offset')}">
            <input id="i-uv-off-u-num" type="number" step="0.05" min="-10" max="10" value="${uv.offsetU}" style="width:55px;font-size:0.8rem" aria-label="Offset U numeric">
          </div>
        </div>
        <div class="row" style="margin-bottom:6px">
          <label for="i-uv-off-v-range" style="font-size:0.8rem;font-weight:600">Offset V</label>
          <div style="display:flex;gap:6px;align-items:center;flex:1">
            <input id="i-uv-off-v-range" type="range" min="-2" max="2" step="0.05" value="${uv.offsetV}" style="flex:1" aria-label="Offset V range" aria-valuetext="${formatRangeValueText(uv.offsetV, 'offset')}">
            <input id="i-uv-off-v-num" type="number" step="0.05" min="-10" max="10" value="${uv.offsetV}" style="width:55px;font-size:0.8rem" aria-label="Offset V numeric">
          </div>
        </div>
        <div class="row" style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">
          <select id="i-uv-scope" style="font-size:0.8rem;padding:2px 4px" aria-label="UV transform scope">
            <option value="single">Active Wall Only</option>
            <option value="room">Entire Room</option>
            <option value="level">Level</option>
            <option value="plan">Whole Plan</option>
          </select>
          <button id="i-uv-reset" style="font-size:0.8rem;padding:2px 6px">Reset UV</button>
        </div>
      </div>

      <hr style="margin:14px 0 10px;border:none;border-top:1px solid var(--border,#ccc)">
      <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Wall Assembly Layer Thicknesses</h4>
      <div class="wall-assembly-controls-group" style="margin-top:8px;background:rgba(0,0,0,0.03);padding:8px;border-radius:6px;border:1px solid var(--border,#ddd)">
        ${formRow(
          'i-wa-gypsum',
          'Gypsum Board (in)',
          `<input id="i-wa-gypsum" type="number" step="0.125" min="0" max="24" value="${fmtInches(assembly.gypsumThickness)}" aria-label="Gypsum board thickness in inches">`
        )}
        ${formRow(
          'i-wa-stud',
          'Stud Depth (in)',
          `<input id="i-wa-stud" type="number" step="0.25" min="1.5" max="24" value="${fmtInches(assembly.studDepth)}" aria-label="Stud framing depth in inches">`
        )}
        ${formRow(
          'i-wa-sheathing',
          'Sheathing (in)',
          `<input id="i-wa-sheathing" type="number" step="0.125" min="0" max="24" value="${fmtInches(assembly.sheathingThickness)}" aria-label="Sheathing thickness in inches">`
        )}
        ${formRow(
          'i-wa-airgap',
          'Air Gap (in)',
          `<input id="i-wa-airgap" type="number" step="0.125" min="0" max="24" value="${fmtInches(assembly.airGapThickness)}" aria-label="Air gap thickness in inches">`
        )}
        ${formRow(
          'i-wa-cladding',
          'Exterior Cladding (in)',
          `<input id="i-wa-cladding" type="number" step="0.125" min="0" max="24" value="${fmtInches(assembly.claddingThickness)}" aria-label="Exterior cladding thickness in inches">`
        )}
        <div class="row" style="margin:8px 0 6px;display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;padding-top:6px;border-top:1px dashed var(--border,#ddd)">
          <span>Total Assembly Thickness (${esc(activeWallLabel)})</span>
          <strong id="i-wa-total" aria-live="polite">${fmtInches(assembly.totalThickness)}"</strong>
        </div>
        <div class="row" style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;gap:6px">
          <select id="i-wa-scope" style="font-size:0.8rem;padding:2px 4px" aria-label="Wall assembly override scope">
            <option value="single" ${activeAssemblyScope === 'single' ? 'selected' : ''}>Active Wall Only</option>
            <option value="room" ${activeAssemblyScope === 'room' ? 'selected' : ''}>Entire Room</option>
            <option value="level" ${activeAssemblyScope === 'level' ? 'selected' : ''}>Level</option>
            <option value="plan" ${activeAssemblyScope === 'plan' ? 'selected' : ''}>Whole Plan</option>
          </select>
          <button type="button" id="i-wa-reset" style="font-size:0.8rem;padding:2px 6px">Reset Assembly</button>
        </div>
      </div>

      <hr style="margin:14px 0 10px;border:none;border-top:1px solid var(--border,#ccc)">
      <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Building Design & Exterior Cladding</h4>
      ${formRow(
        'i-bpreset',
        'Building Preset',
        `<select id="i-bpreset">${Object.values(getBuildingPresets())
          .map((bp) => `<option value="${bp.key}">${esc(bp.name)}</option>`)
          .join('')}</select>`
      )}
      <div class="row" style="margin:6px 0 12px;display:flex;gap:4px">
        <button id="i-bpreset-room" style="flex:1;font-size:0.75rem;padding:3px 4px">Apply to Room</button>
        <button id="i-bpreset-level" style="flex:1;font-size:0.75rem;padding:3px 4px">Apply to Level</button>
        <button id="i-bpreset-plan" style="flex:1;font-size:0.75rem;padding:3px 4px">Apply to Plan</button>
      </div>

      ${formRow(
        'i-cladding',
        'Cladding Material',
        `<select id="i-cladding">${Object.values(getCladdingPresets())
          .map(
            (c) =>
              `<option value="${c.id}" ${c.id === (room.cladding || 'cladding_siding_white') ? 'selected' : ''}>${esc(c.name)}</option>`
          )
          .join('')}</select>`
      )}
      <div class="row" style="margin:6px 0 12px;display:flex;gap:4px">
        <button id="i-cladding-room" style="flex:1;font-size:0.75rem;padding:3px 4px">Apply to Room</button>
        <button id="i-cladding-level" style="flex:1;font-size:0.75rem;padding:3px 4px">Apply to Level</button>
        <button id="i-cladding-plan" style="flex:1;font-size:0.75rem;padding:3px 4px">Apply to Plan</button>
      </div>`;

    $('#i-name').addEventListener('change', (e) =>
      apply(
        (n) => {
          roomOf(n, room.id).name = e.target.value || room.name;
        },
        { quiet: true, label: 'Rename Room' }
      )
    );
    $('#i-type').addEventListener('change', (e) =>
      apply((n) => {
        const r = roomOf(n, room.id);
        if (r.name === ROOM_TYPES[r.type].name) r.name = ROOM_TYPES[e.target.value].name;
        r.type = e.target.value;
        const clamped = clampRoomDimensions(r, r.w, r.h);
        M.resizeRoom(r, r.x, r.y, clamped.w, clamped.h);
      }, 'Change Room Type')
    );
    $('#i-w').addEventListener('change', (e) => {
      const targetW = M.parseDistanceInInches(e.target.value, { defaultUnit: 'ft' });
      if (targetW === null || targetW <= 0) {
        renderInspector();
        return;
      }
      apply((n) => {
        const r = roomOf(n, room.id);
        const clampedW = clampRoomWidth(r, targetW, r.h);
        M.resizeRoom(r, r.x, r.y, clampedW, r.h);
      }, 'Resize Room Width');
    });
    $('#i-h').addEventListener('change', (e) => {
      const targetH = M.parseDistanceInInches(e.target.value, { defaultUnit: 'ft' });
      if (targetH === null || targetH <= 0) {
        renderInspector();
        return;
      }
      apply((n) => {
        const r = roomOf(n, room.id);
        const clampedH = clampRoomDepth(r, targetH, r.w);
        M.resizeRoom(r, r.x, r.y, r.w, clampedH);
      }, 'Resize Room Depth');
    });
    $('#i-ceil').addEventListener('change', (e) => {
      const targetCeil = M.parseDistanceInInches(e.target.value, { defaultUnit: 'in' });
      if (targetCeil === null || targetCeil <= 0) {
        renderInspector();
        return;
      }
      apply((n) => {
        roomOf(n, room.id).ceiling = targetCeil;
      }, 'Change Ceiling Height');
    });
    const applyExactRoomPosition = (axis, rawValue, inputEl) => {
      const existingPolygons = levelRooms()
        .filter((r) => r.id !== room.id)
        .map((r) => roomToPolygon(r));
      const entity = {
        id: room.id,
        position: { x: room.x, y: room.y },
        polygon: roomToPolygon(room),
      };
      const rawX = axis === 'x' ? rawValue : room.x;
      const rawY = axis === 'y' ? rawValue : room.y;
      const posRes = interaction.setEntityPosition(
        entity,
        { x: rawX, y: rawY },
        { existingPolygons }
      );
      const nextX = posRes.position.x;
      const nextY = posRes.position.y;
      if (nextX === room.x && nextY === room.y) {
        if (inputEl) inputEl.value = formatNumericInput(axis === 'x' ? room.x : room.y);
        return;
      }
      const r = apply((n) => {
        const targetHit = M.findOwner(n, room.id);
        if (targetHit) {
          M.setItemPosition(n, targetHit, nextX + targetHit.obj.w / 2, nextY + targetHit.obj.h / 2);
        }
      }, 'Set Room Position');
      if (r.ok) {
        announceToLiveRegion(
          `${room.name} position set to X ${formatNumericInput(nextX)}", Y ${formatNumericInput(nextY)}".`
        );
      } else {
        renderInspector();
      }
    };
    $('#i-pos-x')?.addEventListener('change', (e) =>
      applyExactRoomPosition('x', e.target.value, e.target)
    );
    $('#i-pos-y')?.addEventListener('change', (e) =>
      applyExactRoomPosition('y', e.target.value, e.target)
    );
    $('#i-pos-z')?.addEventListener('change', (e) => {
      const curZ = Number.isFinite(room.z) ? room.z : 0;
      if (isInvalidNumericInput(e.target.value)) {
        e.target.value = formatNumericInput(curZ);
        return;
      }
      const nextZ = Math.round(parseCoordinateInput(e.target.value, curZ) * 100) / 100;
      if (nextZ === curZ) {
        e.target.value = formatNumericInput(curZ);
        return;
      }
      const res = apply((n) => {
        const r = roomOf(n, room.id);
        if (r) r.z = nextZ;
      }, 'Set Room Elevation Z');
      if (res.ok) {
        announceToLiveRegion(`${room.name} elevation set to Z ${formatNumericInput(nextZ)}".`);
      } else {
        e.target.value = formatNumericInput(curZ);
      }
    });
    $('#i-rot-deg')?.addEventListener('change', (e) => {
      const curRot = normalizeRotationDegrees(room.rot ?? 0, 0);
      if (isInvalidNumericInput(e.target.value)) {
        e.target.value = formatNumericInput(curRot);
        return;
      }
      const nextRot = normalizeRotationDegrees(e.target.value, curRot);
      if (nextRot === curRot) {
        e.target.value = formatNumericInput(curRot);
        return;
      }
      const res = apply((n) => {
        const r = roomOf(n, room.id);
        if (r) r.rot = nextRot;
      }, 'Set Room Rotation');
      if (res.ok) {
        announceToLiveRegion(`${room.name} rotated to ${formatNumericInput(nextRot)} degrees.`);
      } else {
        e.target.value = formatNumericInput(curRot);
      }
    });
    $('#i-del').addEventListener('click', () => {
      const label = getSelectionLabel(room.id) || room.name;
      const r = apply((n) => M.removeById(n, room.id), 'Delete Room');
      if (r.ok) {
        select(null);
        toast(`Deleted ${label}`, false, 4500, UNDO_TOAST_ACTION);
      }
    });

    const commitInspectorWallLength = (inputEl) => {
      const wIdx = Number(inputEl.dataset.wallIndex);
      const wKey = inputEl.dataset.wallKey;
      const liveRoom = roomOf(doc, room.id);
      if (!liveRoom) return;
      const currentLen = wallLength(liveRoom, wIdx);
      const errEl = $('#i-wall-len-error');
      const parsedInches = parseExplicitLengthInches(inputEl.value);

      if (parsedInches === null) {
        inputEl.value = String(Number(currentLen.toFixed(2)));
        inputEl.classList.remove('is-invalid');
        if (errEl) {
          errEl.textContent = '';
          errEl.hidden = true;
        }
        return;
      }

      if (Math.abs(parsedInches - currentLen) < 1e-4) {
        inputEl.value = String(Number(currentLen.toFixed(2)));
        inputEl.classList.remove('is-invalid');
        if (errEl) {
          errEl.textContent = '';
          errEl.hidden = true;
        }
        return;
      }

      const adjusted = M.computeAdjustedWallPoints(liveRoom, wIdx, parsedInches);
      if (!adjusted.ok) {
        inputEl.classList.add('is-invalid');
        if (errEl) {
          errEl.textContent = adjusted.error;
          errEl.hidden = false;
        }
        return;
      }

      const siblingPolys = levelRooms()
        .filter((rm) => rm.id !== liveRoom.id)
        .map(toRoomCollisionShape);
      const candidateShape = liveRoom.bulges
        ? { points: adjusted.points, bulges: liveRoom.bulges }
        : adjusted.points;
      const placementCheck = validatePlacement(candidateShape, siblingPolys, { tolerance: EPS });
      if (!placementCheck.valid) {
        const msg = placementCheck.reasons.selfIntersecting
          ? 'Wall length causes polygon self-intersection.'
          : 'Wall length overlaps an adjacent room.';
        inputEl.classList.add('is-invalid');
        if (errEl) {
          errEl.textContent = msg;
          errEl.hidden = false;
        }
        return;
      }

      const res = apply(
        (n) => M.updateRoomPoints(roomOf(n, liveRoom.id), adjusted.points, n),
        'Edit Wall Length'
      );
      if (!res.ok) {
        const freshInput = $(`#i-wall-len-${wKey}`) || inputEl;
        const freshErr = $('#i-wall-len-error') || errEl;
        freshInput.classList.add('is-invalid');
        if (freshErr) {
          freshErr.textContent =
            res.reasons?.[0]?.msg || 'Wall length violates building code clear span.';
          freshErr.hidden = false;
        }
        return;
      }

      announceToLiveRegion(`${liveRoom.name} wall ${wKey} updated to ${fmtLen(parsedInches)}.`);
    };

    el.querySelectorAll('.i-wall-len-input').forEach((inputEl) => {
      inputEl.addEventListener('change', () => commitInspectorWallLength(inputEl));
      inputEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitInspectorWallLength(inputEl);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          const liveRoom = roomOf(doc, room.id);
          if (liveRoom) {
            const curLen = wallLength(liveRoom, Number(inputEl.dataset.wallIndex));
            inputEl.value = String(Number(curLen.toFixed(2)));
          }
          inputEl.classList.remove('is-invalid');
          const errEl = $('#i-wall-len-error');
          if (errEl) {
            errEl.textContent = '';
            errEl.hidden = true;
          }
        }
      });
    });

    el.querySelectorAll('.i-nudge-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.dataset.target;
        const step = parseFloat(e.currentTarget.dataset.step);
        if (target === 'pos-x') {
          const dir = step > 0 ? 'East' : 'West';
          apply(
            (n) => M.moveRoom(roomOf(n, room.id), room.x + step, room.y),
            'Nudge Room Position X'
          );
          announceToLiveRegion(
            `${room.name} moved ${dir} by ${Math.abs(step)} ${Math.abs(step) === 1 ? 'inch' : 'inches'}.`
          );
        } else if (target === 'pos-y') {
          const dir = step > 0 ? 'South' : 'North';
          apply(
            (n) => M.moveRoom(roomOf(n, room.id), room.x, room.y + step),
            'Nudge Room Position Y'
          );
          announceToLiveRegion(
            `${room.name} moved ${dir} by ${Math.abs(step)} ${Math.abs(step) === 1 ? 'inch' : 'inches'}.`
          );
        } else if (target === 'width') {
          const newW = Math.max(24, room.w + step);
          apply(
            (n) => M.resizeRoom(roomOf(n, room.id), room.x, room.y, newW, room.h),
            'Nudge Room Width'
          );
          announceToLiveRegion(`${room.name} width adjusted to ${newW} inches.`);
        } else if (target === 'depth') {
          const newH = Math.max(24, room.h + step);
          apply(
            (n) => M.resizeRoom(roomOf(n, room.id), room.x, room.y, room.w, newH),
            'Nudge Room Depth'
          );
          announceToLiveRegion(`${room.name} depth adjusted to ${newH} inches.`);
        }
      });
    });

    $('#i-uv-wall')?.addEventListener('change', (e) => {
      win.__activeUVWall = e.target.value;
      renderInspector();
    });

    const iCurveWallEl = $('#i-curve-wall');
    const iCurveRadiusEl = $('#i-curve-radius');
    const iCurveSagittaEl = $('#i-curve-sagitta');
    const iCurveBulgeEl = $('#i-curve-bulge');
    const iCurveErrEl = $('#i-curve-error');

    iCurveWallEl?.addEventListener('change', (e) => {
      win.__activeCurveWall = e.target.value;
      const wb = M.getWallBulge(roomOf(doc, room.id), win.__activeCurveWall);
      if (wb !== 0) inspectorConcavitySign = wb < 0 ? -1 : 1;
      renderInspector();
      redraw();
    });

    const handleInspectorCurveEdit = (field, inputEl, commitChange = false) => {
      const latestRoom = roomOf(doc, room.id);
      if (!latestRoom) return;
      const wallId = win.__activeCurveWall || activeCurveWall;
      const seg = getWallEdgeSegment(latestRoom, wallId);
      const signHint = seg.bulge !== 0 ? seg.bulge : inspectorConcavitySign < 0 ? -1e-6 : 0;
      const res = parseCurveHudInput(field, inputEl.value, seg.chordLen, signHint);

      if (!res.ok) {
        inputEl.setAttribute('aria-invalid', 'true');
        setCurveErrorUI(iCurveErrEl, [iCurveRadiusEl, iCurveSagittaEl, iCurveBulgeEl], res.error);
        preview = null;
        redraw();
        return;
      }

      inputEl.removeAttribute('aria-invalid');
      setCurveErrorUI(iCurveErrEl, [iCurveRadiusEl, iCurveSagittaEl, iCurveBulgeEl], null);
      if (res.bulge !== 0) {
        inspectorConcavitySign = res.bulge < 0 ? -1 : 1;
      }

      if (commitChange) {
        preview = null;
        apply(
          (n) => {
            const r = roomOf(n, room.id);
            M.setWallBulge(r, wallId, res.bulge, n);
          },
          { quiet: true, label: 'Update Wall Curve' }
        );
      } else {
        if (iCurveRadiusEl && field !== 'radius') {
          iCurveRadiusEl.value = formatCurveRadiusDisplay(seg.chordLen, res.bulge);
        }
        if (iCurveSagittaEl && field !== 'sagitta') {
          iCurveSagittaEl.value = formatCurveNumber(sagittaFromBulge(seg.chordLen, res.bulge), 2);
        }
        if (iCurveBulgeEl && field !== 'bulge') {
          iCurveBulgeEl.value = formatCurveNumber(res.bulge, 4);
        }
        preview = tryPreview((n) => {
          const r = roomOf(n, room.id);
          M.setWallBulge(r, wallId, res.bulge, n);
        });
        redraw();
      }
    };

    iCurveRadiusEl?.addEventListener('input', () =>
      handleInspectorCurveEdit('radius', iCurveRadiusEl, false)
    );
    iCurveRadiusEl?.addEventListener('change', () =>
      handleInspectorCurveEdit('radius', iCurveRadiusEl, true)
    );
    iCurveSagittaEl?.addEventListener('input', () =>
      handleInspectorCurveEdit('sagitta', iCurveSagittaEl, false)
    );
    iCurveSagittaEl?.addEventListener('change', () =>
      handleInspectorCurveEdit('sagitta', iCurveSagittaEl, true)
    );
    iCurveBulgeEl?.addEventListener('input', () =>
      handleInspectorCurveEdit('bulge', iCurveBulgeEl, false)
    );
    iCurveBulgeEl?.addEventListener('change', () =>
      handleInspectorCurveEdit('bulge', iCurveBulgeEl, true)
    );

    $('#i-curve-invert')?.addEventListener('click', () => {
      const latestRoom = roomOf(doc, room.id);
      if (!latestRoom) return;
      const wallId = win.__activeCurveWall || activeCurveWall;
      const wb = M.getWallBulge(latestRoom, wallId);
      inspectorConcavitySign = wb !== 0 ? (wb > 0 ? -1 : 1) : -inspectorConcavitySign;
      if (wb !== 0) {
        preview = null;
        apply(
          (n) => {
            const r = roomOf(n, room.id);
            M.setWallBulge(r, wallId, -wb, n);
          },
          { quiet: true, label: 'Invert Wall Curve' }
        );
      }
    });

    $('#i-curve-reset')?.addEventListener('click', () => {
      const wallId = win.__activeCurveWall || activeCurveWall;
      inspectorConcavitySign = 1;
      preview = null;
      apply(
        (n) => {
          const r = roomOf(n, room.id);
          M.setWallBulge(r, wallId, 0, n);
        },
        { quiet: true, label: 'Reset Wall Curve' }
      );
    });

    $('#i-custom-tex-btn')?.addEventListener('click', () => {
      $('#i-custom-tex-file')?.click();
    });

    const resolveActiveInspectorWall = (r) => {
      const keys = r ? getRoomWallKeys(r).map((wk) => String(wk)) : uvWallKeys;
      if (
        win.__activeUVWall !== undefined &&
        win.__activeUVWall !== null &&
        keys.includes(String(win.__activeUVWall))
      ) {
        return win.__activeUVWall;
      }
      return keys[0] ?? activeWall;
    };

    const formatInspectorWallLabel = (r, targetWall) => {
      const pts = getRoomPoints(r);
      return pts.length === 4 ? String(targetWall) : `Wall ${resolveWallIndex(targetWall) + 1}`;
    };

    $('#i-custom-tex-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const texId = `tex_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      try {
        await saveTextureBlob(texId, file, { name: file.name, mimeType: file.type });
        apply((n) => {
          const r = roomOf(n, room.id);
          if (r) M.setWallFinish(r, resolveActiveInspectorWall(r), texId);
        }, 'Upload Wall Texture');
        toast(`Uploaded custom texture: ${file.name}`);
        renderInspector();
        redraw();
        win.__scene3d?.render?.();
      } catch (err) {
        toast(`Failed to save texture: ${err.message}`, true);
      }
    });

    const readUVInputs = () => {
      const scaleU = parseFloat(
        $('#i-uv-scale-u-num')?.value || $('#i-uv-scale-u-range')?.value || 1.0
      );
      const scaleV = parseFloat(
        $('#i-uv-scale-v-num')?.value || $('#i-uv-scale-v-range')?.value || 1.0
      );
      const rotation = parseFloat($('#i-uv-rot-num')?.value || $('#i-uv-rot-range')?.value || 0);
      const offsetU = parseFloat($('#i-uv-off-u-num')?.value || $('#i-uv-off-u-range')?.value || 0);
      const offsetV = parseFloat($('#i-uv-off-v-num')?.value || $('#i-uv-off-v-range')?.value || 0);
      const scope = $('#i-uv-scope')?.value || 'single';
      return { scaleU, scaleV, rotation, offsetU, offsetV, scope };
    };

    const updateUV = () => {
      const { scaleU, scaleV, rotation, offsetU, offsetV, scope } = readUVInputs();
      apply(
        (n) => {
          const r = roomOf(n, room.id);
          M.applyWallUV(
            n,
            { scaleU, scaleV, rotation, offsetU, offsetV },
            { scope, room: r, wall: resolveActiveInspectorWall(r), level: r?.level || 0 }
          );
        },
        { quiet: true, label: 'Update Wall UV' }
      );
      redraw();
      win.__scene3d?.render?.();
    };

    const bindPair = (rangeId, numId, formatType) => {
      const rangeEl = $(rangeId);
      const numEl = $(numId);
      if (!rangeEl || !numEl) return;
      updateRangeAriaValueText(rangeEl, formatType);
      const syncFromRange = (e) => {
        numEl.value = e.target.value;
        updateRangeAriaValueText(rangeEl, formatType);
        updateUV();
      };
      rangeEl.addEventListener('input', syncFromRange);
      rangeEl.addEventListener('change', syncFromRange);
      numEl.addEventListener('input', (e) => {
        if (e.target.value !== '' && !Number.isNaN(Number(e.target.value))) {
          rangeEl.value = e.target.value;
          updateRangeAriaValueText(rangeEl, formatType);
        }
      });
      numEl.addEventListener('change', (e) => {
        rangeEl.value = e.target.value;
        updateRangeAriaValueText(rangeEl, formatType);
        updateUV();
      });
    };

    bindPair('#i-uv-scale-u-range', '#i-uv-scale-u-num', 'multiplier');
    bindPair('#i-uv-scale-v-range', '#i-uv-scale-v-num', 'multiplier');
    bindPair('#i-uv-rot-range', '#i-uv-rot-num', 'degrees');
    bindPair('#i-uv-off-u-range', '#i-uv-off-u-num', 'offset');
    bindPair('#i-uv-off-v-range', '#i-uv-off-v-num', 'offset');

    $('#i-uv-reset')?.addEventListener('click', () => {
      const scope = $('#i-uv-scope')?.value || 'single';
      apply((n) => {
        const r = roomOf(n, room.id);
        M.applyWallUV(n, M.DEFAULT_UV_TRANSFORM, {
          scope,
          room: r,
          wall: resolveActiveInspectorWall(r),
          level: r?.level || 0,
        });
      }, 'Reset Wall UV');
      renderInspector();
      redraw();
      win.__scene3d?.render?.();
    });

    const readAssemblyInputs = () => {
      const parseOr = (sel, fallback) => {
        const val = parseFloat($(sel)?.value);
        return Number.isFinite(val) ? val : fallback;
      };
      const rawOverrides = {
        gypsumThickness: parseOr('#i-wa-gypsum', assembly.gypsumThickness),
        studDepth: parseOr('#i-wa-stud', assembly.studDepth),
        sheathingThickness: parseOr('#i-wa-sheathing', assembly.sheathingThickness),
        airGapThickness: parseOr('#i-wa-airgap', assembly.airGapThickness),
        claddingThickness: parseOr('#i-wa-cladding', assembly.claddingThickness),
      };
      const clamped = M.clampWallAssemblyOverrides(rawOverrides);
      const scope = $('#i-wa-scope')?.value || 'single';
      return { clamped, scope };
    };

    const previewAssemblyTotal = () => {
      const { clamped } = readAssemblyInputs();
      const resolved = resolveWallAssembly(wallFinishId, activeExtFinId, clamped);
      const totalEl = $('#i-wa-total');
      if (totalEl) {
        totalEl.textContent = `${fmtInches(resolved.totalThickness)}"`;
      }
    };

    const commitAssemblyUpdate = () => {
      const { clamped, scope } = readAssemblyInputs();
      win.__activeAssemblyScope = scope;
      const targetWall = resolveActiveInspectorWall(room);
      apply((n) => {
        const r = roomOf(n, room.id);
        M.applyWallAssemblyOverrides(n, clamped, {
          scope,
          room: r,
          wall: targetWall,
          level: r?.level || 0,
        });
      }, 'Update Wall Assembly Thickness');
      const updatedRoom = roomOf(doc, room.id) || room;
      const updatedFinish = M.getWallFinish(updatedRoom, targetWall);
      let updatedExtFin = updatedRoom.cladding || updatedRoom.exteriorCladding;
      if (!updatedExtFin && WALL_BY_ID[updatedFinish]?.exterior) {
        updatedExtFin = updatedFinish;
      }
      updatedExtFin = updatedExtFin || 'cladding_siding_white';
      const updatedAssembly = resolveWallAssembly(
        updatedFinish,
        updatedExtFin,
        M.getWallAssemblyOverrides(updatedRoom, targetWall)
      );
      const totalInches = fmtInches(updatedAssembly.totalThickness);
      redraw();
      win.__scene3d?.update?.();
      win.__scene3d?.render?.();
      const wallLabel = formatInspectorWallLabel(updatedRoom, targetWall);
      const msg = `${updatedRoom.name} ${wallLabel} wall assembly updated to ${totalInches} inches total thickness.`;
      announceToLiveRegion(msg);
      win.__scene3d?.announce3DStateChange?.(msg);
    };

    ['#i-wa-gypsum', '#i-wa-stud', '#i-wa-sheathing', '#i-wa-airgap', '#i-wa-cladding'].forEach(
      (sel) => {
        const inputEl = $(sel);
        if (!inputEl) return;
        inputEl.addEventListener('input', previewAssemblyTotal);
        inputEl.addEventListener('change', commitAssemblyUpdate);
      }
    );

    $('#i-wa-scope')?.addEventListener('change', (e) => {
      win.__activeAssemblyScope = e.target.value || 'single';
    });

    $('#i-wa-reset')?.addEventListener('click', () => {
      const scope = $('#i-wa-scope')?.value || 'single';
      win.__activeAssemblyScope = scope;
      const targetWall = resolveActiveInspectorWall(room);
      apply((n) => {
        const r = roomOf(n, room.id);
        M.applyWallAssemblyOverrides(n, null, {
          scope,
          room: r,
          wall: targetWall,
          level: r?.level || 0,
        });
      }, 'Reset Wall Assembly Thickness');
      const updatedRoom = roomOf(doc, room.id) || room;
      const updatedFinish = M.getWallFinish(updatedRoom, targetWall);
      let updatedExtFin = updatedRoom.cladding || updatedRoom.exteriorCladding;
      if (!updatedExtFin && WALL_BY_ID[updatedFinish]?.exterior) {
        updatedExtFin = updatedFinish;
      }
      updatedExtFin = updatedExtFin || 'cladding_siding_white';
      const defaultAssembly = resolveWallAssembly(updatedFinish, updatedExtFin);
      const totalInches = fmtInches(defaultAssembly.totalThickness);
      renderInspector();
      redraw();
      win.__scene3d?.update?.();
      win.__scene3d?.render?.();
      const wallLabel = formatInspectorWallLabel(updatedRoom, targetWall);
      const msg = `${updatedRoom.name} ${wallLabel} wall assembly reset to default ${totalInches} inches total thickness.`;
      announceToLiveRegion(msg);
      win.__scene3d?.announce3DStateChange?.(msg);
    });

    const handleBuildingPresetApply = (scope) => {
      const presetKey = $('#i-bpreset')?.value;
      if (!presetKey) return;
      apply((n) => {
        const r = roomOf(n, room.id);
        applyBuildingPreset(n, presetKey, { room: r, level: r?.level || 0, scope });
      }, 'Apply Building Preset');
    };
    $('#i-bpreset-room')?.addEventListener('click', () => handleBuildingPresetApply('room'));
    $('#i-bpreset-level')?.addEventListener('click', () => handleBuildingPresetApply('level'));
    $('#i-bpreset-plan')?.addEventListener('click', () => handleBuildingPresetApply('plan'));

    const handleCladdingApply = (scope) => {
      const claddingKey = $('#i-cladding')?.value;
      if (!claddingKey) return;
      apply((n) => {
        const r = roomOf(n, room.id);
        applyCladdingMaterial(n, claddingKey, { room: r, level: r?.level || 0, scope });
      }, 'Apply Exterior Cladding');
    };
    $('#i-cladding-room')?.addEventListener('click', () => handleCladdingApply('room'));
    $('#i-cladding-level')?.addEventListener('click', () => handleCladdingApply('level'));
    $('#i-cladding-plan')?.addEventListener('click', () => handleCladdingApply('plan'));
  } else {
    const def = kind === 'item' ? ITEM_BY_ID[obj.type] : OPENING_BY_ID[obj.type];
    const winStyle = kind === 'opening' && def.kind === 'window' ? resolveWindowStyle(obj) : null;
    const doorStyle = kind === 'opening' && def.kind === 'door' ? resolveDoorStyle(obj) : null;
    const winPresets = getWindowPresets();
    const doorPresets = getDoorPresets();
    const openUnit = kind === 'opening' ? getOpeningUnitMode() : 'ft-in';
    const openWallLen = kind === 'opening' ? wallLength(room, obj.wall) : 0;
    const openMaxOffset = kind === 'opening' ? Math.max(0, openWallLen - obj.width) : 0;
    const openClampedOffset =
      kind === 'opening' ? M.clampOpeningOffset(room, obj.wall, obj.offset, obj.width) : 0;
    const openCornerDist = kind === 'opening' ? M.getOpeningCornerDistance(room, obj) : 0;
    const elemBounds = M.getBounds(doc, obj.id);
    const posX =
      kind === 'item' && (def.mount === 'floor' || def.mount === 'ceiling')
        ? obj.x
        : (elemBounds?.cx ?? 0);
    const posY =
      kind === 'item' && (def.mount === 'floor' || def.mount === 'ceiling')
        ? obj.y
        : (elemBounds?.cy ?? 0);
    let curZ = 0;
    if (kind === 'item') {
      if (def.mount === 'wall') {
        const defaultWallZ = def.shape === 'switch' ? 48 : 16;
        curZ = Number.isFinite(obj.z) ? obj.z : defaultWallZ;
      } else {
        const defaultZ = def.mount === 'ceiling' ? (room.ceiling || 96) - 0.75 : 0;
        curZ = Number.isFinite(obj.z) ? obj.z : defaultZ;
      }
    } else {
      const defaultSill = def.sill || 0;
      curZ = Number.isFinite(obj.sill) ? obj.sill : Number.isFinite(obj.z) ? obj.z : defaultSill;
    }
    const itemRotDeg = kind === 'item' ? normalizeRotationDegrees(obj.rot ?? 0, 0) : 0;
    const itemScaleVal =
      kind === 'item'
        ? typeof obj.scale === 'number' && Number.isFinite(obj.scale)
          ? obj.scale
          : Number.isFinite(obj.scale?.x)
            ? obj.scale.x
            : 1
        : 1;

    el.innerHTML = `<h3>${esc(def.name)}</h3><p class="note" style="margin:0 0 6px">in ${esc(room.name)}</p><div class="btns">
      ${kind === 'item' && def.mount === 'floor' ? '<button id="i-rot">Rotate 90° (R)</button>' : ''}
      ${kind === 'opening' && def.kind === 'door' ? '<button id="i-swing">Flip swing</button>' : ''}
      <button id="i-del">Delete</button></div>
      <div class="inspector-coords-group exact-transform-group" style="margin-top:10px;padding:8px;background:rgba(0,0,0,0.03);border:1px solid var(--border,#ddd);border-radius:6px">
        <h4 style="margin:0 0 6px;font-size:0.85rem;font-weight:600">3D Coordinates &amp; Transform</h4>
        ${formRow(
          'i-item-pos-x',
          'Position X (in)',
          `<input id="i-item-pos-x" type="number" step="any" value="${formatNumericInput(posX)}">`
        )}
        ${formRow(
          'i-item-pos-y',
          'Position Y (in)',
          `<input id="i-item-pos-y" type="number" step="any" value="${formatNumericInput(posY)}">`
        )}
        ${formRow(
          'i-item-z',
          'Elevation Z (in)',
          `<input id="i-item-z" type="number" step="any" min="0" max="${room.ceiling || 96}" value="${formatNumericInput(curZ)}">`
        )}
        ${
          kind === 'item' && def.mount !== 'wall'
            ? formRow(
                'i-item-rot',
                'Angle (°)',
                `<input id="i-item-rot" type="number" step="1" min="-360" max="360" value="${formatNumericInput(itemRotDeg)}">`
              )
            : ''
        }
        ${
          kind === 'item'
            ? formRow(
                'i-item-scale',
                'Scale',
                `<input id="i-item-scale" type="number" step="0.05" min="0.05" value="${formatNumericInput(itemScaleVal)}">`
              )
            : ''
        }
      </div>
      <div style="margin-top:10px;padding:8px;background:rgba(0,0,0,0.03);border:1px solid var(--border,#ddd);border-radius:6px">
        <h4 style="margin:0 0 6px;font-size:0.85rem;font-weight:600">Single-Pointer Step Nudge</h4>
        <div style="font-size:0.75rem;margin-bottom:2px">Position X</div>
        <div class="row" style="margin-bottom:6px;display:flex;gap:4px">
          <button type="button" class="i-item-nudge-btn" data-dx="-1" data-dy="0" data-step="-6" style="flex:1;padding:3px">-6"</button>
          <button type="button" class="i-item-nudge-btn" data-dx="-1" data-dy="0" data-step="-1" style="flex:1;padding:3px">-1"</button>
          <button type="button" class="i-item-nudge-btn" data-dx="1" data-dy="0" data-step="1" style="flex:1;padding:3px">+1"</button>
          <button type="button" class="i-item-nudge-btn" data-dx="1" data-dy="0" data-step="6" style="flex:1;padding:3px">+6"</button>
        </div>
        <div style="font-size:0.75rem;margin-bottom:2px">Position Y</div>
        <div class="row" style="margin-bottom:6px;display:flex;gap:4px">
          <button type="button" class="i-item-nudge-btn" data-dx="0" data-dy="-1" data-step="-6" style="flex:1;padding:3px">-6"</button>
          <button type="button" class="i-item-nudge-btn" data-dx="0" data-dy="-1" data-step="-1" style="flex:1;padding:3px">-1"</button>
          <button type="button" class="i-item-nudge-btn" data-dx="0" data-dy="1" data-step="1" style="flex:1;padding:3px">+1"</button>
          <button type="button" class="i-item-nudge-btn" data-dx="0" data-dy="1" data-step="6" style="flex:1;padding:3px">+6"</button>
        </div>
      </div>
      ${
        kind === 'opening'
          ? `${formRow(
              'i-otype',
              'Style',
              `<select id="i-otype">${OPENINGS.filter((o) => o.kind === def.kind)
                .map(
                  (o) =>
                    `<option value="${o.id}" ${o.id === obj.type ? 'selected' : ''}>${o.name}</option>`
                )
                .join('')}</select>`
            )}
            <hr style="margin:14px 0 10px;border:none;border-top:1px solid var(--border,#ccc)">
            <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Wall Placement &amp; Offset</h4>
            ${formRow(
              'i-open-units',
              'Offset Units',
              `<select id="i-open-units"><option value="ft-in" ${openUnit === 'ft-in' ? 'selected' : ''}>Feet &amp; Inches (ft&#39; in&quot;)</option><option value="in" ${openUnit === 'in' ? 'selected' : ''}>Inches (in&quot;)</option></select>`
            )}
            ${formRow(
              'i-open-offset',
              'Wall Offset',
              `<input id="i-open-offset" type="text" inputmode="decimal" data-min="0" data-max="${openMaxOffset}" value="${esc(M.formatOpeningOffset(openClampedOffset, openUnit))}">`
            )}
            ${formRow(
              'i-open-corner',
              'Corner Distance',
              `<input id="i-open-corner" type="text" inputmode="decimal" data-min="0" data-max="${openMaxOffset}" value="${esc(M.formatOpeningOffset(openCornerDist, openUnit))}">`
            )}
            <p class="note" style="margin:4px 0 8px">${esc(obj.wall)} wall (${esc(M.formatOpeningOffset(openWallLen, openUnit))}) · max offset ${esc(M.formatOpeningOffset(openMaxOffset, openUnit))}</p>`
          : ''
      }
      ${
        kind === 'opening' && def.kind === 'window' && winStyle
          ? `<hr style="margin:14px 0 10px;border:none;border-top:1px solid var(--border,#ccc)">
             <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Window Styling & Preset</h4>
             ${formRow(
               'i-win-preset',
               'Preset',
               `<select id="i-win-preset">${Object.values(winPresets)
                 .map(
                   (p) =>
                     `<option value="${p.key}" ${p.key === winStyle.presetKey ? 'selected' : ''}>${esc(p.name)}</option>`
                 )
                 .join('')}</select>`
             )}
             ${formRow(
               'i-win-mat',
               'Frame Material',
               `<select id="i-win-mat">${['vinyl', 'wood', 'aluminum', 'bronze', 'steel']
                 .map(
                   (m) =>
                     `<option value="${m}" ${m === winStyle.frameMaterial ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`
                 )
                 .join('')}</select>`
             )}
             ${formRow(
               'i-win-color',
               'Frame Color',
               `<input id="i-win-color" type="color" value="${winStyle.frameColor || '#ffffff'}">`
             )}
             ${formRow(
               'i-win-mullions',
               'Mullion Grid (cols × rows)',
               `<div style="display:flex;gap:6px;align-items:center"><input id="i-win-mull-cols" type="number" min="1" max="10" value="${winStyle.mullions?.cols ?? 1}" style="width:60px" aria-label="Mullion columns"><span>×</span><input id="i-win-mull-rows" type="number" min="1" max="10" value="${winStyle.mullions?.rows ?? 1}" style="width:60px" aria-label="Mullion rows"></div>`
             )}
             ${formRow(
               'i-win-casing',
               'Casing Size (W × D in)',
               `<div style="display:flex;gap:6px;align-items:center"><input id="i-win-casing-w" type="number" step="0.25" min="0" max="12" value="${winStyle.casing?.width ?? 2.0}" style="width:60px" aria-label="Casing width in inches"><span>×</span><input id="i-win-casing-d" type="number" step="0.25" min="0" max="6" value="${winStyle.casing?.depth ?? 0.75}" style="width:60px" aria-label="Casing depth in inches"></div>`
             )}`
          : ''
      }
      ${
        kind === 'opening' && def.kind === 'door' && doorStyle
          ? `<hr style="margin:14px 0 10px;border:none;border-top:1px solid var(--border,#ccc)">
             <h4 style="margin:0 0 8px;font-size:0.9rem;font-weight:600">Door Styling & Preset</h4>
             ${formRow(
               'i-door-preset',
               'Preset',
               `<select id="i-door-preset">${Object.values(doorPresets)
                 .map(
                   (p) =>
                     `<option value="${p.key}" ${p.key === doorStyle.presetKey ? 'selected' : ''}>${esc(p.name)}</option>`
                 )
                 .join('')}</select>`
             )}
             ${formRow(
               'i-door-panel-style',
               'Panel Style',
               `<select id="i-door-panel-style">${[
                 { key: 'flush', name: 'Flush Slab' },
                 { key: 'panel_2', name: '2-Panel' },
                 { key: 'panel_6', name: '6-Panel' },
                 { key: 'french', name: 'French Glass' },
                 { key: 'glass_top', name: 'Glass Top' },
               ]
                 .map(
                   (ps) =>
                     `<option value="${ps.key}" ${ps.key === doorStyle.panelStyle ? 'selected' : ''}>${ps.name}</option>`
                 )
                 .join('')}</select>`
             )}
             ${formRow(
               'i-door-finish-color',
               'Finish Color',
               `<input id="i-door-finish-color" type="color" value="${doorStyle.finishColor || '#a9825a'}">`
             )}
             ${formRow(
               'i-door-frame-mat',
               'Frame Material',
               `<select id="i-door-frame-mat">${['wood', 'vinyl', 'aluminum', 'steel', 'bronze']
                 .map(
                   (m) =>
                     `<option value="${m}" ${m === doorStyle.frameMaterial ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`
                 )
                 .join('')}</select>`
             )}
             ${formRow(
               'i-door-frame-color',
               'Frame Color',
               `<input id="i-door-frame-color" type="color" value="${doorStyle.frameColor || '#f3f1ea'}">`
             )}
             ${formRow(
               'i-door-hw-finish',
               'Hardware Finish',
               `<select id="i-door-hw-finish">${[
                 { key: 'brushed_nickel', name: 'Brushed Nickel' },
                 { key: 'matte_black', name: 'Matte Black' },
                 { key: 'brass', name: 'Brass' },
                 { key: 'oil_rubbed_bronze', name: 'Oil-Rubbed Bronze' },
               ]
                 .map(
                   (hw) =>
                     `<option value="${hw.key}" ${hw.key === doorStyle.hardwareFinish ? 'selected' : ''}>${hw.name}</option>`
                 )
                 .join('')}</select>`
             )}
             ${formRow(
               'i-door-casing',
               'Casing Size (W × D in)',
               `<div style="display:flex;gap:6px;align-items:center"><input id="i-door-casing-w" type="number" step="0.25" min="0" max="12" value="${doorStyle.casing?.width ?? 2.0}" style="width:60px" aria-label="Door casing width in inches"><span>×</span><input id="i-door-casing-d" type="number" step="0.25" min="0" max="6" value="${doorStyle.casing?.depth ?? 0.75}" style="width:60px" aria-label="Door casing depth in inches"></div>`
             )}`
          : ''
      }`;
    $('#i-rot')?.addEventListener('click', rotateSelected);
    $('#i-swing')?.addEventListener('click', () =>
      apply((n) => {
        const o = M.findOwner(n, obj.id).obj;
        o.swing = o.swing === 'in' ? 'out' : 'in';
      }, 'Flip Door Swing')
    );
    $('#i-otype')?.addEventListener('change', (e) =>
      apply((n) => {
        const ownerHit = M.findOwner(n, obj.id);
        const o = ownerHit.obj;
        const nd = OPENING_BY_ID[e.target.value];
        o.type = nd.id;
        o.width = nd.w;
        o.offset = M.clampOpeningOffset(ownerHit.room, o.wall, o.offset, o.width);
      }, 'Change Opening Type')
    );
    if (kind === 'opening') {
      $('#i-open-units')?.addEventListener('change', (e) => {
        setOpeningUnitMode(e.target.value);
      });
      $('#i-open-offset')?.addEventListener('change', (e) => {
        commitOpeningOffsetInput(obj.id, e.target.value, 'offset');
      });
      $('#i-open-corner')?.addEventListener('change', (e) => {
        commitOpeningOffsetInput(obj.id, e.target.value, 'corner');
      });
    }
    if (kind === 'opening' && def.kind === 'window') {
      $('#i-win-preset')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.presetKey = e.target.value;
        }, 'Update Window Style')
      );
      $('#i-win-mat')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.frameMaterial = e.target.value;
        }, 'Update Window Style')
      );
      $('#i-win-color')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.frameColor = e.target.value;
        }, 'Update Window Style')
      );
      const updateMullions = () => {
        const cols = parseInt($('#i-win-mull-cols')?.value || 1, 10);
        const rows = parseInt($('#i-win-mull-rows')?.value || 1, 10);
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.mullions = { ...(target.mullions || {}), cols, rows };
        }, 'Update Window Style');
      };
      $('#i-win-mull-cols')?.addEventListener('change', updateMullions);
      $('#i-win-mull-rows')?.addEventListener('change', updateMullions);

      const updateCasing = () => {
        const parsedW = M.parseDistanceInInches($('#i-win-casing-w')?.value ?? '2.0', {
          defaultUnit: 'in',
          allowZero: true,
        });
        const parsedD = M.parseDistanceInInches($('#i-win-casing-d')?.value ?? '0.75', {
          defaultUnit: 'in',
          allowZero: true,
        });
        const width = parsedW ?? 2.0;
        const depth = parsedD ?? 0.75;
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.casing = { ...(target.casing || {}), width, depth };
        }, 'Update Window Style');
      };
      $('#i-win-casing-w')?.addEventListener('change', updateCasing);
      $('#i-win-casing-d')?.addEventListener('change', updateCasing);
    }
    if (kind === 'opening' && def.kind === 'door') {
      $('#i-door-preset')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.presetKey = e.target.value;
        }, 'Update Door Style')
      );
      $('#i-door-panel-style')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.panelStyle = e.target.value;
        }, 'Update Door Style')
      );
      $('#i-door-finish-color')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.finishColor = e.target.value;
        }, 'Update Door Style')
      );
      $('#i-door-frame-mat')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.frameMaterial = e.target.value;
        }, 'Update Door Style')
      );
      $('#i-door-frame-color')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.frameColor = e.target.value;
        }, 'Update Door Style')
      );
      $('#i-door-hw-finish')?.addEventListener('change', (e) =>
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.hardwareFinish = e.target.value;
        }, 'Update Door Style')
      );
      const updateDoorCasing = () => {
        const parsedW = M.parseDistanceInInches($('#i-door-casing-w')?.value ?? '2.0', {
          defaultUnit: 'in',
          allowZero: true,
        });
        const parsedD = M.parseDistanceInInches($('#i-door-casing-d')?.value ?? '0.75', {
          defaultUnit: 'in',
          allowZero: true,
        });
        const width = parsedW ?? 2.0;
        const depth = parsedD ?? 0.75;
        apply((n) => {
          const target = M.findOwner(n, obj.id)?.obj;
          if (target) target.casing = { ...(target.casing || {}), width, depth };
        }, 'Update Door Style');
      };
      $('#i-door-casing-w')?.addEventListener('change', updateDoorCasing);
      $('#i-door-casing-d')?.addEventListener('change', updateDoorCasing);
    }
    $('#i-del').addEventListener('click', () => {
      const label = getSelectionLabel(obj.id) || def.name;
      const r = apply((n) => M.removeById(n, obj.id), 'Delete Element');
      if (r.ok) {
        select(null);
        toast(`Deleted ${label}`, false, 4500, UNDO_TOAST_ACTION);
      }
    });

    const getOtherFloorItemPolygons = () => {
      const polygons = [];
      for (const rm of levelRooms()) {
        for (const other of rm.items) {
          if (other.id === obj.id) continue;
          const oDef = ITEM_BY_ID[other.type];
          if (oDef && oDef.mount === 'floor' && !oDef.flat) {
            polygons.push(itemToPolygon(other, oDef));
          }
        }
      }
      return polygons;
    };

    const clampFloorOrCeilingXY = (rm, rawNextX, rawNextY) => {
      const ir = interior(rm);
      if (def.mount === 'ceiling') {
        const minX = ir.x + 6;
        const maxX = Math.max(minX, ir.x + ir.w - 6);
        const minY = ir.y + 6;
        const maxY = Math.max(minY, ir.y + ir.h - 6);
        return {
          x: Math.max(minX, Math.min(maxX, rawNextX)),
          y: Math.max(minY, Math.min(maxY, rawNextY)),
        };
      }
      const fp = footprint({ x: 0, y: 0, rot: obj.rot || 0, scale: obj.scale }, def);
      const minX = ir.x + fp.w / 2;
      const maxX = Math.max(minX, ir.x + ir.w - fp.w / 2);
      const minY = ir.y + fp.h / 2;
      const maxY = Math.max(minY, ir.y + ir.h - fp.h / 2);
      return {
        x: Math.max(minX, Math.min(maxX, rawNextX)),
        y: Math.max(minY, Math.min(maxY, rawNextY)),
      };
    };

    const applyExactElementPosition = (axis, rawValue, inputEl) => {
      const existingPolygons = kind === 'item' ? getOtherFloorItemPolygons() : [];
      const entity = {
        id: obj.id,
        position: { x: posX, y: posY },
        polygon: kind === 'item' && def.mount === 'floor' ? itemToPolygon(obj, def) : undefined,
      };
      const rawX = axis === 'x' ? rawValue : posX;
      const rawY = axis === 'y' ? rawValue : posY;
      const posRes = interaction.setEntityPosition(
        entity,
        { x: rawX, y: rawY },
        { existingPolygons }
      );
      let nextX = posRes.position.x;
      let nextY = posRes.position.y;
      if (kind === 'item' && (def.mount === 'floor' || def.mount === 'ceiling')) {
        const targetRoom = doc.rooms.find(
          (rm) => (rm.level || 0) === (room.level || 0) && inRect(rm, { x: nextX, y: nextY }, 0)
        );
        if (!targetRoom) {
          const clamped = clampFloorOrCeilingXY(room, nextX, nextY);
          nextX = clamped.x;
          nextY = clamped.y;
        }
      }
      if (nextX === posX && nextY === posY) {
        if (inputEl) inputEl.value = formatNumericInput(axis === 'x' ? posX : posY);
        return;
      }
      const r = apply((n) => {
        const targetHit = M.findOwner(n, obj.id);
        if (targetHit) {
          M.setItemPosition(n, targetHit, nextX, nextY);
        }
      }, 'Set Element Position');
      if (r.ok) {
        const updatedHit = M.findOwner(doc, obj.id);
        const updatedBounds = M.getBounds(doc, obj.id);
        const finalX =
          updatedHit?.kind === 'item' && (def.mount === 'floor' || def.mount === 'ceiling')
            ? updatedHit.obj.x
            : (updatedBounds?.cx ?? nextX);
        const finalY =
          updatedHit?.kind === 'item' && (def.mount === 'floor' || def.mount === 'ceiling')
            ? updatedHit.obj.y
            : (updatedBounds?.cy ?? nextY);
        announceToLiveRegion(
          `${def.name} position set to X ${formatNumericInput(finalX)}", Y ${formatNumericInput(finalY)}".`
        );
      } else {
        renderInspector();
      }
    };

    $('#i-item-pos-x')?.addEventListener('change', (e) =>
      applyExactElementPosition('x', e.target.value, e.target)
    );
    $('#i-item-pos-y')?.addEventListener('change', (e) =>
      applyExactElementPosition('y', e.target.value, e.target)
    );

    $('#i-item-z')?.addEventListener('change', (e) => {
      if (isInvalidNumericInput(e.target.value)) {
        e.target.value = formatNumericInput(curZ);
        return;
      }
      const parsedZ = parseCoordinateInput(e.target.value, curZ);
      const maxZ =
        kind === 'item'
          ? def.mount === 'floor'
            ? Math.max(0, (room.ceiling || 96) - (def.h || 0))
            : Math.max(0, room.ceiling || 96)
          : Math.max(0, (room.ceiling || 96) - (def.h || 0));
      const nextZ = Math.round(Math.max(0, Math.min(maxZ, parsedZ)) * 1000) / 1000;
      if (nextZ === curZ) {
        e.target.value = formatNumericInput(curZ);
        return;
      }
      const r = apply((n) => {
        const found = M.findOwner(n, obj.id);
        if (!found) return;
        if (kind === 'opening') found.obj.sill = nextZ;
        else found.obj.z = nextZ;
      }, 'Set Element Elevation Z');
      if (r.ok) {
        announceToLiveRegion(`${def.name} elevation set to Z ${formatNumericInput(nextZ)}".`);
      } else {
        renderInspector();
      }
    });

    $('#i-item-rot')?.addEventListener('change', (e) => {
      const existingPolygons = getOtherFloorItemPolygons();
      const entity = {
        id: obj.id,
        position: { x: posX, y: posY },
        rot: itemRotDeg,
        rotation: (itemRotDeg * Math.PI) / 180,
        polygon: def.mount === 'floor' ? itemToPolygon(obj, def) : undefined,
      };
      const rotRes = interaction.setEntityRotation(entity, e.target.value, { existingPolygons });
      const nextRot = rotRes.rotationDegrees;
      if (nextRot === itemRotDeg) {
        e.target.value = formatNumericInput(itemRotDeg);
        return;
      }
      const r = apply((n) => {
        const targetHit = M.findOwner(n, obj.id);
        if (!targetHit) return;
        targetHit.obj.rot = nextRot;
        if (def.mount === 'floor') {
          const ir = interior(targetHit.room);
          const fp = footprint({ x: 0, y: 0, rot: nextRot, scale: targetHit.obj.scale }, def);
          const minX = ir.x + fp.w / 2;
          const maxX = Math.max(minX, ir.x + ir.w - fp.w / 2);
          const minY = ir.y + fp.h / 2;
          const maxY = Math.max(minY, ir.y + ir.h - fp.h / 2);
          targetHit.obj.x = Math.max(minX, Math.min(maxX, targetHit.obj.x));
          targetHit.obj.y = Math.max(minY, Math.min(maxY, targetHit.obj.y));
        }
      }, 'Set Item Rotation');
      if (r.ok) {
        announceToLiveRegion(`${def.name} rotated to ${formatNumericInput(nextRot)} degrees.`);
      } else {
        renderInspector();
      }
    });

    $('#i-item-scale')?.addEventListener('change', (e) => {
      const existingPolygons = getOtherFloorItemPolygons();
      const entity = {
        id: obj.id,
        position: { x: posX, y: posY },
        scale: { x: itemScaleVal, y: itemScaleVal, z: itemScaleVal },
        polygon: def.mount === 'floor' ? itemToPolygon(obj, def) : undefined,
      };
      const scaleRes = interaction.setEntityScale(entity, e.target.value, { existingPolygons });
      const nextScale = scaleRes.scale.x;
      if (nextScale === itemScaleVal) {
        e.target.value = formatNumericInput(itemScaleVal);
        return;
      }
      const r = apply((n) => {
        const targetHit = M.findOwner(n, obj.id);
        if (!targetHit) return;
        targetHit.obj.scale = nextScale;
        if (def.mount === 'floor') {
          const ir = interior(targetHit.room);
          const fp = footprint({ x: 0, y: 0, rot: targetHit.obj.rot || 0, scale: nextScale }, def);
          const minX = ir.x + fp.w / 2;
          const maxX = Math.max(minX, ir.x + ir.w - fp.w / 2);
          const minY = ir.y + fp.h / 2;
          const maxY = Math.max(minY, ir.y + ir.h - fp.h / 2);
          targetHit.obj.x = Math.max(minX, Math.min(maxX, targetHit.obj.x));
          targetHit.obj.y = Math.max(minY, Math.min(maxY, targetHit.obj.y));
        }
      }, 'Set Item Scale');
      if (r.ok) {
        announceToLiveRegion(`${def.name} scaled to ${formatNumericInput(nextScale)}x.`);
      } else {
        renderInspector();
      }
    });

    el.querySelectorAll('.i-item-nudge-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const dx = parseInt(e.currentTarget.dataset.dx, 10);
        const dy = parseInt(e.currentTarget.dataset.dy, 10);
        const step = Math.abs(parseFloat(e.currentTarget.dataset.step));
        moveSelectedSpatial(dx, dy, step);
      });
    });
  }
}

function getSelectionLabel(id = selection) {
  if (!id) return '';
  if (id instanceof Set) {
    return id.size === 1 ? getSelectionLabel(Array.from(id)[0]) : `${id.size} selected elements`;
  }
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

function moveSelectedSpatial(dx, dy, customStep = null) {
  if (!selection) {
    toast('Select an element to move using Arrow keys', true, 2000);
    return;
  }
  const hit = M.findOwner(doc, selection);
  if (!hit) return;
  const { room, kind, obj } = hit;
  const dirName = dx > 0 ? 'East' : dx < 0 ? 'West' : dy > 0 ? 'South' : dy < 0 ? 'North' : '';

  if (kind === 'item') {
    const def = ITEM_BY_ID[obj.type];
    if (def.mount === 'floor' || def.mount === 'ceiling') {
      const step = customStep ?? 6;
      const targetP = { x: obj.x + dx * step, y: obj.y + dy * step };
      const pl = placeItem(obj.type, targetP, obj.rot || 0);
      if (pl) {
        const r = apply(moveItemMutation(selection, pl));
        if (r.ok) {
          toast(`Moved ${def.name} in ${pl.room.name}`, false, 1800);
          announceToLiveRegion(
            `${def.name} moved ${dirName} by ${step} ${step === 1 ? 'inch' : 'inches'}.`
          );
        }
      }
    } else if (def.mount === 'wall') {
      const step = customStep ?? 6;
      const deltaOffset = (dx !== 0 ? dx : dy) * step;
      const newOffset = Math.max(8, obj.offset + deltaOffset);
      const r = apply((n) => {
        const it = M.findOwner(n, selection).obj;
        it.offset = newOffset;
      });
      if (r.ok) {
        toast(`Moved ${def.name} along ${obj.wall} wall in ${room.name}`, false, 1800);
        announceToLiveRegion(
          `${def.name} moved ${dirName} by ${step} ${step === 1 ? 'inch' : 'inches'}.`
        );
      }
    }
  } else if (kind === 'opening') {
    const def = OPENING_BY_ID[obj.type];
    const step = customStep ?? 6;
    const deltaOffset = (dx !== 0 ? dx : dy) * step;
    const newOffset = M.clampOpeningOffset(room, obj.wall, obj.offset + deltaOffset, obj.width);
    const r = apply((n) => {
      M.setOpeningOffset(n, selection, newOffset);
    }, 'Move Opening');
    if (r.ok) {
      toast(`Moved ${def.name} along ${obj.wall} wall in ${room.name}`, false, 1800);
      announceToLiveRegion(
        `${def.name} moved ${dirName} by ${step} ${step === 1 ? 'inch' : 'inches'}.`
      );
    }
  } else if (kind === 'room') {
    const step = customStep ?? 6;
    const newX = room.x + dx * step;
    const newY = room.y + dy * step;
    const r = apply((n) => M.moveRoom(roomOf(n, room.id), newX, newY), 'Move Room');
    if (r.ok) {
      toast(`Moved ${room.name} to ${fmtLen(newX)}, ${fmtLen(newY)}`, false, 1800);
      announceToLiveRegion(
        `${room.name} moved ${dirName} by ${step} ${step === 1 ? 'inch' : 'inches'}.`
      );
    }
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
    }, 'Rotate Item');
    if (r.ok) toast(`Rotated ${ITEM_BY_ID[hit.obj.type].name} to ${newRot}°`, false, 1800);
  }
}

// ------------------------------------------------------------- levels
function getMinLevel() {
  if (Array.isArray(doc.levelMetadata) && doc.levelMetadata.length > 0) {
    return Math.min(0, ...doc.levelMetadata.map((m) => m.index));
  }
  return doc.rooms && doc.rooms.length ? Math.min(0, ...doc.rooms.map((r) => r.level || 0)) : 0;
}

function getMaxLevel() {
  if (Array.isArray(doc.levelMetadata) && doc.levelMetadata.length > 0) {
    return Math.max(0, ...doc.levelMetadata.map((m) => m.index));
  }
  return Math.max(0, (doc.levels || 1) - 1);
}

function ensureLevelMetadata() {
  if (!Array.isArray(doc.levelMetadata) || doc.levelMetadata.length === 0) {
    doc.levelMetadata = [];
    const minL = Math.min(0, ...(doc.rooms || []).map((r) => r.level || 0));
    const maxL = Math.max((doc.levels || 1) - 1, ...(doc.rooms || []).map((r) => r.level || 0));
    for (let l = minL; l <= maxL; l++) {
      doc.levelMetadata.push(M.defaultLevelDescriptor(l));
    }
  } else {
    for (const r of doc.rooms || []) {
      const l = r.level != null ? r.level : 0;
      if (!doc.levelMetadata.some((m) => m && m.index === l)) {
        doc.levelMetadata.push(M.defaultLevelDescriptor(l));
      }
    }
    doc.levelMetadata.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
}

function setLevel(l, redo = true) {
  ensureLevelMetadata();
  const minL = getMinLevel();
  const maxL = getMaxLevel();
  curLevel = Math.max(minL, Math.min(maxL, l));
  closeOpeningHudEditor();
  selectionSet.clear();
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

let editingLevelMetadata = [];

function openLevelManagerDialog() {
  ensureLevelMetadata();
  editingLevelMetadata = doc.levelMetadata.map((m) => ({ ...m }));
  renderLevelManagerRows();
  const errContainer = $('#level-manager-validation-errors');
  if (errContainer) errContainer.style.display = 'none';
  $('#dlg-level-manager')?.showModal();
}

function renderLevelManagerRows() {
  const tbody = $('#level-manager-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  editingLevelMetadata.forEach((lvl, idx) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--ktheme-border, #e5e7eb)';
    tr.dataset.idx = idx;

    const hasRooms = (doc.rooms || []).some((r) => (r.level || 0) === lvl.index);
    const canDelete = editingLevelMetadata.length > 1 && !hasRooms;

    tr.innerHTML = `
      <td style="padding:6px 8px; font-weight:600;">${lvl.index}</td>
      <td style="padding:6px 8px;"><input type="text" class="lvl-name" value="${esc(lvl.name)}" style="width:110px;" /></td>
      <td style="padding:6px 8px;"><input type="number" class="lvl-elevation" value="${lvl.elevation}" style="width:75px;" /></td>
      <td style="padding:6px 8px;"><input type="number" class="lvl-story" value="${lvl.storyHeight}" style="width:70px;" min="10" /></td>
      <td style="padding:6px 8px;"><input type="number" class="lvl-ceiling" value="${lvl.ceilingHeight}" style="width:70px;" min="10" /></td>
      <td style="padding:6px 8px;"><input type="number" class="lvl-slab" value="${lvl.slabThickness}" style="width:65px;" min="1" /></td>
      <td style="padding:6px 8px; text-align:center;"><input type="checkbox" class="lvl-sub" ${lvl.subterranean ? 'checked' : ''} /></td>
      <td style="padding:6px 8px;"><button type="button" class="btn-del-lvl secondary" style="padding:2px 6px;" ${canDelete ? '' : 'disabled'}>✕</button></td>
    `;

    tr.querySelector('.lvl-name').addEventListener('input', (e) => {
      lvl.name = e.target.value;
    });
    tr.querySelector('.lvl-elevation').addEventListener('input', (e) => {
      const v = M.parseDistanceInInches(e.target.value, {
        defaultUnit: 'in',
        allowZero: true,
        allowNegative: true,
      });
      lvl.elevation = v === null ? 0 : v;
    });
    tr.querySelector('.lvl-story').addEventListener('input', (e) => {
      const v = M.parseDistanceInInches(e.target.value, { defaultUnit: 'in' });
      lvl.storyHeight = v === null ? M.DEFAULT_STORY_HEIGHT : v;
    });
    tr.querySelector('.lvl-ceiling').addEventListener('input', (e) => {
      const v = M.parseDistanceInInches(e.target.value, { defaultUnit: 'in' });
      lvl.ceilingHeight = v === null ? M.DEFAULT_CEILING_HEIGHT : v;
    });
    tr.querySelector('.lvl-slab').addEventListener('input', (e) => {
      const v = M.parseDistanceInInches(e.target.value, { defaultUnit: 'in' });
      lvl.slabThickness = v === null ? M.DEFAULT_SLAB_THICKNESS : v;
    });
    tr.querySelector('.lvl-sub').addEventListener('change', (e) => {
      lvl.subterranean = e.target.checked;
    });
    tr.querySelector('.btn-del-lvl').addEventListener('click', () => {
      editingLevelMetadata.splice(idx, 1);
      renderLevelManagerRows();
    });

    tbody.appendChild(tr);
  });
}

function renderLevels() {
  ensureLevelMetadata();
  const minL = getMinLevel();
  const maxL = getMaxLevel();
  if (curLevel > maxL) curLevel = maxL;
  if (curLevel < minL) curLevel = minL;

  const el = $('#levels');
  if (!el) return;

  const elevs = M.calculateLevelElevations(doc);
  const levelsHtml = doc.levelMetadata
    .map((lvl) => {
      const e = elevs[lvl.index] !== undefined ? elevs[lvl.index] : lvl.elevation;
      const badge = M.formatElevationBadge(e);
      return `<button data-level="${lvl.index}" class="${lvl.index === curLevel ? 'on' : ''}">${esc(lvl.name)} <span class="elevation-badge" style="font-size:10px; opacity:0.8; margin-left:4px;">(${badge})</span></button>`;
    })
    .join('');

  const canDeleteTop =
    doc.levelMetadata.length > 1 && !doc.rooms.some((r) => (r.level || 0) === maxL);

  el.innerHTML =
    levelsHtml +
    '<button id="btn-open-level-manager" title="Manage level elevations and story heights" aria-label="Level Elevation Manager">⚙ Levels</button>' +
    '<button id="add-floor" title="Add a floor above" aria-label="Add floor above"><span aria-hidden="true">+</span> Floor</button>' +
    (canDeleteTop
      ? '<button id="del-floor" title="Remove empty top floor" aria-label="Remove top floor"><span aria-hidden="true">−</span> Floor</button>'
      : '');

  el.querySelectorAll('[data-level]').forEach((b) =>
    b.addEventListener('click', () => setLevel(Number(b.dataset.level)))
  );

  $('#btn-open-level-manager')?.addEventListener('click', () => {
    openLevelManagerDialog();
  });

  $('#add-floor')?.addEventListener('click', () => {
    ensureLevelMetadata();
    const curMax = getMaxLevel();
    const nextIdx = curMax + 1;
    if (nextIdx >= 10) return toast('Up to 10 floors are supported.', true);
    const topLvl =
      doc.levelMetadata.find((m) => m.index === curMax) || M.defaultLevelDescriptor(curMax);
    const newLvl = M.defaultLevelDescriptor(nextIdx);
    newLvl.elevation =
      (topLvl.elevation ?? curMax * M.DEFAULT_STORY_HEIGHT) +
      (topLvl.storyHeight || M.DEFAULT_STORY_HEIGHT);
    doc.levelMetadata.push(newLvl);
    doc.levels = nextIdx + 1;
    hist.push(doc, 'Add Floor');
    persist();
    setLevel(nextIdx);
    refresh();
    toast(
      `Floor ${nextIdx + 1} added. Place a stair room on the floor below, then use Fix automatically to add its match here.`
    );
  });

  $('#del-floor')?.addEventListener('click', () => {
    ensureLevelMetadata();
    const curMax = getMaxLevel();
    if (doc.levelMetadata.length <= 1) return;
    doc.levelMetadata = doc.levelMetadata.filter((m) => m.index !== curMax);
    doc.levels = Math.max(1, ...doc.levelMetadata.map((m) => (m.index >= 0 ? m.index + 1 : 1)));
    hist.push(doc, 'Delete Floor');
    persist();
    renderLevels();
    setLevel(Math.min(curLevel, getMaxLevel()));
    refresh();
  });
}

$('#btn-add-upper-level')?.addEventListener('click', () => {
  const maxIdx = Math.max(0, ...editingLevelMetadata.map((m) => m.index));
  const topLvl =
    editingLevelMetadata.find((m) => m.index === maxIdx) || M.defaultLevelDescriptor(maxIdx);
  const newIdx = maxIdx + 1;
  const newLvl = M.defaultLevelDescriptor(newIdx);
  newLvl.elevation =
    (topLvl.elevation ?? maxIdx * M.DEFAULT_STORY_HEIGHT) +
    (topLvl.storyHeight || M.DEFAULT_STORY_HEIGHT);
  editingLevelMetadata.push(newLvl);
  editingLevelMetadata.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  renderLevelManagerRows();
});

$('#btn-add-sub-level')?.addEventListener('click', () => {
  const minIdx = Math.min(0, ...editingLevelMetadata.map((m) => m.index));
  const botLvl =
    editingLevelMetadata.find((m) => m.index === minIdx) || M.defaultLevelDescriptor(minIdx);
  const newIdx = minIdx - 1;
  const newLvl = M.defaultLevelDescriptor(newIdx, `Basement ${Math.abs(newIdx)}`);
  newLvl.elevation =
    (botLvl.elevation ?? minIdx * M.DEFAULT_STORY_HEIGHT) -
    (botLvl.storyHeight || M.DEFAULT_STORY_HEIGHT);
  newLvl.subterranean = true;
  editingLevelMetadata.push(newLvl);
  editingLevelMetadata.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  renderLevelManagerRows();
});

$('#btn-apply-level-manager')?.addEventListener('click', () => {
  const errContainer = $('#level-manager-validation-errors');
  const validation = M.validateLevelHierarchy(editingLevelMetadata);
  if (!validation.valid) {
    if (errContainer) {
      errContainer.innerHTML = validation.errors.map((e) => `<div>• ${esc(e)}</div>`).join('');
      errContainer.style.display = 'block';
    }
    return;
  }
  if (errContainer) {
    errContainer.style.display = 'none';
    errContainer.innerHTML = '';
  }
  M.setLevelMetadata(doc, editingLevelMetadata);
  hist.push(doc, 'Update Level Elevation Properties');
  persist();
  renderLevels();
  setLevel(curLevel);
  window.__scene3d?.update();
  redraw();
  $('#dlg-level-manager')?.close();
  toast('Level elevation settings applied.');
});

$('#btn-cancel-level-manager')?.addEventListener('click', () => {
  $('#dlg-level-manager')?.close();
});

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

const CATALOG_ANNOUNCE_DEBOUNCE_MS = 300;
let catalogAnnounceTimer = null;

function getCatalogStatusAnnouncer() {
  if (typeof document === 'undefined') return null;
  if (typeof document.getElementById === 'function') {
    const byId = document.getElementById('catalog-status-announcer');
    if (byId) return byId;
  }
  return $('#catalog-status-announcer');
}

export function clearCatalogAnnouncement() {
  if (catalogAnnounceTimer) {
    clearTimeout(catalogAnnounceTimer);
    catalogAnnounceTimer = null;
  }
  const announcer = getCatalogStatusAnnouncer();
  if (announcer) {
    announcer.textContent = '';
  }
}

export function announceCatalogResults(count, delayMs = CATALOG_ANNOUNCE_DEBOUNCE_MS) {
  if (catalogAnnounceTimer) {
    clearTimeout(catalogAnnounceTimer);
    catalogAnnounceTimer = null;
  }
  catalogAnnounceTimer = setTimeout(() => {
    catalogAnnounceTimer = null;
    const announcer = getCatalogStatusAnnouncer();
    if (!announcer) return;
    const n = Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0;
    const msg = `${n} furniture ${n === 1 ? 'item' : 'items'} found`;
    if (announcer.textContent !== msg) {
      announcer.textContent = msg;
    }
  }, delayMs);
}

export function getCatalogFilters() {
  return {
    query: catalogSearchQuery,
    maxW: catalogMaxWidth,
    maxD: catalogMaxDepth,
  };
}

export function setCatalogFilters({ query, maxW, maxD } = {}) {
  if (query !== undefined) catalogSearchQuery = String(query);
  if (maxW !== undefined) catalogMaxWidth = String(maxW);
  if (maxD !== undefined) catalogMaxDepth = String(maxD);
}

export function resetCatalogFilters() {
  catalogSearchQuery = '';
  catalogMaxWidth = '';
  catalogMaxDepth = '';
}

export function renderCatalogPanel(items = ITEMS) {
  let h = `<div class="catalog-search-container">
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

  const filtered = filterItems(items, {
    query: catalogSearchQuery,
    maxW: catalogMaxWidth,
    maxD: catalogMaxDepth,
  });

  if (filtered.length === 0) {
    h += `<div class="catalog-empty"><p>No matching items found</p><button id="catalog-reset-filters" class="btn secondary btn-sm catalog-reset-btn" type="button">Clear filters</button></div>`;
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

  return h;
}

export function renderPalette() {
  if (tab !== 'buy') {
    clearCatalogAnnouncement();
  }
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
    const filtered = filterItems(ITEMS, getCatalogFilters());
    announceCatalogResults(filtered.length);
    h += renderCatalogPanel(ITEMS);
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
      '<h4>Wallpaper & paint (click a wall)</h4>' +
      '<div style="margin-bottom:12px"><button id="btn-add-custom-material" class="btn primary" style="width:100%" type="button">+ Add Custom Material</button></div>' +
      '<div class="grid">' +
      WALL_FINISHES.map((f) => {
        const sub = f.wet ? 'moisture-rated' : f.tileInches ? `${f.tileInches}" tile` : '';
        let cardHtml = card(
          f.name,
          sub,
          tool.kind === 'wall' && tool.id === f.id,
          `data-tool="wall" data-id="${f.id}"`,
          swatchStyle(f)
        );
        if (f.isCustom) {
          const densityId = `custom-density-${esc(f.id)}`;
          cardHtml += `<div style="margin-top:4px;display:flex;align-items:center;justify-content:space-between;font-size:11px"><label for="${densityId}" style="margin:0;font-size:11px">Tile Density:</label><select id="${densityId}" class="custom-density-select" data-id="${f.id}" style="padding:1px 4px;font-size:11px"><option value="12" ${f.tileInches === 12 ? 'selected' : ''}>12"</option><option value="24" ${f.tileInches === 24 ? 'selected' : ''}>24"</option><option value="48" ${f.tileInches === 48 ? 'selected' : ''}>48"</option><option value="96" ${f.tileInches === 96 ? 'selected' : ''}>96"</option></select></div>`;
        }
        return cardHtml;
      }).join('') +
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
  p.querySelector('#btn-add-custom-material')?.addEventListener('click', () => {
    const dlg = $('#dlg-custom-material');
    if (dlg) {
      const nameInput = $('#custom-mat-name');
      const fileInput = $('#custom-mat-file');
      const densitySel = $('#custom-mat-density');
      if (nameInput) nameInput.value = '';
      if (fileInput) fileInput.value = '';
      if (densitySel) densitySel.value = '24';
      if (typeof dlg.showModal === 'function') {
        try {
          dlg.showModal();
        } catch {
          dlg.setAttribute('open', '');
        }
      }
    }
  });
  p.querySelectorAll('.custom-density-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      const finishId = sel.dataset.id;
      const finish = WALL_BY_ID[finishId];
      if (finish) {
        const newDensity = Number(sel.value);
        registerCustomWallFinish({ ...finish, tileInches: newDensity }, doc);
        clearPatternCache(finishId);
        refresh();
        toast(`Updated tile density for "${finish.name}" to ${newDensity}"`);
      }
    });
  });
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

  $('#catalog-reset-filters')?.addEventListener('click', () => {
    catalogSearchQuery = '';
    catalogMaxWidth = '';
    catalogMaxDepth = '';
    renderPalette();
    $('#catalog-search')?.focus?.();
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
  const prevKind = tool?.kind;
  tool = t;
  preview = null;
  drag = null;
  closeWallHud();
  if (t.kind !== 'calibrate') calibPoints = [];
  if (t.kind !== 'room' && prevKind === 'room') {
    if (interaction.resetRoomDrawing) interaction.resetRoomDrawing();
    const btnClose = $('#btn-close-room');
    if (btnClose) btnClose.hidden = true;
  }
  syncDraftingCurveHud();
  document
    .querySelectorAll('#toolbar [data-tool]')
    .forEach((b) => b.classList.toggle('on', b.dataset.tool === t.kind));
  if ($('#tool-hint')) $('#tool-hint').textContent = HINTS[t.kind] || '';
  if (canvas) canvas.style.cursor = t.kind === 'select' ? 'default' : 'crosshair';
  renderPalette();
  updateWallAngleHud();
  redraw();
}

// ------------------------------------------------------------- pointer interaction
function updatePreview() {
  preview = null;
  if (!hover || drag?.kind === 'pan') return;
  if (tool.kind === 'room') {
    const seqPts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
    if (seqPts.length > 0) {
      const anchor = seqPts[seqPts.length - 1];
      const snapRes = snappingBridge.computeSnap(hover, anchor);
      const edges = extractRoomEdges(levelRooms());
      const roomPv = interaction.previewRoom(hover, {
        edges,
        existingRooms: levelRooms(),
        scale: view.scale,
        explicitAngleDegrees: snappingBridge.getExplicitAngleDegrees(),
        tolerance: EPS,
      });
      if (roomPv) {
        preview = { next: doc, ok: !roomPv.invalid, fresh: [], feedback: roomPv };
      }
      updateWallAngleHudReadout(snapRes);
    }
    return;
  }
  if (tool.kind === 'item') {
    const pl = placeItem(tool.id, hover);
    if (pl) {
      preview = tryPreview((n) => M.addItem(n, roomOf(n, pl.room.id), tool.id, { ...pl.props }));
      if (pl.feedback) preview.feedback = pl.feedback;
    }
  } else if (tool.kind === 'opening') {
    const snapRes = snappingBridge.computeSnap(hover, hover);
    const targetP = snapRes && snapRes.point ? snapRes.point : hover;
    const nw = nearestWall(targetP);
    if (nw) {
      const def = OPENING_BY_ID[tool.id];
      const offset = M.clampOpeningOffset(nw.room, nw.wall, nw.t - def.w / 2, def.w);
      preview = tryPreview((n) => M.addOpening(n, roomOf(n, nw.room.id), tool.id, nw.wall, offset));
    }
  } else if (tool.kind === 'roomkit') {
    const kit = ROOM_KIT_BY_ID[tool.id];
    const snapRes = snappingBridge.computeSnap(hover, hover);
    const targetP = snapRes && snapRes.point ? snapRes.point : hover;
    const rc = { x: targetP.x - kit.w / 2, y: targetP.y - kit.h / 2, w: kit.w, h: kit.h };
    preview = tryPreview((n) => M.placeRoomKit(n, tool.id, rc.x, rc.y, curLevel));
  }
}

canvas?.addEventListener('pointerdown', (e) => {
  const p = toWorld(e);
  hover = p;
  if (e.button === 0 && !e.altKey && selection) {
    const hudHit = hitTestOpeningHUD({ ...doc, rooms: levelRooms() }, selection, p, view, {
      openingUnits: getOpeningUnitMode(),
    });
    if (hudHit) {
      e.preventDefault();
      e.stopPropagation();
      openOpeningHudEditor(hudHit.openingId, hudHit.side);
      return;
    }
  }
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 1 || e.button === 2 || e.altKey) {
    drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
    return;
  }
  if (e.button === 0 && !e.altKey) {
    if (activeHudEdit) {
      closeOpeningHudEditor();
    }
    const hitNode = complianceScene.hitTest(p, view);
    if (hitNode && hitNode.type === 'violation' && hitNode.data?.fixButtonBounds) {
      const v = hitNode.data.violation;
      const targetId = v?.id || hitNode.data.targetId;
      const r = apply((state) => autoComply(state, { targetId }), { quiet: true });
      if (r.ok && r.changes.length) {
        toast(`Remediated: ${r.changes[0].msg}`);
      } else {
        toast('Violation could not be remediated automatically.', true);
      }
      return;
    }
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
        const preHit = M.findOwner(doc, id);
        if (preHit && preHit.kind === 'room') {
          const nw = nearestWall(p, 18, preHit.room);
          if (nw) window.__activeCurveWall = nw.wall;
        }
        select(id);
      } else {
        const preHit = M.findOwner(doc, id);
        if (preHit && preHit.kind === 'room') {
          const nw = nearestWall(p, 18, preHit.room);
          if (nw && window.__activeCurveWall !== nw.wall) {
            window.__activeCurveWall = nw.wall;
            renderInspector();
          }
        }
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
        if (hs >= 0) {
          activeHandleIndex = hs;
          updateWallAngleHud();
        }
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
        const label = getSelectionLabel(id);
        const r = apply((n) => M.removeById(n, id), 'Erase Element');
        if (r.ok) {
          if (isSelected(id)) {
            selectionSet.delete(id);
            select(selectionSet.size > 0 ? Array.from(selectionSet) : null);
          }
          toast(`Deleted ${label || 'element'}`, false, 4500, UNDO_TOAST_ACTION);
        }
      }
      break;
    }
    case 'room': {
      const snapRes = snappingBridge.computeSnap(p, p);
      const startPt = snapRes && snapRes.point ? snapRes.point : p;
      drag = {
        kind: 'room-new',
        x0: startPt.x,
        y0: startPt.y,
        rect: { x: startPt.x, y: startPt.y, w: 0, h: 0 },
      };
      break;
    }
    case 'item': {
      const pl = placeItem(tool.id, p);
      if (!pl) {
        toast('Place items inside a room.', true, 2000);
        break;
      }
      const r = apply((n) => {
        const it = M.addItem(n, roomOf(n, pl.room.id), tool.id, { ...pl.props });
        selection = it.id;
      }, 'Add Item');
      if (!r.ok) selection = null;
      else renderInspector();
      break;
    }
    case 'opening': {
      const snapRes = snappingBridge.computeSnap(p, p);
      const targetP = snapRes && snapRes.point ? snapRes.point : p;
      const nw = nearestWall(targetP);
      if (!nw) {
        toast('Click on a wall.', true, 2000);
        break;
      }
      const def = OPENING_BY_ID[tool.id];
      const offset = M.clampOpeningOffset(nw.room, nw.wall, nw.t - def.w / 2, def.w);
      apply((n) => M.addOpening(n, roomOf(n, nw.room.id), tool.id, nw.wall, offset), 'Add Opening');
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
      }, 'Apply Wall Finish');
      break;
    }
    case 'floor': {
      const r = roomAt(p);
      if (!r) break;
      apply((n) => {
        const rm = roomOf(n, r.id);
        M.applyFloorFinish(n, tool.id, { scope: paintScope, room: rm, level: curLevel });
      }, 'Apply Floor Finish');
      break;
    }
    case 'roomkit': {
      const kit = ROOM_KIT_BY_ID[tool.id];
      const snapRes = snappingBridge.computeSnap(p, p);
      const targetP = snapRes && snapRes.point ? snapRes.point : p;
      const rc = { x: targetP.x - kit.w / 2, y: targetP.y - kit.h / 2, w: kit.w, h: kit.h };
      apply((n) => {
        const r = M.placeRoomKit(n, tool.id, rc.x, rc.y, curLevel);
        selection = r.id;
      }, 'Place Room Kit');
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
        hist.push(doc, `Place ${kit.name}`);
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
        const multiRes = snappingBridge.computeMultiSnap(
          p,
          { x: drag.sx, y: drag.sy },
          drag.itemsInitial
        );
        const { dx, dy } = multiRes.delta;
        preview = tryPreview((n) => {
          for (const [sId, initial] of drag.itemsInitial.entries()) {
            const h = M.findOwner(n, sId);
            if (h) {
              M.setItemPosition(n, h, initial.cx + dx, initial.cy + dy);
            }
          }
        });
        if (preview) preview.feedback = multiRes.snap;
      } else {
        const snapRes = snappingBridge.computeSnap(p, p);
        const targetP = snapRes && snapRes.point ? snapRes.point : p;
        const it = M.findOwner(doc, drag.id).obj;
        const pl = placeItem(it.type, targetP, it.rot || 0);
        if (pl) {
          drag.target = pl;
          preview = tryPreview(moveItemTo(drag.id, pl));
          complianceManager.dispatchItemMoved({
            id: drag.id,
            cx: pl.props.x,
            cy: pl.props.y,
            rot: it.rot,
            roomId: pl.room.id,
            doc: preview ? preview.next : null,
          });
        }
      }
    } else if (drag.kind === 'opening') {
      const snapRes = snappingBridge.computeSnap(p, p);
      const targetP = snapRes && snapRes.point ? snapRes.point : p;
      const { room, obj } = M.findOwner(doc, drag.id);
      const nw = nearestWall(targetP, 40, room);
      if (nw) {
        const offset = M.clampOpeningOffset(room, nw.wall, nw.t - obj.width / 2, obj.width);
        drag.target = { wall: nw.wall, offset };
        preview = tryPreview((n) => {
          const o = M.findOwner(n, drag.id).obj;
          Object.assign(o, drag.target);
        });
        complianceManager.dispatchWallUpdated({
          roomId: room.id,
          wall: nw.wall,
          doc: preview ? preview.next : null,
        });
      }
    } else if (drag.kind === 'room') {
      const r = roomOf(doc, drag.id);
      const rawTarget = { x: p.x - drag.dx, y: p.y - drag.dy };
      const otherRooms = levelRooms().filter((rm) => rm.id !== drag.id);
      const snapRes = snappingBridge.computeSnap(rawTarget, rawTarget, otherRooms);
      const targetPt = snapRes && snapRes.point ? snapRes.point : rawTarget;
      const rc = { x: targetPt.x, y: targetPt.y, w: r.w, h: r.h };
      drag.target = rc;
      preview = tryPreview((n) => M.moveRoom(roomOf(n, drag.id), rc.x, rc.y));
      complianceManager.dispatchRoomResized({
        roomId: drag.id,
        rect: rc,
        doc: preview ? preview.next : null,
      });
    } else if (drag.kind === 'resize') {
      const r = roomOf(doc, drag.id);
      const pts = getRoomPoints(r);
      const cornerIdx = drag.corner % pts.length;
      const prevIdx = (cornerIdx - 1 + pts.length) % pts.length;
      const anchor = pts[prevIdx];
      const otherRooms = levelRooms().filter((rm) => rm.id !== r.id);

      const snapRes = snappingBridge.computeSnap(p, anchor, otherRooms);
      activeHandleIndex = cornerIdx;
      updateWallAngleHudReadout(snapRes);

      const newPt = snapRes.point;
      const newPts = pts.map((pt, i) => (i === cornerIdx ? { x: newPt.x, y: newPt.y } : { ...pt }));

      if (polygonArea(newPts) > 10) {
        const bbox = getRoomBoundingBox(newPts);
        drag.target = { points: newPts, x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h };
        preview = tryPreview((n) => M.updateRoomPoints(roomOf(n, drag.id), newPts));
        if (preview) preview.feedback = snapRes.snap;
        complianceManager.dispatchRoomResized({
          roomId: drag.id,
          points: newPts,
          rect: bbox,
          doc: preview ? preview.next : null,
        });
      }
    } else if (drag.kind === 'room-new') {
      const snapRes = snappingBridge.computeSnap(p, { x: drag.x0, y: drag.y0 });
      const cornerPt = snapRes && snapRes.point ? snapRes.point : p;
      const x1 = cornerPt.x;
      const y1 = cornerPt.y;
      drag.rect = {
        x: Math.min(drag.x0, x1),
        y: Math.min(drag.y0, y1),
        w: Math.abs(x1 - drag.x0),
        h: Math.abs(y1 - drag.y0),
      };

      const candPoly = roomToPolygon(drag.rect);
      const existingRooms = doc.rooms
        .filter((r) => (r.level || 0) === curLevel)
        .map(toRoomCollisionShape);
      const validation = validatePlacement(candPoly, existingRooms, { tolerance: EPS });
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
  if (tool.kind === 'room' && interaction.getCornerCount && interaction.getCornerCount() > 0) {
    syncDraftingCurveHud({ keepError: true });
  }

  const hudHoverHit =
    selection && p
      ? hitTestOpeningHUD({ ...doc, rooms: levelRooms() }, selection, p, view, {
          openingUnits: getOpeningUnitMode(),
        })
      : null;
  hoveredOpeningHudSide = hudHoverHit ? hudHoverHit.side : null;
  if (canvas && tool.kind === 'select') {
    canvas.style.cursor = hudHoverHit ? 'pointer' : 'default';
  }

  // Hover violation tooltip detection
  if (p) {
    const pickedId = pickAt(p);
    const wallPick = nearestWall(p, 10 / view.scale);
    const wallKey = wallPick ? `${wallPick.room.id}:${wallPick.wall}` : null;
    const wallIdxKey = wallPick ? `${wallPick.room.id}:wall:${wallPick.wall}` : null;

    const violations = report?.violations || [];
    hoveredViolation =
      violations.find((v) => {
        if (
          pickedId &&
          (v.itemId === pickedId ||
            v.openingId === pickedId ||
            v.roomId === pickedId ||
            v.target === pickedId)
        ) {
          return true;
        }
        if (
          wallKey &&
          (v.wallId === wallKey || (v.roomId === wallPick?.room.id && v.wall === wallPick?.wall))
        ) {
          return true;
        }
        if (wallIdxKey && v.wallId === wallIdxKey) {
          return true;
        }
        return false;
      }) || null;

    if (canvas) {
      canvas.title = hoveredViolation
        ? `${hoveredViolation.severity.toUpperCase()}: ${hoveredViolation.msg} (${hoveredViolation.ref})`
        : '';
    }
  }

  redraw();
});

function moveItemTo(id, pl) {
  return moveItemMutation(id, pl);
}

function handleCloseRoom() {
  if (!interaction.canCloseRoom || !interaction.canCloseRoom()) {
    toast('At least 3 corners are required to close a room.', true);
    return;
  }
  const closeRes = interaction.closeRoom({
    existingRooms: levelRooms(),
    tolerance: EPS,
  });
  if (closeRes.ok && closeRes.room?.corners) {
    const pts = closeRes.room.corners;
    const roomBulges = closeRes.room.bulges;
    const minX = Math.min(...pts.map((pt) => pt.x));
    const maxX = Math.max(...pts.map((pt) => pt.x));
    const minY = Math.min(...pts.map((pt) => pt.y));
    const maxY = Math.max(...pts.map((pt) => pt.y));
    const w = Math.max(24, maxX - minX);
    const h = Math.max(24, maxY - minY);
    const x = minX;
    const y = minY;
    const roomType = tool.kind === 'room' && tool.type ? tool.type : tool.type || 'living';
    let createdId = null;
    const r = apply((n) => {
      const created = M.addRoom(n, x, y, w, h, roomType, {
        level: curLevel,
        points: pts,
        bulges: roomBulges,
      });
      createdId = created.id;
    }, 'Close Room');
    if (r.ok) {
      closeWallHud();
      const labelName = ROOM_TYPES[roomType]?.name || 'Living';
      announceToLiveRegion(
        `${labelName} room closed and created at (${Math.round(x)}", ${Math.round(y)}") with dimensions ${Math.round(w)}" × ${Math.round(h)}".`
      );
      interaction.resetRoomDrawing();
      activeDraftCurveEdge = null;
      draftConcavitySign = 1;
      syncDraftingCurveHud();
      const btnClose = $('#btn-close-room');
      if (btnClose) btnClose.hidden = true;
      const hint = $('#tool-hint');
      if (hint) hint.textContent = '';
      if (createdId) select(createdId);
      redraw();
    }
  } else {
    toast(
      'Invalid room placement. Room corners overlap existing geometry or violate code constraints.',
      true
    );
    announceToLiveRegion('Invalid room placement.');
  }
}

function getSelectedSingleRoom() {
  const selectedList = getSelectionList();
  if (selectedList.length !== 1) return null;
  const hit = M.findOwner(doc, selectedList[0]);
  if (!hit || hit.kind !== 'room') return null;
  return hit.room;
}

function getCornerIncomingAngleDegrees(pts, cornerIndex) {
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  const idx = ((cornerIndex % pts.length) + pts.length) % pts.length;
  const prevIdx = (idx - 1 + pts.length) % pts.length;
  const dx = pts[idx].x - pts[prevIdx].x;
  const dy = pts[idx].y - pts[prevIdx].y;
  if (dx === 0 && dy === 0) return 0;
  const deg = Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2));
  return Object.is(deg, -0) ? 0 : deg;
}

function updateWallAngleHudReadout(snapState = snappingBridge?.getActiveSnap()) {
  const readout = $('#hud-wall-angle-readout');
  if (!readout) return;
  const explicitDeg = snappingBridge.getExplicitAngleDegrees();
  if (explicitDeg !== null) {
    readout.textContent = fmtAngleDegrees(explicitDeg);
    return;
  }
  if (
    snapState &&
    typeof snapState.angleDegrees === 'number' &&
    Number.isFinite(snapState.angleDegrees)
  ) {
    readout.textContent = fmtAngleDegrees(snapState.angleDegrees);
    return;
  }
  readout.textContent = 'Auto';
}

function updateWallAngleHud() {
  const hud = $('#wall-angle-hud');
  if (!hud) return;

  const view3dCanvas = $('#view3d');
  const in3D = Boolean(view3dCanvas && !view3dCanvas.hidden);
  const selectedRoom = getSelectedSingleRoom();
  const isDrawingRoom = tool.kind === 'room';
  const isEditingRoomHandles = Boolean(selectedRoom) || drag?.kind === 'resize';

  if (in3D || (!isDrawingRoom && !isEditingRoomHandles)) {
    hud.hidden = true;
    return;
  }

  hud.hidden = false;

  const angleInput = $('#hud-wall-angle');
  const explicitDeg = snappingBridge.getExplicitAngleDegrees();
  if (angleInput && document.activeElement !== angleInput) {
    angleInput.value = explicitDeg !== null ? String(explicitDeg) : '';
  }
  updateWallAngleHudReadout();

  const handleGroup = $('#hud-handle-group');
  const handleSelect = $('#hud-handle-select');
  const handleAngleInput = $('#hud-handle-angle');

  if (!handleGroup) return;

  const targetRoom = drag?.kind === 'resize' ? roomOf(doc, drag.id) : selectedRoom;

  if (!targetRoom || isDrawingRoom) {
    handleGroup.hidden = true;
    return;
  }

  handleGroup.hidden = false;
  const pts = getRoomPoints(targetRoom);
  if (!pts.length) return;

  if (activeHandleIndex < 0 || activeHandleIndex >= pts.length) {
    activeHandleIndex = 0;
  }

  if (handleSelect) {
    const cornerNames4 = ['1 (Top-Left)', '2 (Top-Right)', '3 (Bottom-Right)', '4 (Bottom-Left)'];
    const optionsHtml = pts
      .map((_, i) => {
        const label = pts.length === 4 ? cornerNames4[i] : `Vertex ${i + 1}`;
        return `<option value="${i}"${i === activeHandleIndex ? ' selected' : ''}>${label}</option>`;
      })
      .join('');
    if (handleSelect.innerHTML !== optionsHtml) {
      handleSelect.innerHTML = optionsHtml;
    }
    handleSelect.value = String(activeHandleIndex);
  }

  if (handleAngleInput && document.activeElement !== handleAngleInput) {
    const currentDeg = getCornerIncomingAngleDegrees(pts, activeHandleIndex);
    handleAngleInput.value = String(currentDeg);
  }
}

function setExplicitWallAngleFromHud(rawValue) {
  const parsed = snappingBridge.setExplicitAngleDegrees(rawValue);
  interaction.setGridSettings({ explicitAngleDegrees: parsed });
  if (hover) {
    const seqPts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
    const anchor = seqPts.length > 0 ? seqPts[seqPts.length - 1] : hover;
    snappingBridge.computeSnap(hover, anchor);
    updatePreview();
  } else {
    updateWallAngleHudReadout();
  }
  redraw();
  return parsed;
}

function applyConstraintHandleAngleFromHud() {
  const targetRoom = getSelectedSingleRoom();
  if (!targetRoom) return false;

  const rawValue = $('#hud-handle-angle')?.value ?? '';
  const parsedAngle = parseExplicitAngleDegrees(rawValue);
  if (parsedAngle === null) {
    toast('Enter a valid numeric angle in degrees.', true);
    updateWallAngleHud();
    return false;
  }

  const pts = getRoomPoints(targetRoom);
  if (pts.length < 3) return false;

  const cornerIdx = ((activeHandleIndex % pts.length) + pts.length) % pts.length;
  const prevIdx = (cornerIdx - 1 + pts.length) % pts.length;
  const anchor = pts[prevIdx];
  const currentCorner = pts[cornerIdx];
  const wallLen = Math.hypot(currentCorner.x - anchor.x, currentCorner.y - anchor.y);

  let projectedCorner;
  if (!Number.isFinite(wallLen) || wallLen === 0) {
    projectedCorner = { x: anchor.x, y: anchor.y };
  } else {
    const rad = (parsedAngle * Math.PI) / 180;
    projectedCorner = {
      x: anchor.x + wallLen * Math.cos(rad),
      y: anchor.y + wallLen * Math.sin(rad),
    };
  }

  const updatedPts = pts.map((pt, idx) =>
    idx === cornerIdx ? projectedCorner : { x: pt.x, y: pt.y }
  );

  if (polygonArea(updatedPts) <= 10) {
    toast('Resulting room polygon area is too small or degenerate.', true);
    return false;
  }

  const res = apply(
    (n) => {
      const rm = roomOf(n, targetRoom.id);
      M.updateRoomPoints(rm, updatedPts, n);
      for (const it of rm.items || []) {
        if (it.wall !== undefined && typeof it.offset === 'number') {
          const wLen = wallLength(rm, it.wall);
          if (wLen > 16) {
            it.offset = Math.max(8, Math.min(it.offset, wLen - 8));
          }
        }
      }
    },
    `Set Corner ${cornerIdx + 1} Angle to ${fmtAngleDegrees(parsedAngle)}`
  );
  if (res.ok) {
    announceToLiveRegion(
      `Updated corner ${cornerIdx + 1} wall angle to ${fmtAngleDegrees(parsedAngle)}.`
    );
    updateWallAngleHud();
  }
  return res.ok;
}

function setupWallAngleHud() {
  const angleInput = $('#hud-wall-angle');
  const clearBtn = $('#hud-wall-angle-clear');
  const handleSelect = $('#hud-handle-select');
  const handleAngleInput = $('#hud-handle-angle');
  const handleApplyBtn = $('#hud-handle-angle-apply');

  angleInput?.addEventListener('input', (e) => {
    setExplicitWallAngleFromHud(e.target.value);
  });

  angleInput?.addEventListener('change', (e) => {
    setExplicitWallAngleFromHud(e.target.value);
  });

  angleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      angleInput.value = '';
      setExplicitWallAngleFromHud(null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setExplicitWallAngleFromHud(angleInput.value);
      canvas?.focus();
    }
  });

  clearBtn?.addEventListener('click', () => {
    if (angleInput) angleInput.value = '';
    setExplicitWallAngleFromHud(null);
  });

  handleSelect?.addEventListener('change', (e) => {
    activeHandleIndex = Number.parseInt(e.target.value, 10) || 0;
    updateWallAngleHud();
    redraw();
  });

  handleAngleInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyConstraintHandleAngleFromHud();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      updateWallAngleHud();
      canvas?.focus();
    }
  });

  handleApplyBtn?.addEventListener('click', () => {
    applyConstraintHandleAngleFromHud();
  });

  document.querySelectorAll('#toolbar [data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTimeout(() => updateWallAngleHud(), 0);
    });
  });

  updateWallAngleHud();
}

function openAddRoomDimsModal() {
  const dlg = $('#dlg-add-room-dims');
  if (!dlg) return;
  if (typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    dlg.setAttribute('open', '');
  }
}

function closeAddRoomDimsModal() {
  const dlg = $('#dlg-add-room-dims');
  if (!dlg) return;
  if (typeof dlg.close === 'function') {
    dlg.close();
  } else {
    dlg.removeAttribute('open');
  }
}

function setupAddRoomDimsModal() {
  const btnOpen = $('#btn-open-add-room-dims');
  const btnSubmit = $('#btn-add-room-dims-submit');
  const btnCancel = $('#btn-add-room-dims-cancel');
  const btnClose = $('#btn-add-room-dims-close');

  btnOpen?.addEventListener('click', openAddRoomDimsModal);
  btnCancel?.addEventListener('click', closeAddRoomDimsModal);
  btnClose?.addEventListener('click', closeAddRoomDimsModal);

  btnSubmit?.addEventListener('click', () => {
    const type = $('#room-dims-type')?.value || 'living';
    const rawW = $('#room-dims-width')?.value;
    const rawH = $('#room-dims-depth')?.value;
    const rawX = $('#room-dims-x')?.value;
    const rawY = $('#room-dims-y')?.value;

    const w = M.parseDistanceInInches(rawW !== undefined && rawW !== '' ? rawW : '144', {
      defaultUnit: 'in',
    });
    const h = M.parseDistanceInInches(rawH !== undefined && rawH !== '' ? rawH : '144', {
      defaultUnit: 'in',
    });
    const x = M.parseDistanceInInches(rawX !== undefined && rawX !== '' ? rawX : '0', {
      defaultUnit: 'in',
      allowZero: true,
      allowNegative: true,
    });
    const y = M.parseDistanceInInches(rawY !== undefined && rawY !== '' ? rawY : '0', {
      defaultUnit: 'in',
      allowZero: true,
      allowNegative: true,
    });

    if (w === null || w <= 0 || h === null || h <= 0 || x === null || y === null) {
      toast('Please enter valid room dimensions (width and depth > 0).', true);
      return;
    }

    const r = apply((n) => M.addRoom(n, x, y, w, h, type, { level: curLevel }), 'Add Room');
    if (r.ok) {
      const typeName = ROOM_TYPES[type]?.name || type;
      announceToLiveRegion(
        `${typeName} room added at (${fmtLen(x)}, ${fmtLen(y)}) with dimensions ${fmtLen(w)} × ${fmtLen(h)}.`
      );
      closeAddRoomDimsModal();
    }
  });
}

canvas?.addEventListener('pointerup', () => {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.kind === 'pan') return;
  if (d.kind === 'background') {
    if (d.moved) {
      hist.push(doc, 'Move Blueprint');
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
      }, 'Add Room');
      if (!r.ok) select(null);
    } else {
      const p = hover || { x: d.x0, y: d.y0 };
      const cornerRes = interaction.addRoomCorner(p, {
        edges: extractRoomEdges(levelRooms()),
        existingRooms: levelRooms(),
        scale: view.scale,
        explicitAngleDegrees: snappingBridge.getExplicitAngleDegrees(),
        tolerance: EPS,
      });
      const placedPt = cornerRes?.corner || p;
      const count = interaction.getCornerCount();
      activeDraftCurveEdge = count >= 2 ? count - 2 : 0;
      syncDraftingCurveHud();
      const hint = $('#tool-hint');
      if (hint) hint.textContent = `Corner ${count} placed. Tap next corner or click Close Room.`;
      const btnClose = $('#btn-close-room');
      if (btnClose) btnClose.hidden = !interaction.canCloseRoom();
      announceToLiveRegion(
        `Placed corner ${count} at (${Math.round(placedPt.x)}", ${Math.round(placedPt.y)}").`
      );
      redraw();
    }
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
      let dx = hover ? hover.x - d.sx : 0;
      let dy = hover ? hover.y - d.sy : 0;
      if (hover) {
        const multiRes = snappingBridge.computeMultiSnap(
          hover,
          { x: d.sx, y: d.sy },
          d.itemsInitial
        );
        if (multiRes && multiRes.delta) {
          dx = multiRes.delta.dx;
          dy = multiRes.delta.dy;
        }
      }
      apply((n) => {
        for (const [sId, initial] of d.itemsInitial.entries()) {
          const h = M.findOwner(n, sId);
          if (h) {
            M.setItemPosition(n, h, initial.cx + dx, initial.cy + dy);
          }
        }
      }, 'Move Item');
    } else if (d.target) {
      apply(moveItemTo(d.id, d.target), 'Move Item');
    }
  } else if (d.kind === 'opening')
    apply((n) => Object.assign(M.findOwner(n, d.id).obj, d.target), 'Move Opening');
  else if (d.kind === 'room')
    apply((n) => M.moveRoom(roomOf(n, d.id), d.target.x, d.target.y), 'Move Room');
  else if (d.kind === 'resize') {
    if (d.target && d.target.points) {
      apply((n) => M.updateRoomPoints(roomOf(n, d.id), d.target.points), 'Resize Room Corner');
    } else if (d.target) {
      apply(
        (n) => M.resizeRoom(roomOf(n, d.id), d.target.x, d.target.y, d.target.w, d.target.h),
        'Resize Room'
      );
    }
  }
});

const wallHudState = {
  open: false,
  focused: false,
  mode: null,
  worldPos: null,
  nodeId: null,
  roomId: null,
  wallKey: null,
  wallIndex: 0,
  cornerIndex: null,
  anchor: null,
  pointerPoint: null,
  snappedPoint: null,
  snappedLength: null,
  rectStart: null,
  previewPoint: null,
  error: '',
};

function worldToStagePixels(worldPt) {
  if (!worldPt) return { left: 0, top: 0 };
  const stageEl = $('#stage');
  let offsetX = 0;
  let offsetY = 0;
  if (
    stageEl &&
    canvas &&
    typeof stageEl.getBoundingClientRect === 'function' &&
    typeof canvas.getBoundingClientRect === 'function'
  ) {
    const sr = stageEl.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    offsetX = cr.left - sr.left;
    offsetY = cr.top - sr.top;
  }
  return {
    left: offsetX + worldPt.x * view.scale + view.ox,
    top: offsetY + worldPt.y * view.scale + view.oy,
  };
}

function updateWallHudPosition() {
  const hudEl = $('#wall-length-hud');
  if (!hudEl) return;
  if (!wallHudState.open || !wallHudState.worldPos) {
    hudEl.hidden = true;
    return;
  }
  const { left, top } = worldToStagePixels(wallHudState.worldPos);
  hudEl.style.left = `${Math.round(left)}px`;
  hudEl.style.top = `${Math.round(top)}px`;
  hudEl.hidden = false;
}

function setWallHudError(msg = '') {
  wallHudState.error = msg || '';
  const hudEl = $('#wall-length-hud');
  const errEl = $('#wall-length-hud-error');
  const inputEl = $('#wall-length-hud-input');
  if (hudEl) {
    hudEl.classList.toggle('is-invalid', Boolean(msg));
  }
  if (inputEl) {
    inputEl.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  if (errEl) {
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }
}

function openWallHud(config = {}) {
  const hudEl = $('#wall-length-hud');
  const inputEl = $('#wall-length-hud-input');
  const hintEl = $('#wall-length-hud-hint');

  Object.assign(wallHudState, {
    open: true,
    focused: Boolean(config.focused),
    mode: config.mode || 'edit-wall',
    worldPos: config.worldPos || { x: 0, y: 0 },
    nodeId: config.nodeId || null,
    roomId: config.roomId || null,
    wallKey: config.wallKey ?? null,
    wallIndex: config.wallIndex ?? 0,
    cornerIndex: config.cornerIndex ?? null,
    anchor: config.anchor || null,
    pointerPoint: config.pointerPoint || null,
    snappedPoint: config.snappedPoint || null,
    snappedLength: config.snappedLength ?? null,
    rectStart: config.rectStart || null,
    previewPoint: config.previewPoint || null,
    error: '',
  });

  if (hudEl) {
    hudEl.hidden = false;
    hudEl.classList.toggle('is-passive', !wallHudState.focused);
    hudEl.classList.remove('is-invalid');
  }
  setWallHudError('');

  if (hintEl) {
    hintEl.textContent = wallHudState.focused ? 'Enter' : 'Tab';
  }

  if (inputEl) {
    if (config.value !== undefined) {
      inputEl.value = String(config.value);
    }
    if (config.ariaLabel) {
      inputEl.setAttribute('aria-label', config.ariaLabel);
    }
    if (wallHudState.focused) {
      inputEl.focus();
      if (typeof inputEl.select === 'function') {
        inputEl.select();
      }
    }
  }

  updateWallHudPosition();
  return wallHudState;
}

function closeWallHud(opts = {}) {
  const wasOpen = wallHudState.open;
  wallHudState.open = false;
  wallHudState.focused = false;
  wallHudState.mode = null;
  wallHudState.worldPos = null;
  wallHudState.nodeId = null;
  wallHudState.roomId = null;
  wallHudState.wallKey = null;
  wallHudState.cornerIndex = null;
  wallHudState.anchor = null;
  wallHudState.pointerPoint = null;
  wallHudState.snappedPoint = null;
  wallHudState.snappedLength = null;
  wallHudState.rectStart = null;
  wallHudState.previewPoint = null;
  setWallHudError('');

  const hudEl = $('#wall-length-hud');
  if (hudEl) {
    hudEl.hidden = true;
    hudEl.classList.remove('is-passive', 'is-invalid');
  }
  if (opts.restoreFocus && canvas && typeof canvas.focus === 'function') {
    canvas.focus();
  }
  if (wasOpen && opts.redraw !== false) {
    preview = null;
    redraw();
  }
}

function syncPassiveWallHud() {
  if (wallHudState.focused) return;

  // 1. Sequential room corner drawing
  const seqPts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
  if (tool.kind === 'room' && seqPts.length > 0 && hover) {
    const anchor = seqPts[seqPts.length - 1];
    const pv = interaction.previewRoom(hover, {
      edges: extractRoomEdges(levelRooms()),
      existingRooms: levelRooms(),
      scale: view.scale,
      explicitAngleDegrees: snappingBridge.getExplicitAngleDegrees(),
      tolerance: EPS,
    });
    const targetPt = pv?.targetPoint || hover;
    const len = pv?.lengthInches ?? Math.hypot(targetPt.x - anchor.x, targetPt.y - anchor.y);
    openWallHud({
      focused: false,
      mode: 'draw-corner',
      worldPos: {
        x: (anchor.x + targetPt.x) / 2,
        y: (anchor.y + targetPt.y) / 2 - 14 / Math.max(0.4, view.scale),
      },
      anchor,
      pointerPoint: { ...hover },
      snappedPoint: { ...targetPt },
      snappedLength: len,
      value: fmtLen(len),
      ariaLabel: 'Active wall segment length',
    });
    return;
  }

  // 2. Active corner resize drag
  if (drag && drag.kind === 'resize' && drag.target?.points) {
    const r = roomOf(doc, drag.id);
    if (r) {
      const pts = drag.target.points;
      const cornerIdx = drag.corner % pts.length;
      const prevIdx = (cornerIdx - 1 + pts.length) % pts.length;
      const anchor = pts[prevIdx];
      const movedPt = pts[cornerIdx];
      const len = Math.hypot(movedPt.x - anchor.x, movedPt.y - anchor.y);
      openWallHud({
        focused: false,
        mode: 'resize-corner',
        roomId: r.id,
        cornerIndex: cornerIdx,
        anchor: { ...anchor },
        pointerPoint: hover ? { ...hover } : { ...movedPt },
        snappedPoint: { ...movedPt },
        snappedLength: len,
        worldPos: {
          x: (anchor.x + movedPt.x) / 2,
          y: (anchor.y + movedPt.y) / 2 - 14 / Math.max(0.4, view.scale),
        },
        value: fmtLen(len),
        ariaLabel: 'Resized wall segment length',
      });
      return;
    }
  }

  // 3. Active rectangular room-new drag
  if (drag && drag.kind === 'room-new' && drag.rect && (drag.rect.w > 0 || drag.rect.h > 0)) {
    openWallHud({
      focused: false,
      mode: 'room-new',
      rectStart: {
        x0: drag.x0,
        y0: drag.y0,
        pointer: hover
          ? { ...hover }
          : { x: drag.rect.x + drag.rect.w, y: drag.rect.y + drag.rect.h },
        snappedRect: { ...drag.rect },
      },
      worldPos: {
        x: drag.rect.x + drag.rect.w / 2,
        y: drag.rect.y - 14 / Math.max(0.4, view.scale),
      },
      value: `${fmtLen(drag.rect.w)} × ${fmtLen(drag.rect.h)}`,
      ariaLabel: 'New room width by depth',
    });
    return;
  }

  if (wallHudState.open && !wallHudState.focused) {
    wallHudState.open = false;
    wallHudState.worldPos = null;
    const hudEl = $('#wall-length-hud');
    if (hudEl) hudEl.hidden = true;
  }
}

function openRoomWallHud(room, wallIndex = 0) {
  if (!room) return null;
  const pts = getRoomPoints(room);
  const wIdx = ((wallIndex % pts.length) + pts.length) % pts.length;
  const wKey = pts.length === 4 ? WALLS[wIdx] : String(wIdx);
  const seg = wallSeg(room, wIdx);
  const midX = seg.ax + (seg.dx * seg.len) / 2 - seg.nx * 10;
  const midY = seg.ay + (seg.dy * seg.len) / 2 - seg.ny * 10;
  openWallHud({
    focused: true,
    mode: 'edit-wall',
    roomId: room.id,
    wallKey: wKey,
    wallIndex: wIdx,
    snappedLength: seg.len,
    nodeId: `node:wall-dim:${room.id}:${wKey}`,
    worldPos: { x: midX, y: midY },
    value: fmtLen(seg.len),
    ariaLabel: `${room.name} wall ${wKey} length`,
  });
  redraw();
  return wallHudState;
}

function nearestWallAny(p, maxDist = 16) {
  let best = null;
  for (const room of levelRooms()) {
    const pts = getRoomPoints(room);
    for (let i = 0; i < pts.length; i++) {
      const s = wallSeg(room, i);
      if (s.len <= 0) continue;
      const t = Math.max(0, Math.min(s.len, (p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy));
      const cx = s.ax + s.dx * t;
      const cy = s.ay + s.dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d <= maxDist && (!best || d < best.d)) {
        const wKey = pts.length === 4 ? WALLS[i] : String(i);
        best = { room, wallIndex: i, wallKey: wKey, d };
      }
    }
  }
  return best;
}

function canActivateWallHudOnTab() {
  if (tool.kind === 'room' && interaction.getCornerCount() > 0) return true;
  if (drag && (drag.kind === 'resize' || drag.kind === 'room-new')) return true;
  const selList = getSelectionList();
  if (selList.length === 1) {
    const hit = M.findOwner(doc, selList[0]);
    if (hit && hit.kind === 'room') return true;
  }
  return false;
}

function activateWallHudByTab(reverse = false) {
  // 1. Sequential room drawing active segment
  const seqPts = interaction.getRoomPoints ? interaction.getRoomPoints() : [];
  if (tool.kind === 'room' && seqPts.length > 0) {
    const anchor = seqPts[seqPts.length - 1];
    const ptr = hover || { x: anchor.x + 144, y: anchor.y };
    const pv = interaction.previewRoom(ptr, {
      edges: extractRoomEdges(levelRooms()),
      existingRooms: levelRooms(),
      scale: view.scale,
      explicitAngleDegrees: snappingBridge.getExplicitAngleDegrees(),
      tolerance: EPS,
    });
    const targetPt = pv?.targetPoint || ptr;
    const len = pv?.lengthInches ?? Math.hypot(targetPt.x - anchor.x, targetPt.y - anchor.y);
    openWallHud({
      focused: true,
      mode: 'draw-corner',
      anchor: { ...anchor },
      pointerPoint: { ...ptr },
      snappedPoint: { ...targetPt },
      snappedLength: len,
      previewPoint: { ...targetPt },
      worldPos: {
        x: (anchor.x + targetPt.x) / 2,
        y: (anchor.y + targetPt.y) / 2 - 14 / Math.max(0.4, view.scale),
      },
      value: fmtLen(len),
      ariaLabel: 'Active wall segment length',
    });
    redraw();
    return true;
  }

  // 2. Active corner resize drag -> freeze drag into interactive HUD
  if (drag && drag.kind === 'resize') {
    const r = roomOf(doc, drag.id);
    if (r) {
      const pts = drag.target?.points || getRoomPoints(r);
      const cornerIdx = drag.corner % pts.length;
      const prevIdx = (cornerIdx - 1 + pts.length) % pts.length;
      const anchor = pts[prevIdx];
      const movedPt = pts[cornerIdx];
      const len = Math.hypot(movedPt.x - anchor.x, movedPt.y - anchor.y);
      drag = null;
      preview = null;
      openWallHud({
        focused: true,
        mode: 'resize-corner',
        roomId: r.id,
        cornerIndex: cornerIdx,
        anchor: { ...anchor },
        pointerPoint: hover ? { ...hover } : { ...movedPt },
        snappedPoint: { ...movedPt },
        snappedLength: len,
        worldPos: {
          x: (anchor.x + movedPt.x) / 2,
          y: (anchor.y + movedPt.y) / 2 - 14 / Math.max(0.4, view.scale),
        },
        value: fmtLen(len),
        ariaLabel: 'Resized wall segment length',
      });
      redraw();
      return true;
    }
  }

  // 3. Active rectangular room-new drag -> freeze into interactive HUD
  if (drag && drag.kind === 'room-new' && drag.rect) {
    const captured = {
      x0: drag.x0,
      y0: drag.y0,
      pointer: hover
        ? { ...hover }
        : { x: drag.rect.x + drag.rect.w, y: drag.rect.y + drag.rect.h },
      snappedRect: { ...drag.rect },
    };
    const wVal = Math.max(36, drag.rect.w || 144);
    const hVal = Math.max(36, drag.rect.h || 120);
    drag = null;
    preview = null;
    openWallHud({
      focused: true,
      mode: 'room-new',
      rectStart: captured,
      worldPos: {
        x: captured.snappedRect.x + wVal / 2,
        y: captured.snappedRect.y - 14 / Math.max(0.4, view.scale),
      },
      value: `${fmtLen(wVal)} × ${fmtLen(hVal)}`,
      ariaLabel: 'New room width by depth',
    });
    redraw();
    return true;
  }

  // 4. Single selected room -> open or cycle wall segments
  const selList = getSelectionList();
  if (selList.length === 1) {
    const hit = M.findOwner(doc, selList[0]);
    if (hit && hit.kind === 'room') {
      const pts = getRoomPoints(hit.room);
      let nextIdx = 0;
      if (
        wallHudState.open &&
        wallHudState.mode === 'edit-wall' &&
        wallHudState.roomId === hit.room.id
      ) {
        nextIdx = (wallHudState.wallIndex + (reverse ? -1 : 1) + pts.length) % pts.length;
      } else if (reverse) {
        nextIdx = pts.length - 1;
      }
      openRoomWallHud(hit.room, nextIdx);
      return true;
    }
  }

  return false;
}

function parseDimensionPairInches(rawText, fallbackW, fallbackH) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { w: fallbackW, h: fallbackH, usedFallback: true };
  }
  const parts = rawText.split(/[×x,]/i).map((s) => s.trim());
  if (parts.length >= 2) {
    const wIn = parseExplicitLengthInches(parts[0]);
    const hIn = parseExplicitLengthInches(parts[1]);
    if (wIn !== null && hIn !== null) {
      return { w: wIn, h: hIn, usedFallback: false };
    }
    return { w: fallbackW, h: fallbackH, usedFallback: true };
  }
  const single = parseExplicitLengthInches(parts[0]);
  if (single !== null) {
    return { w: single, h: fallbackH, usedFallback: false };
  }
  return { w: fallbackW, h: fallbackH, usedFallback: true };
}

function previewWallHudInput(rawVal) {
  if (!wallHudState.open || !wallHudState.focused) return;
  const text = rawVal !== undefined ? rawVal : $('#wall-length-hud-input')?.value || '';

  if (wallHudState.mode === 'draw-corner') {
    const ptr = wallHudState.pointerPoint || hover || wallHudState.anchor;
    if (!ptr) return;
    const pv = interaction.previewRoom(ptr, text, {
      edges: extractRoomEdges(levelRooms()),
      existingRooms: levelRooms(),
      scale: view.scale,
      explicitAngleDegrees: snappingBridge.getExplicitAngleDegrees(),
      tolerance: EPS,
    });
    if (pv) {
      wallHudState.previewPoint = pv.targetPoint;
      setWallHudError(pv.valid === false && pv.violations?.length ? pv.violations[0] : '');
      redraw();
    }
  } else {
    setWallHudError('');
  }
}

function commitWallHudInput(rawValueOverride) {
  if (!wallHudState.open) return { ok: false };
  const inputEl = $('#wall-length-hud-input');
  const rawText =
    rawValueOverride !== undefined ? String(rawValueOverride) : (inputEl?.value ?? '');

  if (wallHudState.mode === 'draw-corner') {
    const ptr = wallHudState.pointerPoint ||
      hover ||
      wallHudState.snappedPoint || { x: (wallHudState.anchor?.x || 0) + 144, y: 0 };
    const res = interaction.addRoomCornerWithLength(ptr, rawText, {
      edges: extractRoomEdges(levelRooms()),
      existingRooms: levelRooms(),
      scale: view.scale,
      explicitAngleDegrees: snappingBridge.getExplicitAngleDegrees(),
      tolerance: EPS,
    });
    if (!res.ok) {
      setWallHudError(res.violations?.[0] || 'Invalid wall segment placement.');
      redraw();
      return res;
    }

    const count = interaction.getCornerCount();
    hover = { ...res.corner };
    const hint = $('#tool-hint');
    if (hint) hint.textContent = `Corner ${count} placed. Tap next corner or click Close Room.`;
    const btnClose = $('#btn-close-room');
    if (btnClose) btnClose.hidden = !interaction.canCloseRoom();
    announceToLiveRegion(
      `Placed corner ${count} at (${Math.round(res.corner.x)}", ${Math.round(res.corner.y)}").`
    );
    closeWallHud({ restoreFocus: true, redraw: false });
    refresh();
    return res;
  }

  if (wallHudState.mode === 'resize-corner') {
    const r = roomOf(doc, wallHudState.roomId);
    if (!r) {
      closeWallHud({ restoreFocus: true });
      return { ok: false };
    }
    const pts = getRoomPoints(r);
    const cornerIdx = (wallHudState.cornerIndex ?? 0) % pts.length;
    const anchor = wallHudState.anchor || pts[(cornerIdx - 1 + pts.length) % pts.length];
    const fallbackPt = wallHudState.snappedPoint || pts[cornerIdx];
    const parsedLen = parseExplicitLengthInches(rawText);

    let targetPt;
    let usedFallback = false;
    if (parsedLen === null) {
      targetPt = { ...fallbackPt };
      usedFallback = true;
    } else {
      if (parsedLen < 36) {
        const msg = 'Wall length must be at least 36 in (3 ft) clear span.';
        setWallHudError(msg);
        return { ok: false, error: msg };
      }
      const dirPt =
        Math.hypot(fallbackPt.x - anchor.x, fallbackPt.y - anchor.y) > 1e-6
          ? fallbackPt
          : wallHudState.pointerPoint || { x: anchor.x + 1, y: anchor.y };
      const angle = computeVectorAngle(anchor, dirPt);
      targetPt = computeVertexFromAngle(anchor, angle, parsedLen);
    }

    const nextPts = pts.map((pt, idx) => (idx === cornerIdx ? targetPt : { ...pt }));
    const bbox = getRoomBoundingBox(nextPts);
    if (bbox.w < 36 || bbox.h < 36 || polygonArea(nextPts) < 36 * 9) {
      const msg = 'Room clear span must be at least 36 in (3 ft).';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    const siblingPolys = levelRooms()
      .filter((rm) => rm.id !== r.id)
      .map(toRoomCollisionShape);
    const candidateShape = r.bulges ? { points: nextPts, bulges: r.bulges } : nextPts;
    const colCheck = validatePlacement(candidateShape, siblingPolys, { tolerance: EPS });
    if (!colCheck.valid) {
      const msg = colCheck.reasons.selfIntersecting
        ? 'Wall length causes polygon self-intersection.'
        : 'Resized room overlaps an adjacent room.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }

    const commitRes = apply(
      (n) => M.updateRoomPoints(roomOf(n, r.id), nextPts, n),
      'Resize Room Corner'
    );
    if (!commitRes.ok) {
      const msg = commitRes.reasons?.[0]?.msg || 'Resize violates building code.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    closeWallHud({ restoreFocus: true });
    return { ok: true, corner: targetPt, usedFallback };
  }

  if (wallHudState.mode === 'room-new') {
    const start = wallHudState.rectStart || {
      x0: 0,
      y0: 0,
      pointer: { x: 144, y: 120 },
      snappedRect: { x: 0, y: 0, w: 144, h: 120 },
    };
    const fbW = start.snappedRect?.w > 0 ? start.snappedRect.w : 144;
    const fbH = start.snappedRect?.h > 0 ? start.snappedRect.h : 120;
    const { w, h, usedFallback } = parseDimensionPairInches(rawText, fbW, fbH);
    if (w < 36 || h < 36) {
      const msg = 'Room dimensions must be at least 36 in (3 ft) clear span.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    const dirX = (start.pointer?.x ?? start.x0 + w) >= start.x0 ? 1 : -1;
    const dirY = (start.pointer?.y ?? start.y0 + h) >= start.y0 ? 1 : -1;
    const x = dirX >= 0 ? start.x0 : start.x0 - w;
    const y = dirY >= 0 ? start.y0 : start.y0 - h;
    const candPoly = roomToPolygon({ x, y, w, h });
    const siblingPolys = levelRooms().map(toRoomCollisionShape);
    const colCheck = validatePlacement(candPoly, siblingPolys, { tolerance: EPS });
    if (!colCheck.valid) {
      const msg = 'Room placement overlaps an existing room.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    let createdId = null;
    const commitRes = apply((n) => {
      const created = M.createRoom(n, tool.type || 'living', x, y, w, h, { level: curLevel });
      createdId = created.id;
    }, 'Add Room');
    if (!commitRes.ok) {
      const msg = commitRes.reasons?.[0]?.msg || 'Room violates building code.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    if (createdId) select(createdId);
    closeWallHud({ restoreFocus: true });
    return { ok: true, usedFallback };
  }

  if (wallHudState.mode === 'edit-wall') {
    const r = roomOf(doc, wallHudState.roomId);
    if (!r) {
      closeWallHud({ restoreFocus: true });
      return { ok: false };
    }
    const curLen = wallHudState.snappedLength ?? wallLength(r, wallHudState.wallIndex);
    const parsedLen = parseExplicitLengthInches(rawText);
    const targetLen = parsedLen === null ? curLen : parsedLen;
    const usedFallback = parsedLen === null;

    const adjusted = M.computeAdjustedWallPoints(r, wallHudState.wallIndex, targetLen);
    if (!adjusted.ok) {
      setWallHudError(adjusted.error);
      return { ok: false, error: adjusted.error };
    }

    const siblingPolys = levelRooms()
      .filter((rm) => rm.id !== r.id)
      .map(toRoomCollisionShape);
    const candidateShape = r.bulges
      ? { points: adjusted.points, bulges: r.bulges }
      : adjusted.points;
    const colCheck = validatePlacement(candidateShape, siblingPolys, { tolerance: EPS });
    if (!colCheck.valid) {
      const msg = colCheck.reasons.selfIntersecting
        ? 'Wall length causes polygon self-intersection.'
        : 'Wall length overlaps an adjacent room.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }

    if (Math.abs(targetLen - wallLength(r, wallHudState.wallIndex)) < 1e-4) {
      closeWallHud({ restoreFocus: true });
      return { ok: true, usedFallback, unchanged: true };
    }

    const commitRes = apply(
      (n) => M.updateRoomPoints(roomOf(n, r.id), adjusted.points, n),
      'Edit Wall Length'
    );
    if (!commitRes.ok) {
      const msg = commitRes.reasons?.[0]?.msg || 'Wall length violates building code.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }

    announceToLiveRegion(
      `${r.name} wall ${wallHudState.wallKey ?? wallHudState.wallIndex} set to ${fmtLen(targetLen)}.`
    );
    closeWallHud({ restoreFocus: true });
    return { ok: true, lengthInches: targetLen, usedFallback };
  }

  if (wallHudState.mode === 'edit-room-dims') {
    const r = roomOf(doc, wallHudState.roomId);
    if (!r) {
      closeWallHud({ restoreFocus: true });
      return { ok: false };
    }
    const { w, h, usedFallback } = parseDimensionPairInches(rawText, r.w, r.h);
    if (w < 36 || h < 36) {
      const msg = 'Room dimensions must be at least 36 in (3 ft) clear span.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    const candPoly = roomToPolygon({ x: r.x, y: r.y, w, h });
    const siblingPolys = levelRooms()
      .filter((rm) => rm.id !== r.id)
      .map(toRoomCollisionShape);
    const colCheck = validatePlacement(candPoly, siblingPolys, { tolerance: EPS });
    if (!colCheck.valid) {
      const msg = 'Resized room overlaps an adjacent room.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    const commitRes = apply((n) => M.resizeRoom(roomOf(n, r.id), r.x, r.y, w, h), 'Resize Room');
    if (!commitRes.ok) {
      const msg = commitRes.reasons?.[0]?.msg || 'Room dimensions violate building code.';
      setWallHudError(msg);
      return { ok: false, error: msg };
    }
    closeWallHud({ restoreFocus: true });
    return { ok: true, w, h, usedFallback };
  }

  return { ok: false };
}

function initWallHudUI() {
  const hudEl = $('#wall-length-hud');
  const inputEl = $('#wall-length-hud-input');
  if (!hudEl || !inputEl) return;

  hudEl.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
  });

  inputEl.addEventListener('focus', () => {
    if (wallHudState.open && !wallHudState.focused) {
      wallHudState.focused = true;
      hudEl.classList.remove('is-passive');
      const hintEl = $('#wall-length-hud-hint');
      if (hintEl) hintEl.textContent = 'Enter';
    }
  });

  inputEl.addEventListener('input', () => {
    previewWallHudInput(inputEl.value);
  });

  inputEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      commitWallHudInput();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeWallHud({ restoreFocus: true });
    } else if (ev.key === 'Tab' && wallHudState.mode === 'edit-wall') {
      ev.preventDefault();
      ev.stopPropagation();
      activateWallHudByTab(ev.shiftKey);
    }
  });
}

canvas?.addEventListener('pointerleave', () => {
  hover = null;
  preview = null;
  hoveredOpeningHudSide = null;
  redraw();
});
export function parseRoomDimensionsInput(input) {
  if (!input) return [];
  return String(input)
    .split(/[×x,]/i)
    .map((segment) => M.parseDistanceInInches(segment, { defaultUnit: 'ft' }))
    .filter((n) => n !== null && !isNaN(n) && n > 0);
}

canvas?.addEventListener('dblclick', (e) => {
  if (tool.kind === 'room' && interaction.canCloseRoom && interaction.canCloseRoom()) {
    handleCloseRoom();
    return;
  }
  const p = toWorld(e);
  const hitNode = complianceScene.hitTest(p, view);
  if (hitNode && hitNode.type === 'wallDimensionLabel') {
    const r = roomOf(doc, hitNode.data.roomId);
    if (r) {
      if (!isSelected(r.id)) select(r.id);
      openRoomWallHud(r, hitNode.data.wallIndex);
      return;
    }
  }
  if (hitNode && hitNode.type === 'constraintHandle') {
    const r = roomOf(doc, hitNode.data.roomId);
    if (r) {
      if (!isSelected(r.id)) select(r.id);
      const pts = getRoomPoints(r);
      const hIdx = hitNode.data.handleIndex ?? 0;
      const wIdx =
        pts.length === 4
          ? hIdx === 0 || hIdx === 1
            ? 0
            : hIdx === 2
              ? 1
              : 3
          : (hIdx - 1 + pts.length) % pts.length;
      openRoomWallHud(r, wIdx);
      return;
    }
  }
  if (hitNode && hitNode.type === 'dimensionLabel') {
    const r = roomOf(doc, hitNode.data.roomId);
    if (r) {
      if (!isSelected(r.id)) select(r.id);
      openWallHud({
        focused: true,
        mode: 'edit-room-dims',
        roomId: r.id,
        nodeId: hitNode.id,
        worldPos: { x: hitNode.bounds.x, y: hitNode.bounds.y },
        value: `${fmtLen(r.w)} × ${fmtLen(r.h)}`,
        ariaLabel: `${r.name} dimensions (width × depth)`,
      });
      redraw();
      return;
    }
  }
  const wallHit = nearestWallAny(p, 16 / Math.max(0.4, view.scale));
  if (wallHit) {
    if (!isSelected(wallHit.room.id)) select(wallHit.room.id);
    openRoomWallHud(wallHit.room, wallHit.wallIndex);
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

function isFileDragEvent(e) {
  const dt = e?.dataTransfer;
  if (!dt) return true;
  if (dt.files && dt.files.length > 0) return true;
  if (dt.types && typeof dt.types.length === 'number' && dt.types.length > 0) {
    return Array.from(dt.types).includes('Files');
  }
  return true;
}

function handleCanvasDragEnter(e) {
  if (!isFileDragEvent(e)) return;
  e.preventDefault();
  canvasDragDepth++;
  if (!isCanvasDragOver) {
    isCanvasDragOver = true;
    renderBlueprintDropzone();
    redraw();
  }
}

function handleCanvasDragOver(e) {
  if (!isFileDragEvent(e)) return;
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
  if (!isCanvasDragOver) {
    isCanvasDragOver = true;
    renderBlueprintDropzone();
    redraw();
  }
}

function handleCanvasDragLeave(e) {
  e.preventDefault();
  canvasDragDepth = Math.max(0, canvasDragDepth - 1);
  if (canvasDragDepth === 0 && isCanvasDragOver) {
    isCanvasDragOver = false;
    renderBlueprintDropzone();
    redraw();
  }
}

function handleCanvasDrop(e) {
  e.preventDefault();
  canvasDragDepth = 0;
  isCanvasDragOver = false;
  drag = null;
  preview = null;
  renderBlueprintDropzone();

  const files = e?.dataTransfer?.files;
  if (!files || files.length === 0) {
    redraw();
    return;
  }

  const file = files[0];
  if (!isValidBlueprintImageFile(file)) {
    const msg = 'Unsupported file type. Please drop a PNG, JPG, or WebP blueprint image.';
    toast(msg, true);
    announceToLiveRegion(msg);
    redraw();
    return;
  }

  const importer =
    typeof window !== 'undefined' && typeof window.__homegen?.handleBlueprintImport === 'function'
      ? window.__homegen.handleBlueprintImport
      : handleBlueprintImport;
  importer(file);
}

for (const dropTarget of [canvas, $('#blueprint-dropzone')]) {
  dropTarget?.addEventListener('dragenter', handleCanvasDragEnter);
  dropTarget?.addEventListener('dragover', handleCanvasDragOver);
  dropTarget?.addEventListener('dragleave', handleCanvasDragLeave);
  dropTarget?.addEventListener('drop', handleCanvasDrop);
}

export function zoomAt(mx, my, f) {
  const ns = Math.max(0.4, Math.min(8, view.scale * f));
  view.ox = mx - ((mx - view.ox) / view.scale) * ns;
  view.oy = my - ((my - view.oy) / view.scale) * ns;
  view.scale = ns;
  const zoomLabel = $('#zoom-label');
  if (zoomLabel) zoomLabel.textContent = `${Math.round((view.scale / 1.6) * 100)}%`;
  redraw();
  announceZoom(view.scale);
}

export function fit() {
  const r = canvas ? canvas.getBoundingClientRect() : { width: 800, height: 600, left: 0, top: 0 };
  if (!doc.rooms.length) {
    view = { scale: 1.6, ox: 40, oy: 40 };
    refresh();
    announceZoom(view.scale);
    return;
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
  announceZoom(view.scale);
}

// ------------------------------------------------------------- toolbar / keyboard / file
export function setDoc(next, label) {
  closeOpeningHudEditor();
  doc = next;
  openingUnitMode = M.normalizeOpeningUnit(doc?.settings?.openingUnits || openingUnitMode);
  hist.push(doc, label);
  persist();
  curLevel = 0;
  selectionSet.clear();
  selection = null;
  autoFixDiffs = [];
  hoveredDiffIndex = null;
  if (doc.elevationGrid) {
    computeContoursAsync(doc.elevationGrid).then((contours) => {
      doc._cachedContours = contours;
      redraw();
    });
  }
  refresh();
}

let activeDiffDrawerCleanup = null;
let activeHistoryPopoverCleanup = null;

export function trapFocus(containerEl, returnFocusEl) {
  if (!containerEl) return () => {};
  const focusableSelector =
    'button, [href], input, select, textarea, k-button, k-input, k-select, k-tab, [tabindex]:not([tabindex="-1"])';
  const getVisibleFocusables = () =>
    Array.from(containerEl.querySelectorAll(focusableSelector)).filter((el) => {
      if (
        el.disabled ||
        el.hidden ||
        el.hasAttribute?.('disabled') ||
        el.hasAttribute?.('hidden')
      ) {
        return false;
      }
      if (typeof el.closest === 'function') {
        const hiddenAncestor = el.closest('[hidden]');
        if (hiddenAncestor && hiddenAncestor !== containerEl) return false;
      }
      let cur = el.parentElement;
      while (cur && cur !== containerEl) {
        if (cur.hidden || cur.hasAttribute?.('hidden')) return false;
        cur = cur.parentElement;
      }
      return true;
    });

  const initialFocusables = getVisibleFocusables();
  if (initialFocusables.length) {
    initialFocusables[0].focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      containerEl.removeEventListener('keydown', handleKeyDown);
      if (typeof containerEl.close === 'function') {
        containerEl.close();
      } else {
        containerEl.hidden = true;
        if (containerEl.id === 'diff-drawer') {
          activeDiffDrawerCleanup = null;
          autoFixDiffs = [];
          hoveredDiffIndex = null;
          redraw();
        } else if (containerEl.id === 'history-popover') {
          activeHistoryPopoverCleanup = null;
          $('#history-btn')?.setAttribute('aria-expanded', 'false');
        }
      }
      if (returnFocusEl && typeof returnFocusEl.focus === 'function') returnFocusEl.focus();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusableElements = getVisibleFocusables();
    if (!focusableElements.length) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }

    const firstEl = focusableElements[0];
    const lastEl = focusableElements[focusableElements.length - 1];
    const activeEl =
      (containerEl.ownerDocument && containerEl.ownerDocument.activeElement) ||
      (typeof document !== 'undefined' ? document.activeElement : null);
    const activeOutside =
      typeof containerEl.contains === 'function' && !containerEl.contains(activeEl);

    if (e.shiftKey) {
      if (activeEl === firstEl || activeOutside) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (activeEl === lastEl || activeOutside) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }

  containerEl.addEventListener('keydown', handleKeyDown);
  return () => {
    containerEl.removeEventListener('keydown', handleKeyDown);
    if (returnFocusEl && typeof returnFocusEl.focus === 'function') returnFocusEl.focus();
  };
}

let activeConfirmSession = null;

export function confirmDialog(options = {}) {
  const opts = typeof options === 'string' ? { message: options } : options || {};
  const title = opts.title || 'Confirm Action';
  const message = opts.message || '';
  const confirmLabel = opts.confirmText || opts.confirmLabel || 'Confirm';
  const cancelLabel = opts.cancelText || opts.cancelLabel || 'Cancel';
  const danger = Boolean(opts.danger);

  const dlg = $('#dlg-confirm');
  const titleEl = $('#dlg-confirm-title');
  const msgEl = $('#dlg-confirm-msg');
  const okBtn = $('#dlg-confirm-ok');
  const cancelBtn = $('#dlg-confirm-cancel');
  const closeBtn = $('#dlg-confirm-close');

  if (!dlg || typeof dlg.showModal !== 'function' || !okBtn || !cancelBtn) {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return Promise.resolve(Boolean(window.confirm(message)));
    }
    return Promise.resolve(false);
  }

  let preservedReturnFocusEl = null;
  const wasSessionActive = Boolean(activeConfirmSession);
  if (activeConfirmSession) {
    preservedReturnFocusEl = activeConfirmSession.returnFocusEl;
    activeConfirmSession.supersede();
  }

  const candidateReturnFocus =
    opts.returnFocusEl !== undefined
      ? opts.returnFocusEl
      : preservedReturnFocusEl || (typeof document !== 'undefined' ? document.activeElement : null);
  const returnFocusEl =
    candidateReturnFocus && typeof candidateReturnFocus.focus === 'function'
      ? candidateReturnFocus
      : null;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  okBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;
  if (okBtn.classList) {
    okBtn.classList.toggle('danger', danger);
    okBtn.classList.toggle('primary', !danger);
  }

  const isDialogOpen =
    wasSessionActive ||
    Boolean(dlg.open || (typeof dlg.hasAttribute === 'function' && dlg.hasAttribute('open')));
  if (!isDialogOpen) {
    dlg.showModal();
  }

  const cleanupFocus = trapFocus(dlg, returnFocusEl);
  const initialTarget = opts.initialFocus === 'confirm' ? okBtn : cancelBtn;
  if (initialTarget && typeof initialTarget.focus === 'function') {
    initialTarget.focus();
  }

  return new Promise((resolve) => {
    let settled = false;

    function detachListeners() {
      okBtn.removeEventListener?.('click', onConfirm);
      cancelBtn.removeEventListener?.('click', onCancel);
      closeBtn?.removeEventListener?.('click', onCloseClick);
      dlg.removeEventListener?.('cancel', onDialogCancel);
      dlg.removeEventListener?.('close', onDialogClose);
      dlg.removeEventListener?.('keydown', onDialogKeyDown);
    }

    function settle(result, alreadyClosed = false) {
      if (settled) return;
      settled = true;
      if (activeConfirmSession === session) {
        activeConfirmSession = null;
      }
      detachListeners();
      if (!alreadyClosed && typeof dlg.close === 'function') {
        dlg.close();
      }
      cleanupFocus();
      resolve(result);
    }

    function supersede() {
      if (settled) return;
      settled = true;
      if (activeConfirmSession === session) {
        activeConfirmSession = null;
      }
      detachListeners();
      cleanupFocus();
      resolve(false);
    }

    function onConfirm(e) {
      e?.preventDefault?.();
      settle(true);
    }

    function onCancel(e) {
      e?.preventDefault?.();
      settle(false);
    }

    function onCloseClick(e) {
      e?.preventDefault?.();
      settle(false);
    }

    function onDialogCancel(e) {
      e?.preventDefault?.();
      settle(false);
    }

    function onDialogClose() {
      settle(false, true);
    }

    function onDialogKeyDown(e) {
      if (e?.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        settle(false);
      }
    }

    const session = { settle, supersede, returnFocusEl };
    activeConfirmSession = session;

    okBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    if (closeBtn) closeBtn.addEventListener('click', onCloseClick);
    dlg.addEventListener('cancel', onDialogCancel);
    dlg.addEventListener('close', onDialogClose);
    dlg.addEventListener('keydown', onDialogKeyDown);
  });
}

function renderDiffDrawer() {
  const drawer = $('#diff-drawer');
  const countEl = $('#diff-count');
  const listEl = $('#diff-list');
  const closeBtn = $('#diff-close');

  if (!drawer || !countEl || !listEl) return;

  if (!autoFixDiffs || !autoFixDiffs.length) {
    if (activeDiffDrawerCleanup) {
      activeDiffDrawerCleanup();
      activeDiffDrawerCleanup = null;
    }
    drawer.hidden = true;
    return;
  }

  const wasHidden = drawer.hidden;
  drawer.hidden = false;
  countEl.textContent = String(autoFixDiffs.length);

  listEl.innerHTML = autoFixDiffs
    .map(
      (d, i) =>
        `<li data-idx="${i}">
           <button type="button" class="diff-item-btn ${hoveredDiffIndex === i ? 'hovered' : ''}" data-idx="${i}" aria-label="Fix ${i + 1}: ${esc(d.msg || d)}">
             <span class="diff-num">${i + 1}</span>
             <span class="diff-msg">${esc(d.msg || d)}</span>
           </button>
         </li>`
    )
    .join('');

  listEl.querySelectorAll('.diff-item-btn').forEach((btn) => {
    const idx = Number(btn.dataset.idx);
    const handleActivate = () => {
      const d = autoFixDiffs[idx];
      if (d && d.id) {
        select(d.id);
        focus(d.id);
      }
    };
    const handleHighlight = () => {
      hoveredDiffIndex = idx;
      btn.classList.add('hovered');
      redraw();
    };
    const handleClearHighlight = () => {
      hoveredDiffIndex = null;
      btn.classList.remove('hovered');
      redraw();
    };

    btn.addEventListener('mouseenter', handleHighlight);
    btn.addEventListener('mouseleave', handleClearHighlight);
    btn.addEventListener('focus', handleHighlight);
    btn.addEventListener('blur', handleClearHighlight);
    btn.addEventListener('click', handleActivate);
  });

  if (closeBtn) {
    closeBtn.onclick = () => {
      autoFixDiffs = [];
      hoveredDiffIndex = null;
      if (activeDiffDrawerCleanup) {
        activeDiffDrawerCleanup();
        activeDiffDrawerCleanup = null;
      }
      renderDiffDrawer();
      redraw();
    };
  }

  if (wasHidden) {
    const returnFocusEl = document.activeElement;
    if (activeDiffDrawerCleanup) activeDiffDrawerCleanup();
    activeDiffDrawerCleanup = trapFocus(drawer, returnFocusEl);
  }
}

function sampleHome() {
  const s = buildMultiLevel();
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

async function selectTemplate(templateId) {
  const template = TEMPLATE_BY_ID(templateId);
  if (!template) return false;

  if (doc.rooms.length > 0) {
    const confirmed = await confirmDialog({
      title: 'Replace Active Plan?',
      message: 'Start a new project? Unsaved changes in your active plan will be replaced.',
      confirmLabel: 'Replace Plan',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) {
      return false;
    }
  }

  const nextState = template.createState();
  setDoc(nextState);
  fit();
  $('#dlg-templates')?.close();
  toast(`Loaded ${template.title} starter template.`);
  return true;
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
    closeOpeningHudEditor();
    doc = s;
    openingUnitMode = M.normalizeOpeningUnit(doc?.settings?.openingUnits || openingUnitMode);
    persist();
    selectionSet.clear();
    selection = null;
    selectionSet.clear();
    autoFixDiffs = [];
    hoveredDiffIndex = null;
    const t = $('#toast');
    if (t && typeof t.querySelector === 'function' && t.querySelector('.toast-action-btn')) {
      dismissToast({ restoreFocus: false });
    }
    refresh();
  }
});
$('#redo')?.addEventListener('click', () => {
  const s = hist.redo();
  if (s) {
    closeOpeningHudEditor();
    doc = s;
    openingUnitMode = M.normalizeOpeningUnit(doc?.settings?.openingUnits || openingUnitMode);
    persist();
    selectionSet.clear();
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
$('#save-zip')?.addEventListener('click', async () => {
  try {
    const zipBlob = await exportProjectZip(doc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${doc.name.replace(/\W+/g, '_') || 'plan'}.homegen.zip`;
    a.click();
    toast('Exported composite ZIP project archive with embedded textures.');
  } catch (err) {
    toast(`Failed to export ZIP archive: ${err.message}`, true);
  }
});
export function exportGeoJSON(state, targetEPSG = 'EPSG:4326') {
  const sourceCRS = state?.crs || M.defaultCRS();
  const targetCRS = M.isValidEPSGCode(targetEPSG) ? M.normalizeEPSGCode(targetEPSG) : targetEPSG;
  const features = [];

  for (const room of state?.rooms || []) {
    const cornersPlan = [
      [room.x, room.y],
      [room.x + room.w, room.y],
      [room.x + room.w, room.y + room.h],
      [room.x, room.y + room.h],
      [room.x, room.y],
    ];

    const cornersTarget = reproject(cornersPlan, sourceCRS, targetCRS);

    features.push({
      type: 'Feature',
      id: room.id,
      geometry: {
        type: 'Polygon',
        coordinates: [cornersTarget],
      },
      properties: {
        id: room.id,
        name: room.name || room.type,
        type: room.type,
        level: room.level || 0,
        areaSqFt: floorAreaSqFt(room),
        ceilingInches: room.ceiling,
        wallFinish: room.walls,
        floorFinish: room.floor,
      },
    });

    for (const item of room.items || []) {
      const itemPlan = [room.x + item.x, room.y + item.y];
      const itemTarget = reproject(itemPlan, sourceCRS, targetCRS);
      features.push({
        type: 'Feature',
        id: item.id,
        geometry: {
          type: 'Point',
          coordinates: itemTarget,
        },
        properties: {
          id: item.id,
          type: item.type,
          roomId: room.id,
          rot: item.rot || 0,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    name: state?.name || 'Homegen Floorplan',
    crs: {
      type: 'name',
      properties: {
        name: typeof targetCRS === 'string' ? targetCRS : targetCRS.epsg || 'EPSG:4326',
      },
    },
    features,
  };
}

export function importGeoJSON(geojsonInput, state, opts = {}) {
  const geojson = typeof geojsonInput === 'string' ? JSON.parse(geojsonInput) : geojsonInput;
  if (!geojson) throw new Error('Invalid GeoJSON content');

  const sourceEPSG = opts.sourceEPSG || geojson.crs?.properties?.name || 'EPSG:4326';
  const targetCRS = state?.crs || M.defaultCRS();

  let features = [];
  if (geojson.type === 'FeatureCollection') {
    features = geojson.features || [];
  } else if (geojson.type === 'Feature') {
    features = [geojson];
  } else if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
    features = [{ geometry: geojson, properties: {} }];
  }

  let importedCount = 0;
  for (const feature of features) {
    if (!feature || !feature.geometry) continue;
    const geom = feature.geometry;
    let rings = [];

    if (geom.type === 'Polygon') {
      rings = [geom.coordinates[0]];
    } else if (geom.type === 'MultiPolygon') {
      rings = (geom.coordinates || []).map((poly) => poly[0]);
    }

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      const planPts = reproject(ring, sourceEPSG, targetCRS);
      const xs = planPts.map((p) => p[0]);
      const ys = planPts.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const w = snap(Math.max(24, maxX - minX));
      const h = snap(Math.max(24, maxY - minY));
      const x = snap(minX);
      const y = snap(minY);

      const type =
        feature.properties?.type && ROOM_TYPES[feature.properties.type]
          ? feature.properties.type
          : 'living';
      const r = M.createRoom(state, type, x, y, w, h);
      if (feature.properties?.name) {
        r.name = feature.properties.name;
      }
      importedCount++;
    }
  }

  return importedCount;
}

$('#load')?.addEventListener('click', () => $('#file').click());
function updateElevationIntervalLabel(unit) {
  const lbl = $('#elevation-contour-interval-label');
  if (lbl) {
    lbl.textContent = `Contour Interval (${normalizeElevationUnit(unit)})`;
  }
}

function syncElevationDialog(grid) {
  const unit = normalizeElevationUnit(grid?.elevationUnit);
  const unitEl = $('#elevation-unit');
  const intervalEl = $('#elevation-contour-interval');
  const scaleEl = $('#elevation-vertical-scale');
  const slopeEl = $('#elevation-slope-percent');
  const dirEl = $('#elevation-slope-direction');
  const visibleEl = $('#elevation-visible');

  if (unitEl) unitEl.value = unit;
  if (intervalEl) intervalEl.value = String(grid?.contourInterval ?? 1.0);
  if (scaleEl) scaleEl.value = String(grid?.verticalScale ?? 1.0);
  if (slopeEl) slopeEl.value = String(sanitizeSlopePercent(grid?.targetSlopePercent ?? 0));
  if (dirEl) dirEl.value = String(sanitizeSlopeDirection(grid?.slopeDirectionDeg ?? 0));
  if (visibleEl) visibleEl.checked = grid ? grid.visible !== false : true;
  updateElevationIntervalLabel(unit);
}

$('#elevation-unit')?.addEventListener('change', (e) => {
  updateElevationIntervalLabel(e.target.value);
});

$('#import-elevation')?.addEventListener('click', (e) => {
  if (doc.elevationGrid) {
    syncElevationDialog(doc.elevationGrid);
    const dlg = $('#dlg-elevation');
    if (dlg) {
      const returnFocusEl = e?.currentTarget || document.activeElement;
      dlg.showModal();
      const cleanup = trapFocus(dlg, returnFocusEl);
      dlg.addEventListener('close', () => cleanup(), { once: true });
    }
  } else {
    $('#elevation-file')?.click();
  }
});

$('#elevation-file')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    let inputData = null;
    if (file.type.includes('json') || file.name.endsWith('.json')) {
      inputData = await file.text();
    } else if (file.name.endsWith('.tif') || file.name.endsWith('.tiff')) {
      inputData = await file.arrayBuffer();
    } else {
      // Image file (PNG / JPEG)
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      inputData = c;
    }

    const selectedUnit = normalizeElevationUnit($('#elevation-unit')?.value || 'm');
    const grid = await parseElevationRaster(inputData, { elevationUnit: selectedUnit });
    doc.elevationGrid = grid;
    doc._cachedContours = await computeContoursAsync(grid);
    syncElevationDialog(grid);
    window.__scene3d?.update();
    redraw();
    persist();
    toast(`Imported terrain elevation grid (${grid.width}x${grid.height}).`);
  } catch (err) {
    toast(`Failed to import elevation data: ${err.message}`, true);
  }
  e.target.value = '';
});

export async function applyElevationSettings() {
  if (!doc.elevationGrid) return;
  const intervalEl = $('#elevation-contour-interval');
  const scaleEl = $('#elevation-vertical-scale');
  const unitEl = $('#elevation-unit');
  const slopeEl = $('#elevation-slope-percent');
  const dirEl = $('#elevation-slope-direction');
  const visEl = $('#elevation-visible');

  const rawInterval = parseFloat(intervalEl?.value ?? '');
  const interval = Number.isFinite(rawInterval) ? Math.max(0.1, Math.min(50, rawInterval)) : 1.0;
  const rawScale = parseFloat(scaleEl?.value ?? '');
  const scale = Number.isFinite(rawScale) ? Math.max(0.1, Math.min(10, rawScale)) : 1.0;
  const unit = normalizeElevationUnit(unitEl?.value || 'm');
  const slopePercent = sanitizeSlopePercent(slopeEl?.value ?? '');
  const directionDegrees = sanitizeSlopeDirection(dirEl?.value ?? '');
  const visible = visEl?.checked !== false;

  if (unitEl) unitEl.value = unit;
  if (intervalEl) intervalEl.value = String(interval);
  if (scaleEl) scaleEl.value = String(scale);
  if (slopeEl) slopeEl.value = String(slopePercent);
  if (dirEl) dirEl.value = String(directionDegrees);

  doc.elevationGrid.contourInterval = interval;
  doc.elevationGrid.verticalScale = scale;
  doc.elevationGrid.elevationUnit = unit;
  doc.elevationGrid.visible = visible;
  updateElevationIntervalLabel(unit);
  doc.elevationGrid.applyGradedSlope({
    slopePercent,
    directionDegrees,
    unitScale: unit === 'ft' ? 1 / 12 : 0.0254,
  });

  doc._cachedContours = await computeContoursAsync(doc.elevationGrid);
  window.__scene3d?.update();
  redraw();
  persist();
  $('#dlg-elevation')?.close();
  toast('Updated elevation terrain settings.');
}

$('#btn-apply-elevation')?.addEventListener('click', () => {
  applyElevationSettings();
});

$('#btn-clear-elevation')?.addEventListener('click', () => {
  doc.elevationGrid = null;
  doc._cachedContours = null;
  syncElevationDialog(null);
  window.__scene3d?.update();
  redraw();
  persist();
  $('#dlg-elevation')?.close();
  toast('Cleared terrain elevation data.');
});
$('#file')?.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.name.endsWith('.zip') || f.type.includes('zip')) {
      const loadedDoc = await importProjectZip(f);
      setDoc(loadedDoc);
      toast('Opened ZIP project archive and loaded textures.');
    } else {
      const text = await f.text();
      if (
        f.name.endsWith('.geojson') ||
        text.includes('"FeatureCollection"') ||
        text.includes('"Feature"')
      ) {
        try {
          const json = JSON.parse(text);
          if (
            json.type === 'FeatureCollection' ||
            json.type === 'Feature' ||
            json.type === 'Polygon'
          ) {
            const count = importGeoJSON(json, doc);
            toast(`Imported ${count} spatial parcel/room boundaries from GeoJSON.`);
            refresh();
            fit();
            e.target.value = '';
            return;
          }
        } catch {
          // fall back to standard JSON deserialize
        }
      }
      setDoc(M.deserialize(text));
      toast('Opened plan JSON.');
    }
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
export const PLAN_TIER_RANKS = {
  free: 0,
  plus: 1,
  pro: 2,
};

const EXPORT_UPGRADE_MESSAGES = {
  pdf: 'Upgrade to Homegen Pro to unlock multi-page scaled Vector PDF sheets, custom branding logos, and approval stamps.',
  csv: 'Upgrade to Homegen Plus or Pro to unlock full Bill of Materials CSV schedules, finish takeoffs, and room area metrics.',
  dxf: 'Upgrade to Homegen Pro to unlock layered AutoCAD DXF geometry, SI metric scaling, and multi-story CAD exchange.',
  export:
    'Compare Homegen Plus and Pro plans for architectural PDF sheets, BOM schedules, and CAD exports.',
};

export function getCurrentPlanTier(state = doc) {
  const fromState = state?.settings?.planTier;
  if (typeof fromState === 'string' && PLAN_TIER_RANKS[fromState.toLowerCase()] !== undefined) {
    return fromState.toLowerCase();
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('homegen.planTier');
      if (stored && PLAN_TIER_RANKS[stored.toLowerCase()] !== undefined) {
        return stored.toLowerCase();
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return 'free';
}

export function initExportModalTierState(modalEl, currentTier = getCurrentPlanTier()) {
  if (!modalEl) return null;
  const normalizedTier =
    typeof currentTier === 'string' && PLAN_TIER_RANKS[currentTier.toLowerCase()] !== undefined
      ? currentTier.toLowerCase()
      : 'free';
  const currentRank = PLAN_TIER_RANKS[normalizedTier];

  if (modalEl.dataset) {
    modalEl.dataset.activePlanTier = normalizedTier;
  } else if (typeof modalEl.setAttribute === 'function') {
    modalEl.setAttribute('data-active-plan-tier', normalizedTier);
  }

  const badges = Array.from(modalEl.querySelectorAll?.('.plan-tier-badge') || []);
  for (const badge of badges) {
    const rawTier =
      badge.dataset?.tier ||
      badge.getAttribute?.('data-tier') ||
      (badge.classList?.contains('plan-tier-pro') ? 'pro' : 'plus');
    const badgeTier = rawTier === 'pro' ? 'pro' : 'plus';
    const unlocked = currentRank >= PLAN_TIER_RANKS[badgeTier];
    const tierLabel = badgeTier === 'pro' ? 'Pro' : 'Plus';

    if (badge.dataset) {
      badge.dataset.tier = badgeTier;
      badge.dataset.tierState = unlocked ? 'unlocked' : 'locked';
    }
    if (typeof badge.setAttribute === 'function') {
      badge.setAttribute('data-tier', badgeTier);
      badge.setAttribute('data-tier-state', unlocked ? 'unlocked' : 'locked');
      badge.setAttribute(
        'aria-label',
        unlocked ? `${tierLabel} plan feature (unlocked)` : `${tierLabel} plan feature`
      );
    }
    badge.classList?.toggle('is-unlocked', unlocked);
    badge.classList?.toggle('is-locked', !unlocked);
    badge.hidden = false;
  }

  const banners = Array.from(modalEl.querySelectorAll?.('.upgrade-trigger-banner') || []);
  for (const banner of banners) {
    const reqRaw =
      banner.dataset?.requiredTier || banner.getAttribute?.('data-required-tier') || 'pro';
    const requiredTier = PLAN_TIER_RANKS[reqRaw] !== undefined ? reqRaw : 'pro';
    const isProTier = currentRank >= PLAN_TIER_RANKS.pro;
    banner.hidden = isProTier;

    if (banner.dataset) {
      banner.dataset.currentTier = normalizedTier;
      banner.dataset.requiredTier = requiredTier;
    } else if (typeof banner.setAttribute === 'function') {
      banner.setAttribute('data-current-tier', normalizedTier);
      banner.setAttribute('data-required-tier', requiredTier);
    }

    const link = banner.querySelector?.('.upgrade-trigger-link');
    if (link && !isProTier) {
      const targetTier =
        currentRank >= PLAN_TIER_RANKS.plus && requiredTier === 'plus' ? 'pro' : requiredTier;
      const targetLabel = targetTier === 'pro' ? 'Pro' : 'Plus';
      if (link.dataset) link.dataset.upgradeTier = targetTier;
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('data-upgrade-tier', targetTier);
      }
      link.textContent = `Upgrade to ${targetLabel}`;
    }
  }

  return {
    activePlanTier: normalizedTier,
    badgeCount: badges.length,
    bannerCount: banners.length,
  };
}

export function openPlanUpgradePrompt(options = {}) {
  const {
    tier = 'pro',
    exportType = 'export',
    triggerEl = null,
    root = typeof document !== 'undefined' ? document : null,
  } = options;

  const targetTier = tier === 'plus' ? 'plus' : 'pro';
  const message = EXPORT_UPGRADE_MESSAGES[exportType] || EXPORT_UPGRADE_MESSAGES.export;
  const upgradeDlg = root?.querySelector?.('#dlg-plan-upgrade') || null;

  if (upgradeDlg) {
    const contextEl = upgradeDlg.querySelector?.('#upgrade-prompt-context');
    if (contextEl) contextEl.textContent = message;

    if (upgradeDlg.dataset) {
      upgradeDlg.dataset.requestedTier = targetTier;
      upgradeDlg.dataset.exportContext = exportType;
    }
    if (typeof upgradeDlg.setAttribute === 'function') {
      upgradeDlg.setAttribute('data-requested-tier', targetTier);
      upgradeDlg.setAttribute('data-export-context', exportType);
    }

    const cards = Array.from(upgradeDlg.querySelectorAll?.('.upgrade-tier-card') || []);
    for (const card of cards) {
      const cardTier = card.dataset?.tier || card.getAttribute?.('data-tier');
      const isHighlighted = cardTier === targetTier;
      card.classList?.toggle('highlighted', isHighlighted);
      if (card.dataset) card.dataset.highlighted = isHighlighted ? 'true' : 'false';
      if (typeof card.setAttribute === 'function') {
        card.setAttribute('data-highlighted', isHighlighted ? 'true' : 'false');
      }
    }

    if (typeof upgradeDlg.showModal === 'function') {
      try {
        if (!upgradeDlg.open) upgradeDlg.showModal();
      } catch {
        upgradeDlg.setAttribute?.('open', '');
        upgradeDlg.open = true;
      }
    } else {
      upgradeDlg.setAttribute?.('open', '');
      upgradeDlg.open = true;
    }
    upgradeDlg.hidden = false;

    const cleanup = trapFocus(upgradeDlg, triggerEl);
    upgradeDlg.addEventListener?.('close', () => cleanup(), { once: true });
  } else if ($('#toast')) {
    toast(message);
  }

  announceToLiveRegion(message);
  return { tier: targetTier, exportType, message, dialogOpened: Boolean(upgradeDlg) };
}

export function bindUpgradeTriggerLinks(root = typeof document !== 'undefined' ? document : null) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  let boundCount = 0;

  const links = Array.from(root.querySelectorAll('.upgrade-trigger-link'));
  for (const link of links) {
    const alreadyBound =
      link.dataset?.upgradeBound === 'true' || link.getAttribute?.('data-upgrade-bound') === 'true';
    if (alreadyBound) continue;

    if (link.dataset) link.dataset.upgradeBound = 'true';
    else link.setAttribute?.('data-upgrade-bound', 'true');

    link.addEventListener('click', (e) => {
      if (typeof e?.preventDefault === 'function') e.preventDefault();
      const targetTier =
        link.dataset?.upgradeTier || link.getAttribute?.('data-upgrade-tier') || 'pro';
      const exportType =
        link.dataset?.exportType || link.getAttribute?.('data-export-type') || 'export';
      openPlanUpgradePrompt({
        tier: targetTier,
        exportType,
        triggerEl: link,
        root,
      });
    });
    boundCount++;
  }

  const upgradeDlg = root.querySelector?.('#dlg-plan-upgrade');
  if (upgradeDlg) {
    const dlgAlreadyBound =
      upgradeDlg.dataset?.upgradeControlsBound === 'true' ||
      upgradeDlg.getAttribute?.('data-upgrade-controls-bound') === 'true';
    if (!dlgAlreadyBound) {
      if (upgradeDlg.dataset) upgradeDlg.dataset.upgradeControlsBound = 'true';
      else upgradeDlg.setAttribute?.('data-upgrade-controls-bound', 'true');

      const closeUpgradeModal = () => {
        if (typeof upgradeDlg.close === 'function') {
          upgradeDlg.close();
        } else {
          upgradeDlg.removeAttribute?.('open');
          upgradeDlg.open = false;
          upgradeDlg.hidden = true;
        }
      };

      upgradeDlg
        .querySelector?.('#btn-upgrade-close')
        ?.addEventListener('click', closeUpgradeModal);

      const tierButtons = Array.from(upgradeDlg.querySelectorAll?.('[data-select-tier]') || []);
      for (const btn of tierButtons) {
        btn.addEventListener('click', () => {
          const selected =
            btn.dataset?.selectTier || btn.getAttribute?.('data-select-tier') || 'pro';
          const label = selected === 'plus' ? 'Plus' : 'Pro';
          closeUpgradeModal();
          if ($('#toast')) {
            toast(
              `Homegen ${label} upgrade selected. Visit billing settings to activate ${label}.`
            );
          }
        });
      }
    }
  }

  return boundCount;
}

if (typeof document !== 'undefined') {
  bindUpgradeTriggerLinks(document);
}

$('#export-pdf')?.addEventListener('click', (e) => {
  if (!doc.rooms || doc.rooms.length === 0) {
    toast('Cannot export PDF: add at least one room first.', true);
    return;
  }
  const returnFocusEl = e.currentTarget || document.activeElement;
  $('#pdf-title').value = doc.name || 'My home';
  $('#pdf-date').value = new Date().toISOString().slice(0, 10);
  const levelSelect = $('#pdf-level');
  if (levelSelect) {
    levelSelect.innerHTML = '<option value="all" selected>All levels (Multi-page)</option>';
    if (Array.isArray(doc.levelMetadata) && doc.levelMetadata.length > 0) {
      for (const meta of doc.levelMetadata) {
        const opt = document.createElement('option');
        opt.value = String(meta.index);
        opt.textContent = `${meta.name}${meta.index === curLevel ? ' (Current)' : ''}`;
        levelSelect.appendChild(opt);
      }
    } else {
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
    levelSelect.value = 'all';
  }
  const sessionBox = $('#pdf-session-branding-box');
  if (sessionBox) sessionBox.hidden = $('#pdf-branding-mode')?.value !== 'session';
  const dlg = $('#pdf-export');
  if (dlg) {
    initExportModalTierState(dlg);
    bindUpgradeTriggerLinks(dlg);
    dlg.showModal();
    const cleanup = trapFocus(dlg, returnFocusEl);
    dlg.addEventListener('close', () => cleanup(), { once: true });
  }
});

$('#pdf-branding-mode')?.addEventListener('change', (e) => {
  const sessionBox = $('#pdf-session-branding-box');
  if (sessionBox) sessionBox.hidden = e.target.value !== 'session';
});

$('#pdf-cancel')?.addEventListener('click', () => {
  $('#pdf-export')?.close();
});
$('#pdf-generate')?.addEventListener('click', () => {
  try {
    const brandingMode = $('#pdf-branding-mode')?.value || 'project';
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
      brandingMode,
      includeLogo: $('#pdf-inc-logo')?.checked !== false,
      includeStamp: $('#pdf-inc-stamp')?.checked !== false,
      includeWatermark: $('#pdf-inc-watermark')?.checked !== false,
      sessionBranding:
        brandingMode === 'session'
          ? {
              stamp: {
                shape: 'circle',
                titleText: $('#pdf-session-stamp-title')?.value || 'APPROVED',
                subtitleText: 'ARCHITECTURAL PLAN',
                borderColor: '#d32f2f',
                textColor: '#d32f2f',
                opacity: 0.9,
                enabled: true,
              },
              watermark: {
                text: $('#pdf-session-watermark')?.value || '',
                color: '#9e9e9e',
                opacity: 0.2,
                fontSize: 24,
                angle: -45,
                enabled: true,
              },
            }
          : null,
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

// ------------------------------------------------------------- CSV BOM Export
$('#export-csv')?.addEventListener('click', (e) => {
  if (!doc.rooms || doc.rooms.length === 0) {
    toast('Cannot export CSV: add at least one room first.', true);
    return;
  }
  const returnFocusEl = e.currentTarget || document.activeElement;
  const dlg = $('#csv-export');
  if (dlg) {
    initExportModalTierState(dlg);
    bindUpgradeTriggerLinks(dlg);
    dlg.showModal();
    const cleanup = trapFocus(dlg, returnFocusEl);
    dlg.addEventListener('close', () => cleanup(), { once: true });
  }
});

$('#csv-cancel')?.addEventListener('click', () => {
  $('#csv-export')?.close();
});

$('#csv-generate')?.addEventListener('click', () => {
  try {
    const opts = {
      includeMetadata: $('#csv-sec-meta')?.checked !== false,
      includeFurniture: $('#csv-sec-furniture')?.checked !== false,
      includeOpenings: $('#csv-sec-openings')?.checked !== false,
      includeFinishes: $('#csv-sec-finishes')?.checked !== false,
      includeRooms: $('#csv-sec-rooms')?.checked !== false,
      includePricing: $('#csv-inc-pricing')?.checked !== false,
    };

    if (
      !opts.includeMetadata &&
      !opts.includeFurniture &&
      !opts.includeOpenings &&
      !opts.includeFinishes &&
      !opts.includeRooms
    ) {
      toast('Select at least one schedule section to export.', true);
      return;
    }

    const csvText = generateBOMCSV(doc, opts);
    const sanitizedName = (doc.name || 'plan').trim().replace(/\W+/g, '_') || 'plan';
    const fileName = `${sanitizedName}_bill_of_materials.csv`;
    download(fileName, csvText, 'text/csv;charset=utf-8;');
    $('#csv-export')?.close();
    toast('Exported Bill of Materials to CSV.');
  } catch (err) {
    toast(`Failed to export CSV: ${err.message}`, true);
  }
});

// ------------------------------------------------------------- DXF CAD Export
$('#export-dxf')?.addEventListener('click', (e) => {
  if (!doc.rooms || doc.rooms.length === 0) {
    toast('Cannot export DXF: add at least one room first.', true);
    return;
  }
  const returnFocusEl = e.currentTarget || document.activeElement;
  const dlg = $('#dxf-export');
  if (dlg) {
    const lvlSelect = $('#dxf-level');
    if (lvlSelect) {
      lvlSelect.innerHTML = '<option value="all" selected>All Levels</option>';
      if (Array.isArray(doc.levelMetadata) && doc.levelMetadata.length > 0) {
        for (const meta of doc.levelMetadata) {
          lvlSelect.innerHTML += `<option value="${meta.index}">${esc(meta.name)}</option>`;
        }
      } else {
        for (let i = 0; i < (doc.levels || 1); i++) {
          lvlSelect.innerHTML += `<option value="${i}">Level ${i + 1}</option>`;
        }
      }
      lvlSelect.value = 'all';
    }
    initExportModalTierState(dlg);
    bindUpgradeTriggerLinks(dlg);
    dlg.showModal();
    const cleanup = trapFocus(dlg, returnFocusEl);
    dlg.addEventListener('close', () => cleanup(), { once: true });
  }
});

$('#dxf-cancel')?.addEventListener('click', () => {
  $('#dxf-export')?.close();
});

$('#dxf-generate')?.addEventListener('click', () => {
  try {
    const units = $('#dxf-units')?.value || 'inches';
    const levelVal = $('#dxf-level')?.value || 'all';
    const level = levelVal === 'all' ? 'all' : Number(levelVal);

    const dxfText = exportDXF(doc, { units, level });
    const sanitizedName = (doc.name || 'plan').trim().replace(/\W+/g, '_') || 'plan';
    const fileName = `${sanitizedName}.dxf`;
    download(fileName, dxfText, 'image/vnd.dxf');
    $('#dxf-export')?.close();
    toast('Exported DXF CAD Exchange file.');
  } catch (err) {
    toast(`Failed to export DXF: ${err.message}`, true);
  }
});

// ------------------------------------------------------------- Interactive Branding & Stamp Builder UI
let workingBranding = M.defaultBranding();

function updateStampPreview() {
  const cv = $('#stamp-preview-canvas');
  if (cv) {
    renderStampCanvas(cv, workingBranding.stamp);
  }
}

function updateLogoPreviewUI() {
  const img = $('#logo-preview-img');
  const msg = $('#logo-none-msg');
  if (workingBranding.logoDataUrl) {
    if (img) {
      img.src = workingBranding.logoDataUrl;
      img.style.display = 'inline-block';
    }
    if (msg) msg.style.display = 'none';
  } else {
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    if (msg) msg.style.display = 'inline-block';
  }
}

function openBrandingDialog() {
  const dlg = $('#dlg-branding');
  if (!dlg) return;

  doc.settings ||= {};
  doc.settings.branding ||= M.defaultBranding();
  workingBranding = JSON.parse(JSON.stringify(doc.settings.branding));

  const st = workingBranding.stamp || {};
  if ($('#stamp-enabled')) $('#stamp-enabled').checked = st.enabled !== false;
  if ($('#stamp-shape')) $('#stamp-shape').value = st.shape || 'circle';
  if ($('#stamp-title')) $('#stamp-title').value = st.titleText ?? 'APPROVED';
  if ($('#stamp-subtitle')) $('#stamp-subtitle').value = st.subtitleText ?? 'ARCHITECTURAL PLAN';
  if ($('#stamp-license')) $('#stamp-license').value = st.licenseText ?? '';
  if ($('#stamp-date')) $('#stamp-date').value = st.dateText ?? '';
  if ($('#stamp-border-style')) $('#stamp-border-style').value = st.borderStyle || 'solid';
  if ($('#stamp-border-color')) $('#stamp-border-color').value = st.borderColor || '#d32f2f';
  if ($('#stamp-text-color')) $('#stamp-text-color').value = st.textColor || '#d32f2f';
  if ($('#stamp-opacity')) {
    $('#stamp-opacity').value = st.opacity ?? 0.9;
    updateRangeAriaValueText($('#stamp-opacity'), 'percent');
  }

  const wm = workingBranding.watermark || {};
  if ($('#wm-enabled')) $('#wm-enabled').checked = wm.enabled !== false;
  if ($('#wm-text')) $('#wm-text').value = wm.text ?? '';
  if ($('#wm-color')) $('#wm-color').value = wm.color || '#9e9e9e';
  if ($('#wm-opacity')) {
    $('#wm-opacity').value = wm.opacity ?? 0.2;
    updateRangeAriaValueText($('#wm-opacity'), 'percent');
  }

  updateLogoPreviewUI();
  updateStampPreview();

  if (typeof dlg.showModal === 'function') {
    dlg.showModal();
  } else {
    dlg.setAttribute('open', '');
  }
}

function syncWorkingStampFromInputs() {
  workingBranding.stamp = {
    enabled: $('#stamp-enabled')?.checked !== false,
    shape: $('#stamp-shape')?.value || 'circle',
    titleText: $('#stamp-title')?.value ?? 'APPROVED',
    subtitleText: $('#stamp-subtitle')?.value ?? 'ARCHITECTURAL PLAN',
    licenseText: $('#stamp-license')?.value ?? '',
    dateText: $('#stamp-date')?.value ?? '',
    borderStyle: $('#stamp-border-style')?.value || 'solid',
    borderColor: $('#stamp-border-color')?.value || '#d32f2f',
    textColor: $('#stamp-text-color')?.value || '#d32f2f',
    opacity: parseFloat($('#stamp-opacity')?.value ?? '0.9'),
  };
  updateRangeAriaValueText($('#stamp-opacity'), 'percent');
  updateStampPreview();
}

function syncWorkingWatermarkFromInputs() {
  workingBranding.watermark = {
    enabled: $('#wm-enabled')?.checked !== false,
    text: $('#wm-text')?.value ?? '',
    color: $('#wm-color')?.value || '#9e9e9e',
    opacity: parseFloat($('#wm-opacity')?.value ?? '0.2'),
    fontSize: 24,
    angle: -45,
  };
  updateRangeAriaValueText($('#wm-opacity'), 'percent');
}

if (typeof document !== 'undefined') {
  $('#branding-btn')?.addEventListener('click', openBrandingDialog);

  document.querySelectorAll('.branding-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const sec = e.currentTarget.dataset.bsection;
      document.querySelectorAll('.branding-tabs .tab-btn').forEach((b) => {
        const active = b === e.currentTarget;
        b.classList.toggle('on', active);
        if (typeof b.active !== 'undefined') b.active = active;
        else if (active) b.setAttribute('active', '');
        else b.removeAttribute('active');
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.bsection').forEach((s) => {
        s.hidden = s.id !== `bsection-${sec}`;
      });
    });
  });

  document.addEventListener?.('click', (e) => {
    const lbl = e.target?.closest?.('label[for]');
    if (!lbl || typeof document.getElementById !== 'function') return;
    const target = document.getElementById(lbl.getAttribute('for'));
    if (target && (target.tagName === 'K-INPUT' || target.tagName === 'K-SELECT')) {
      target.focus();
    }
  });

  [
    '#stamp-enabled',
    '#stamp-shape',
    '#stamp-title',
    '#stamp-subtitle',
    '#stamp-license',
    '#stamp-date',
    '#stamp-border-style',
    '#stamp-border-color',
    '#stamp-text-color',
    '#stamp-opacity',
  ].forEach((selector) => {
    $(selector)?.addEventListener('input', syncWorkingStampFromInputs);
    $(selector)?.addEventListener('change', syncWorkingStampFromInputs);
  });

  ['#wm-enabled', '#wm-text', '#wm-color', '#wm-opacity'].forEach((selector) => {
    $(selector)?.addEventListener('input', syncWorkingWatermarkFromInputs);
    $(selector)?.addEventListener('change', syncWorkingWatermarkFromInputs);
  });
  updateRangeAriaValueText($('#stamp-opacity'), 'percent');
  updateRangeAriaValueText($('#wm-opacity'), 'percent');

  $('#logo-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      toast('Logo asset exceeds 500KB limit. Please choose a smaller image.', true);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataUrl = evt.target.result;
        M.validateLogoSize(dataUrl, 500);
        workingBranding.logoDataUrl = dataUrl;
        updateLogoPreviewUI();
        toast('Logo uploaded successfully.');
      } catch (err) {
        toast(err.message, true);
      }
    };
    reader.readAsDataURL(file);
  });

  $('#logo-clear-btn')?.addEventListener('click', () => {
    workingBranding.logoDataUrl = null;
    const fileInput = $('#logo-file');
    if (fileInput) fileInput.value = '';
    updateLogoPreviewUI();
    toast('Logo cleared.');
  });

  $('#branding-cancel')?.addEventListener('click', () => {
    $('#dlg-branding')?.close();
  });

  $('#branding-save')?.addEventListener('click', () => {
    syncWorkingStampFromInputs();
    syncWorkingWatermarkFromInputs();
    doc.settings ||= {};
    doc.settings.branding = JSON.parse(JSON.stringify(workingBranding));
    hist.push(doc, 'Save Branding Settings');
    persist();
    $('#dlg-branding')?.close();
    toast('Branding and stamp settings saved to project.');
  });

  $('#gis-btn')?.addEventListener('click', openGISDialog);
  $('#gis-close')?.addEventListener('click', closeGISDialog);
  $('#gis-done')?.addEventListener('click', closeGISDialog);

  $('#gis-load-sample')?.addEventListener('click', () => {
    loadGISSubsystem(SAMPLE_MUNICIPAL_GIS);
    toast('Sample municipal GIS lot loaded successfully.');
  });

  $('#gis-import-file')?.addEventListener('click', () => {
    $('#geojson-file')?.click();
  });

  $('#geojson-file')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        loadGISSubsystem(json);
        toast('GeoJSON imported successfully.');
      } catch (err) {
        toast(`Failed to parse GeoJSON: ${err.message}`, true);
      }
    };
    reader.readAsText(file);
  });

  $('#gis-crs')?.addEventListener('change', (e) => {
    const crs = e.detail?.value ?? e.target?.value;
    if (crs && doc.site && doc.site.features) {
      loadGISSubsystem({ type: 'FeatureCollection', features: doc.site.features }, { crs });
    }
  });

  document.querySelector('label[for="gis-crs"]')?.addEventListener('click', () => {
    $('#gis-crs')?.focus();
  });
  document.querySelector('label[for="gis-map-preset"]')?.addEventListener('click', () => {
    $('#gis-map-preset')?.focus();
  });
}

// ------------------------------------------------------------- GIS Subsystem Helpers
const SAMPLE_MUNICIPAL_GIS = {
  type: 'FeatureCollection',
  crs: { properties: { name: 'EPSG:4326' } },
  features: [
    {
      type: 'Feature',
      id: 'lot-polygon-1',
      properties: { name: 'Municipal Lot Boundary 402B', layer: 'lot', setback: 36 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4194, 37.7749],
            [-122.4174, 37.7749],
            [-122.4174, 37.7734],
            [-122.4194, 37.7734],
            [-122.4194, 37.7749],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'easement-polygon-1',
      properties: { name: 'Public Utility Easement', layer: 'easement' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4194, 37.7737],
            [-122.4184, 37.7737],
            [-122.4184, 37.7734],
            [-122.4194, 37.7734],
            [-122.4194, 37.7737],
          ],
        ],
      },
    },
  ],
};

export function loadGISSubsystem(geojson, options = {}) {
  const bridge = new GISBridge(doc.site);
  doc.site = bridge.importGeoJSON(geojson, {
    targetBounds: { x: 50, y: 50, w: 1100, h: 800 },
    crs: options.crs || $('#gis-crs')?.value || 'EPSG:4326',
    ...options,
  });
  hist.push(doc);
  persist();
  redraw();
  renderGISSegments();
  return doc.site;
}

export function setGISSegmentSetback(segmentId, setbackDistance) {
  if (!doc.site) return null;
  const bridge = new GISBridge(doc.site);
  doc.site = bridge.setSegmentSetback(segmentId, setbackDistance);
  hist.push(doc);
  persist();
  redraw();
  renderGISSegments();
  return doc.site;
}

function openGISDialog() {
  const dlg = $('#dlg-gis');
  if (!dlg) return;
  const gisCrsSelect = $('#gis-crs');
  if (gisCrsSelect && doc.site?.crs) {
    const opts =
      typeof gisCrsSelect.querySelectorAll === 'function'
        ? Array.from(gisCrsSelect.querySelectorAll('option'))
        : [];
    if (!opts.length || opts.some((opt) => opt.value === doc.site.crs)) {
      gisCrsSelect.value = doc.site.crs;
    }
  }
  const gisMapSelect = $('#gis-map-preset');
  if (gisMapSelect) gisMapSelect.value = doc.background?.presetKey || '';
  renderGISSegments();
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

export function closeGISDialog() {
  const dlg = $('#dlg-gis');
  if (!dlg) return;
  if (typeof dlg.close === 'function') dlg.close();
  else dlg.removeAttribute('open');
}

function renderGISSegments() {
  const container = $('#gis-segment-list');
  if (!container) return;
  if (!doc.site || !doc.site.segments || !doc.site.segments.length) {
    container.innerHTML =
      '<p class="gis-empty-msg">No GIS lot segments loaded yet. Click "Load Sample Municipal Lot" or upload a GeoJSON file.</p>';
    return;
  }

  let html = '<table class="gis-segment-table">';
  html +=
    '<thead><tr class="gis-table-head-row"><th>Segment</th><th>Setback (in)</th></tr></thead><tbody>';
  for (const seg of doc.site.segments) {
    html += `<tr class="gis-table-row">
      <td class="gis-table-cell">${seg.label || seg.id}</td>
      <td class="gis-table-cell"><k-input type="number" min="0" max="360" value="${seg.setback ?? 36}" data-seg-id="${seg.id}" aria-label="${seg.label || seg.id} setback (inches)" class="gis-setback-input"></k-input> in</td>
    </tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.gis-setback-input').forEach((input) => {
    const handleSetbackChange = (e) => {
      const segId = e.target.dataset.segId || e.target.getAttribute('data-seg-id');
      const val = parseFloat(e.target.value) || 0;
      setGISSegmentSetback(segId, val);
    };
    input.addEventListener('change', handleSetbackChange);
  });
}

export { SAMPLE_MUNICIPAL_GIS, openGISDialog, renderGISSegments };

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

function openExportDialog(e) {
  const dlg = $('#dlg-export');
  if (!dlg) return;
  const returnFocusEl = e?.currentTarget || document.activeElement;
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
  const cleanup = trapFocus(dlg, returnFocusEl);
  dlg.addEventListener('close', () => cleanup(), { once: true });
}

$('#btn-cancel-custom-material')?.addEventListener('click', () => {
  $('#dlg-custom-material')?.close();
});

$('#btn-save-custom-material')?.addEventListener('click', () => {
  const nameInput = $('#custom-mat-name');
  const fileInput = $('#custom-mat-file');
  const densitySel = $('#custom-mat-density');

  const name = (nameInput?.value || '').trim() || 'Custom Material';
  const density = Number(densitySel?.value) || 24;

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    toast('Please select an image file for the custom material.', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const spec = { name, dataUrl, tileInches: density };
    const registered = registerCustomWallFinish(spec, doc);
    clearPatternCache(registered.id);
    $('#dlg-custom-material')?.close();
    renderPalette();
    refresh();
    toast(`Custom material "${registered.name}" added`);
  };
  reader.readAsDataURL(fileInput.files[0]);
});

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
  hist.push(doc, 'Change Plan Name');
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
export function switchTab(targetBtn, shouldFocus = false) {
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
  const palette =
    typeof document.getElementById === 'function'
      ? document.getElementById('palette')
      : document.querySelector?.('#palette');
  if (palette && targetBtn.id) {
    palette.setAttribute('aria-labelledby', targetBtn.id);
  }
  clearCatalogAnnouncement();
  renderPalette();
  if (shouldFocus) {
    targetBtn.focus();
  }
}

if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
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

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  initCommandPaletteUI();
  initOpeningHudUI();
  initShortcutOverlayUI();
  setupAddRoomDimsModal();
  initWallHudUI();
  setupWallAngleHud();
  setupDraftingCurveHud();
  $('#btn-close-room')?.addEventListener('click', handleCloseRoom);

  window.addEventListener('keydown', (e) => {
    if (document.activeElement?.closest('#tabs')) return;

    const k = e.key;
    const lk = k ? k.toLowerCase() : '';

    if (wallHudState.open && wallHudState.focused && lk === 'escape') {
      e.preventDefault();
      closeWallHud({ restoreFocus: true });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && lk === 'r') {
      e.preventDefault();
      openAddRoomDimsModal();
      return;
    }

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

    const confirmDlg = $('#dlg-confirm');
    if (confirmDlg && (confirmDlg.open || confirmDlg.hasAttribute?.('open'))) {
      if (lk === 'escape') {
        e.preventDefault?.();
        confirmDlg.close?.();
      }
      return;
    }

    if (
      k === 'Tab' &&
      (document.activeElement === canvas ||
        tool.kind === 'room' ||
        (drag && (drag.kind === 'resize' || drag.kind === 'room-new'))) &&
      canActivateWallHudOnTab()
    ) {
      e.preventDefault();
      activateWallHudByTab(e.shiftKey);
      return;
    }

    const singleKeyDisabled = isSingleKeyShortcutDisabled();
    const hasCmdModifier = Boolean(e.ctrlKey || e.metaKey || e.altKey);

    if (k === '?' && !hasCmdModifier) {
      if (!singleKeyDisabled) {
        e.preventDefault();
        const shortcutDlg = $('#shortcut-overlay');
        if (shortcutDlg && (shortcutDlg.open || shortcutDlg.hasAttribute('open'))) {
          closeShortcutOverlay();
        } else {
          openShortcutOverlay();
        }
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
      const step = e.altKey ? 1 : e.shiftKey ? 12 : 6;
      if (selection) {
        moveSelectedSpatial(dx, dy, step);
      } else {
        navigateSpatial(dir);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && lk === 'z') {
      e.preventDefault();
      $(e.shiftKey ? '#redo' : '#undo').click();
    } else if ((e.ctrlKey || e.metaKey) && lk === 'y') {
      e.preventDefault();
      $('#redo').click();
    } else if (lk === 'escape') {
      const hadOpenWallHud = Boolean(wallHudState.open);
      closeWallHud({ redraw: false });
      const historyPopover = $('#history-popover');
      const hasOpenHistory = Boolean(historyPopover && !historyPopover.hidden);
      if (
        toast._state?.active &&
        !hadOpenWallHud &&
        !selection &&
        tool.kind === 'select' &&
        !hasOpenHistory
      ) {
        e.preventDefault();
        dismissToast({ restoreFocus: true });
        return;
      }
      if (interaction.resetRoomDrawing) interaction.resetRoomDrawing();
      activeDraftCurveEdge = null;
      draftConcavitySign = 1;
      syncDraftingCurveHud();
      const btnClose = $('#btn-close-room');
      if (btnClose) btnClose.hidden = true;
      const hint = $('#tool-hint');
      if (hint && tool.kind === 'room') hint.textContent = '';
      if (hasOpenHistory) {
        historyPopover.hidden = true;
        $('#history-btn')?.setAttribute('aria-expanded', 'false');
        if (activeHistoryPopoverCleanup) {
          activeHistoryPopoverCleanup();
          activeHistoryPopoverCleanup = null;
        } else {
          $('#history-btn')?.focus();
        }
      }
      setTool({ kind: 'select' });
      select(null);
      toast('Selection cleared', false, 1800);
    } else if (lk === 'delete' || lk === 'backspace') {
      const selectedList = getSelectionList();
      if (selectedList.length > 0) {
        const label = getSelectionLabel();
        const r = apply((n) => M.removeSet(n, selectedList), 'Delete Selection');
        if (r.ok) {
          select(null);
          toast(`Deleted ${label || 'selected element(s)'}`, false, 4500, UNDO_TOAST_ACTION);
        }
      }
    } else if (!singleKeyDisabled && !hasCmdModifier) {
      if (lk === 'r') rotateSelected();
      else if (lk === 'v') setTool({ kind: 'select' });
      else if (lk === 'x') setTool({ kind: 'erase' });
      else if (lk === 'i') setTool({ kind: 'eyedropper' });
      else if (k === '+' || k === '=') $('#zoom-in')?.click();
      else if (k === '-') $('#zoom-out')?.click();
    }
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
    getSelectionId: () => (typeof selection === 'string' ? selection : null),
    onSelectEntity: (id) => {
      select(id);
    },
    onTransformCommit: () => {
      report = evaluate(doc);
      complianceManager.syncState(doc);
      hist.push(doc, 'Transform 3D Element');
      persist();
      renderCompliance();
      renderInspector();
      renderHistoryTimeline();
      redraw();
    },
    toast,
    setLevel,
    interaction,
    snappingBridge,
  });
  bindHeaderQuotaBadge(defaultRateLimiter, document, {
    onUpgrade: (btn) => view3d?.openQuotaUpgrade?.(btn),
  });

  $('#history-btn')?.addEventListener('click', toggleHistoryPopover);
  $('#history-close')?.addEventListener('click', () => {
    const popover = $('#history-popover');
    const btn = $('#history-btn');
    if (popover) popover.hidden = true;
    btn?.setAttribute('aria-expanded', 'false');
    if (activeHistoryPopoverCleanup) {
      activeHistoryPopoverCleanup();
      activeHistoryPopoverCleanup = null;
    } else {
      btn?.focus();
    }
  });

  renderPalette();
  setTool({ kind: 'select' });
  resize();
  refresh();
  if (doc.rooms.length) fit();

  checkOnboardingOnStartup(() => {
    openWelcomeWizard();
  });
}
function toggleHistoryPopover() {
  const popover = $('#history-popover');
  const btn = $('#history-btn');
  if (!popover) return;
  const isHidden = popover.hidden;
  popover.hidden = !isHidden;
  if (btn) btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  if (isHidden) {
    if (activeHistoryPopoverCleanup) activeHistoryPopoverCleanup();
    activeHistoryPopoverCleanup = trapFocus(popover, btn);
  } else if (activeHistoryPopoverCleanup) {
    activeHistoryPopoverCleanup();
    activeHistoryPopoverCleanup = null;
  } else {
    btn?.focus();
  }
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
    const returnFocusEl = document.activeElement;
    dlg.showModal();
    const cleanup = trapFocus(dlg, returnFocusEl);
    dlg.addEventListener('close', () => cleanup(), { once: true });
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

  if (Array.isArray(bg.affineMatrix) && bg.affineMatrix.length >= 6) {
    const [a, b, c, d, e, f] = bg.affineMatrix;
    bg.affineMatrix = [
      a * factor,
      b * factor,
      c * factor,
      d * factor,
      p1.x - (p1.x - e) * factor,
      p1.y - (p1.y - f) * factor,
    ];
  } else {
    bg.affineMatrix = [bg.scale, 0, 0, bg.scale, bg.x, bg.y];
  }
  bg.geoBounds = computeGeoBounds(bg.affineMatrix, bg.width || 1000, bg.height || 1000, 'PLAN');

  hist.push(doc, 'Calibrate Blueprint');
  persist();
  calibPoints = [];
  setTool({ kind: 'select' });
  refresh();
  toast(`Blueprint scale calibrated (${fmtLen(targetInches)}).`);
}

function apply3PointCalibration(srcPts, dstPts) {
  if (!doc.background) return false;
  try {
    const dstPlanPts = (dstPts || []).map((p) => {
      if (p.crs && p.crs !== 'PLAN') {
        const re = reproject([p.x, p.y], p.crs, 'PLAN');
        return { x: re[0], y: re[1] };
      }
      return p;
    });

    const matrix = solveAffineTransform(srcPts, dstPlanPts);
    const bg = doc.background;
    bg.affineMatrix = matrix;
    bg.x = matrix[4];
    bg.y = matrix[5];
    bg.scale = Math.hypot(matrix[0], matrix[1]);
    bg.geoBounds = computeGeoBounds(matrix, bg.width || 1000, bg.height || 1000, 'PLAN');

    hist.push(doc, 'Calibrate Blueprint (3-Point)');
    persist();
    calibPoints = [];
    setTool({ kind: 'select' });
    refresh();
    toast('Blueprint calibrated using 3-point affine matrix.');
    return true;
  } catch (_err) {
    calibPoints = [];
    setTool({ kind: 'select' });
    redraw();
    toast('Collinear control points detected. Calibration failed.', true);
    return false;
  }
}

function setBackgroundAttribution(attr = {}) {
  if (!doc.background) return;
  doc.background.attributionText = attr.attributionText ?? doc.background.attributionText ?? null;
  doc.background.provider = attr.provider ?? doc.background.provider ?? null;
  doc.background.licenseUrl = attr.licenseUrl ?? doc.background.licenseUrl ?? null;
  doc.background.logoUrl = attr.logoUrl ?? doc.background.logoUrl ?? null;
  if (attr.isGeospatial !== undefined) doc.background.isGeospatial = attr.isGeospatial;
  hist.push(doc);
  persist();
  refresh();
}

function handleBlueprintImport(file, meta = {}) {
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

      const worldfileRaw =
        meta.worldfile ||
        meta.worldfileText ||
        meta.tfw ||
        meta.wld ||
        meta.worldfileContent ||
        null;
      const parsedWld = parseWorldfile(worldfileRaw);
      let affineMatrix;
      let sourceCRS = meta.crs || meta.sourceCRS || meta.epsg || doc.crs?.epsg || 'EPSG:4326';

      if (parsedWld) {
        affineMatrix = worldfileToAffineMatrix(parsedWld, sourceCRS, 'PLAN');
      } else if (Array.isArray(meta.affineMatrix) && meta.affineMatrix.length >= 6) {
        affineMatrix = meta.affineMatrix.slice(0, 6).map(Number);
      } else {
        affineMatrix = [1, 0, 0, 1, 0, 0];
      }

      const geoBounds =
        meta.geoBounds && typeof meta.geoBounds === 'object'
          ? meta.geoBounds
          : computeGeoBounds(affineMatrix, w, h, 'PLAN');

      doc.background = {
        dataUrl: finalDataUrl,
        x: affineMatrix[4],
        y: affineMatrix[5],
        scale: Math.hypot(affineMatrix[0], affineMatrix[1]),
        affineMatrix,
        geoBounds,
        worldfileCRS: sourceCRS,
        opacity: meta.opacity ?? 0.5,
        visible: meta.visible !== false,
        locked: !!meta.locked,
        width: w,
        height: h,
        attributionText: meta.attributionText || null,
        provider: meta.provider || null,
        licenseUrl: meta.licenseUrl || null,
        logoUrl: meta.logoUrl || null,
        isGeospatial: !!meta.isGeospatial || !!parsedWld,
      };
      hist.push(doc, 'Import Blueprint');
      persist();
      calibPoints = [];
      setTool({ kind: 'select' });
      refresh();
      toast('Blueprint image imported with spatial metadata.');
    };
    img.onerror = () => toast('Failed to load blueprint image.', true);
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function handleMapPresetSelect(presetKey) {
  if (!presetKey) {
    if (doc.background) {
      doc.background.presetKey = null;
      hist.push(doc, 'Clear Map Preset');
      persist();
      refresh();
    }
    return;
  }
  const bg = M.applyMapPreset(doc, presetKey);
  if (bg) {
    const preset = M.getMapPreset(presetKey);
    hist.push(doc, `Apply Map Preset: ${preset ? preset.name : presetKey}`);
    persist();
    refresh();
    toast(`Geospatial map provider preset applied: ${preset ? preset.name : presetKey}`);
  }
}

$('#bg-map-preset')?.addEventListener('change', (e) => {
  handleMapPresetSelect(e.target.value);
});
$('#gis-map-preset')?.addEventListener('change', (e) => {
  const presetKey = e.detail?.value ?? e.target?.value ?? '';
  handleMapPresetSelect(presetKey);
});

$('#import-blueprint')?.addEventListener('click', () => $('#blueprint-file')?.click());
$('#blueprint-dropzone-btn')?.addEventListener('click', () => $('#blueprint-file')?.click());
$('#blueprint-file')?.addEventListener('change', (e) => {
  handleBlueprintImport(e.target.files[0]);
  e.target.value = '';
});
$('#bg-visible')?.addEventListener('change', (e) => {
  if (doc.background) {
    doc.background.visible = e.target.checked;
    hist.push(doc, 'Toggle Blueprint Visibility');
    persist();
    redraw();
  }
});
updateRangeAriaValueText($('#bg-opacity'), 'percent');
$('#bg-opacity')?.addEventListener('input', (e) => {
  updateRangeAriaValueText(e.target, 'percent');
  if (doc.background) {
    doc.background.opacity = parseFloat(e.target.value);
    hist.push(doc, 'Change Blueprint Opacity');
    persist();
    redraw();
  }
});
$('#bg-opacity')?.addEventListener('change', (e) => {
  updateRangeAriaValueText(e.target, 'percent');
});
$('#bg-lock-btn')?.addEventListener('click', () => {
  if (doc.background) {
    doc.background.locked = !doc.background.locked;
    hist.push(doc, 'Toggle Blueprint Lock');
    persist();
    refresh();
  }
});
$('#bg-calibrate-btn')?.addEventListener('click', () => {
  calibPoints = [];
  setTool({ kind: 'calibrate' });
});
$('#bg-remove-btn')?.addEventListener('click', async () => {
  const confirmed = await confirmDialog({
    title: 'Remove Blueprint?',
    message: 'Remove blueprint image?',
    confirmLabel: 'Remove Blueprint',
    cancelLabel: 'Cancel',
    danger: true,
  });
  if (confirmed) {
    doc.background = null;
    hist.push(doc, 'Remove Blueprint');
    persist();
    setTool({ kind: 'select' });
    refresh();
    if ($('#bg-toolbar')?.hidden) {
      document.querySelector('[data-tool="select"]')?.focus?.();
    }
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

function openWelcomeWizard() {
  const dlg = $('#dlg-welcome');
  if (!dlg) return;
  if (typeof dlg.showModal === 'function') {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute('open', '');
    }
  } else {
    dlg.setAttribute('open', '');
  }
}

function closeWelcomeWizard() {
  const dlg = $('#dlg-welcome');
  if (!dlg) return;
  if (typeof dlg.close === 'function') {
    try {
      dlg.close();
    } catch {
      dlg.removeAttribute('open');
    }
  } else {
    dlg.removeAttribute('open');
  }
}

if (typeof document !== 'undefined') {
  const welcomeDlg = $('#dlg-welcome');
  if (welcomeDlg) {
    $('#welcome-btn-tour')?.addEventListener('click', () => {
      closeWelcomeWizard();
      onboardingTour.start();
    });

    $('#welcome-btn-templates')?.addEventListener('click', () => {
      closeWelcomeWizard();
      setOnboardingStatus('completed');
      openTemplatePicker();
    });

    $('#welcome-btn-blank')?.addEventListener('click', () => {
      closeWelcomeWizard();
      setOnboardingStatus('skipped');
    });

    $('#welcome-close')?.addEventListener('click', () => {
      closeWelcomeWizard();
      if (!getOnboardingStatus()) {
        setOnboardingStatus('skipped');
      }
    });

    welcomeDlg.addEventListener('close', () => {
      if (!getOnboardingStatus()) {
        setOnboardingStatus('skipped');
      }
    });
  }
}

// ------------------------------------------------------------- Command Palette & Shortcut Overlay
let selectedCmdIndex = 0;
let filteredCommands = [];

const RECENT_COMMANDS_KEY = 'homegen_recent_commands';
const MAX_RECENT_COMMANDS = 5;
let memoryRecentCommands = [];

function getRecentCommands() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          memoryRecentCommands = parsed;
          return parsed;
        }
      }
    }
  } catch {
    /* fallback to memory state */
  }
  return memoryRecentCommands;
}

function recordCommandExecution(cmdId) {
  if (!cmdId) return;
  let recent = getRecentCommands().filter((id) => id !== cmdId);
  recent.unshift(cmdId);
  if (recent.length > MAX_RECENT_COMMANDS) {
    recent = recent.slice(0, MAX_RECENT_COMMANDS);
  }
  memoryRecentCommands = recent;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(recent));
    }
  } catch {
    /* fallback to memory state on storage failure */
  }
}

function clearRecentCommands() {
  memoryRecentCommands = [];
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(RECENT_COMMANDS_KEY);
    }
  } catch {
    /* ignore storage removal failure */
  }
}

const COMMAND_REGISTRY = [
  // Tools
  {
    id: 'tool-select',
    name: 'Select Tool',
    category: 'Tools',
    shortcut: 'V',
    action: () => setTool({ kind: 'select' }),
  },
  {
    id: 'tool-eyedropper',
    name: 'Eyedropper Tool',
    category: 'Tools',
    shortcut: 'I',
    action: () => setTool({ kind: 'eyedropper' }),
  },
  {
    id: 'tool-erase',
    name: 'Erase Tool',
    category: 'Tools',
    shortcut: 'X',
    action: () => setTool({ kind: 'erase' }),
  },
  {
    id: 'gis-subsystem',
    name: 'GIS Site & Projection Controls',
    category: 'Tools',
    shortcut: '',
    action: () => openGISDialog(),
  },

  // Views
  {
    id: 'view-2d',
    name: '2D Plan View',
    category: 'Views',
    shortcut: '',
    action: () => $('#toolbar [data-view="2d"]')?.click(),
  },
  {
    id: 'view-3d',
    name: '3D View',
    category: 'Views',
    shortcut: '',
    action: () => $('#toolbar [data-view="3d"]')?.click(),
  },
  {
    id: 'view-eye',
    name: 'Eye Level View',
    category: 'Views',
    shortcut: '',
    action: () => $('#o-eye')?.click(),
  },
  {
    id: 'view-reset',
    name: 'Reset 3D View',
    category: 'Views',
    shortcut: '',
    action: () => $('#o-reset')?.click(),
  },
  {
    id: 'view-photo',
    name: 'Photoreal Render',
    category: 'Views',
    shortcut: '',
    action: () => $('#o-photo')?.click(),
  },
  {
    id: 'view-zoom-in',
    name: 'Zoom In',
    category: 'Views',
    shortcut: '+',
    action: () => $('#zoom-in')?.click(),
  },
  {
    id: 'view-zoom-out',
    name: 'Zoom Out',
    category: 'Views',
    shortcut: '-',
    action: () => $('#zoom-out')?.click(),
  },
  {
    id: 'view-fit',
    name: 'Fit View to Screen',
    category: 'Views',
    shortcut: '',
    action: () => $('#fit')?.click(),
  },

  // Sidebar Tabs
  {
    id: 'tab-build',
    name: 'Build Tab',
    category: 'Sidebar Tabs',
    shortcut: '',
    action: () => $('#tabs [data-tab="build"]')?.click(),
  },
  {
    id: 'tab-buy',
    name: 'Buy Tab',
    category: 'Sidebar Tabs',
    shortcut: '',
    action: () => $('#tabs [data-tab="buy"]')?.click(),
  },
  {
    id: 'tab-paint',
    name: 'Paint Tab',
    category: 'Sidebar Tabs',
    shortcut: '',
    action: () => $('#tabs [data-tab="paint"]')?.click(),
  },
  {
    id: 'tab-kits',
    name: 'Kits Tab',
    category: 'Sidebar Tabs',
    shortcut: '',
    action: () => $('#tabs [data-tab="kits"]')?.click(),
  },

  // File Operations
  {
    id: 'file-new',
    name: 'New Plan',
    category: 'File Operations',
    shortcut: '',
    action: () => $('#new')?.click(),
  },
  {
    id: 'file-sample',
    name: 'Sample Home',
    category: 'File Operations',
    shortcut: '',
    action: () => $('#sample')?.click(),
  },
  {
    id: 'file-save',
    name: 'Save Plan',
    category: 'File Operations',
    shortcut: '',
    action: () => $('#save')?.click(),
  },
  {
    id: 'file-load',
    name: 'Open Plan',
    category: 'File Operations',
    shortcut: '',
    action: () => $('#load')?.click(),
  },
  {
    id: 'file-import-bp',
    name: 'Import Blueprint Image',
    category: 'File Operations',
    shortcut: '',
    action: () => $('#import-blueprint')?.click(),
  },
  {
    id: 'file-undo',
    name: 'Undo Action',
    category: 'File Operations',
    shortcut: 'Ctrl+Z',
    action: () => $('#undo')?.click(),
  },
  {
    id: 'file-redo',
    name: 'Redo Action',
    category: 'File Operations',
    shortcut: 'Ctrl+Y',
    action: () => $('#redo')?.click(),
  },

  // Export
  {
    id: 'export-png',
    name: 'Export PNG Image',
    category: 'Export',
    shortcut: '',
    action: () => $('#png')?.click(),
  },
  {
    id: 'export-svg',
    name: 'Export SVG Vector Sheet',
    category: 'Export',
    shortcut: '',
    action: () => $('#svg-btn')?.click(),
  },
  {
    id: 'print-sheet',
    name: 'Print Sheet',
    category: 'Export',
    shortcut: '',
    action: () => $('#print-btn')?.click(),
  },
  {
    id: 'export-pdf',
    name: 'Export Scaled Vector PDF',
    category: 'Export',
    shortcut: '',
    action: () => $('#export-pdf')?.click(),
  },
  {
    id: 'export-csv',
    name: 'Export CSV Bill of Materials',
    category: 'Export',
    shortcut: '',
    action: () => $('#export-csv')?.click(),
  },
  {
    id: 'export-dxf',
    name: 'Export DXF CAD Exchange Format',
    category: 'Export',
    shortcut: '',
    action: () => $('#export-dxf')?.click(),
  },
  {
    id: 'export-report',
    name: 'Code Compliance Report',
    category: 'Export',
    shortcut: '',
    action: () => $('#report')?.click(),
  },
  {
    id: 'export-geojson',
    name: 'Export GeoJSON Feature Collection',
    category: 'Export',
    shortcut: '',
    action: () => {
      const geojson = exportGeoJSON(doc, doc.crs?.epsg || 'EPSG:4326');
      download(
        `${doc.name.replace(/\W+/g, '_') || 'plan'}.geojson`,
        JSON.stringify(geojson, null, 2),
        'application/geo+json'
      );
      toast(`Exported GeoJSON feature collection in ${doc.crs?.epsg || 'EPSG:4326'}.`);
    },
  },

  // Map Presets
  {
    id: 'map-preset-osm',
    name: 'Map Preset: OpenStreetMap',
    category: 'GIS & Map Layers',
    shortcut: '',
    action: () => handleMapPresetSelect('openstreetmap'),
  },
  {
    id: 'map-preset-carto',
    name: 'Map Preset: CARTO Positron',
    category: 'GIS & Map Layers',
    shortcut: '',
    action: () => handleMapPresetSelect('carto-positron'),
  },
  {
    id: 'map-preset-usgs',
    name: 'Map Preset: USGS Topo',
    category: 'GIS & Map Layers',
    shortcut: '',
    action: () => handleMapPresetSelect('usgs-topo'),
  },
  {
    id: 'map-preset-sentinel',
    name: 'Map Preset: Copernicus Sentinel',
    category: 'GIS & Map Layers',
    shortcut: '',
    action: () => handleMapPresetSelect('copernicus-sentinel'),
  },
  {
    id: 'import-geojson',
    name: 'Import GeoJSON Spatial Dataset',
    category: 'File Operations',
    shortcut: '',
    action: () => $('#file')?.click(),
  },

  // Help & Settings
  {
    id: 'help-shortcuts',
    name: 'Keyboard Shortcuts Cheat Sheet',
    category: 'Help',
    shortcut: '?',
    action: () => openShortcutOverlay(),
  },
  {
    id: 'help-tour',
    name: 'Start Guided Onboarding Tour',
    category: 'Help',
    shortcut: '',
    action: () => onboardingTour.start(),
  },
  {
    id: 'help-welcome',
    name: 'Show Welcome Wizard',
    category: 'Help',
    shortcut: '',
    action: () => openWelcomeWizard(),
  },
  {
    id: 'help-reset-onboarding',
    name: 'Reset Onboarding Status',
    category: 'Help',
    shortcut: '',
    action: () => {
      resetOnboardingStatus();
      toast('Onboarding status reset.');
    },
  },
  {
    id: 'setting-autocomply',
    name: 'Toggle Auto-Comply',
    category: 'Settings',
    shortcut: '',
    action: () => $('#auto')?.click(),
  },
];

function openCommandPalette() {
  const dlg = $('#command-palette');
  if (!dlg) return;
  const input = $('#cmd-search');
  selectedCmdIndex = 0;
  if (input) {
    input.value = '';
    input.setAttribute('aria-expanded', 'true');
  }
  renderCommandList('');
  if (typeof dlg.showModal === 'function') {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute('open', '');
    }
  } else {
    dlg.setAttribute('open', '');
  }
  dlg.open = true;
  if (input) input.focus();
}

function closeCommandPalette() {
  const dlg = $('#command-palette');
  if (!dlg) return;
  const input = $('#cmd-search');
  if (input) {
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  if (typeof dlg.close === 'function') {
    try {
      dlg.close();
    } catch {
      dlg.removeAttribute('open');
    }
  } else {
    dlg.removeAttribute('open');
  }
  dlg.open = false;
}

function setShortcutElementHidden(el, isHidden) {
  if (!el) return;
  el.hidden = isHidden;
  if (isHidden) {
    if (typeof el.setAttribute === 'function') el.setAttribute('hidden', '');
  } else if (typeof el.removeAttribute === 'function') {
    el.removeAttribute('hidden');
  }
}

function getShortcutRowSearchText(row) {
  if (!row) return '';
  if (row.children && row.children.length > 0) {
    const parts = Array.from(row.children).map((child) => child.textContent || '');
    return `${parts.join(' ')} ${row.textContent || ''}`.toLowerCase();
  }
  return (row.textContent || '').toLowerCase();
}

export function filterShortcuts(query = '') {
  const dlg = $('#shortcut-overlay');
  if (!dlg) return 0;
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  const compactQuery = q.replace(/\s*([+/])\s*/g, '$1').replace(/\s+/g, ' ');
  const groups =
    typeof dlg.querySelectorAll === 'function'
      ? Array.from(dlg.querySelectorAll('.shortcut-group'))
      : [];
  let totalVisible = 0;

  groups.forEach((group) => {
    const rows =
      typeof group.querySelectorAll === 'function'
        ? Array.from(group.querySelectorAll('.shortcut-row'))
        : [];
    let groupVisibleCount = 0;
    rows.forEach((row) => {
      const rawText = getShortcutRowSearchText(row);
      const compactText = rawText.replace(/\s*([+/])\s*/g, '$1').replace(/\s+/g, ' ');
      const matches = !q || rawText.includes(q) || compactText.includes(compactQuery);
      setShortcutElementHidden(row, !matches);
      if (matches) {
        groupVisibleCount += 1;
        totalVisible += 1;
      }
    });
    setShortcutElementHidden(group, Boolean(q) && groupVisibleCount === 0);
  });

  if (groups.length === 0 && typeof dlg.querySelectorAll === 'function') {
    const rows = Array.from(dlg.querySelectorAll('.shortcut-row'));
    rows.forEach((row) => {
      const rawText = getShortcutRowSearchText(row);
      const compactText = rawText.replace(/\s*([+/])\s*/g, '$1').replace(/\s+/g, ' ');
      const matches = !q || rawText.includes(q) || compactText.includes(compactQuery);
      setShortcutElementHidden(row, !matches);
      if (matches) totalVisible += 1;
    });
  }

  const gridEl =
    typeof dlg.querySelector === 'function' ? dlg.querySelector('.shortcut-grid') : null;
  if (gridEl) {
    setShortcutElementHidden(gridEl, Boolean(q) && totalVisible === 0);
  }

  const noResultsEl =
    $('#shortcut-no-results') ||
    (typeof dlg.querySelector === 'function' ? dlg.querySelector('#shortcut-no-results') : null);
  if (noResultsEl) {
    setShortcutElementHidden(noResultsEl, !(Boolean(q) && totalVisible === 0));
  }

  return totalVisible;
}

export function openShortcutOverlay() {
  const dlg = $('#shortcut-overlay');
  if (!dlg) return;
  syncShortcutToggleUI(isSingleKeyShortcutDisabled());
  const searchInput =
    $('#shortcut-search') ||
    (typeof dlg.querySelector === 'function' ? dlg.querySelector('#shortcut-search') : null);
  if (searchInput) {
    searchInput.value = '';
  }
  filterShortcuts('');
  if (typeof dlg.showModal === 'function') {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute('open', '');
    }
  } else {
    dlg.setAttribute('open', '');
  }
  dlg.open = true;
  if (searchInput && typeof searchInput.focus === 'function') {
    searchInput.focus();
  }
}

export function closeShortcutOverlay() {
  const dlg = $('#shortcut-overlay');
  if (!dlg) return;
  if (typeof dlg.close === 'function') {
    try {
      dlg.close();
    } catch {
      dlg.removeAttribute('open');
    }
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

  const recentIds = getRecentCommands();
  filteredCommands.sort((a, b) => {
    const rankA = recentIds.indexOf(a.id);
    const rankB = recentIds.indexOf(b.id);
    if (rankA !== -1 && rankB !== -1) {
      return rankA - rankB;
    }
    if (rankA !== -1) return -1;
    if (rankB !== -1) return 1;
    return 0;
  });

  if (selectedCmdIndex >= filteredCommands.length) {
    selectedCmdIndex = Math.max(0, filteredCommands.length - 1);
  }

  const searchInput = $('#cmd-search');

  if (filteredCommands.length === 0) {
    listEl.innerHTML = `<li class="cmd-no-results">No matching commands found</li>`;
    if (searchInput) {
      searchInput.removeAttribute('aria-activedescendant');
    }
    return;
  }

  listEl.innerHTML = filteredCommands
    .map((cmd, idx) => {
      const isSelected = idx === selectedCmdIndex;
      const optionId = `cmd-option-${idx}`;
      const kbdHtml = cmd.shortcut
        ? `<span class="keys"><k-kbd>${esc(cmd.shortcut)}</k-kbd></span>`
        : '';
      return `<li id="${optionId}" data-cmd-idx="${idx}" class="${isSelected ? 'selected' : ''}" role="option" aria-selected="${isSelected ? 'true' : 'false'}">
        <div class="cmd-item-main">
          <span class="cmd-name">${esc(cmd.name)}</span>
          <span class="cmd-category">${esc(cmd.category)}</span>
        </div>
        ${kbdHtml}
      </li>`;
    })
    .join('');

  if (searchInput) {
    if (
      filteredCommands.length > 0 &&
      selectedCmdIndex >= 0 &&
      selectedCmdIndex < filteredCommands.length
    ) {
      searchInput.setAttribute('aria-activedescendant', `cmd-option-${selectedCmdIndex}`);
    } else {
      searchInput.removeAttribute('aria-activedescendant');
    }
  }

  listEl.querySelectorAll('li[data-cmd-idx]').forEach((li) => {
    li.addEventListener('click', () => {
      const idx = parseInt(li.dataset.cmdIdx, 10);
      if (filteredCommands[idx]) {
        const cmd = filteredCommands[idx];
        recordCommandExecution(cmd.id);
        closeCommandPalette();
        cmd.action();
      }
    });
  });

  const activeLi = listEl.querySelector('li.selected');
  if (activeLi && typeof activeLi.scrollIntoView === 'function') {
    activeLi.scrollIntoView({ block: 'nearest' });
  }
}

function initCommandPaletteUI() {
  const dlg = $('#command-palette');
  if (dlg) {
    dlg.addEventListener('close', () => {
      closeCommandPalette();
    });
  }
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
          recordCommandExecution(cmd.id);
          closeCommandPalette();
          cmd.action();
        }
      }
    });
  }
}

function initShortcutOverlayUI() {
  const toggleEl = $('#disable-single-key-shortcuts');
  if (toggleEl) {
    syncShortcutToggleUI(isSingleKeyShortcutDisabled());
    toggleEl.addEventListener?.('change', (e) => {
      const next = Boolean(e?.target ? e.target.checked : toggleEl.checked);
      setSingleKeyShortcutDisabled(next);
    });
  }
  const dlg = $('#shortcut-overlay');
  const searchInput =
    $('#shortcut-search') ||
    (dlg && typeof dlg.querySelector === 'function' ? dlg.querySelector('#shortcut-search') : null);
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val =
        e && e.target && typeof e.target.value === 'string' ? e.target.value : searchInput.value;
      filterShortcuts(val);
    });
  }
}

// test hook for automated browser checks
if (typeof window !== 'undefined')
  window.__homegen = {
    view3d,
    announceZoom,
    zoomAt,
    fit,
    toast,
    dismissToast,
    setLevel,
    formRow,
    formatNumericInput,
    renderInspector,
    get doc() {
      return doc;
    },
    get view() {
      return { ...view };
    },
    get tool() {
      return tool;
    },
    get report() {
      return report;
    },
    apply,
    nearestWall,
    sampleHome,
    openTemplatePicker,
    selectTemplate,
    TEMPLATES,
    setTool,
    parseRoomDimensionsInput,
    select,
    isSelected,
    getSelectionList,
    navigateSpatial,
    moveSelectedSpatial,
    getSpatialElements,
    interaction,
    syncDraftingCurveHud,
    parseCurveHudInput,
    bulgeFromRadius,
    radiusFromBulge,
    bulgeFromSagitta,
    sagittaFromBulge,
    renderSnapToggles,
    snappingBridge,
    setExplicitWallAngleFromHud,
    applyConstraintHandleAngleFromHud,
    updateWallAngleHud,
    generatePDF,
    applyCalibration,
    apply3PointCalibration,
    handleBlueprintImport,
    isValidBlueprintImageFile,
    drawOverlay,
    get isCanvasDragOver() {
      return isCanvasDragOver;
    },
    solveAffineTransform,
    parseWorldfile,
    computeGeoBounds,
    worldfileToAffineMatrix,
    setBackgroundAttribution,
    renderBgToolbar,
    renderCompliance,
    renderViolationItem,
    complianceScene,
    COMMAND_REGISTRY,
    getRecentCommands,
    recordCommandExecution,
    clearRecentCommands,
    openCommandPalette,
    closeCommandPalette,
    openShortcutOverlay,
    closeShortcutOverlay,
    SINGLE_KEY_SHORTCUTS_KEY,
    isSingleKeyShortcutDisabled,
    setSingleKeyShortcutDisabled,
    filterShortcuts,
    renderCommandList,
    trapFocus,
    confirmDialog,
    toggleHistoryPopover,
    parseElevationRaster,
    computeContoursAsync,
    ElevationGrid,
    applyElevationSettings,
    onboardingTour,
    openWelcomeWizard,
    closeWelcomeWizard,
    exportGeoJSON,
    importGeoJSON,
    reproject,
    getOnboardingStatus,
    setOnboardingStatus,
    resetOnboardingStatus,
    GISBridge,
    projectGeoJSON,
    computeVariableBuffers,
    ensureSpatialIndex,
    loadGISSubsystem,
    setGISSegmentSetback,
    openGISDialog,
    closeGISDialog,
    renderGISSegments,
    SAMPLE_MUNICIPAL_GIS,
    PLAN_TIER_RANKS,
    getCurrentPlanTier,
    initExportModalTierState,
    openPlanUpgradePrompt,
    bindUpgradeTriggerLinks,
    openWallHud,
    openRoomWallHud,
    closeWallHud,
    commitWallHudInput,
    previewWallHudInput,
    updateWallHudPosition,
    activateWallHudByTab,
    getWallHudState: () => ({ ...wallHudState }),
    getView: () => ({ ...view }),
    setView: (nextView) => {
      Object.assign(view, nextView);
      redraw();
    },
    hist,
    bindHeaderQuotaBadge,
    defaultRateLimiter,
    getOpeningUnitMode,
    setOpeningUnitMode,
    commitOpeningOffsetInput,
    openOpeningHudEditor,
    closeOpeningHudEditor,
    computeOpeningOffsetHUD,
    drawOpeningOffsetHUD,
    hitTestOpeningHUD,
    announceCatalogResults,
    clearCatalogAnnouncement,
    renderCatalogPanel,
    renderPalette,
    switchTab,
    getCatalogFilters,
    setCatalogFilters,
    resetCatalogFilters,
  };
