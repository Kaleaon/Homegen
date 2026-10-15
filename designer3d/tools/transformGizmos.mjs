import { getSnappedPoint, snapAngle } from './snapping.mjs';

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
}
