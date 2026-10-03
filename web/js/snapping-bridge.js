import { getSnappedPoint } from '../../designer3d/tools/index.mjs';
import { extractRoomEdges } from './geometry.js';

/**
 * Event-driven SnappingBridge connecting canvas pointer interactions to multi-mode snapping logic.
 */
export class SnappingBridge {
  constructor(options = {}) {
    this.canvas = options.canvas || null;
    this.interaction = options.interaction || null;
    this.getRooms = options.getRooms || (() => []);
    this.toWorld = options.toWorld || null;
    this.onSnap = options.onSnap || null;
    this.activeSnap = null;
    this.attached = false;

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);

    if (this.canvas) {
      this.attach(this.canvas);
    }
  }

  attach(canvas = this.canvas) {
    if (!canvas) return;
    if (this.attached && this.canvas === canvas) return;
    if (this.attached) {
      this.detach();
    }

    this.canvas = canvas;
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerLeave);
    this.attached = true;
  }

  detach() {
    if (this.canvas && this.attached) {
      this.canvas.removeEventListener('pointermove', this._onPointerMove);
      this.canvas.removeEventListener('pointerdown', this._onPointerDown);
      this.canvas.removeEventListener('pointerup', this._onPointerUp);
      this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    }
    this.attached = false;
    this.activeSnap = null;
  }

  setInteraction(interaction) {
    this.interaction = interaction;
  }

  setGetRooms(getRooms) {
    this.getRooms = getRooms;
  }

  setToWorld(toWorld) {
    this.toWorld = toWorld;
  }

  /**
   * Computes snapping for a world point and anchor point.
   */
  computeSnap(point, anchor = point, roomsOverride = null) {
    if (!point) return null;

    const rooms = roomsOverride || (typeof this.getRooms === 'function' ? this.getRooms() : []);
    const edges = extractRoomEdges(rooms || []);

    const settings = this.interaction ? this.interaction.gridSettings : null;
    const snapModes = this.interaction ? this.interaction.snapModes : null;

    if (!settings || !snapModes) {
      this.activeSnap = {
        point,
        rawPoint: point,
        anchor,
        snap: null,
        guideLines: [],
        indicator: null,
      };
      return this.activeSnap;
    }

    const res = getSnappedPoint({
      point,
      anchor,
      edges,
      settings,
      snapModes,
    });

    const guideLines = [];
    if (res.snap) {
      if (res.snap.type === 'edge' || res.snap.type === 'midpoint') {
        const edge = edges.find((e) => e.index === res.snap.edgeIndex) || edges[res.snap.edgeIndex];
        if (edge) {
          guideLines.push({
            start: edge.start,
            end: edge.end,
            type: res.snap.type,
          });
        }
      } else if (res.snap.type === 'perpendicular') {
        guideLines.push({
          start: anchor,
          end: res.point,
          type: 'perpendicular',
        });
      }
    }

    this.activeSnap = {
      point: res.point,
      rawPoint: point,
      anchor,
      snap: res.snap,
      guideLines,
      indicator: res.snap ? res.point : null,
    };

    if (typeof this.onSnap === 'function') {
      this.onSnap(this.activeSnap);
    }

    return this.activeSnap;
  }

  _getWorldPoint(e) {
    if (e.worldPoint) return e.worldPoint;
    if (e.detail && e.detail.worldPoint) return e.detail.worldPoint;
    if (typeof this.toWorld === 'function') return this.toWorld(e);
    if (this.canvas) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    return { x: e.clientX || 0, y: e.clientY || 0 };
  }

  _handlePointerMove(e) {
    const point = this._getWorldPoint(e);
    const anchor = e.anchor || point;
    this.computeSnap(point, anchor);
  }

  _handlePointerDown(e) {
    const point = this._getWorldPoint(e);
    const anchor = e.anchor || point;
    this.computeSnap(point, anchor);
  }

  _handlePointerUp(_e) {
    // Retain snap or update as needed
  }

  _handlePointerLeave() {
    this.activeSnap = null;
    if (typeof this.onSnap === 'function') {
      this.onSnap(null);
    }
  }

  getActiveSnap() {
    return this.activeSnap;
  }
}
