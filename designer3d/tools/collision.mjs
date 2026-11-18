import { polygonEdges } from './math2d.mjs';
import { getToken as defaultGetToken } from '../../web/js/kthemeTokens.js';

function isValidBoundingBox(box) {
  return (
    Boolean(box) &&
    typeof box === 'object' &&
    Number.isFinite(box.minX) &&
    Number.isFinite(box.minY) &&
    Number.isFinite(box.maxX) &&
    Number.isFinite(box.maxY)
  );
}

export function boundingBox(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = minX;
  let maxY = minY;

  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  };
}

export function invalidateBoundingBox(polygon, cache) {
  if (!polygon || typeof polygon !== 'object') {
    return;
  }
  if ('boundingBox' in polygon) {
    delete polygon.boundingBox;
  }
  if (cache && typeof cache.delete === 'function') {
    cache.delete(polygon);
    if (Array.isArray(polygon.points)) {
      cache.delete(polygon.points);
    }
    if (Array.isArray(polygon.polygon)) {
      cache.delete(polygon.polygon);
    }
  }
}

function extractPoints(target) {
  if (Array.isArray(target)) {
    return target;
  }
  if (target && typeof target === 'object') {
    if (Array.isArray(target.points)) {
      return target.points;
    }
    if (Array.isArray(target.polygon)) {
      return target.polygon;
    }
  }
  return null;
}

function isDynamicPolygon(entry, dynamicPolygons) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  if (entry.dynamic === true) {
    return true;
  }
  if (!dynamicPolygons) {
    return false;
  }
  if (typeof dynamicPolygons.has === 'function') {
    return dynamicPolygons.has(entry);
  }
  if (Array.isArray(dynamicPolygons)) {
    return dynamicPolygons.includes(entry);
  }
  return false;
}

function resolveCachedOrComputedBox(entry, points, cache, isDynamic) {
  if (!isDynamic && isValidBoundingBox(entry.boundingBox)) {
    return entry.boundingBox;
  }

  if (!points || points.length === 0) {
    return null;
  }

  if (isDynamic) {
    if (cache && typeof cache.delete === 'function') {
      cache.delete(entry);
      if (points !== entry) {
        cache.delete(points);
      }
    }
    const freshBox = boundingBox(points);
    if (Object.prototype.hasOwnProperty.call(entry, 'boundingBox')) {
      const desc = Object.getOwnPropertyDescriptor(entry, 'boundingBox');
      if (desc && desc.writable) {
        entry.boundingBox = freshBox;
      }
    }
    return freshBox;
  }

  if (cache && typeof cache.get === 'function' && typeof cache.set === 'function') {
    const version = entry.version ?? points.version;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const cached = cache.get(entry);
    if (
      cached &&
      cached.length === points.length &&
      cached.firstPoint === firstPoint &&
      cached.lastPoint === lastPoint &&
      cached.version === version
    ) {
      return cached.box;
    }

    const box = boundingBox(points);
    cache.set(entry, {
      box,
      length: points.length,
      firstPoint,
      lastPoint,
      version,
    });
    return box;
  }

  return boundingBox(points);
}

function resolveExistingBoundingBox(entry, index, options) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const dynamic = isDynamicPolygon(entry, options?.dynamicPolygons);

  if (!dynamic && isValidBoundingBox(options?.existingBoundingBoxes?.[index])) {
    return options.existingBoundingBoxes[index];
  }

  if (isValidBoundingBox(entry)) {
    return entry;
  }

  const points = extractPoints(entry);
  if (!points) {
    return isValidBoundingBox(entry.boundingBox) ? entry.boundingBox : null;
  }

  return resolveCachedOrComputedBox(entry, points, options?.boundingBoxCache, dynamic);
}

function overlaps(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

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

function hasSelfIntersection(points) {
  if (!Array.isArray(points) || points.length < 4) {
    return false;
  }

  const edges = polygonEdges(points);
  const n = edges.length;

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

export function validatePlacement(candidatePolygon, existingPolygons = [], options = {}) {
  const candidatePoints = extractPoints(candidatePolygon);
  const candidateDynamic = isDynamicPolygon(candidatePolygon, options?.dynamicPolygons);

  let box = null;
  if (!candidateDynamic && isValidBoundingBox(options?.candidateBoundingBox)) {
    box = options.candidateBoundingBox;
  } else if (isValidBoundingBox(candidatePolygon)) {
    box = candidatePolygon;
  } else if (!candidateDynamic && isValidBoundingBox(candidatePolygon?.boundingBox)) {
    box = candidatePolygon.boundingBox;
  } else if (candidatePoints && candidatePoints.length > 0) {
    box = boundingBox(candidatePoints);
  }

  const overlapHits = [];

  if (box && Array.isArray(existingPolygons)) {
    for (let index = 0; index < existingPolygons.length; index += 1) {
      const other = resolveExistingBoundingBox(existingPolygons[index], index, options);
      if (other && overlaps(box, other)) {
        overlapHits.push(index);
      }
    }
  }

  const selfIntersecting = candidatePoints ? hasSelfIntersection(candidatePoints) : false;
  const valid = overlapHits.length === 0 && !selfIntersecting;

  return {
    valid,
    reasons: {
      overlaps: overlapHits,
      selfIntersecting,
    },
  };
}

export function createPlacementFeedback(candidatePolygon, validation, options = {}) {
  const resolveToken = typeof options?.getToken === 'function' ? options.getToken : defaultGetToken;
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

  const color = validation.valid
    ? safeGetToken('--ktheme-success', '#2f8f5b')
    : safeGetToken('--ktheme-critical', '#e84040');

  const outline = validation.valid
    ? safeGetToken('--ktheme-success', '#2f8f5b')
    : safeGetToken('--ktheme-critical', '#e84040');

  const alpha = validation.valid ? 0.3 : 0.35;

  return {
    ghostPreview: candidatePolygon,
    style: { color, alpha, outline },
    invalid: !validation.valid,
    reasons: validation.reasons,
  };
}
