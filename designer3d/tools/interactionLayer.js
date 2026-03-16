const { createGridSettings } = require('./gridSettings');
const { SnapModeState } = require('./snapModes');
const { TransformGizmo } = require('./transformGizmos');
const { RoomDrawingTool } = require('./roomDrawingTool');
const { validatePlacement, createPlacementFeedback } = require('./collision');

class InteractionLayer {
  constructor(options = {}) {
    this.gridSettings = createGridSettings(options.gridSettings);
    this.snapModes = new SnapModeState(options.snapModes);
    this.transformGizmo = new TransformGizmo(this.gridSettings, this.snapModes);
    this.roomTool = new RoomDrawingTool(this.gridSettings, this.snapModes);
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

  moveEntity(entity, pointerPoint, context) {
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

  rotateEntity(entity, pointerAngleRadians) {
    if (!entity) throw new Error('rotateEntity: entity is required');
    return this.transformGizmo.rotate(entity, pointerAngleRadians);
  }

  scaleEntity(entity, pointerPoint, context) {
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

  addRoomCorner(rawPoint, context) {
    if (!rawPoint) throw new Error('addRoomCorner: rawPoint is required');
    if (!context) throw new Error('addRoomCorner: context is required');
    return this.roomTool.addCorner(rawPoint, context);
  }

  previewRoom(rawPoint, context) {
    if (!rawPoint) throw new Error('previewRoom: rawPoint is required');
    if (!context) throw new Error('previewRoom: context is required');
    return this.roomTool.preview(rawPoint, context);
  }

  closeRoom(context) {
    if (!context) throw new Error('closeRoom: context is required');
    return this.roomTool.closeRoom(context);
  }
}

module.exports = {
  InteractionLayer,
};
