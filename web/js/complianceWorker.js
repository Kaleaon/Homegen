/**
 * ComplianceWorker
 * Dedicated Web Worker thread that maintains an R-tree spatial index of architectural entities
 * and executes incremental building code compliance rule evaluation off the main UI thread.
 */

import { evaluate } from './codes.js';
import { SpatialRTree, getBounds } from './gisBridge.js';
import { wallSeg, getRoomPoints, LEGACY_WALL_NAMES } from './geometry.js';
import { ITEM_BY_ID } from './catalog.js';

let workerDoc = null;
let _spatialTree = null;
let cachedReport = null;
let lastProcessedReqId = 0;

export function getSpatialTree() {
  return _spatialTree;
}

/**
 * Rebuilds spatial R-tree index from state document entities.
 */
export function rebuildSpatialIndex(doc) {
  const tree = new SpatialRTree(8);
  if (!doc || !doc.rooms) return tree;

  for (const room of doc.rooms) {
    const level = room.level || 0;
    const pts = getRoomPoints(room);
    const roomB = getBounds(pts);
    tree.insert({ type: 'room', id: room.id, level, room }, roomB);

    // Index walls
    for (let i = 0; i < pts.length; i++) {
      const s = wallSeg(room, i);
      const wallKey = pts.length === 4 ? LEGACY_WALL_NAMES[i] : `${i}`;
      const minX = Math.min(s.ax, s.bx) - 4;
      const minY = Math.min(s.ay, s.by) - 4;
      const maxX = Math.max(s.ax, s.bx) + 4;
      const maxY = Math.max(s.ay, s.by) + 4;
      tree.insert(
        {
          type: 'wall',
          id: `${room.id}:wall:${i}`,
          wallKey,
          roomId: room.id,
          wallIndex: i,
          level,
        },
        { minX, minY, maxX, maxY }
      );
    }

    // Index openings
    if (room.openings) {
      for (const o of room.openings) {
        const s = wallSeg(room, o.wall);
        const ox = s.ax + s.dx * (o.offset + o.width / 2);
        const oy = s.ay + s.dy * (o.offset + o.width / 2);
        const hw = o.width / 2 + 4;
        tree.insert(
          { type: 'opening', id: o.id, roomId: room.id, opening: o, level },
          { minX: ox - hw, minY: oy - hw, maxX: ox + hw, maxY: oy + hw }
        );
      }
    }

    // Index items
    if (room.items) {
      for (const it of room.items) {
        const def = ITEM_BY_ID[it.type] || { w: 24, h: 24 };
        const w = (def.w || 24) / 2 + 4;
        const h = (def.h || 24) / 2 + 4;
        tree.insert(
          { type: 'item', id: it.id, roomId: room.id, item: it, level },
          { minX: it.x - w, minY: it.y - h, maxX: it.x + w, maxY: it.y + h }
        );
      }
    }
  }

  return tree;
}

/**
 * Classifies violations into structured target lists and unified target ID set.
 */
export function classifyViolationTargets(violations = []) {
  const rooms = new Set();
  const walls = new Set();
  const openings = new Set();
  const items = new Set();
  const allBadIds = new Set();

  for (const v of violations) {
    if (v.severity !== 'error' && v.severity !== 'warning') continue;

    if (v.roomId) {
      rooms.add(v.roomId);
      allBadIds.add(v.roomId);
    }
    if (v.wallId) {
      walls.add(v.wallId);
      allBadIds.add(v.wallId);
    }
    if (v.wall !== undefined && v.roomId) {
      const wk = `${v.roomId}:${v.wall}`;
      const wki = `${v.roomId}:wall:${v.wall}`;
      walls.add(wk);
      walls.add(wki);
      allBadIds.add(wk);
      allBadIds.add(wki);
    }
    if (v.openingId) {
      openings.add(v.openingId);
      allBadIds.add(v.openingId);
    }
    if (v.itemId) {
      items.add(v.itemId);
      allBadIds.add(v.itemId);
    }
    if (v.target) {
      allBadIds.add(v.target);
    }
  }

  return {
    targets: {
      rooms: Array.from(rooms),
      walls: Array.from(walls),
      openings: Array.from(openings),
      items: Array.from(items),
    },
    badTargetIds: Array.from(allBadIds),
  };
}

/**
 * Computes bounding box expansion covering oldBounds and newBounds.
 */
function expandBox(b1, b2, margin = 48) {
  const minX = Math.min(b1?.x ?? b1?.minX ?? 0, b2?.x ?? b2?.minX ?? 0) - margin;
  const minY = Math.min(b1?.y ?? b1?.minY ?? 0, b2?.y ?? b2?.minY ?? 0) - margin;
  const maxX =
    Math.max((b1?.x ?? b1?.minX ?? 0) + (b1?.w ?? 0), (b2?.x ?? b2?.minX ?? 0) + (b2?.w ?? 0)) +
    margin;
  const maxY =
    Math.max((b1?.y ?? b1?.minY ?? 0) + (b1?.h ?? 0), (b2?.y ?? b2?.minY ?? 0) + (b2?.h ?? 0)) +
    margin;
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/**
 * Message handler for ComplianceWorker requests.
 */
export function handleComplianceWorkerMessage(e) {
  const data = e.data || {};
  const { type, reqId, payload = {} } = data;
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // If request ID is older than latest processed, skip computation
  if (typeof reqId === 'number' && reqId < lastProcessedReqId) {
    const cancelRes = { type: 'COMPLIANCE_CANCELLED', reqId, reason: 'stale' };
    if (typeof self !== 'undefined' && self.postMessage) {
      self.postMessage(cancelRes);
    }
    return cancelRes;
  }
  if (typeof reqId === 'number') {
    lastProcessedReqId = Math.max(lastProcessedReqId, reqId);
  }

  switch (type) {
    case 'INIT_STATE':
    case 'SYNC_STATE': {
      workerDoc = payload.doc ? JSON.parse(JSON.stringify(payload.doc)) : null;
      _spatialTree = rebuildSpatialIndex(workerDoc);
      cachedReport = workerDoc
        ? evaluate(workerDoc)
        : { violations: [], errors: 0, warnings: 0, compliant: true };

      const classification = classifyViolationTargets(cachedReport.violations);
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const res = {
        type: 'COMPLIANCE_RESULT',
        reqId,
        report: cachedReport,
        targets: classification.targets,
        badTargetIds: classification.badTargetIds,
        latency: Math.round((endTime - startTime) * 100) / 100,
        incremental: false,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(res);
      }
      return res;
    }

    case 'ITEM_MOVED': {
      if (!workerDoc) {
        workerDoc = payload.doc ? JSON.parse(JSON.stringify(payload.doc)) : { rooms: [] };
        _spatialTree = rebuildSpatialIndex(workerDoc);
      }
      const { id, cx, cy, rot, roomId, oldBounds, newBounds } = payload;
      let targetRoom = null;
      let targetItem = null;

      for (const r of workerDoc.rooms || []) {
        if (roomId && r.id !== roomId) continue;
        const it = (r.items || []).find((item) => item.id === id);
        if (it) {
          targetRoom = r;
          targetItem = it;
          break;
        }
      }

      if (targetItem) {
        if (cx !== undefined) targetItem.x = cx;
        if (cy !== undefined) targetItem.y = cy;
        if (rot !== undefined) targetItem.rot = rot;
      }

      // Compute affected spatial bounding box
      const affectedBox = expandBox(
        oldBounds || (targetItem ? { x: targetItem.x, y: targetItem.y, w: 30, h: 30 } : null),
        newBounds || (targetItem ? { x: targetItem.x, y: targetItem.y, w: 30, h: 30 } : null),
        60
      );
      affectedBox.level = targetRoom ? targetRoom.level || 0 : 0;

      // Incremental evaluation using affectedBox and cached baseReport
      cachedReport = evaluate(workerDoc, {
        affectedBox,
        baseReport: cachedReport,
      });

      const classification = classifyViolationTargets(cachedReport.violations);
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const res = {
        type: 'COMPLIANCE_RESULT',
        reqId,
        report: cachedReport,
        targets: classification.targets,
        badTargetIds: classification.badTargetIds,
        latency: Math.round((endTime - startTime) * 100) / 100,
        incremental: true,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(res);
      }
      return res;
    }

    case 'WALL_UPDATED': {
      if (!workerDoc) {
        workerDoc = payload.doc ? JSON.parse(JSON.stringify(payload.doc)) : { rooms: [] };
        _spatialTree = rebuildSpatialIndex(workerDoc);
      }
      const { roomId, oldBounds, newBounds } = payload;
      const targetRoom = (workerDoc.rooms || []).find((r) => r.id === roomId);

      const affectedBox = expandBox(oldBounds, newBounds, 48);
      affectedBox.level = targetRoom ? targetRoom.level || 0 : 0;

      cachedReport = evaluate(workerDoc, {
        affectedBox,
        baseReport: cachedReport,
      });

      const classification = classifyViolationTargets(cachedReport.violations);
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const res = {
        type: 'COMPLIANCE_RESULT',
        reqId,
        report: cachedReport,
        targets: classification.targets,
        badTargetIds: classification.badTargetIds,
        latency: Math.round((endTime - startTime) * 100) / 100,
        incremental: true,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(res);
      }
      return res;
    }

    case 'ROOM_RESIZED': {
      if (!workerDoc) {
        workerDoc = payload.doc ? JSON.parse(JSON.stringify(payload.doc)) : { rooms: [] };
        _spatialTree = rebuildSpatialIndex(workerDoc);
      }
      const { roomId, points, rect, oldBounds, newBounds } = payload;
      const targetRoom = (workerDoc.rooms || []).find((r) => r.id === roomId);
      if (targetRoom) {
        if (points) targetRoom.points = points;
        if (rect) {
          targetRoom.x = rect.x;
          targetRoom.y = rect.y;
          targetRoom.w = rect.w;
          targetRoom.h = rect.h;
        }
      }

      const affectedBox = expandBox(
        oldBounds ||
          (targetRoom
            ? { x: targetRoom.x, y: targetRoom.y, w: targetRoom.w, h: targetRoom.h }
            : null),
        newBounds || rect || (points ? getBounds(points) : null),
        48
      );
      affectedBox.level = targetRoom ? targetRoom.level || 0 : 0;

      cachedReport = evaluate(workerDoc, {
        affectedBox,
        baseReport: cachedReport,
      });

      const classification = classifyViolationTargets(cachedReport.violations);
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const res = {
        type: 'COMPLIANCE_RESULT',
        reqId,
        report: cachedReport,
        targets: classification.targets,
        badTargetIds: classification.badTargetIds,
        latency: Math.round((endTime - startTime) * 100) / 100,
        incremental: true,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(res);
      }
      return res;
    }

    case 'FULL_EVALUATE': {
      const docToEval = payload.doc ? payload.doc : workerDoc;
      if (payload.doc) {
        workerDoc = JSON.parse(JSON.stringify(payload.doc));
        _spatialTree = rebuildSpatialIndex(workerDoc);
      }
      cachedReport = docToEval
        ? evaluate(docToEval)
        : { violations: [], errors: 0, warnings: 0, compliant: true };

      const classification = classifyViolationTargets(cachedReport.violations);
      const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const res = {
        type: 'COMPLIANCE_RESULT',
        reqId,
        report: cachedReport,
        targets: classification.targets,
        badTargetIds: classification.badTargetIds,
        latency: Math.round((endTime - startTime) * 100) / 100,
        incremental: false,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(res);
      }
      return res;
    }

    default:
      break;
  }
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', handleComplianceWorkerMessage);
}
