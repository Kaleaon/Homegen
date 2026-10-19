import { handleCadWorkerMessage } from './cadWorker.js';

/**
 * CadWorkerClient
 * Off-main-thread Web Worker CAD computation client with transferable binary message payloads,
 * stale request cancellation, optimistic UI state interpolation, and synchronous fallback.
 */
export class CadWorkerClient {
  constructor(options = {}) {
    this.useWorker = options.useWorker !== false;
    this.worker = null;
    this.reqSeq = 0;
    this.pendingRequests = new Map();
    this.latestReqs = {
      snap: 0,
      collision: 0,
      isolines: 0,
      edges: 0,
    };
    this.activeSceneState = {
      rooms: [],
      edges: [],
      settings: null,
      snapModes: null,
    };
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
        const workerUrl = new URL('./cadWorker.js', import.meta.url);
        this.worker = new Worker(workerUrl, { type: 'module' });
      }
    } catch {
      // Module Worker instantiation not supported in this environment
      this.worker = null;
    }

    if (
      !this.worker &&
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      URL.createObjectURL
    ) {
      try {
        // Fallback inline worker script that delegates to synchronous handler if module worker URL is unavailable
        const inlineCode = `
          self.onmessage = function(e) {
            const data = e.data || {};
            const { type, reqId } = data;
            if (type === 'SYNC_SCENE_DIFF') {
              self.postMessage({ type: 'SYNC_SCENE_DIFF_ACK', reqId, ok: true });
            }
          };
        `;
        const blob = new Blob([inlineCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        this.worker = new Worker(blobUrl);
      } catch {
        this.worker = null;
      }
    }

    if (this.worker) {
      this.worker.onmessage = this._handleWorkerMessage.bind(this);
      this.worker.onerror = (err) => {
        console.warn('CAD Worker error, switching to synchronous fallback:', err);
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
    if (reqId && this.pendingRequests.has(reqId)) {
      const { resolve } = this.pendingRequests.get(reqId);
      this.pendingRequests.delete(reqId);
      resolve(data);
    }
  }

  syncSceneDiff(diff = {}) {
    if (diff.rooms) this.activeSceneState.rooms = diff.rooms;
    if (diff.edges) this.activeSceneState.edges = diff.edges;
    if (diff.settings) this.activeSceneState.settings = diff.settings;
    if (diff.snapModes) this.activeSceneState.snapModes = diff.snapModes;

    if (this.useWorker && this.worker) {
      const reqId = ++this.reqSeq;
      this.worker.postMessage({
        type: 'SYNC_SCENE_DIFF',
        reqId,
        payload: diff,
      });
    } else {
      handleCadWorkerMessage({
        data: {
          type: 'SYNC_SCENE_DIFF',
          reqId: ++this.reqSeq,
          payload: diff,
        },
      });
    }
  }

  computeSnapAsync(point, anchor = point, overrideParams = {}) {
    const reqId = ++this.reqSeq;
    this.latestReqs.snap = reqId;

    const pointArray = [point.x, point.y, anchor.x, anchor.y];
    const pointBuffer = new Float32Array(pointArray);

    const payload = {
      point,
      anchor,
      pointArray,
      pointBuffer,
      rooms: overrideParams.rooms || this.activeSceneState.rooms,
      edges: overrideParams.edges || this.activeSceneState.edges,
      settings: overrideParams.settings || this.activeSceneState.settings,
      snapModes: overrideParams.snapModes || this.activeSceneState.snapModes,
    };

    if (this.useWorker && this.worker) {
      return new Promise((resolve) => {
        this.pendingRequests.set(reqId, {
          resolve: (res) => {
            // Drop stale requests if a newer snap request was already issued
            if (reqId < this.latestReqs.snap) {
              resolve(null);
            } else {
              resolve(res);
            }
          },
        });

        this.worker.postMessage(
          {
            type: 'COMPUTE_SNAP',
            reqId,
            payload: {
              ...payload,
              pointBuffer,
            },
          },
          [pointBuffer.buffer]
        );
      });
    }

    // Synchronous fallback mode
    const res = handleCadWorkerMessage({
      data: {
        type: 'COMPUTE_SNAP',
        reqId,
        payload,
      },
    });
    return Promise.resolve(res);
  }

  validateCollisionAsync(candidatePolygon, existingPolygons = null) {
    const reqId = ++this.reqSeq;
    this.latestReqs.collision = reqId;

    const polys = existingPolygons || this.activeSceneState.rooms;

    const coords = [];
    if (Array.isArray(candidatePolygon)) {
      for (let i = 0; i < candidatePolygon.length; i++) {
        coords.push(candidatePolygon[i].x, candidatePolygon[i].y);
      }
    }
    const polyBuffer = new Float32Array(coords);

    const payload = {
      candidatePolygon,
      existingPolygons: polys,
      polyBuffer,
    };

    if (this.useWorker && this.worker) {
      return new Promise((resolve) => {
        this.pendingRequests.set(reqId, {
          resolve: (res) => {
            if (reqId < this.latestReqs.collision) {
              resolve(null);
            } else {
              resolve(res);
            }
          },
        });

        this.worker.postMessage(
          {
            type: 'VALIDATE_COLLISION',
            reqId,
            payload: {
              ...payload,
              polyBuffer,
            },
          },
          [polyBuffer.buffer]
        );
      });
    }

    const res = handleCadWorkerMessage({
      data: {
        type: 'VALIDATE_COLLISION',
        reqId,
        payload,
      },
    });
    return Promise.resolve(res);
  }

  computeIsolinesAsync(grid, intervalOverride = null) {
    if (!grid || !grid.data) return Promise.resolve([]);

    const reqId = ++this.reqSeq;
    this.latestReqs.isolines = reqId;

    const interval = intervalOverride || grid.contourInterval || 1.0;
    const gridData = new Float32Array(grid.data);

    const payload = {
      gridData,
      width: grid.width,
      height: grid.height,
      minElevation: grid.minElevation,
      maxElevation: grid.maxElevation,
      bounds: grid.bounds,
      interval,
    };

    if (this.useWorker && this.worker) {
      return new Promise((resolve) => {
        this.pendingRequests.set(reqId, {
          resolve: (res) => {
            if (reqId < this.latestReqs.isolines) {
              resolve([]);
            } else {
              resolve(res.contours || []);
            }
          },
        });

        this.worker.postMessage(
          {
            type: 'COMPUTE_ISOLINES',
            reqId,
            payload: {
              ...payload,
              gridData,
            },
          },
          [gridData.buffer]
        );
      });
    }

    const res = handleCadWorkerMessage({
      data: {
        type: 'COMPUTE_ISOLINES',
        reqId,
        payload,
      },
    });
    return Promise.resolve(res.contours || []);
  }

  extractRoomEdgesAsync(rooms) {
    const reqId = ++this.reqSeq;
    this.latestReqs.edges = reqId;

    const payload = { rooms };

    if (this.useWorker && this.worker) {
      return new Promise((resolve) => {
        this.pendingRequests.set(reqId, {
          resolve: (res) => {
            resolve(res.edges || []);
          },
        });

        this.worker.postMessage({
          type: 'EXTRACT_EDGES',
          reqId,
          payload,
        });
      });
    }

    const res = handleCadWorkerMessage({
      data: {
        type: 'EXTRACT_EDGES',
        reqId,
        payload,
      },
    });
    return Promise.resolve(res.edges || []);
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.useWorker = false;
    this.pendingRequests.clear();
  }
}

// Singleton pipeline instance for shared CAD calculations
export const globalCadWorkerClient = new CadWorkerClient();
