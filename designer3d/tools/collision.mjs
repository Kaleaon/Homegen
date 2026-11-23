import { polygonEdges, tessellateArc } from './math2d.mjs';
import { getToken as defaultGetToken } from '../../web/js/kthemeTokens.js';

const DEFAULT_TOLERANCE = 1e-3;
const CARDINAL_WALL_KEYS = ['N', 'E', 'S', 'W'];
const ARC_TESSELLATION_SEGMENTS = 16;

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
    if (Array.isArray(polygon.corners)) {
      cache.delete(polygon.corners);
    }
    if (Array.isArray(polygon.vertices)) {
      cache.delete(polygon.vertices);
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
    if (Array.isArray(target.corners)) {
      return target.corners;
    }
    if (Array.isArray(target.vertices)) {
      return target.vertices;
    }
    if (
      Number.isFinite(target.x) &&
      Number.isFinite(target.y) &&
      Number.isFinite(target.w) &&
      Number.isFinite(target.h)
    ) {
      return [
        { x: target.x, y: target.y },
        { x: target.x + target.w, y: target.y },
        { x: target.x + target.w, y: target.y + target.h },
        { x: target.x, y: target.y + target.h },
      ];
    }
  }
  return null;
}

function resolveEdgeBulge(index, pointCount, pointBulge, bulgesSource) {
  if (bulgesSource) {
    if (Array.isArray(bulgesSource) && typeof bulgesSource[index] === 'number') {
      return bulgesSource[index];
    }
    if (typeof bulgesSource === 'object') {
      if (pointCount === 4) {
        const wallKey = CARDINAL_WALL_KEYS[index];
        if (typeof bulgesSource[wallKey] === 'number') {
          return bulgesSource[wallKey];
        }
      }
      if (typeof bulgesSource[index] === 'number') {
        return bulgesSource[index];
      }
      if (typeof bulgesSource[String(index)] === 'number') {
        return bulgesSource[String(index)];
      }
    }
  }
  return typeof pointBulge === 'number' ? pointBulge : 0;
}

function snapshotRawPoints(rawPoints, bulgesSource) {
  const n = rawPoints.length;
  const snapshot = new Array(n);
  let hasCurve = false;
  for (let i = 0; i < n; i += 1) {
    const p = rawPoints[i];
    const x = p.x;
    const y = p.y;
    const ptBulge = typeof p.bulge === 'number' ? p.bulge : 0;
    const bulge = resolveEdgeBulge(i, n, ptBulge, bulgesSource);
    if (Number.isFinite(bulge) && Math.abs(bulge) > 1e-9) {
      hasCurve = true;
    }
    snapshot[i] = { x, y, bulge: Number.isFinite(bulge) ? bulge : 0 };
  }
  return { snapshot, hasCurve };
}

function tessellateSnapshot(snapshot, isClosed, hasCurve, arcSegments = ARC_TESSELLATION_SEGMENTS) {
  if (!hasCurve || snapshot.length < 2) {
    return snapshot;
  }

  const n = snapshot.length;
  const edgeCount = isClosed ? n : n - 1;
  const out = [];

  for (let i = 0; i < edgeCount; i += 1) {
    const start = snapshot[i];
    const end = snapshot[(i + 1) % n];
    out.push({ x: start.x, y: start.y });
    if (Math.abs(start.bulge) > 1e-9) {
      const arcPts = tessellateArc(start, end, start.bulge, arcSegments);
      for (let k = 1; k < arcPts.length - 1; k += 1) {
        out.push(arcPts[k]);
      }
    }
  }

  if (!isClosed) {
    const last = snapshot[n - 1];
    out.push({ x: last.x, y: last.y });
  }

  return out;
}

export function tessellateRoomPolygon(points, bulges = null, options = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }
  const isClosed = options.closed !== undefined ? Boolean(options.closed) : points.length >= 3;
  const bulgesSource = bulges || points.bulges || null;
  const { snapshot, hasCurve } = snapshotRawPoints(points, bulgesSource);
  return tessellateSnapshot(
    snapshot,
    isClosed,
    hasCurve,
    options.arcSegments || ARC_TESSELLATION_SEGMENTS
  );
}

function boxToPolygon(box) {
  if (box.minX === box.maxX && box.minY === box.maxY) {
    return {
      points: [{ x: box.minX, y: box.minY }],
      isClosed: false,
      box,
    };
  }
  return {
    points: [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.minY },
      { x: box.maxX, y: box.maxY },
      { x: box.minX, y: box.maxY },
    ],
    isClosed: true,
    box,
  };
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

function buildShapeData(entry, rawPoints, bulgesOverride = null, closedOverride = undefined) {
  const isClosed =
    closedOverride !== undefined
      ? Boolean(closedOverride)
      : rawPoints.length >= 3 && entry?.closed !== false;
  const bulgesSource = bulgesOverride || entry?.bulges || rawPoints?.bulges || null;
  const { snapshot, hasCurve } = snapshotRawPoints(rawPoints, bulgesSource);
  const points = tessellateSnapshot(snapshot, isClosed, hasCurve);
  const box = boundingBox(points);
  return { box, points, isClosed, hasCurve };
}

function resolveExistingShape(entry, index, options) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const dynamic = isDynamicPolygon(entry, options?.dynamicPolygons);
  const cache = options?.boundingBoxCache;
  const rawPoints = extractPoints(entry);

  if (dynamic && cache && typeof cache.delete === 'function') {
    cache.delete(entry);
    if (rawPoints && rawPoints !== entry) {
      cache.delete(rawPoints);
    }
  }

  if (rawPoints) {
    if (rawPoints.length === 0) {
      return null;
    }

    if (!dynamic && cache && typeof cache.get === 'function' && typeof cache.set === 'function') {
      const version = entry.version ?? rawPoints.version;
      const firstPoint = rawPoints[0];
      const lastPoint = rawPoints[rawPoints.length - 1];
      const cached = cache.get(entry);
      if (
        cached &&
        cached.length === rawPoints.length &&
        cached.firstPoint === firstPoint &&
        cached.lastPoint === lastPoint &&
        cached.version === version
      ) {
        const overrideBox = isValidBoundingBox(options?.existingBoundingBoxes?.[index])
          ? options.existingBoundingBoxes[index]
          : cached.box;
        return {
          box: overrideBox,
          points: cached.points,
          isClosed: cached.isClosed,
        };
      }

      const shape = buildShapeData(entry, rawPoints);
      cache.set(entry, {
        box: shape.box,
        points: shape.points,
        isClosed: shape.isClosed,
        length: rawPoints.length,
        firstPoint,
        lastPoint,
        version,
      });
      const resolvedBox = isValidBoundingBox(options?.existingBoundingBoxes?.[index])
        ? options.existingBoundingBoxes[index]
        : isValidBoundingBox(entry.boundingBox) && !shape.hasCurve
          ? entry.boundingBox
          : shape.box;
      return {
        box: resolvedBox,
        points: shape.points,
        isClosed: shape.isClosed,
      };
    }

    if (dynamic) {
      const shape = buildShapeData(entry, rawPoints);
      if (Object.prototype.hasOwnProperty.call(entry, 'boundingBox')) {
        const desc = Object.getOwnPropertyDescriptor(entry, 'boundingBox');
        if (desc && desc.writable) {
          entry.boundingBox = shape.box;
        }
      }
      return shape;
    }

    const preBox = isValidBoundingBox(options?.existingBoundingBoxes?.[index])
      ? options.existingBoundingBoxes[index]
      : isValidBoundingBox(entry.boundingBox)
        ? entry.boundingBox
        : null;

    const hasExplicitBulges = Boolean(entry.bulges || rawPoints.bulges);
    if (preBox && !hasExplicitBulges) {
      let lazyShape = null;
      return {
        box: preBox,
        get points() {
          if (!lazyShape) lazyShape = buildShapeData(entry, rawPoints);
          return lazyShape.points;
        },
        get isClosed() {
          if (!lazyShape) lazyShape = buildShapeData(entry, rawPoints);
          return lazyShape.isClosed;
        },
      };
    }

    return buildShapeData(entry, rawPoints);
  }

  const standaloneBox =
    !dynamic && isValidBoundingBox(options?.existingBoundingBoxes?.[index])
      ? options.existingBoundingBoxes[index]
      : isValidBoundingBox(entry)
        ? entry
        : isValidBoundingBox(entry.boundingBox)
          ? entry.boundingBox
          : null;

  if (!standaloneBox) {
    return null;
  }

  return {
    box: standaloneBox,
    rawBoxOnly: true,
    get points() {
      return boxToPolygon(standaloneBox).points;
    },
    get isClosed() {
      return !(
        standaloneBox.minX === standaloneBox.maxX && standaloneBox.minY === standaloneBox.maxY
      );
    },
  };
}

function boxesOverlap(a, b, tol) {
  return (
    a.maxX - b.minX > tol && b.maxX - a.minX > tol && a.maxY - b.minY > tol && b.maxY - a.minY > tol
  );
}

function pointToSegmentDistSq(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-18) {
    const dx = px - ax;
    const dy = py - ay;
    return dx * dx + dy * dy;
  }
  let t = ((px - ax) * vx + (py - ay) * vy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return dx * dx + dy * dy;
}

function isPointOnPolygonBoundary(p, poly, tol) {
  const tolSq = tol * tol;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (pointToSegmentDistSq(p.x, p.y, a.x, a.y, b.x, b.y) <= tolSq) {
      return true;
    }
  }
  return false;
}

function pointInPolygonRayCast(p, poly) {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  const px = p.x;
  const py = p.y;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointStrictlyInPolygon(p, poly, tol = DEFAULT_TOLERANCE) {
  if (!p || !Array.isArray(poly) || poly.length < 3) {
    return false;
  }
  if (isPointOnPolygonBoundary(p, poly, tol)) {
    return false;
  }
  return pointInPolygonRayCast(p, poly);
}

export function segmentsCrossOpenInterior(a1, a2, b1, b2, tol = DEFAULT_TOLERANCE) {
  const dxA = a2.x - a1.x;
  const dyA = a2.y - a1.y;
  const dxB = b2.x - b1.x;
  const dyB = b2.y - b1.y;

  const lenA = Math.hypot(dxA, dyA);
  const lenB = Math.hypot(dxB, dyB);
  if (lenA <= tol || lenB <= tol) {
    return false;
  }

  const denom = dxA * dyB - dyA * dxB;
  if (Math.abs(denom) <= 1e-12 * lenA * lenB) {
    return false;
  }

  const diffX = b1.x - a1.x;
  const diffY = b1.y - a1.y;
  const t = (diffX * dyB - diffY * dxB) / denom;
  const u = (diffX * dyA - diffY * dxA) / denom;

  if (t * lenA <= tol || (1 - t) * lenA <= tol) {
    return false;
  }
  if (u * lenB <= tol || (1 - u) * lenB <= tol) {
    return false;
  }

  const tolSq = tol * tol;
  if (
    pointToSegmentDistSq(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y) <= tolSq ||
    pointToSegmentDistSq(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y) <= tolSq ||
    pointToSegmentDistSq(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y) <= tolSq ||
    pointToSegmentDistSq(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y) <= tolSq
  ) {
    return false;
  }

  return true;
}

function segmentSubMidpointsEnterPolygon(a1, a2, poly, tol) {
  const vx = a2.x - a1.x;
  const vy = a2.y - a1.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= tol * tol) {
    return false;
  }

  const tolSq = tol * tol;
  let splits = null;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const t = ((p.x - a1.x) * vx + (p.y - a1.y) * vy) / lenSq;
    if (t > 1e-6 && t < 1 - 1e-6) {
      const qx = a1.x + t * vx;
      const qy = a1.y + t * vy;
      const distSq = (p.x - qx) * (p.x - qx) + (p.y - qy) * (p.y - qy);
      if (distSq <= tolSq * 4) {
        if (!splits) splits = [0, 1];
        splits.push(t);
      }
    }
  }

  if (!splits) {
    const mid = { x: (a1.x + a2.x) * 0.5, y: (a1.y + a2.y) * 0.5 };
    return isPointStrictlyInPolygon(mid, poly, tol);
  }

  splits.sort((x, y) => x - y);
  for (let i = 0; i < splits.length - 1; i += 1) {
    const t0 = splits[i];
    const t1 = splits[i + 1];
    if (t1 - t0 <= 1e-6) continue;
    const tm = (t0 + t1) * 0.5;
    const sample = { x: a1.x + tm * vx, y: a1.y + tm * vy };
    if (isPointStrictlyInPolygon(sample, poly, tol)) {
      return true;
    }
  }
  return false;
}

function signedPolygonArea(poly) {
  let sum = 0;
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum * 0.5;
}

function hasInwardMidpointProbeOverlap(sourcePoly, targetPoly, sourceBox, tol) {
  const signedArea = signedPolygonArea(sourcePoly);
  if (Math.abs(signedArea) <= 1e-12) {
    return false;
  }

  const minBoxDim = Math.min(sourceBox.maxX - sourceBox.minX, sourceBox.maxY - sourceBox.minY);
  const baseStep = Math.max(tol * 2.5, 1e-5);
  const clampedStep = minBoxDim > 0 ? Math.min(baseStep, minBoxDim * 0.25) : baseStep;
  const n = sourcePoly.length;

  for (let i = 0; i < n; i += 1) {
    const p1 = sourcePoly[i];
    const p2 = sourcePoly[(i + 1) % n];
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const len = Math.hypot(vx, vy);
    if (len <= tol) continue;

    if (segmentSubMidpointsEnterPolygon(p1, p2, targetPoly, tol)) {
      return true;
    }

    const dx = vx / len;
    const dy = vy / len;
    const nx = signedArea >= 0 ? -dy : dy;
    const ny = signedArea >= 0 ? dx : -dx;
    const midX = (p1.x + p2.x) * 0.5;
    const midY = (p1.y + p2.y) * 0.5;

    const altStep = Math.min(len * 0.25, minBoxDim > 0 ? minBoxDim * 0.25 : len * 0.25);
    const steps = altStep > clampedStep ? [clampedStep, altStep] : [clampedStep];

    for (let s = 0; s < steps.length; s += 1) {
      const step = steps[s];
      if (step <= tol) continue;
      const probe = { x: midX + nx * step, y: midY + ny * step };
      if (
        isPointStrictlyInPolygon(probe, sourcePoly, tol) &&
        isPointStrictlyInPolygon(probe, targetPoly, tol)
      ) {
        return true;
      }
    }
  }

  return false;
}

export function polygonsOverlapOpenInterior(
  polyA,
  polyB,
  tolerance = DEFAULT_TOLERANCE,
  boxAOverride = null,
  boxBOverride = null
) {
  if (!Array.isArray(polyA) || !Array.isArray(polyB) || polyA.length < 3 || polyB.length < 3) {
    return false;
  }

  const boxA = boxAOverride || boundingBox(polyA);
  const boxB = boxBOverride || boundingBox(polyB);
  const minSpan = Math.min(
    boxA.maxX - boxA.minX,
    boxA.maxY - boxA.minY,
    boxB.maxX - boxB.minX,
    boxB.maxY - boxB.minY
  );
  const rawTol = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : DEFAULT_TOLERANCE;
  const tol = minSpan > 0 ? Math.min(rawTol, minSpan * 0.1) : rawTol;

  if (!boxesOverlap(boxA, boxB, tol)) {
    return false;
  }

  const nA = polyA.length;
  const nB = polyB.length;

  // 1. Open-interior edge crossings
  for (let i = 0; i < nA; i += 1) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % nA];
    for (let j = 0; j < nB; j += 1) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % nB];
      if (segmentsCrossOpenInterior(a1, a2, b1, b2, tol)) {
        return true;
      }
    }
  }

  // 2. Strict boundary-excluding vertex inclusion
  for (let i = 0; i < nA; i += 1) {
    if (isPointStrictlyInPolygon(polyA[i], polyB, tol)) {
      return true;
    }
  }
  for (let j = 0; j < nB; j += 1) {
    if (isPointStrictlyInPolygon(polyB[j], polyA, tol)) {
      return true;
    }
  }

  // 3. Edge sub-segment midpoints and inward normal midpoint probes
  if (hasInwardMidpointProbeOverlap(polyA, polyB, boxA, tol)) {
    return true;
  }
  if (hasInwardMidpointProbeOverlap(polyB, polyA, boxB, tol)) {
    return true;
  }

  return false;
}

function openPolylineEntersPolygon(polyline, polyB, boxB, rawTol) {
  if (
    !Array.isArray(polyline) ||
    polyline.length === 0 ||
    !Array.isArray(polyB) ||
    polyB.length < 3
  ) {
    return false;
  }

  const spanB = Math.min(boxB.maxX - boxB.minX, boxB.maxY - boxB.minY);
  const tol = spanB > 0 ? Math.min(rawTol, spanB * 0.1) : rawTol;

  for (let i = 0; i < polyline.length; i += 1) {
    if (isPointStrictlyInPolygon(polyline[i], polyB, tol)) {
      return true;
    }
  }

  if (polyline.length === 1) {
    return false;
  }

  const nB = polyB.length;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a1 = polyline[i];
    const a2 = polyline[i + 1];
    for (let j = 0; j < nB; j += 1) {
      if (segmentsCrossOpenInterior(a1, a2, polyB[j], polyB[(j + 1) % nB], tol)) {
        return true;
      }
    }
    if (segmentSubMidpointsEnterPolygon(a1, a2, polyB, tol)) {
      return true;
    }
  }

  return false;
}

function shapesOverlap(candShape, otherShape, rawTol) {
  if (candShape.rawBoxOnly && otherShape.rawBoxOnly) {
    return true;
  }

  const candPoints = candShape.points;
  const otherPoints = otherShape.points;
  if (!candPoints || candPoints.length === 0 || !otherPoints || otherPoints.length === 0) {
    return false;
  }

  if (candShape.isClosed && otherShape.isClosed) {
    return polygonsOverlapOpenInterior(
      candPoints,
      otherPoints,
      rawTol,
      candShape.box,
      otherShape.box
    );
  }

  if (!candShape.isClosed && otherShape.isClosed) {
    return openPolylineEntersPolygon(candPoints, otherPoints, otherShape.box, rawTol);
  }

  if (candShape.isClosed && !otherShape.isClosed) {
    return openPolylineEntersPolygon(otherPoints, candPoints, candShape.box, rawTol);
  }

  // Both open polylines (1-point or 2-point)
  if (candPoints.length >= 2 && otherPoints.length >= 2) {
    for (let i = 0; i < candPoints.length - 1; i += 1) {
      for (let j = 0; j < otherPoints.length - 1; j += 1) {
        if (
          segmentsCrossOpenInterior(
            candPoints[i],
            candPoints[i + 1],
            otherPoints[j],
            otherPoints[j + 1],
            rawTol
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
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
  const rawTolerance =
    typeof options?.tolerance === 'number' &&
    Number.isFinite(options.tolerance) &&
    options.tolerance >= 0
      ? options.tolerance
      : DEFAULT_TOLERANCE;

  const candidateRawPoints = extractPoints(candidatePolygon);
  const candidateDynamic = isDynamicPolygon(candidatePolygon, options?.dynamicPolygons);

  let candShape = null;
  if (candidateRawPoints) {
    if (candidateRawPoints.length > 0) {
      candShape = buildShapeData(
        candidatePolygon,
        candidateRawPoints,
        options?.candidateBulges || null,
        options?.candidateClosed
      );
      if (!candidateDynamic && !candShape.hasCurve) {
        if (isValidBoundingBox(options?.candidateBoundingBox)) {
          candShape.box = options.candidateBoundingBox;
        } else if (isValidBoundingBox(candidatePolygon?.boundingBox)) {
          candShape.box = candidatePolygon.boundingBox;
        }
      }
    }
  } else {
    const candBox =
      !candidateDynamic && isValidBoundingBox(options?.candidateBoundingBox)
        ? options.candidateBoundingBox
        : isValidBoundingBox(candidatePolygon)
          ? candidatePolygon
          : !candidateDynamic && isValidBoundingBox(candidatePolygon?.boundingBox)
            ? candidatePolygon.boundingBox
            : null;
    if (candBox) {
      candShape = {
        box: candBox,
        rawBoxOnly: true,
        get points() {
          return boxToPolygon(candBox).points;
        },
        get isClosed() {
          return !(candBox.minX === candBox.maxX && candBox.minY === candBox.maxY);
        },
      };
    }
  }

  const overlapHits = [];

  if (candShape && Array.isArray(existingPolygons)) {
    const candSpan = Math.min(
      candShape.box.maxX - candShape.box.minX,
      candShape.box.maxY - candShape.box.minY
    );
    for (let index = 0; index < existingPolygons.length; index += 1) {
      const otherShape = resolveExistingShape(existingPolygons[index], index, options);
      if (!otherShape) continue;

      const otherSpan = Math.min(
        otherShape.box.maxX - otherShape.box.minX,
        otherShape.box.maxY - otherShape.box.minY
      );
      const minPositiveSpan =
        candSpan > 0 && otherSpan > 0
          ? Math.min(candSpan, otherSpan)
          : Math.max(candSpan, otherSpan);
      const broadTol =
        minPositiveSpan > 0 ? Math.min(rawTolerance, minPositiveSpan * 0.1) : rawTolerance;

      if (
        boxesOverlap(candShape.box, otherShape.box, broadTol) &&
        shapesOverlap(candShape, otherShape, rawTolerance)
      ) {
        overlapHits.push(index);
      }
    }
  }

  const selfIntersecting =
    candShape && candShape.isClosed && !candShape.rawBoxOnly
      ? hasSelfIntersection(candShape.points)
      : false;
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
