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

const COORD_OFFSET = 16777216;
const COORD_SPAN = 33554432;
const ANGULAR_BUCKET_COUNT = 180;

const edgeIndexCache = new WeakMap();

function bucketKey(gx, gy) {
  if (gx >= -COORD_OFFSET && gx < COORD_OFFSET && gy >= -COORD_OFFSET && gy < COORD_OFFSET) {
    return (gx + COORD_OFFSET) * COORD_SPAN + (gy + COORD_OFFSET);
  }
  return `${gx}:${gy}`;
}

function computeEdgeBounds(start, end, bulge, arc) {
  let minX = Math.min(start.x, end.x);
  let maxX = Math.max(start.x, end.x);
  let minY = Math.min(start.y, end.y);
  let maxY = Math.max(start.y, end.y);

  if (arc && !arc.isLinear) {
    const cx = arc.center.x;
    const cy = arc.center.y;
    const r = arc.radius;
    const cardinals = [
      { x: cx + r, y: cy },
      { x: cx - r, y: cy },
      { x: cx, y: cy + r },
      { x: cx, y: cy - r },
    ];
    for (let i = 0; i < cardinals.length; i++) {
      const pt = closestPointOnArc(cardinals[i], start, end, bulge).point;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  return { minX, minY, maxX, maxY };
}

function computeSmallEdgesChecksum(edges) {
  let sum = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e || !e.start || !e.end) continue;
    sum +=
      (e.start.x || 0) * (i + 1) +
      (e.start.y || 0) * (i + 2) +
      (e.end.x || 0) * (i + 3) +
      (e.end.y || 0) * (i + 4) +
      (e.bulge || 0) * 17;
  }
  return sum;
}

export class EdgeSpatialIndex {
  constructor(edges = [], cellSizeOption = null) {
    this.entries = [];
    this.curvedEntries = [];
    this.uniqueLinearPerps = [];
    this.linearPerpBuckets = Array.from({ length: ANGULAR_BUCKET_COUNT }, () => []);
    this.angleRefs = [{ refAngle: 0, edge: null }];
    this.edgeBuckets = new Map();
    this.midpointBuckets = new Map();
    this.cellSize = 64;
    this.minGX = 0;
    this.maxGX = -1;
    this.minGY = 0;
    this.maxGY = -1;
    this.seen = null;
    this.stamp = 0;

    if (!Array.isArray(edges) || edges.length === 0) {
      return;
    }

    let globalMinX = Infinity;
    let globalMinY = Infinity;
    let globalMaxX = -Infinity;
    let globalMaxY = -Infinity;
    let totalSpan = 0;

    const seenLinearDirs = new Set();
    const seenRefAngles = new Set([0]);

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge || !edge.start || !edge.end) continue;
      const sx = edge.start.x;
      const sy = edge.start.y;
      const ex = edge.end.x;
      const ey = edge.end.y;
      if (
        !Number.isFinite(sx) ||
        !Number.isFinite(sy) ||
        !Number.isFinite(ex) ||
        !Number.isFinite(ey)
      ) {
        continue;
      }

      const bulge = edge.bulge || 0;
      const arc = bulge ? getArcParameters(edge.start, edge.end, bulge) : null;
      const isCurved = Boolean(arc && !arc.isLinear);
      const bounds = computeEdgeBounds(edge.start, edge.end, bulge, arc);
      const midpoint = pointOnArc(edge.start, edge.end, bulge, 0.5);

      const edx = ex - sx;
      const edy = ey - sy;
      const elen = Math.hypot(edx, edy);
      const hasDirection = elen > 0;
      const edgeDir = hasDirection ? { x: edx / elen, y: edy / elen } : { x: 0, y: 0 };
      const perpendicular = { x: -edgeDir.y, y: edgeDir.x };
      const edgeAngle = hasDirection ? Math.atan2(edy, edx) : 0;

      const entry = {
        edge,
        order: this.entries.length,
        bulge,
        arc,
        isCurved,
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        midpoint,
        hasDirection,
        edgeDir,
        perpendicular,
      };

      this.entries.push(entry);

      if (bounds.minX < globalMinX) globalMinX = bounds.minX;
      if (bounds.minY < globalMinY) globalMinY = bounds.minY;
      if (bounds.maxX > globalMaxX) globalMaxX = bounds.maxX;
      if (bounds.maxY > globalMaxY) globalMaxY = bounds.maxY;
      totalSpan += Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

      if (isCurved) {
        this.curvedEntries.push(entry);
      } else if (hasDirection) {
        const dirKey = `${edgeDir.x},${edgeDir.y}`;
        if (!seenLinearDirs.has(dirKey)) {
          seenLinearDirs.add(dirKey);
          this.uniqueLinearPerps.push(entry);
          const axisAngle =
            ((Math.atan2(perpendicular.y, perpendicular.x) % Math.PI) + Math.PI) % Math.PI;
          const aIdx = Math.min(
            ANGULAR_BUCKET_COUNT - 1,
            Math.floor((axisAngle / Math.PI) * ANGULAR_BUCKET_COUNT)
          );
          this.linearPerpBuckets[aIdx].push(entry);
        }
      }

      if (hasDirection && !seenRefAngles.has(edgeAngle)) {
        seenRefAngles.add(edgeAngle);
        this.angleRefs.push({ refAngle: edgeAngle, edge });
      }
    }

    if (this.entries.length === 0) {
      return;
    }

    const maxSceneSpan = Math.max(globalMaxX - globalMinX, globalMaxY - globalMinY);
    const avgSpan = totalSpan / this.entries.length;
    const baseCellSize = avgSpan > 0 ? avgSpan : maxSceneSpan > 0 ? maxSceneSpan : 64;
    const minCellForScene =
      maxSceneSpan > 0
        ? maxSceneSpan / Math.max(64, Math.ceil(Math.sqrt(this.entries.length) * 8))
        : 0;

    this.cellSize =
      typeof cellSizeOption === 'number' && Number.isFinite(cellSizeOption) && cellSizeOption > 0
        ? Math.max(cellSizeOption, minCellForScene)
        : Math.max(1e-3, baseCellSize, minCellForScene);

    const invCell = 1 / this.cellSize;
    this.minGX = Math.floor(globalMinX * invCell);
    this.maxGX = Math.floor(globalMaxX * invCell);
    this.minGY = Math.floor(globalMinY * invCell);
    this.maxGY = Math.floor(globalMaxY * invCell);
    this.seen = new Uint32Array(this.entries.length);

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const gx0 = Math.floor(entry.minX * invCell);
      const gx1 = Math.floor(entry.maxX * invCell);
      const gy0 = Math.floor(entry.minY * invCell);
      const gy1 = Math.floor(entry.maxY * invCell);

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const key = bucketKey(gx, gy);
          let bucket = this.edgeBuckets.get(key);
          if (!bucket) {
            bucket = [];
            this.edgeBuckets.set(key, bucket);
          }
          bucket.push(entry);
        }
      }

      const mgx = Math.floor(entry.midpoint.x * invCell);
      const mgy = Math.floor(entry.midpoint.y * invCell);
      const mKey = bucketKey(mgx, mgy);
      let mBucket = this.midpointBuckets.get(mKey);
      if (!mBucket) {
        mBucket = [];
        this.midpointBuckets.set(mKey, mBucket);
      }
      mBucket.push(entry);
    }
  }

  _nextStamp() {
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    return this.stamp;
  }

  forEachEdgeCandidate(point, threshold, visitor) {
    const count = this.entries.length;
    if (count === 0 || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    if (!Number.isFinite(threshold)) {
      for (let i = 0; i < count; i++) {
        visitor(this.entries[i]);
      }
      return;
    }

    if (threshold < 0) {
      return;
    }

    const invCell = 1 / this.cellSize;
    const qx0 = Math.max(this.minGX, Math.floor((point.x - threshold) * invCell));
    const qx1 = Math.min(this.maxGX, Math.floor((point.x + threshold) * invCell));
    const qy0 = Math.max(this.minGY, Math.floor((point.y - threshold) * invCell));
    const qy1 = Math.min(this.maxGY, Math.floor((point.y + threshold) * invCell));

    if (qx0 > qx1 || qy0 > qy1) {
      return;
    }

    const cellWindowCount = (qx1 - qx0 + 1) * (qy1 - qy0 + 1);
    if (cellWindowCount > count) {
      const minX = point.x - threshold;
      const maxX = point.x + threshold;
      const minY = point.y - threshold;
      const maxY = point.y + threshold;
      for (let i = 0; i < count; i++) {
        const entry = this.entries[i];
        if (entry.maxX >= minX && entry.minX <= maxX && entry.maxY >= minY && entry.minY <= maxY) {
          visitor(entry);
        }
      }
      return;
    }

    const minX = point.x - threshold;
    const maxX = point.x + threshold;
    const minY = point.y - threshold;
    const maxY = point.y + threshold;

    if (cellWindowCount === 1) {
      const bucket = this.edgeBuckets.get(bucketKey(qx0, qy0));
      if (!bucket) return;
      for (let i = 0; i < bucket.length; i++) {
        const entry = bucket[i];
        if (entry.maxX >= minX && entry.minX <= maxX && entry.maxY >= minY && entry.minY <= maxY) {
          visitor(entry);
        }
      }
      return;
    }

    const stamp = this._nextStamp();
    const seen = this.seen;
    for (let gy = qy0; gy <= qy1; gy++) {
      for (let gx = qx0; gx <= qx1; gx++) {
        const bucket = this.edgeBuckets.get(bucketKey(gx, gy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const entry = bucket[i];
          if (seen[entry.order] === stamp) continue;
          seen[entry.order] = stamp;
          if (
            entry.maxX >= minX &&
            entry.minX <= maxX &&
            entry.maxY >= minY &&
            entry.minY <= maxY
          ) {
            visitor(entry);
          }
        }
      }
    }
  }

  forEachMidpointCandidate(point, threshold, visitor) {
    const count = this.entries.length;
    if (count === 0 || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    if (!Number.isFinite(threshold)) {
      for (let i = 0; i < count; i++) {
        visitor(this.entries[i]);
      }
      return;
    }

    if (threshold < 0) {
      return;
    }

    const invCell = 1 / this.cellSize;
    const qx0 = Math.max(this.minGX, Math.floor((point.x - threshold) * invCell));
    const qx1 = Math.min(this.maxGX, Math.floor((point.x + threshold) * invCell));
    const qy0 = Math.max(this.minGY, Math.floor((point.y - threshold) * invCell));
    const qy1 = Math.min(this.maxGY, Math.floor((point.y + threshold) * invCell));

    if (qx0 > qx1 || qy0 > qy1) {
      return;
    }

    const minX = point.x - threshold;
    const maxX = point.x + threshold;
    const minY = point.y - threshold;
    const maxY = point.y + threshold;

    const cellWindowCount = (qx1 - qx0 + 1) * (qy1 - qy0 + 1);
    if (cellWindowCount > count) {
      for (let i = 0; i < count; i++) {
        const entry = this.entries[i];
        const mp = entry.midpoint;
        if (mp.x >= minX && mp.x <= maxX && mp.y >= minY && mp.y <= maxY) {
          visitor(entry);
        }
      }
      return;
    }

    for (let gy = qy0; gy <= qy1; gy++) {
      for (let gx = qx0; gx <= qx1; gx++) {
        const bucket = this.midpointBuckets.get(bucketKey(gx, gy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const entry = bucket[i];
          const mp = entry.midpoint;
          if (mp.x >= minX && mp.x <= maxX && mp.y >= minY && mp.y <= maxY) {
            visitor(entry);
          }
        }
      }
    }
  }
}

const EMPTY_SPATIAL_INDEX = new EdgeSpatialIndex([]);

export function createEdgeSpatialIndex(edges, cellSize = null) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return EMPTY_SPATIAL_INDEX;
  }
  return new EdgeSpatialIndex(edges, cellSize);
}

function getOrCreateSpatialIndex(edges, spatialIndex = null) {
  if (spatialIndex instanceof EdgeSpatialIndex) {
    return spatialIndex;
  }
  if (!Array.isArray(edges) || edges.length === 0) {
    return EMPTY_SPATIAL_INDEX;
  }

  const len = edges.length;
  const first = edges[0];
  const mid = edges[len >> 1];
  const last = edges[len - 1];
  const smallChecksum = len <= 32 ? computeSmallEdgesChecksum(edges) : null;

  const cached = edgeIndexCache.get(edges);
  if (
    cached &&
    cached.length === len &&
    cached.first === first &&
    cached.mid === mid &&
    cached.last === last &&
    (smallChecksum !== null
      ? Object.is(cached.smallChecksum, smallChecksum)
      : Object.is(cached.firstSX, first?.start?.x) &&
        Object.is(cached.firstSY, first?.start?.y) &&
        Object.is(cached.lastEX, last?.end?.x) &&
        Object.is(cached.lastEY, last?.end?.y))
  ) {
    return cached.index;
  }

  const index = new EdgeSpatialIndex(edges);
  edgeIndexCache.set(edges, {
    index,
    length: len,
    first,
    mid,
    last,
    smallChecksum,
    firstSX: first?.start?.x,
    firstSY: first?.start?.y,
    lastEX: last?.end?.x,
    lastEY: last?.end?.y,
  });
  return index;
}

function snapToGrid(point, settings) {
  return {
    x: quantize(point.x, settings.unitSize),
    y: quantize(point.y, settings.unitSize),
  };
}

function snapToEdge(point, spatialIndex, threshold) {
  let best = null;
  let bestOrder = Infinity;
  spatialIndex.forEachEdgeCandidate(point, threshold, (entry) => {
    const edge = entry.edge;
    const candidate = closestPointOnArc(point, edge.start, edge.end, entry.bulge);
    const score =
      candidate.distance !== undefined ? candidate.distance : distance(point, candidate.point);
    if (
      score <= threshold &&
      (!best || score < best.distance || (score === best.distance && entry.order < bestOrder))
    ) {
      best = {
        point: candidate.point,
        distance: score,
        type: 'edge',
        edgeIndex: edge.index,
      };
      bestOrder = entry.order;
    }
  });
  return best;
}

function snapToMidpoint(point, spatialIndex, threshold) {
  let best = null;
  let bestOrder = Infinity;
  spatialIndex.forEachMidpointCandidate(point, threshold, (entry) => {
    const midpoint = entry.midpoint;
    const score = distance(point, midpoint);
    if (
      score <= threshold &&
      (!best || score < best.distance || (score === best.distance && entry.order < bestOrder))
    ) {
      best = {
        point: midpoint,
        distance: score,
        type: 'midpoint',
        edgeIndex: entry.edge.index,
      };
      bestOrder = entry.order;
    }
  });
  return best;
}

function evaluateLinearPerpEntry(entry, point, anchor, anchorToPoint, threshold, state) {
  const perpendicular = entry.perpendicular;
  const projectedDistance = dot(anchorToPoint, perpendicular);
  const alignedPoint = add(anchor, multiply(perpendicular, projectedDistance));
  const snapDistance = distance(point, alignedPoint);

  if (
    snapDistance <= threshold &&
    (!state.best ||
      snapDistance < state.best.distance ||
      (snapDistance === state.best.distance && entry.order < state.bestOrder))
  ) {
    state.best = {
      point: alignedPoint,
      distance: snapDistance,
      type: 'perpendicular',
      edgeIndex: entry.edge.index,
    };
    state.bestOrder = entry.order;
  }
}

function snapToPerpendicular(point, anchor, spatialIndex, threshold) {
  const state = { best: null, bestOrder: Infinity };
  const anchorToPoint = sub(point, anchor);

  if (spatialIndex.curvedEntries.length > 0) {
    spatialIndex.forEachEdgeCandidate(point, threshold, (entry) => {
      if (!entry.isCurved) return;
      const arc = entry.arc;
      const dirToAnchor = normalize(sub(anchor, arc.center));
      if (dirToAnchor.x !== 0 || dirToAnchor.y !== 0) {
        const arcPoint1 = add(arc.center, multiply(dirToAnchor, arc.radius));
        const candidate = closestPointOnArc(
          arcPoint1,
          entry.edge.start,
          entry.edge.end,
          entry.bulge
        );
        const snapDistance = distance(point, candidate.point);
        if (
          snapDistance <= threshold &&
          (!state.best ||
            snapDistance < state.best.distance ||
            (snapDistance === state.best.distance && entry.order < state.bestOrder))
        ) {
          state.best = {
            point: candidate.point,
            distance: snapDistance,
            type: 'perpendicular',
            edgeIndex: entry.edge.index,
          };
          state.bestOrder = entry.order;
        }
      }
    });

    for (let i = 0; i < spatialIndex.curvedEntries.length; i++) {
      const entry = spatialIndex.curvedEntries[i];
      if (!entry.hasDirection) continue;
      if (anchor.x === entry.arc.center.x && anchor.y === entry.arc.center.y) {
        evaluateLinearPerpEntry(entry, point, anchor, anchorToPoint, threshold, state);
      }
    }
  }

  const uniqueLinear = spatialIndex.uniqueLinearPerps;
  if (uniqueLinear.length === 0) {
    return state.best;
  }

  const distAP = Math.hypot(anchorToPoint.x, anchorToPoint.y);
  if (
    uniqueLinear.length <= 16 ||
    distAP === 0 ||
    !Number.isFinite(threshold) ||
    threshold >= distAP
  ) {
    for (let i = 0; i < uniqueLinear.length; i++) {
      evaluateLinearPerpEntry(uniqueLinear[i], point, anchor, anchorToPoint, threshold, state);
    }
    return state.best;
  }

  const maxDelta = Math.asin(Math.min(1, threshold / distAP)) + 1e-6;
  if (maxDelta >= Math.PI / 2) {
    for (let i = 0; i < uniqueLinear.length; i++) {
      evaluateLinearPerpEntry(uniqueLinear[i], point, anchor, anchorToPoint, threshold, state);
    }
    return state.best;
  }

  const targetAngle =
    ((Math.atan2(anchorToPoint.y, anchorToPoint.x) % Math.PI) + Math.PI) % Math.PI;
  const bucketRadius = Math.ceil((maxDelta / Math.PI) * ANGULAR_BUCKET_COUNT) + 1;
  const centerBucket = Math.min(
    ANGULAR_BUCKET_COUNT - 1,
    Math.floor((targetAngle / Math.PI) * ANGULAR_BUCKET_COUNT)
  );

  for (let offset = -bucketRadius; offset <= bucketRadius; offset++) {
    const idx =
      (((centerBucket + offset) % ANGULAR_BUCKET_COUNT) + ANGULAR_BUCKET_COUNT) %
      ANGULAR_BUCKET_COUNT;
    const bucket = spatialIndex.linearPerpBuckets[idx];
    for (let i = 0; i < bucket.length; i++) {
      evaluateLinearPerpEntry(bucket[i], point, anchor, anchorToPoint, threshold, state);
    }
  }

  return state.best;
}

function snapToAngle(point, anchor, settings, spatialIndex) {
  if (!anchor || (anchor.x === point.x && anchor.y === point.y)) return null;
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return null;

  const rawAngle = Math.atan2(dy, dx);
  const threshold = settings.magneticThreshold;
  const refs = spatialIndex.angleRefs;

  let best = null;

  for (let i = 0; i < refs.length; i++) {
    const refItem = refs[i];
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
  spatialIndex = null,
  settings,
  snapModes,
  scale = 1.0,
}) {
  const safeScale =
    typeof scale === 'number' && Number.isFinite(scale) ? Math.max(scale, 0.0001) : 1.0;

  const baseSettings = settings || DEFAULT_GRID_SETTINGS;
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
  };

  const candidates = [];

  const needsEdges =
    snapModes.isEnabled(SNAP_MODES.EDGE) ||
    snapModes.isEnabled(SNAP_MODES.MIDPOINT) ||
    snapModes.isEnabled(SNAP_MODES.PERPENDICULAR) ||
    snapModes.isEnabled(SNAP_MODES.ANGLE);
  const resolvedIndex = needsEdges
    ? getOrCreateSpatialIndex(edges, spatialIndex)
    : EMPTY_SPATIAL_INDEX;

  if (snapModes.isEnabled(SNAP_MODES.GRID)) {
    const gridPoint = snapToGrid(point, normalizedSettings);
    candidates.push({
      type: 'grid',
      point: gridPoint,
      distance: distance(point, gridPoint),
    });
  }

  if (snapModes.isEnabled(SNAP_MODES.EDGE)) {
    candidates.push(snapToEdge(point, resolvedIndex, normalizedSettings.edgeThreshold));
  }

  if (snapModes.isEnabled(SNAP_MODES.MIDPOINT)) {
    candidates.push(snapToMidpoint(point, resolvedIndex, normalizedSettings.midpointThreshold));
  }

  if (snapModes.isEnabled(SNAP_MODES.PERPENDICULAR)) {
    candidates.push(
      snapToPerpendicular(point, anchor, resolvedIndex, normalizedSettings.perpendicularThreshold)
    );
  }

  if (snapModes.isEnabled(SNAP_MODES.ANGLE)) {
    candidates.push(snapToAngle(point, anchor, normalizedSettings, resolvedIndex));
  }

  const best = chooseBestSnap(candidates, normalizedSettings.magneticThreshold);

  return {
    point: best ? best.point : point,
    snap: best,
  };
}

export function snapAngle(angleRadians, settings, refAngle = 0) {
  const step = (settings.angleSnapDegrees * Math.PI) / 180;
  const delta = Math.atan2(Math.sin(angleRadians - refAngle), Math.cos(angleRadians - refAngle));
  return refAngle + quantize(delta, step);
}
