import { quantize, DEFAULT_GRID_SETTINGS } from './gridSettings.mjs';
import { SNAP_MODES } from './snapModes.mjs';
import {
  closestPointOnArc,
  pointOnArc,
  getArcParameters,
  distance,
  add,
  sub,
  normalize,
  dot,
  multiply,
} from './math2d.mjs';

function snapToGrid(point, settings) {
  return {
    x: quantize(point.x, settings.unitSize),
    y: quantize(point.y, settings.unitSize),
  };
}

function snapToEdge(point, edges, threshold) {
  let best = null;
  for (const edge of edges) {
    const bulge = edge.bulge || 0;
    const candidate = closestPointOnArc(point, edge.start, edge.end, bulge);
    const score =
      candidate.distance !== undefined ? candidate.distance : distance(point, candidate.point);
    if (score <= threshold && (!best || score < best.distance)) {
      best = {
        point: candidate.point,
        distance: score,
        type: 'edge',
        edgeIndex: edge.index,
      };
    }
  }
  return best;
}

function snapToMidpoint(point, edges, threshold) {
  let best = null;
  for (const edge of edges) {
    const bulge = edge.bulge || 0;
    const midpoint = pointOnArc(edge.start, edge.end, bulge, 0.5);
    const score = distance(point, midpoint);
    if (score <= threshold && (!best || score < best.distance)) {
      best = {
        point: midpoint,
        distance: score,
        type: 'midpoint',
        edgeIndex: edge.index,
      };
    }
  }
  return best;
}

function snapToPerpendicular(point, anchor, edges, threshold) {
  let best = null;
  for (const edge of edges) {
    const bulge = edge.bulge || 0;
    if (bulge) {
      const arc = getArcParameters(edge.start, edge.end, bulge);
      if (!arc.isLinear) {
        // Line through anchor perpendicular to arc circle pass through center
        const dirToAnchor = normalize(sub(anchor, arc.center));
        if (dirToAnchor.x !== 0 || dirToAnchor.y !== 0) {
          const arcPoint1 = add(arc.center, multiply(dirToAnchor, arc.radius));
          const candidate = closestPointOnArc(arcPoint1, edge.start, edge.end, bulge);
          const snapDistance = distance(point, candidate.point);
          if (snapDistance <= threshold && (!best || snapDistance < best.distance)) {
            best = {
              point: candidate.point,
              distance: snapDistance,
              type: 'perpendicular',
              edgeIndex: edge.index,
            };
          }
          continue;
        }
      }
    }

    const edgeVec = sub(edge.end, edge.start);
    const edgeDir = normalize(edgeVec);
    if (edgeDir.x === 0 && edgeDir.y === 0) {
      continue;
    }

    const perpendicular = { x: -edgeDir.y, y: edgeDir.x };
    const anchorToPoint = sub(point, anchor);
    const projectedDistance = dot(anchorToPoint, perpendicular);
    const alignedPoint = add(anchor, multiply(perpendicular, projectedDistance));
    const snapDistance = distance(point, alignedPoint);

    if (snapDistance <= threshold && (!best || snapDistance < best.distance)) {
      best = {
        point: alignedPoint,
        distance: snapDistance,
        type: 'perpendicular',
        edgeIndex: edge.index,
      };
    }
  }
  return best;
}

export function parseExplicitAngleDegrees(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/°$/, '').trim();
    if (!cleaned || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) {
      return null;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    return Object.is(parsed, -0) ? 0 : parsed;
  }
  return null;
}

export function snapToAngle(point, anchor, settings = DEFAULT_GRID_SETTINGS, edges = []) {
  if (!point || !anchor) return null;

  const explicitAngle = parseExplicitAngleDegrees(settings?.explicitAngleDegrees);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const dist = Math.hypot(dx, dy);

  if (explicitAngle !== null) {
    const cleanDegrees = Number(explicitAngle.toFixed(6));
    const normalizedDegrees = Object.is(cleanDegrees, -0) ? 0 : cleanDegrees;
    if (!Number.isFinite(dist) || dist === 0) {
      return {
        point: { x: anchor.x, y: anchor.y },
        distance: 0,
        type: 'angle',
        angleDegrees: normalizedDegrees,
        explicit: true,
      };
    }

    const targetRadians = (explicitAngle * Math.PI) / 180;
    const alignedPoint = {
      x: anchor.x + dist * Math.cos(targetRadians),
      y: anchor.y + dist * Math.sin(targetRadians),
    };
    const snapDist = distance(point, alignedPoint);

    return {
      point: alignedPoint,
      distance: snapDist,
      type: 'angle',
      angleDegrees: normalizedDegrees,
      explicit: true,
    };
  }

  if (anchor.x === point.x && anchor.y === point.y) return null;
  if (!Number.isFinite(dist) || dist === 0) return null;

  const rawAngle = Math.atan2(dy, dx);
  const threshold = settings?.magneticThreshold;

  const refs = [{ refAngle: 0, edge: null }];
  if (Array.isArray(edges)) {
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge || !edge.start || !edge.end) continue;
      const edx = edge.end.x - edge.start.x;
      const edy = edge.end.y - edge.start.y;
      const elen = Math.hypot(edx, edy);
      if (elen === 0) continue;

      const edgeAngle = Math.atan2(edy, edx);
      refs.push({ refAngle: edgeAngle, edge });
    }
  }

  let best = null;

  for (const refItem of refs) {
    const snapped = snapAngle(rawAngle, settings, refItem.refAngle);
    const alignedPoint = {
      x: anchor.x + dist * Math.cos(snapped),
      y: anchor.y + dist * Math.sin(snapped),
    };
    const snapDist = distance(point, alignedPoint);

    if (threshold === undefined || snapDist <= threshold) {
      if (!best || snapDist < best.distance) {
        best = {
          point: alignedPoint,
          distance: snapDist,
          type: 'angle',
          angleDegrees: Math.round(Number(((snapped * 180) / Math.PI).toFixed(6))),
          ...(refItem.edge
            ? {
                edgeIndex:
                  refItem.edge.index !== undefined ? refItem.edge.index : refItem.edge.edgeIndex,
              }
            : {}),
        };
      }
    }
  }

  return best;
}

function chooseBestSnap(candidates, magneticThreshold) {
  return (
    candidates
      .filter(Boolean)
      .filter((candidate) => candidate.distance <= magneticThreshold)
      .sort((a, b) => a.distance - b.distance)[0] || null
  );
}

export function getSnappedPoint({
  point,
  anchor = point,
  edges = [],
  settings,
  snapModes,
  scale = 1.0,
  explicitAngleDegrees,
}) {
  const safeScale =
    typeof scale === 'number' && Number.isFinite(scale) ? Math.max(scale, 0.0001) : 1.0;

  const baseSettings = settings || DEFAULT_GRID_SETTINGS;
  const rawExplicit =
    explicitAngleDegrees !== undefined ? explicitAngleDegrees : baseSettings.explicitAngleDegrees;
  const explicitAngle = parseExplicitAngleDegrees(rawExplicit);

  const magneticThreshold =
    (baseSettings.magneticThreshold !== undefined
      ? baseSettings.magneticThreshold
      : DEFAULT_GRID_SETTINGS.magneticThreshold) / safeScale;
  const edgeThreshold =
    (baseSettings.edgeThreshold !== undefined
      ? baseSettings.edgeThreshold
      : DEFAULT_GRID_SETTINGS.edgeThreshold) / safeScale;
  const midpointThreshold =
    (baseSettings.midpointThreshold !== undefined
      ? baseSettings.midpointThreshold
      : DEFAULT_GRID_SETTINGS.midpointThreshold) / safeScale;
  const perpendicularThreshold =
    (baseSettings.perpendicularThreshold !== undefined
      ? baseSettings.perpendicularThreshold
      : DEFAULT_GRID_SETTINGS.perpendicularThreshold) / safeScale;

  const normalizedSettings = {
    ...baseSettings,
    magneticThreshold,
    edgeThreshold,
    midpointThreshold,
    perpendicularThreshold,
    explicitAngleDegrees: explicitAngle,
  };

  if (explicitAngle !== null) {
    if (!anchor) {
      return { point: { x: point.x, y: point.y }, snap: null };
    }
    const explicitSnap = snapToAngle(point, anchor, normalizedSettings, edges);
    if (
      !explicitSnap ||
      (explicitSnap.distance === 0 && anchor.x === point.x && anchor.y === point.y)
    ) {
      return {
        point: { x: anchor.x, y: anchor.y },
        snap: explicitSnap,
      };
    }
    return {
      point: explicitSnap.point,
      snap: explicitSnap,
    };
  }

  const candidates = [];

  if (snapModes?.isEnabled(SNAP_MODES.GRID)) {
    const gridPoint = snapToGrid(point, normalizedSettings);
    candidates.push({
      type: 'grid',
      point: gridPoint,
      distance: distance(point, gridPoint),
    });
  }

  if (snapModes?.isEnabled(SNAP_MODES.EDGE)) {
    candidates.push(snapToEdge(point, edges, normalizedSettings.edgeThreshold));
  }

  if (snapModes?.isEnabled(SNAP_MODES.MIDPOINT)) {
    candidates.push(snapToMidpoint(point, edges, normalizedSettings.midpointThreshold));
  }

  if (snapModes?.isEnabled(SNAP_MODES.PERPENDICULAR)) {
    candidates.push(
      snapToPerpendicular(point, anchor, edges, normalizedSettings.perpendicularThreshold)
    );
  }

  if (snapModes?.isEnabled(SNAP_MODES.ANGLE)) {
    candidates.push(snapToAngle(point, anchor, normalizedSettings, edges));
  }

  const best = chooseBestSnap(candidates, normalizedSettings.magneticThreshold);

  return {
    point: best ? best.point : point,
    snap: best,
  };
}

export function snapAngle(angleRadians, settings, refAngle = 0) {
  const explicitAngle = parseExplicitAngleDegrees(settings?.explicitAngleDegrees);
  if (explicitAngle !== null) {
    return (explicitAngle * Math.PI) / 180;
  }
  const angleSnapDeg = settings?.angleSnapDegrees ?? DEFAULT_GRID_SETTINGS.angleSnapDegrees;
  const step = (angleSnapDeg * Math.PI) / 180;
  const delta = Math.atan2(Math.sin(angleRadians - refAngle), Math.cos(angleRadians - refAngle));
  return refAngle + quantize(delta, step);
}
