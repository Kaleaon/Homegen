// SVG exporter module for Homegen.
// Generates CAD-compatible, structured vector SVG documents with title block, graphic scale bar, and room schedule.

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

const fmt = (inches) =>
  `${Math.floor(inches / 12)}'${Math.round(inches % 12) ? ` ${Math.round(inches % 12)}"` : ''}`;
const escXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function exportSVG(doc, options = {}) {
  const sheetSize = options.sheetSize || 'letter'; // 'letter' | 'tabloid'
  const orientation = options.orientation || 'landscape'; // 'landscape' | 'portrait'
  const scaleOpt = options.scale || 'fit'; // 'fit' | '1/4' | '1/8' | '1/2'
  const levelOpt = options.level !== undefined ? options.level : 0; // level index or 'all'

  // Dimensions in points (72 pt per inch)
  let sheetW = sheetSize === 'tabloid' ? 1224 : 792;
  let sheetH = sheetSize === 'tabloid' ? 792 : 612;
  if (orientation === 'portrait') {
    const tmp = sheetW;
    sheetW = sheetH;
    sheetH = tmp;
  }

  // Filter rooms
  const targetLevel = levelOpt === 'all' ? null : Number(levelOpt);
  const rooms =
    targetLevel !== null
      ? (doc.rooms || []).filter((r) => (r.level || 0) === targetLevel)
      : doc.rooms || [];

  // Calculate plan bounds in model inches
  let minX = 0;
  let minY = 0;
  let maxX = 240;
  let maxY = 240;
  if (rooms.length > 0) {
    minX = Math.min(...rooms.map((r) => r.x - WT));
    minY = Math.min(...rooms.map((r) => r.y - WT));
    maxX = Math.max(...rooms.map((r) => r.x + r.w + WT));
    maxY = Math.max(...rooms.map((r) => r.y + r.h + WT));
  }
  const planBoxW = Math.max(36, maxX - minX);
  const planBoxH = Math.max(36, maxY - minY);

  // Layout regions
  const margin = 24; // 1/3 inch outer margin
  const titleBlockH = 64;
  const scheduleW = Math.min(220, sheetW * 0.28);
  const titleBlockY = sheetH - margin - titleBlockH;

  // Plan viewport area
  const planViewX = margin + scheduleW + 12;
  const planViewY = margin + 12;
  const planViewW = sheetW - margin - planViewX - 12;
  const planViewH = titleBlockY - planViewY - 12;

  // Scale factor S in page pt per model inch
  let S = 1;
  let scaleText;
  if (scaleOpt === '1/4') {
    // 1/4" = 1'-0" => 0.25 in paper per 12 in model = 0.25 * 72 / 12 = 1.5 pt/inch
    S = 1.5;
    scaleText = '1/4" = 1\'-0"';
  } else if (scaleOpt === '1/8') {
    // 1/8" = 1'-0" => 0.125 * 72 / 12 = 0.75 pt/inch
    S = 0.75;
    scaleText = '1/8" = 1\'-0"';
  } else if (scaleOpt === '1/2') {
    // 1/2" = 1'-0" => 0.5 * 72 / 12 = 3.0 pt/inch
    S = 3.0;
    scaleText = '1/2" = 1\'-0"';
  } else {
    // fit
    const fitSX = planViewW / planBoxW;
    const fitSY = planViewH / planBoxH;
    S = Math.min(fitSX, fitSY) * 0.9;
    // Format scale ratio approx
    const inchRatio = S / 72; // paper inches per model inch
    const ftPerInch = 1 / inchRatio / 12;
    scaleText = `Scaled (1" ≈ ${ftPerInch.toFixed(1)}')`;
  }

  // Centering offsets
  const planOffsetX = planViewX + (planViewW - planBoxW * S) / 2 - minX * S;
  const planOffsetY = planViewY + (planViewH - planBoxH * S) / 2 - minY * S;

  const px = (x) => planOffsetX + x * S;
  const py = (y) => planOffsetY + y * S;
  const pLen = (l) => l * S;

  const svgParts = [];

  // SVG Header
  svgParts.push(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}pt" height="${sheetH}pt" viewBox="0 0 ${sheetW} ${sheetH}">
<style>
  text { font-family: Arial, Helvetica, sans-serif; }
  .sheet-bg { fill: #ffffff; }
  .sheet-border { fill: none; stroke: #1a1a1a; stroke-width: 1.5; }
  .title-border { fill: none; stroke: #2a2a2a; stroke-width: 1; }
  .title-head { font-size: 14px; font-weight: bold; fill: #111111; }
  .title-sub { font-size: 9px; fill: #444444; }
  .floor-rect { fill: #faf8f5; stroke: #e0dcd3; stroke-width: 0.5; }
  .wall-struct { fill: #3a3836; stroke: #1a1a1a; stroke-width: 0.5; }
  .wall-finish { fill: #e5e2dc; stroke: #aaaaaa; stroke-width: 0.25; }
  .door-frame { stroke: #2a2a2a; stroke-width: 1; fill: none; }
  .door-swing { stroke: #555555; stroke-dasharray: 3,2; stroke-width: 0.75; fill: none; }
  .window-glass { fill: #d0e8f8; stroke: #2a2a2a; stroke-width: 0.75; }
  .item-fill { fill: #ffffff; stroke: #222222; stroke-width: 0.75; }
  .label-title { font-size: 10px; font-weight: bold; fill: #1a1a1a; text-anchor: middle; }
  .label-sub { font-size: 8px; fill: #555555; text-anchor: middle; }
  .tbl-header { font-size: 8.5px; font-weight: bold; fill: #111111; }
  .tbl-cell { font-size: 8px; fill: #222222; }
  .scale-text { font-size: 8px; fill: #222222; text-anchor: middle; }
</style>
<rect class="sheet-bg" x="0" y="0" width="${sheetW}" height="${sheetH}"/>
<rect class="sheet-border" x="${margin}" y="${margin}" width="${sheetW - margin * 2}" height="${sheetH - margin * 2}"/>`);

  // --- Group 1: Floors / Floor-fills ---
  svgParts.push('  <g id="floors">');
  svgParts.push('    <g id="floor-fills">');
  for (const r of rooms) {
    const rx = px(r.x);
    const ry = py(r.y);
    const rw = pLen(r.w);
    const rh = pLen(r.h);
    const color = ROOM_TYPES[r.type]?.color || '#faf8f5';
    svgParts.push(
      `      <rect x="${rx.toFixed(2)}" y="${ry.toFixed(2)}" width="${rw.toFixed(2)}" height="${rh.toFixed(2)}" fill="${color}" stroke="#d0cbc0" stroke-width="0.5" />`
    );

    if (r.type === 'stairs') {
      const ir = interior(r);
      const vertical = ir.h >= ir.w;
      const n = Math.ceil((r.ceiling + 10) / 7.75);
      for (let k = 1; k < n; k++) {
        if (vertical) {
          const sy = py(ir.y + (ir.h * k) / n);
          svgParts.push(
            `      <line x1="${px(ir.x).toFixed(2)}" y1="${sy.toFixed(2)}" x2="${px(ir.x + ir.w).toFixed(2)}" y2="${sy.toFixed(2)}" stroke="#8a8075" stroke-width="0.5"/>`
          );
        } else {
          const sx = px(ir.x + (ir.w * k) / n);
          svgParts.push(
            `      <line x1="${sx.toFixed(2)}" y1="${py(ir.y).toFixed(2)}" x2="${sx.toFixed(2)}" y2="${py(ir.y + ir.h).toFixed(2)}" stroke="#8a8075" stroke-width="0.5"/>`
          );
        }
      }
    }
  }
  svgParts.push('    </g>');
  svgParts.push('  </g>');

  // --- Group 2: Walls ---
  svgParts.push('  <g id="walls">');
  for (const r of rooms) {
    for (const wall of WALLS) {
      const s = wallSeg(r, wall);
      const horizontal = s.dx === 1;
      const len = s.len;
      const side = horizontal ? s.ny : s.nx;
      const inner = side > 0 ? [0, WT / 2] : [-WT / 2, 0];
      const outer = side > 0 ? [-WT / 2, 0] : [0, WT / 2];

      // Structure rect
      const outAx = px(s.ax + (horizontal ? -WT / 2 : outer[0]));
      const outAy = py(s.ay + (horizontal ? outer[0] : -WT / 2));
      const outW = pLen(horizontal ? len + WT : WT / 2);
      const outH = pLen(horizontal ? WT / 2 : len + WT);
      svgParts.push(
        `    <rect class="wall-struct" x="${outAx.toFixed(2)}" y="${outAy.toFixed(2)}" width="${outW.toFixed(2)}" height="${outH.toFixed(2)}"/>`
      );

      // Finish rect
      const inAx = px(s.ax + (horizontal ? -WT / 2 : inner[0]));
      const inAy = py(s.ay + (horizontal ? inner[0] : -WT / 2));
      const inW = pLen(horizontal ? len + WT : WT / 2);
      const inH = pLen(horizontal ? WT / 2 : len + WT);
      svgParts.push(
        `    <rect class="wall-finish" x="${inAx.toFixed(2)}" y="${inAy.toFixed(2)}" width="${inW.toFixed(2)}" height="${inH.toFixed(2)}"/>`
      );
    }
  }
  svgParts.push('  </g>');

  // --- Group 3: Openings ---
  svgParts.push('  <g id="openings">');
  for (const r of rooms) {
    for (const o of r.openings) {
      const def = OPENING_BY_ID[o.type];
      const a = wallPoint(r, o.wall, o.offset, 0);
      const s = wallSeg(r, o.wall);
      const horizontal = s.dx === 1;
      const ax = px(a.x);
      const ay = py(a.y);
      const ow = pLen(o.width);
      const th = pLen(WT + 0.6);

      if (def?.kind === 'window') {
        const wx = horizontal ? ax : ax - th / 2;
        const wy = horizontal ? ay - th / 2 : ay;
        const ww = horizontal ? ow : th;
        const wh = horizontal ? th : ow;
        svgParts.push(
          `    <rect class="window-glass" x="${wx.toFixed(2)}" y="${wy.toFixed(2)}" width="${ww.toFixed(2)}" height="${wh.toFixed(2)}"/>`
        );
        // Glass pane line
        if (horizontal) {
          svgParts.push(
            `    <line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${(ax + ow).toFixed(2)}" y2="${ay.toFixed(2)}" stroke="#1e5078" stroke-width="1.2"/>`
          );
        } else {
          svgParts.push(
            `    <line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${ax.toFixed(2)}" y2="${(ay + ow).toFixed(2)}" stroke="#1e5078" stroke-width="1.2"/>`
          );
        }
      } else {
        // Door
        const dir = o.swing === 'out' ? -1 : 1;
        const nx = s.nx * dir;
        const ny = s.ny * dir;
        const hx = ax;
        const hy = ay;
        const lx = hx + nx * ow;
        const ly = hy + ny * ow;
        // Leaf line
        svgParts.push(
          `    <line class="door-frame" x1="${hx.toFixed(2)}" y1="${hy.toFixed(2)}" x2="${lx.toFixed(2)}" y2="${ly.toFixed(2)}"/>`
        );

        // Swing arc
        const ex = hx + s.dx * ow;
        const ey = hy + s.dy * ow;
        const ang0 = Math.atan2(ly - hy, lx - hx);
        const ang1 = Math.atan2(ey - hy, ex - hx);
        let d = ang1 - ang0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const sweep = d >= 0 ? 1 : 0;
        const rPt = ow;
        const arcX = ex;
        const arcY = ey;
        svgParts.push(
          `    <path class="door-swing" d="M ${lx.toFixed(2)} ${ly.toFixed(2)} A ${rPt.toFixed(2)} ${rPt.toFixed(2)} 0 0 ${sweep} ${arcX.toFixed(2)} ${arcY.toFixed(2)}"/>`
        );
      }
    }
  }
  svgParts.push('  </g>');

  // --- Group 4: Furniture / Items ---
  svgParts.push('  <g id="furniture">');
  svgParts.push('    <g id="items">');
  for (const r of rooms) {
    for (const it of r.items) {
      const def = ITEM_BY_ID[it.type];
      if (!def) continue;

      if (def.mount === 'wall') {
        const p = wallPoint(r, it.wall, it.offset, 0);
        const cx = px(p.x);
        const cy = py(p.y);
        svgParts.push(
          `      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="2.5" fill="${def.color || '#222'}" stroke="#000" stroke-width="0.5"/>`
        );
      } else if (def.mount === 'ceiling') {
        const cx = px(it.x);
        const cy = py(it.y);
        const cr = pLen(def.w / 2);
        svgParts.push(
          `      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${cr.toFixed(2)}" fill="${def.color || '#fff'}" stroke="#222" stroke-width="0.5"/>`
        );
      } else {
        const cx = px(it.x);
        const cy = py(it.y);
        const iw = pLen(def.w);
        const id = pLen(def.d);
        const rot = it.rot || 0;
        const ix = -iw / 2;
        const iy = -id / 2;

        svgParts.push(
          `      <g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) rotate(${rot})">`
        );
        svgParts.push(
          `        <rect class="item-fill" x="${ix.toFixed(2)}" y="${iy.toFixed(2)}" width="${iw.toFixed(2)}" height="${id.toFixed(2)}" rx="2" fill="${def.color || '#fff'}"/>`
        );

        // Decorative details based on shape
        if (def.shape === 'bed') {
          svgParts.push(
            `        <rect x="${(ix + 1).toFixed(2)}" y="${(iy + id * 0.3).toFixed(2)}" width="${(iw - 2).toFixed(2)}" height="${(id * 0.65).toFixed(2)}" fill="#f0eae1" stroke="#aaaaaa" stroke-width="0.3"/>`
          );
        } else if (def.shape === 'toilet') {
          svgParts.push(
            `        <ellipse cx="0" cy="${(iy + id * 0.6).toFixed(2)}" rx="${(iw * 0.38).toFixed(2)}" ry="${(id * 0.32).toFixed(2)}" fill="#ffffff" stroke="#333333" stroke-width="0.5"/>`
          );
        } else if (def.shape === 'tub') {
          svgParts.push(
            `        <rect x="${(ix + 2).toFixed(2)}" y="${(iy + 2).toFixed(2)}" width="${(iw - 4).toFixed(2)}" height="${(id - 4).toFixed(2)}" rx="6" fill="#e8f4f8" stroke="#333333" stroke-width="0.5"/>`
          );
        }
        svgParts.push('      </g>');
      }
    }
  }
  svgParts.push('    </g>');
  svgParts.push('  </g>');

  // --- Group 5: Room Labels ---
  svgParts.push('  <g id="labels">');
  for (const r of rooms) {
    const ir = interior(r);
    const cx = px(r.x + r.w / 2);
    const cy = py(r.y + r.h / 2);
    const area = floorAreaSqFt(r);
    const label = escXml(r.name);
    const sub = `${fmt(ir.w)} × ${fmt(ir.h)} · ${area.toFixed(0)} sq ft`;

    svgParts.push(`    <g transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)})">`);
    svgParts.push(`      <text class="label-title" x="0" y="-2">${label}</text>`);
    svgParts.push(`      <text class="label-sub" x="0" y="8">${escXml(sub)}</text>`);
    svgParts.push('    </g>');
  }
  svgParts.push('  </g>');

  // --- Group 6: Room Schedule Table ---
  svgParts.push('  <g id="room-schedule">');
  svgParts.push('    <g id="schedule">');
  const schedX = margin + 10;
  const schedY = margin + 10;
  const colW = [70, 48, 52, 38];
  const totalSchedW = colW.reduce((a, b) => a + b, 0);
  const rowH = 14;

  // Header background
  svgParts.push(
    `      <rect x="${schedX}" y="${schedY}" width="${totalSchedW}" height="${rowH}" fill="#e8e4dc" stroke="#222" stroke-width="0.75"/>`
  );
  svgParts.push(
    `      <text class="tbl-header" x="${schedX + 4}" y="${schedY + 10}">ROOM NAME</text>`
  );
  svgParts.push(
    `      <text class="tbl-header" x="${schedX + colW[0] + 4}" y="${schedY + 10}">TYPE</text>`
  );
  svgParts.push(
    `      <text class="tbl-header" x="${schedX + colW[0] + colW[1] + 4}" y="${schedY + 10}">SIZE</text>`
  );
  svgParts.push(
    `      <text class="tbl-header" x="${schedX + colW[0] + colW[1] + colW[2] + 4}" y="${schedY + 10}">AREA</text>`
  );

  let currentY = schedY + rowH;
  let totalArea = 0;

  rooms.forEach((r, idx) => {
    const ir = interior(r);
    const area = floorAreaSqFt(r);
    totalArea += area;
    const bg = idx % 2 === 0 ? '#ffffff' : '#f7f5f0';
    svgParts.push(
      `      <rect x="${schedX}" y="${currentY}" width="${totalSchedW}" height="${rowH}" fill="${bg}" stroke="#ccc" stroke-width="0.25"/>`
    );
    svgParts.push(
      `      <text class="tbl-cell" x="${schedX + 4}" y="${currentY + 10}">${escXml(r.name)}</text>`
    );
    svgParts.push(
      `      <text class="tbl-cell" x="${schedX + colW[0] + 4}" y="${currentY + 10}">${escXml(ROOM_TYPES[r.type]?.name || r.type)}</text>`
    );
    svgParts.push(
      `      <text class="tbl-cell" x="${schedX + colW[0] + colW[1] + 4}" y="${currentY + 10}">${fmt(ir.w)} × ${fmt(ir.h)}</text>`
    );
    svgParts.push(
      `      <text class="tbl-cell" x="${schedX + colW[0] + colW[1] + colW[2] + 4}" y="${currentY + 10}">${area.toFixed(0)} sf</text>`
    );
    currentY += rowH;
  });

  // Summary Row
  svgParts.push(
    `      <rect x="${schedX}" y="${currentY}" width="${totalSchedW}" height="${rowH}" fill="#dfdbd2" stroke="#222" stroke-width="0.5"/>`
  );
  svgParts.push(
    `      <text class="tbl-header" x="${schedX + 4}" y="${currentY + 10}">TOTAL (${rooms.length} ROOMS)</text>`
  );
  svgParts.push(
    `      <text class="tbl-header" x="${schedX + colW[0] + colW[1] + colW[2] + 4}" y="${currentY + 10}">${totalArea.toFixed(0)} sf</text>`
  );
  svgParts.push('    </g>');
  svgParts.push('  </g>');

  // --- Group 7: Title Block & Graphic Scale Bar ---
  svgParts.push('  <g id="title-block">');
  svgParts.push(
    `    <rect class="title-border" x="${margin + 4}" y="${titleBlockY}" width="${sheetW - margin * 2 - 8}" height="${titleBlockH}"/>`
  );

  // Title Block Divider lines
  const divX1 = margin + 220;
  const divX2 = sheetW - margin - 220;
  svgParts.push(
    `    <line x1="${divX1}" y1="${titleBlockY}" x2="${divX1}" y2="${titleBlockY + titleBlockH}" stroke="#2a2a2a" stroke-width="0.5"/>`
  );
  svgParts.push(
    `    <line x1="${divX2}" y1="${titleBlockY}" x2="${divX2}" y2="${titleBlockY + titleBlockH}" stroke="#2a2a2a" stroke-width="0.5"/>`
  );

  // Left metadata
  svgParts.push(
    `    <text class="title-head" x="${margin + 12}" y="${titleBlockY + 22}">${escXml(doc.name || 'Floor Plan')}</text>`
  );
  const levelName = targetLevel !== null ? `Floor ${targetLevel + 1}` : 'All Floors';
  const dateStr = new Date().toISOString().slice(0, 10);
  svgParts.push(
    `    <text class="title-sub" x="${margin + 12}" y="${titleBlockY + 38}">${escXml(levelName)} · Date: ${dateStr} · Sheet: ${sheetSize.toUpperCase()} (${orientation})</text>`
  );
  svgParts.push(
    `    <text class="title-sub" x="${margin + 12}" y="${titleBlockY + 52}">Architectural Scale: ${escXml(scaleText)}</text>`
  );

  // Middle Section: Graphic Scale Bar
  const scaleBarCenterX = (divX1 + divX2) / 2;
  const scaleBarY = titleBlockY + 32;

  // Let's create a scale bar showing 0, 2', 4', 8'
  // 1 foot in model = 12 inches. Length of 1 ft on sheet in pt = 12 * S.
  const ftPt = 12 * S;
  // Use scale steps: e.g. 4 ft or 8 ft total
  const scaleFeet = [0, 2, 4, 8];
  const totalFeet = 8;
  const scaleBarWidth = totalFeet * ftPt;
  const barStartX = scaleBarCenterX - scaleBarWidth / 2;

  svgParts.push(
    `    <text class="title-sub" x="${scaleBarCenterX}" y="${titleBlockY + 16}" text-anchor="middle" font-weight="bold">GRAPHIC SCALE</text>`
  );

  // Main scale line / bars
  svgParts.push(
    `    <rect x="${barStartX.toFixed(2)}" y="${scaleBarY.toFixed(2)}" width="${scaleBarWidth.toFixed(2)}" height="4" fill="none" stroke="#111" stroke-width="0.75"/>`
  );

  // Alternating segments
  for (let i = 0; i < scaleFeet.length - 1; i++) {
    const f0 = scaleFeet[i];
    const f1 = scaleFeet[i + 1];
    const x0 = barStartX + f0 * ftPt;
    const wSegment = (f1 - f0) * ftPt;
    const fill = i % 2 === 0 ? '#111111' : '#ffffff';
    svgParts.push(
      `    <rect x="${x0.toFixed(2)}" y="${scaleBarY.toFixed(2)}" width="${wSegment.toFixed(2)}" height="4" fill="${fill}" stroke="#111" stroke-width="0.5"/>`
    );
  }

  // Ticks and Labels
  scaleFeet.forEach((ft) => {
    const tickX = barStartX + ft * ftPt;
    svgParts.push(
      `    <line x1="${tickX.toFixed(2)}" y1="${(scaleBarY - 2).toFixed(2)}" x2="${tickX.toFixed(2)}" y2="${(scaleBarY + 6).toFixed(2)}" stroke="#111" stroke-width="0.75"/>`
    );
    svgParts.push(
      `    <text class="scale-text" x="${tickX.toFixed(2)}" y="${(scaleBarY + 15).toFixed(2)}">${ft}'</text>`
    );
  });

  // Right metadata: App Branding
  svgParts.push(
    `    <text class="title-head" x="${sheetW - margin - 12}" y="${titleBlockY + 24}" text-anchor="end">HOMEGEN</text>`
  );
  svgParts.push(
    `    <text class="title-sub" x="${sheetW - margin - 12}" y="${titleBlockY + 40}" text-anchor="end">Structured CAD &amp; Vector Deliverable</text>`
  );
  svgParts.push(
    `    <text class="title-sub" x="${sheetW - margin - 12}" y="${titleBlockY + 52}" text-anchor="end">Code-Compliant Architectural Sheet</text>`
  );

  svgParts.push('  </g>');

  // Footer
  svgParts.push('</svg>');

  return svgParts.join('\n');
}
