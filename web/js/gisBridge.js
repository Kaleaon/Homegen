/**
 * GIS Subsystem Bridge with Spatial R-Tree Indexing.
 * Manages EPSG coordinate transformations, spatial R-tree indexing,
 * variable segment setbacks, and site layer scene graph geometries.
 */

import {
  reproject,
  getBounds,
  boundsOverlap,
  pointInPolygon,
  lineIntersection,
  polygonArea,
} from './geometry.js';
import { normalizeCode } from './epsgRegistry.js';

export { getBounds, boundsOverlap, pointInPolygon, lineIntersection, polygonArea };

/**
 * 2D R-tree spatial index implementation.
 */
export class SpatialRTree {
  constructor(maxEntries = 8) {
    this.maxEntries = maxEntries;
    this.root = {
      bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      children: [],
      leaf: true,
    };
    this.items = [];
  }

  insert(item, bounds) {
    const nodeItem = { item, bounds };
    this.items.push(nodeItem);
    this._insertNode(this.root, nodeItem);
  }

  _insertNode(node, entry) {
    this._expandBounds(node.bounds, entry.bounds);
    if (node.leaf) {
      node.children.push(entry);
      if (node.children.length > this.maxEntries) {
        this._split(node);
      }
    } else {
      // Find best child
      let bestChild = node.children[0];
      let minExpansion = Infinity;
      for (const child of node.children) {
        const expanded = this._expansionArea(child.bounds, entry.bounds);
        if (expanded < minExpansion) {
          minExpansion = expanded;
          bestChild = child;
        }
      }
      this._insertNode(bestChild, entry);
    }
  }

  _expandBounds(target, addition) {
    target.minX = Math.min(target.minX, addition.minX);
    target.minY = Math.min(target.minY, addition.minY);
    target.maxX = Math.max(target.maxX, addition.maxX);
    target.maxY = Math.max(target.maxY, addition.maxY);
  }

  _expansionArea(b, addition) {
    const minX = Math.min(b.minX, addition.minX);
    const minY = Math.min(b.minY, addition.minY);
    const maxX = Math.max(b.maxX, addition.maxX);
    const maxY = Math.max(b.maxY, addition.maxY);
    const currArea = (b.maxX - b.minX) * (b.maxY - b.minY);
    const newArea = (maxX - minX) * (maxY - minY);
    return newArea - currArea;
  }

  _split(node) {
    const children = node.children.slice();
    node.children = [];
    node.leaf = false;

    // Split along longest axis
    const dx = node.bounds.maxX - node.bounds.minX;
    const dy = node.bounds.maxY - node.bounds.minY;
    if (dx > dy) {
      children.sort((a, b) => a.bounds.minX + a.bounds.maxX - (b.bounds.minX + b.bounds.maxX));
    } else {
      children.sort((a, b) => a.bounds.minY + a.bounds.maxY - (b.bounds.minY + b.bounds.maxY));
    }

    const mid = Math.floor(children.length / 2);
    const leftGroup = children.slice(0, mid);
    const rightGroup = children.slice(mid);

    const leftNode = { bounds: this._calcBounds(leftGroup), children: leftGroup, leaf: true };
    const rightNode = { bounds: this._calcBounds(rightGroup), children: rightGroup, leaf: true };

    node.children = [leftNode, rightNode];
  }

  _calcBounds(group) {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const g of group) {
      this._expandBounds(bounds, g.bounds);
    }
    return bounds;
  }

  search(queryBounds) {
    const results = [];
    this._searchNode(this.root, queryBounds, results);
    return results;
  }

  _searchNode(node, queryBounds, results) {
    if (!boundsOverlap(node.bounds, queryBounds)) return;
    if (node.leaf) {
      for (const child of node.children) {
        if (boundsOverlap(child.bounds, queryBounds)) {
          results.push(child.item);
        }
      }
    } else {
      for (const child of node.children) {
        this._searchNode(child, queryBounds, results);
      }
    }
  }

  /**
   * Fast setback violation evaluation for a given room polygon.
   * Returns array of violations if room extends into setback buffer or outside buildable polygon.
   */
  querySetbackViolations(roomPoly) {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let pts = [];
    if (Array.isArray(roomPoly)) {
      pts = roomPoly;
    } else if (roomPoly && typeof roomPoly === 'object') {
      const x = roomPoly.x ?? 0;
      const y = roomPoly.y ?? 0;
      const w = roomPoly.w ?? 0;
      const h = roomPoly.h ?? 0;
      pts = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    }

    if (!pts.length) return [];

    const roomBounds = getBounds(pts);
    const searchCandidates = this.search(roomBounds);
    if (searchCandidates.length === 0) {
      const duration =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      if (duration > 5) {
        console.warn(
          `[GISBridge] Spatial query execution exceeded target time: ${duration.toFixed(2)}ms`
        );
      }
      return [];
    }
    const violations = [];

    const isSetbackItem = (cand) =>
      cand &&
      (cand.type === 'setbackBuffer' ||
        cand.type === 'gisSetbackBuffer' ||
        cand.layerType === 'gisSetbackBuffer');
    const isLotItem = (cand) =>
      cand &&
      (cand.type === 'lotLine' || cand.type === 'gisLotLine' || cand.layerType === 'gisLotLine');

    const setbackCandidates = searchCandidates.filter(isSetbackItem);
    const lotCandidates = searchCandidates.filter(isLotItem);

    const buildableRings = [];
    const seenBuildable = new Set();
    for (const cand of setbackCandidates) {
      if (Array.isArray(cand.rings) && cand.rings.length > 0) {
        for (const ring of cand.rings) {
          const ringInner = ring.innerPoints || ring.innerPolygon;
          if (ringInner && ringInner.length >= 3 && !seenBuildable.has(ringInner)) {
            seenBuildable.add(ringInner);
            buildableRings.push({ id: ring.id || cand.id, innerPoly: ringInner });
          }
        }
      } else {
        const innerPoly = cand.innerPoints || cand.innerPolygon;
        if (innerPoly && innerPoly.length >= 3) {
          if (!seenBuildable.has(innerPoly)) {
            seenBuildable.add(innerPoly);
            buildableRings.push({ id: cand.id, innerPoly });
          }
        } else if (cand.polygon && cand.polygon.length >= 3) {
          for (const pt of pts) {
            if (pointInPolygon(pt, cand.polygon)) {
              violations.push({
                type: 'setback-clearance',
                featureId: cand.id,
                msg: 'Room overlaps restricted GIS setback zone.',
              });
              break;
            }
          }
        }
      }
    }

    if (buildableRings.length > 0) {
      const insideAnyBuildable = buildableRings.some(({ innerPoly }) =>
        pts.every((pt) => pointInPolygon(pt, innerPoly))
      );
      if (!insideAnyBuildable) {
        violations.push({
          type: 'setback-clearance',
          featureId: buildableRings[0].id,
          msg: 'Room vertex extends into setback buffer zone.',
        });
      }
    }

    const validLotRings = [];
    const seenLot = new Set();
    for (const cand of lotCandidates) {
      if (Array.isArray(cand.rings) && cand.rings.length > 0) {
        for (const ring of cand.rings) {
          const ringPoly = ring.points || ring.polygon;
          if (ringPoly && ringPoly.length >= 3 && !seenLot.has(ringPoly)) {
            seenLot.add(ringPoly);
            validLotRings.push({ id: ring.id || cand.id, lotPoly: ringPoly });
          }
        }
      } else {
        const lotPoly = cand.points || cand.polygon;
        if (lotPoly && lotPoly.length >= 3 && !seenLot.has(lotPoly)) {
          seenLot.add(lotPoly);
          validLotRings.push({ id: cand.id, lotPoly });
        }
      }
    }

    if (validLotRings.length > 0) {
      const insideAnyLot = validLotRings.some(({ lotPoly }) =>
        pts.every((pt) => pointInPolygon(pt, lotPoly))
      );
      if (!insideAnyLot) {
        violations.push({
          type: 'lot-boundary-exceeded',
          featureId: validLotRings[0].id,
          msg: 'Room extends outside property lot boundary.',
        });
      }
    }

    const duration =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    if (duration > 5) {
      console.warn(
        `[GISBridge] Spatial query execution exceeded target time: ${duration.toFixed(2)}ms`
      );
    }

    return violations;
  }
}

function normalizeOriginObject(origin) {
  if (!origin) return null;
  if (Array.isArray(origin) && origin.length >= 2) {
    const lon = Number(origin[0]);
    const lat = Number(origin[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      return { longitude: lon, latitude: lat };
    }
  }
  if (typeof origin === 'object') {
    const lon = Number(origin.longitude ?? origin.lon ?? origin.x);
    const lat = Number(origin.latitude ?? origin.lat ?? origin.y);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      return { longitude: lon, latitude: lat };
    }
  }
  return null;
}

/**
 * Coordinate projection converting GeoJSON to plan canvas coordinates (inches).
 */
export function projectGeoJSON(geojson, targetBounds = null, options = {}) {
  if (!geojson || typeof geojson !== 'object') {
    return {
      crs: options.crs || 'EPSG:4326',
      origin: normalizeOriginObject(options.origin) || { longitude: -122.4194, latitude: 37.7749 },
      features: [],
      segments: [],
      layers: [],
    };
  }

  const rawTargetCRS = options.crs || geojson.crs?.properties?.name || 'EPSG:4326';
  const crs = normalizeCode(rawTargetCRS) || rawTargetCRS;
  const rawSourceCRS = options.sourceCRS || geojson.crs?.properties?.name || crs;
  const sourceCRS = normalizeCode(rawSourceCRS) || rawSourceCRS;
  const shouldFitBounds = Boolean(targetBounds || options.targetBounds || options.fitToBounds);
  const bounds = targetBounds || options.targetBounds || { x: 100, y: 100, w: 1000, h: 800 };

  let rawFeatures = [];
  if (geojson.type === 'FeatureCollection') {
    rawFeatures = geojson.features || [];
  } else if (geojson.type === 'Feature') {
    rawFeatures = [geojson];
  } else if (
    ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString', 'Point', 'MultiPoint'].includes(
      geojson.type
    )
  ) {
    rawFeatures = [{ type: 'Feature', geometry: geojson, properties: {} }];
  }

  const filterValidCoords = (arr) =>
    Array.isArray(arr)
      ? arr.filter(
          (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
        )
      : [];

  const hasValidRawPolygonRing = (rawRing) => {
    const validCoords = filterValidCoords(rawRing);
    if (validCoords.length < 3) return false;
    const first = validCoords[0];
    const last = validCoords[validCoords.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1];
    const distinctCount = isClosed ? validCoords.length - 1 : validCoords.length;
    return distinctCount >= 3;
  };

  const isValidProjectedRing = (ring) => {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    const isClosed = first.x === last.x && first.y === last.y;
    const distinctCount = isClosed ? ring.length - 1 : ring.length;
    return distinctCount >= 3;
  };

  // Helper to extract raw coordinates
  const extractCoords = (geom) => {
    const coords = [];
    if (!geom || !Array.isArray(geom.coordinates)) return coords;
    if (geom.type === 'Point') {
      if (
        geom.coordinates.length >= 2 &&
        Number.isFinite(geom.coordinates[0]) &&
        Number.isFinite(geom.coordinates[1])
      ) {
        coords.push(geom.coordinates);
      }
    } else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
      coords.push(...filterValidCoords(geom.coordinates));
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        coords.push(...filterValidCoords(line));
      }
    } else if (geom.type === 'Polygon') {
      const outerRing = geom.coordinates[0];
      if (hasValidRawPolygonRing(outerRing)) {
        coords.push(...filterValidCoords(outerRing));
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (!Array.isArray(poly) || poly.length === 0) continue;
        const outerRing = poly[0];
        if (hasValidRawPolygonRing(outerRing)) {
          coords.push(...filterValidCoords(outerRing));
        }
      }
    }
    return coords;
  };

  const allCoords = [];
  for (const feat of rawFeatures) {
    if (feat?.geometry) {
      allCoords.push(...extractCoords(feat.geometry));
    }
  }

  if (!allCoords.length) {
    return {
      crs,
      origin: normalizeOriginObject(options.origin) || { longitude: -122.4194, latitude: 37.7749 },
      features: [],
      segments: [],
      layers: [],
    };
  }

  // Compute WGS84 parcel centroid (or honor explicit options.origin)
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const c of allCoords) {
    const wgs = sourceCRS === 'EPSG:4326' ? c : reproject(c, sourceCRS, 'EPSG:4326');
    if (Array.isArray(wgs) && Number.isFinite(wgs[0]) && Number.isFinite(wgs[1])) {
      if (wgs[0] < minLon) minLon = wgs[0];
      if (wgs[1] < minLat) minLat = wgs[1];
      if (wgs[0] > maxLon) maxLon = wgs[0];
      if (wgs[1] > maxLat) maxLat = wgs[1];
    }
  }

  const explicitOrigin = normalizeOriginObject(options.origin);
  const originObj =
    explicitOrigin ||
    (Number.isFinite(minLon) && Number.isFinite(minLat)
      ? { longitude: (minLon + maxLon) / 2, latitude: (minLat + maxLat) / 2 }
      : { longitude: -122.4194, latitude: 37.7749 });
  const planTarget = { epsg: 'PLAN', origin: [originObj.longitude, originObj.latitude] };

  const toTargetCRSCoord = (c) => {
    if (sourceCRS === crs) return [...c];
    const conv = reproject(c, sourceCRS, crs);
    return Array.isArray(conv) ? conv : [...c];
  };

  let transformCoord;
  if (shouldFitBounds) {
    // Legacy opt-in targetBounds normalization
    const projectPoint = (c) => {
      const wgs84 = sourceCRS === 'EPSG:4326' ? c : reproject(c, sourceCRS, 'EPSG:4326');
      const lon = wgs84[0];
      const lat = wgs84[1];

      if (isNaN(lon) || isNaN(lat)) {
        return { px: 0, py: 0 };
      }

      if (sourceCRS === 'EPSG:3857') {
        return { px: lon, py: lat };
      }

      const clampedLat = Math.max(-89.9, Math.min(89.9, lat));
      const rad = (clampedLat * Math.PI) / 180;
      const px = lon * 111319.49;
      const py = Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 6378137;

      return {
        px: isNaN(px) ? lon : px,
        py: isNaN(py) ? lat : py,
      };
    };

    const planarCoords = allCoords.map(projectPoint);
    let minPx = Infinity,
      minPy = Infinity,
      maxPx = -Infinity,
      maxPy = -Infinity;
    for (const p of planarCoords) {
      if (p.px < minPx) minPx = p.px;
      if (p.py < minPy) minPy = p.py;
      if (p.px > maxPx) maxPx = p.px;
      if (p.py > maxPy) maxPy = p.py;
    }

    const rangeX = maxPx - minPx || 1;
    const rangeY = maxPy - minPy || 1;

    const scale = Math.min(bounds.w / rangeX, bounds.h / rangeY);
    const offsetX = bounds.x + (bounds.w - rangeX * scale) / 2;
    const offsetY = bounds.y + (bounds.h - rangeY * scale) / 2;

    transformCoord = (cSource) => {
      const p = projectPoint(cSource);
      const x = offsetX + (p.px - minPx) * scale;
      const y = offsetY + (maxPy - p.py) * scale;
      return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    };
  } else {
    // Unified ground-scale projection via reproject anchored at planTarget.origin
    transformCoord = (_cSource, cTarget) => {
      const pt = reproject(cTarget, crs, planTarget);
      const x = Array.isArray(pt) && Number.isFinite(pt[0]) ? pt[0] : 0;
      const y = Array.isArray(pt) && Number.isFinite(pt[1]) ? pt[1] : 0;
      return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    };
  }

  const ensureClosedRawRing = (coords) => {
    if (coords.length < 3) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return coords;
    return [...coords, [...first]];
  };

  const buildPolygonComponent = (rawPolyRings) => {
    if (!Array.isArray(rawPolyRings) || !hasValidRawPolygonRing(rawPolyRings[0])) return null;
    const targetRings = [];
    const projectedRings = [];
    for (let rIdx = 0; rIdx < rawPolyRings.length; rIdx++) {
      const validRaw = filterValidCoords(rawPolyRings[rIdx]);
      if (rIdx === 0 && validRaw.length < 3) return null;
      if (validRaw.length < 3) continue;
      const targetCoords = validRaw.map(toTargetCRSCoord);
      const projPts = validRaw.map((c, idx) => transformCoord(c, targetCoords[idx]));
      targetRings.push(ensureClosedRawRing(targetCoords));
      projectedRings.push(projPts);
    }
    if (!projectedRings.length || !isValidProjectedRing(projectedRings[0])) return null;
    return {
      ring: projectedRings[0],
      geometry: {
        type: 'Polygon',
        coordinates: targetRings,
      },
      isClosed: true,
    };
  };

  const buildLineComponent = (rawLineCoords) => {
    const validRaw = filterValidCoords(rawLineCoords);
    if (validRaw.length < 2) return null;
    const targetCoords = validRaw.map(toTargetCRSCoord);
    const projPts = validRaw.map((c, idx) => transformCoord(c, targetCoords[idx]));
    if (projPts.length < 2) return null;
    const first = projPts[0];
    const last = projPts[projPts.length - 1];
    const isClosed = projPts.length >= 4 && first.x === last.x && first.y === last.y;
    return {
      ring: projPts,
      geometry: {
        type: 'LineString',
        coordinates: targetCoords,
      },
      isClosed,
    };
  };

  const existingSetbackMap = new Map();
  if (Array.isArray(options.existingSegments)) {
    for (const seg of options.existingSegments) {
      if (!seg) continue;
      if (seg.ringId !== undefined && seg.edgeIndex !== undefined) {
        existingSetbackMap.set(`${seg.ringId}:${seg.edgeIndex}`, seg);
      }
      if (seg.id) {
        existingSetbackMap.set(`id:${seg.id}`, seg);
      }
    }
  }

  const transformedFeatures = [];
  const segments = [];
  const layers = [];
  let nextSegId = 1;
  let nextFeatId = 1;

  for (const feat of rawFeatures) {
    const geom = feat?.geometry;
    if (!geom || !Array.isArray(geom.coordinates)) continue;

    const baseId = feat.id || `feat-${nextFeatId++}`;
    const parentId = feat.parentId || baseId;
    const sourceGeometryType = feat.sourceGeometryType || geom.type;
    const layerKind =
      feat.layerKind ||
      feat.properties?.layer ||
      feat.properties?.type ||
      (geom.type.includes('Polygon') ? 'lot' : 'easement');
    const components = [];

    if (geom.type === 'Polygon') {
      const comp = buildPolygonComponent(geom.coordinates);
      if (comp) components.push(comp);
    } else if (geom.type === 'MultiPolygon') {
      for (const polyCoords of geom.coordinates) {
        if (!Array.isArray(polyCoords) || polyCoords.length === 0) continue;
        const comp = buildPolygonComponent(polyCoords);
        if (comp) components.push(comp);
      }
    } else if (geom.type === 'LineString') {
      const comp = buildLineComponent(geom.coordinates);
      if (comp) components.push(comp);
    } else if (geom.type === 'MultiLineString') {
      for (const lineCoords of geom.coordinates) {
        if (!Array.isArray(lineCoords) || lineCoords.length === 0) continue;
        const comp = buildLineComponent(lineCoords);
        if (comp) components.push(comp);
      }
    }

    const isDecomposedMulti = geom.type === 'MultiPolygon' || geom.type === 'MultiLineString';

    for (let idx = 0; idx < components.length; idx++) {
      const { ring, geometry, isClosed } = components[idx];
      const componentId = isDecomposedMulti ? `${baseId}-${idx}` : baseId;
      const componentIndex = isDecomposedMulti ? idx : (feat.componentIndex ?? idx);

      transformedFeatures.push({
        type: 'Feature',
        id: componentId,
        parentId,
        componentIndex,
        sourceGeometryType,
        properties: feat.properties ? { ...feat.properties } : {},
        geometry,
        layerKind,
        points: ring,
      });

      if (layerKind === 'lot' && geometry.type === 'Polygon' && isValidProjectedRing(ring)) {
        // Extract segments independently for each closed component ring
        const n = ring.length;
        const ringClosed = ring[0].x === ring[n - 1].x && ring[0].y === ring[n - 1].y;
        const segCount = ringClosed ? n - 1 : n;
        const ringSegments = [];

        for (let i = 0; i < segCount; i++) {
          const p1 = ring[i];
          const p2 = ring[(i + 1) % segCount];
          if (p1.x === p2.x && p1.y === p2.y) continue;
          ringSegments.push({ p1, p2, edgeIndex: i });
        }

        if (ringSegments.length >= 3) {
          const defaultSetback = feat.properties?.setback ?? options.defaultSetback ?? 36;
          for (const { p1, p2, edgeIndex } of ringSegments) {
            const segId = `seg-${nextSegId++}`;
            const prevSeg =
              existingSetbackMap.get(`${componentId}:${edgeIndex}`) ||
              existingSetbackMap.get(`id:${segId}`);
            segments.push({
              id: segId,
              ringId: componentId,
              edgeIndex,
              p1,
              p2,
              pts: [p1, p2],
              setback: prevSeg?.setback ?? defaultSetback,
              label: prevSeg?.label || feat.properties?.name || `Lot Edge ${edgeIndex + 1}`,
            });
          }
        }
      } else {
        // Track closed state for non-lot features on transformed entry
        transformedFeatures[transformedFeatures.length - 1].closed = isClosed;
      }
    }
  }

  // Compute initial variable setback buffers if lot segments exist
  let setbackBufferResult = null;
  if (segments.length >= 3) {
    setbackBufferResult = computeVariableBuffers(segments);
  }

  // Register layers for compliance overlay (one independent layer per component ring/line)
  for (const feat of transformedFeatures) {
    const type = feat.layerKind === 'easement' ? 'gisEasement' : 'gisLotLine';
    const isClosed =
      feat.geometry?.type === 'Polygon' ? true : feat.closed !== undefined ? feat.closed : false;
    layers.push({
      id: feat.id,
      parentId: feat.parentId,
      componentIndex: feat.componentIndex,
      type,
      closed: isClosed,
      name: feat.properties.name || (type === 'gisLotLine' ? 'Lot Boundary' : 'Easement'),
      points: feat.points,
      bounds: getBounds(feat.points),
    });
  }

  if (setbackBufferResult && setbackBufferResult.rings.length > 0) {
    layers.push(...setbackBufferResult.rings);
  }

  return {
    crs,
    origin: originObj,
    features: transformedFeatures,
    segments,
    layers,
  };
}

/**
 * Groups lot line segments into closed component ring loops.
 */
function groupSegmentsByRingLoop(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const hasExplicitRingIds = segments.some((s) => s && s.ringId !== undefined && s.ringId !== null);
  if (hasExplicitRingIds) {
    const byRing = new Map();
    const ungrouped = [];
    for (const seg of segments) {
      if (!seg || !seg.p1 || !seg.p2) continue;
      if (seg.ringId !== undefined && seg.ringId !== null) {
        if (!byRing.has(seg.ringId)) byRing.set(seg.ringId, []);
        byRing.get(seg.ringId).push(seg);
      } else {
        ungrouped.push(seg);
      }
    }
    const groups = Array.from(byRing.entries()).map(([ringId, ringSegs]) => ({
      ringId,
      segments: ringSegs,
    }));
    if (ungrouped.length > 0) {
      groups.push(...groupSegmentsByRingLoop(ungrouped));
    }
    return groups;
  }

  const ptsEqual = (a, b, eps = 1e-4) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

  const loops = [];
  let current = [];

  for (const seg of segments) {
    if (!seg || !seg.p1 || !seg.p2) continue;
    if (current.length === 0) {
      current.push(seg);
      continue;
    }

    const prev = current[current.length - 1];
    if (ptsEqual(prev.p2, seg.p1)) {
      current.push(seg);
      if (current.length >= 3 && ptsEqual(seg.p2, current[0].p1)) {
        loops.push({ ringId: null, segments: current });
        current = [];
      }
    } else {
      loops.push({ ringId: null, segments: current });
      current = [seg];
    }
  }

  if (current.length > 0) {
    loops.push({ ringId: null, segments: current });
  }

  return loops;
}

/**
 * Computes inner buildable setback polygon for a single closed ring loop of segments.
 */
function computeSingleRingBuffer(ringSegments, layerId, ringId = null) {
  const outerPoints = ringSegments.map((s) => s.p1);
  const isCCW = polygonArea(outerPoints, true) > 0;

  const offsetLines = ringSegments.map((s) => {
    const p1 = s.p1;
    const p2 = s.p2;
    const setback = s.setback ?? 36;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;

    // Normal vector pointing inward:
    // For CCW polygon, inward normal is (-dy/len, dx/len)
    // For CW polygon, inward normal is (dy/len, -dx/len)
    const nx = isCCW ? -dy / len : dy / len;
    const ny = isCCW ? dx / len : -dx / len;

    const offP1 = { x: p1.x + nx * setback, y: p1.y + ny * setback };
    const offP2 = { x: p2.x + nx * setback, y: p2.y + ny * setback };

    return { offP1, offP2, segment: s };
  });

  const innerPoints = [];
  const n = offsetLines.length;
  for (let i = 0; i < n; i++) {
    const prev = offsetLines[(i + n - 1) % n];
    const curr = offsetLines[i];

    const inter = lineIntersection(prev.offP1, prev.offP2, curr.offP1, curr.offP2);
    if (inter) {
      innerPoints.push({ x: Math.round(inter.x * 100) / 100, y: Math.round(inter.y * 100) / 100 });
    } else {
      innerPoints.push({
        x: Math.round(curr.offP1.x * 100) / 100,
        y: Math.round(curr.offP1.y * 100) / 100,
      });
    }
  }

  const layer = {
    id: layerId,
    type: 'gisSetbackBuffer',
    name: 'Setback Buffer',
    points: outerPoints,
    innerPoints,
    bounds: getBounds([...outerPoints, ...innerPoints]),
  };
  if (ringId !== null && ringId !== undefined) {
    layer.ringId = ringId;
  }
  return layer;
}

/**
 * Computes variable setback buffers based on edge-specific segment setback distances,
 * grouping segments by closed ring loop so MultiPolygon lots produce clean per-ring buffers.
 */
export function computeVariableBuffers(segments) {
  const emptyResult = {
    id: 'setback-buffer',
    type: 'gisSetbackBuffer',
    name: 'Setback Buffer',
    points: [],
    innerPoints: [],
    rings: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };

  if (!segments || segments.length < 3) {
    return emptyResult;
  }

  const validLoops = groupSegmentsByRingLoop(segments).filter(
    (loop) => loop.segments && loop.segments.length >= 3
  );
  if (validLoops.length === 0) {
    return emptyResult;
  }

  const ringBuffers = validLoops.map((loop, idx) => {
    const layerId = validLoops.length === 1 ? 'setback-buffer' : `setback-buffer-${idx}`;
    return computeSingleRingBuffer(loop.segments, layerId, loop.ringId);
  });

  if (ringBuffers.length === 1) {
    return {
      ...ringBuffers[0],
      id: 'setback-buffer',
      rings: ringBuffers,
    };
  }

  const allOuterPoints = ringBuffers.flatMap((r) => r.points);
  const allInnerPoints = ringBuffers.flatMap((r) => r.innerPoints);

  return {
    id: 'setback-buffer',
    type: 'gisSetbackBuffer',
    name: 'Setback Buffer',
    points: allOuterPoints,
    innerPoints: allInnerPoints,
    rings: ringBuffers,
    bounds: getBounds([...allOuterPoints, ...allInnerPoints]),
  };
}

/**
 * Builds SpatialRTree populated with site features, lot lines, setback buffers, and easements.
 */
export function buildSpatialIndex(siteOrFeatures) {
  const tree = new SpatialRTree();
  let layers = [];

  if (siteOrFeatures && siteOrFeatures.layers) {
    layers = siteOrFeatures.layers;
  } else if (Array.isArray(siteOrFeatures)) {
    layers = siteOrFeatures;
  }

  const lotGroups = new Map();
  const setbackByRingId = new Map();

  for (const layer of layers) {
    const bounds = layer.bounds || getBounds(layer.points || layer.innerPoints || []);
    tree.insert(layer, bounds);

    if (layer && layer.type === 'gisLotLine' && layer.parentId) {
      if (!lotGroups.has(layer.parentId)) lotGroups.set(layer.parentId, []);
      lotGroups.get(layer.parentId).push({ layer, bounds });
    } else if (layer && layer.type === 'gisSetbackBuffer' && layer.ringId) {
      setbackByRingId.set(layer.ringId, { layer, bounds });
    }
  }

  for (const [parentId, entries] of lotGroups.entries()) {
    if (entries.length > 1) {
      const unionLotBounds = {
        minX: Math.min(...entries.map((e) => e.bounds.minX)),
        minY: Math.min(...entries.map((e) => e.bounds.minY)),
        maxX: Math.max(...entries.map((e) => e.bounds.maxX)),
        maxY: Math.max(...entries.map((e) => e.bounds.maxY)),
      };
      tree.insert(
        {
          id: parentId,
          type: 'gisLotLine',
          rings: entries.map((e) => e.layer),
        },
        unionLotBounds
      );

      const setbackEntries = entries.map((e) => setbackByRingId.get(e.layer.id)).filter(Boolean);
      if (setbackEntries.length > 0) {
        const unionSetbackBounds = {
          minX: Math.min(...setbackEntries.map((e) => e.bounds.minX)),
          minY: Math.min(...setbackEntries.map((e) => e.bounds.minY)),
          maxX: Math.max(...setbackEntries.map((e) => e.bounds.maxX)),
          maxY: Math.max(...setbackEntries.map((e) => e.bounds.maxY)),
        };
        tree.insert(
          {
            id: `${parentId}-setback-buffer`,
            type: 'gisSetbackBuffer',
            rings: setbackEntries.map((e) => e.layer),
          },
          unionSetbackBounds
        );
      }
    }
  }

  return tree;
}

/**
 * Ensures state.site has a populated spatialIndex.
 */
export function ensureSpatialIndex(site) {
  if (!site) return null;
  if (!site.spatialIndex || typeof site.spatialIndex.querySetbackViolations !== 'function') {
    site.spatialIndex = buildSpatialIndex(site);
  }
  return site.spatialIndex;
}

export function getBounds3D(pts) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  const list = Array.isArray(pts) ? pts : pts.points || pts.vertices || pts.triangle || [pts];
  for (const p of list) {
    const x = p.x ?? p[0] ?? 0;
    const y = p.y ?? p[1] ?? 0;
    const z = p.z ?? p[2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function boundsOverlap3D(a, b, eps = 0.001) {
  return (
    a.minX < b.maxX + eps &&
    a.maxX > b.minX - eps &&
    a.minY < b.maxY + eps &&
    a.maxY > b.minY - eps &&
    a.minZ < b.maxZ + eps &&
    a.maxZ > b.minZ - eps
  );
}

function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function triangleTriangleIntersect(t1, t2) {
  const b1 = getBounds3D(t1);
  const b2 = getBounds3D(t2);
  if (!boundsOverlap3D(b1, b2)) return false;

  const n1 = cross3(sub3(t1[1], t1[0]), sub3(t1[2], t1[0]));
  const d1 = -dot3(n1, t1[0]);

  const d2_0 = dot3(n1, t2[0]) + d1;
  const d2_1 = dot3(n1, t2[1]) + d1;
  const d2_2 = dot3(n1, t2[2]) + d1;

  if (
    (d2_0 > 1e-5 && d2_1 > 1e-5 && d2_2 > 1e-5) ||
    (d2_0 < -1e-5 && d2_1 < -1e-5 && d2_2 < -1e-5)
  ) {
    return false;
  }

  const n2 = cross3(sub3(t2[1], t2[0]), sub3(t2[2], t2[0]));
  const d2 = -dot3(n2, t2[0]);

  const d1_0 = dot3(n2, t1[0]) + d2;
  const d1_1 = dot3(n2, t1[1]) + d2;
  const d1_2 = dot3(n2, t1[2]) + d2;

  if (
    (d1_0 > 1e-5 && d1_1 > 1e-5 && d1_2 > 1e-5) ||
    (d1_0 < -1e-5 && d1_1 < -1e-5 && d1_2 < -1e-5)
  ) {
    return false;
  }

  const lineDir = cross3(n1, n2);
  const len = Math.hypot(lineDir.x, lineDir.y, lineDir.z);
  if (len < 1e-6) {
    return boundsOverlap3D(b1, b2);
  }

  function computeInterval(t, distances) {
    const proj = [dot3(t[0], lineDir), dot3(t[1], lineDir), dot3(t[2], lineDir)];
    const pointsOnLine = [];
    const edges = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    for (const [i, j] of edges) {
      const di = distances[i];
      const dj = distances[j];
      if (Math.abs(di) < 1e-6 && Math.abs(dj) < 1e-6) {
        pointsOnLine.push(proj[i], proj[j]);
      } else if (di * dj <= 0 && Math.abs(di - dj) > 1e-6) {
        const alpha = di / (di - dj);
        pointsOnLine.push(proj[i] + alpha * (proj[j] - proj[i]));
      }
    }
    if (pointsOnLine.length === 0) return [0, 0];
    return [Math.min(...pointsOnLine), Math.max(...pointsOnLine)];
  }

  const int1 = computeInterval(t1, [d1_0, d1_1, d1_2]);
  const int2 = computeInterval(t2, [d2_0, d2_1, d2_2]);

  return Math.max(int1[0], int2[0]) <= Math.min(int1[1], int2[1]) + 1e-5;
}

export class SpatialBVH3D {
  constructor(maxEntries = 8) {
    this.maxEntries = maxEntries;
    this.root = {
      bounds: {
        minX: Infinity,
        minY: Infinity,
        minZ: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        maxZ: -Infinity,
      },
      children: [],
      leaf: true,
    };
    this.items = [];
  }

  insert(item, bounds3D) {
    const bounds =
      bounds3D ||
      getBounds3D(item.triangle || item.points || item.vertices || item.vertices3D || item);
    const nodeItem = { item, bounds };
    this.items.push(nodeItem);
    this._insertNode(this.root, nodeItem);
  }

  _insertNode(node, entry) {
    this._expandBounds(node.bounds, entry.bounds);
    if (node.leaf) {
      node.children.push(entry);
      if (node.children.length > this.maxEntries) {
        this._split(node);
      }
    } else {
      let bestChild = node.children[0];
      let minVolume = Infinity;
      for (const child of node.children) {
        const vol = this._expansionVolume(child.bounds, entry.bounds);
        if (vol < minVolume) {
          minVolume = vol;
          bestChild = child;
        }
      }
      this._insertNode(bestChild, entry);
    }
  }

  _expandBounds(target, addition) {
    target.minX = Math.min(target.minX, addition.minX);
    target.minY = Math.min(target.minY, addition.minY);
    target.minZ = Math.min(target.minZ, addition.minZ);
    target.maxX = Math.max(target.maxX, addition.maxX);
    target.maxY = Math.max(target.maxY, addition.maxY);
    target.maxZ = Math.max(target.maxZ, addition.maxZ);
  }

  _expansionVolume(b, addition) {
    const minX = Math.min(b.minX, addition.minX);
    const minY = Math.min(b.minY, addition.minY);
    const minZ = Math.min(b.minZ, addition.minZ);
    const maxX = Math.max(b.maxX, addition.maxX);
    const maxY = Math.max(b.maxY, addition.maxY);
    const maxZ = Math.max(b.maxZ, addition.maxZ);
    const currVol = (b.maxX - b.minX) * (b.maxY - b.minY) * (b.maxZ - b.minZ);
    const newVol = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
    return newVol - currVol;
  }

  _split(node) {
    const children = node.children.slice();
    node.children = [];
    node.leaf = false;

    const dx = node.bounds.maxX - node.bounds.minX;
    const dy = node.bounds.maxY - node.bounds.minY;
    const dz = node.bounds.maxZ - node.bounds.minZ;

    if (dx >= dy && dx >= dz) {
      children.sort((a, b) => a.bounds.minX + a.bounds.maxX - (b.bounds.minX + b.bounds.maxX));
    } else if (dy >= dx && dy >= dz) {
      children.sort((a, b) => a.bounds.minY + a.bounds.maxY - (b.bounds.minY + b.bounds.maxY));
    } else {
      children.sort((a, b) => a.bounds.minZ + a.bounds.maxZ - (b.bounds.minZ + b.bounds.maxZ));
    }

    const mid = Math.floor(children.length / 2);
    const leftGroup = children.slice(0, mid);
    const rightGroup = children.slice(mid);

    const leftNode = { bounds: this._calcBounds(leftGroup), children: leftGroup, leaf: true };
    const rightNode = { bounds: this._calcBounds(rightGroup), children: rightGroup, leaf: true };

    node.children = [leftNode, rightNode];
  }

  _calcBounds(group) {
    const bounds = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    };
    for (const g of group) {
      this._expandBounds(bounds, g.bounds);
    }
    return bounds;
  }

  search(queryBounds3D) {
    const results = [];
    this._searchNode(this.root, queryBounds3D, results);
    return results;
  }

  _searchNode(node, queryBounds3D, results) {
    if (!boundsOverlap3D(node.bounds, queryBounds3D)) return;
    if (node.leaf) {
      for (const child of node.children) {
        if (boundsOverlap3D(child.bounds, queryBounds3D)) {
          results.push(child.item);
        }
      }
    } else {
      for (const child of node.children) {
        this._searchNode(child, queryBounds3D, results);
      }
    }
  }

  queryTriangleIntersections(trianglePoints) {
    const queryBounds = getBounds3D(trianglePoints);
    const candidates = this.search(queryBounds);
    const intersections = [];
    for (const item of candidates) {
      const itemTris = item.triangle
        ? [item.triangle]
        : item.triangles || [item.points || item.vertices];
      for (const tri of itemTris) {
        if (tri && tri.length >= 3 && triangleTriangleIntersect(trianglePoints, tri)) {
          intersections.push({ item, triangle: tri });
          break;
        }
      }
    }
    return intersections;
  }

  queryTerrainCollisions(roomMesh, terrainMesh) {
    const collisions = [];
    if (!roomMesh || !terrainMesh) return collisions;

    const terrainTris = terrainMesh.triangles || [];
    const terrainVerts = terrainMesh.vertices || [];

    for (let i = 0; i < terrainTris.length; i++) {
      const triIndices = terrainTris[i];
      const triPoints = [
        terrainVerts[triIndices[0]],
        terrainVerts[triIndices[1]],
        terrainVerts[triIndices[2]],
      ];
      if (triPoints[0] && triPoints[1] && triPoints[2]) {
        this.insert(
          { type: 'terrainTriangle', triangle: triPoints, index: i },
          getBounds3D(triPoints)
        );
      }
    }

    const roomTris = roomMesh.triangles || [];
    const roomVerts = roomMesh.vertices || [];

    for (let i = 0; i < roomTris.length; i++) {
      const triIndices = roomTris[i];
      const triPoints = [
        roomVerts[triIndices[0]],
        roomVerts[triIndices[1]],
        roomVerts[triIndices[2]],
      ];
      if (triPoints[0] && triPoints[1] && triPoints[2]) {
        const hits = this.queryTriangleIntersections(triPoints);
        if (hits.length > 0) {
          collisions.push({ roomTriangleIndex: i, terrainHits: hits });
        }
      }
    }

    return collisions;
  }
}

/**
 * Subsystem controller class for GIS operations.
 */
export class GISBridge {
  constructor(siteState = null) {
    this.site = siteState || {
      crs: 'EPSG:4326',
      origin: { longitude: -122.4194, latitude: 37.7749 },
      features: [],
      segments: [],
      layers: [],
    };
    this.rebuildIndex();
  }

  importGeoJSON(geojson, options = {}) {
    const mergedOptions = {
      ...options,
      existingSegments:
        options.preserveSetbacks && Array.isArray(this.site?.segments)
          ? this.site.segments
          : options.existingSegments,
    };
    const projected = projectGeoJSON(geojson, options.targetBounds, mergedOptions);
    this.site.crs = projected.crs;
    this.site.origin = projected.origin;
    this.site.features = projected.features;
    this.site.segments = projected.segments;
    this.site.layers = projected.layers;
    this.rebuildIndex();
    return this.site;
  }

  setSegmentSetback(segmentId, setbackDistance) {
    const seg = this.site.segments.find((s) => s.id === segmentId);
    if (seg) {
      seg.setback = Math.max(0, Number(setbackDistance) || 0);

      // Recompute setback buffer layer(s) per ring loop
      const setbackResult = computeVariableBuffers(this.site.segments);
      this.site.layers = this.site.layers.filter((l) => l.type !== 'gisSetbackBuffer');
      if (setbackResult.rings && setbackResult.rings.length > 0) {
        this.site.layers.push(...setbackResult.rings);
      } else {
        this.site.layers.push(setbackResult);
      }

      this.rebuildIndex();
    }
    return this.site;
  }

  rebuildIndex() {
    this.site.spatialIndex = buildSpatialIndex(this.site);
  }

  querySetbackViolations(roomPoly) {
    ensureSpatialIndex(this.site);
    return this.site.spatialIndex.querySetbackViolations(roomPoly);
  }
}
