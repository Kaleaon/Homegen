// Canvas plan renderer.
import {
  WT,
  WALLS,
  LEGACY_WALL_NAMES,
  wallSeg,
  wallLength,
  wallPoint,
  interior,
  footprint,
  floorAreaSqFt,
  getRoomPoints,
  reproject,
} from './geometry.js';
import { isRegisteredEPSG, normalizeCode } from './epsgRegistry.js';
import { ROOM_TYPES, ITEM_BY_ID, OPENING_BY_ID, WALL_BY_ID, FLOOR_BY_ID } from './catalog.js';
import { patternFor } from './patterns.js';
// import { openingInfo } from './codes.js';
import { resolveWindowStyle } from './presetRegistry.js';
import { getToken } from './kthemeTokens.js';
import { computeMarchingSquares } from './elevationEngine.js';
import { formatFractionalInches } from './dimensionFormatter.js';

export const fmtLen = (inches, options) => formatFractionalInches(inches, options);

let bgCache = { dataUrl: null, img: null };
const logoCache = new Map();

function getLogoImage(logoUrl, onLoaded) {
  if (!logoUrl) return null;
  if (logoCache.has(logoUrl)) return logoCache.get(logoUrl);
  const img = new Image();
  logoCache.set(logoUrl, img);
  img.onload = () => {
    if (onLoaded) onLoaded();
  };
  img.src = logoUrl;
  return img;
}

function getBgImage(bg, onLoaded) {
  if (!bg || !bg.dataUrl) return null;
  if (bgCache.dataUrl === bg.dataUrl && bgCache.img) {
    return bgCache.img;
  }
  const img = new Image();
  bgCache = { dataUrl: bg.dataUrl, img };
  img.onload = () => {
    if (onLoaded) onLoaded();
  };
  img.src = bg.dataUrl;
  return img;
}

function drawWarpedTriangle(ctx, img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  const delta = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
  if (Math.abs(delta) < 1e-6) {
    ctx.restore();
    return;
  }

  const a = (x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1)) / delta;
  const b = (y0 * (v1 - v2) - v0 * (y1 - y2) + (y1 * v2 - y2 * v1)) / delta;
  const c = (u0 * (x1 - x2) - x0 * (u1 - u2) + (x0 * u1 - x1 * u0)) / delta;
  const d = (u0 * (y1 - y2) - y0 * (u1 - u2) + (y0 * u1 - y1 * u0)) / delta;
  const e =
    (u0 * (v1 * x2 - v2 * x1) - v0 * (u1 * x2 - u2 * x1) + x0 * (u1 * v2 - u2 * v1)) / delta;
  const f =
    (u0 * (v1 * y2 - v2 * y1) - v0 * (u1 * y2 - u2 * y1) + y0 * (u1 * v2 - u2 * v1)) / delta;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function drawQuadmeshWarpedImage(ctx, img, quadmesh) {
  const rows = quadmesh.rows || Math.round(Math.sqrt(quadmesh.grid?.length || 0));
  const cols = quadmesh.cols || rows;
  const grid = quadmesh.grid || quadmesh;

  if (!Array.isArray(grid) || grid.length < 4 || !rows || !cols) return;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const p0 = grid[r * cols + c];
      const p1 = grid[r * cols + c + 1];
      const p2 = grid[(r + 1) * cols + c + 1];
      const p3 = grid[(r + 1) * cols + c];

      if (!p0 || !p1 || !p2 || !p3) continue;

      drawWarpedTriangle(
        ctx,
        img,
        p0.u,
        p0.v,
        p1.u,
        p1.v,
        p2.u,
        p2.v,
        p0.x,
        p0.y,
        p1.x,
        p1.y,
        p2.x,
        p2.y
      );
      drawWarpedTriangle(
        ctx,
        img,
        p0.u,
        p0.v,
        p2.u,
        p2.v,
        p3.u,
        p3.v,
        p0.x,
        p0.y,
        p2.x,
        p2.y,
        p3.x,
        p3.y
      );
    }
  }
}

function drawBackground(ctx, bg, onLoaded, view = { scale: 1, ox: 0, oy: 0 }, opts = {}) {
  if (!bg || !bg.visible || !bg.dataUrl) return;
  const img = getBgImage(bg, onLoaded);
  if (!img || !img.complete || !img.naturalWidth) return;
  ctx.save();
  ctx.globalAlpha = bg.opacity ?? 0.5;
  const imgW = bg.width || img.naturalWidth;
  const imgH = bg.height || img.naturalHeight;
  const w = imgW * (bg.scale ?? 1);
  const h = imgH * (bg.scale ?? 1);

  if (bg.quadmesh || bg.mesh) {
    drawQuadmeshWarpedImage(ctx, img, bg.quadmesh || bg.mesh);
  } else {
    let m = bg.affineMatrix || bg.matrix || bg.transform;
    if (!m || !Array.isArray(m) || m.length < 6) {
      const scale = bg.scale ?? 1;
      const x = bg.x ?? 0;
      const y = bg.y ?? 0;
      m = [scale, 0, 0, scale, x, y];
    }

    const [a, b, c, d, e, f] = m.map(Number);
    const isFiniteMatrix = [a, b, c, d, e, f].every(Number.isFinite);
    const det = a * d - b * c;
    const isNonDegenerate = Math.abs(det) >= 1e-12;

    if (isFiniteMatrix && isNonDegenerate) {
      const targetCRS = opts.activeCRS || opts.crs || 'PLAN';
      const sourceCRS = bg.worldfileCRS || bg.sourceCRS || bg.crs || 'PLAN';

      let effA = a,
        effB = b,
        effC = c,
        effD = d,
        effE = e,
        effF = f;

      if (sourceCRS !== targetCRS && sourceCRS !== 'PLAN') {
        try {
          const p0 = reproject([e, f], sourceCRS, targetCRS);
          const p1 = reproject([a + e, b + f], sourceCRS, targetCRS);
          const p2 = reproject([c + e, d + f], sourceCRS, targetCRS);

          if (p0 && p1 && p2 && Array.isArray(p0) && Array.isArray(p1) && Array.isArray(p2)) {
            effE = p0[0];
            effF = p0[1];
            effA = p1[0] - p0[0];
            effB = p1[1] - p0[1];
            effC = p2[0] - p0[0];
            effD = p2[1] - p0[1];
          }
        } catch (_err) {
          // Keep original effA..effF on reprojection fault
        }
      }

      ctx.transform(effA, effB, effC, effD, effE, effF);
      ctx.drawImage(img, 0, 0, imgW, imgH);
    } else {
      // Fallback to standard 2D translation if affine matrix values are invalid or degenerate
      ctx.drawImage(img, bg.x ?? 0, bg.y ?? 0, w, h);
    }
  }

  ctx.restore();

  // Render mandatory attribution badge when attribution/geospatial metadata is active
  let attrText = bg.attributionText;
  if (!attrText && bg.provider) {
    attrText = `Map Data © ${bg.provider}`;
  } else if (!attrText && bg.isGeospatial) {
    attrText = 'Geospatial Background Layer';
  }
  if (attrText && bg.licenseUrl && !attrText.includes(bg.licenseUrl)) {
    attrText += ` · ${bg.licenseUrl}`;
  }

  if (attrText) {
    ctx.save();
    const dpr = opts.dpr || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1.0;

    const fontSize = 11 * dpr;
    ctx.font = `${fontSize}px sans-serif`;

    const textMetrics = ctx.measureText(attrText);
    const logoImg = bg.logoUrl ? getLogoImage(bg.logoUrl, onLoaded) : null;
    const hasLogo = logoImg && logoImg.complete && logoImg.naturalWidth > 0;
    const logoWidth = hasLogo ? 16 * dpr : 0;
    const paddingX = 8 * dpr;
    const paddingY = 5 * dpr;

    const badgeWidth = textMetrics.width + paddingX * 2 + (hasLogo ? logoWidth + 4 * dpr : 0);
    const badgeHeight = fontSize + paddingY * 2;

    const imgRight = ((bg.x ?? 0) + w) * (view.scale || 1) * dpr + (view.ox || 0) * dpr;
    const imgBottom = ((bg.y ?? 0) + h) * (view.scale || 1) * dpr + (view.oy || 0) * dpr;
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;

    const margin = 10 * dpr;
    let badgeRight = Math.min(imgRight - margin, canvasW - margin);
    let badgeBottom = Math.min(imgBottom - margin, canvasH - margin);
    badgeRight = Math.max(badgeRight, badgeWidth + margin);
    badgeBottom = Math.max(badgeBottom, badgeHeight + margin);

    const badgeX = badgeRight - badgeWidth;
    const badgeY = badgeBottom - badgeHeight;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 * dpr;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4 * dpr);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
      ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    }

    let currentX = badgeX + paddingX;
    if (hasLogo) {
      const logoY = badgeY + (badgeHeight - 14 * dpr) / 2;
      ctx.drawImage(logoImg, currentX, logoY, 14 * dpr, 14 * dpr);
      currentX += logoWidth + 4 * dpr;
    }

    ctx.fillStyle = '#f8fafc';
    ctx.textBaseline = 'middle';
    ctx.fillText(attrText, currentX, badgeY + badgeHeight / 2);

    ctx.restore();
  }
}

export function draw(ctx, state, view, opts = {}) {
  const { width: w, height: h } = ctx.canvas;
  const dpr = opts.dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = getToken('--ktheme-bg', '#f7f5f0');
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr);
  if (state.background)
    drawBackground(ctx, state.background, opts.onLoaded || opts.redraw, view, opts);
  drawGrid(ctx, view, w / dpr, h / dpr, opts);
  if (state.elevationGrid) drawContours(ctx, state, view, opts);

  const bad = opts.bad || new Set(); // ids of violating rooms/items/openings
  for (const u of opts.under || []) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#6b6254';
    ctx.fillRect(u.x, u.y, u.w, u.h);
    ctx.strokeStyle = '#3c3a38';
    ctx.lineWidth = WT;
    ctx.strokeRect(u.x, u.y, u.w, u.h);
    ctx.restore();
  }
  for (const room of state.rooms) drawFloor(ctx, room, opts, bad);
  for (const room of state.rooms) drawItems(ctx, room, bad, opts.selection, true);
  for (const room of state.rooms) drawWalls(ctx, state, room, bad, opts);
  for (const room of state.rooms) drawItems(ctx, room, bad, opts.selection, false);
  for (const room of state.rooms) drawLabel(ctx, room, view);
  if (opts.selection) drawSelection(ctx, state, opts.selection, view);
  if (opts.autoFixDiffs && opts.autoFixDiffs.length)
    drawDiffHighlights(ctx, state, opts.autoFixDiffs, view, opts);
  if (opts.complianceScene) drawComplianceScene(ctx, opts.complianceScene, view);
  if (opts.snapResult) drawSnapGuides(ctx, opts.snapResult, view);
  else if (opts.snappingBridge?.getActiveSnap())
    drawSnapGuides(ctx, opts.snappingBridge.getActiveSnap(), view);
  if (opts.overlay) opts.overlay(ctx, view);
  if (
    opts.showSpatialOverlay !== false &&
    (opts.showSpatialOverlay ||
      opts.activeCRS ||
      opts.crs ||
      state?.crs ||
      state?.site?.crs ||
      state?.background?.isGeospatial ||
      state?.background?.worldfileCRS)
  ) {
    drawSpatialReferenceOverlay(ctx, state, view, opts);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.showRulers !== false) {
    drawRulers(ctx, view, w / dpr, h / dpr, opts);
  }
}

export const RULER_SIZE = 22;

export function formatRulerCoord(inches) {
  if (!Number.isFinite(inches) || Math.abs(inches) < 1e-6) return "0'";
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  const rounded = Math.round(abs * 100) / 100;
  const wholeFeet = Math.floor((rounded + 1e-6) / 12);
  const remInches = Math.round((rounded - wholeFeet * 12) * 10) / 10;
  if (remInches >= 12 - 1e-6) {
    return `${sign}${wholeFeet + 1}'`;
  }
  if (wholeFeet === 0) {
    return `${sign}${remInches}"`;
  }
  if (remInches < 1e-6) {
    return `${sign}${wholeFeet}'`;
  }
  return `${sign}${wholeFeet}' ${remInches}"`;
}

export function computeRulerSteps(scale, opts = {}) {
  const rawUnit =
    opts.gridSettings?.unitSize ??
    opts.unitSize ??
    opts.snappingBridge?.interaction?.gridSettings?.unitSize ??
    6;
  const rawMinor = opts.gridSettings?.minorGrid ?? opts.minorGrid ?? 12;
  const rawMajor = opts.gridSettings?.majorGrid ?? opts.majorGrid ?? 60;

  const unitSize = Number.isFinite(rawUnit) && rawUnit > 0 ? rawUnit : 6;
  const minorGrid = Number.isFinite(rawMinor) && rawMinor > 0 ? rawMinor : 12;
  const majorGrid = Number.isFinite(rawMajor) && rawMajor > 0 ? rawMajor : 60;

  const candidates = [];
  if (unitSize * scale >= 36) {
    candidates.push(1);
    if (unitSize >= 4 && Number.isInteger(unitSize / 2)) {
      candidates.push(unitSize / 2);
    }
  }
  candidates.push(
    unitSize,
    minorGrid,
    majorGrid,
    majorGrid * 2,
    majorGrid * 5,
    majorGrid * 10,
    majorGrid * 20,
    majorGrid * 50,
    majorGrid * 100
  );

  const uniqueSteps = [...new Set(candidates.filter((s) => Number.isFinite(s) && s > 0))].sort(
    (a, b) => a - b
  );

  const minLabelPx = 48;
  const minTickPx = 6;

  let maxCandidate = uniqueSteps[uniqueSteps.length - 1] || 60;
  const scaleMultipliers = [2, 2.5, 2];
  let multIdx = 0;
  while (maxCandidate * scale < minLabelPx && maxCandidate < 1e9) {
    maxCandidate = Math.round(maxCandidate * scaleMultipliers[multIdx % 3]);
    uniqueSteps.push(maxCandidate);
    multIdx++;
  }

  const labelStep = uniqueSteps.find((s) => s * scale >= minLabelPx) || maxCandidate;
  const subCandidates = uniqueSteps.filter((s) => s < labelStep && s * scale >= minTickPx);
  const minorStep = subCandidates.length > 0 ? subCandidates[subCandidates.length - 1] : null;
  const subStep = subCandidates.length > 1 ? subCandidates[subCandidates.length - 2] : null;

  return { labelStep, minorStep, subStep, unitSize, minorGrid, majorGrid };
}

function isMultipleOf(val, step) {
  if (!step) return false;
  const ratio = val / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

export function drawRulers(ctx, view, cw, ch, opts = {}) {
  if (cw !== undefined && typeof cw === 'object') {
    opts = cw;
    cw = undefined;
    ch = undefined;
  }
  if (!ctx || !view || !Number.isFinite(view.scale) || view.scale <= 0) return;
  if (!Number.isFinite(view.ox) || !Number.isFinite(view.oy)) return;

  const dpr = opts.dpr || 1;
  const width = cw ?? (ctx.canvas ? ctx.canvas.width / dpr : NaN);
  const height = ch ?? (ctx.canvas ? ctx.canvas.height / dpr : NaN);
  const rulerSize = opts.rulerSize ?? RULER_SIZE;

  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  if (width <= rulerSize || height <= rulerSize) return;

  const { labelStep, minorStep, subStep } = computeRulerSteps(view.scale, opts);

  const surfaceColor = getToken('--ktheme-bg-surface', '#1a1c25');
  const elevatedColor = getToken('--ktheme-bg-elevated', '#22252f');
  const borderColor = getToken('--ktheme-border', '#2e3140');
  const subTickColor = getToken('--ktheme-border-light', '#3b3f50');
  const minorTickColor = getToken('--ktheme-text-dim', '#6b7280');
  const majorTickColor = getToken('--ktheme-text-muted', '#9ca3af');
  const textColor = getToken('--ktheme-text', '#f3f4f6');
  const accentColor = getToken('--ktheme-accent', '#818cf8');
  const monoFont = getToken('--font-family-mono', 'monospace');

  const hover = opts.hover;
  const hasHover = Boolean(hover) && Number.isFinite(hover.x) && Number.isFinite(hover.y);
  const hx = hasHover ? hover.x * view.scale + view.ox : NaN;
  const hy = hasHover ? hover.y * view.scale + view.oy : NaN;
  const hoverXInBounds = hasHover && hx >= rulerSize && hx <= width;
  const hoverYInBounds = hasHover && hy >= rulerSize && hy <= height;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Cursor projection guide lines across interior canvas viewport
  if (hoverXInBounds || hoverYInBounds) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    if (ctx.setLineDash) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (hoverXInBounds) {
      ctx.moveTo(hx, rulerSize);
      ctx.lineTo(hx, height);
    }
    if (hoverYInBounds) {
      ctx.moveTo(rulerSize, hy);
      ctx.lineTo(width, hy);
    }
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.restore();
  }

  // 2. Top and left perimeter ruler bar backgrounds
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = surfaceColor;
  ctx.fillRect(rulerSize, 0, width - rulerSize, rulerSize);
  ctx.fillRect(0, rulerSize, rulerSize, height - rulerSize);
  ctx.globalAlpha = 1;

  const xMin = (rulerSize - view.ox) / view.scale;
  const xMax = (width - view.ox) / view.scale;
  const yMin = (rulerSize - view.oy) / view.scale;
  const yMax = (height - view.oy) / view.scale;

  // 3. Top horizontal ruler ticks & coordinate labels (restricted to [rulerSize, width])
  ctx.save();
  if (ctx.clip && ctx.rect) {
    ctx.beginPath();
    ctx.rect(rulerSize, 0, width - rulerSize, rulerSize);
    ctx.clip();
  }

  if (subStep) {
    ctx.strokeStyle = subTickColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startIdx = Math.ceil(xMin / subStep - 1e-9);
    const endIdx = Math.floor(xMax / subStep + 1e-9);
    for (let i = startIdx; i <= endIdx; i++) {
      const wx = i * subStep;
      if (isMultipleOf(wx, minorStep) || isMultipleOf(wx, labelStep)) continue;
      const sx = wx * view.scale + view.ox;
      if (sx < rulerSize || sx > width) continue;
      ctx.moveTo(sx, rulerSize - 4.5);
      ctx.lineTo(sx, rulerSize);
    }
    ctx.stroke();
  }

  if (minorStep) {
    ctx.strokeStyle = minorTickColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startIdx = Math.ceil(xMin / minorStep - 1e-9);
    const endIdx = Math.floor(xMax / minorStep + 1e-9);
    for (let i = startIdx; i <= endIdx; i++) {
      const wx = i * minorStep;
      if (isMultipleOf(wx, labelStep)) continue;
      const sx = wx * view.scale + view.ox;
      if (sx < rulerSize || sx > width) continue;
      ctx.moveTo(sx, rulerSize - 8);
      ctx.lineTo(sx, rulerSize);
    }
    ctx.stroke();
  }

  {
    ctx.strokeStyle = majorTickColor;
    ctx.lineWidth = 1;
    ctx.font = `500 9.5px ${monoFont}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    const startIdx = Math.ceil(xMin / labelStep - 1e-9);
    const endIdx = Math.floor(xMax / labelStep + 1e-9);
    const labels = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const wx = i * labelStep;
      const sx = wx * view.scale + view.ox;
      if (sx < rulerSize || sx > width) continue;
      ctx.moveTo(sx, 2);
      ctx.lineTo(sx, rulerSize);
      labels.push({ wx, sx });
    }
    ctx.stroke();

    if (ctx.fillText) {
      for (const { wx, sx } of labels) {
        const label = formatRulerCoord(wx);
        const tw = ctx.measureText ? ctx.measureText(label).width : label.length * 5.8;
        if (sx + 3 + tw <= width - 2) {
          ctx.fillStyle = Math.abs(wx) < 1e-6 ? textColor : majorTickColor;
          ctx.fillText(label, sx + 3, 2);
        }
      }
    }
  }

  // Active X cursor marker & live coordinate badge on top ruler
  if (hoverXInBounds) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.lineTo(hx, rulerSize);
    ctx.stroke();

    if (ctx.fillText) {
      const coordLabel = formatRulerCoord(hover.x);
      ctx.font = `600 9px ${monoFont}`;
      const tw = ctx.measureText ? ctx.measureText(coordLabel).width : coordLabel.length * 5.6;
      const padX = 4;
      const badgeW = tw + padX * 2;
      const badgeH = 13;
      const clampedX = Math.max(rulerSize + 2, Math.min(width - badgeW - 2, hx + 4));
      if (clampedX >= rulerSize + 1 && clampedX + badgeW <= width) {
        ctx.fillStyle = elevatedColor;
        ctx.fillRect(clampedX, 2, badgeW, badgeH);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1;
        if (ctx.strokeRect) ctx.strokeRect(clampedX, 2, badgeW, badgeH);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(coordLabel, clampedX + padX, 2 + badgeH / 2);
      }
    }
  }
  ctx.restore();

  // 4. Left vertical ruler ticks & coordinate labels (restricted to [rulerSize, height])
  ctx.save();
  if (ctx.clip && ctx.rect) {
    ctx.beginPath();
    ctx.rect(0, rulerSize, rulerSize, height - rulerSize);
    ctx.clip();
  }

  if (subStep) {
    ctx.strokeStyle = subTickColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startIdx = Math.ceil(yMin / subStep - 1e-9);
    const endIdx = Math.floor(yMax / subStep + 1e-9);
    for (let i = startIdx; i <= endIdx; i++) {
      const wy = i * subStep;
      if (isMultipleOf(wy, minorStep) || isMultipleOf(wy, labelStep)) continue;
      const sy = wy * view.scale + view.oy;
      if (sy < rulerSize || sy > height) continue;
      ctx.moveTo(rulerSize - 4.5, sy);
      ctx.lineTo(rulerSize, sy);
    }
    ctx.stroke();
  }

  if (minorStep) {
    ctx.strokeStyle = minorTickColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startIdx = Math.ceil(yMin / minorStep - 1e-9);
    const endIdx = Math.floor(yMax / minorStep + 1e-9);
    for (let i = startIdx; i <= endIdx; i++) {
      const wy = i * minorStep;
      if (isMultipleOf(wy, labelStep)) continue;
      const sy = wy * view.scale + view.oy;
      if (sy < rulerSize || sy > height) continue;
      ctx.moveTo(rulerSize - 8, sy);
      ctx.lineTo(rulerSize, sy);
    }
    ctx.stroke();
  }

  {
    ctx.strokeStyle = majorTickColor;
    ctx.lineWidth = 1;
    ctx.font = `500 9.5px ${monoFont}`;
    ctx.beginPath();
    const startIdx = Math.ceil(yMin / labelStep - 1e-9);
    const endIdx = Math.floor(yMax / labelStep + 1e-9);
    const labels = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const wy = i * labelStep;
      const sy = wy * view.scale + view.oy;
      if (sy < rulerSize || sy > height) continue;
      ctx.moveTo(2, sy);
      ctx.lineTo(rulerSize, sy);
      labels.push({ wy, sy });
    }
    ctx.stroke();

    if (ctx.fillText) {
      for (const { wy, sy } of labels) {
        const label = formatRulerCoord(wy);
        const tw = ctx.measureText ? ctx.measureText(label).width : label.length * 5.8;
        if (sy + 3 + tw <= height - 2) {
          ctx.fillStyle = Math.abs(wy) < 1e-6 ? textColor : majorTickColor;
          if (ctx.translate && ctx.rotate) {
            ctx.save();
            ctx.translate(2, sy + 3);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(label, 0, 0);
            ctx.restore();
          } else {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(label, 2, sy + 3);
          }
        }
      }
    }
  }

  // Active Y cursor marker & live coordinate badge on left ruler
  if (hoverYInBounds) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(rulerSize, hy);
    ctx.stroke();

    if (ctx.fillText) {
      const coordLabel = formatRulerCoord(hover.y);
      ctx.font = `600 9px ${monoFont}`;
      const tw = ctx.measureText ? ctx.measureText(coordLabel).width : coordLabel.length * 5.6;
      const padY = 4;
      const badgeLen = tw + padY * 2;
      const badgeThick = 13;
      const clampedY = Math.max(rulerSize + 2, Math.min(height - badgeLen - 2, hy + 4));
      if (clampedY >= rulerSize + 1 && clampedY + badgeLen <= height) {
        ctx.fillStyle = elevatedColor;
        ctx.fillRect(2, clampedY, badgeThick, badgeLen);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1;
        if (ctx.strokeRect) ctx.strokeRect(2, clampedY, badgeThick, badgeLen);
        ctx.fillStyle = textColor;
        if (ctx.translate && ctx.rotate) {
          ctx.save();
          ctx.translate(2 + badgeThick / 2, clampedY + padY);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(coordLabel, 0, 0);
          ctx.restore();
        } else {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(coordLabel, 2, clampedY + padY);
        }
      }
    }
  }
  ctx.restore();

  // 5. Ruler perimeter borders & top-left unit corner box
  ctx.fillStyle = elevatedColor;
  ctx.fillRect(0, 0, rulerSize, rulerSize);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rulerSize);
  ctx.lineTo(width, rulerSize);
  ctx.moveTo(rulerSize, 0);
  ctx.lineTo(rulerSize, height);
  ctx.stroke();

  if (ctx.fillText) {
    const unitLabel = labelStep < 12 ? 'in' : 'ft';
    ctx.font = `600 8.5px ${monoFont}`;
    ctx.fillStyle = majorTickColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unitLabel, rulerSize / 2, rulerSize / 2);
  }

  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.restore();
}

const DEFAULT_PLAN_ORIGIN = [-122.4194, 37.7749];
const INCH_TO_METER = 0.0254;

function niceTickStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 120;
  const exp = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const frac = rawStep / exp;
  if (frac <= 1.5) return exp;
  if (frac <= 3.5) return 2.5 * exp;
  if (frac <= 7.5) return 5 * exp;
  return 10 * exp;
}

function resolveSpatialReference(state, opts = {}) {
  const rawCRS =
    opts.activeCRS ??
    opts.crs ??
    state?.crs ??
    state?.site?.crs ??
    state?.background?.worldfileCRS ??
    null;

  let isLocalPlan = false;
  let epsg = 'EPSG:4326';

  if (typeof rawCRS === 'string') {
    const upper = rawCRS.trim().toUpperCase();
    if (upper === 'PLAN' || upper === 'LOCAL' || upper === 'INCHES') {
      isLocalPlan = true;
      epsg = 'PLAN';
    } else {
      const normalized = normalizeCode(rawCRS);
      epsg = normalized && isRegisteredEPSG(normalized) ? normalized : 'EPSG:4326';
    }
  } else if (typeof rawCRS === 'number') {
    const normalized = `EPSG:${rawCRS}`;
    epsg = isRegisteredEPSG(normalized) ? normalized : 'EPSG:4326';
  } else if (rawCRS && typeof rawCRS === 'object') {
    const rawCode = rawCRS.epsg ?? rawCRS.code ?? rawCRS.crs ?? '';
    const upper = String(rawCode).trim().toUpperCase();
    if (upper === 'PLAN' || upper === 'LOCAL' || upper === 'INCHES') {
      isLocalPlan = true;
      epsg = 'PLAN';
    } else {
      const normalized =
        typeof rawCode === 'number' ? `EPSG:${rawCode}` : normalizeCode(String(rawCode));
      epsg = normalized && isRegisteredEPSG(normalized) ? normalized : 'EPSG:4326';
    }
  }

  let origin = DEFAULT_PLAN_ORIGIN;
  const crsObj =
    (opts.crs && typeof opts.crs === 'object' ? opts.crs : null) ||
    (state?.crs && typeof state.crs === 'object' ? state.crs : null);
  const rawOrigin = opts.origin ?? crsObj?.origin;
  if (Array.isArray(rawOrigin) && rawOrigin.length >= 2) {
    const lon = Number(rawOrigin[0]);
    const lat = Number(rawOrigin[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      origin = [lon, lat];
    }
  } else if (rawOrigin && typeof rawOrigin === 'object') {
    const lon = Number(
      rawOrigin.longitude ?? rawOrigin.lon ?? rawOrigin.x ?? DEFAULT_PLAN_ORIGIN[0]
    );
    const lat = Number(
      rawOrigin.latitude ?? rawOrigin.lat ?? rawOrigin.y ?? DEFAULT_PLAN_ORIGIN[1]
    );
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      origin = [lon, lat];
    }
  }

  return { isLocalPlan, epsg, origin };
}

function projectPlanCoord(planPt, originLonLat, epsg) {
  try {
    const isDefaultOrigin =
      Math.abs(originLonLat[0] - DEFAULT_PLAN_ORIGIN[0]) < 1e-9 &&
      Math.abs(originLonLat[1] - DEFAULT_PLAN_ORIGIN[1]) < 1e-9;
    if (isDefaultOrigin) {
      const res = reproject(planPt, 'PLAN', epsg);
      if (Array.isArray(res) && Number.isFinite(res[0]) && Number.isFinite(res[1])) {
        return res;
      }
    } else {
      const originMerc = reproject(originLonLat, 'EPSG:4326', 'EPSG:3857');
      if (
        Array.isArray(originMerc) &&
        Number.isFinite(originMerc[0]) &&
        Number.isFinite(originMerc[1])
      ) {
        const mercPt = [
          originMerc[0] + planPt[0] * INCH_TO_METER,
          originMerc[1] - planPt[1] * INCH_TO_METER,
        ];
        const res = epsg === 'EPSG:3857' ? mercPt : reproject(mercPt, 'EPSG:3857', epsg);
        if (Array.isArray(res) && Number.isFinite(res[0]) && Number.isFinite(res[1])) {
          return res;
        }
      }
    }
  } catch {
    // Fall back safely on reprojection failure
  }
  return originLonLat;
}

function formatProjectedTick(val, epsg) {
  if (!Number.isFinite(val)) return '';
  if (epsg === 'EPSG:4326') {
    return `${val.toFixed(5)}°`;
  }
  return `${val.toFixed(1)}`;
}

export function drawSpatialReferenceOverlay(ctx, state, view, opts = {}) {
  if (!ctx) return;
  const canvasW = ctx.canvas?.width || 800;
  const canvasH = ctx.canvas?.height || 600;
  const dpr = opts.dpr || 1;
  const scale = Number.isFinite(view?.scale) && view.scale > 0 ? view.scale : 1;
  const ox = Number.isFinite(view?.ox) ? view.ox : 0;
  const oy = Number.isFinite(view?.oy) ? view.oy : 0;

  const { isLocalPlan, epsg, origin } = resolveSpatialReference(state, opts);

  if (typeof ctx.save === 'function') ctx.save();
  if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1.0;
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

  // 1. Planar origin (0, 0) crosshairs in screen space
  const originScreenX = ox * dpr;
  const originScreenY = oy * dpr;
  const crosshairArm = 10 * dpr;
  const crosshairColor = getToken('--ktheme-info', '#2a7fff');

  ctx.strokeStyle = crosshairColor;
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(originScreenX - crosshairArm, originScreenY);
  ctx.lineTo(originScreenX + crosshairArm, originScreenY);
  ctx.moveTo(originScreenX, originScreenY - crosshairArm);
  ctx.lineTo(originScreenX, originScreenY + crosshairArm);
  ctx.stroke();

  if (typeof ctx.arc === 'function') {
    ctx.beginPath();
    ctx.arc(originScreenX, originScreenY, 4 * dpr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Compute active CRS badge layout so left-margin tick labels never overlap it
  let badgeText;
  if (isLocalPlan) {
    badgeText = 'CRS: PLAN (Local) · Origin (0, 0)';
  } else {
    const projOrigin = projectPlanCoord([0, 0], origin, epsg);
    const originText =
      epsg === 'EPSG:4326'
        ? `${projOrigin[1].toFixed(4)}°, ${projOrigin[0].toFixed(4)}°`
        : `${projOrigin[0].toFixed(1)}, ${projOrigin[1].toFixed(1)}`;
    badgeText = `CRS: ${epsg} · Origin (${originText})`;
  }

  const badgeFontSize = 11 * dpr;
  ctx.font = `${badgeFontSize}px sans-serif`;
  const paddingX = 8 * dpr;
  const paddingY = 5 * dpr;
  const margin = 10 * dpr;
  const badgeTextWidth =
    typeof ctx.measureText === 'function'
      ? ctx.measureText(badgeText).width
      : badgeText.length * 6.5 * dpr;
  const badgeWidth = badgeTextWidth + paddingX * 2;
  const badgeHeight = badgeFontSize + paddingY * 2;
  const badgeX = margin;
  const badgeY = Math.max(margin, canvasH - margin - badgeHeight);

  // 2. Projected coordinate tick marks along top and left viewport margins
  if (!isLocalPlan) {
    const viewW = canvasW / dpr;
    const viewH = canvasH / dpr;
    const x0 = -ox / scale;
    const y0 = -oy / scale;
    const x1 = x0 + viewW / scale;
    const y1 = y0 + viewH / scale;

    const minDim = Math.min(viewW, viewH);
    const targetPx = opts.tickSpacing ?? Math.min(120, Math.max(36, minDim / 3));
    const planStep = niceTickStep(targetPx / scale);
    const tickLen = 6 * dpr;
    const tickStrokeColor = getToken('--ktheme-text-muted', '#5f5950');
    const tickLabelColor = getToken('--ktheme-text', '#2b2824');
    const tickFontSize = 9.5 * dpr;

    ctx.strokeStyle = tickStrokeColor;
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${tickFontSize}px ${getToken('--font-family-mono', 'monospace')}`;
    ctx.fillStyle = tickLabelColor;

    const startXIdx = Math.ceil(x0 / planStep);
    const endXIdx = Math.floor(x1 / planStep);
    const startYIdx = Math.ceil(y0 / planStep);
    const endYIdx = Math.floor(y1 / planStep);

    ctx.beginPath();
    for (let i = startXIdx; i <= endXIdx; i++) {
      const planX = i * planStep;
      const sx = (planX * scale + ox) * dpr;
      if (sx < 0 || sx > canvasW) continue;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, tickLen);
    }
    for (let j = startYIdx; j <= endYIdx; j++) {
      const planY = j * planStep;
      const sy = (planY * scale + oy) * dpr;
      if (sy < 0 || sy > canvasH) continue;
      ctx.moveTo(0, sy);
      ctx.lineTo(tickLen, sy);
    }
    ctx.stroke();

    if (typeof ctx.fillText === 'function') {
      const minXPad = Math.min(18 * dpr, canvasW * 0.15);
      const maxXPad = canvasW - Math.min(52 * dpr, canvasW * 0.35);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = startXIdx; i <= endXIdx; i++) {
        const planX = i * planStep;
        const sx = (planX * scale + ox) * dpr;
        if (sx < minXPad || sx > maxXPad) continue;
        const proj = projectPlanCoord([planX, 0], origin, epsg);
        const label = formatProjectedTick(proj[0], epsg);
        if (label) {
          ctx.fillText(label, sx + 3 * dpr, tickLen + 2 * dpr);
        }
      }

      const minYPad = Math.min(22 * dpr, canvasH * 0.18);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let j = startYIdx; j <= endYIdx; j++) {
        const planY = j * planStep;
        const sy = (planY * scale + oy) * dpr;
        if (sy < minYPad || sy > badgeY - 8 * dpr) continue;
        const proj = projectPlanCoord([0, planY], origin, epsg);
        const label = formatProjectedTick(proj[1], epsg);
        if (label) {
          ctx.fillText(label, tickLen + 3 * dpr, sy);
        }
      }
    }
  }

  // 3. Active CRS overlay badge in screen space (bottom-left)
  ctx.font = `${badgeFontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1 * dpr;

  if (typeof ctx.roundRect === 'function' && typeof ctx.fill === 'function') {
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4 * dpr);
    ctx.fill();
    ctx.stroke();
  } else {
    if (typeof ctx.fillRect === 'function') {
      ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    }
    if (typeof ctx.strokeRect === 'function') {
      ctx.strokeRect(badgeX, badgeY, badgeWidth, badgeHeight);
    }
  }

  if (typeof ctx.fillText === 'function') {
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + paddingX, badgeY + badgeHeight / 2);
  }

  if (typeof ctx.restore === 'function') ctx.restore();
}

function drawComplianceScene(ctx, complianceScene, view) {
  if (!complianceScene) return;
  const nodes = complianceScene.getNodes();

  // Pass 0: GIS Site Subsystem Layers
  for (const node of nodes) {
    if (node.type === 'gisLotLine') {
      const pts = node.data.points || node.data.layer?.points;
      if (pts && pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2 / view.scale;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    } else if (node.type === 'gisEasement') {
      const pts = node.data.points || node.data.layer?.points;
      if (pts && pts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = '#7e22ce';
        ctx.lineWidth = 1.5 / view.scale;
        ctx.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    } else if (node.type === 'gisSetbackBuffer') {
      const outer = node.data.points || node.data.layer?.points;
      const inner = node.data.innerPoints || node.data.layer?.innerPoints;
      ctx.save();
      ctx.fillStyle = 'rgba(234, 88, 12, 0.2)';
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 1.5 / view.scale;
      ctx.setLineDash([4 / view.scale, 2 / view.scale]);

      if (outer && outer.length >= 3 && inner && inner.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(outer[0].x, outer[0].y);
        for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
        ctx.closePath();

        ctx.moveTo(inner[0].x, inner[0].y);
        for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
        ctx.closePath();

        ctx.fill('evenodd');

        // Draw inner buildable setback boundary stroke
        ctx.beginPath();
        ctx.moveTo(inner[0].x, inner[0].y);
        for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i].x, inner[i].y);
        ctx.closePath();
        ctx.stroke();
      } else if (outer && outer.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(outer[0].x, outer[0].y);
        for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Pass 1: Fixture clearance zones
  for (const node of nodes) {
    if (node.type !== 'fixtureClearance') continue;
    const b = node.bounds;
    const d = node.data;
    ctx.save();
    ctx.fillStyle =
      d.fillColor || (d.isColliding ? 'rgba(232, 64, 64, 0.25)' : 'rgba(42, 127, 255, 0.12)');
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = d.borderColor || (d.isColliding ? '#e84040' : '#2a7fff');
    ctx.lineWidth = 1.5 / view.scale;
    if (d.isColliding) {
      ctx.setLineDash([4 / view.scale, 2 / view.scale]);
    }
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  // Pass 2: Violations
  for (const node of nodes) {
    if (node.type !== 'violation') continue;
    const b = node.bounds;
    const d = node.data;
    ctx.save();
    ctx.strokeStyle =
      d.severity === 'error' ? 'rgba(211, 51, 51, 0.85)' : 'rgba(217, 119, 6, 0.85)';
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([5 / view.scale, 3 / view.scale]);
    ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);

    if (d.fixButtonBounds) {
      const fb = d.fixButtonBounds;
      const fs = Math.max(7, Math.min(10, 9 / view.scale));
      ctx.setLineDash([]);
      ctx.fillStyle = getToken('--ktheme-accent', '#2563eb');
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(fb.x, fb.y, fb.w, fb.h, 4 / view.scale)
        : ctx.rect(fb.x, fb.y, fb.w, fb.h);
      ctx.fill();
      ctx.fillStyle = getToken('--ktheme-on-primary', '#ffffff');
      ctx.font = `600 ${fs}px ${getToken('--font-family-sans', 'sans-serif')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Fix', fb.x + fb.w / 2, fb.y + fb.h / 2);
    }
    ctx.restore();
  }

  // Pass 3: Egress Reach Nodes & Badges
  for (const node of nodes) {
    if (node.type !== 'egressReach') continue;
    const d = node.data;
    const b = node.bounds;
    ctx.save();
    // Dotted reach line from window anchor to badge
    if (b.anchorX !== undefined && b.anchorY !== undefined) {
      ctx.strokeStyle = d.isEgressCompliant ? '#2f8f5b' : '#c43b3b';
      ctx.lineWidth = 1 / view.scale;
      ctx.setLineDash([2 / view.scale, 2 / view.scale]);
      ctx.beginPath();
      ctx.moveTo(b.anchorX, b.anchorY);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
      ctx.stroke();
    }
    // Badge pill
    const fs = Math.max(7, Math.min(10, 10 / view.scale));
    ctx.font = `600 ${fs}px ${getToken('--font-family-sans', 'sans-serif')}`;
    const textWidth = ctx.measureText(d.badgeText).width + 8;
    const badgeW = Math.max(b.w, textWidth);
    const badgeH = fs * 1.8;
    ctx.fillStyle = d.isEgressCompliant ? 'rgba(47, 143, 91, 0.9)' : 'rgba(196, 59, 59, 0.9)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(b.x + b.w / 2 - badgeW / 2, b.y + b.h / 2 - badgeH / 2, badgeW, badgeH, 4)
      : ctx.rect(b.x + b.w / 2 - badgeW / 2, b.y + b.h / 2 - badgeH / 2, badgeW, badgeH);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.badgeText, b.x + b.w / 2, b.y + b.h / 2);
    ctx.restore();
  }

  // Pass 4: Constraint Handles & Dimension Labels
  for (const node of nodes) {
    if (node.type === 'constraintHandle') {
      const b = node.bounds;
      const d = node.data;
      ctx.save();
      const sz = (d.isSelected ? 10 : 8) / view.scale;
      ctx.fillStyle = d.color || (d.isValid ? '#ffffff' : '#f87171');
      ctx.strokeStyle = d.isValid ? '#2a7fff' : '#dc2626';
      ctx.lineWidth = (d.isValid ? 1.5 : 2.5) / view.scale;
      ctx.beginPath();
      ctx.rect(b.x - sz / 2, b.y - sz / 2, sz, sz);
      ctx.fill();
      ctx.stroke();

      if (!d.isValid) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 3 / view.scale;
        ctx.beginPath();
        ctx.arc(b.x, b.y, sz * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (node.type === 'dimensionLabel') {
      const b = node.bounds;
      const d = node.data;
      ctx.save();
      const fs = Math.max(8, Math.min(11, 10 / view.scale));
      ctx.font = `600 ${fs}px ${getToken('--font-family-sans', 'sans-serif')}`;
      const label = d.dimensionText;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = d.isValid ? 'rgba(30, 41, 59, 0.85)' : 'rgba(220, 38, 38, 0.9)';
      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(b.x - tw / 2, b.y - fs, tw, fs * 1.8, 3)
        : ctx.rect(b.x - tw / 2, b.y - fs, tw, fs * 1.8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x, b.y - fs * 0.1);

      if (!d.isValid && Array.isArray(d.violations) && d.violations.length > 0) {
        const warnText = d.violations.join(', ');
        const wfs = Math.max(7, Math.min(10, 9 / view.scale));
        ctx.font = `600 ${wfs}px sans-serif`;
        const wtw = ctx.measureText(warnText).width + 12;
        const wY = b.y + fs * 1.2;
        ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(b.x - wtw / 2, wY - wfs * 0.8, wtw, wfs * 1.6, 3)
          : ctx.rect(b.x - wtw / 2, wY - wfs * 0.8, wtw, wfs * 1.6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(warnText, b.x, wY);
      }
      ctx.restore();
    }
  }

  // Pass 5: Active Drag Rejection Nodes & Conflict Halos
  for (const node of nodes) {
    if (node.type !== 'activeDragRejection') continue;
    const b = node.bounds;
    const d = node.data;
    if (!b) continue;

    ctx.save();
    // 1. Red Conflict Halo Fill & Dashed Outline
    ctx.fillStyle = d.fillColor || 'rgba(232, 64, 64, 0.22)';
    ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.strokeStyle = d.haloColor || '#e84040';
    ctx.lineWidth = 2.5 / view.scale;
    ctx.setLineDash([6 / view.scale, 3 / view.scale]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);

    // Outer glow halo ring
    ctx.strokeStyle = 'rgba(232, 64, 64, 0.35)';
    ctx.lineWidth = 6 / view.scale;
    ctx.setLineDash([]);
    ctx.strokeRect(
      b.x - 2 / view.scale,
      b.y - 2 / view.scale,
      b.w + 4 / view.scale,
      b.h + 4 / view.scale
    );

    // 2. Rejection Callout Warning Badge
    const msg = d.message || 'Placement Violation';
    const fs = Math.max(8, Math.min(11, 10 / view.scale));
    ctx.font = `600 ${fs}px sans-serif`;
    const tw = ctx.measureText(msg).width + 16;
    const badgeW = Math.max(60, tw);
    const badgeH = fs * 1.9;
    const badgeX = b.x + b.w / 2 - badgeW / 2;
    const badgeY = b.y - badgeH - 6 / view.scale;

    ctx.fillStyle = 'rgba(220, 38, 38, 0.95)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4 / view.scale);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / view.scale;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, b.x + b.w / 2, badgeY + badgeH / 2);

    ctx.restore();
  }
}

export function drawGrid(ctx, view, cw, ch, opts = {}) {
  const unitSize =
    opts.gridSettings?.unitSize ??
    opts.unitSize ??
    opts.snappingBridge?.interaction?.gridSettings?.unitSize ??
    6;
  const subGrid = unitSize;
  const minorGrid = opts.gridSettings?.minorGrid ?? opts.minorGrid ?? 12;
  const majorGrid = opts.gridSettings?.majorGrid ?? opts.majorGrid ?? 60;

  const x0 = -view.ox / view.scale;
  const y0 = -view.oy / view.scale;
  const x1 = x0 + cw / view.scale;
  const y1 = y0 + ch / view.scale;
  ctx.lineWidth = 1 / view.scale;
  const candidateTiers = [
    [subGrid, '#f0ede6'],
    [minorGrid, '#ebe7de'],
    [majorGrid, '#dcd6c8'],
    [12, getToken('--ktheme-border-light', '#ebe7de')],
    [60, getToken('--ktheme-border', '#dcd6c8')],
  ];

  const seenSteps = new Set();
  const tiers = [];
  for (const [step, color] of candidateTiers) {
    if (seenSteps.has(step)) continue;
    seenSteps.add(step);
    tiers.push([step, color]);
  }

  for (const [step, color] of tiers) {
    if (step * view.scale < 6) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    {
      const startIdx = Math.floor(x0 / step);
      const endIdx = Math.ceil(x1 / step);
      for (let i = startIdx; i < endIdx; i++) {
        const x = i * step;
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
    }
    {
      const startIdx = Math.floor(y0 / step);
      const endIdx = Math.ceil(y1 / step);
      for (let i = startIdx; i < endIdx; i++) {
        const y = i * step;
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
    }
    ctx.stroke();
  }
}

function drawFloor(ctx, room, opts, bad) {
  const f = FLOOR_BY_ID[room.floor];
  ctx.fillStyle = f ? patternFor(ctx, f) : ROOM_TYPES[room.type].color;
  const pts = getRoomPoints(room);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
  ctx.fill();

  const isBadRoom = bad && bad.has(room.id);
  if (isBadRoom) {
    ctx.save();
    ctx.fillStyle = 'rgba(211, 51, 51, 0.12)';
    ctx.fill();
    ctx.strokeStyle = getToken('--ktheme-critical', '#d33');
    const sc = opts?.view?.scale || 1;
    ctx.lineWidth = 2 / sc;
    ctx.setLineDash([6 / sc, 4 / sc]);
    ctx.stroke();
    ctx.restore();
  }

  if (room.type === 'stairs') drawStairs(ctx, room);
}

function drawStairs(ctx, room) {
  const ir = interior(room);
  const vertical = ir.h >= ir.w;
  const n = Math.ceil((room.ceiling + 10) / 7.75);
  ctx.strokeStyle = 'rgba(60,45,30,.55)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let k = 1; k < n; k++) {
    if (vertical) {
      const y = ir.y + (ir.h * k) / n;
      ctx.moveTo(ir.x, y);
      ctx.lineTo(ir.x + ir.w, y);
    } else {
      const x = ir.x + (ir.w * k) / n;
      ctx.moveTo(x, ir.y);
      ctx.lineTo(x, ir.y + ir.h);
    }
  }
  ctx.stroke();
}

function drawWalls(ctx, state, room, bad, _opts) {
  const pts = getRoomPoints(room);
  const isBadRoom = bad && bad.has(room.id);
  for (let i = 0; i < pts.length; i++) {
    const wallKey = pts.length === 4 ? LEGACY_WALL_NAMES[i] : `${i}`;
    const s = wallSeg(room, i);
    const finId =
      (room.walls && (room.walls[wallKey] || room.walls[i] || room.walls[LEGACY_WALL_NAMES[i]])) ||
      'paint_white';
    const fin = WALL_BY_ID[finId];

    const isBadWall =
      bad &&
      (bad.has(`${room.id}:wall:${i}`) ||
        bad.has(`${room.id}:${wallKey}`) ||
        bad.has(`${room.id}:${i}`) ||
        bad.has(wallKey) ||
        bad.has(`${room.id}:wall`) ||
        (isBadRoom && bad.has(`${room.id}:wall`)));

    ctx.save();
    ctx.translate(s.ax, s.ay);
    ctx.rotate(Math.atan2(s.dy, s.dx));
    const len = s.len;

    if (isBadWall) {
      ctx.fillStyle = getToken('--ktheme-critical', '#d33');
      ctx.fillRect(-WT / 2 - 1, -WT / 2 - 1, len + WT + 2, WT + 2);
    } else {
      ctx.fillStyle = getToken('--ktheme-border', '#3c3a38');
      ctx.fillRect(-WT / 2, -WT / 2, len + WT, WT / 2);
    }
    ctx.fillStyle = fin ? patternFor(ctx, fin) : '#ddd';
    ctx.fillRect(-WT / 2, 0, len + WT, WT / 2);
    ctx.restore();
  }
  for (const room2 of [room])
    for (const o of room2.openings) drawOpening(ctx, state, room2, o, bad);
}

export function drawWindow2D(ctx, room, o, def, isBad) {
  const s = wallSeg(room, o.wall);
  const th = WT + 0.6;
  const style = resolveWindowStyle(o) || resolveWindowStyle(def);
  const frameColor = isBad
    ? getToken('--ktheme-critical', '#d33')
    : style.frameColor || getToken('--ktheme-border', '#2d2a26');

  ctx.save();
  ctx.translate(s.ax + s.dx * (o.offset + o.width / 2), s.ay + s.dy * (o.offset + o.width / 2));
  if (ctx.rotate) ctx.rotate(Math.atan2(s.dy, s.dx));

  ctx.fillStyle = 'rgba(120,180,230,.55)';
  ctx.fillRect(-o.width / 2, -1.2, o.width, 2.4);

  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-o.width / 2, -th / 2, o.width, th);

  // Casing trim indicator lines in 2D
  if (style.casing?.width) {
    const cw = Math.min(style.casing.width, 3);
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-o.width / 2 - cw, -th / 2);
    ctx.lineTo(o.width / 2 + cw, -th / 2);
    ctx.moveTo(-o.width / 2 - cw, th / 2);
    ctx.lineTo(o.width / 2 + cw, th / 2);
    ctx.stroke();
  }

  // Mullion grid lines in 2D
  const cols = style.mullions?.cols || 1;
  const rows = style.mullions?.rows || 1;

  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1.0;
  ctx.beginPath();

  if (cols > 1) {
    const colStep = o.width / cols;
    for (let i = 1; i < cols; i++) {
      const pos = -o.width / 2 + i * colStep;
      ctx.moveTo(pos, -th / 2);
      ctx.lineTo(pos, th / 2);
    }
  }

  if (rows > 1 || def?.style === 'hung') {
    ctx.moveTo(-o.width / 2, 0);
    ctx.lineTo(o.width / 2, 0);
  }

  ctx.stroke();
  ctx.restore();
}

function drawOpening(ctx, state, room, o, bad) {
  const def = OPENING_BY_ID[o.type];
  const a = wallPoint(room, o.wall, o.offset, 0);
  const s = wallSeg(room, o.wall);
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(s.dy, s.dx));
  const th = WT + 0.6;
  // gap in wall
  ctx.fillStyle = getToken('--ktheme-bg', '#f7f5f0');
  ctx.fillRect(0, -th / 2, o.width, th);
  const isBad = bad.has(o.id);
  ctx.strokeStyle = isBad ? '#d33' : '#2d2a26';
  ctx.lineWidth = 1.2;
  ctx.fillStyle = 'rgba(120,180,230,.55)';
  if (def.kind === 'window') {
    drawWindow2D(ctx, room, o, def, isBad);
  } else {
    const dir = o.swing === 'out' ? -1 : 1;
    const hx = 0;
    const hy = 0;
    const lx = 0;
    const ly = dir * o.width;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + lx, hy + ly);
    ctx.stroke();
    ctx.setLineDash([1.5, 1.5]);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const ang0 = Math.atan2(ly, lx);
    const ang1 = 0;
    let d = ang1 - ang0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    ctx.arc(hx, hy, o.width, ang0, ang0 + d, d < 0);
    ctx.stroke();
    ctx.setLineDash([]);
    if (def.exterior) {
      ctx.fillStyle = 'rgba(80,60,40,.5)';
      ctx.fillRect(0, -th / 2, o.width, th);
    }
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
    ctx.fillStyle = isBad ? '#d33' : def.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (def.shape === 'switch') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 0.8, p.y - 1.4, 1.6, 2.8);
    }
    ctx.restore();
    return;
  }
  if (def.mount === 'ceiling') {
    ctx.translate(it.x, it.y);
    const r = def.w / 2;
    ctx.fillStyle = isBad ? '#d33' : def.color;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(5, r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      {
        light: '☼',
        fan: '✻',
        alarm:
          def.func.includes('co') && def.func.includes('smoke')
            ? 'S+C'
            : def.func.includes('co')
              ? 'CO'
              : 'S',
      }[def.shape] || '',
      0,
      0.5
    );
    ctx.restore();
    return;
  }
  ctx.translate(it.x, it.y);
  ctx.rotate((it.rot * Math.PI) / 180);
  const w = def.w;
  const d = def.d;
  const x = -w / 2;
  const y = -d / 2;
  ctx.fillStyle = isBad ? '#e88' : def.color;
  ctx.strokeStyle = isBad ? '#c22' : 'rgba(0,0,0,.5)';
  ctx.lineWidth = 0.8;
  const rr = (rx, ry, rw, rh, rad) => {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(rx, ry, rw, rh, rad) : ctx.rect(rx, ry, rw, rh);
  };
  switch (def.shape) {
    case 'bed':
      rr(x, y, w, d, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4efe6';
      rr(x + 2, y + d * 0.28, w - 4, d * 0.7, 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      {
        const pw = w > 45 ? (w - 8) / 2 : w - 6;
        for (let k = 0; k < (w > 45 ? 2 : 1); k++) {
          rr(x + 3 + k * (pw + 2), y + 3, pw, d * 0.18, 3);
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    case 'sofa':
      rr(x, y, w, d, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      rr(x, y, w, d * 0.28, 3);
      ctx.fill();
      break; // back is at -y
    case 'table':
      rr(x, y, w, d, 3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.2)';
      ctx.strokeRect(x + 4, y + 4, w - 8, d - 8);
      break;
    case 'chair':
      rr(x, y, w, d, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(x, y, w, d * 0.2);
      break;
    case 'rug':
      ctx.globalAlpha *= 0.85;
      rr(x, y, w, d, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 4, y + 4, w - 8, d - 8);
      break;
    case 'plant':
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3f7a3f';
      ctx.beginPath();
      ctx.arc(0, 0, w / 3.2, 0, 7);
      ctx.fill();
      break;
    case 'round':
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, 7);
      ctx.fill();
      ctx.stroke();
      break;
    case 'toilet':
      rr(x + 2, y, w - 4, d * 0.32, 3);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, y + d * 0.62, w / 2 - 2, d * 0.34, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      break;
    case 'tub':
      rr(x, y, w, d, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dff1f7';
      rr(x + 3, y + 3, w - 6, d - 6, 10);
      ctx.fill();
      ctx.stroke();
      break;
    case 'shower':
      rr(x, y, w, d, 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + d);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + d);
      ctx.stroke();
      break;
    case 'sink':
      rr(x, y, w, d, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eaf3f7';
      rr(x + w * 0.2, y + d * 0.2, w * 0.6, d * 0.55, 6);
      ctx.fill();
      ctx.stroke();
      break;
    case 'range':
      rr(x, y, w, d, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#333';
      for (const [bx, by] of [
        [0.3, 0.3],
        [0.7, 0.3],
        [0.3, 0.7],
        [0.7, 0.7],
      ]) {
        ctx.beginPath();
        ctx.arc(x + w * bx, y + d * by, 3.5, 0, 7);
        ctx.fill();
      }
      break;
    case 'fridge':
      rr(x, y, w, d, 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.moveTo(x, y + d * 0.5);
      ctx.lineTo(x + w, y + d * 0.5);
      ctx.stroke();
      break;
    case 'shelf':
      rr(x, y, w, d, 1);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x + (w * k) / 4, y);
        ctx.lineTo(x + (w * k) / 4, y + d);
        ctx.stroke();
      }
      break;
    default:
      rr(x, y, w, d, 2);
      ctx.fill();
      ctx.stroke();
  }
  if (def.mount === 'floor' && !def.flat) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.moveTo(-3, d / 2 - 1);
    ctx.lineTo(3, d / 2 - 1);
    ctx.lineTo(0, d / 2 - 4);
    ctx.fill();
  } // front marker
  ctx.restore();
}

function drawLabel(ctx, room, view) {
  const ir = interior(room);
  const area = floorAreaSqFt(room);
  const pts = getRoomPoints(room);
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  ctx.save();
  ctx.fillStyle = 'rgba(30,30,30,.82)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.max(7, Math.min(11, Math.min(ir.w, ir.h) / 9));
  if (fs * view.scale > 5) {
    const sansFont = getToken('--font-family-sans', 'sans-serif');
    ctx.font = `600 ${fs}px ${sansFont}`;
    ctx.fillStyle = getToken('--ktheme-bg-surface', 'rgba(255,255,255,.7)');
    const label = `${room.name}`;
    const sub = `${area.toFixed(0)} sf`;
    const tw = Math.max(ctx.measureText(label).width, ctx.measureText(sub).width * 0.85) + 6;
    ctx.fillRect(cx - tw / 2, cy - fs * 1.1, tw, fs * 2.2);
    ctx.fillStyle = getToken('--ktheme-text', 'rgba(30,30,30,.9)');
    ctx.fillText(label, cx, cy - fs * 0.4);
    ctx.font = `${fs * 0.8}px ${sansFont}`;
    ctx.fillStyle = getToken('--ktheme-text-muted', 'rgba(30,30,30,.65)');
    ctx.fillText(sub, cx, cy + fs * 0.6);
  }
  ctx.restore();
}

function drawSelection(ctx, state, selection, view) {
  if (!selection) return;
  const selectedIds =
    selection instanceof Set
      ? selection
      : Array.isArray(selection)
        ? new Set(selection)
        : typeof selection === 'string'
          ? new Set([selection])
          : new Set();

  if (selectedIds.size === 0) return;

  let groupMinX = Infinity;
  let groupMinY = Infinity;
  let groupMaxX = -Infinity;
  let groupMaxY = -Infinity;

  const updateGroupBounds = (x, y, w, h) => {
    if (x < groupMinX) groupMinX = x;
    if (y < groupMinY) groupMinY = y;
    if (x + w > groupMaxX) groupMaxX = x + w;
    if (y + h > groupMaxY) groupMaxY = y + h;
  };

  const drawRing = (pathFn) => {
    ctx.save();
    ctx.lineWidth = 4.5 / view.scale;
    ctx.strokeStyle = '#000000';
    ctx.setLineDash([]);
    pathFn();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 2.5 / view.scale;
    ctx.strokeStyle = '#2a7fff';
    ctx.setLineDash([5 / view.scale, 3 / view.scale]);
    pathFn();
    ctx.stroke();
    ctx.restore();
  };

  for (const id of selectedIds) {
    for (const room of state.rooms) {
      ctx.save();

      if (room.id === id) {
        drawRing(() => {
          ctx.beginPath();
          const pts = getRoomPoints(room);
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.closePath();
        });
        updateGroupBounds(room.x, room.y, room.w, room.h);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5 / view.scale;
        ctx.setLineDash([]);
        for (const [hx, hy] of handles(room)) {
          ctx.beginPath();
          ctx.rect(hx - 4 / view.scale, hy - 4 / view.scale, 8 / view.scale, 8 / view.scale);
          ctx.fill();
          ctx.stroke();
        }
      }
      const it = room.items.find((x) => x.id === id);
      if (it) {
        const def = ITEM_BY_ID[it.type];
        if (def.mount === 'floor') {
          const fp = footprint(it, def);
          drawRing(() => {
            ctx.beginPath();
            ctx.rect(fp.x - 1, fp.y - 1, fp.w + 2, fp.h + 2);
          });
          updateGroupBounds(fp.x, fp.y, fp.w, fp.h);
        } else if (def.mount === 'ceiling') {
          const r = (def.w || 12) / 2;
          drawRing(() => {
            ctx.beginPath();
            ctx.arc(it.x, it.y, r + 2, 0, Math.PI * 2);
          });
          updateGroupBounds(it.x - r, it.y - r, r * 2, r * 2);
        } else {
          const p = wallPoint(room, it.wall, it.offset, 0);
          drawRing(() => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          });
          updateGroupBounds(p.x - 6, p.y - 6, 12, 12);
        }
      }
      const o = room.openings.find((x) => x.id === id);
      if (o) {
        const a = wallPoint(room, o.wall, o.offset, 0);
        const b = wallPoint(room, o.wall, o.offset + o.width, 0);
        drawRing(() => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        });
        const minX = Math.min(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxX = Math.max(a.x, b.x);
        const maxY = Math.max(a.y, b.y);
        updateGroupBounds(minX, minY, Math.max(4, maxX - minX), Math.max(4, maxY - minY));
      }
      ctx.restore();
    }
  }

  if (selectedIds.size > 1 && isFinite(groupMinX)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(42, 127, 255, 0.85)';
    ctx.lineWidth = 1.5 / view.scale;
    ctx.setLineDash([6 / view.scale, 4 / view.scale]);
    const pad = 4 / view.scale;
    ctx.strokeRect(
      groupMinX - pad,
      groupMinY - pad,
      groupMaxX - groupMinX + 2 * pad,
      groupMaxY - groupMinY + 2 * pad
    );
    ctx.restore();
  }
}

export const handles = (r) => {
  const pts = getRoomPoints(r);
  return pts.map((p) => [p.x, p.y]);
};

function findDiffTarget(state, id) {
  if (!id) return null;
  for (const room of state.rooms) {
    if (room.id === id) {
      return {
        kind: 'room',
        room,
        x: room.x + room.w / 2,
        y: room.y + room.h / 2,
        bounds: { x: room.x, y: room.y, w: room.w, h: room.h },
      };
    }
    const it = room.items.find((x) => x.id === id);
    if (it) {
      const def = ITEM_BY_ID[it.type] || {};
      if (def.mount === 'floor') {
        const fp = footprint(it, def);
        return { kind: 'item', room, item: it, def, x: it.x, y: it.y, bounds: fp };
      } else if (def.mount === 'ceiling') {
        return { kind: 'item', room, item: it, def, x: it.x, y: it.y, radius: (def.w || 16) / 2 };
      } else {
        const p = wallPoint(room, it.wall, it.offset, 0);
        return { kind: 'item', room, item: it, def, x: p.x, y: p.y, radius: 8 };
      }
    }
    const o = room.openings.find((x) => x.id === id);
    if (o) {
      const a = wallPoint(room, o.wall, o.offset, 0);
      const b = wallPoint(room, o.wall, o.offset + o.width, 0);
      return {
        kind: 'opening',
        room,
        opening: o,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        p1: a,
        p2: b,
      };
    }
  }
  if (typeof id === 'string' && id.includes(':')) {
    const [roomId, wallName] = id.split(':');
    const room = state.rooms.find((r) => r.id === roomId);
    if (room && WALLS.includes(wallName)) {
      const a = wallPoint(room, wallName, 0, 0);
      const b = wallPoint(room, wallName, wallLength(room, wallName), 0);
      return {
        kind: 'wall',
        room,
        wall: wallName,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        p1: a,
        p2: b,
      };
    }
  }
  return null;
}

function drawDiffHighlights(ctx, state, diffs, view, opts = {}) {
  if (!diffs || !diffs.length) return;

  const placedBadges = [];

  for (let idx = 0; idx < diffs.length; idx++) {
    const d = diffs[idx];
    const badgeNum = idx + 1;
    const isHovered =
      opts.hoveredDiffIndex === idx || (opts.hoveredDiffId && opts.hoveredDiffId === d.id);
    const target = findDiffTarget(state, d.id);

    if (!target) continue;

    ctx.save();

    // Render Green Halo around target geometry
    const haloColor = isHovered ? 'rgba(16, 185, 129, 0.95)' : 'rgba(47, 143, 91, 0.85)';
    const haloFill = isHovered ? 'rgba(16, 185, 129, 0.28)' : 'rgba(47, 143, 91, 0.18)';
    ctx.strokeStyle = haloColor;
    ctx.fillStyle = haloFill;
    ctx.lineWidth = (isHovered ? 3.5 : 2.5) / view.scale;
    ctx.setLineDash([4 / view.scale, 3 / view.scale]);

    if (target.kind === 'room') {
      const b = target.bounds;
      ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    } else if (target.kind === 'item') {
      if (target.bounds) {
        const b = target.bounds;
        ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      } else if (target.radius) {
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius + 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }
    } else if (target.kind === 'opening' || target.kind === 'wall') {
      ctx.setLineDash([]);
      ctx.lineWidth = (isHovered ? 6 : 4) / view.scale;
      ctx.beginPath();
      ctx.moveTo(target.p1.x, target.p1.y);
      ctx.lineTo(target.p2.x, target.p2.y);
      ctx.stroke();
    }

    ctx.restore();

    // Compute non-overlapping badge position
    let bx = target.x;
    let by = target.y;

    const minDist = 22 / Math.max(0.5, view.scale);
    let offsetStep = 0;

    while (placedBadges.some((b) => Math.hypot(b.x - bx, b.y - by) < minDist)) {
      offsetStep++;
      const angle = offsetStep * 1.25;
      const dist = 18 * offsetStep;
      bx = target.x + Math.cos(angle) * dist;
      by = target.y + Math.sin(angle) * dist;
    }

    placedBadges.push({
      x: bx,
      y: by,
      num: badgeNum,
      diff: d,
      isHovered,
      origX: target.x,
      origY: target.y,
    });
  }

  // Connector lines for shifted badges
  for (const b of placedBadges) {
    if (Math.hypot(b.x - b.origX, b.y - b.origY) > 5) {
      ctx.save();
      ctx.strokeStyle = 'rgba(47, 143, 91, 0.6)';
      ctx.lineWidth = 1 / view.scale;
      ctx.setLineDash([2 / view.scale, 2 / view.scale]);
      ctx.beginPath();
      ctx.moveTo(b.origX, b.origY);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Render Callout Badges
  for (const b of placedBadges) {
    ctx.save();
    ctx.translate(b.x, b.y);

    const r = (b.isHovered ? 13 : 10) / view.scale;

    if (b.isHovered) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4 / view.scale, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.fillStyle = b.isHovered ? '#059669' : '#2f8f5b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / view.scale;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(9, r * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.num), 0, 0.5 / view.scale);

    if (b.isHovered) {
      const msg = b.diff.msg || String(b.diff);
      ctx.font = `${10 / view.scale}px sans-serif`;
      const tw = ctx.measureText(msg).width;
      const pad = 6 / view.scale;
      const boxW = tw + pad * 2;
      const boxH = 18 / view.scale;
      const boxX = r + 4 / view.scale;
      const boxY = -boxH / 2;

      ctx.fillStyle = 'rgba(24, 24, 27, 0.92)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1 / view.scale;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 4 / view.scale);
      else ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, boxX + pad, 0);
    }

    ctx.restore();
  }
}

export function drawSnapGuides(ctx, snapResult, view) {
  if (!snapResult) return;
  if (
    !snapResult.snap &&
    !snapResult.indicator &&
    (!snapResult.guideLines || !snapResult.guideLines.length)
  ) {
    return;
  }
  const { snap, guideLines, indicator } = snapResult;
  const scale = view?.scale || 1;
  ctx.save();

  // Draw guide lines
  if (guideLines && guideLines.length) {
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([4 / scale, 4 / scale]);

    for (const g of guideLines) {
      if (g.type === 'midpoint') ctx.strokeStyle = getToken('--ktheme-info', '#a855f7');
      else if (g.type === 'perpendicular')
        ctx.strokeStyle = getToken('--ktheme-warning', '#f59e0b');
      else if (g.type === 'angle_reference')
        ctx.strokeStyle = getToken('--ktheme-warning', '#f59e0b');
      else if (g.type === 'angle') ctx.strokeStyle = getToken('--ktheme-accent', '#3b82f6');
      else ctx.strokeStyle = getToken('--ktheme-accent', '#3b82f6');

      ctx.beginPath();
      ctx.moveTo(g.start.x, g.start.y);
      ctx.lineTo(g.end.x, g.end.y);
      ctx.stroke();
    }
  }

  // Draw magnetic indicator points
  if (indicator) {
    ctx.setLineDash([]);
    const rOuter = 8 / scale;
    const rInner = 3.5 / scale;

    let color = getToken('--ktheme-accent', '#3b82f6');
    if (snap?.type === 'midpoint') color = getToken('--ktheme-info', '#a855f7');
    else if (snap?.type === 'perpendicular') color = getToken('--ktheme-warning', '#f59e0b');
    else if (snap?.type === 'grid') color = getToken('--ktheme-success', '#10b981');

    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(indicator.x, indicator.y, rOuter, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(indicator.x, indicator.y, rInner, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Draw angle degree status badge overlay when angle snapping is active
  const badgeAnchor = indicator || snap?.point;
  if (
    snap?.type === 'angle' &&
    typeof snap.angleDegrees === 'number' &&
    Number.isFinite(snap.angleDegrees) &&
    badgeAnchor
  ) {
    const normalizedDeg = Object.is(snap.angleDegrees, -0) ? 0 : snap.angleDegrees;
    const badgeText = `${normalizedDeg}°`;
    const fontSize = 11 / scale;
    const padX = 6 / scale;
    const boxH = 20 / scale;
    const radius = 5 / scale;

    ctx.save();
    ctx.setLineDash([]);
    ctx.font = `600 ${fontSize}px ${getToken('--font-family-sans', 'sans-serif')}`;
    const measured = typeof ctx.measureText === 'function' ? ctx.measureText(badgeText) : null;
    const textWidth =
      measured && typeof measured.width === 'number'
        ? measured.width
        : badgeText.length * fontSize * 0.6;
    const boxW = textWidth + padX * 2;
    const boxX = badgeAnchor.x + 12 / scale;
    const boxY = badgeAnchor.y - 10 / scale - boxH;

    ctx.fillStyle = getToken('--ktheme-bg-surface', 'rgba(15, 23, 42, 0.92)');
    ctx.strokeStyle = getToken('--ktheme-accent', '#3b82f6');
    ctx.lineWidth = 1.25 / scale;

    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, radius);
      ctx.fill();
      ctx.stroke();
    } else if (typeof ctx.rect === 'function') {
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxW, boxH);
      ctx.fill();
      ctx.stroke();
    } else {
      if (typeof ctx.fillRect === 'function') ctx.fillRect(boxX, boxY, boxW, boxH);
      if (typeof ctx.strokeRect === 'function') ctx.strokeRect(boxX, boxY, boxW, boxH);
    }

    ctx.fillStyle = getToken('--ktheme-on-primary', '#ffffff');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (typeof ctx.fillText === 'function') {
      ctx.fillText(badgeText, boxX + boxW / 2, boxY + boxH / 2);
    }
    ctx.restore();
  }

  ctx.restore();
}

export function drawContours(ctx, state, view, opts = {}) {
  const grid = state.elevationGrid;
  if (!grid || grid.visible === false) return;

  const contours = opts.contours || state._cachedContours || computeMarchingSquares(grid);
  if (!contours || contours.length === 0) return;

  ctx.save();
  const strokeColor = getToken('--ktheme-text-muted', '#78716c');
  const majorColor = getToken('--ktheme-text', '#44403c');
  const fontColor = getToken('--ktheme-text-muted', '#57534e');
  const fontSize = Math.max(9, Math.min(13, 11 / (view.scale || 1)));

  for (let cIdx = 0; cIdx < contours.length; cIdx++) {
    const contour = contours[cIdx];
    const elev = contour.elevation;
    const isMajor = Math.abs(elev % (grid.contourInterval * 5)) < 1e-3;

    ctx.strokeStyle = isMajor ? majorColor : strokeColor;
    ctx.lineWidth = (isMajor ? 1.5 : 0.8) / (view.scale || 1);
    ctx.globalAlpha = isMajor ? 0.85 : 0.6;

    ctx.beginPath();
    for (const line of contour.lines) {
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
    }
    ctx.stroke();

    // Draw altitude labels at midpoints of selected segments
    if (contour.lines.length > 0 && elev !== undefined) {
      const step = Math.max(1, Math.floor(contour.lines.length / 3));
      for (let lIdx = Math.floor(step / 2); lIdx < contour.lines.length; lIdx += step) {
        const seg = contour.lines[lIdx];
        const mx = (seg.x1 + seg.x2) / 2;
        const my = (seg.y1 + seg.y2) / 2;

        const text = `${elev.toFixed(1)}m`;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = getToken('--ktheme-bg', '#f7f5f0');
        ctx.lineWidth = 3 / (view.scale || 1);
        ctx.strokeText(text, mx, my);

        ctx.fillStyle = fontColor;
        ctx.fillText(text, mx, my);
        ctx.restore();
      }
    }
  }

  ctx.restore();
}
