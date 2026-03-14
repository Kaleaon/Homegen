const { quantize } = require('./gridSettings');
const { SNAP_MODES } = require('./snapModes');
const { closestPointOnSegment, distance, add, sub, normalize, dot, multiply } = require('./math2d');

function snapToGrid(point, settings) {
  return {
    x: quantize(point.x, settings.unitSize),
    y: quantize(point.y, settings.unitSize),
  };
}

function snapToEdge(point, edges, threshold) {
  let best = null;
  for (const edge of edges) {
    const candidate = closestPointOnSegment(point, edge.start, edge.end);
    const score = distance(point, candidate.point);
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
    const midpoint = {
      x: (edge.start.x + edge.end.x) / 2,
      y: (edge.start.y + edge.end.y) / 2,
    };
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

function chooseBestSnap(candidates, magneticThreshold) {
  return candidates
    .filter(Boolean)
    .filter((candidate) => candidate.distance <= magneticThreshold)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function getSnappedPoint({ point, anchor = point, edges = [], settings, snapModes }) {
  const candidates = [];

  if (snapModes.isEnabled(SNAP_MODES.GRID)) {
    const gridPoint = snapToGrid(point, settings);
    candidates.push({
      type: 'grid',
      point: gridPoint,
      distance: distance(point, gridPoint),
    });
  }

  if (snapModes.isEnabled(SNAP_MODES.EDGE)) {
    candidates.push(snapToEdge(point, edges, settings.edgeThreshold));
  }

  if (snapModes.isEnabled(SNAP_MODES.MIDPOINT)) {
    candidates.push(snapToMidpoint(point, edges, settings.midpointThreshold));
  }

  if (snapModes.isEnabled(SNAP_MODES.PERPENDICULAR)) {
    candidates.push(snapToPerpendicular(point, anchor, edges, settings.perpendicularThreshold));
  }

  const best = chooseBestSnap(candidates, settings.magneticThreshold);

  return {
    point: best ? best.point : point,
    snap: best,
  };
}

function snapAngle(angleRadians, settings) {
  const step = (settings.angleSnapDegrees * Math.PI) / 180;
  return quantize(angleRadians, step);
}

module.exports = {
  getSnappedPoint,
  snapAngle,
};
