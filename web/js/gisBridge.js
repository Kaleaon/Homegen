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
    this._setbackItems = [];
    this._lotItems = [];
  }

  insert(item, bounds) {
    const nodeItem = { item, bounds };
    this.items.push(nodeItem);
    if (item && typeof item === 'object') {
      if (
        item.type === 'setbackBuffer' ||
        item.type === 'gisSetbackBuffer' ||
        item.layerType === 'gisSetbackBuffer'
      ) {
        this._setbackItems.push(item);
      } else if (
        item.type === 'lotLine' ||
        item.type === 'gisLotLine' ||
        item.layerType === 'gisLotLine'
      ) {
        this._lotItems.push(item);
      }
    }
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
    const violations = [];

    const isSetbackItem = (cand) =>
      cand &&
      (cand.type === 'setbackBuffer' ||
        cand.type === 'gisSetbackBuffer' ||
        cand.layerType === 'gisSetbackBuffer');
    const isLotItem = (cand) =>
      cand &&
      (cand.type === 'lotLine' || cand.type === 'gisLotLine' || cand.layerType === 'gisLotLine');

    let setbackCandidates = searchCandidates.filter(isSetbackItem);
    if (setbackCandidates.length === 0 && this._setbackItems.length > 0) {
      setbackCandidates = [this._setbackItems[0]];
    }

    let lotCandidates = searchCandidates.filter(isLotItem);
    if (lotCandidates.length === 0 && this._lotItems.length > 0) {
      lotCandidates = [this._lotItems[0]];
    }

    const buildableRings = [];
    for (const cand of setbackCandidates) {
      if (Array.isArray(cand.rings) && cand.rings.length > 0) {
        for (const ring of cand.rings) {
          const ringInner = ring.innerPoints || ring.innerPolygon;
          if (ringInner && ringInner.length >= 3) {
            buildableRings.push({ id: ring.id || cand.id, innerPoly: ringInner });
          }
        }
      } else {
        const innerPoly = cand.innerPoints || cand.innerPolygon;
        if (innerPoly && innerPoly.length >= 3) {
          buildableRings.push({ id: cand.id, innerPoly });
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
    for (const cand of lotCandidates) {
      const lotPoly = cand.points || cand.polygon;
      if (lotPoly && lotPoly.length >= 3) {
        validLotRings.push({ id: cand.id, lotPoly });
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

/**
 * Coordinate projection converting GeoJSON to plan canvas coordinates (inches).
 */
export function projectGeoJSON(geojson, targetBounds = null, options = {}) {
  const bounds = targetBounds || { x: 100, y: 100, w: 1000, h: 800 };
  const crs = options.crs || geojson.crs?.properties?.name || 'EPSG:4326';

  let rawFeatures = [];
  if (geojson.type === 'FeatureCollection') {
    rawFeatures = geojson.features || [];
  } else if (geojson.type === 'Feature') {
    rawFeatures = [geojson];
  } else if (
    geojson.type === 'Polygon' ||
    geojson.type === 'MultiPolygon' ||
    geojson.type === 'LineString'
  ) {
    rawFeatures = [{ type: 'Feature', geometry: geojson, properties: {} }];
  }

  const hasValidRawPolygonRing = (rawRing) => {
    if (!Array.isArray(rawRing) || rawRing.length < 3) return false;
    const validCoords = rawRing.filter(
      (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
    );
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
      if (geom.coordinates.length >= 2) coords.push(geom.coordinates);
    } else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
      coords.push(
        ...geom.coordinates.filter(
          (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
        )
      );
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates) {
        if (Array.isArray(line)) {
          coords.push(
            ...line.filter(
              (c) =>
                Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
            )
          );
        }
      }
    } else if (geom.type === 'Polygon') {
      const outerRing = geom.coordinates[0];
      if (hasValidRawPolygonRing(outerRing)) {
        coords.push(
          ...outerRing.filter(
            (c) =>
              Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
          )
        );
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (!Array.isArray(poly) || poly.length === 0) continue;
        const outerRing = poly[0];
        if (hasValidRawPolygonRing(outerRing)) {
          coords.push(
            ...outerRing.filter(
              (c) =>
                Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
            )
          );
        }
      }
    }
    return coords;
  };

  let allCoords = [];
  for (const feat of rawFeatures) {
    if (feat.geometry) {
      allCoords.push(...extractCoords(feat.geometry));
    }
  }

  if (!allCoords.length) {
    return { crs, features: [], segments: [], layers: [] };
  }

  const sourceCRS = crs;

  // Convert raw coords to WGS84 via reproject, then to planar metric/projected values
  const projectPoint = (c) => {
    const wgs84 = reproject(c, sourceCRS, 'EPSG:4326');
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

  // Scale to fit target bounds while maintaining aspect ratio
  const scale = Math.min(bounds.w / rangeX, bounds.h / rangeY);
  const offsetX = bounds.x + (bounds.w - rangeX * scale) / 2;
  const offsetY = bounds.y + (bounds.h - rangeY * scale) / 2;

  const transformCoord = (c) => {
    const p = projectPoint(c);
    const x = offsetX + (p.px - minPx) * scale;
    // Invert Y axis for screen space
    const y = offsetY + (maxPy - p.py) * scale;
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
  };

  const transformRings = (rings) =>
    rings.map((ring) =>
      Array.isArray(ring)
        ? ring
            .filter(
              (c) =>
                Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
            )
            .map(transformCoord)
        : []
    );

  const transformedFeatures = [];
  const segments = [];
  const layers = [];
  let nextSegId = 1;
  let nextFeatId = 1;

  for (const feat of rawFeatures) {
    const geom = feat?.geometry;
    if (!geom || !Array.isArray(geom.coordinates)) continue;

    const baseId = feat.id || `feat-${nextFeatId++}`;
    const layerKind =
      feat.properties?.layer ||
      feat.properties?.type ||
      (geom.type.includes('Polygon') ? 'lot' : 'easement');
    const componentRings = [];

    if (geom.type === 'Polygon') {
      const rings = transformRings(geom.coordinates);
      if (isValidProjectedRing(rings[0])) {
        componentRings.push(rings[0]);
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const polyCoords of geom.coordinates) {
        if (!Array.isArray(polyCoords) || polyCoords.length === 0) continue;
        const rings = transformRings(polyCoords);
        if (isValidProjectedRing(rings[0])) {
          componentRings.push(rings[0]);
        }
      }
    } else if (geom.type === 'LineString') {
      const linePoints = geom.coordinates
        .filter(
          (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
        )
        .map(transformCoord);
      if (linePoints.length >= 2) {
        componentRings.push(linePoints);
      }
    }

    for (let idx = 0; idx < componentRings.length; idx++) {
      const ring = componentRings[idx];
      const componentId = geom.type === 'MultiPolygon' ? `${baseId}-${idx}` : baseId;

      transformedFeatures.push({
        id: componentId,
        parentId: baseId,
        componentIndex: idx,
        properties: feat.properties || {},
        layerKind,
        points: ring,
      });

      if (layerKind === 'lot' && geom.type !== 'LineString' && isValidProjectedRing(ring)) {
        // Extract segments independently for each closed component ring
        const n = ring.length;
        const isClosed = ring[0].x === ring[n - 1].x && ring[0].y === ring[n - 1].y;
        const segCount = isClosed ? n - 1 : n;
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
            segments.push({
              id: `seg-${nextSegId++}`,
              ringId: componentId,
              p1,
              p2,
              setback: defaultSetback,
              label: feat.properties?.name || `Lot Edge ${edgeIndex + 1}`,
            });
          }
        }
      }
    }
  }

  // Compute initial variable setback buffers if lot segments exist
  let setbackBufferResult = null;
  if (segments.length >= 3) {
    setbackBufferResult = computeVariableBuffers(segments);
  }

  // Register layers for compliance overlay (one independent layer per component polygon ring)
  for (const feat of transformedFeatures) {
    const type = feat.layerKind === 'easement' ? 'gisEasement' : 'gisLotLine';
    layers.push({
      id: feat.id,
      parentId: feat.parentId,
      componentIndex: feat.componentIndex,
      type,
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

  for (const layer of layers) {
    const bounds = layer.bounds || getBounds(layer.points || layer.innerPoints || []);
    tree.insert(layer, bounds);
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
    this.site = siteState || { crs: 'EPSG:4326', features: [], segments: [], layers: [] };
    this.rebuildIndex();
  }

  importGeoJSON(geojson, options = {}) {
    const projected = projectGeoJSON(geojson, options.targetBounds, options);
    this.site.crs = projected.crs;
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
