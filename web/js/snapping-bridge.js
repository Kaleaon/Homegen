import { getSnappedPoint, createEdgeSpatialIndex } from '../../designer3d/tools/index.mjs';
import { extractRoomEdges } from './geometry.js';
import { globalCadWorkerClient } from './cadWorkerClient.js';

function createRoomSnapshot(room) {
  if (!room || typeof room !== 'object') {
    return { isNullish: true, roomRef: room };
  }

  const pts = room.points || room.corners || room.vertices;
  let ptsCoords = null;
  let ptsLength = 0;
  if (Array.isArray(pts)) {
    ptsLength = pts.length;
    ptsCoords = new Float64Array(ptsLength * 3);
    for (let i = 0; i < ptsLength; i++) {
      const p = pts[i];
      if (p && typeof p === 'object') {
        ptsCoords[i * 3] = p.x ?? Number.NaN;
        ptsCoords[i * 3 + 1] = p.y ?? Number.NaN;
        ptsCoords[i * 3 + 2] = p.bulge ?? 0;
      } else {
        ptsCoords[i * 3] = Number.NaN;
        ptsCoords[i * 3 + 1] = Number.NaN;
        ptsCoords[i * 3 + 2] = Number.NaN;
      }
    }
  }

  let bulgesKind = 0;
  let bulgesArr = null;
  let bulgesEntries = null;
  if (Array.isArray(room.bulges)) {
    bulgesKind = 1;
    bulgesArr = room.bulges.slice();
  } else if (room.bulges && typeof room.bulges === 'object') {
    bulgesKind = 2;
    bulgesEntries = Object.entries(room.bulges);
  }

  return {
    isNullish: false,
    roomRef: room,
    id: room.id,
    x: room.x,
    y: room.y,
    w: room.w,
    h: room.h,
    closed: room.closed,
    ptsLength,
    ptsCoords,
    bulgesKind,
    bulgesArr,
    bulgesEntries,
  };
}

function isRoomSnapshotValid(snap, room) {
  if (!room || typeof room !== 'object') {
    return Boolean(snap.isNullish && Object.is(snap.roomRef, room));
  }
  if (snap.isNullish || snap.roomRef !== room) {
    return false;
  }
  if (
    snap.id !== room.id ||
    !Object.is(snap.x, room.x) ||
    !Object.is(snap.y, room.y) ||
    !Object.is(snap.w, room.w) ||
    !Object.is(snap.h, room.h) ||
    snap.closed !== room.closed
  ) {
    return false;
  }

  const pts = room.points || room.corners || room.vertices;
  if (Array.isArray(pts)) {
    if (!snap.ptsCoords || snap.ptsLength !== pts.length) {
      return false;
    }
    const coords = snap.ptsCoords;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p && typeof p === 'object') {
        if (
          !Object.is(p.x ?? Number.NaN, coords[i * 3]) ||
          !Object.is(p.y ?? Number.NaN, coords[i * 3 + 1]) ||
          !Object.is(p.bulge ?? 0, coords[i * 3 + 2])
        ) {
          return false;
        }
      } else if (
        !Number.isNaN(coords[i * 3]) ||
        !Number.isNaN(coords[i * 3 + 1]) ||
        !Number.isNaN(coords[i * 3 + 2])
      ) {
        return false;
      }
    }
  } else if (snap.ptsCoords !== null) {
    return false;
  }

  if (Array.isArray(room.bulges)) {
    if (snap.bulgesKind !== 1 || snap.bulgesArr.length !== room.bulges.length) {
      return false;
    }
    for (let i = 0; i < room.bulges.length; i++) {
      if (!Object.is(room.bulges[i], snap.bulgesArr[i])) {
        return false;
      }
    }
  } else if (room.bulges && typeof room.bulges === 'object') {
    if (snap.bulgesKind !== 2) {
      return false;
    }
    const entries = snap.bulgesEntries;
    if (Object.keys(room.bulges).length !== entries.length) {
      return false;
    }
    for (let i = 0; i < entries.length; i++) {
      const [key, val] = entries[i];
      if (!(key in room.bulges) || !Object.is(room.bulges[key], val)) {
        return false;
      }
    }
  } else if (snap.bulgesKind !== 0) {
    return false;
  }

  return true;
}

function isRoomCacheValid(cache, roomList) {
  if (!cache || cache.snapshots.length !== roomList.length) {
    return false;
  }
  if (roomList.length === 0) {
    return true;
  }
  const sameArrayRef = cache.roomsRef === roomList;
  for (let i = 0; i < roomList.length; i++) {
    if (!sameArrayRef && cache.snapshots[i].roomRef !== roomList[i]) {
      return false;
    }
    if (!isRoomSnapshotValid(cache.snapshots[i], roomList[i])) {
      return false;
    }
  }
  return true;
}

function readSnapModeFlag(snapModes, mode) {
  if (!snapModes) return false;
  if (typeof snapModes.isEnabled === 'function') {
    return Boolean(snapModes.isEnabled(mode));
  }
  if (snapModes.modes && typeof snapModes.modes === 'object') {
    return Boolean(snapModes.modes[mode]);
  }
  return Boolean(snapModes[mode]);
}

function resolveEdgeByIndex(edges, edgeIndex) {
  const direct = edges[edgeIndex];
  if (direct && direct.index === edgeIndex) {
    return direct;
  }
  return edges.find((e) => e.index === edgeIndex) || direct || null;
}

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
    this.view = options.view || null;
    this.getViewScale = options.getViewScale || null;
    this.scale = options.scale !== undefined ? options.scale : null;
    this.onSnap = options.onSnap || null;
    this.workerClient = options.workerClient || globalCadWorkerClient;
    this.activeSnap = null;
    this.attached = false;

    this._defaultEdgeCache = null;
    this._overrideEdgeCache = null;
    this._lastSyncedWorkerState = null;

    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);

    if (this.canvas) {
      this.attach(this.canvas);
    }
  }

  invalidateEdgeCache() {
    this._defaultEdgeCache = null;
    this._overrideEdgeCache = null;
  }

  _resolveRoomEdges(rooms, isOverride = false) {
    const roomList = Array.isArray(rooms) ? rooms : [];
    const currentCache = isOverride ? this._overrideEdgeCache : this._defaultEdgeCache;

    if (isRoomCacheValid(currentCache, roomList)) {
      return {
        rooms: roomList,
        edges: currentCache.edges,
        spatialIndex: currentCache.spatialIndex,
        invalidated: false,
      };
    }

    const edges = extractRoomEdges(roomList);
    const spatialIndex = createEdgeSpatialIndex(edges);
    const snapshots = new Array(roomList.length);
    for (let i = 0; i < roomList.length; i++) {
      snapshots[i] = createRoomSnapshot(roomList[i]);
    }

    const nextCache = {
      roomsRef: roomList,
      snapshots,
      edges,
      spatialIndex,
    };

    if (isOverride) {
      this._overrideEdgeCache = nextCache;
    } else {
      this._defaultEdgeCache = nextCache;
    }

    return {
      rooms: roomList,
      edges,
      spatialIndex,
      invalidated: true,
    };
  }

  _shouldSyncWorker(edges, settings, snapModes, scale) {
    const prev = this._lastSyncedWorkerState;
    if (!prev) return true;
    return (
      prev.edges !== edges ||
      !Object.is(prev.scale, scale) ||
      !Object.is(prev.unitSize, settings?.unitSize) ||
      !Object.is(prev.angleSnapDegrees, settings?.angleSnapDegrees) ||
      !Object.is(prev.magneticThreshold, settings?.magneticThreshold) ||
      !Object.is(prev.edgeThreshold, settings?.edgeThreshold) ||
      !Object.is(prev.midpointThreshold, settings?.midpointThreshold) ||
      !Object.is(prev.perpendicularThreshold, settings?.perpendicularThreshold) ||
      prev.snapGrid !== readSnapModeFlag(snapModes, 'grid') ||
      prev.snapEdge !== readSnapModeFlag(snapModes, 'edge') ||
      prev.snapMidpoint !== readSnapModeFlag(snapModes, 'midpoint') ||
      prev.snapPerpendicular !== readSnapModeFlag(snapModes, 'perpendicular') ||
      prev.snapAngle !== readSnapModeFlag(snapModes, 'angle')
    );
  }

  _recordWorkerSync(edges, settings, snapModes, scale) {
    this._lastSyncedWorkerState = {
      edges,
      scale,
      unitSize: settings?.unitSize,
      angleSnapDegrees: settings?.angleSnapDegrees,
      magneticThreshold: settings?.magneticThreshold,
      edgeThreshold: settings?.edgeThreshold,
      midpointThreshold: settings?.midpointThreshold,
      perpendicularThreshold: settings?.perpendicularThreshold,
      snapGrid: readSnapModeFlag(snapModes, 'grid'),
      snapEdge: readSnapModeFlag(snapModes, 'edge'),
      snapMidpoint: readSnapModeFlag(snapModes, 'midpoint'),
      snapPerpendicular: readSnapModeFlag(snapModes, 'perpendicular'),
      snapAngle: readSnapModeFlag(snapModes, 'angle'),
    };
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
    if (this.getRooms !== getRooms) {
      this.getRooms = getRooms;
      this._defaultEdgeCache = null;
    }
  }

  setToWorld(toWorld) {
    this.toWorld = toWorld;
  }

  setView(view) {
    this.view = view;
  }

  setViewScale(scale) {
    this.getViewScale = typeof scale === 'function' ? scale : () => scale;
  }

  getScale() {
    if (typeof this.getViewScale === 'function') {
      const s = this.getViewScale();
      if (typeof s === 'number' && Number.isFinite(s)) return s;
    }
    if (typeof this.view === 'function') {
      const v = this.view();
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (v && typeof v.scale === 'number' && Number.isFinite(v.scale)) return v.scale;
    }
    if (this.view && typeof this.view.scale === 'number' && Number.isFinite(this.view.scale)) {
      return this.view.scale;
    }
    if (typeof this.scale === 'function') {
      const s = this.scale();
      if (typeof s === 'number' && Number.isFinite(s)) return s;
    }
    if (typeof this.scale === 'number' && Number.isFinite(this.scale)) {
      return this.scale;
    }
    return 1.0;
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
  computeSnap(point, anchor = point, roomsOverride = null, scaleOverride = null) {
    if (!point) return null;

    const hasOverride = roomsOverride !== null && roomsOverride !== undefined;
    const rawRooms = hasOverride
      ? roomsOverride
      : typeof this.getRooms === 'function'
        ? this.getRooms()
        : [];
    const { rooms, edges, spatialIndex } = this._resolveRoomEdges(rawRooms, hasOverride);

    const settings = this.interaction ? this.interaction.gridSettings : null;
    const snapModes = this.interaction ? this.interaction.snapModes : null;
    const scale =
      scaleOverride !== null && scaleOverride !== undefined ? scaleOverride : this.getScale();

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
      spatialIndex,
      settings,
      snapModes,
      scale,
    });

    const guideLines = [];
    if (res.snap) {
      if (res.snap.type === 'edge' || res.snap.type === 'midpoint') {
        const edge = resolveEdgeByIndex(edges, res.snap.edgeIndex);
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
          const edge = resolveEdgeByIndex(edges, res.snap.edgeIndex);
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

    // Sync scene diff on invalidation/config changes and dispatch off-thread async worker calculation
    if (this.workerClient) {
      if (this._shouldSyncWorker(edges, settings, snapModes, scale)) {
        this.workerClient.syncSceneDiff({ rooms, edges, settings, snapModes, scale });
        this._recordWorkerSync(edges, settings, snapModes, scale);
      }
      this.workerClient
        .computeSnapAsync(point, anchor, { rooms, edges, settings, snapModes, scale })
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
