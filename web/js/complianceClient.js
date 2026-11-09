/**
 * ComplianceManager / ComplianceWorkerClient
 * Off-main-thread building code compliance client with granular event-driven diffing,
 * spatial delta partitioning, stale request cancellation, reactive callbacks,
 * and seamless synchronous fallback.
 */

import { handleComplianceWorkerMessage } from './complianceWorker.js';

export class ComplianceManager {
  constructor(options = {}) {
    this.useWorker = options.useWorker !== false;
    this.worker = null;
    this.reqSeq = 0;
    this.latestReqId = 0;
    this.latestProcessedReqId = 0;
    this.pendingRequests = new Map();
    this.reportListeners = new Set();

    this.latestReport = null;
    this.latestTargets = { rooms: [], walls: [], openings: [], items: [] };
    this.badTargetIds = new Set();
    this.isWorkerReady = false;

    if (this.useWorker && typeof Worker !== 'undefined') {
      this._initWorker();
    } else {
      this.useWorker = false;
    }
  }

  _initWorker() {
    try {
      if (typeof import.meta !== 'undefined' && import.meta.url) {
        const workerUrl = new URL('./complianceWorker.js', import.meta.url);
        this.worker = new Worker(workerUrl, { type: 'module' });
      }
    } catch {
      this.worker = null;
    }

    if (this.worker) {
      this.worker.onmessage = this._handleWorkerMessage.bind(this);
      this.worker.onerror = (err) => {
        console.warn('Compliance Worker error, falling back to synchronous handler:', err);
        this.useWorker = false;
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
      };
      this.isWorkerReady = true;
    } else {
      this.useWorker = false;
    }
  }

  _handleWorkerMessage(e) {
    const data = e.data || {};
    const { reqId } = data;

    // Drop stale results
    if (typeof reqId === 'number' && reqId < this.latestProcessedReqId) {
      if (this.pendingRequests.has(reqId)) {
        this.pendingRequests.delete(reqId);
      }
      return;
    }

    if (typeof reqId === 'number') {
      this.latestProcessedReqId = Math.max(this.latestProcessedReqId, reqId);
    }

    if (data.type === 'COMPLIANCE_RESULT') {
      this.latestReport = data.report || null;
      this.latestTargets = data.targets || { rooms: [], walls: [], openings: [], items: [] };
      this.badTargetIds = new Set(data.badTargetIds || []);

      for (const listener of this.reportListeners) {
        try {
          listener(this.latestReport, data);
        } catch (err) {
          console.error('Error in compliance report listener:', err);
        }
      }
    }

    if (typeof reqId === 'number' && this.pendingRequests.has(reqId)) {
      const { resolve } = this.pendingRequests.get(reqId);
      this.pendingRequests.delete(reqId);
      resolve(data);
    }
  }

  _dispatch(type, payload = {}) {
    const reqId = ++this.reqSeq;
    this.latestReqId = reqId;

    if (this.useWorker && this.worker) {
      return new Promise((resolve) => {
        this.pendingRequests.set(reqId, { resolve });
        this.worker.postMessage({ type, reqId, payload });
      });
    }

    // Synchronous fallback handler
    const res = handleComplianceWorkerMessage({
      data: { type, reqId, payload },
    });
    this._handleWorkerMessage({ data: res });
    return Promise.resolve(res);
  }

  /**
   * Initializes or synchronizes the compliance worker with the full document state.
   */
  initState(doc) {
    return this._dispatch('INIT_STATE', { doc });
  }

  syncState(doc) {
    return this._dispatch('SYNC_STATE', { doc });
  }

  /**
   * Dispatches granular ITEM_MOVED mutation event.
   */
  dispatchItemMoved({ id, cx, cy, rot, roomId, oldBounds, newBounds, doc = null }) {
    return this._dispatch('ITEM_MOVED', {
      id,
      cx,
      cy,
      rot,
      roomId,
      oldBounds,
      newBounds,
      doc,
    });
  }

  /**
   * Dispatches granular WALL_UPDATED mutation event.
   */
  dispatchWallUpdated({ roomId, wall, points, oldBounds, newBounds, doc = null }) {
    return this._dispatch('WALL_UPDATED', {
      roomId,
      wall,
      points,
      oldBounds,
      newBounds,
      doc,
    });
  }

  /**
   * Dispatches granular ROOM_RESIZED mutation event.
   */
  dispatchRoomResized({ roomId, points, rect, oldBounds, newBounds, doc = null }) {
    return this._dispatch('ROOM_RESIZED', {
      roomId,
      points,
      rect,
      oldBounds,
      newBounds,
      doc,
    });
  }

  /**
   * Requests full evaluation of provided document or worker cached doc.
   */
  evaluateAsync(doc = null) {
    return this._dispatch('FULL_EVALUATE', { doc });
  }

  /**
   * Subscribes a listener to async compliance report updates.
   */
  onReport(callback) {
    this.reportListeners.add(callback);
    return () => this.reportListeners.delete(callback);
  }

  getLatestReport() {
    return this.latestReport;
  }

  getTargets() {
    return this.latestTargets;
  }

  getBadTargetIds() {
    return this.badTargetIds;
  }

  isCompliant() {
    return this.latestReport ? !!this.latestReport.compliant : true;
  }

  getViolationsForTarget(targetId) {
    if (!this.latestReport || !this.latestReport.violations) return [];
    return this.latestReport.violations.filter(
      (v) =>
        v.id === targetId ||
        v.target === targetId ||
        v.roomId === targetId ||
        v.wallId === targetId ||
        v.openingId === targetId ||
        v.itemId === targetId ||
        (v.wall !== undefined && v.roomId && `${v.roomId}:${v.wall}` === targetId)
    );
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isWorkerReady = false;
    }
  }
}
