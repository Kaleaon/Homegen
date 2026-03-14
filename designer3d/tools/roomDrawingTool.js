const { getSnappedPoint } = require('./snapping');
const { distance } = require('./math2d');
const { validatePlacement, createPlacementFeedback } = require('./collision');

class RoomDrawingTool {
  constructor(settings, snapModes) {
    this.settings = settings;
    this.snapModes = snapModes;
    this.points = [];
  }

  reset() {
    this.points = [];
  }

  /**
   * Add a corner, snapped against reference edges.
   */
  addCorner(rawPoint, context) {
    const anchor = this.points[this.points.length - 1] || rawPoint;
    const { point, snap } = getSnappedPoint({
      point: rawPoint,
      anchor,
      edges: context.edges,
      settings: this.settings,
      snapModes: this.snapModes,
    });

    this.points.push(point);

    return {
      corner: point,
      snap,
      count: this.points.length,
    };
  }

  preview(rawPoint, context) {
    if (this.points.length === 0) {
      return null;
    }

    const anchor = this.points[this.points.length - 1];
    const { point } = getSnappedPoint({
      point: rawPoint,
      anchor,
      edges: context.edges,
      settings: this.settings,
      snapModes: this.snapModes,
    });

    const candidate = [...this.points, point];
    const validation = validatePlacement(candidate, context.existingRooms || []);

    return createPlacementFeedback(candidate, validation);
  }

  closeRoom(context) {
    if (this.points.length < 3) {
      throw new Error('A room needs at least 3 corners.');
    }

    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    const closeEnough = distance(first, last) <= this.settings.magneticThreshold;

    const closedPoints = closeEnough ? [...this.points.slice(0, -1)] : [...this.points, first];
    const validation = validatePlacement(closedPoints, context.existingRooms || []);

    if (!validation.valid) {
      return {
        ok: false,
        feedback: createPlacementFeedback(closedPoints, validation),
      };
    }

    const room = {
      corners: closedPoints,
      closed: true,
    };

    this.reset();

    return {
      ok: true,
      room,
    };
  }
}

module.exports = {
  RoomDrawingTool,
};
