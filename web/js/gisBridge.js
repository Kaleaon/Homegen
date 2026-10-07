/**
 * GIS Subsystem Bridge with Spatial R-Tree Indexing.
 * Manages EPSG coordinate transformations, spatial R-tree indexing,
 * variable segment setbacks, and site layer scene graph geometries.
 */

/**
 * 2D Minimum Bounding Rectangle helper.
 */
export function getBounds(pts) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  if (Array.isArray(pts)) {
    for (const p of pts) {
      const x = p.x !== undefined ? p.x : p[0];
      const y = p.y !== undefined ? p.y : p[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  } else if (pts && typeof pts === 'object') {
    minX = pts.x ?? pts.minX ?? 0;
    minY = pts.y ?? pts.minY ?? 0;
    maxX = pts.w !== undefined ? minX + pts.w : (pts.maxX ?? minX);
    maxY = pts.h !== undefined ? minY + pts.h : (pts.maxY ?? minY);
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOverlap(a, b, eps = 0.001) {
  return (
    a.minX < b.maxX + eps && a.maxX > b.minX - eps && a.minY < b.maxY + eps && a.maxY > b.minY - eps
  );
}

export function pointInPolygon(p, poly) {
  let inside = false;
  const px = p.x ?? p[0];
  const py = p.y ?? p[1];
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x ?? poly[i][0];
    const yi = poly[i].y ?? poly[i][1];
    const xj = poly[j].x ?? poly[j][0];
    const yj = poly[j].y ?? poly[j][1];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function lineIntersection(a1, a2, b1, b2) {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-9) return null;

  const t1 = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  return {
    x: a1.x + t1 * dx1,
    y: a1.y + t1 * dy1,
  };
}

export function polygonArea(poly) {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = poly[i];
    const pj = poly[j];
    area += pi.x * pj.y - pj.x * pi.y;
  }
  return area / 2;
}

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
    const candidates =
      searchCandidates.length > 0 ? searchCandidates : this.items.map((i) => i.item);
    const violations = [];

    for (const cand of candidates) {
      if (
        cand.type === 'setbackBuffer' ||
        cand.type === 'gisSetbackBuffer' ||
        cand.layerType === 'gisSetbackBuffer'
      ) {
        const innerPoly = cand.innerPoints || cand.innerPolygon;

        // Check if any room vertex lies outside inner buildable polygon or inside setback buffer
        if (innerPoly && innerPoly.length >= 3) {
          for (const pt of pts) {
            if (!pointInPolygon(pt, innerPoly)) {
              violations.push({
                type: 'setback-clearance',
                featureId: cand.id,
                msg: 'Room vertex extends into setback buffer zone.',
              });
              break;
            }
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
      } else if (
        cand.type === 'lotLine' ||
        cand.type === 'gisLotLine' ||
        cand.layerType === 'gisLotLine'
      ) {
        const lotPoly = cand.points || cand.polygon;
        if (lotPoly && lotPoly.length >= 3) {
          for (const pt of pts) {
            if (!pointInPolygon(pt, lotPoly)) {
              violations.push({
                type: 'lot-boundary-exceeded',
                featureId: cand.id,
                msg: 'Room extends outside property lot boundary.',
              });
              break;
            }
          }
        }
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

  // Helper to extract raw coordinates
  const extractCoords = (geom) => {
    const coords = [];
    if (geom.type === 'Point') {
      coords.push(geom.coordinates);
    } else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
      coords.push(...geom.coordinates);
    } else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') {
      for (const ring of geom.coordinates) {
        coords.push(...ring);
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        for (const ring of poly) {
          coords.push(...ring);
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

  // Convert raw coords to planar metric/projected values
  const projectPoint = (c) => {
    const lon = c[0];
    const lat = c[1];
    if (crs === 'EPSG:3857') {
      return { px: lon, py: lat };
    }
    // Default EPSG:4326 to Mercator meters or linear
    const rad = (lat * Math.PI) / 180;
    const px = lon * 111319.49;
    const py = Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 6378137;
    return { px, py };
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

  const transformRings = (rings) => rings.map((ring) => ring.map(transformCoord));

  const transformedFeatures = [];
  const segments = [];
  const layers = [];
  let nextSegId = 1;

  for (const feat of rawFeatures) {
    const geom = feat.geometry;
    if (!geom) continue;

    const layerKind =
      feat.properties?.layer ||
      feat.properties?.type ||
      (geom.type.includes('Polygon') ? 'lot' : 'easement');
    let points = [];

    if (geom.type === 'Polygon') {
      const rings = transformRings(geom.coordinates);
      points = rings[0] || [];
    } else if (geom.type === 'MultiPolygon') {
      for (const polyCoords of geom.coordinates) {
        const rings = transformRings(polyCoords);
        if (rings[0]) points.push(...rings[0]);
      }
    } else if (geom.type === 'LineString') {
      points = geom.coordinates.map(transformCoord);
    }

    if (points.length > 0) {
      transformedFeatures.push({
        id: feat.id || `feat-${transformedFeatures.length + 1}`,
        properties: feat.properties || {},
        layerKind,
        points,
      });

      if (layerKind === 'lot' && points.length >= 3) {
        // Extract segments for variable setback computation
        const n = points.length;
        const isClosed = points[0].x === points[n - 1].x && points[0].y === points[n - 1].y;
        const segCount = isClosed ? n - 1 : n;

        for (let i = 0; i < segCount; i++) {
          const p1 = points[i];
          const p2 = points[(i + 1) % n];
          const defaultSetback = feat.properties?.setback ?? options.defaultSetback ?? 36;
          segments.push({
            id: `seg-${nextSegId++}`,
            p1,
            p2,
            setback: defaultSetback,
            label: feat.properties?.name || `Lot Edge ${i + 1}`,
          });
        }
      }
    }
  }

  // Compute initial variable setback buffers if lot segments exist
  let setbackBufferLayer = null;
  if (segments.length >= 3) {
    setbackBufferLayer = computeVariableBuffers(segments);
  }

  // Register layers for compliance overlay
  for (const feat of transformedFeatures) {
    const type = feat.layerKind === 'easement' ? 'gisEasement' : 'gisLotLine';
    layers.push({
      id: feat.id,
      type,
      name: feat.properties.name || (type === 'gisLotLine' ? 'Lot Boundary' : 'Easement'),
      points: feat.points,
      bounds: getBounds(feat.points),
    });
  }

  if (setbackBufferLayer) {
    layers.push(setbackBufferLayer);
  }

  return {
    crs,
    features: transformedFeatures,
    segments,
    layers,
  };
}

/**
 * Computes variable setback buffers based on edge-specific segment setback distances.
 */
export function computeVariableBuffers(segments) {
  if (!segments || segments.length < 3) {
    return {
      id: 'setback-buffer',
      type: 'gisSetbackBuffer',
      name: 'Setback Buffer',
      points: [],
      innerPoints: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  // Construct outer polygon from segments
  const outerPoints = segments.map((s) => s.p1);
  const isCCW = polygonArea(outerPoints) > 0;

  // Compute offset lines for each segment
  const offsetLines = segments.map((s) => {
    const p1 = s.p1;
    const p2 = s.p2;
    const setback = s.setback ?? 36;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;

    // Normal vector pointing inward
    // For CCW polygon, inward normal is (-dy/len, dx/len)
    // For CW polygon, inward normal is (dy/len, -dx/len)
    const nx = isCCW ? -dy / len : dy / len;
    const ny = isCCW ? dx / len : -dx / len;

    const offP1 = { x: p1.x + nx * setback, y: p1.y + ny * setback };
    const offP2 = { x: p2.x + nx * setback, y: p2.y + ny * setback };

    return { offP1, offP2, segment: s };
  });

  // Calculate inner vertices by intersecting adjacent offset lines
  const innerPoints = [];
  const n = offsetLines.length;
  for (let i = 0; i < n; i++) {
    const prev = offsetLines[(i + n - 1) % n];
    const curr = offsetLines[i];

    const inter = lineIntersection(prev.offP1, prev.offP2, curr.offP1, curr.offP2);
    if (inter) {
      innerPoints.push({ x: Math.round(inter.x * 100) / 100, y: Math.round(inter.y * 100) / 100 });
    } else {
      innerPoints.push(curr.offP1);
    }
  }

  return {
    id: 'setback-buffer',
    type: 'gisSetbackBuffer',
    name: 'Setback Buffer',
    points: outerPoints,
    innerPoints,
    bounds: getBounds([...outerPoints, ...innerPoints]),
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

      // Recompute setback buffer layer
      const setbackLayer = computeVariableBuffers(this.site.segments);
      const existingIdx = this.site.layers.findIndex((l) => l.type === 'gisSetbackBuffer');
      if (existingIdx >= 0) {
        this.site.layers[existingIdx] = setbackLayer;
      } else {
        this.site.layers.push(setbackLayer);
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
