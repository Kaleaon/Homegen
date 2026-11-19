import { getSnappedPoint, snapAngle } from './snapping.mjs';
import { getSnappedPoint3D, computeSurfaceOrientation, distance3D } from './snapping3d.mjs';

const MIN_SCALE = 0.05;

function roundPrecision(value, decimals = 6) {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sanitizeFiniteNumber(rawValue, fallback = 0) {
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (rawValue === null || rawValue === undefined) return safeFallback;
  if (typeof rawValue === 'boolean') return safeFallback;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return safeFallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : safeFallback;
  }
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : safeFallback;
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

  setExactPosition(entity, xOrPoint, y, z) {
    if (!entity) throw new Error('TransformGizmo.setExactPosition: entity is required');

    const fallbackX = Number.isFinite(entity.position?.x)
      ? entity.position.x
      : Number.isFinite(entity.x)
        ? entity.x
        : 0;
    const fallbackY = Number.isFinite(entity.position?.y)
      ? entity.position.y
      : Number.isFinite(entity.y)
        ? entity.y
        : 0;

    let rawX;
    let rawY;
    let rawZ;

    if (xOrPoint !== null && typeof xOrPoint === 'object') {
      rawX = xOrPoint.x;
      rawY = xOrPoint.y;
      rawZ = xOrPoint.z;
    } else {
      rawX = xOrPoint;
      rawY = y;
      rawZ = z;
    }

    const nextX = roundPrecision(sanitizeFiniteNumber(rawX, fallbackX));
    const nextY = roundPrecision(sanitizeFiniteNumber(rawY, fallbackY));

    const nextPosition = { x: nextX, y: nextY };
    if (rawZ !== undefined || entity.position?.z !== undefined) {
      const fallbackZ = Number.isFinite(entity.position?.z) ? entity.position.z : 0;
      nextPosition.z = roundPrecision(sanitizeFiniteNumber(rawZ, fallbackZ));
    }

    return {
      ...entity,
      position: nextPosition,
      interaction: {
        type: 'move',
        exact: true,
        snap: null,
      },
    };
  }

  setExactRotation(entity, angleDegrees, options = {}) {
    if (!entity) throw new Error('TransformGizmo.setExactRotation: entity is required');

    const fallbackDegrees = Number.isFinite(entity.rotationDegrees)
      ? entity.rotationDegrees
      : Number.isFinite(entity.rotation)
        ? (entity.rotation * 180) / Math.PI
        : Number.isFinite(entity.rot)
          ? entity.rot
          : 0;

    let rawAngle = angleDegrees;
    let unit = options?.unit || 'degrees';

    if (angleDegrees !== null && typeof angleDegrees === 'object') {
      if (angleDegrees.radians !== undefined) {
        rawAngle = angleDegrees.radians;
        unit = 'radians';
      } else {
        rawAngle = angleDegrees.degrees;
      }
    }

    const sanitized = sanitizeFiniteNumber(
      rawAngle,
      unit === 'radians' ? (fallbackDegrees * Math.PI) / 180 : fallbackDegrees
    );
    const degrees = unit === 'radians' ? (sanitized * 180) / Math.PI : sanitized;
    const normalizedDegrees = roundPrecision(((degrees % 360) + 360) % 360);
    const radians = (normalizedDegrees * Math.PI) / 180;

    return {
      ...entity,
      rotation: radians,
      rotationDegrees: normalizedDegrees,
      interaction: {
        type: 'rotate',
        exact: true,
        degrees: normalizedDegrees,
        snap: null,
      },
    };
  }

  setExactScale(entity, scaleInput) {
    if (!entity) throw new Error('TransformGizmo.setExactScale: entity is required');

    const fallbackX =
      typeof entity.scale === 'number' && Number.isFinite(entity.scale)
        ? entity.scale
        : Number.isFinite(entity.scale?.x)
          ? entity.scale.x
          : 1;
    const fallbackY =
      typeof entity.scale === 'number' && Number.isFinite(entity.scale)
        ? entity.scale
        : Number.isFinite(entity.scale?.y)
          ? entity.scale.y
          : fallbackX;
    const fallbackZ =
      typeof entity.scale === 'number' && Number.isFinite(entity.scale)
        ? entity.scale
        : Number.isFinite(entity.scale?.z)
          ? entity.scale.z
          : fallbackX;

    const clampScale = (rawVal, fb) => {
      const safeFb = Math.max(MIN_SCALE, Number.isFinite(fb) ? fb : 1);
      const val = sanitizeFiniteNumber(rawVal, safeFb);
      return Math.max(MIN_SCALE, roundPrecision(val));
    };

    let sx;
    let sy;
    let sz;

    if (scaleInput !== null && typeof scaleInput === 'object') {
      sx = clampScale(scaleInput.x, fallbackX);
      sy = clampScale(scaleInput.y !== undefined ? scaleInput.y : scaleInput.x, fallbackY);
      sz = clampScale(scaleInput.z !== undefined ? scaleInput.z : scaleInput.x, fallbackZ);
    } else {
      const uniform = clampScale(scaleInput, fallbackX);
      sx = uniform;
      sy = uniform;
      sz = uniform;
    }

    return {
      ...entity,
      scale: { x: sx, y: sy, z: sz },
      interaction: {
        type: 'scale',
        exact: true,
        snap: null,
      },
    };
  }
}
