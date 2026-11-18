// Dedicated Client-Side Bill of Materials (BOM) Exporter Module
import {
  ITEM_BY_ID,
  OPENING_BY_ID,
  WALL_BY_ID,
  FLOOR_BY_ID,
  ROOM_TYPES,
  openingMetrics,
} from './catalog.js';
import { interior, interiorPolygon, polygonPerimeter, floorAreaSqFt } from './geometry.js';

/**
 * Escapes a single CSV field value per RFC 4180 standards.
 * Fields containing double quotes, commas, or line breaks are wrapped in double quotes,
 * and internal double quotes are escaped by doubling them ("").
 *
 * @param {*} val Value to format.
 * @returns {string} RFC 4180 compliant CSV field string.
 */
export function escapeCSVField(val) {
  if (val == null) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats an array of field values into a CRLF-terminated RFC 4180 CSV row.
 *
 * @param {Array} fields Array of values for the row.
 * @returns {string} Formatted CSV row string ending with \r\n.
 */
export function formatCSVRow(fields) {
  return fields.map(escapeCSVField).join(',') + '\r\n';
}

/**
 * Formats dimension in inches to feet-and-inches string (e.g. 144 -> 12', 150 -> 12' 6").
 *
 * @param {number} inches Dimension in inches.
 * @returns {string} Formatted feet-and-inches string.
 */
export function fmtLen(inches) {
  if (inches == null || isNaN(inches)) return '';
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  if (ft === 0) return `${inch}"`;
  if (inch === 0) return `${ft}'`;
  return `${ft}' ${inch}"`;
}

/**
 * Rounds a numeric currency amount to 2 decimal places.
 * Missing, non-finite, or negative inputs safely normalize to 0.
 *
 * @param {*} val Currency value to round.
 * @returns {number} Two-decimal rounded currency amount.
 */
export function roundCurrency(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a numeric price/cost value as a two-decimal string (e.g. "0.00", "249.50").
 * Missing or invalid values output "0.00".
 *
 * @param {*} val Currency value to format.
 * @returns {string} Two-decimal currency string.
 */
export function formatCurrency(val) {
  return roundCurrency(val).toFixed(2);
}

/**
 * Resolves the first valid non-negative numeric unit price from candidates, falling back to 0.
 *
 * @param  {...*} candidates Candidate price values in priority order.
 * @returns {number} Resolved numeric unit price.
 */
function resolveUnitPrice(...candidates) {
  for (const val of candidates) {
    if (val !== null && val !== undefined && val !== '') {
      const num = Number(val);
      if (Number.isFinite(num) && num >= 0) {
        return roundCurrency(num);
      }
    }
  }
  return 0;
}

/**
 * Generates an RFC 4180 compliant CSV text string representing the Bill of Materials (BOM)
 * schedule extracted immutably from docState.
 *
 * @param {Object} docState Project document state object.
 * @param {Object} [options] Section selection options.
 * @param {boolean} [options.includeMetadata=true] Include Project Metadata section.
 * @param {boolean} [options.includeFurniture=true] Include Furniture & Fixtures schedule.
 * @param {boolean} [options.includeOpenings=true] Include Doors & Windows schedule.
 * @param {boolean} [options.includeFinishes=true] Include Finishes schedule.
 * @param {boolean} [options.includeRooms=true] Include Room Area Summary schedule.
 * @param {boolean} [options.includePricing=true] Include item unit prices, extended totals, and BOM cost summary rollup.
 * @returns {string} Complete RFC 4180 formatted CSV text string with UTF-8 line endings.
 */
export function generateBOMCSV(docState, options = {}) {
  const opts = {
    includeMetadata: true,
    includeFurniture: true,
    includeOpenings: true,
    includeFinishes: true,
    includeRooms: true,
    includePricing: true,
    ...options,
  };

  const rooms = docState && Array.isArray(docState.rooms) ? docState.rooms : [];
  let csv = '';

  // Helper to append a blank line between sections
  const appendSeparator = () => {
    if (csv.length > 0 && !csv.endsWith('\r\n\r\n')) {
      csv += '\r\n';
    }
  };

  // Calculate total net floor area across all rooms
  const totalNetFloorArea = rooms.reduce((sum, r) => sum + floorAreaSqFt(r), 0);

  let furnitureSubtotal = 0;
  let openingsSubtotal = 0;
  let finishesSubtotal = 0;

  // 1. PROJECT METADATA
  if (opts.includeMetadata) {
    appendSeparator();
    csv += formatCSVRow(['=== PROJECT METADATA ===']);
    csv += formatCSVRow(['Property', 'Value']);
    csv += formatCSVRow(['Project Name', docState?.name || 'My home']);
    csv += formatCSVRow(['Total Levels', docState?.levels || 1]);
    csv += formatCSVRow(['Total Rooms', rooms.length]);
    csv += formatCSVRow(['Total Net Floor Area (sq ft)', totalNetFloorArea.toFixed(2)]);
    csv += formatCSVRow(['Export Date', new Date().toISOString().replace('T', ' ').slice(0, 19)]);
  }

  // 2. FURNITURE & FIXTURES SCHEDULE
  if (opts.includeFurniture) {
    appendSeparator();
    csv += formatCSVRow(['=== FURNITURE & FIXTURES ===']);
    const furnitureHeaders = [
      'Item ID',
      'Name',
      'Category',
      'Quantity',
      'Width (in)',
      'Depth (in)',
      'Height (in)',
      'Rooms',
    ];
    if (opts.includePricing) {
      furnitureHeaders.push('Unit Price (USD)', 'Total Cost (USD)');
    }
    csv += formatCSVRow(furnitureHeaders);

    const itemMap = new Map();

    for (const r of rooms) {
      const roomName = r.name || 'Room';
      for (const it of r.items || []) {
        const typeId = it.type || it.id;
        if (!typeId) continue;
        const def = ITEM_BY_ID[typeId] || {};
        const defaultPrice = resolveUnitPrice(def.unitPrice);
        const unitPrice = resolveUnitPrice(it.unitPrice, def.unitPrice);
        const groupKey =
          opts.includePricing && unitPrice !== defaultPrice ? `${typeId}@${unitPrice}` : typeId;

        if (!itemMap.has(groupKey)) {
          itemMap.set(groupKey, {
            id: typeId,
            name: def.name || it.name || typeId,
            category: def.cat || 'other',
            qty: 0,
            w: it.w ?? def.w ?? '',
            d: it.d ?? def.d ?? '',
            h: it.h ?? def.h ?? '',
            unitPrice,
            rooms: new Set(),
          });
        }

        const entry = itemMap.get(groupKey);
        entry.qty += 1;
        entry.rooms.add(roomName);
      }
    }

    for (const entry of itemMap.values()) {
      const row = [
        entry.id,
        entry.name,
        entry.category,
        entry.qty,
        entry.w,
        entry.d,
        entry.h,
        Array.from(entry.rooms).join('; '),
      ];
      if (opts.includePricing) {
        const lineCost = roundCurrency(entry.qty * entry.unitPrice);
        furnitureSubtotal = roundCurrency(furnitureSubtotal + lineCost);
        row.push(formatCurrency(entry.unitPrice), formatCurrency(lineCost));
      }
      csv += formatCSVRow(row);
    }

    if (opts.includePricing) {
      csv += formatCSVRow([
        'Furniture & Fixtures Subtotal',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        formatCurrency(furnitureSubtotal),
      ]);
    }
  }

  // 3. DOORS & WINDOWS SCHEDULE
  if (opts.includeOpenings) {
    appendSeparator();
    csv += formatCSVRow(['=== DOORS & WINDOWS ===']);
    const openingHeaders = [
      'Opening ID',
      'Name',
      'Kind',
      'Quantity',
      'Width (in)',
      'Height (in)',
      'Sill Height (in)',
      'Glazed Area (sq ft)',
      'Operable Area (sq ft)',
      'Rooms',
    ];
    if (opts.includePricing) {
      openingHeaders.push('Unit Price (USD)', 'Total Cost (USD)');
    }
    csv += formatCSVRow(openingHeaders);

    const openingMap = new Map();

    for (const r of rooms) {
      const roomName = r.name || 'Room';
      for (const o of r.openings || []) {
        const typeId = o.type || o.id;
        if (!typeId) continue;
        const def = OPENING_BY_ID[typeId] || {};
        const metrics = openingMetrics(def);
        const defaultPrice = resolveUnitPrice(def.unitPrice);
        const unitPrice = resolveUnitPrice(o.unitPrice, def.unitPrice);
        const groupKey =
          opts.includePricing && unitPrice !== defaultPrice ? `${typeId}@${unitPrice}` : typeId;

        if (!openingMap.has(groupKey)) {
          const kindStr = def.kind
            ? def.kind.charAt(0).toUpperCase() + def.kind.slice(1)
            : 'Opening';
          openingMap.set(groupKey, {
            id: typeId,
            name: def.name || typeId,
            kind: kindStr,
            qty: 0,
            w: def.w ?? '',
            h: def.h ?? '',
            sill: def.sill ?? 0,
            glazeSqFt: metrics.glaze / 144,
            operableSqFt: metrics.operable / 144,
            unitPrice,
            rooms: new Set(),
          });
        }

        const entry = openingMap.get(groupKey);
        entry.qty += 1;
        entry.rooms.add(roomName);
      }
    }

    for (const entry of openingMap.values()) {
      const row = [
        entry.id,
        entry.name,
        entry.kind,
        entry.qty,
        entry.w,
        entry.h,
        entry.sill,
        entry.glazeSqFt.toFixed(2),
        entry.operableSqFt.toFixed(2),
        Array.from(entry.rooms).join('; '),
      ];
      if (opts.includePricing) {
        const lineCost = roundCurrency(entry.qty * entry.unitPrice);
        openingsSubtotal = roundCurrency(openingsSubtotal + lineCost);
        row.push(formatCurrency(entry.unitPrice), formatCurrency(lineCost));
      }
      csv += formatCSVRow(row);
    }

    if (opts.includePricing) {
      csv += formatCSVRow([
        'Doors & Windows Subtotal',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        formatCurrency(openingsSubtotal),
      ]);
    }
  }

  // 4. FINISHES SCHEDULE
  if (opts.includeFinishes) {
    appendSeparator();
    csv += formatCSVRow(['=== FINISHES SCHEDULE ===']);
    const finishHeaders = [
      'Finish Scope',
      'Finish ID',
      'Name',
      'Pattern',
      'Moisture Rated',
      'Coverage Area (sq ft)',
    ];
    if (opts.includePricing) {
      finishHeaders.push('Unit Price (USD/sq ft)', 'Total Cost (USD)');
    }
    csv += formatCSVRow(finishHeaders);

    const floorMap = new Map();
    const wallMap = new Map();

    for (const r of rooms) {
      // Floor Finish
      const floorId = r.floor || 'floor_oak';
      const floorDef = FLOOR_BY_ID[floorId] || {};
      const roomFloorSqFt = floorAreaSqFt(r);

      if (!floorMap.has(floorId)) {
        floorMap.set(floorId, {
          id: floorId,
          name: floorDef.name || floorId,
          pattern: floorDef.pattern || 'solid',
          wet: floorDef.wet ? 'Yes' : 'No',
          unitPrice: resolveUnitPrice(floorDef.unitPrice),
          areaSqFt: 0,
        });
      }
      floorMap.get(floorId).areaSqFt += roomFloorSqFt;

      // Wall Finish
      const wallId = r.wallFinish || 'paint_white';
      const wallDef = WALL_BY_ID[wallId] || {};

      const perimeterInches = polygonPerimeter(interiorPolygon(r));
      const ceilingHeightInches = r.ceilingHeight || 96;
      const grossWallAreaSqIn = perimeterInches * ceilingHeightInches;

      // Deduct openings area in this room
      let openingsAreaSqIn = 0;
      for (const o of r.openings || []) {
        const oDef = OPENING_BY_ID[o.type || o.id] || {};
        const opW = oDef.w || 0;
        const opH = oDef.h || 80;
        openingsAreaSqIn += opW * opH;
      }

      const netWallAreaSqIn = Math.max(0, grossWallAreaSqIn - openingsAreaSqIn);
      const netWallSqFt = netWallAreaSqIn / 144;

      if (!wallMap.has(wallId)) {
        wallMap.set(wallId, {
          id: wallId,
          name: wallDef.name || wallId,
          pattern: wallDef.pattern || 'solid',
          wet: wallDef.wet ? 'Yes' : 'No',
          unitPrice: resolveUnitPrice(wallDef.unitPrice),
          areaSqFt: 0,
        });
      }
      wallMap.get(wallId).areaSqFt += netWallSqFt;
    }

    for (const entry of floorMap.values()) {
      const row = [
        'Floor',
        entry.id,
        entry.name,
        entry.pattern,
        entry.wet,
        entry.areaSqFt.toFixed(2),
      ];
      if (opts.includePricing) {
        const lineCost = roundCurrency(entry.areaSqFt * entry.unitPrice);
        finishesSubtotal = roundCurrency(finishesSubtotal + lineCost);
        row.push(formatCurrency(entry.unitPrice), formatCurrency(lineCost));
      }
      csv += formatCSVRow(row);
    }

    for (const entry of wallMap.values()) {
      const row = [
        'Wall',
        entry.id,
        entry.name,
        entry.pattern,
        entry.wet,
        entry.areaSqFt.toFixed(2),
      ];
      if (opts.includePricing) {
        const lineCost = roundCurrency(entry.areaSqFt * entry.unitPrice);
        finishesSubtotal = roundCurrency(finishesSubtotal + lineCost);
        row.push(formatCurrency(entry.unitPrice), formatCurrency(lineCost));
      }
      csv += formatCSVRow(row);
    }

    if (opts.includePricing) {
      csv += formatCSVRow([
        'Finishes Subtotal',
        '',
        '',
        '',
        '',
        '',
        '',
        formatCurrency(finishesSubtotal),
      ]);
    }
  }

  // 5. ROOM AREA SUMMARY
  if (opts.includeRooms) {
    appendSeparator();
    csv += formatCSVRow(['=== ROOM AREA SUMMARY ===']);
    csv += formatCSVRow([
      'Level',
      'Room Name',
      'Room Type',
      'Width',
      'Depth',
      'Net Floor Area (sq ft)',
    ]);

    for (const r of rooms) {
      const ir = interior(r);
      const levelNum = (r.level ?? 0) + 1; // 1-indexed level display for user summary
      const roomName = r.name || 'Room';
      const typeName = ROOM_TYPES[r.type]?.name || r.type || '';
      const area = floorAreaSqFt(r);

      csv += formatCSVRow([
        `Level ${levelNum}`,
        roomName,
        typeName,
        fmtLen(ir.w),
        fmtLen(ir.h),
        area.toFixed(2),
      ]);
    }

    csv += formatCSVRow(['Total Net Floor Area', '', '', '', '', totalNetFloorArea.toFixed(2)]);
  }

  // 6. BOM COST SUMMARY ROLLUP
  if (opts.includePricing) {
    appendSeparator();
    csv += formatCSVRow(['=== BOM COST SUMMARY ===']);
    csv += formatCSVRow(['Category', 'Amount (USD)']);

    if (opts.includeFurniture) {
      csv += formatCSVRow(['Furniture & Fixtures', formatCurrency(furnitureSubtotal)]);
    }
    if (opts.includeOpenings) {
      csv += formatCSVRow(['Doors & Windows', formatCurrency(openingsSubtotal)]);
    }
    if (opts.includeFinishes) {
      csv += formatCSVRow(['Finishes (Floors & Walls)', formatCurrency(finishesSubtotal)]);
    }

    const grandTotal = roundCurrency(furnitureSubtotal + openingsSubtotal + finishesSubtotal);
    const costPerSqFt = totalNetFloorArea > 0 ? roundCurrency(grandTotal / totalNetFloorArea) : 0;

    csv += formatCSVRow(['Total Estimated Cost (USD)', formatCurrency(grandTotal)]);
    csv += formatCSVRow(['Estimated Cost per Sq Ft (USD)', formatCurrency(costPerSqFt)]);
  }

  return csv;
}
