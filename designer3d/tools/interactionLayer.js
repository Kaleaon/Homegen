const { createGridSettings } = require('./gridSettings');
const { SnapModeState } = require('./snapModes');
const { TransformGizmo } = require('./transformGizmos');
const { RoomDrawingTool } = require('./roomDrawingTool');

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
    return this.transformGizmo.move(entity, pointerPoint, context);
  }

  rotateEntity(entity, pointerAngleRadians) {
    return this.transformGizmo.rotate(entity, pointerAngleRadians);
  }

  scaleEntity(entity, pointerPoint, context) {
    return this.transformGizmo.scale(entity, pointerPoint, context);
  }

  addRoomCorner(rawPoint, context) {
    return this.roomTool.addCorner(rawPoint, context);
  }

  previewRoom(rawPoint, context) {
    return this.roomTool.preview(rawPoint, context);
  }

  closeRoom(context) {
    return this.roomTool.closeRoom(context);
  }
}

module.exports = {
  InteractionLayer,
};
