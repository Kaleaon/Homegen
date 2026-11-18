import { validatePlacement } from './collision.mjs';
import { parseExplicitAngleDegrees } from './snapping.mjs';
import { getToken as defaultGetToken } from '../../web/js/kthemeTokens.js';
import { formatFractionalInches } from '../../web/js/dimensionFormatter.js';

/**
 * Format length in inches to feet/inches string (e.g. 144 -> 12' 0").
 */
export function fmtLenInches(inches) {
  return formatFractionalInches(inches, { includeZeroInches: true });
}

/**
 * Format dimensions (w, h in inches) to "12' 0" × 10' 0"".
 */
export function fmtDimensionText(w, h) {
  return `${fmtLenInches(w)} × ${fmtLenInches(h)}`;
}

/**
 * Format an angle in degrees to a display string (e.g. 90 -> "90°", 22.5 -> "22.5°").
 */
export function fmtAngleDegrees(degrees) {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) {
    return '0°';
  }
  const rounded = Number(degrees.toFixed(2));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return `${normalized}°`;
}

function computePolygonWallAngles(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const angles = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let deg = 0;
    if (dx !== 0 || dy !== 0) {
      const rawDeg = Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(2));
      deg = Object.is(rawDeg, -0) ? 0 : rawDeg;
    }
    angles.push({
      edgeIndex: i,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      angleDegrees: deg,
      angleText: fmtAngleDegrees(deg),
    });
  }
  return angles;
}

function computePolygonAreaAbs(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * Get constraint handles for a room polygon (all N vertices).
 */
export function getConstraintHandles(room, _options = {}) {
  const pts = room?.points || room?.corners || room?.vertices;
  if (Array.isArray(pts) && pts.length >= 3) {
    if (pts.length === 4) {
      return [
        { id: 'nw', index: 0, x: pts[0].x, y: pts[0].y, cursor: 'nwse-resize', name: 'Top-Left' },
        { id: 'ne', index: 1, x: pts[1].x, y: pts[1].y, cursor: 'nesw-resize', name: 'Top-Right' },
        {
          id: 'sw',
          index: 2,
          x: pts[3].x,
          y: pts[3].y,
          cursor: 'nesw-resize',
          name: 'Bottom-Left',
        },
        {
          id: 'se',
          index: 3,
          x: pts[2].x,
          y: pts[2].y,
          cursor: 'nwse-resize',
          name: 'Bottom-Right',
        },
      ];
    }
    return pts.map((p, i) => ({
      id: `v_${i}`,
      index: i,
      x: p.x,
      y: p.y,
      cursor: 'crosshair',
      name: `Vertex ${i + 1}`,
    }));
  }

  const x = room?.x || 0;
  const y = room?.y || 0;
  const w = room?.w || 0;
  const h = room?.h || 0;

  return [
    { id: 'nw', index: 0, x, y, cursor: 'nwse-resize', name: 'Top-Left' },
    { id: 'ne', index: 1, x: x + w, y, cursor: 'nesw-resize', name: 'Top-Right' },
    { id: 'sw', index: 2, x, y: y + h, cursor: 'nesw-resize', name: 'Bottom-Left' },
    { id: 'se', index: 3, x: x + w, y: y + h, cursor: 'nwse-resize', name: 'Bottom-Right' },
  ];
}

/**
 * Validates room dimensions against IRC building code rules & constraints.
 */
export function validateRoomDimensions(roomType, w, h, options = {}) {
  const violations = [];
  const minDim = options.clearSpan !== undefined ? options.clearSpan : Math.min(w, h);
  const areaSqFt = options.areaSqFt !== undefined ? options.areaSqFt : (w * h) / 144;

  // Minimum dimension general check (36 inches)
  if (w < 36 || h < 36) {
    violations.push('Room dimensions must be at least 36 in (3 ft).');
  }

  // Kitchen minimum dimension check
  if (roomType === 'kitchen' && minDim < 60) {
    violations.push('Kitchens need at least 5 ft (60 in) clear between opposite walls.');
  }

  // Habitable room checks (IRC R304)
  const isHabitable = ['living', 'bedroom', 'dining', 'kitchen', 'office'].includes(roomType);
  if (isHabitable && roomType !== 'kitchen') {
    if (areaSqFt < 70) {
      violations.push(
        `Habitable rooms need at least 70 sq ft (current: ${areaSqFt.toFixed(1)} sq ft).`
      );
    }
    if (minDim < 84) {
      violations.push(
        `Habitable rooms must be at least 7 ft (84 in) in every horizontal dimension (current: ${(minDim / 12).toFixed(1)} ft).`
      );
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Resize a room using constraint handles given pointer position.
 */
export function resizeRoomWithConstraints(room, handleIndexOrId, pointerPoint, options = {}) {
  const snapStep = options.snapStep || 6; // default 6 inch snapping
  const snap = (v) => Math.round(v / snapStep) * snapStep;
  const explicitAngle = parseExplicitAngleDegrees(options.explicitAngleDegrees);

  const handleIndex =
    typeof handleIndexOrId === 'number'
      ? handleIndexOrId
      : typeof handleIndexOrId === 'string' && handleIndexOrId.startsWith('v_')
        ? Number.parseInt(handleIndexOrId.slice(2), 10)
        : ['nw', 'ne', 'sw', 'se'].indexOf(handleIndexOrId);

  const rawPoly = room?.points || room?.corners || room?.vertices;
  const hasCustomPoly = Array.isArray(rawPoly) && rawPoly.length >= 3;

  const basePoints = hasCustomPoly
    ? rawPoly.map((p) => ({ x: p.x, y: p.y }))
    : [
        { x: room.x || 0, y: room.y || 0 },
        { x: (room.x || 0) + (room.w || 0), y: room.y || 0 },
        { x: (room.x || 0) + (room.w || 0), y: (room.y || 0) + (room.h || 0) },
        { x: room.x || 0, y: (room.y || 0) + (room.h || 0) },
      ];

  let vertexIndex = handleIndex;
  if (basePoints.length === 4 && (handleIndex === 2 || handleIndex === 3)) {
    // Handle index 2 is 'sw' (vertex 3) and handle index 3 is 'se' (vertex 2)
    vertexIndex = handleIndex === 2 ? 3 : 2;
  }
  if (vertexIndex < 0 || vertexIndex >= basePoints.length || Number.isNaN(vertexIndex)) {
    vertexIndex = 0;
  }

  let rect;
  let newW;
  let newH;
  let areaSqFt;
  let updatedPoints;
  let dimValidation;

  if (explicitAngle !== null || (hasCustomPoly && basePoints.length !== 4)) {
    updatedPoints = basePoints.map((p) => ({ x: p.x, y: p.y }));
    const prevIndex = (vertexIndex - 1 + updatedPoints.length) % updatedPoints.length;
    const anchor = options.anchor || updatedPoints[prevIndex];

    let targetPoint;
    if (explicitAngle !== null) {
      const dist = Math.hypot(pointerPoint.x - anchor.x, pointerPoint.y - anchor.y);
      if (!Number.isFinite(dist) || dist === 0) {
        targetPoint = { x: anchor.x, y: anchor.y };
      } else {
        const rad = (explicitAngle * Math.PI) / 180;
        targetPoint = {
          x: anchor.x + dist * Math.cos(rad),
          y: anchor.y + dist * Math.sin(rad),
        };
      }
    } else {
      targetPoint = {
        x: options.snap !== false ? snap(pointerPoint.x) : pointerPoint.x,
        y: options.snap !== false ? snap(pointerPoint.y) : pointerPoint.y,
      };
    }

    updatedPoints[vertexIndex] = targetPoint;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of updatedPoints) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    newW = Math.max(0, maxX - minX);
    newH = Math.max(0, maxY - minY);
    rect = { x: minX, y: minY, w: newW, h: newH };
    areaSqFt = computePolygonAreaAbs(updatedPoints) / 144;
    dimValidation = validateRoomDimensions(room.type, newW, newH, { areaSqFt });
  } else {
    const sx = options.snap !== false ? snap(pointerPoint.x) : pointerPoint.x;
    const sy = options.snap !== false ? snap(pointerPoint.y) : pointerPoint.y;

    const right = handleIndex % 2 === 1;
    const bottom = handleIndex >= 2;

    const minSize = options.minSize || 36;
    const x0 = right ? room.x : Math.min(sx, room.x + room.w - minSize);
    const y0 = bottom ? room.y : Math.min(sy, room.y + room.h - minSize);
    const x1 = right ? Math.max(sx, room.x + minSize) : room.x + room.w;
    const y1 = bottom ? Math.max(sy, room.y + minSize) : room.y + room.h;

    newW = x1 - x0;
    newH = y1 - y0;
    rect = { x: x0, y: y0, w: newW, h: newH };
    updatedPoints = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
    areaSqFt = (newW * newH) / 144;
    dimValidation = validateRoomDimensions(room.type, newW, newH);
  }

  // Also check polygon collision if existingRooms provided
  let collisionValid = true;
  if (options.existingRooms && options.existingRooms.length) {
    const existingPolys = options.existingRooms
      .filter((r) => r.id !== room.id)
      .map((r) => {
        const rPts = r.points || r.corners || r.vertices;
        if (Array.isArray(rPts) && rPts.length >= 3) {
          return rPts;
        }
        return [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
          { x: r.x, y: r.y + r.h },
        ];
      });
    const colRes = validatePlacement(updatedPoints, existingPolys);
    if (!colRes.valid) {
      collisionValid = false;
      dimValidation.violations.push('Room overlaps an existing room.');
    }
  }

  const wallAngles = computePolygonWallAngles(updatedPoints);
  const incomingEdgeIndex = (vertexIndex - 1 + updatedPoints.length) % updatedPoints.length;
  const activeWall = wallAngles[incomingEdgeIndex] || { angleDegrees: 0, angleText: '0°' };
  const activeAngleDegrees =
    explicitAngle !== null
      ? Object.is(Number(explicitAngle.toFixed(2)), -0)
        ? 0
        : Number(explicitAngle.toFixed(2))
      : activeWall.angleDegrees;
  const activeAngleText = fmtAngleDegrees(activeAngleDegrees);

  const isValid = dimValidation.isValid && collisionValid;
  const dimensionText = fmtDimensionText(newW, newH);

  const resolveToken = typeof options.getToken === 'function' ? options.getToken : defaultGetToken;
  const safeGetToken = (name, fallback) => {
    if (typeof resolveToken === 'function') {
      try {
        return resolveToken(name, fallback) || fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const color = isValid
    ? safeGetToken('--ktheme-info', '#2a7fff')
    : safeGetToken('--ktheme-critical', '#f87171');

  const handleColor = isValid
    ? safeGetToken('--ktheme-on-primary', '#ffffff')
    : safeGetToken('--ktheme-critical', '#f87171');

  return {
    rect,
    points: updatedPoints,
    dimensionText,
    angleDegrees: activeAngleDegrees,
    angleText: activeAngleText,
    wallAngles,
    areaSqFt,
    isValid,
    violations: dimValidation.violations,
    handleIndex,
    vertexIndex,
    feedback: {
      color,
      handleColor,
      dimensionText,
      angleDegrees: activeAngleDegrees,
      angleText: activeAngleText,
      wallAngles,
      angleInput: {
        handleIndex,
        vertexIndex,
        angleDegrees: activeAngleDegrees,
        explicitAngleDegrees: explicitAngle,
      },
    },
  };
}

/**
 * Step-based resizing of room using constraint handles in 6-inch increments.
 */
export function stepResize(room, handleIndexOrId, dx = 0, dy = 0, options = {}) {
  const handles = getConstraintHandles(room);
  const handleIndex =
    typeof handleIndexOrId === 'number'
      ? handleIndexOrId
      : ['nw', 'ne', 'sw', 'se'].indexOf(handleIndexOrId);

  const handle = handles[handleIndex] || handles.find((h) => h.id === handleIndexOrId);
  if (!handle) throw new Error(`Invalid handle: ${handleIndexOrId}`);

  const pointerPoint = {
    x: handle.x + dx,
    y: handle.y + dy,
  };

  return resizeRoomWithConstraints(room, handleIndex, pointerPoint, {
    snap: false,
    ...options,
  });
}
