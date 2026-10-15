import { createGridSettings } from './gridSettings.mjs';
import { SnapModeState } from './snapModes.mjs';
import { TransformGizmo } from './transformGizmos.mjs';
import { RoomDrawingTool } from './roomDrawingTool.mjs';
import { validatePlacement, createPlacementFeedback } from './collision.mjs';
import {
  getConstraintHandles,
  resizeRoomWithConstraints,
  validateRoomDimensions,
  fmtDimensionText,
} from './constraintHandles.mjs';

export class InteractionLayer {
  constructor(options = {}) {
    this.gridSettings = createGridSettings(options.gridSettings);
    this.snapModes = new SnapModeState(options.snapModes);
    this.transformGizmo = new TransformGizmo(this.gridSettings, this.snapModes);
    this.roomTool = new RoomDrawingTool(this.gridSettings, this.snapModes);
  }

  getConstraintHandles(room, options = {}) {
    if (!room) throw new Error('getConstraintHandles: room is required');
    return getConstraintHandles(room, options);
  }

  resizeRoomWithConstraints(room, handleIndexOrId, pointerPoint, options = {}) {
    if (!room) throw new Error('resizeRoomWithConstraints: room is required');
    if (handleIndexOrId === undefined || handleIndexOrId === null)
      throw new Error('resizeRoomWithConstraints: handleIndexOrId is required');
    if (!pointerPoint) throw new Error('resizeRoomWithConstraints: pointerPoint is required');
    return resizeRoomWithConstraints(room, handleIndexOrId, pointerPoint, options);
  }

  validateRoomDimensions(roomType, w, h) {
    return validateRoomDimensions(roomType, w, h);
  }

  fmtDimensionText(w, h) {
    return fmtDimensionText(w, h);
  }

  setGridSettings(partialSettings) {
    this.gridSettings = createGridSettings({ ...this.gridSettings, ...partialSettings });
    this.transformGizmo.settings = this.gridSettings;
    this.roomTool.settings = this.gridSettings;
    return this.gridSettings;
  }

  toggleSnapMode(mode, enabled) {
    return this.snapModes.toggle(mode, enabled);
  }

  getSnapModeState() {
    return this.snapModes.toJSON();
  }

  moveEntity(entity, pointerPoint, context = {}) {
    if (!entity) throw new Error('moveEntity: entity is required');
    if (!pointerPoint) throw new Error('moveEntity: pointerPoint is required');
    if (!context) throw new Error('moveEntity: context is required');

    const result = this.transformGizmo.move(entity, pointerPoint, context);

    if (context.existingPolygons && entity.polygon) {
      const offset = {
        x: result.position.x - entity.position.x,
        y: result.position.y - entity.position.y,
      };
      const movedPolygon = entity.polygon.map((p) => ({
        x: p.x + offset.x,
        y: p.y + offset.y,
      }));
      const validation = validatePlacement(movedPolygon, context.existingPolygons);
      result.placementFeedback = createPlacementFeedback(movedPolygon, validation);
    }

    return result;
  }

  moveEntity3D(entity, pointerPoint3D, context = {}) {
    if (!entity) throw new Error('moveEntity3D: entity is required');
    if (!pointerPoint3D) throw new Error('moveEntity3D: pointerPoint3D is required');
    return this.transformGizmo.move3D(entity, pointerPoint3D, context);
  }

  rotateEntity(entity, pointerAngleRadians) {
    if (!entity) throw new Error('rotateEntity: entity is required');
    return this.transformGizmo.rotate(entity, pointerAngleRadians);
  }

  rotateEntity3D(entity, pointerAngleRadians, context = {}) {
    if (!entity) throw new Error('rotateEntity3D: entity is required');
    return this.transformGizmo.rotate3D(entity, pointerAngleRadians, context);
  }

  scaleEntity(entity, pointerPoint, context = {}) {
    if (!entity) throw new Error('scaleEntity: entity is required');
    if (!pointerPoint) throw new Error('scaleEntity: pointerPoint is required');
    if (!context) throw new Error('scaleEntity: context is required');

    const result = this.transformGizmo.scale(entity, pointerPoint, context);

    if (context.existingPolygons && entity.polygon) {
      const scaleFactor = result.scale.x / (entity.scale?.x || 1);
      const scaledPolygon = entity.polygon.map((p) => ({
        x: entity.position.x + (p.x - entity.position.x) * scaleFactor,
        y: entity.position.y + (p.y - entity.position.y) * scaleFactor,
      }));
      const validation = validatePlacement(scaledPolygon, context.existingPolygons);
      result.placementFeedback = createPlacementFeedback(scaledPolygon, validation);
    }

    return result;
  }

  scaleEntity3D(entity, pointerPoint3D, context = {}) {
    if (!entity) throw new Error('scaleEntity3D: entity is required');
    if (!pointerPoint3D) throw new Error('scaleEntity3D: pointerPoint3D is required');
    return this.transformGizmo.scale3D(entity, pointerPoint3D, context);
  }

  addRoomCorner(rawPoint, context = {}) {
    if (!rawPoint) throw new Error('addRoomCorner: rawPoint is required');
    if (!context) throw new Error('addRoomCorner: context is required');
    return this.roomTool.addCorner(rawPoint, context);
  }

  previewRoom(rawPoint, context = {}) {
    if (!rawPoint) throw new Error('previewRoom: rawPoint is required');
    if (!context) throw new Error('previewRoom: context is required');
    return this.roomTool.preview(rawPoint, context);
  }

  closeRoom(context = {}) {
    if (!context) throw new Error('closeRoom: context is required');
    return this.roomTool.closeRoom(context);
  }
}
