const { polygonEdges } = require('./math2d');

function boundingBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function overlaps(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function hasSelfIntersection(points) {
  const edges = polygonEdges(points);
  const n = edges.length;

  function ccw(A, B, C) {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  }

  function intersect(e1, e2) {
    const A = e1.start;
    const B = e1.end;
    const C = e2.start;
    const D = e2.end;

    return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) {
        continue;
      }
      if (intersect(edges[i], edges[j])) {
        return true;
      }
    }
  }

  return false;
}

function validatePlacement(candidatePolygon, existingPolygons = []) {
  const box = boundingBox(candidatePolygon);
  const overlapHits = [];

  existingPolygons.forEach((polygon, index) => {
    const other = boundingBox(polygon);
    if (overlaps(box, other)) {
      overlapHits.push(index);
    }
  });

  const selfIntersecting = hasSelfIntersection(candidatePolygon);
  const valid = overlapHits.length === 0 && !selfIntersecting;

  return {
    valid,
    reasons: {
      overlaps: overlapHits,
      selfIntersecting,
    },
  };
}

function createPlacementFeedback(candidatePolygon, validation) {
  return {
    ghostPreview: candidatePolygon,
    style: validation.valid
      ? { color: '#4ade80', alpha: 0.3, outline: '#22c55e' }
      : { color: '#f87171', alpha: 0.35, outline: '#ef4444' },
    invalid: !validation.valid,
    reasons: validation.reasons,
  };
}

module.exports = {
  validatePlacement,
  createPlacementFeedback,
};
