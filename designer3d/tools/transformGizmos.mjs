import { getSnappedPoint, snapAngle } from './snapping.mjs';
import { getSnappedPoint3D, computeSurfaceOrientation, distance3D } from './snapping3d.mjs';

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
}
