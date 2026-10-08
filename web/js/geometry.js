import { quantize } from '../../designer3d/tools/gridSettings.mjs';
import {
  closestPointOnArc,
  arcPolygonEdges,
  getArcParameters,
  pointOnArc,
  tessellateArc,
} from '../../designer3d/tools/math2d.mjs';
import proj4 from '#proj4';

export { closestPointOnArc, arcPolygonEdges, getArcParameters, pointOnArc, tessellateArc };

// Register common regional EPSG projection definitions
if (proj4 && proj4.defs) {
  proj4.defs(
    'EPSG:2225',
    '+proj=lcc +lat_0=39.33333333333333 +lon_0=-122 +lat_1=41.66666666666666 +lat_2=40 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs'
  );
  proj4.defs(
    'EPSG:2227',
    '+proj=lcc +lat_0=36.5 +lon_0=-120.5 +lat_1=38.43333333333333 +lat_2=37.06666666666667 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs'
  );
  proj4.defs(
    'EPSG:2228',
    '+proj=lcc +lat_0=35.33333333333333 +lon_0=-119 +lat_1=37.25 +lat_2=36 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs'
  );
  proj4.defs(
    'EPSG:2229',
    '+proj=lcc +lat_0=33.5 +lon_0=-118 +lat_1=35 +lat_2=34.03333333333333 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs'
  );
  proj4.defs(
    'EPSG:2230',
    '+proj=lcc +lat_0=32.16666666666666 +lon_0=-116.25 +lat_1=33.88333333333333 +lat_2=32.78333333333333 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs'
  );
  proj4.defs(
    'EPSG:2263',
    '+proj=lcc +lat_0=40.16666666666666 +lon_0=-74 +lat_1=41.03333333333333 +lat_2=40.66666666666666 +x_0=300000 +y_0=0 +datum=NAD83 +units=us-ft +no_defs'
  );
  proj4.defs('EPSG:26910', '+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs');
  proj4.defs('EPSG:26911', '+proj=utm +zone=11 +datum=NAD83 +units=m +no_defs');
  proj4.defs('EPSG:26918', '+proj=utm +zone=18 +datum=NAD83 +units=m +no_defs');
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
      const originMeters = proj4('EPSG:4326', 'EPSG:3857', originLonLat);
      const xMeters = originMeters[0] + coords[0] * INCH_TO_METER;
      const yMeters = originMeters[1] - coords[1] * INCH_TO_METER;

      if (tDef === 'EPSG:3857') {
        resPt = [xMeters, yMeters];
      } else {
        resPt = proj4('EPSG:3857', tDef, [xMeters, yMeters]);
      }
    } else if (tDef === 'PLAN') {
      // Source CRS to Plan inches relative to origin
      let srcMeters;
      if (sDef === 'EPSG:3857') {
        srcMeters = [coords[0], coords[1]];
      } else {
        srcMeters = proj4(sDef, 'EPSG:3857', [coords[0], coords[1]]);
      }
      const originLonLat = getPlanOrigin(targetCRS);
      const originMeters = proj4('EPSG:4326', 'EPSG:3857', originLonLat);

      const xInches = (srcMeters[0] - originMeters[0]) / INCH_TO_METER;
      const yInches = -(srcMeters[1] - originMeters[1]) / INCH_TO_METER;
      resPt = [xInches, yInches];
    } else {
      // Standard CRS to CRS conversion via proj4
      resPt = proj4(sDef, tDef, [coords[0], coords[1]]);
    }

    if (coords.length > 2) {
      resPt = [resPt[0], resPt[1], ...coords.slice(2)];
    }

    reprojectionCache.set(coords, sourceCRS, targetCRS, resPt);
    return resPt;
  }

  return coords;
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
