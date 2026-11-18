import { getSnappedPoint, snapAngle } from './snapping.mjs';
import { getSnappedPoint3D, computeSurfaceOrientation, distance3D } from './snapping3d.mjs';

export function parseCoordinateInput(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function normalizeRotationDegrees(angleDegrees, fallbackDegrees = 0) {
  const fbNum = Number(fallbackDegrees);
  const rawFallback = Number.isFinite(fbNum) ? ((fbNum % 360) + 360) % 360 : 0;
  const cleanFallback =
    rawFallback === 360 || Object.is(rawFallback, -0) ? 0 : Math.round(rawFallback * 1000) / 1000;

  if (angleDegrees === '' || angleDegrees === null || angleDegrees === undefined) {
    return cleanFallback;
  }
  if (typeof angleDegrees === 'string' && angleDegrees.trim() === '') {
    return cleanFallback;
  }
  const num = Number(angleDegrees);
  if (!Number.isFinite(num)) return cleanFallback;

  const wrapped = ((num % 360) + 360) % 360;
  const rounded = Math.round(wrapped * 1000) / 1000;
  return rounded === 360 || Object.is(rounded, -0) ? 0 : rounded;
}

export function clampPositionToBounds(position, bounds = null) {
  const x0 = Number.isFinite(position?.x) ? position.x : 0;
  const y0 = Number.isFinite(position?.y) ? position.y : 0;
  const z0 = Number.isFinite(position?.z) ? position.z : 0;

  if (!bounds) {
    return { x: x0, y: y0, z: z0 };
  }

  let minX = bounds.minX;
  let maxX = bounds.maxX;
  let minY = bounds.minY;
  let maxY = bounds.maxY;
  let minZ = bounds.minZ;
  let maxZ = bounds.maxZ;

  const room =
    bounds.room || (typeof bounds.x === 'number' && typeof bounds.w === 'number' ? bounds : null);

  if (room) {
    const wt = bounds.wallThickness !== undefined ? bounds.wallThickness : 4.5;
    const halfW = (bounds.width || 0) / 2;
    const halfD = (bounds.depth || 0) / 2;
    const rMinX = (room.x ?? 0) + wt / 2 + halfW;
    const rMaxX = Math.max(rMinX, (room.x ?? 0) + (room.w ?? 0) - wt / 2 - halfW);
    const rMinY = (room.y ?? 0) + wt / 2 + halfD;
    const rMaxY = Math.max(rMinY, (room.y ?? 0) + (room.h ?? 0) - wt / 2 - halfD);

    if (minX === undefined) minX = rMinX;
    if (maxX === undefined) maxX = rMaxX;
    if (minY === undefined) minY = rMinY;
    if (maxY === undefined) maxY = rMaxY;
    if (minZ === undefined) minZ = 0;
    if (maxZ === undefined && typeof room.ceiling === 'number') {
      maxZ = Math.max(0, room.ceiling - (bounds.height || 0));
    }
  }

  let x = x0;
  let y = y0;
  let z = z0;

  if (typeof minX === 'number' && typeof maxX === 'number') {
    x = Math.max(minX, Math.min(maxX, x));
  } else {
    if (typeof minX === 'number') x = Math.max(minX, x);
    if (typeof maxX === 'number') x = Math.min(maxX, x);
  }

  if (typeof minY === 'number' && typeof maxY === 'number') {
    y = Math.max(minY, Math.min(maxY, y));
  } else {
    if (typeof minY === 'number') y = Math.max(minY, y);
    if (typeof maxY === 'number') y = Math.min(maxY, y);
  }

  if (typeof minZ === 'number' && typeof maxZ === 'number') {
    z = Math.max(minZ, Math.min(maxZ, z));
  } else {
    if (typeof minZ === 'number') z = Math.max(minZ, z);
    if (typeof maxZ === 'number') z = Math.min(maxZ, z);
  }

  return { x, y, z };
}

export class TransformGizmo {
  constructor(settings, snapModes) {
    this.settings = settings;
    this.snapModes = snapModes;
  }

  move(entity, pointerPoint, context = {}) {
    if (!entity) throw new Error('TransformGizmo.move: entity is required');
    if (!pointerPoint) throw new Error('TransformGizmo.move: pointerPoint is required');
    const { point, snap } = getSnappedPoint({
      point: pointerPoint,
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    return {
      ...entity,
      position: point,
      interaction: {
        type: 'move',
        snap,
      },
    };
  }

  move3D(entity, pointerPoint3D, context = {}) {
    if (!entity) throw new Error('TransformGizmo.move3D: entity is required');
    if (!pointerPoint3D) throw new Error('TransformGizmo.move3D: pointerPoint3D is required');

    const res = getSnappedPoint3D({
      point: pointerPoint3D,
      normal: context.normal || null,
      anchor: context.anchor || entity.position || pointerPoint3D,
      vertices: context.vertices || [],
      edges: context.edges || [],
      surfaces: context.surfaces || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    return {
      ...entity,
      position: res.point,
      normal: res.normal,
      orientation: res.orientation,
      interaction: {
        type: 'move3d',
        snap: res.snap,
        normal: res.normal,
        orientation: res.orientation,
      },
    };
  }

  rotate(entity, pointerAngleRadians) {
    if (!entity) throw new Error('TransformGizmo.rotate: entity is required');
    const snapped = snapAngle(pointerAngleRadians, this.settings);

    return {
      ...entity,
      rotation: snapped,
      interaction: {
        type: 'rotate',
        snap: {
          type: 'angle',
          value: snapped,
          original: pointerAngleRadians,
        },
      },
    };
  }

  rotate3D(entity, pointerAngleRadians, context = {}) {
    if (!entity) throw new Error('TransformGizmo.rotate3D: entity is required');
    const snapped = snapAngle(pointerAngleRadians, this.settings);
    const normal = context.normal || { x: 0, y: 0, z: 1 };
    const baseOrientation = computeSurfaceOrientation(normal);

    return {
      ...entity,
      rotation: snapped,
      orientation: {
        ...baseOrientation,
        yaw: baseOrientation.yaw + Math.round((snapped * 180) / Math.PI),
      },
      interaction: {
        type: 'rotate3d',
        snap: {
          type: 'angle',
          value: snapped,
          original: pointerAngleRadians,
        },
      },
    };
  }

  scale(entity, pointerPoint, context = {}) {
    if (!entity) throw new Error('TransformGizmo.scale: entity is required');
    if (!pointerPoint) throw new Error('TransformGizmo.scale: pointerPoint is required');
    const { point, snap } = getSnappedPoint({
      point: pointerPoint,
      anchor: entity.position,
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    const dx = point.x - entity.position.x;
    const dy = point.y - entity.position.y;
    const uniformScale = Math.max(0.05, Math.hypot(dx, dy));

    return {
      ...entity,
      scale: { x: uniformScale, y: uniformScale, z: uniformScale },
      interaction: {
        type: 'scale',
        snap,
      },
    };
  }

  scale3D(entity, pointerPoint3D, context = {}) {
    if (!entity) throw new Error('TransformGizmo.scale3D: entity is required');
    if (!pointerPoint3D) throw new Error('TransformGizmo.scale3D: pointerPoint3D is required');

    const res = getSnappedPoint3D({
      point: pointerPoint3D,
      anchor: entity.position || pointerPoint3D,
      vertices: context.vertices || [],
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    const anchor = entity.position || { x: 0, y: 0, z: 0 };
    const dist = distance3D(res.point, anchor);
    const uniformScale = Math.max(0.05, dist);

    return {
      ...entity,
      scale: { x: uniformScale, y: uniformScale, z: uniformScale },
      interaction: {
        type: 'scale3d',
        snap: res.snap,
      },
    };
  }

  stepMove(entity, dxInches, dyInches) {
    if (!entity) throw new Error('TransformGizmo.stepMove: entity required');
    const currentPos =
      entity.position ||
      (typeof entity.x === 'number' ? { x: entity.x, y: entity.y } : { x: 0, y: 0 });
    const newPoint = { x: currentPos.x + dxInches, y: currentPos.y + dyInches };
    return this.move(entity, newPoint);
  }

  stepRotate(entity, deltaDegrees) {
    if (!entity) throw new Error('TransformGizmo.stepRotate: entity required');
    const currentRad =
      ((entity.rotation !== undefined ? entity.rotation : entity.rot) || 0) * (Math.PI / 180);
    const deltaRad = (deltaDegrees * Math.PI) / 180;
    return this.rotate(entity, currentRad + deltaRad);
  }

  stepScale(entity, scaleFactor) {
    if (!entity) throw new Error('TransformGizmo.stepScale: entity required');
    const currentScale = entity.scale?.x || 1.0;
    const newScale = Math.max(0.1, currentScale * scaleFactor);
    return {
      ...entity,
      scale: { x: newScale, y: newScale, z: newScale },
      interaction: { type: 'scale', factor: scaleFactor },
    };
  }

  setPosition(entity, coords = {}, options = {}) {
    if (!entity) throw new Error('TransformGizmo.setPosition: entity is required');
    const curX = entity.position?.x ?? (typeof entity.x === 'number' ? entity.x : 0);
    const curY = entity.position?.y ?? (typeof entity.y === 'number' ? entity.y : 0);
    const curZ =
      entity.position?.z ??
      (typeof entity.z === 'number'
        ? entity.z
        : typeof entity.elevation === 'number'
          ? entity.elevation
          : 0);

    const rawX = parseCoordinateInput(coords?.x, curX);
    const rawY = parseCoordinateInput(coords?.y, curY);
    const rawZ = parseCoordinateInput(coords?.z !== undefined ? coords.z : coords?.elevation, curZ);

    const clampedPos = clampPositionToBounds({ x: rawX, y: rawY, z: rawZ }, options.bounds);
    const wasClamped = clampedPos.x !== rawX || clampedPos.y !== rawY || clampedPos.z !== rawZ;

    const next = {
      ...entity,
      position: { x: clampedPos.x, y: clampedPos.y, z: clampedPos.z },
      interaction: {
        type: 'setPosition',
        clamped: wasClamped,
      },
    };
    if (typeof entity.x === 'number' || coords?.x !== undefined) next.x = clampedPos.x;
    if (typeof entity.y === 'number' || coords?.y !== undefined) next.y = clampedPos.y;
    if (
      typeof entity.z === 'number' ||
      coords?.z !== undefined ||
      coords?.elevation !== undefined
    ) {
      next.z = clampedPos.z;
    }
    return next;
  }

  setPosition3D(entity, coords = {}, options = {}) {
    if (!entity) throw new Error('TransformGizmo.setPosition3D: entity is required');
    const updated = this.setPosition(entity, coords, options);
    return {
      ...updated,
      interaction: {
        ...updated.interaction,
        type: 'setPosition3d',
      },
    };
  }

  setRotation(entity, angleDegrees, options = {}) {
    if (!entity) throw new Error('TransformGizmo.setRotation: entity is required');
    const currentDeg =
      typeof entity.rot === 'number'
        ? entity.rot
        : typeof entity.rotationDegrees === 'number'
          ? entity.rotationDegrees
          : typeof entity.rotation === 'number'
            ? (entity.rotation * 180) / Math.PI
            : 0;

    let deg = normalizeRotationDegrees(angleDegrees, currentDeg);
    if (typeof options.minAngle === 'number' && typeof options.maxAngle === 'number') {
      deg = Math.max(options.minAngle, Math.min(options.maxAngle, deg));
    }
    const rad = (deg * Math.PI) / 180;

    return {
      ...entity,
      rot: deg,
      rotationDegrees: deg,
      rotation: rad,
      interaction: {
        type: 'setRotation',
        degrees: deg,
        value: rad,
      },
    };
  }

  setRotation3D(entity, angleDegrees, context = {}) {
    if (!entity) throw new Error('TransformGizmo.setRotation3D: entity is required');
    const rotated = this.setRotation(entity, angleDegrees, context);
    const normal = context.normal || entity.normal || { x: 0, y: 0, z: 1 };
    const baseOrientation = computeSurfaceOrientation(normal);

    return {
      ...rotated,
      orientation: {
        ...baseOrientation,
        yaw: baseOrientation.yaw + Math.round(rotated.rot),
      },
      interaction: {
        ...rotated.interaction,
        type: 'setRotation3d',
      },
    };
  }

  setTransform(entity, transform = {}, options = {}) {
    if (!entity) throw new Error('TransformGizmo.setTransform: entity is required');
    let next = { ...entity };
    if (
      transform &&
      (transform.x !== undefined ||
        transform.y !== undefined ||
        transform.z !== undefined ||
        transform.elevation !== undefined)
    ) {
      next = this.setPosition(next, transform, options);
    }
    if (
      transform &&
      (transform.rot !== undefined ||
        transform.rotation !== undefined ||
        transform.angleDegrees !== undefined)
    ) {
      const degInput =
        transform.rot !== undefined
          ? transform.rot
          : transform.angleDegrees !== undefined
            ? transform.angleDegrees
            : transform.rotation;
      next = this.setRotation(next, degInput, options);
    }
    return next;
  }
}
