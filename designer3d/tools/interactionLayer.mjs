import { createGridSettings } from './gridSettings.mjs';
import { SnapModeState } from './snapModes.mjs';
import { TransformGizmo, clampPositionToBounds } from './transformGizmos.mjs';
import { RoomDrawingTool } from './roomDrawingTool.mjs';
import { validatePlacement, createPlacementFeedback, invalidateBoundingBox } from './collision.mjs';
import {
  getConstraintHandles,
  resizeRoomWithConstraints,
  validateRoomDimensions,
  fmtDimensionText,
  fmtAngleDegrees,
} from './constraintHandles.mjs';

export class InteractionLayer {
  constructor(options = {}) {
    this.gridSettings = createGridSettings(options.gridSettings);
    this.snapModes = new SnapModeState(options.snapModes);
    this.transformGizmo = new TransformGizmo(this.gridSettings, this.snapModes);
    this.roomTool = new RoomDrawingTool(this.gridSettings, this.snapModes);
    this._boundingBoxCache = new WeakMap();
  }

  invalidatePolygonCache(polygon) {
    if (polygon === undefined) {
      this._boundingBoxCache = new WeakMap();
      return;
    }
    invalidateBoundingBox(polygon, this._boundingBoxCache);
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
    const mergedOptions =
      options.explicitAngleDegrees !== undefined
        ? options
        : { ...options, explicitAngleDegrees: this.gridSettings?.explicitAngleDegrees };
    return resizeRoomWithConstraints(room, handleIndexOrId, pointerPoint, mergedOptions);
  }

  validateRoomDimensions(roomType, w, h) {
    return validateRoomDimensions(roomType, w, h);
  }

  fmtDimensionText(w, h) {
    return fmtDimensionText(w, h);
  }

  fmtAngleDegrees(degrees) {
    return fmtAngleDegrees(degrees);
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
      const validation = validatePlacement(movedPolygon, context.existingPolygons, {
        boundingBoxCache: this._boundingBoxCache,
        existingBoundingBoxes: context.existingBoundingBoxes,
        dynamicPolygons: context.dynamicPolygons,
      });
      result.placementFeedback = createPlacementFeedback(movedPolygon, validation, context);
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
      const validation = validatePlacement(scaledPolygon, context.existingPolygons, {
        boundingBoxCache: this._boundingBoxCache,
        existingBoundingBoxes: context.existingBoundingBoxes,
        dynamicPolygons: context.dynamicPolygons,
      });
      result.placementFeedback = createPlacementFeedback(scaledPolygon, validation, context);
    }

    return result;
  }

  scaleEntity3D(entity, pointerPoint3D, context = {}) {
    if (!entity) throw new Error('scaleEntity3D: entity is required');
    if (!pointerPoint3D) throw new Error('scaleEntity3D: pointerPoint3D is required');
    return this.transformGizmo.scale3D(entity, pointerPoint3D, context);
  }

  setEntityPosition(entity, positionOrX, yOrContext = {}, maybeContext = {}) {
    if (!entity) throw new Error('setEntityPosition: entity is required');
    if (arguments.length < 2 || (positionOrX === null && arguments.length < 3)) {
      throw new Error('setEntityPosition: position is required');
    }

    let result;
    let context;
    if (positionOrX !== null && typeof positionOrX === 'object') {
      context = yOrContext || {};
      result = this.transformGizmo.setExactPosition(entity, positionOrX);
    } else {
      context = maybeContext || {};
      result = this.transformGizmo.setExactPosition(entity, positionOrX, yOrContext);
    }

    if (context.bounds) {
      const clamped = clampPositionToBounds(result.position, context.bounds);
      result.position = result.position.z !== undefined ? clamped : { x: clamped.x, y: clamped.y };
    }

    const basePos =
      entity.position ||
      (typeof entity.x === 'number' && Number.isFinite(entity.x)
        ? { x: entity.x, y: Number.isFinite(entity.y) ? entity.y : 0 }
        : { x: 0, y: 0 });

    if (context.existingPolygons && entity.polygon) {
      const offset = {
        x: result.position.x - (Number.isFinite(basePos.x) ? basePos.x : 0),
        y: result.position.y - (Number.isFinite(basePos.y) ? basePos.y : 0),
      };
      const movedPolygon = entity.polygon.map((p) => ({
        x: p.x + offset.x,
        y: p.y + offset.y,
      }));
      const validation = validatePlacement(movedPolygon, context.existingPolygons, {
        boundingBoxCache: this._boundingBoxCache,
        existingBoundingBoxes: context.existingBoundingBoxes,
        dynamicPolygons: context.dynamicPolygons,
      });
      result.placementFeedback = createPlacementFeedback(movedPolygon, validation, context);
    }

    return result;
  }

  setEntityRotation(entity, angleDegrees, context = {}) {
    if (!entity) throw new Error('setEntityRotation: entity is required');
    const safeContext = context || {};
    const result = this.transformGizmo.setExactRotation(entity, angleDegrees, safeContext);

    if (safeContext.existingPolygons && entity.polygon) {
      const basePos =
        entity.position ||
        (typeof entity.x === 'number' && Number.isFinite(entity.x)
          ? { x: entity.x, y: Number.isFinite(entity.y) ? entity.y : 0 }
          : { x: 0, y: 0 });
      const prevRad = Number.isFinite(entity.rotation)
        ? entity.rotation
        : Number.isFinite(entity.rot)
          ? (entity.rot * Math.PI) / 180
          : 0;
      const deltaRad = result.rotation - prevRad;
      const cos = Math.cos(deltaRad);
      const sin = Math.sin(deltaRad);
      const cx = Number.isFinite(basePos.x) ? basePos.x : 0;
      const cy = Number.isFinite(basePos.y) ? basePos.y : 0;
      const rotatedPolygon = entity.polygon.map((p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        };
      });
      const validation = validatePlacement(rotatedPolygon, safeContext.existingPolygons, {
        boundingBoxCache: this._boundingBoxCache,
        existingBoundingBoxes: safeContext.existingBoundingBoxes,
        dynamicPolygons: safeContext.dynamicPolygons,
      });
      result.placementFeedback = createPlacementFeedback(rotatedPolygon, validation, safeContext);
    }

    return result;
  }

  setEntityScale(entity, scaleInput, context = {}) {
    if (!entity) throw new Error('setEntityScale: entity is required');
    const safeContext = context || {};
    const result = this.transformGizmo.setExactScale(entity, scaleInput);

    if (safeContext.existingPolygons && entity.polygon) {
      const basePos =
        entity.position ||
        (typeof entity.x === 'number' && Number.isFinite(entity.x)
          ? { x: entity.x, y: Number.isFinite(entity.y) ? entity.y : 0 }
          : { x: 0, y: 0 });
      const prevScaleX =
        typeof entity.scale === 'number' && Number.isFinite(entity.scale)
          ? entity.scale
          : Number.isFinite(entity.scale?.x)
            ? entity.scale.x
            : 1;
      const prevScaleY =
        typeof entity.scale === 'number' && Number.isFinite(entity.scale)
          ? entity.scale
          : Number.isFinite(entity.scale?.y)
            ? entity.scale.y
            : prevScaleX;
      const factorX = result.scale.x / (prevScaleX || 1);
      const factorY = result.scale.y / (prevScaleY || 1);
      const cx = Number.isFinite(basePos.x) ? basePos.x : 0;
      const cy = Number.isFinite(basePos.y) ? basePos.y : 0;
      const scaledPolygon = entity.polygon.map((p) => ({
        x: cx + (p.x - cx) * factorX,
        y: cy + (p.y - cy) * factorY,
      }));
      const validation = validatePlacement(scaledPolygon, safeContext.existingPolygons, {
        boundingBoxCache: this._boundingBoxCache,
        existingBoundingBoxes: safeContext.existingBoundingBoxes,
        dynamicPolygons: safeContext.dynamicPolygons,
      });
      result.placementFeedback = createPlacementFeedback(scaledPolygon, validation, safeContext);
    }

    return result;
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

  getCornerCount() {
    return this.roomTool.getCornerCount();
  }

  getRoomPoints() {
    return this.roomTool.getPoints();
  }

  getRoomBulges() {
    return this.roomTool.getBulges();
  }

  setEdgeBulge(index, bulge) {
    this.roomTool.setEdgeBulge(index, bulge);
    return this.roomTool.getEdgeBulge(index);
  }

  getEdgeBulge(index) {
    return this.roomTool.getEdgeBulge(index);
  }

  adjustBulge(index, delta) {
    return this.roomTool.adjustBulge(index, delta);
  }

  canCloseRoom() {
    return this.roomTool.canClose();
  }

  resetRoomDrawing() {
    this.roomTool.reset();
  }
}
