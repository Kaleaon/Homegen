import { getSnappedPoint } from './snapping.mjs';
import {
  distance,
  parseExplicitLengthInches,
  computeVectorAngle,
  computeVertexFromAngle,
} from './math2d.mjs';
import { validatePlacement, createPlacementFeedback } from './collision.mjs';
import { validateRoomDimensions } from './constraintHandles.mjs';

const DEFAULT_MIN_CLEAR_SPAN_INCHES = 36;

function normalizeRoomPolygons(existingRooms = []) {
  if (!Array.isArray(existingRooms)) return [];
  return existingRooms
    .map((room) => {
      if (Array.isArray(room)) return room;
      const pts = room?.points || room?.corners || room?.vertices;
      if (Array.isArray(pts) && pts.length >= 3) return pts;
      if (
        room &&
        typeof room.x === 'number' &&
        typeof room.y === 'number' &&
        typeof room.w === 'number' &&
        typeof room.h === 'number'
      ) {
        return [
          { x: room.x, y: room.y },
          { x: room.x + room.w, y: room.y },
          { x: room.x + room.w, y: room.y + room.h },
          { x: room.x, y: room.y + room.h },
        ];
      }
      return null;
    })
    .filter(Boolean);
}

function ccw(A, B, C) {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
}

function segmentsProperlyIntersect(a1, a2, b1, b2) {
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2);
}

function hasOpenPolylineConflict(existingPoints, candidatePoint, magneticThreshold = 0) {
  const n = existingPoints.length;
  if (n < 2) return false;

  const anchor = existingPoints[n - 1];
  const prev = existingPoints[n - 2];

  // Reject 180-degree backtracking onto the immediately preceding wall segment
  const prevDx = anchor.x - prev.x;
  const prevDy = anchor.y - prev.y;
  const nextDx = candidatePoint.x - anchor.x;
  const nextDy = candidatePoint.y - anchor.y;
  const prevLen = Math.hypot(prevDx, prevDy);
  const nextLen = Math.hypot(nextDx, nextDy);
  if (prevLen > 1e-6 && nextLen > 1e-6) {
    const cosTheta = (prevDx * nextDx + prevDy * nextDy) / (prevLen * nextLen);
    if (cosTheta < -0.9999) {
      return true;
    }
  }

  const closingToStart = n >= 3 && distance(candidatePoint, existingPoints[0]) <= magneticThreshold;
  for (let i = 0; i < n - 2; i += 1) {
    if (i === 0 && closingToStart) continue;
    if (
      segmentsProperlyIntersect(existingPoints[i], existingPoints[i + 1], anchor, candidatePoint)
    ) {
      return true;
    }
  }

  return false;
}

function evaluateCandidateConstraints(existingPoints, targetPoint, settings, context = {}) {
  const minClearSpan =
    typeof context.minLength === 'number' ? context.minLength : DEFAULT_MIN_CLEAR_SPAN_INCHES;
  const existingPolygons = normalizeRoomPolygons(context.existingRooms || []);
  const violations = [];

  if (existingPoints.length === 0) {
    return {
      valid: true,
      violations: [],
      reasons: { overlaps: [], selfIntersecting: false, clearSpan: false },
      candidate: [targetPoint],
    };
  }

  const anchor = existingPoints[existingPoints.length - 1];
  const segLen = distance(anchor, targetPoint);
  const closingToStart =
    existingPoints.length >= 3 &&
    distance(targetPoint, existingPoints[0]) <= (settings?.magneticThreshold || 0);

  let clearSpanInvalid = false;
  if (!closingToStart && segLen < minClearSpan) {
    clearSpanInvalid = true;
    violations.push(
      `Wall length must be at least ${minClearSpan} in (${(minClearSpan / 12).toFixed(0)} ft) clear span.`
    );
  }

  const openSelfIntersect = hasOpenPolylineConflict(
    existingPoints,
    targetPoint,
    settings?.magneticThreshold || 0
  );

  const candidate = [...existingPoints, targetPoint];
  const polygonToCheck = closingToStart ? [...existingPoints] : candidate;
  let placement = { valid: true, reasons: { overlaps: [], selfIntersecting: false } };

  if (polygonToCheck.length >= 3) {
    placement = validatePlacement(polygonToCheck, existingPolygons);
    const xs = polygonToCheck.map((p) => p.x);
    const ys = polygonToCheck.map((p) => p.y);
    const spanW = Math.max(...xs) - Math.min(...xs);
    const spanH = Math.max(...ys) - Math.min(...ys);
    if (spanW < minClearSpan || spanH < minClearSpan) {
      clearSpanInvalid = true;
      violations.push(
        `Room clear span must be at least ${minClearSpan} in (${(minClearSpan / 12).toFixed(0)} ft).`
      );
    }
    if (context.roomType && context.enforceRoomType) {
      const dimCheck = validateRoomDimensions(context.roomType, spanW, spanH);
      if (!dimCheck.isValid) {
        violations.push(...dimCheck.violations);
      }
    }
  } else if (existingPolygons.length > 0) {
    placement = validatePlacement(candidate, existingPolygons);
  }

  const selfIntersecting = Boolean(openSelfIntersect || placement.reasons.selfIntersecting);
  if (selfIntersecting) {
    violations.push('Wall segment causes polygon self-intersection.');
  }
  if (placement.reasons.overlaps && placement.reasons.overlaps.length > 0) {
    violations.push('Wall placement overlaps an existing room.');
  }

  const valid =
    violations.length === 0 && !selfIntersecting && placement.reasons.overlaps.length === 0;
  return {
    valid,
    violations,
    reasons: {
      overlaps: placement.reasons.overlaps || [],
      selfIntersecting,
      clearSpan: clearSpanInvalid,
    },
    candidate,
  };
}

export class RoomDrawingTool {
  constructor(settings, snapModes) {
    this.settings = settings;
    this.snapModes = snapModes;
    this.points = [];
    this.bulges = [];
  }

  reset() {
    this.points = [];
    this.bulges = [];
  }

  setEdgeBulge(index, bulge) {
    if (index >= 0) {
      this.bulges[index] = bulge;
    }
  }

  getEdgeBulge(index) {
    return this.bulges[index] || 0;
  }

  adjustBulge(index, delta) {
    const current = this.getEdgeBulge(index);
    this.setEdgeBulge(index, current + delta);
    return this.getEdgeBulge(index);
  }

  getCornerCount() {
    return this.points.length;
  }

  getPoints() {
    return [...this.points];
  }

  canClose() {
    return this.points.length >= 3;
  }

  _resolveTargetPoint(rawPoint, explicitLength, context = {}) {
    const anchor = this.points[this.points.length - 1] || context.anchor || rawPoint;
    const { point: snappedPoint, snap } = getSnappedPoint({
      point: rawPoint,
      anchor,
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    if (this.points.length === 0 && !context.anchor) {
      return {
        anchor,
        targetPoint: snappedPoint,
        snappedPoint,
        snap,
        lengthInches: 0,
        angleRadians: 0,
        usedFallback: true,
      };
    }

    const parsedLength = parseExplicitLengthInches(explicitLength);
    if (parsedLength === null) {
      return {
        anchor,
        targetPoint: snappedPoint,
        snappedPoint,
        snap,
        lengthInches: distance(anchor, snappedPoint),
        angleRadians: computeVectorAngle(anchor, snappedPoint),
        usedFallback: true,
      };
    }

    let angleRadians;
    if (typeof context.angle === 'number' && Number.isFinite(context.angle)) {
      angleRadians = context.angle;
    } else if (distance(anchor, snappedPoint) > 1e-6) {
      angleRadians = computeVectorAngle(anchor, snappedPoint);
    } else {
      angleRadians = computeVectorAngle(anchor, rawPoint);
    }

    const targetPoint = computeVertexFromAngle(anchor, angleRadians, parsedLength);
    return {
      anchor,
      targetPoint,
      snappedPoint,
      snap: {
        ...snap,
        mode: 'explicit-length',
        explicitLength: parsedLength,
      },
      lengthInches: parsedLength,
      angleRadians,
      usedFallback: false,
    };
  }

  /**
   * Add a corner, snapped against reference edges.
   */
  addCorner(rawPoint, context = {}) {
    const anchor = this.points[this.points.length - 1] || rawPoint;
    const { point, snap } = getSnappedPoint({
      point: rawPoint,
      anchor,
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    this.points.push(point);
    if (this.points.length > 1) {
      const edgeIdx = this.points.length - 2;
      this.bulges[edgeIdx] = context.bulge || this.bulges[edgeIdx] || 0;
    }

    return {
      corner: point,
      snap,
      count: this.points.length,
    };
  }

  /**
   * Add a corner using an explicit length override (in inches or architectural string).
   * Falls back safely to the pointer-snapped position when `explicitLength` is invalid,
   * and rejects placements that violate clear-span (< 36"), self-intersection, or overlap rules.
   */
  addCornerWithLength(rawPoint, explicitLength, context = {}) {
    if (!rawPoint) {
      throw new Error('addCornerWithLength: rawPoint is required');
    }

    const resolved = this._resolveTargetPoint(rawPoint, explicitLength, context);
    const check = evaluateCandidateConstraints(
      this.points,
      resolved.targetPoint,
      this.settings,
      context
    );
    const feedback = createPlacementFeedback(check.candidate, {
      valid: check.valid,
      reasons: check.reasons,
    });

    if (!check.valid) {
      return {
        ok: false,
        valid: false,
        rejected: true,
        corner: resolved.targetPoint,
        snap: resolved.snap,
        count: this.points.length,
        lengthInches: resolved.lengthInches,
        angleRadians: resolved.angleRadians,
        usedFallback: resolved.usedFallback,
        violations: check.violations,
        reasons: check.reasons,
        feedback,
      };
    }

    this.points.push(resolved.targetPoint);
    if (this.points.length > 1) {
      const edgeIdx = this.points.length - 2;
      this.bulges[edgeIdx] = context.bulge || this.bulges[edgeIdx] || 0;
    }

    return {
      ok: true,
      valid: true,
      rejected: false,
      corner: resolved.targetPoint,
      snap: resolved.snap,
      count: this.points.length,
      lengthInches: resolved.lengthInches,
      angleRadians: resolved.angleRadians,
      usedFallback: resolved.usedFallback,
      violations: [],
      reasons: check.reasons,
      feedback,
    };
  }

  preview(rawPoint, lengthOrContext = {}, maybeContext = {}) {
    if (this.points.length === 0) {
      return null;
    }

    let explicitLength;
    let context;
    if (
      typeof lengthOrContext === 'number' ||
      typeof lengthOrContext === 'string' ||
      lengthOrContext === null
    ) {
      explicitLength = lengthOrContext;
      context = maybeContext || {};
    } else {
      context = lengthOrContext || {};
      explicitLength =
        context.explicitLength !== undefined ? context.explicitLength : context.length;
    }

    const hasExplicitOverride = explicitLength !== undefined;
    const resolved = this._resolveTargetPoint(rawPoint, explicitLength, context);
    const existingPolygons = normalizeRoomPolygons(context.existingRooms || []);

    let validation;
    let violations = [];
    if (hasExplicitOverride) {
      const check = evaluateCandidateConstraints(
        this.points,
        resolved.targetPoint,
        this.settings,
        context
      );
      validation = { valid: check.valid, reasons: check.reasons };
      violations = check.violations;
    } else {
      const candidate = [...this.points, resolved.targetPoint];
      validation = validatePlacement(candidate, existingPolygons);
    }

    const candidate = [...this.points, resolved.targetPoint];
    const feedback = createPlacementFeedback(candidate, validation);

    return {
      ...feedback,
      bulges: [...this.bulges, context.bulge || 0],
      anchor: resolved.anchor,
      targetPoint: resolved.targetPoint,
      lengthInches: resolved.lengthInches,
      angleRadians: resolved.angleRadians,
      usedFallback: resolved.usedFallback,
      valid: validation.valid,
      violations,
    };
  }

  closeRoom(context = {}) {
    if (this.points.length < 3) {
      throw new Error('A room needs at least 3 corners.');
    }

    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    const closeEnough = distance(first, last) <= this.settings.magneticThreshold;

    const closedPoints = closeEnough ? [...this.points.slice(0, -1)] : [...this.points];
    const validation = validatePlacement(
      closedPoints,
      normalizeRoomPolygons(context.existingRooms || [])
    );

    if (!validation.valid) {
      return {
        ok: false,
        feedback: createPlacementFeedback(closedPoints, validation),
      };
    }

    const finalBulges = [];
    for (let i = 0; i < closedPoints.length; i += 1) {
      finalBulges.push(this.bulges[i] || 0);
    }

    const room = {
      corners: closedPoints,
      bulges: finalBulges,
      closed: true,
    };

    this.reset();

    return {
      ok: true,
      room,
    };
  }
}
