import {
  getSnappedPoint,
  validatePlacement,
  createPlacementFeedback,
  SnapModeState,
} from '../../designer3d/tools/index.mjs';
import { extractRoomEdges } from './geometry.js';

// Cache spatial scene state inside worker thread
let cachedRooms = [];
let cachedEdges = [];
let cachedSettings = null;
let snapModes = null;
let cachedScale = 1.0;

// Marching Squares Lookup Table for isoline contours
const MARCHING_SQUARES_LOOKUP = [
  [], // 0
  [[3, 2]], // 1: corner 3
  [[2, 1]], // 2: corner 2
  [[3, 1]], // 3: corners 2,3
  [[1, 0]], // 4: corner 1
  [
    [3, 0],
    [2, 1],
  ], // 5: corners 1,3 (saddle)
  [[2, 0]], // 6: corners 1,2
  [[3, 0]], // 7: corners 1,2,3
  [[0, 3]], // 8: corner 0
  [[0, 2]], // 9: corners 0,3
  [
    [0, 1],
    [3, 2],
  ], // 10: corners 0,2 (saddle)
  [[0, 1]], // 11: corners 0,2,3
  [[1, 3]], // 12: corners 0,1
  [[1, 2]], // 13: corners 0,1,3
  [[2, 3]], // 14: corners 0,1,2
  [], // 15
];

function getEdgePoint(x, y, edge, v0, v1, v2, v3, z, width, height, bounds) {
  let cellX1 = x,
    cellY1 = y;
  let cellX2 = x,
    cellY2 = y;
  let val1 = v0,
    val2 = v1;

  switch (edge) {
    case 0:
      cellX1 = x;
      cellY1 = y;
      val1 = v0;
      cellX2 = x + 1;
      cellY2 = y;
      val2 = v1;
      break;
    case 1:
      cellX1 = x + 1;
      cellY1 = y;
      val1 = v1;
      cellX2 = x + 1;
      cellY2 = y + 1;
      val2 = v2;
      break;
    case 2:
      cellX1 = x;
      cellY1 = y + 1;
      val1 = v3;
      cellX2 = x + 1;
      cellY2 = y + 1;
      val2 = v2;
      break;
    case 3:
      cellX1 = x;
      cellY1 = y;
      val1 = v0;
      cellX2 = x;
      cellY2 = y + 1;
      val2 = v3;
      break;
  }

  let t = 0.5;
  if (Math.abs(val2 - val1) > 1e-6) {
    t = (z - val1) / (val2 - val1);
    t = Math.max(0, Math.min(1, t));
  }

  const gx = cellX1 + t * (cellX2 - cellX1);
  const gy = cellY1 + t * (cellY2 - cellY1);

  const wx = bounds.minX + (gx / (width - 1)) * (bounds.maxX - bounds.minX);
  const wy = bounds.minY + (gy / (height - 1)) * (bounds.maxY - bounds.minY);

  return { x: wx, y: wy };
}

export function computeMarchingSquaresWorker(
  gridData,
  width,
  height,
  minElevation,
  maxElevation,
  bounds,
  interval
) {
  if (!gridData || width < 2 || height < 2) return [];

  const step = interval || 1.0;
  if (!Number.isFinite(step) || step <= 0) return [];
  if (
    !Number.isFinite(minElevation) ||
    !Number.isFinite(maxElevation) ||
    minElevation > maxElevation
  ) {
    return [];
  }

  const startLevel = Math.ceil(minElevation / step) * step;
  const levels = [];
  for (let z = startLevel; z <= maxElevation; z += step) {
    levels.push(Number(z.toFixed(2)));
  }

  const numLevels = levels.length;
  if (numLevels === 0) return [];

  const resolvedBounds = bounds || { minX: -600, maxX: 600, minY: -600, maxY: 600 };
  const minLevel = levels[0];
  const maxLevel = levels[numLevels - 1];
  const invStep = 1 / step;

  const buckets = new Array(numLevels);
  for (let i = 0; i < numLevels; i++) {
    buckets[i] = [];
  }

  for (let y = 0; y < height - 1; y++) {
    const row0 = y * width;
    const row1 = row0 + width;

    for (let x = 0; x < width - 1; x++) {
      const v0 = gridData[row0 + x];
      const v1 = gridData[row0 + x + 1];
      const v2 = gridData[row1 + x + 1];
      const v3 = gridData[row1 + x];

      let cellMin = v0;
      let cellMax = v0;
      if (v1 < cellMin) cellMin = v1;
      else if (v1 > cellMax) cellMax = v1;
      if (v2 < cellMin) cellMin = v2;
      else if (v2 > cellMax) cellMax = v2;
      if (v3 < cellMin) cellMin = v3;
      else if (v3 > cellMax) cellMax = v3;

      if (!(cellMin < cellMax) || cellMax < minLevel || cellMin >= maxLevel) {
        continue;
      }

      let startIdx = Math.floor((cellMin - startLevel) * invStep);
      if (startIdx < 0) startIdx = 0;
      else if (startIdx >= numLevels) startIdx = numLevels - 1;
      while (startIdx > 0 && levels[startIdx - 1] > cellMin) {
        startIdx--;
      }
      while (startIdx < numLevels && levels[startIdx] <= cellMin) {
        startIdx++;
      }

      for (let lIdx = startIdx; lIdx < numLevels; lIdx++) {
        const levelVal = levels[lIdx];
        if (levelVal > cellMax) break;

        let index = 0;
        if (v0 >= levelVal) index |= 8;
        if (v1 >= levelVal) index |= 4;
        if (v2 >= levelVal) index |= 2;
        if (v3 >= levelVal) index |= 1;

        if (index === 0 || index === 15) continue;

        const edges = MARCHING_SQUARES_LOOKUP[index];
        const lines = buckets[lIdx];
        for (let k = 0; k < edges.length; k++) {
          const e = edges[k];
          const pA = getEdgePoint(
            x,
            y,
            e[0],
            v0,
            v1,
            v2,
            v3,
            levelVal,
            width,
            height,
            resolvedBounds
          );
          const pB = getEdgePoint(
            x,
            y,
            e[1],
            v0,
            v1,
            v2,
            v3,
            levelVal,
            width,
            height,
            resolvedBounds
          );
          lines.push({ x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
        }
      }
    }
  }

  const contours = [];
  for (let i = 0; i < numLevels; i++) {
    if (buckets[i].length > 0) {
      contours.push({ elevation: levels[i], lines: buckets[i] });
    }
  }

  return contours;
}

/**
 * CAD Worker Message Handler
 */
export function handleCadWorkerMessage(e) {
  const data = e.data || {};
  const { type, reqId, payload } = data;

  switch (type) {
    case 'SYNC_SCENE_DIFF': {
      if (payload.rooms) {
        cachedRooms = payload.rooms;
        cachedEdges = extractRoomEdges(cachedRooms);
      }
      if (payload.edges) {
        cachedEdges = payload.edges;
      }
      if (payload.settings) {
        cachedSettings = payload.settings;
      }
      if (payload.snapModes) {
        snapModes = payload.snapModes;
      }
      if (payload.scale !== undefined) {
        cachedScale = payload.scale;
      }
      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage({ type: 'SYNC_SCENE_DIFF_ACK', reqId, ok: true });
      }
      return { ok: true };
    }

    case 'EXTRACT_EDGES': {
      const rooms = payload?.rooms || cachedRooms || [];
      const edges = extractRoomEdges(rooms);
      cachedEdges = edges;
      const res = { type: 'EXTRACT_EDGES_RESULT', reqId, edges };
      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(res);
      }
      return res;
    }

    case 'COMPUTE_SNAP': {
      let point = payload.point;
      let anchor = payload.anchor || point;

      // Handle Transferable Float32Array payload [px, py, ax, ay]
      if (payload.pointBuffer instanceof Float32Array) {
        const buf = payload.pointBuffer;
        point = { x: buf[0], y: buf[1] };
        anchor = { x: buf[2], y: buf[3] };
      } else if (Array.isArray(payload.pointArray)) {
        point = { x: payload.pointArray[0], y: payload.pointArray[1] };
        anchor = { x: payload.pointArray[2] ?? point.x, y: payload.pointArray[3] ?? point.y };
      }

      const rooms = payload.rooms || cachedRooms;
      const edges = payload.edges || (rooms ? extractRoomEdges(rooms) : cachedEdges);
      const settings = payload.settings || cachedSettings;
      const modes = payload.snapModes || snapModes;
      const scale = payload.scale !== undefined ? payload.scale : cachedScale;
      const normalizedSnapModes =
        typeof modes?.isEnabled === 'function' ? modes : new SnapModeState(modes?.modes || modes);

      if (!settings || !modes) {
        const fallbackRes = {
          type: 'SNAP_RESULT',
          reqId,
          point,
          rawPoint: point,
          anchor,
          snap: null,
          guideLines: [],
          indicator: null,
        };
        if (typeof self !== 'undefined' && self.postMessage) {
          self.postMessage(fallbackRes);
        }
        return fallbackRes;
      }

      const res = getSnappedPoint({
        point,
        anchor,
        edges,
        settings,
        snapModes: normalizedSnapModes,
        scale,
        explicitAngleDegrees:
          payload.explicitAngleDegrees !== undefined
            ? payload.explicitAngleDegrees
            : settings?.explicitAngleDegrees,
      });

      const guideLines = [];
      if (res.snap) {
        if (res.snap.type === 'edge' || res.snap.type === 'midpoint') {
          const edge =
            edges.find((eItem) => eItem.index === res.snap.edgeIndex) || edges[res.snap.edgeIndex];
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
          if (!anchor || anchor.x !== res.point.x || anchor.y !== res.point.y) {
            guideLines.push({
              start: anchor,
              end: res.point,
              type: 'angle',
            });
          }
          if (res.snap.edgeIndex !== undefined) {
            const edge =
              edges.find((eItem) => eItem.index === res.snap.edgeIndex) ||
              edges[res.snap.edgeIndex];
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

      // Create transferable response buffer [snappedX, snappedY, rawX, rawY]
      const outBuffer = new Float32Array([res.point.x, res.point.y, point.x, point.y]);

      const resultPayload = {
        type: 'SNAP_RESULT',
        reqId,
        point: res.point,
        rawPoint: point,
        anchor,
        snap: res.snap,
        guideLines,
        indicator: res.snap ? res.point : null,
        outBuffer,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(resultPayload, [outBuffer.buffer]);
      }
      return resultPayload;
    }

    case 'VALIDATE_COLLISION': {
      let candidatePolygon = payload.candidatePolygon;

      // Handle Transferable Float32Array payload [x1, y1, x2, y2, ...]
      if (payload.polyBuffer instanceof Float32Array) {
        const buf = payload.polyBuffer;
        candidatePolygon = [];
        for (let i = 0; i < buf.length; i += 2) {
          candidatePolygon.push({ x: buf[i], y: buf[i + 1] });
        }
      }

      const existingPolygons = payload.existingPolygons || cachedRooms || [];
      const validation = validatePlacement(candidatePolygon, existingPolygons);
      const feedback = createPlacementFeedback(candidatePolygon, validation);

      const resultPayload = {
        type: 'COLLISION_RESULT',
        reqId,
        validation,
        feedback,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(resultPayload);
      }
      return resultPayload;
    }

    case 'COMPUTE_ISOLINES': {
      const { gridData, width, height, minElevation, maxElevation, bounds, interval } = payload;

      const contours = computeMarchingSquaresWorker(
        gridData,
        width,
        height,
        minElevation,
        maxElevation,
        bounds,
        interval
      );

      const resultPayload = {
        type: 'ISOLINES_RESULT',
        reqId,
        contours,
      };

      if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage(resultPayload);
      }
      return resultPayload;
    }

    default:
      break;
  }
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', handleCadWorkerMessage);
}
