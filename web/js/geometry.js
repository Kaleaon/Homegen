import { quantize } from '../../designer3d/tools/gridSettings.mjs';
import {
  closestPointOnArc,
  arcPolygonEdges,
  getArcParameters,
  pointOnArc,
  tessellateArc,
} from '../../designer3d/tools/math2d.mjs';
import proj4 from '#proj4';
import { registerAllEPSG, isRegisteredEPSG } from './epsgRegistry.js';

export { closestPointOnArc, arcPolygonEdges, getArcParameters, pointOnArc, tessellateArc };

// Register pre-compiled EPSG projection definitions
if (proj4 && proj4.defs) {
  registerAllEPSG(proj4);
}

function safeProj4(sDef, tDef, pt) {
  try {
    if (sDef.startsWith('EPSG:') && !isRegisteredEPSG(sDef)) {
      console.warn(`[Geometry] Unsupported EPSG projection code "${sDef}". Falling back safely.`);
      return [pt[0], pt[1]];
    }
    if (tDef.startsWith('EPSG:') && !isRegisteredEPSG(tDef)) {
      console.warn(`[Geometry] Unsupported EPSG projection code "${tDef}". Falling back safely.`);
      return [pt[0], pt[1]];
    }
    const res = proj4(sDef, tDef, pt);
    if (!res || isNaN(res[0]) || isNaN(res[1])) {
      console.warn(`[Geometry] Reprojection returned invalid coordinates for ${sDef} -> ${tDef}`);
      return [pt[0], pt[1]];
    }
    return res;
  } catch (err) {
    console.warn(`[Geometry] Safe reprojection caught error (${sDef} -> ${tDef}): ${err.message}`);
    return [pt[0], pt[1]];
  }
}

class SpatialCache {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  getKey(coords, sourceCRS, targetCRS) {
    const sStr =
      typeof sourceCRS === 'string' ? sourceCRS : sourceCRS?.epsg || JSON.stringify(sourceCRS);
    const tStr =
      typeof targetCRS === 'string' ? targetCRS : targetCRS?.epsg || JSON.stringify(targetCRS);
    if (typeof coords === 'number') return `${coords}:${sStr}:${tStr}`;
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      return `${coords[0].toFixed(6)},${coords[1].toFixed(6)}:${sStr}:${tStr}`;
    }
    return null;
  }

  get(coords, sourceCRS, targetCRS) {
    const key = this.getKey(coords, sourceCRS, targetCRS);
    if (!key) return null;
    return this.cache.get(key);
  }

  set(coords, sourceCRS, targetCRS, result) {
    const key = this.getKey(coords, sourceCRS, targetCRS);
    if (!key) return;
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, result);
  }

  clear() {
    this.cache.clear();
  }
}

export const reprojectionCache = new SpatialCache();

function resolveCRSDef(crs) {
  if (!crs) return 'EPSG:4326';
  if (typeof crs === 'string') {
    const upper = crs.trim().toUpperCase();
    if (upper === 'PLAN' || upper === 'LOCAL' || upper === 'INCHES') return 'PLAN';
    if (/^\d+$/.test(upper)) return `EPSG:${upper}`;
    return crs;
  }
  if (typeof crs === 'object') {
    if (crs.proj4) return crs.proj4;
    if (crs.epsg) return crs.epsg;
  }
  return 'EPSG:4326';
}

function getPlanOrigin(crs) {
  const defaultOrigin = [-122.4194, 37.7749];
  if (!crs || typeof crs !== 'object') return defaultOrigin;
  const o = crs.origin;
  if (Array.isArray(o) && o.length >= 2) return [Number(o[0]), Number(o[1])];
  if (o && typeof o === 'object') {
    const lon = o.longitude ?? o.lon ?? o.x ?? -122.4194;
    const lat = o.latitude ?? o.lat ?? o.y ?? 37.7749;
    return [Number(lon), Number(lat)];
  }
  return defaultOrigin;
}

export function reproject(coords, sourceCRS = 'EPSG:4326', targetCRS = 'PLAN') {
  if (coords == null) return coords;

  const cached = reprojectionCache.get(coords, sourceCRS, targetCRS);
  if (cached !== null && cached !== undefined) {
    return cached;
  }

  // Handle GeoJSON FeatureCollection, Feature, or Geometries
  if (typeof coords === 'object' && !Array.isArray(coords) && coords.type) {
    if (coords.type === 'FeatureCollection') {
      return {
        ...coords,
        features: (coords.features || []).map((f) => reproject(f, sourceCRS, targetCRS)),
      };
    }
    if (coords.type === 'Feature') {
      return {
        ...coords,
        geometry: reproject(coords.geometry, sourceCRS, targetCRS),
      };
    }
    if (
      ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(
        coords.type
      )
    ) {
      return {
        ...coords,
        coordinates: reproject(coords.coordinates, sourceCRS, targetCRS),
      };
    }
  }

  // Handle arrays of arrays (e.g. Ring / Polygon / MultiPoint)
  if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0])) {
    const result = coords.map((c) => reproject(c, sourceCRS, targetCRS));
    reprojectionCache.set(coords, sourceCRS, targetCRS, result);
    return result;
  }

  // Handle Object point { x, y } or { longitude, latitude }
  if (
    typeof coords === 'object' &&
    !Array.isArray(coords) &&
    (coords.x !== undefined || coords.longitude !== undefined || coords.lon !== undefined)
  ) {
    const x = coords.x ?? coords.longitude ?? coords.lon ?? 0;
    const y = coords.y ?? coords.latitude ?? coords.lat ?? 0;
    const pt = [Number(x), Number(y)];
    const res = reproject(pt, sourceCRS, targetCRS);
    const outObj =
      coords.x !== undefined ? { x: res[0], y: res[1] } : { longitude: res[0], latitude: res[1] };
    reprojectionCache.set(coords, sourceCRS, targetCRS, outObj);
    return outObj;
  }

  // Handle single point array [x, y] or [x, y, z]
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
    const sDef = resolveCRSDef(sourceCRS);
    const tDef = resolveCRSDef(targetCRS);

    if (sDef === tDef) {
      reprojectionCache.set(coords, sourceCRS, targetCRS, coords);
      return coords;
    }

    const INCH_TO_METER = 0.0254;
    let resPt;

    if (sDef === 'PLAN' && tDef === 'PLAN') {
      reprojectionCache.set(coords, sourceCRS, targetCRS, coords);
      return coords;
    }

    if (sDef === 'PLAN') {
      // Plan inches to projected meters (EPSG:3857) relative to origin
      const originLonLat = getPlanOrigin(sourceCRS);
      const originMeters = safeProj4('EPSG:4326', 'EPSG:3857', originLonLat);
      const xMeters = originMeters[0] + coords[0] * INCH_TO_METER;
      const yMeters = originMeters[1] - coords[1] * INCH_TO_METER;

      if (tDef === 'EPSG:3857') {
        resPt = [xMeters, yMeters];
      } else {
        resPt = safeProj4('EPSG:3857', tDef, [xMeters, yMeters]);
      }
    } else if (tDef === 'PLAN') {
      // Source CRS to Plan inches relative to origin
      let srcMeters;
      if (sDef === 'EPSG:3857') {
        srcMeters = [coords[0], coords[1]];
      } else {
        srcMeters = safeProj4(sDef, 'EPSG:3857', [coords[0], coords[1]]);
      }
      const originLonLat = getPlanOrigin(targetCRS);
      const originMeters = safeProj4('EPSG:4326', 'EPSG:3857', originLonLat);

      const xInches = (srcMeters[0] - originMeters[0]) / INCH_TO_METER;
      const yInches = -(srcMeters[1] - originMeters[1]) / INCH_TO_METER;
      resPt = [xInches, yInches];
    } else {
      // Standard CRS to CRS conversion via proj4
      resPt = safeProj4(sDef, tDef, [coords[0], coords[1]]);
    }

    if (coords.length > 2) {
      resPt = [resPt[0], resPt[1], ...coords.slice(2)];
    }

    reprojectionCache.set(coords, sourceCRS, targetCRS, resPt);
    return resPt;
  }

  return coords;
}

/**
 * Parses ESRI Worldfile content (.tfw, .pgw, .wld, etc.)
 * Worldfile parameters in order:
 * Line 1: A - pixel size in X direction / X scale
 * Line 2: D - rotation about Y axis / row rotation / skew Y
 * Line 3: B - rotation about X axis / column rotation / skew X
 * Line 4: E - pixel size in Y direction / Y scale (typically negative)
 * Line 5: C - X coordinate of top-left pixel center (translation X)
 * Line 6: F - Y coordinate of top-left pixel center (translation Y)
 *
 * @param {string|number[]|object} input Worldfile string, array, or object
 * @returns {number[]|null} [A, D, B, E, C, F] or null if invalid
 */
export function parseWorldfile(input) {
  if (!input) return null;
  if (Array.isArray(input)) {
    if (input.length >= 6 && input.slice(0, 6).every(Number.isFinite)) {
      return input.slice(0, 6).map(Number);
    }
    return null;
  }
  if (typeof input === 'object') {
    const a = input.A ?? input.a ?? input.m11;
    const d = input.D ?? input.d ?? input.m12;
    const b = input.B ?? input.b ?? input.m21;
    const e = input.E ?? input.e ?? input.m22;
    const c = input.C ?? input.c ?? input.m31;
    const f = input.F ?? input.f ?? input.m32;
    const arr = [a, d, b, e, c, f].map(Number);
    if (arr.every(Number.isFinite)) return arr;
    return null;
  }
  if (typeof input === 'string') {
    const nums = input
      .trim()
      .split(/[\s,]+/)
      .map((s) => parseFloat(s))
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 6) {
      return nums.slice(0, 6);
    }
  }
  return null;
}

/**
 * Solves 2x3 affine matrix [a, b, c, d, e, f] from 3 source control points and 3 target points.
 *
 * x_target = a * x_src + c * y_src + e
 * y_target = b * x_src + d * y_src + f
 *
 * Detects collinear source points and throws an Error.
 *
 * @param {{x: number, y: number}[]} srcPts 3 source control points (e.g. image pixels)
 * @param {{x: number, y: number}[]} dstPts 3 target points (e.g. ground or PLAN coordinates)
 * @returns {number[]} 6-element affine matrix array [a, b, c, d, e, f]
 */
export function solveAffineTransform(srcPts, dstPts) {
  if (!Array.isArray(srcPts) || !Array.isArray(dstPts) || srcPts.length < 3 || dstPts.length < 3) {
    throw new Error('3 control point pairs are required for affine calibration');
  }

  const x1 = srcPts[0].x,
    y1 = srcPts[0].y;
  const x2 = srcPts[1].x,
    y2 = srcPts[1].y;
  const x3 = srcPts[2].x,
    y3 = srcPts[2].y;

  const u1 = dstPts[0].x,
    v1 = dstPts[0].y;
  const u2 = dstPts[1].x,
    v2 = dstPts[1].y;
  const u3 = dstPts[2].x,
    v3 = dstPts[2].y;

  // Determinant = 2 * signed area of triangle (srcPts)
  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);

  if (Math.abs(det) < 1e-9) {
    throw new Error('Collinear control points detected. Singular matrix inversion prevented.');
  }

  // Inverse matrix components M^(-1) = adj(M) / det
  const inv11 = (y2 - y3) / det;
  const inv12 = (y3 - y1) / det;
  const inv13 = (y1 - y2) / det;

  const inv21 = (x3 - x2) / det;
  const inv22 = (x1 - x3) / det;
  const inv23 = (x2 - x1) / det;

  const inv31 = (x2 * y3 - x3 * y2) / det;
  const inv32 = (x3 * y1 - x1 * y3) / det;
  const inv33 = (x1 * y2 - x2 * y1) / det;

  // u = a*x + c*y + e
  const a = inv11 * u1 + inv12 * u2 + inv13 * u3;
  const c = inv21 * u1 + inv22 * u2 + inv23 * u3;
  const e = inv31 * u1 + inv32 * u2 + inv33 * u3;

  // v = b*x + d*y + f
  const b = inv11 * v1 + inv12 * v2 + inv13 * v3;
  const d = inv21 * v1 + inv22 * v2 + inv23 * v3;
  const f = inv31 * v1 + inv32 * v2 + inv33 * v3;

  return [a, b, c, d, e, f];
}

/**
 * Computes geographic bounding box (EPSG:4326) for image bounds transformed by affine matrix.
 *
 * @param {number[]} matrix 2x3 affine matrix [a, b, c, d, e, f]
 * @param {number} width Image width
 * @param {number} height Image height
 * @param {string} sourceCRS CRS of the transformed matrix points (default 'PLAN')
 * @returns {object} { minLon, minLat, maxLon, maxLat, west, south, east, north }
 */
export function computeGeoBounds(matrix, width, height, sourceCRS = 'PLAN') {
  if (!Array.isArray(matrix) || matrix.length < 6) {
    matrix = [1, 0, 0, 1, 0, 0];
  }
  const [a, b, c, d, e, f] = matrix.map(Number);
  const w = width || 100;
  const h = height || 100;

  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;

  for (const p of corners) {
    const tx = a * p.x + c * p.y + e;
    const ty = b * p.x + d * p.y + f;
    const geo = reproject([tx, ty], sourceCRS, 'EPSG:4326');
    const lon = Array.isArray(geo) ? geo[0] : (geo.x ?? geo.longitude ?? 0);
    const lat = Array.isArray(geo) ? geo[1] : (geo.y ?? geo.latitude ?? 0);

    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return {
    minLon,
    minLat,
    maxLon,
    maxLat,
    west: minLon,
    south: minLat,
    east: maxLon,
    north: maxLat,
    minX: minLon,
    minY: minLat,
    maxX: maxLon,
    maxY: maxLat,
  };
}

/**
 * Converts Worldfile parameters [A, D, B, E, C, F] from worldfile CRS to target CRS (default 'PLAN').
 *
 * @param {number[]} worldfileParams [A, D, B, E, C, F]
 * @param {string} sourceCRS Worldfile CRS (e.g. 'EPSG:4326', 'EPSG:3857', 'EPSG:2227')
 * @param {string} targetCRS Target CRS (default 'PLAN')
 * @returns {number[]} 2x3 affine matrix [a, b, c, d, e, f] in target CRS
 */
export function worldfileToAffineMatrix(
  worldfileParams,
  sourceCRS = 'EPSG:4326',
  targetCRS = 'PLAN'
) {
  const parsed = parseWorldfile(worldfileParams);
  if (!parsed) return [1, 0, 0, 1, 0, 0];

  const [A, D, B, E, C, F] = parsed;

  if (sourceCRS === targetCRS || sourceCRS === 'PLAN') {
    return [A, D, B, E, C, F];
  }

  // Sample 3 points in pixel space: P0(0,0), P1(1,0), P2(0,1)
  const g0 = [C, F];
  const g1 = [C + A, F + D];
  const g2 = [C + B, F + E];

  const p0 = reproject(g0, sourceCRS, targetCRS);
  const p1 = reproject(g1, sourceCRS, targetCRS);
  const p2 = reproject(g2, sourceCRS, targetCRS);

  const e = p0[0];
  const f = p0[1];
  const a = p1[0] - p0[0];
  const b = p1[1] - p0[1];
  const c = p2[0] - p0[0];
  const d = p2[1] - p0[1];

  return [a, b, c, d, e, f];
}

// Geometry helpers. All units are inches; +x is east, +y is south (screen coordinates).
export const WT = 4.5; // wall thickness, rooms are measured centerline-to-centerline
export const GRID = 6;
export const EPS = 0.5;
export const WALLS = ['N', 'E', 'S', 'W'];
export const LEGACY_WALL_NAMES = ['N', 'E', 'S', 'W'];
export const LEGACY_WALL_MAP = { N: 0, E: 1, S: 2, W: 3, 0: 0, 1: 1, 2: 2, 3: 3 };
export const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

export const lv = (r) => r.level || 0;

export const snap = (v, g = GRID) => quantize(v, g);

export function resolveWallIndex(wall) {
  if (typeof wall === 'number') return wall;
  if (LEGACY_WALL_MAP[wall] !== undefined) return LEGACY_WALL_MAP[wall];
  const parsed = parseInt(wall, 10);
  return isNaN(parsed) ? 0 : parsed;
}

export function getRoomPoints(room) {
  if (!room) {
    return [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ];
  }
  const pts = room.points || room.corners || room.vertices;
  if (Array.isArray(pts) && pts.length >= 3) {
    if (pts.length === 4) {
      const [p0, p1, p2, p3] = pts;
      const isRect =
        Math.abs(p0.y - p1.y) < 1e-4 &&
        Math.abs(p1.x - p2.x) < 1e-4 &&
        Math.abs(p2.y - p3.y) < 1e-4 &&
        Math.abs(p3.x - p0.x) < 1e-4;
      if (isRect) {
        const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
        const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
        const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
        const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
        const bw = maxX - minX;
        const bh = maxY - minY;
        const rx = room.x ?? minX;
        const ry = room.y ?? minY;
        const rw = room.w ?? bw;
        const rh = room.h ?? bh;
        if (
          Math.abs(rx - minX) > 1e-4 ||
          Math.abs(ry - minY) > 1e-4 ||
          Math.abs(rw - bw) > 1e-4 ||
          Math.abs(rh - bh) > 1e-4
        ) {
          const newPts = [
            { x: rx, y: ry },
            { x: rx + rw, y: ry },
            { x: rx + rw, y: ry + rh },
            { x: rx, y: ry + rh },
          ];
          if (room.points) room.points = newPts;
          if (room.corners) room.corners = newPts;
          if (room.vertices) room.vertices = newPts;
          return newPts;
        }
      }
    }
    return pts;
  }
  const x = room.x ?? 0;
  const y = room.y ?? 0;
  const w = room.w ?? 120;
  const h = room.h ?? 120;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function getRoomBoundingBox(points) {
  if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

export function polygonPerimeter(points) {
  if (!points || points.length < 2) return 0;
  let perimeter = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = points[i];
    const p2 = points[j];
    const x1 = p1.x ?? p1[0] ?? 0;
    const y1 = p1.y ?? p1[1] ?? 0;
    const x2 = p2.x ?? p2[0] ?? 0;
    const y2 = p2.y ?? p2[1] ?? 0;
    perimeter += Math.hypot(x2 - x1, y2 - y1);
  }
  return perimeter;
}

export function polygonWinding(points) {
  if (!points || points.length < 3) return 1;
  let sum = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += (points[j].x - points[i].x) * (points[j].y + points[i].y);
  }
  return sum >= 0 ? 1 : -1;
}

export function polygonCentroid(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  if (points.length === 2)
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };

  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const factor = points[i].x * points[j].y - points[j].x * points[i].y;
    area += factor;
    cx += (points[i].x + points[j].x) * factor;
    cy += (points[i].y + points[j].y) * factor;
  }
  area = area / 2;
  if (Math.abs(area) >= 1e-6) {
    cx = cx / (6 * area);
    cy = cy / (6 * area);
    const pt = { x: cx, y: cy };
    if (pointInPolygon(pt, points)) {
      return pt;
    }
  }

  const bbox = getRoomBoundingBox(points);
  const mid = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
  if (pointInPolygon(mid, points)) {
    return mid;
  }

  let sx = 0,
    sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const avg = { x: sx / n, y: sy / n };
  if (pointInPolygon(avg, points)) return avg;

  return points[0];
}

/** Wall segment of a room. `t` offsets run along the edge from start to end vertex. */
export function wallSeg(room, wall) {
  const points = getRoomPoints(room);
  const idx = resolveWallIndex(wall) % points.length;

  let p1, p2;
  if (points.length === 4) {
    if (idx === 0) {
      p1 = points[0];
      p2 = points[1];
    } else if (idx === 1) {
      p1 = points[1];
      p2 = points[2];
    } else if (idx === 2) {
      p1 = points[3];
      p2 = points[2];
    } else {
      p1 = points[0];
      p2 = points[3];
    }
  } else {
    p1 = points[idx];
    p2 = points[(idx + 1) % points.length];
  }

  const vx = p2.x - p1.x;
  const vy = p2.y - p1.y;
  const len = Math.hypot(vx, vy);
  if (len === 0) {
    return { ax: p1.x, ay: p1.y, dx: 1, dy: 0, nx: 0, ny: 1, len: 0, index: idx };
  }
  const dx = vx / len;
  const dy = vy / len;

  let nx, ny;
  if (points.length === 4) {
    if (idx === 0) {
      nx = 0;
      ny = 1;
    } else if (idx === 1) {
      nx = -1;
      ny = 0;
    } else if (idx === 2) {
      nx = 0;
      ny = -1;
    } else {
      nx = 1;
      ny = 0;
    }
  } else {
    const winding = polygonWinding(points);
    nx = winding > 0 ? dy : -dy;
    ny = winding > 0 ? -dx : dx;
  }

  return { ax: p1.x, ay: p1.y, dx, dy, nx, ny, len, index: idx };
}

export const wallLength = (room, wall) => wallSeg(room, wall).len;

export function interiorPolygon(room, wallThickness = WT) {
  const pts = getRoomPoints(room);
  const n = pts.length;
  if (n < 3) return pts;

  const segs = [];
  for (let i = 0; i < n; i++) {
    segs.push(wallSeg(room, i));
  }

  const offset = wallThickness / 2;
  const shiftedLines = segs.map((s) => ({
    px: s.ax + s.nx * offset,
    py: s.ay + s.ny * offset,
    dx: s.dx,
    dy: s.dy,
  }));

  const innerPts = [];
  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const line1 = shiftedLines[prevIdx];
    const line2 = shiftedLines[i];

    const denom = line1.dx * line2.dy - line1.dy * line2.dx;
    if (Math.abs(denom) < 1e-6) {
      innerPts.push({ x: line2.px, y: line2.py });
    } else {
      const s = ((line2.px - line1.px) * line2.dy - (line2.py - line1.py) * line2.dx) / denom;
      innerPts.push({
        x: line1.px + s * line1.dx,
        y: line1.py + s * line1.dy,
      });
    }
  }

  return innerPts;
}

/** Wall keys for room polygon ('N','E','S','W' for 4-wall rooms, or 0..N-1 for N-wall rooms). */
export function getRoomWallKeys(room) {
  const pts = getRoomPoints(room);
  if (pts.length === 4) return ['N', 'E', 'S', 'W'];
  return Array.from({ length: pts.length }, (_, i) => i);
}

export function polygonCentroid(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  if (points.length === 2) {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }

  let cx = 0;
  let cy = 0;
  let signedArea = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const x0 = points[i].x;
    const y0 = points[i].y;
    const x1 = points[(i + 1) % n].x;
    const y1 = points[(i + 1) % n].y;
    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-6) {
    let sx = 0,
      sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }

  cx /= 6 * signedArea;
  cy /= 6 * signedArea;

  const pt = { x: cx, y: cy };
  if (!pointInPolygon(pt, points)) {
    let bestDist = Infinity;
    let bestPt = pt;
    for (let i = 0; i < n; i++) {
      const mid = {
        x: (points[i].x + points[(i + 1) % n].x) / 2,
        y: (points[i].y + points[(i + 1) % n].y) / 2,
      };
      if (pointInPolygon(mid, points)) {
        const d = Math.hypot(mid.x - cx, mid.y - cy);
        if (d < bestDist) {
          bestDist = d;
          bestPt = mid;
        }
      }
    }
    if (bestDist < Infinity) return bestPt;
  }

  return pt;
}

/** Inscribed clear span (minimum clear horizontal dimension) across room interior polygon. */
export function getRoomClearSpan(room) {
  if (!room) return 0;
  const pts = getRoomPoints(room);
  const n = pts.length;

  // Fast fallback for 4-vertex axis-aligned rectangular rooms
  if (n === 4) {
    const [p0, p1, p2, p3] = pts;
    const isRect =
      Math.abs(p0.y - p1.y) < 1e-4 &&
      Math.abs(p1.x - p2.x) < 1e-4 &&
      Math.abs(p2.y - p3.y) < 1e-4 &&
      Math.abs(p3.x - p0.x) < 1e-4;
    if (isRect) {
      const ir = interior(room);
      return Math.min(ir.w, ir.h);
    }
  }

  // Caching
  const ptsHash = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';');
  if (room._clearSpanCache && room._clearSpanCache.hash === ptsHash) {
    return room._clearSpanCache.val;
  }

  const innerPts = interiorPolygon(room, WT);
  const m = innerPts.length;
  if (m < 3) return 0;

  let minSpan = Infinity;

  // 1. Rays along interior wall normals across opposing edges
  for (let i = 0; i < m; i++) {
    const p1 = innerPts[i];
    const p2 = innerPts[(i + 1) % m];
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-4) continue;
    const dx = vx / len;
    const dy = vy / len;

    const winding = polygonWinding(innerPts);
    const nx = winding > 0 ? dy : -dy;
    const ny = winding > 0 ? -dx : dx;

    // Sample along wall edge
    const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
    for (const t of samples) {
      const P = { x: p1.x + t * vx, y: p1.y + t * vy };

      // Ray: P + lambda * (nx, ny)
      for (let j = 0; j < m; j++) {
        if (j === i) continue;
        const A = innerPts[j];
        const B = innerPts[(j + 1) % m];
        const wx = B.x - A.x;
        const wy = B.y - A.y;

        const denom = nx * wy - ny * wx;
        if (Math.abs(denom) < 1e-6) continue;

        const lambda = ((A.x - P.x) * wy - (A.y - P.y) * wx) / denom;
        const u = ((P.y - A.y) * nx - (P.x - A.x) * ny) / denom;

        if (lambda > 0.1 && u >= -1e-4 && u <= 1 + 1e-4) {
          const midRay = { x: P.x + (lambda / 2) * nx, y: P.y + (lambda / 2) * ny };
          if (pointInPolygon(midRay, innerPts)) {
            if (lambda < minSpan) {
              minSpan = lambda;
            }
          }
        }
      }
    }
  }

  // 2. Fallback to bounding box min dimension if no ray intersected or edge case
  if (minSpan === Infinity || isNaN(minSpan)) {
    const bbox = getRoomBoundingBox(innerPts);
    minSpan = Math.min(bbox.w, bbox.h);
  }

  if (room && typeof room === 'object') {
    room._clearSpanCache = { hash: ptsHash, val: minSpan };
  }

  return minSpan;
}

/** Clear interior bounding box or polygon. */
export function interior(room) {
  const innerPts = interiorPolygon(room, WT);
  const bbox = getRoomBoundingBox(innerPts);
  return bbox;
}

export const floorAreaSqFt = (room) => polygonArea(interiorPolygon(room)) / 144;

export function overlapLen(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function rectsOverlap(a, b, eps = 0.01) {
  return (
    overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) > eps &&
    overlapLen(a.y, a.y + a.h, b.y, b.y + b.h) > eps
  );
}

export function lineSegmentsIntersect(p1, p2, p3, p4) {
  const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

export function polygonsOverlap(polyA, polyB) {
  if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;
  const boxA = getRoomBoundingBox(polyA);
  const boxB = getRoomBoundingBox(polyB);
  if (!rectsOverlap(boxA, boxB, EPS)) return false;

  for (const p of polyA) {
    if (pointInPolygon(p, polyB)) return true;
  }
  for (const p of polyB) {
    if (pointInPolygon(p, polyA)) return true;
  }

  const nA = polyA.length;
  const nB = polyB.length;
  for (let i = 0; i < nA; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % nA];
    for (let j = 0; j < nB; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % nB];
      if (lineSegmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export const rectInside = (inner, outer, eps = 0.01) =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.w <= outer.x + outer.w + eps &&
  inner.y + inner.h <= outer.y + outer.h + eps;

export function pointInPolygon(p, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Rooms may touch edge-to-edge but never overlap. */
export function roomsOverlap(a, b) {
  if (!a || !b) return false;
  const polyA = getRoomPoints(a);
  const polyB = getRoomPoints(b);
  // Quick bounding box check
  const boxA = getRoomBoundingBox(polyA);
  const boxB = getRoomBoundingBox(polyB);
  if (!rectsOverlap(boxA, boxB, EPS)) return false;

  // Check vertex inside other polygon
  for (const pt of polyA) {
    if (pointInPolygon(pt, polyB)) return true;
  }
  for (const pt of polyB) {
    if (pointInPolygon(pt, polyA)) return true;
  }
  return rectsOverlap(boxA, boxB, EPS);
}

/** World point of wall-offset `t` plus `depth` inches toward the room interior. */
export function wallPoint(room, wall, t, depth = 0) {
  const s = wallSeg(room, wall);
  return { x: s.ax + s.dx * t + s.nx * depth, y: s.ay + s.dy * t + s.ny * depth };
}

/** Neighbouring rooms flush against `wall`, with their overlap interval in this wall's offset space. */
export function wallNeighbors(rooms, room, wall) {
  const out = [];
  const s1 = wallSeg(room, wall);
  if (s1.len <= EPS) return out;

  for (const r of rooms) {
    if (r.id === room.id || lv(r) !== lv(room)) continue;
    const rPts = getRoomPoints(r);
    for (let j = 0; j < rPts.length; j++) {
      const s2 = wallSeg(r, j);
      if (s2.len <= EPS) continue;

      // Check if walls are parallel and opposite normal direction
      const dotDir = s1.dx * s2.dx + s1.dy * s2.dy;
      const dotNorm = s1.nx * s2.nx + s1.ny * s2.ny;
      if (Math.abs(dotNorm + 1) < 0.1 || Math.abs(dotNorm - 1) < 0.1) {
        // Distance between wall lines
        const perpDist = Math.abs((s2.ax - s1.ax) * s1.nx + (s2.ay - s1.ay) * s1.ny);
        if (perpDist < WT + EPS) {
          // Project s2 start and end onto s1 direction
          const t2_start = (s2.ax - s1.ax) * s1.dx + (s2.ay - s1.ay) * s1.dy;
          const t2_end = t2_start + s2.len * dotDir;
          const from = Math.max(0, Math.min(t2_start, t2_end));
          const to = Math.min(s1.len, Math.max(t2_start, t2_end));
          if (to - from > EPS) {
            out.push({ room: r, from, to });
          }
        }
      }
    }
  }
  return out;
}

/** Offset translation from neighbour `r2`'s wall space into `room`'s wall space. */
export const neighborShift = (room, r2, wall) =>
  wall === 'N' || wall === 'S' ? r2.x - room.x : r2.y - room.y;

// ---- interval helpers (arrays of [a,b]) ----
export function subtractInterval(intervals, [s0, s1]) {
  const out = [];
  for (const [a, b] of intervals) {
    if (s1 <= a || s0 >= b) {
      out.push([a, b]);
      continue;
    }
    if (s0 > a) out.push([a, s0]);
    if (s1 < b) out.push([s1, b]);
  }
  return out;
}

export function intersectInterval(intervals, [s0, s1]) {
  const out = [];
  for (const [a, b] of intervals) {
    const lo = Math.max(a, s0);
    const hi = Math.min(b, s1);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}

/** Footprint rect of a floor item (rotations are multiples of 90). */
export function footprint(item, def) {
  const swap = item.rot % 180 !== 0;
  const w = swap ? def.d : def.w;
  const d = swap ? def.w : def.d;
  return { x: item.x - w / 2, y: item.y - d / 2, w, h: d };
}

/** Unit vector the item front faces at its rotation. rot 0 faces south (+y). */
export function facing(rot) {
  const r = (rot * Math.PI) / 180;
  return { x: Math.round(-Math.sin(r)), y: Math.round(Math.cos(r)) };
}

/** Rect clear zone in front of / around a fixture: lateral +-half, back edge to `front` inches beyond the front edge. */
export function fixtureZone(item, def, half, front) {
  const f = facing(item.rot);
  const depthTotal = def.d + front;
  const cx = item.x + f.x * (front / 2);
  const cy = item.y + f.y * (front / 2);
  const lateral = half * 2;
  const alongFront = f.x !== 0;
  const w = alongFront ? depthTotal : lateral;
  const h = alongFront ? lateral : depthTotal;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function extractRoomEdges(rooms) {
  const edges = [];
  let index = 0;
  for (const r of rooms) {
    const pts = r.points || r.corners || r.vertices;
    if (Array.isArray(pts) && pts.length >= 2) {
      const bulges = Array.isArray(r.bulges) ? r.bulges : [];
      const numPts = pts.length;
      for (let i = 0; i < numPts; i++) {
        const next = (i + 1) % numPts;
        if (i === numPts - 1 && r.closed === false) continue;
        let bulge = bulges[i] || pts[i]?.bulge || 0;
        const wall = pts.length === 4 ? LEGACY_WALL_NAMES[i] : `${i}`;
        if (!bulge && r.bulges && typeof r.bulges[wall] === 'number') {
          bulge = r.bulges[wall];
        }
        edges.push({
          start: pts[i],
          end: pts[next],
          bulge,
          index: index++,
          roomId: r.id,
          wall,
          edgeIndex: i,
        });
      }
    } else {
      const roomPts = getRoomPoints(r);
      for (let i = 0; i < roomPts.length; i++) {
        const s = wallSeg(r, i);
        const start = { x: s.ax, y: s.ay };
        const end = { x: s.ax + s.dx * s.len, y: s.ay + s.dy * s.len };
        const wall = roomPts.length === 4 ? LEGACY_WALL_NAMES[i] : `${i}`;
        let bulge = 0;
        if (r.bulges) {
          if (typeof r.bulges[wall] === 'number') bulge = r.bulges[wall];
          else if (Array.isArray(r.bulges) && typeof r.bulges[i] === 'number') bulge = r.bulges[i];
        }
        edges.push({ start, end, bulge, index: index++, roomId: r.id, wall, edgeIndex: i });
      }
    }
  }
  return edges;
}

export function roomToPolygon(room) {
  return getRoomPoints(room);
}

export function itemToPolygon(item, def) {
  const fp = footprint(item, def);
  return [
    { x: fp.x, y: fp.y },
    { x: fp.x + fp.w, y: fp.y },
    { x: fp.x + fp.w, y: fp.y + fp.h },
    { x: fp.x, y: fp.y + fp.h },
  ];
}

export function rectsTouch(a, b, margin = 0) {
  if (!a || !b) return false;
  const ax0 = a.x - margin;
  const ax1 = a.x + a.w + margin;
  const ay0 = a.y - margin;
  const ay1 = a.y + a.h + margin;
  const bx0 = b.x;
  const bx1 = b.x + b.w;
  const by0 = b.y;
  const by1 = b.y + b.h;
  return Math.max(ax0, bx0) < Math.min(ax1, bx1) && Math.max(ay0, by0) < Math.min(ay1, by1);
}

export function polygonCentroid(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  if (points.length === 2) {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
  }

  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p1 = points[i];
    const p2 = points[j];
    const cross = p1.x * p2.y - p2.x * p1.y;
    area += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }

  area = area / 2;
  if (Math.abs(area) < 1e-6) {
    let sx = 0,
      sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }

  cx = cx / (6 * area);
  cy = cy / (6 * area);
  return { x: cx, y: cy };
}

export function polygonMinClearanceWidth(points) {
  if (!points || points.length < 3) return 0;
  const bbox = getRoomBoundingBox(points);
  let minClearance = Math.min(bbox.w, bbox.h);

  const n = points.length;
  const winding = polygonWinding(points);

  const edges = [];
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const len = Math.hypot(vx, vy);
    if (len < EPS) continue;
    const dx = vx / len;
    const dy = vy / len;
    const nx = winding > 0 ? dy : -dy;
    const ny = winding > 0 ? -dx : dx;
    edges.push({ p1, p2, dx, dy, nx, ny, len, index: i });
  }

  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const e2 = edges[j];
      const dotN = e1.nx * e2.nx + e1.ny * e2.ny;
      if (dotN < -0.8) {
        const dist = (e2.p1.x - e1.p1.x) * e1.nx + (e2.p1.y - e1.p1.y) * e1.ny;
        if (dist > 0.1) {
          const t1_start = 0;
          const t1_end = e1.len;
          const t2_p1 = (e2.p1.x - e1.p1.x) * e1.dx + (e2.p1.y - e1.p1.y) * e1.dy;
          const t2_p2 = (e2.p2.x - e1.p1.x) * e1.dx + (e2.p2.y - e1.p1.y) * e1.dy;
          const t2_start = Math.min(t2_p1, t2_p2);
          const t2_end = Math.max(t2_p1, t2_p2);

          const overlap = overlapLen(t1_start, t1_end, t2_start, t2_end);
          if (overlap > EPS) {
            minClearance = Math.min(minClearance, dist);
          }
        }
      }
    }
  }

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    for (let k = 0; k < n; k++) {
      if (k === e.index || k === (e.index + 1) % n) continue;
      const pk = points[k];
      const t = (pk.x - e.p1.x) * e.dx + (pk.y - e.p1.y) * e.dy;
      const dist = (pk.x - e.p1.x) * e.nx + (pk.y - e.p1.y) * e.ny;
      if (t > EPS && t < e.len - EPS && dist > 0.1) {
        const projPt = { x: e.p1.x + t * e.dx, y: e.p1.y + t * e.dy };
        const midPt = { x: (pk.x + projPt.x) / 2, y: (pk.y + projPt.y) / 2 };
        if (pointInPolygon(midPt, points)) {
          minClearance = Math.min(minClearance, dist);
        }
      }
    }
  }

  return minClearance;
}

export function interiorPolygonData(room, wallThickness = WT) {
  const points = interiorPolygon(room, wallThickness);
  const centroid = polygonCentroid(points);
  const minWidth = polygonMinClearanceWidth(points);
  return {
    points,
    centroid,
    minWidth,
    minClearanceWidth: minWidth,
    minEdgeClearanceWidth: minWidth,
  };
}

function pointToSegmentDist(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * vx;
  const qy = a.y + t * vy;
  return Math.hypot(p.x - qx, p.y - qy);
}

export function isPointInPolygonOrBoundary(p, poly, eps = 0.5) {
  if (!poly || poly.length < 3) return false;
  if (pointInPolygon(p, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    if (pointToSegmentDist(p, poly[i], poly[j]) <= eps) return true;
  }
  return false;
}

function lineSegmentsCross(a1, a2, b1, b2, eps = 0.1) {
  const lenA = Math.hypot(a2.x - a1.x, a2.y - a1.y);
  const lenB = Math.hypot(b2.x - b1.x, b2.y - b1.y);
  if (lenA < 1e-6 || lenB < 1e-6) return false;

  const crossA1 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
  const crossA2 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);

  const threshA = eps * lenA;
  if (Math.abs(crossA1) <= threshA || Math.abs(crossA2) <= threshA) {
    return false;
  }
  if ((crossA1 > 0 && crossA2 > 0) || (crossA1 < 0 && crossA2 < 0)) {
    return false;
  }

  const crossB1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
  const crossB2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);

  const threshB = eps * lenB;
  if (Math.abs(crossB1) <= threshB || Math.abs(crossB2) <= threshB) {
    return false;
  }
  if ((crossB1 > 0 && crossB2 > 0) || (crossB1 < 0 && crossB2 < 0)) {
    return false;
  }

  return true;
}

export function polygonContainsRect(poly, rect, eps = 0.5) {
  if (!poly || poly.length < 3 || !rect) return false;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };

  for (const c of corners) {
    if (!isPointInPolygonOrBoundary(c, poly, eps)) return false;
  }
  if (!isPointInPolygonOrBoundary(center, poly, eps)) return false;

  const rectEdges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % n];
    for (const [r1, r2] of rectEdges) {
      if (lineSegmentsCross(p1, p2, r1, r2, 0.1)) {
        return false;
      }
    }
  }

  return true;
}

export function polygonContainsZone(poly, zone, eps = 0.1) {
  return polygonContainsRect(poly, zone, eps);
}
