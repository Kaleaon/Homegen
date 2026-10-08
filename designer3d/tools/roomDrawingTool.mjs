import { getSnappedPoint } from './snapping.mjs';
import { distance } from './math2d.mjs';
import { validatePlacement, createPlacementFeedback } from './collision.mjs';

export class RoomDrawingTool {
  constructor(settings, snapModes) {
    this.settings = settings;
    this.snapModes = snapModes;
    this.points = [];
    this.bulges = [];
  }

  reset() {
    this.points = [];
    this.bulges = [];
  }

  setEdgeBulge(index, bulge) {
    if (index >= 0) {
      this.bulges[index] = bulge;
    }
  }

  getEdgeBulge(index) {
    return this.bulges[index] || 0;
  }

  adjustBulge(index, delta) {
    const current = this.getEdgeBulge(index);
    this.setEdgeBulge(index, current + delta);
    return this.getEdgeBulge(index);
  }

  /**
   * Add a corner, snapped against reference edges.
   */
  addCorner(rawPoint, context = {}) {
    const anchor = this.points[this.points.length - 1] || rawPoint;
    const { point, snap } = getSnappedPoint({
      point: rawPoint,
      anchor,
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    this.points.push(point);
    if (this.points.length > 1) {
      const edgeIdx = this.points.length - 2;
      this.bulges[edgeIdx] = context.bulge || this.bulges[edgeIdx] || 0;
    }

    return {
      corner: point,
      snap,
      count: this.points.length,
    };
  }

  preview(rawPoint, context = {}) {
    if (this.points.length === 0) {
      return null;
    }

    const anchor = this.points[this.points.length - 1];
    const { point } = getSnappedPoint({
      point: rawPoint,
      anchor,
      edges: context.edges || [],
      settings: this.settings,
      snapModes: this.snapModes,
    });

    const candidate = [...this.points, point];
    const validation = validatePlacement(candidate, context.existingRooms || []);
    const feedback = createPlacementFeedback(candidate, validation);

    return {
      ...feedback,
      bulges: [...this.bulges, context.bulge || 0],
    };
  }

  closeRoom(context = {}) {
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

    const finalBulges = [];
    for (let i = 0; i < closedPoints.length; i += 1) {
      finalBulges.push(this.bulges[i] || 0);
    }

    const room = {
      corners: closedPoints,
      bulges: finalBulges,
      closed: true,
    };

    this.reset();

    return {
      ok: true,
      room,
    };
  }
}
