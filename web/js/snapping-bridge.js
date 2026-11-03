import { getSnappedPoint } from '../../designer3d/tools/index.mjs';
import { extractRoomEdges } from './geometry.js';
import { globalCadWorkerClient } from './cadWorkerClient.js';

/**
 * Event-driven SnappingBridge connecting canvas pointer interactions to multi-mode snapping logic
 * via off-main-thread Web Worker computation pipeline with optimistic UI rendering and sync fallback.
 */
export class SnappingBridge {
  constructor(options = {}) {
    this.canvas = options.canvas || null;
    this.interaction = options.interaction || null;
    this.getRooms = options.getRooms || (() => []);
    this.toWorld = options.toWorld || null;
    this.onSnap = options.onSnap || null;
    this.workerClient = options.workerClient || globalCadWorkerClient;
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
   * Computes snapping for multi-item selection drags using group anchor snapping.
   * Updates activeSnap and returns snapped point, anchor, and translation delta.
   */
  computeMultiSnap(pointOrItems, anchorOrPoint = null, itemsOrAnchor = null, roomsOverride = null) {
    let point;
    let anchor;
    let items;
    let rooms;

    if (
      pointOrItems &&
      (Array.isArray(pointOrItems) ||
        pointOrItems instanceof Map ||
        (typeof pointOrItems === 'object' && !('x' in pointOrItems)))
    ) {
      items = pointOrItems;
      point = anchorOrPoint;
      anchor = itemsOrAnchor || point;
      rooms = roomsOverride;
    } else {
      point = pointOrItems;
      if (
        anchorOrPoint &&
        (Array.isArray(anchorOrPoint) ||
          anchorOrPoint instanceof Map ||
          (typeof anchorOrPoint === 'object' && !('x' in anchorOrPoint)))
      ) {
        items = anchorOrPoint;
        anchor = itemsOrAnchor || point;
        rooms = roomsOverride;
      } else {
        anchor = anchorOrPoint || point;
        items = itemsOrAnchor;
        rooms = roomsOverride;
      }
    }

    if (!point) return null;
    anchor = anchor || point;

    const snapRes = this.computeSnap(point, anchor, rooms);
    if (!snapRes) return null;

    const dx = snapRes.point.x - anchor.x;
    const dy = snapRes.point.y - anchor.y;

    const multiSnapRes = {
      ...snapRes,
      items,
      delta: { x: dx, y: dy, dx, dy },
      dx,
      dy,
    };

    return multiSnapRes;
  }

  /**
   * Computes snapping for a world point and anchor point.
   * Immediately updates optimistic preview state and dispatches async calculation to Worker.
   */
  computeSnap(point, anchor = point, roomsOverride = null) {
    if (!point) return null;

    const rooms = roomsOverride || (typeof this.getRooms === 'function' ? this.getRooms() : []);
    const edges = extractRoomEdges(rooms || []);

    const settings = this.interaction ? this.interaction.gridSettings : null;
    const snapModes = this.interaction ? this.interaction.snapModes : null;

    const unitSize = (settings && settings.unitSize) || 6;
    const gridPoint = {
      x: Math.round(point.x / unitSize) * unitSize,
      y: Math.round(point.y / unitSize) * unitSize,
    };

    if (!settings || !snapModes) {
      this.activeSnap = {
        point: gridPoint,
        rawPoint: point,
        anchor,
        snap: { type: 'grid', point: gridPoint },
        guideLines: [],
        indicator: gridPoint,
      };
      return this.activeSnap;
    }

    // Direct synchronous calculation for immediate feedback
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
      } else if (res.snap.type === 'angle') {
        guideLines.push({
          start: anchor,
          end: res.point,
          type: 'angle',
        });
        if (res.snap.edgeIndex !== undefined) {
          const edge =
            edges.find((e) => e.index === res.snap.edgeIndex) || edges[res.snap.edgeIndex];
          if (edge) {
            guideLines.push({
              start: edge.start,
              end: edge.end,
              type: 'angle_reference',
            });
          }
        }
      }
    }

    const hasMagneticSnap = Boolean(res.snap && res.snap.type !== 'grid');
    const finalPoint = hasMagneticSnap ? res.point : gridPoint;
    const finalSnap = hasMagneticSnap ? res.snap : { type: 'grid', point: gridPoint };
    const finalIndicator = hasMagneticSnap ? res.point : gridPoint;

    this.activeSnap = {
      point: finalPoint,
      rawPoint: point,
      anchor,
      snap: finalSnap,
      guideLines,
      indicator: finalIndicator,
    };

    // Also sync scene diff and dispatch off-thread async worker calculation
    if (this.workerClient) {
      this.workerClient.syncSceneDiff({ rooms, edges, settings, snapModes });
      this.workerClient
        .computeSnapAsync(point, anchor, { rooms, edges, settings, snapModes })
        .then((asyncRes) => {
          if (asyncRes && asyncRes.point) {
            const asyncHasMagnetic = Boolean(asyncRes.snap && asyncRes.snap.type !== 'grid');
            const asyncPoint = asyncHasMagnetic ? asyncRes.point : gridPoint;
            const asyncSnap = asyncHasMagnetic ? asyncRes.snap : { type: 'grid', point: gridPoint };
            const asyncIndicator = asyncHasMagnetic ? asyncRes.point : gridPoint;
            this.activeSnap = {
              point: asyncPoint,
              rawPoint: asyncRes.rawPoint || point,
              anchor,
              snap: asyncSnap,
              guideLines: asyncRes.guideLines || guideLines,
              indicator: asyncIndicator,
            };
            if (typeof this.onSnap === 'function') {
              this.onSnap(this.activeSnap);
            }
          }
        });
    }

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
