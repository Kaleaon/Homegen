// Canvas plan renderer.
import {
  WT,
  WALLS,
  wallSeg,
  wallLength,
  wallPoint,
  interior,
  footprint,
  floorAreaSqFt,
} from './geometry.js';
import { ROOM_TYPES, ITEM_BY_ID, OPENING_BY_ID, WALL_BY_ID, FLOOR_BY_ID } from './catalog.js';
import { patternFor } from './patterns.js';
import { openingInfo } from './codes.js';
import { resolveWindowStyle } from './presetRegistry.js';
import { getToken } from './kthemeTokens.js';
import { computeMarchingSquares } from './elevationEngine.js';

const fmt = (inches) =>
  `${Math.floor(inches / 12)}'${Math.round(inches % 12) ? ` ${Math.round(inches % 12)}"` : ''}`;
export const fmtLen = fmt;

let bgCache = { dataUrl: null, img: null };

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

function drawBackground(ctx, bg, onLoaded) {
  if (!bg || !bg.visible || !bg.dataUrl) return;
  const img = getBgImage(bg, onLoaded);
  if (!img || !img.complete || !img.naturalWidth) return;
  ctx.save();
  ctx.globalAlpha = bg.opacity ?? 0.5;
  const w = (bg.width || img.naturalWidth) * (bg.scale ?? 1);
  const h = (bg.height || img.naturalHeight) * (bg.scale ?? 1);
  ctx.drawImage(img, bg.x ?? 0, bg.y ?? 0, w, h);
  ctx.restore();
}

export function draw(ctx, state, view, opts = {}) {
  const { width: w, height: h } = ctx.canvas;
  const dpr = opts.dpr || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = getToken('--ktheme-bg', '#f7f5f0');
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.ox * dpr, view.oy * dpr);
  if (state.background) drawBackground(ctx, state.background, opts.onLoaded || opts.redraw);
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
  for (const room of state.rooms) drawFloor(ctx, room, opts);
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
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function drawComplianceScene(ctx, complianceScene, view) {
  if (!complianceScene) return;
  const nodes = complianceScene.getNodes();

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
  for (const [step, color] of [
    [subGrid, '#f0ede6'],
    [minorGrid, '#ebe7de'],
    [majorGrid, '#dcd6c8'],
    [12, getToken('--ktheme-border-light', '#ebe7de')],
    [60, getToken('--ktheme-border', '#dcd6c8')],
  ]) {
    if (step * view.scale < 6) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
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

function drawWalls(ctx, state, room, bad, opts) {
  for (const wall of WALLS) {
    const s = wallSeg(room, wall);
    const fin = WALL_BY_ID[room.walls[wall]];
    // wall body: finish on the interior half, structure on the outside half
    ctx.save();
    ctx.translate(s.ax, s.ay);
    const horizontal = s.dx === 1;
    const len = s.len;
    const rect = (t0, t1, d0, d1) =>
      horizontal ? [t0, d0, t1 - t0, d1 - d0] : [d0, t0, d1 - d0, t1 - t0];
    const side = horizontal ? s.ny : s.nx; // +1: interior is on +axis side
    const inner = side > 0 ? [0, WT / 2] : [-WT / 2, 0];
    const outer = side > 0 ? [-WT / 2, 0] : [0, WT / 2];
    ctx.fillStyle = getToken('--ktheme-border', '#3c3a38');
    ctx.fillRect(...rect(-WT / 2, len + WT / 2, outer[0], outer[1]));
    ctx.fillStyle = fin ? patternFor(ctx, fin) : '#ddd';
    ctx.fillRect(...rect(-WT / 2, len + WT / 2, inner[0], inner[1]));
    ctx.restore();
  }
  for (const room2 of [room])
    for (const o of room2.openings) drawOpening(ctx, state, room2, o, bad);
}

export function drawWindow2D(ctx, room, o, def, isBad) {
  const s = wallSeg(room, o.wall);
  const horizontal = s.dx === 1;
  const th = WT + 0.6;
  const style = resolveWindowStyle(o) || resolveWindowStyle(def);
  const frameColor = isBad
    ? getToken('--ktheme-critical', '#d33')
    : style.frameColor || getToken('--ktheme-border', '#2d2a26');

  ctx.fillStyle = 'rgba(120,180,230,.55)';
  if (horizontal) {
    ctx.fillRect(0, -1.2, o.width, 2.4);
  } else {
    ctx.fillRect(-1.2, 0, 2.4, o.width);
  }

  ctx.strokeStyle = frameColor;
  ctx.lineWidth = 1.5;
  if (horizontal) {
    ctx.strokeRect(0, -th / 2, o.width, th);
  } else {
    ctx.strokeRect(-th / 2, 0, th, o.width);
  }

  // Casing trim indicator lines in 2D
  if (style.casing?.width) {
    const cw = Math.min(style.casing.width, 3);
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(-cw, -th / 2);
      ctx.lineTo(o.width + cw, -th / 2);
      ctx.moveTo(-cw, th / 2);
      ctx.lineTo(o.width + cw, th / 2);
    } else {
      ctx.moveTo(-th / 2, -cw);
      ctx.lineTo(-th / 2, o.width + cw);
      ctx.moveTo(th / 2, -cw);
      ctx.lineTo(th / 2, o.width + cw);
    }
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
      const pos = i * colStep;
      if (horizontal) {
        ctx.moveTo(pos, -th / 2);
        ctx.lineTo(pos, th / 2);
      } else {
        ctx.moveTo(-th / 2, pos);
        ctx.lineTo(th / 2, pos);
      }
    }
  }

  if (rows > 1 || def?.style === 'hung') {
    if (horizontal) {
      ctx.moveTo(0, 0);
      ctx.lineTo(o.width, 0);
    } else {
      ctx.moveTo(0, 0);
      ctx.lineTo(0, o.width);
    }
  }

  ctx.stroke();
}

function drawOpening(ctx, state, room, o, bad) {
  const def = OPENING_BY_ID[o.type];
  const a = wallPoint(room, o.wall, o.offset, 0);
  const b = wallPoint(room, o.wall, o.offset + o.width, 0);
  const s = wallSeg(room, o.wall);
  const horizontal = s.dx === 1;
  ctx.save();
  ctx.translate(a.x, a.y);
  const th = WT + 0.6;
  // gap in wall
  ctx.fillStyle = getToken('--ktheme-bg', '#f7f5f0');
  if (horizontal) ctx.fillRect(0, -th / 2, o.width, th);
  else ctx.fillRect(-th / 2, 0, th, o.width);
  const isBad = bad.has(o.id);
  ctx.strokeStyle = isBad ? '#d33' : '#2d2a26';
  ctx.lineWidth = 1.2;
  ctx.fillStyle = 'rgba(120,180,230,.55)';
  if (def.kind === 'window') {
    drawWindow2D(ctx, room, o, def, isBad);
  } else {
    const dir = o.swing === 'out' ? -1 : 1;
    const nx = s.nx * dir;
    const ny = s.ny * dir;
    // leaf (hinged at start) and swing arc
    const hx = 0;
    const hy = 0;
    const lx = nx * o.width;
    const ly = ny * o.width;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + lx, hy + ly);
    ctx.stroke();
    ctx.setLineDash([1.5, 1.5]);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const ex = s.dx * o.width;
    const ey = s.dy * o.width;
    const ang0 = Math.atan2(ly, lx);
    const ang1 = Math.atan2(ey, ex);
    let d = ang1 - ang0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    ctx.arc(hx, hy, o.width, ang0, ang0 + d, d < 0);
    ctx.stroke();
    ctx.setLineDash([]);
    if (def.exterior) {
      ctx.fillStyle = 'rgba(80,60,40,.5)';
      if (horizontal) ctx.fillRect(0, -th / 2, o.width, th);
      else ctx.fillRect(-th / 2, 0, th, o.width);
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
    const sub = `${fmt(ir.w)} × ${fmt(ir.h)} · ${area.toFixed(0)} sf`;
    const tw = Math.max(ctx.measureText(label).width, ctx.measureText(sub).width * 0.85) + 6;
    ctx.fillRect(room.x + room.w / 2 - tw / 2, room.y + room.h / 2 - fs * 1.1, tw, fs * 2.2);
    ctx.fillStyle = getToken('--ktheme-text', 'rgba(30,30,30,.9)');
    ctx.fillText(label, room.x + room.w / 2, room.y + room.h / 2 - fs * 0.4);
    ctx.font = `${fs * 0.8}px ${sansFont}`;
    ctx.fillStyle = getToken('--ktheme-text-muted', 'rgba(30,30,30,.65)');
    ctx.fillText(sub, room.x + room.w / 2, room.y + room.h / 2 + fs * 0.6);
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
          ctx.rect(room.x, room.y, room.w, room.h);
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

export const handles = (r) => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x, r.y + r.h],
  [r.x + r.w, r.y + r.h],
];

export function findDiffTarget(state, id) {
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

export function drawDiffHighlights(ctx, state, diffs, view, opts = {}) {
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
  if (!snapResult || !snapResult.snap) return;
  const { snap, guideLines, indicator } = snapResult;
  ctx.save();

  // Draw guide lines
  if (guideLines && guideLines.length) {
    ctx.lineWidth = 1.5 / view.scale;
    ctx.setLineDash([4 / view.scale, 4 / view.scale]);

    for (const g of guideLines) {
      if (g.type === 'midpoint') ctx.strokeStyle = getToken('--ktheme-info', '#a855f7');
      else if (g.type === 'perpendicular')
        ctx.strokeStyle = getToken('--ktheme-warning', '#f59e0b');
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
    const rOuter = 8 / view.scale;
    const rInner = 3.5 / view.scale;

    let color = getToken('--ktheme-accent', '#3b82f6');
    if (snap.type === 'midpoint') color = getToken('--ktheme-info', '#a855f7');
    if (snap.type === 'perpendicular') color = getToken('--ktheme-warning', '#f59e0b');
    if (snap.type === 'grid') color = getToken('--ktheme-success', '#10b981');

    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / view.scale;
    ctx.beginPath();
    ctx.arc(indicator.x, indicator.y, rOuter, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(indicator.x, indicator.y, rInner, 0, 2 * Math.PI);
    ctx.fill();
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
