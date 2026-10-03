const { validatePlacement, createPlacementFeedback } = require('./collision');

/**
 * Format length in inches to feet/inches string (e.g. 144 -> 12' 0").
 */
function fmtLenInches(inches) {
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches % 12);
  return `${ft}'${inch ? ` ${inch}"` : ' 0"'}`;
}

/**
 * Format dimensions (w, h in inches) to "12' 0" × 10' 0"".
 */
function fmtDimensionText(w, h) {
  return `${fmtLenInches(w)} × ${fmtLenInches(h)}`;
}

/**
 * Get 4 corner constraint handles for a room rectangle.
 */
function getConstraintHandles(room, options = {}) {
  const x = room.x || 0;
  const y = room.y || 0;
  const w = room.w || 0;
  const h = room.h || 0;

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
function validateRoomDimensions(roomType, w, h) {
  const violations = [];
  const minDim = Math.min(w, h);
  const areaSqFt = (w * h) / 144;

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
      violations.push(`Habitable rooms need at least 70 sq ft (current: ${areaSqFt.toFixed(1)} sq ft).`);
    }
    if (minDim < 84) {
      violations.push(`Habitable rooms must be at least 7 ft (84 in) in every horizontal dimension (current: ${(minDim / 12).toFixed(1)} ft).`);
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
function resizeRoomWithConstraints(room, handleIndexOrId, pointerPoint, options = {}) {
  const snapStep = options.snapStep || 6; // default 6 inch snapping
  const snap = (v) => Math.round(v / snapStep) * snapStep;

  const sx = options.snap !== false ? snap(pointerPoint.x) : pointerPoint.x;
  const sy = options.snap !== false ? snap(pointerPoint.y) : pointerPoint.y;

  const handleIndex = typeof handleIndexOrId === 'number'
    ? handleIndexOrId
    : ['nw', 'ne', 'sw', 'se'].indexOf(handleIndexOrId);

  const right = handleIndex % 2 === 1;
  const bottom = handleIndex >= 2;

  const minSize = options.minSize || 36;
  const x0 = right ? room.x : Math.min(sx, room.x + room.w - minSize);
  const y0 = bottom ? room.y : Math.min(sy, room.y + room.h - minSize);
  const x1 = right ? Math.max(sx, room.x + minSize) : room.x + room.w;
  const y1 = bottom ? Math.max(sy, room.y + minSize) : room.y + room.h;

  const newW = x1 - x0;
  const newH = y1 - y0;
  const rect = { x: x0, y: y0, w: newW, h: newH };

  const dimValidation = validateRoomDimensions(room.type, newW, newH);

  // Also check polygon collision if existingRooms provided
  let collisionValid = true;
  if (options.existingRooms && options.existingRooms.length) {
    const candidatePoly = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
    const existingPolys = options.existingRooms
      .filter((r) => r.id !== room.id)
      .map((r) => [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ]);
    const colRes = validatePlacement(candidatePoly, existingPolys);
    if (!colRes.valid) {
      collisionValid = false;
      dimValidation.violations.push('Room overlaps an existing room.');
    }
  }

  const isValid = dimValidation.isValid && collisionValid;
  const dimensionText = fmtDimensionText(newW, newH);

  return {
    rect,
    dimensionText,
    areaSqFt: (newW * newH) / 144,
    isValid,
    violations: dimValidation.violations,
    handleIndex,
    feedback: {
      color: isValid ? '#2a7fff' : '#f87171',
      handleColor: isValid ? '#ffffff' : '#f87171',
      dimensionText,
    },
  };
}

module.exports = {
  fmtLenInches,
  fmtDimensionText,
  getConstraintHandles,
  validateRoomDimensions,
  resizeRoomWithConstraints,
};
