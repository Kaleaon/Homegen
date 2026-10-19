import { quantize } from './gridSettings.mjs';
import { SNAP_MODES } from './snapModes.mjs';

/**
 * 3D Euclidean distance between two points {x, y, z}.
 */
export function distance3D(p1, p2) {
  const dx = (p1.x || 0) - (p2.x || 0);
  const dy = (p1.y || 0) - (p2.y || 0);
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.hypot(dx, dy, dz);
}

/**
 * Computes closest point on a 3D segment defined by start and end points.
 */
export function closestPointOnSegment3D(point, start, end) {
  const vx = (end.x || 0) - (start.x || 0);
  const vy = (end.y || 0) - (start.y || 0);
  const vz = (end.z || 0) - (start.z || 0);

  const wx = (point.x || 0) - (start.x || 0);
  const wy = (point.y || 0) - (start.y || 0);
  const wz = (point.z || 0) - (start.z || 0);

  const lenSq = vx * vx + vy * vy + vz * vz;
  if (lenSq === 0) {
    return { point: { ...start }, t: 0 };
  }

  let t = (wx * vx + wy * vy + wz * vz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    point: {
      x: start.x + t * vx,
      y: start.y + t * vy,
      z: start.z + t * vz,
    },
    t,
  };
}

/**
 * Snaps 3D point coordinates to 3D grid unit size.
 */
export function snap3DToGrid(point, settings) {
  const unit = settings.unitSize || 6;
  return {
    x: quantize(point.x || 0, unit),
    y: quantize(point.y || 0, unit),
    z: quantize(point.z || 0, unit),
  };
}

/**
 * Snaps to nearest 3D vertex (wall corners, room corners, object bounding vertices).
 */
export function snap3DToVertex(point, vertices, threshold) {
  let best = null;
  for (const v of vertices) {
    const score = distance3D(point, v);
    if (score <= threshold && (!best || score < best.distance)) {
      best = {
        point: { x: v.x, y: v.y, z: v.z },
        distance: score,
        type: 'vertex',
        vertexId: v.id || null,
        label: v.label || '3D Vertex',
      };
    }
  }
  return best;
}

/**
 * Snaps to nearest 3D edge (wall segment top/bottom lines, bounding box edges).
 */
export function snap3DToEdge(point, edges, threshold) {
  let best = null;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const candidate = closestPointOnSegment3D(point, edge.start, edge.end);
    const score = distance3D(point, candidate.point);
    if (score <= threshold && (!best || score < best.distance)) {
      best = {
        point: candidate.point,
        distance: score,
        type: 'edge',
        edgeIndex: edge.index !== undefined ? edge.index : i,
        edgeId: edge.id || null,
      };
    }
  }
  return best;
}

/**
 * Snaps to midpoints of 3D edges.
 */
export function snap3DToMidpoint(point, edges, threshold) {
  let best = null;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const midpoint = {
      x: ((edge.start.x || 0) + (edge.end.x || 0)) / 2,
      y: ((edge.start.y || 0) + (edge.end.y || 0)) / 2,
      z: ((edge.start.z || 0) + (edge.end.z || 0)) / 2,
    };
    const score = distance3D(point, midpoint);
    if (score <= threshold && (!best || score < best.distance)) {
      best = {
        point: midpoint,
        distance: score,
        type: 'midpoint',
        edgeIndex: edge.index !== undefined ? edge.index : i,
        edgeId: edge.id || null,
      };
    }
  }
  return best;
}

/**
 * Snaps to perpendicular 3D alignment relative to an anchor point and surface normal or edge vector.
 */
export function snap3DToPerpendicular(point, anchor, edges, threshold) {
  let best = null;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const edgeVec = {
      x: (edge.end.x || 0) - (edge.start.x || 0),
      y: (edge.end.y || 0) - (edge.start.y || 0),
      z: (edge.end.z || 0) - (edge.start.z || 0),
    };
    const len = Math.hypot(edgeVec.x, edgeVec.y, edgeVec.z);
    if (len === 0) continue;

    const dir = { x: edgeVec.x / len, y: edgeVec.y / len, z: edgeVec.z / len };
    const anchorToPoint = {
      x: (point.x || 0) - (anchor.x || 0),
      y: (point.y || 0) - (anchor.y || 0),
      z: (point.z || 0) - (anchor.z || 0),
    };

    // Projection along edge dir
    const projScalar = anchorToPoint.x * dir.x + anchorToPoint.y * dir.y + anchorToPoint.z * dir.z;
    const perpVec = {
      x: anchorToPoint.x - projScalar * dir.x,
      y: anchorToPoint.y - projScalar * dir.y,
      z: anchorToPoint.z - projScalar * dir.z,
    };

    const alignedPoint = {
      x: anchor.x + perpVec.x,
      y: anchor.y + perpVec.y,
      z: anchor.z + perpVec.z,
    };

    const snapDistance = distance3D(point, alignedPoint);
    if (snapDistance <= threshold && (!best || snapDistance < best.distance)) {
      best = {
        point: alignedPoint,
        distance: snapDistance,
        type: 'perpendicular',
        edgeIndex: edge.index !== undefined ? edge.index : i,
        edgeId: edge.id || null,
      };
    }
  }
  return best;
}

/**
 * Snaps 3D position based on angular step relative to an anchor point in 3D space.
 */
export function snap3DToAngle(point, anchor, settings) {
  if (!anchor) return null;
  const dx = (point.x || 0) - (anchor.x || 0);
  const dz = (point.z || 0) - (anchor.z || 0);
  const dist = Math.hypot(dx, dz);
  if (dist === 0) return null;

  const stepRad = ((settings.angleSnapDegrees || 15) * Math.PI) / 180;
  const rawAngle = Math.atan2(dx, dz);
  const snappedAngle = quantize(rawAngle, stepRad);

  const alignedPoint = {
    x: anchor.x + dist * Math.sin(snappedAngle),
    y: point.y,
    z: anchor.z + dist * Math.cos(snappedAngle),
  };

  const snapDist = distance3D(point, alignedPoint);
  return {
    point: alignedPoint,
    distance: snapDist,
    type: 'angle',
    angleDegrees: Math.round((snappedAngle * 180) / Math.PI),
  };
}

/**
 * Calculates Euler rotation degrees (yaw, pitch, roll) from a 3D surface normal vector.
 */
export function computeSurfaceOrientation(normal) {
  if (!normal) {
    return { yaw: 0, pitch: 0, roll: 0, degrees: 0 };
  }
  const nx = normal.x || 0;
  const ny = normal.y || 0;
  const nz = normal.z || 0;

  const yawRad = Math.atan2(nx, nz);
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, ny)));
  const yawDeg = Math.round((yawRad * 180) / Math.PI);
  const pitchDeg = Math.round((pitchRad * 180) / Math.PI);

  return {
    yaw: yawDeg,
    pitch: pitchDeg,
    roll: 0,
    degrees: yawDeg,
    normal: { x: nx, y: ny, z: nz },
  };
}

/**
 * Evaluates all active 3D snap modes and selects the candidate with the closest distance within thresholds.
 */
export function getSnappedPoint3D({
  point,
  normal = null,
  anchor = point,
  vertices = [],
  edges = [],
  _surfaces = [],
  settings = {},
  snapModes = null,
}) {
  const p = { x: point?.x || 0, y: point?.y || 0, z: point?.z || 0 };
  const a = { x: anchor?.x || p.x, y: anchor?.y || p.y, z: anchor?.z || p.z };
  const candidates = [];

  const threshold = settings.magneticThreshold || 12; // inches in 3D
  const isEnabled = (mode) => (!snapModes ? true : snapModes.isEnabled(mode));

  if (isEnabled(SNAP_MODES.GRID)) {
    const gridPt = snap3DToGrid(p, settings);
    candidates.push({
      type: 'grid',
      point: gridPt,
      distance: distance3D(p, gridPt),
    });
  }

  if (isEnabled(SNAP_MODES.EDGE)) {
    const vertexCandidate = snap3DToVertex(p, vertices, settings.vertexThreshold || threshold);
    if (vertexCandidate) candidates.push(vertexCandidate);

    const edgeCandidate = snap3DToEdge(p, edges, settings.edgeThreshold || threshold);
    if (edgeCandidate) candidates.push(edgeCandidate);
  }

  if (isEnabled(SNAP_MODES.MIDPOINT)) {
    const midCandidate = snap3DToMidpoint(p, edges, settings.midpointThreshold || threshold);
    if (midCandidate) candidates.push(midCandidate);
  }

  if (isEnabled(SNAP_MODES.PERPENDICULAR)) {
    const perpCandidate = snap3DToPerpendicular(
      p,
      a,
      edges,
      settings.perpendicularThreshold || threshold
    );
    if (perpCandidate) candidates.push(perpCandidate);
  }

  if (isEnabled(SNAP_MODES.ANGLE)) {
    const angleCandidate = snap3DToAngle(p, a, settings);
    if (angleCandidate) candidates.push(angleCandidate);
  }

  // Surface Normal Snapping: if ray hits a wall surface or floor surface
  if (normal && (normal.x !== 0 || normal.y !== 0 || normal.z !== 0)) {
    const surfaceCandidate = {
      type: 'surface_normal',
      point: { ...p },
      normal: { ...normal },
      distance: settings.magneticThreshold || threshold,
      orientation: computeSurfaceOrientation(normal),
    };
    candidates.push(surfaceCandidate);
  }

  const validCandidates = candidates
    .filter(Boolean)
    .filter((c) => c.distance <= (settings.magneticThreshold || threshold));

  validCandidates.sort((c1, c2) => c1.distance - c2.distance);

  const best = validCandidates[0] || null;
  const finalPoint = best ? best.point : p;
  const finalNormal = (best && best.normal) || normal || { x: 0, y: 0, z: 1 };

  return {
    point: finalPoint,
    normal: finalNormal,
    orientation: computeSurfaceOrientation(finalNormal),
    snap: best,
  };
}
