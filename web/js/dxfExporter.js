// Native Domain-Driven DXF Exporter Module for Homegen
// Generates AC1015 specification compliant ASCII DXF documents with standard CAD layers

import {
  WT,
  wallSeg,
  wallPoint,
  getRoomPoints,
  interiorPolygon,
  floorAreaSqFt,
  footprint,
} from './geometry.js';
import { OPENING_BY_ID, ITEM_BY_ID } from './catalog.js';

/**
 * Escaped string helper for DXF TEXT entities.
 * Escapes CAD control characters and converts line breaks to space.
 */
function escapeDXFText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
    .replace(/[\r\n]+/g, ' ');
}

/**
 * Normalizes angles in degrees to range [0, 360).
 */
function normDeg(deg) {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/**
 * Calculates start and end angles (in degrees [0, 360)) for DXF ARC entity.
 * DXF arcs sweep counterclockwise from startAngle to endAngle.
 */
function getDXFArcAngles(a1Deg, a2Deg) {
  const start = normDeg(a1Deg);
  const end = normDeg(a2Deg);
  let ccwSweep = end - start;
  if (ccwSweep < 0) ccwSweep += 360;

  if (ccwSweep <= 180) {
    return { startAngle: start, endAngle: end };
  } else {
    return { startAngle: end, endAngle: start };
  }
}

/**
 * Exports document model state to standard ASCII DXF (AC1015 format).
 *
 * @param {Object} doc Document state object
 * @param {Object} [options] Export configuration options
 * @param {string} [options.units='inches'] Target CAD units: 'inches' or 'meters'
 * @param {number|string} [options.level='all'] Target level filtering index or 'all'
 * @returns {string} AC1015 ASCII DXF text output
 */
export function exportDXF(doc, options = {}) {
  const units = options.units === 'meters' ? 'meters' : 'inches';
  const unitFactor = units === 'meters' ? 0.0254 : 1.0; // Model coordinates are in inches
  const insUnitsCode = units === 'meters' ? 6 : 1; // 1 = Inches, 6 = Meters

  const levelOpt = options.level !== undefined ? options.level : 'all';
  const targetLevel = levelOpt === 'all' || levelOpt === null ? null : Number(levelOpt);

  const rooms = (doc?.rooms || []).filter((r) =>
    targetLevel === null ? true : (r.level || 0) === targetLevel
  );

  // Compute extents
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rooms) {
    const pts = getRoomPoints(r);
    for (const p of pts) {
      const x = p.x * unitFactor;
      const y = p.y * unitFactor;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 240 * unitFactor;
    maxY = 240 * unitFactor;
  }

  const dxf = [];

  // Helper to append key-value pair
  const push = (code, val) => {
    dxf.push(`${code}`);
    dxf.push(`${val}`);
  };

  // ------------------------------------------------------------- 1. HEADER
  push(0, 'SECTION');
  push(2, 'HEADER');

  push(9, '$ACADVER');
  push(1, 'AC1015');

  push(9, '$INSUNITS');
  push(70, insUnitsCode);

  push(9, '$EXTMIN');
  push(10, minX.toFixed(4));
  push(20, minY.toFixed(4));
  push(30, '0.0');

  push(9, '$EXTMAX');
  push(10, maxX.toFixed(4));
  push(20, maxY.toFixed(4));
  push(30, '0.0');

  push(0, 'ENDSEC');

  // ------------------------------------------------------------- 2. TABLES
  push(0, 'SECTION');
  push(2, 'TABLES');

  // LTYPE Table
  push(0, 'TABLE');
  push(2, 'LTYPE');
  push(70, 1);

  push(0, 'LTYPE');
  push(2, 'CONTINUOUS');
  push(70, 0);
  push(3, 'Solid line');
  push(72, 65);
  push(73, 0);
  push(40, '0.0');

  push(0, 'ENDTAB');

  // LAYER Table
  const layers = [
    { name: 'A-WALL-STRC', color: 7 }, // White / Black
    { name: 'A-WALL-FINS', color: 8 }, // Dark Gray
    { name: 'A-DOOR', color: 2 }, // Yellow
    { name: 'A-GLAZ', color: 4 }, // Cyan
    { name: 'A-FURN', color: 3 }, // Green
    { name: 'A-AREA-POLY', color: 5 }, // Blue
    { name: 'A-ANNO-TEXT', color: 1 }, // Red
  ];

  push(0, 'TABLE');
  push(2, 'LAYER');
  push(70, layers.length);

  for (const layer of layers) {
    push(0, 'LAYER');
    push(2, layer.name);
    push(70, 0);
    push(62, layer.color);
    push(6, 'CONTINUOUS');
  }

  push(0, 'ENDTAB');
  push(0, 'ENDSEC');

  // ------------------------------------------------------------- 3. BLOCKS
  push(0, 'SECTION');
  push(2, 'BLOCKS');
  push(0, 'ENDSEC');

  // ------------------------------------------------------------- 4. ENTITIES
  push(0, 'SECTION');
  push(2, 'ENTITIES');

  for (const room of rooms) {
    const pts = getRoomPoints(room);

    // 4a. A-AREA-POLY (Closed LWPOLYLINE for room area boundary)
    push(0, 'LWPOLYLINE');
    push(8, 'A-AREA-POLY');
    push(90, pts.length);
    push(70, 1); // Closed
    for (const p of pts) {
      push(10, (p.x * unitFactor).toFixed(4));
      push(20, (p.y * unitFactor).toFixed(4));
    }

    // 4b. A-WALL-FINS (Interior room finish boundary)
    const inPts = interiorPolygon(room, WT);
    if (inPts && inPts.length >= 3) {
      push(0, 'LWPOLYLINE');
      push(8, 'A-WALL-FINS');
      push(90, inPts.length);
      push(70, 1);
      for (const p of inPts) {
        push(10, (p.x * unitFactor).toFixed(4));
        push(20, (p.y * unitFactor).toFixed(4));
      }
    }

    // 4c. A-WALL-STRC (Wall segment 2D structural outline polylines)
    const numWalls = pts.length;
    for (let i = 0; i < numWalls; i++) {
      const s = wallSeg(room, i);
      if (s.len <= 0) continue;

      // Calculate 4 corners of wall segment rectangle with width WT
      const halfWT = WT / 2;
      const c1 = { x: s.ax - s.nx * halfWT, y: s.ay - s.ny * halfWT };
      const c2 = { x: s.ax + s.dx * s.len - s.nx * halfWT, y: s.ay + s.dy * s.len - s.ny * halfWT };
      const c3 = { x: s.ax + s.dx * s.len + s.nx * halfWT, y: s.ay + s.dy * s.len + s.ny * halfWT };
      const c4 = { x: s.ax + s.nx * halfWT, y: s.ay + s.ny * halfWT };

      push(0, 'LWPOLYLINE');
      push(8, 'A-WALL-STRC');
      push(90, 4);
      push(70, 1);
      push(10, (c1.x * unitFactor).toFixed(4));
      push(20, (c1.y * unitFactor).toFixed(4));
      push(10, (c2.x * unitFactor).toFixed(4));
      push(20, (c2.y * unitFactor).toFixed(4));
      push(10, (c3.x * unitFactor).toFixed(4));
      push(20, (c3.y * unitFactor).toFixed(4));
      push(10, (c4.x * unitFactor).toFixed(4));
      push(20, (c4.y * unitFactor).toFixed(4));
    }

    // 4d. Openings (A-DOOR and A-GLAZ)
    for (const o of room.openings || []) {
      const def = OPENING_BY_ID[o.type] || {};
      const isWindow = def.kind === 'window';
      const s = wallSeg(room, o.wall);
      const startPt = wallPoint(room, o.wall, o.offset, 0);
      const endPt = wallPoint(room, o.wall, o.offset + o.width, 0);

      if (isWindow) {
        // Window pane & frame on A-GLAZ
        const halfWT = WT / 2;
        const c1 = { x: startPt.x - s.nx * halfWT, y: startPt.y - s.ny * halfWT };
        const c2 = { x: endPt.x - s.nx * halfWT, y: endPt.y - s.ny * halfWT };
        const c3 = { x: endPt.x + s.nx * halfWT, y: endPt.y + s.ny * halfWT };
        const c4 = { x: startPt.x + s.nx * halfWT, y: startPt.y + s.ny * halfWT };

        // Outer window frame polyline
        push(0, 'LWPOLYLINE');
        push(8, 'A-GLAZ');
        push(90, 4);
        push(70, 1);
        push(10, (c1.x * unitFactor).toFixed(4));
        push(20, (c1.y * unitFactor).toFixed(4));
        push(10, (c2.x * unitFactor).toFixed(4));
        push(20, (c2.y * unitFactor).toFixed(4));
        push(10, (c3.x * unitFactor).toFixed(4));
        push(20, (c3.y * unitFactor).toFixed(4));
        push(10, (c4.x * unitFactor).toFixed(4));
        push(20, (c4.y * unitFactor).toFixed(4));

        // Center glass pane line
        push(0, 'LINE');
        push(8, 'A-GLAZ');
        push(10, (startPt.x * unitFactor).toFixed(4));
        push(20, (startPt.y * unitFactor).toFixed(4));
        push(30, '0.0');
        push(11, (endPt.x * unitFactor).toFixed(4));
        push(21, (endPt.y * unitFactor).toFixed(4));
        push(31, '0.0');
      } else {
        // Door panel and swing arc on A-DOOR
        const dir = o.swing === 'out' ? -1 : 1;
        // Hinge point is startPt
        const hx = startPt.x;
        const hy = startPt.y;

        // Normal direction for door swing
        const px = hx + s.nx * dir * o.width;
        const py = hy + s.ny * dir * o.width;

        // Door leaf line
        push(0, 'LINE');
        push(8, 'A-DOOR');
        push(10, (hx * unitFactor).toFixed(4));
        push(20, (hy * unitFactor).toFixed(4));
        push(30, '0.0');
        push(11, (px * unitFactor).toFixed(4));
        push(21, (py * unitFactor).toFixed(4));
        push(31, '0.0');

        // Door swing arc
        const wallAngleDeg = (Math.atan2(s.dy, s.dx) * 180) / Math.PI;
        const panelAngleDeg = (Math.atan2(py - hy, px - hx) * 180) / Math.PI;
        const { startAngle, endAngle } = getDXFArcAngles(wallAngleDeg, panelAngleDeg);

        push(0, 'ARC');
        push(8, 'A-DOOR');
        push(10, (hx * unitFactor).toFixed(4));
        push(20, (hy * unitFactor).toFixed(4));
        push(30, '0.0');
        push(40, (o.width * unitFactor).toFixed(4));
        push(50, startAngle.toFixed(2));
        push(51, endAngle.toFixed(2));
      }
    }

    // 4e. Furniture items (A-FURN)
    for (const it of room.items || []) {
      const def = ITEM_BY_ID[it.type] || {};
      if (it.x !== undefined && it.y !== undefined) {
        const fp = footprint(it, def);
        const w = fp.w || 24;
        const h = fp.h || 24;
        const rot = it.rot || 0;
        const rad = (rot * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // 4 corners relative to item center
        const halfW = w / 2;
        const halfH = h / 2;
        const relCorners = [
          { x: -halfW, y: -halfH },
          { x: halfW, y: -halfH },
          { x: halfW, y: halfH },
          { x: -halfW, y: halfH },
        ];

        const absCorners = relCorners.map((c) => ({
          x: it.x + (c.x * cos - c.y * sin),
          y: it.y + (c.x * sin + c.y * cos),
        }));

        push(0, 'LWPOLYLINE');
        push(8, 'A-FURN');
        push(90, 4);
        push(70, 1);
        for (const c of absCorners) {
          push(10, (c.x * unitFactor).toFixed(4));
          push(20, (c.y * unitFactor).toFixed(4));
        }
      }
    }

    // 4f. A-ANNO-TEXT (Room Tag & Floor Area Annotation)
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;

    const roomName = escapeDXFText(room.name || room.type || 'Room');
    const areaSqFt = floorAreaSqFt(room);
    const areaText = escapeDXFText(`${areaSqFt.toFixed(1)} sq ft`);

    const textHeight = 10 * unitFactor;
    const areaHeight = 8 * unitFactor;

    // Room name text entity
    push(0, 'TEXT');
    push(8, 'A-ANNO-TEXT');
    push(10, (cx * unitFactor).toFixed(4));
    push(20, ((cy - textHeight * 0.8) * unitFactor).toFixed(4));
    push(30, '0.0');
    push(40, textHeight.toFixed(4));
    push(1, roomName);
    push(72, 1); // Center horizontal
    push(73, 2); // Middle vertical
    push(11, (cx * unitFactor).toFixed(4));
    push(21, ((cy - textHeight * 0.8) * unitFactor).toFixed(4));
    push(31, '0.0');

    // Room area text entity
    push(0, 'TEXT');
    push(8, 'A-ANNO-TEXT');
    push(10, (cx * unitFactor).toFixed(4));
    push(20, ((cy + areaHeight * 0.8) * unitFactor).toFixed(4));
    push(30, '0.0');
    push(40, areaHeight.toFixed(4));
    push(1, areaText);
    push(72, 1); // Center horizontal
    push(73, 2); // Middle vertical
    push(11, (cx * unitFactor).toFixed(4));
    push(21, ((cy + areaHeight * 0.8) * unitFactor).toFixed(4));
    push(31, '0.0');
  }

  // 4g. Export GIS site polylines if present on A-AREA-POLY or A-WALL-STRC
  if (doc?.site?.segments && Array.isArray(doc.site.segments)) {
    for (const seg of doc.site.segments) {
      if (seg.pts && seg.pts.length >= 2) {
        push(0, 'LWPOLYLINE');
        push(8, 'A-AREA-POLY');
        push(90, seg.pts.length);
        push(70, 0); // Open polyline for site segment
        for (const p of seg.pts) {
          push(10, (p.x * unitFactor).toFixed(4));
          push(20, (p.y * unitFactor).toFixed(4));
        }
      }
    }
  }

  push(0, 'ENDSEC');
  push(0, 'EOF');

  return dxf.join('\n') + '\n';
}
