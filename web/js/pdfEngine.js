// Pure client-side vector PDF generator for Homegen floorplans
import { jsPDF } from '#jspdf';
import { WT, WALLS, wallSeg, wallPoint, interior, floorAreaSqFt } from './geometry.js';
import { ROOM_TYPES, ITEM_BY_ID, OPENING_BY_ID } from './catalog.js';
import { drawStampPDF, drawWatermarkPDF } from './stampEngine.js';

// Standard sheet sizes in points (1 in = 72 pt)
export const SHEET_SIZES = {
  Letter: { name: 'ANSI A / Letter (8.5" x 11")', w: 612, h: 792 },
  Tabloid: { name: 'ANSI B / Tabloid (11" x 17")', w: 792, h: 1224 },
  ARCH_C: { name: 'ARCH C (18" x 24")', w: 1296, h: 1728 },
  ARCH_D: { name: 'ARCH D (24" x 36")', w: 1728, h: 2592 },
  A4: { name: 'ISO A4 (210 x 297 mm)', w: 595.28, h: 841.89 },
  A3: { name: 'ISO A3 (297 x 420 mm)', w: 841.89, h: 1190.55 },
};

// Scale definitions (model is in inches; 1 in paper = 72 pt)
export const SCALE_OPTIONS = {
  '1/4"=1\'0"': {
    label: '1/4" = 1\'-0" (1:48)',
    ptPerInch: 1.5,
    ratioStr: '1/4" = 1\'-0"',
    feetPerSeg: 4,
  },
  '1/8"=1\'0"': {
    label: '1/8" = 1\'-0" (1:96)',
    ptPerInch: 0.75,
    ratioStr: '1/8" = 1\'-0"',
    feetPerSeg: 8,
  },
  '1/2"=1\'0"': {
    label: '1/2" = 1\'-0" (1:24)',
    ptPerInch: 3.0,
    ratioStr: '1/2" = 1\'-0"',
    feetPerSeg: 2,
  },
  '1:50': { label: '1:50 (Metric)', ptPerInch: 1.44, ratioStr: '1:50', metric: true, mPerSeg: 1 },
  '1:100': {
    label: '1:100 (Metric)',
    ptPerInch: 0.72,
    ratioStr: '1:100',
    metric: true,
    mPerSeg: 2,
  },
  fit: { label: 'Fit to Page', fit: true, ratioStr: 'Fit to Page' },
};

const fmtLen = (inches) => {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  return `${ft}'${inch ? ` ${inch}"` : ''}`;
};

/**
 * Generates a pure vector PDF for a Homegen plan.
 * Returns a jsPDF document instance.
 */
export function generatePDF(docState, options = {}) {
  if (!docState || !docState.rooms || docState.rooms.length === 0) {
    throw new Error('Cannot export PDF: add at least one room first.');
  }

  const sheetKey = options.pageSize || 'Letter';
  const sheetDef = SHEET_SIZES[sheetKey] || SHEET_SIZES.Letter;
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';

  const pageWidth =
    orientation === 'landscape'
      ? Math.max(sheetDef.w, sheetDef.h)
      : Math.min(sheetDef.w, sheetDef.h);
  const pageHeight =
    orientation === 'landscape'
      ? Math.min(sheetDef.w, sheetDef.h)
      : Math.max(sheetDef.w, sheetDef.h);

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [pageWidth, pageHeight],
  });

  const levelOpt = options.level !== undefined ? options.level : 'all';
  const levelsToDraw =
    levelOpt === 'all'
      ? Array.from(new Set(docState.rooms.map((r) => r.level || 0))).sort((a, b) => a - b)
      : [parseInt(levelOpt, 10) || 0];

  if (levelsToDraw.length === 0) levelsToDraw.push(0);

  const margin = options.margin !== undefined ? options.margin : 18; // 1/4 inch margin
  const includeTitleBlock = options.includeTitleBlock !== false;
  const includeScaleBar = options.includeScaleBar !== false;
  const includeRoomSchedule = options.includeRoomSchedule !== false;

  // Resolve branding configuration
  let branding = { logoDataUrl: null, stamp: { enabled: false }, watermark: { enabled: false } };
  const brandingMode = options.brandingMode || 'project';

  if (brandingMode === 'project') {
    branding = docState?.settings?.branding || branding;
  } else if (brandingMode === 'session') {
    branding = options.sessionBranding || options.branding || branding;
  } else if (brandingMode === 'none') {
    branding = { logoDataUrl: null, stamp: { enabled: false }, watermark: { enabled: false } };
  }

  const incLogo = options.includeLogo !== undefined ? options.includeLogo : true;
  const incStamp = options.includeStamp !== undefined ? options.includeStamp : true;
  const incWatermark = options.includeWatermark !== undefined ? options.includeWatermark : true;

  for (let i = 0; i < levelsToDraw.length; i++) {
    const lvl = levelsToDraw[i];
    if (i > 0) pdf.addPage([pageWidth, pageHeight], orientation);

    // Compute sheet content areas
    const borderRect = {
      x: margin,
      y: margin,
      w: pageWidth - margin * 2,
      h: pageHeight - margin * 2,
    };

    // Draw sheet border
    drawSheetBorder(pdf, borderRect);

    // Title Block dimensions
    let titleBlockBox = null;
    if (includeTitleBlock) {
      const tbWidth = Math.min(220, borderRect.w * 0.35);
      const tbHeight = 64;
      titleBlockBox = {
        x: borderRect.x + borderRect.w - tbWidth,
        y: borderRect.y + borderRect.h - tbHeight,
        w: tbWidth,
        h: tbHeight,
      };
    }

    // Room Schedule position (if on main page)
    const levelRooms = docState.rooms.filter((r) => (r.level || 0) === lvl);

    // Calculate drawing area for floorplan
    const drawingArea = {
      x: borderRect.x + 10,
      y: borderRect.y + 10,
      w: borderRect.w - 20,
      h: borderRect.h - (titleBlockBox ? titleBlockBox.h + 20 : 20),
    };

    // Calculate scale and center floorplan
    const scaleKey = options.scale || '1/4"=1\'0"';
    const scaleOpt = SCALE_OPTIONS[scaleKey] || SCALE_OPTIONS['1/4"=1\'0"'];

    let scalePt = scaleOpt.ptPerInch;
    let actualRatioStr = scaleOpt.ratioStr;

    // Model bounds
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of levelRooms) {
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.w > maxX) maxX = r.x + r.w;
      if (r.y + r.h > maxY) maxY = r.y + r.h;
    }

    if (minX === Infinity) {
      minX = 0;
      minY = 0;
      maxX = 240;
      maxY = 240;
    }
    const modelW = maxX - minX;
    const modelH = maxY - minY;

    if (scaleOpt.fit || !scalePt) {
      const fitW = (drawingArea.w - 40) / modelW;
      const fitH = (drawingArea.h - 40) / modelH;
      scalePt = Math.max(0.2, Math.min(fitW, fitH));
      actualRatioStr = `Fit to Page (1:${Math.round(72 / (scalePt * 12))})`;
    }

    const drawingCx = drawingArea.x + drawingArea.w / 2;
    const drawingCy = drawingArea.y + drawingArea.h / 2;
    const modelCx = minX + modelW / 2;
    const modelCy = minY + modelH / 2;

    const toPdfX = (mx) => drawingCx + (mx - modelCx) * scalePt;
    const toPdfY = (my) => drawingCy + (my - modelCy) * scalePt;
    const toPdfDim = (m) => m * scalePt;

    // Draw Floorplan Vector Geometry
    drawFloorplanVector(pdf, docState, levelRooms, { toPdfX, toPdfY, toPdfDim, scalePt });

    // Draw Diagonal Watermark
    if (incWatermark && branding.watermark?.enabled !== false && branding.watermark?.text) {
      drawWatermarkPDF(pdf, branding.watermark, drawingArea);
    }

    // Draw Title Block
    if (includeTitleBlock && titleBlockBox) {
      drawTitleBlock(pdf, titleBlockBox, {
        projectTitle: options.projectTitle || docState.name || 'Untitled Home',
        designer: options.designer || 'Homegen Designer',
        date: options.date || new Date().toISOString().slice(0, 10),
        sheetTitle: options.sheetTitle || `FLOOR PLAN - LEVEL ${lvl + 1}`,
        sheetNumber: `A-10${lvl + 1}`,
        scaleLabel: actualRatioStr,
        notes: options.notes || '',
      });
    }

    // Draw Embedded or Session Logo
    if (incLogo && branding.logoDataUrl) {
      drawLogoPDF(pdf, branding.logoDataUrl, borderRect.x + 10, borderRect.y + 10, 75, 28);
    }

    // Draw Approval Stamp Stencil
    if (incStamp && branding.stamp?.enabled !== false && branding.stamp) {
      const stampW = 85;
      const stampH = 65;
      const stampX =
        borderRect.x + borderRect.w - (titleBlockBox ? titleBlockBox.w + stampW + 10 : stampW + 15);
      const stampY = borderRect.y + borderRect.h - (titleBlockBox ? stampH + 5 : stampH + 15);
      drawStampPDF(pdf, branding.stamp, stampX, stampY, stampW, stampH);
    }

    // Draw Graphic Scale Bar
    if (includeScaleBar) {
      const sbX = borderRect.x + 15;
      const sbY = borderRect.y + borderRect.h - 32;
      drawGraphicScaleBar(pdf, sbX, sbY, scalePt, scaleOpt, actualRatioStr);
    }
  }

  // Draw Room Schedule Table on separate page or paginated if requested
  if (includeRoomSchedule && docState.rooms.length > 0) {
    drawRoomSchedulePages(pdf, docState, {
      pageWidth,
      pageHeight,
      margin,
      orientation,
      projectTitle: options.projectTitle || docState.name || 'Untitled Home',
      designer: options.designer || 'Homegen Designer',
      date: options.date || new Date().toISOString().slice(0, 10),
      includeTitleBlock,
    });
  }

  return pdf;
}

/**
 * Draws outer sheet border and double lines.
 */
function drawSheetBorder(pdf, r) {
  pdf.setDrawColor('#222222');
  pdf.setLineWidth(1.2);
  pdf.rect(r.x, r.y, r.w, r.h, 'S');
  pdf.setLineWidth(0.5);
  pdf.rect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 'S');
}

/**
 * Draws the vector floorplan geometry on the current page.
 */
function drawFloorplanVector(pdf, state, levelRooms, transform) {
  const { toPdfX, toPdfY, toPdfDim } = transform;

  // 1. Room Floor Fills
  for (const room of levelRooms) {
    const rx = toPdfX(room.x);
    const ry = toPdfY(room.y);
    const rw = toPdfDim(room.w);
    const rh = toPdfDim(room.h);

    const roomType = ROOM_TYPES[room.type] || { color: '#f7f5f0' };

    pdf.setFillColor(roomType.color || '#f7f5f0');
    pdf.setDrawColor('#cccccc');
    pdf.setLineWidth(0.4);
    pdf.rect(rx, ry, rw, rh, 'FD');

    if (room.type === 'stairs') {
      drawStairsVector(pdf, room, transform);
    }
  }

  // 2. Room Items (Floor Items - flat/rugs first)
  for (const room of levelRooms) {
    for (const item of room.items) {
      const def = ITEM_BY_ID[item.type];
      if (def && def.flat) drawItemVector(pdf, room, item, def, transform);
    }
  }

  // 3. Walls & Openings
  for (const room of levelRooms) {
    drawWallsVector(pdf, state, room, transform);
  }

  // 4. Room Items (Non-flat floor furniture, ceiling, wall)
  for (const room of levelRooms) {
    for (const item of room.items) {
      const def = ITEM_BY_ID[item.type];
      if (def && !def.flat) drawItemVector(pdf, room, item, def, transform);
    }
  }

  // 5. Room Labels & Dimensions
  for (const room of levelRooms) {
    drawRoomLabelVector(pdf, room, transform);
  }
}

/**
 * Draws vector stair treads.
 */
function drawStairsVector(pdf, room, { toPdfX, toPdfY }) {
  const ir = interior(room);
  const vertical = ir.h >= ir.w;
  const n = Math.ceil((room.ceiling + 10) / 7.75);

  pdf.setDrawColor('#555555');
  pdf.setLineWidth(0.5);

  for (let k = 1; k < n; k++) {
    if (vertical) {
      const y = ir.y + (ir.h * k) / n;
      pdf.line(toPdfX(ir.x), toPdfY(y), toPdfX(ir.x + ir.w), toPdfY(y));
    } else {
      const x = ir.x + (ir.w * k) / n;
      pdf.line(toPdfX(x), toPdfY(ir.y), toPdfX(x), toPdfY(ir.y + ir.h));
    }
  }
}

/**
 * Draws walls and wall openings (doors, windows).
 */
function drawWallsVector(pdf, state, room, transform) {
  const { toPdfX, toPdfY, toPdfDim } = transform;

  for (const wall of WALLS) {
    const s = wallSeg(room, wall);
    const horizontal = s.dx === 1;
    const side = horizontal ? s.ny : s.nx;

    const innerDepth = side > 0 ? [0, WT / 2] : [-WT / 2, 0];
    const outerDepth = side > 0 ? [-WT / 2, 0] : [0, WT / 2];

    // Outer structural wall
    const ox0 = s.ax + (horizontal ? -WT / 2 : outerDepth[0]);
    const oy0 = s.ay + (horizontal ? outerDepth[0] : -WT / 2);
    const ow = horizontal ? s.len + WT : outerDepth[1] - outerDepth[0];
    const oh = horizontal ? outerDepth[1] - outerDepth[0] : s.len + WT;

    pdf.setFillColor('#3c3a38');
    pdf.rect(toPdfX(ox0), toPdfY(oy0), toPdfDim(ow), toPdfDim(oh), 'F');

    // Inner finish
    const ix0 = s.ax + (horizontal ? -WT / 2 : innerDepth[0]);
    const iy0 = s.ay + (horizontal ? innerDepth[0] : -WT / 2);
    const iw = horizontal ? s.len + WT : innerDepth[1] - innerDepth[0];
    const ih = horizontal ? innerDepth[1] - innerDepth[0] : s.len + WT;

    pdf.setFillColor('#d3d0c8');
    pdf.rect(toPdfX(ix0), toPdfY(iy0), toPdfDim(iw), toPdfDim(ih), 'F');
  }

  // Openings
  for (const o of room.openings) {
    drawOpeningVector(pdf, room, o, transform);
  }
}

/**
 * Draws doors and windows as vector paths.
 */
function drawOpeningVector(pdf, room, o, transform) {
  const { toPdfX, toPdfY, toPdfDim } = transform;
  const def = OPENING_BY_ID[o.type] || { kind: 'door' };

  const a = wallPoint(room, o.wall, o.offset, 0);
  const s = wallSeg(room, o.wall);
  const horizontal = s.dx === 1;
  const th = WT + 0.6;

  // Gap in wall
  const gx = a.x - (horizontal ? 0 : th / 2);
  const gy = a.y - (horizontal ? th / 2 : 0);
  const gw = horizontal ? o.width : th;
  const gh = horizontal ? th : o.width;

  pdf.setFillColor('#ffffff');
  pdf.rect(toPdfX(gx), toPdfY(gy), toPdfDim(gw), toPdfDim(gh), 'F');

  if (def.kind === 'window') {
    pdf.setDrawColor('#2d2a26');
    pdf.setLineWidth(0.8);
    pdf.rect(toPdfX(gx), toPdfY(gy), toPdfDim(gw), toPdfDim(gh), 'S');

    // Glass pane line
    pdf.setFillColor('#bde0fe');
    if (horizontal) {
      pdf.rect(toPdfX(a.x), toPdfY(a.y - 1), toPdfDim(o.width), toPdfDim(2), 'F');
    } else {
      pdf.rect(toPdfX(a.x - 1), toPdfY(a.y), toPdfDim(2), toPdfDim(o.width), 'F');
    }
  } else {
    // Door leaf and swing arc
    const dir = o.swing === 'out' ? -1 : 1;
    const nx = s.nx * dir;
    const ny = s.ny * dir;

    const hx = a.x;
    const hy = a.y;
    const lx = hx + nx * o.width;
    const ly = hy + ny * o.width;

    // Door leaf line
    pdf.setDrawColor('#2d2a26');
    pdf.setLineWidth(1.0);
    pdf.line(toPdfX(hx), toPdfY(hy), toPdfX(lx), toPdfY(ly));

    // Swing arc
    const ang0 = Math.atan2(ny * o.width, nx * o.width);
    const ang1 = Math.atan2(s.dy * o.width, s.dx * o.width);

    let d = ang1 - ang0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;

    drawVectorArc(pdf, toPdfX(hx), toPdfY(hy), toPdfDim(o.width), ang0, ang0 + d, true);
  }
}

/**
 * Draws a dashed or solid arc segment for door swings.
 */
function drawVectorArc(pdf, cx, cy, rPt, startAng, endAng, dashed = true) {
  pdf.setDrawColor('#666666');
  pdf.setLineWidth(0.5);

  const steps = 12;
  const da = (endAng - startAng) / steps;
  let px = cx + rPt * Math.cos(startAng);
  let py = cy + rPt * Math.sin(startAng);

  for (let i = 1; i <= steps; i++) {
    const a = startAng + da * i;
    const nx = cx + rPt * Math.cos(a);
    const ny = cy + rPt * Math.sin(a);
    if (!dashed || i % 2 === 1) {
      pdf.line(px, py, nx, ny);
    }
    px = nx;
    py = ny;
  }
}

/**
 * Draws items (furniture, appliances, ceiling fixtures, wall outlets).
 */
function drawItemVector(pdf, room, item, def, transform) {
  const { toPdfX, toPdfY, toPdfDim } = transform;

  if (def.mount === 'wall') {
    const p = wallPoint(room, item.wall, item.offset, 0);
    pdf.setFillColor(def.color || '#333333');
    pdf.setDrawColor('#111111');
    pdf.setLineWidth(0.5);
    pdf.circle(toPdfX(p.x), toPdfY(p.y), 2, 'FD');
    return;
  }

  if (def.mount === 'ceiling') {
    const cx = toPdfX(item.x);
    const cy = toPdfY(item.y);
    const rPt = Math.max(3, toPdfDim(def.w / 2));

    pdf.setFillColor(def.color || '#ffeeaa');
    pdf.setDrawColor('#333333');
    pdf.setLineWidth(0.6);
    pdf.circle(cx, cy, rPt, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(Math.max(5, rPt * 0.9));
    pdf.setTextColor('#111111');

    let sym = 'L';
    if (def.shape === 'light') sym = '*';
    else if (def.shape === 'fan') sym = 'F';
    else if (def.shape === 'alarm') {
      sym =
        (def.func || []).includes('co') && (def.func || []).includes('smoke')
          ? 'S+C'
          : (def.func || []).includes('co')
            ? 'CO'
            : 'S';
    }
    pdf.text(sym, cx, cy + rPt * 0.3, { align: 'center' });
    return;
  }

  // Floor mounted items
  const rotRad = ((item.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const w = def.w;
  const d = def.d;

  // Polygon corner helper in item local coords
  const transformPoint = (lx, ly) => {
    const wx = item.x + lx * cos - ly * sin;
    const wy = item.y + lx * sin + ly * cos;
    return { x: toPdfX(wx), y: toPdfY(wy) };
  };

  const drawLocalRect = (
    lx,
    ly,
    lw,
    lh,
    fillColor = def.color || '#dddddd',
    strokeColor = '#333333'
  ) => {
    const p0 = transformPoint(lx, ly);
    const p1 = transformPoint(lx + lw, ly);
    const p2 = transformPoint(lx + lw, ly + lh);
    const p3 = transformPoint(lx, ly + lh);

    pdf.setFillColor(fillColor);
    pdf.setDrawColor(strokeColor);
    pdf.setLineWidth(0.5);

    const delta1 = [p1.x - p0.x, p1.y - p0.y];
    const delta2 = [p2.x - p1.x, p2.y - p1.y];
    const delta3 = [p3.x - p2.x, p3.y - p2.y];
    const delta4 = [p0.x - p3.x, p0.y - p3.y];

    pdf.lines([delta1, delta2, delta3, delta4], p0.x, p0.y, [1, 1], 'FD', true);
  };

  drawLocalRect(-w / 2, -d / 2, w, d, def.color || '#e2d9cc', '#444444');

  // Interior detail for specific items
  if (def.shape === 'bed') {
    drawLocalRect(-w / 2 + 2, -d / 2 + d * 0.28, w - 4, d * 0.68, '#fbf9f5', '#666666');
    const pw = w > 45 ? (w - 8) / 2 : w - 6;
    const count = w > 45 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      drawLocalRect(-w / 2 + 3 + k * (pw + 2), -d / 2 + 3, pw, d * 0.2, '#ffffff', '#888888');
    }
  } else if (def.shape === 'sofa') {
    drawLocalRect(-w / 2, -d / 2, w, d * 0.28, '#bfa893', '#444444');
  } else if (def.shape === 'toilet') {
    drawLocalRect(-w / 2 + 2, -d / 2, w - 4, d * 0.32, '#ffffff', '#555555');
  } else if (def.shape === 'sink') {
    drawLocalRect(-w / 2 + w * 0.2, -d / 2 + d * 0.2, w * 0.6, d * 0.55, '#eaf3f7', '#666666');
  } else if (def.shape === 'tub') {
    drawLocalRect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6, '#dff1f7', '#666666');
  }
}

/**
 * Draws room label text (Name, Dimensions, Area).
 */
function drawRoomLabelVector(pdf, room, transform) {
  const { toPdfX, toPdfY } = transform;
  const ir = interior(room);
  const area = floorAreaSqFt(room);

  const cx = toPdfX(room.x + room.w / 2);
  const cy = toPdfY(room.y + room.h / 2);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor('#222222');
  pdf.text(room.name.toUpperCase(), cx, cy - 3, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor('#555555');
  const sub = `${fmtLen(ir.w)} × ${fmtLen(ir.h)} · ${area.toFixed(0)} sq ft`;
  pdf.text(sub, cx, cy + 6, { align: 'center' });
}

/**
 * Draws the Architectural Title Block.
 */
function drawTitleBlock(pdf, box, info) {
  pdf.setFillColor('#ffffff');
  pdf.setDrawColor('#111111');
  pdf.setLineWidth(1.0);
  pdf.rect(box.x, box.y, box.w, box.h, 'FD');

  // Horizontal divisions
  pdf.setLineWidth(0.5);
  pdf.line(box.x, box.y + 18, box.x + box.w, box.y + 18);
  pdf.line(box.x, box.y + 36, box.x + box.w, box.y + 36);

  // Vertical divisions on second row
  pdf.line(box.x + box.w * 0.5, box.y + 18, box.x + box.w * 0.5, box.y + 36);
  pdf.line(box.x + box.w * 0.5, box.y + 36, box.x + box.w * 0.5, box.y + box.h);

  // Text formatting
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor('#000000');
  pdf.text(info.projectTitle.toUpperCase(), box.x + 6, box.y + 12);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  pdf.setTextColor('#444444');
  pdf.text(`DESIGNER: ${info.designer}`, box.x + 6, box.y + 28);
  pdf.text(`DATE: ${info.date}`, box.x + box.w * 0.5 + 4, box.y + 28);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.setTextColor('#111111');
  pdf.text(info.sheetTitle, box.x + 6, box.y + 48);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  pdf.text(`SCALE: ${info.scaleLabel}`, box.x + 6, box.y + 58);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(info.sheetNumber, box.x + box.w * 0.5 + 4, box.y + 54);
}

/**
 * Draws the Graphic Scale Bar.
 */
function drawGraphicScaleBar(pdf, x, y, scalePt, scaleOpt, ratioStr) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.setTextColor('#222222');
  pdf.text(`SCALE: ${ratioStr}`, x, y - 4);

  const metric = scaleOpt.metric;
  const stepModelUnits = metric
    ? (scaleOpt.mPerSeg || 1) * 39.3701
    : (scaleOpt.feetPerSeg || 4) * 12;
  const segCount = 4;
  const segPtWidth = stepModelUnits * scalePt;
  const barHeight = 4;

  for (let k = 0; k < segCount; k++) {
    const segX = x + k * segPtWidth;
    pdf.setFillColor(k % 2 === 0 ? '#111111' : '#ffffff');
    pdf.setDrawColor('#111111');
    pdf.setLineWidth(0.5);
    pdf.rect(segX, y, segPtWidth, barHeight, 'FD');

    // Label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    const labelVal = metric
      ? `${k * (scaleOpt.mPerSeg || 1)}m`
      : `${k * (scaleOpt.feetPerSeg || 4)}'`;
    pdf.text(labelVal, segX, y + barHeight + 8, { align: 'center' });
  }

  // Final end label
  const endVal = metric
    ? `${segCount * (scaleOpt.mPerSeg || 1)}m`
    : `${segCount * (scaleOpt.feetPerSeg || 4)}'`;
  pdf.text(endVal, x + segCount * segPtWidth, y + barHeight + 8, { align: 'center' });
}

/**
 * Renders the Room Schedule Table across one or multiple pages.
 */
function drawRoomSchedulePages(pdf, docState, opts) {
  const {
    pageWidth,
    pageHeight,
    margin,
    orientation,
    projectTitle,
    designer,
    date,
    includeTitleBlock,
  } = opts;

  pdf.addPage([pageWidth, pageHeight], orientation);

  const borderRect = {
    x: margin,
    y: margin,
    w: pageWidth - margin * 2,
    h: pageHeight - margin * 2,
  };
  drawSheetBorder(pdf, borderRect);

  if (includeTitleBlock) {
    const tbWidth = Math.min(220, borderRect.w * 0.35);
    const tbHeight = 64;
    drawTitleBlock(
      pdf,
      {
        x: borderRect.x + borderRect.w - tbWidth,
        y: borderRect.y + borderRect.h - tbHeight,
        w: tbWidth,
        h: tbHeight,
      },
      {
        projectTitle,
        designer,
        date,
        sheetTitle: 'ROOM SCHEDULE',
        sheetNumber: 'A-201',
        scaleLabel: 'N/A (SCHEDULE)',
        notes: '',
      }
    );
  }

  // Header banner
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor('#111111');
  pdf.text('ROOM SCHEDULE & AREA SUMMARY', borderRect.x + 15, borderRect.y + 25);

  const startY = borderRect.y + 45;
  const tableWidth = borderRect.w - 30;
  const rowHeight = 18;

  const cols = [
    { name: 'ROOM NAME', w: tableWidth * 0.28 },
    { name: 'TYPE', w: tableWidth * 0.2 },
    { name: 'LEVEL', w: tableWidth * 0.12 },
    { name: 'DIMENSIONS', w: tableWidth * 0.22 },
    { name: 'NET AREA', w: tableWidth * 0.18 },
  ];

  let currentY = startY;

  const drawTableHeader = (y) => {
    pdf.setFillColor('#3c3a38');
    pdf.rect(borderRect.x + 15, y, tableWidth, rowHeight, 'F');

    let colX = borderRect.x + 15;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor('#ffffff');

    for (const col of cols) {
      pdf.text(col.name, colX + 6, y + 12);
      colX += col.w;
    }
  };

  drawTableHeader(currentY);
  currentY += rowHeight;

  let totalArea = 0;
  const maxTableY = borderRect.y + borderRect.h - 80;

  for (let idx = 0; idx < docState.rooms.length; idx++) {
    const room = docState.rooms[idx];
    const ir = interior(room);
    const area = floorAreaSqFt(room);
    totalArea += area;

    // Pagination check
    if (currentY + rowHeight > maxTableY) {
      pdf.addPage([pageWidth, pageHeight], orientation);
      drawSheetBorder(pdf, borderRect);
      if (includeTitleBlock) {
        const tbWidth = Math.min(220, borderRect.w * 0.35);
        const tbHeight = 64;
        drawTitleBlock(
          pdf,
          {
            x: borderRect.x + borderRect.w - tbWidth,
            y: borderRect.y + borderRect.h - tbHeight,
            w: tbWidth,
            h: tbHeight,
          },
          {
            projectTitle,
            designer,
            date,
            sheetTitle: 'ROOM SCHEDULE (CONT.)',
            sheetNumber: 'A-202',
            scaleLabel: 'N/A (SCHEDULE)',
            notes: '',
          }
        );
      }
      currentY = startY;
      drawTableHeader(currentY);
      currentY += rowHeight;
    }

    // Row zebra striping
    pdf.setFillColor(idx % 2 === 0 ? '#f7f5f0' : '#ffffff');
    pdf.setDrawColor('#dddddd');
    pdf.setLineWidth(0.4);
    pdf.rect(borderRect.x + 15, currentY, tableWidth, rowHeight, 'FD');

    let colX = borderRect.x + 15;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor('#222222');

    const typeDef = ROOM_TYPES[room.type] || { name: room.type };

    const rowData = [
      room.name,
      typeDef.name,
      `Level ${(room.level || 0) + 1}`,
      `${fmtLen(ir.w)} × ${fmtLen(ir.h)}`,
      `${area.toFixed(0)} sq ft`,
    ];

    for (let c = 0; c < cols.length; c++) {
      pdf.text(rowData[c], colX + 6, currentY + 12);
      colX += cols[c].w;
    }

    currentY += rowHeight;
  }

  // Summary Row
  pdf.setFillColor('#e9e6df');
  pdf.setDrawColor('#222222');
  pdf.setLineWidth(0.8);
  pdf.rect(borderRect.x + 15, currentY, tableWidth, rowHeight, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor('#111111');
  pdf.text('TOTAL NET FLOOR AREA', borderRect.x + 21, currentY + 12);

  const areaStr = `${totalArea.toFixed(0)} sq ft`;
  pdf.text(areaStr, borderRect.x + 15 + tableWidth - 10, currentY + 12, { align: 'right' });
}

function drawLogoPDF(pdf, logoDataUrl, x, y, maxW = 75, maxH = 28) {
  if (!pdf || !logoDataUrl) return;
  try {
    let format = 'PNG';
    if (logoDataUrl.startsWith('data:image/jpeg') || logoDataUrl.startsWith('data:image/jpg')) {
      format = 'JPEG';
    } else if (logoDataUrl.startsWith('data:image/webp')) {
      format = 'WEBP';
    }
    pdf.addImage(logoDataUrl, format, x, y, maxW, maxH);
  } catch (err) {
    console.warn('Failed to draw logo in PDF:', err);
  }
}
