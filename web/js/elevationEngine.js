import { globalCadWorkerClient } from './cadWorkerClient.js';

/**
 * Client-side Elevation Engine
 * Standardizes heightmaps, Google Maps Elevation API JSON responses, and GeoTIFF datasets.
 * Computes topographic contour lines using Marching Squares (synchronously and asynchronously)
 * and provides serialization helpers for plan persistence.
 */

export class ElevationGrid {
  constructor({
    width = 0,
    height = 0,
    data = null,
    minElevation = 0,
    maxElevation = 10,
    bounds = null,
    contourInterval = 1.0,
    verticalScale = 1.0,
    visible = true,
  } = {}) {
    let capWidth = width;
    let capHeight = height;
    if (width * height > 10000) {
      const aspect = width / height || 1;
      capHeight = Math.floor(Math.sqrt(10000 / aspect));
      capWidth = Math.floor(capHeight * aspect);
    }
    this.width = capWidth;
    this.height = capHeight;
    this.maxVertexCap = 10000;

    let rawData;
    if (data instanceof Float32Array) {
      rawData = data;
    } else if (Array.isArray(data)) {
      rawData = new Float32Array(data);
    } else if (data && typeof data === 'object') {
      rawData = new Float32Array(Object.values(data));
    } else if (capWidth > 0 && capHeight > 0) {
      rawData = new Float32Array(capWidth * capHeight);
    } else {
      rawData = new Float32Array(0);
    }

    if (width !== capWidth || height !== capHeight) {
      this.data = new Float32Array(capWidth * capHeight);
      for (let y = 0; y < capHeight; y++) {
        for (let x = 0; x < capWidth; x++) {
          const u = x / Math.max(1, capWidth - 1);
          const v = y / Math.max(1, capHeight - 1);
          const origX = Math.floor(u * (width - 1));
          const origY = Math.floor(v * (height - 1));
          this.data[y * capWidth + x] = rawData[origY * width + origX] || 0;
        }
      }
    } else {
      this.data = rawData;
    }

    this.minElevation = minElevation;
    this.maxElevation = maxElevation;
    this.bounds = bounds || { minX: -600, maxX: 600, minY: -600, maxY: 600 };
    this.contourInterval = Math.max(0.1, contourInterval);
    this.verticalScale = verticalScale;
    this.visible = visible;
  }

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      data: Array.from(this.data),
      minElevation: this.minElevation,
      maxElevation: this.maxElevation,
      bounds: this.bounds,
      contourInterval: this.contourInterval,
      verticalScale: this.verticalScale,
      visible: this.visible !== false,
    };
  }

  getElevationAt(u, v) {
    if (!this.data || this.data.length === 0 || this.width <= 0 || this.height <= 0) return 0;
    const clampU = Math.max(0, Math.min(1, u));
    const clampV = Math.max(0, Math.min(1, v));
    const gx = clampU * (this.width - 1);
    const gy = clampV * (this.height - 1);
    const x0 = Math.floor(gx);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = gx - x0;
    const ty = gy - y0;

    const v00 = this.data[y0 * this.width + x0];
    const v10 = this.data[y0 * this.width + x1];
    const v01 = this.data[y1 * this.width + x0];
    const v11 = this.data[y1 * this.width + x1];

    const top = v00 * (1 - tx) + v10 * tx;
    const bottom = v01 * (1 - tx) + v11 * tx;
    return top * (1 - ty) + bottom * ty;
  }

  toVolumetricMesh(baseElevation = -50) {
    const { width, height, data, bounds, verticalScale } = this;
    if (width <= 0 || height <= 0 || !data || data.length === 0) {
      return { vertices: [], triangles: [], vertexCount: 0 };
    }

    const vertices = [];
    const triangles = [];

    for (let y = 0; y < height; y++) {
      const v = y / Math.max(1, height - 1);
      const wy = bounds.minY + v * (bounds.maxY - bounds.minY);
      for (let x = 0; x < width; x++) {
        const u = x / Math.max(1, width - 1);
        const wx = bounds.minX + u * (bounds.maxX - bounds.minX);
        const wz = (data[y * width + x] || 0) * verticalScale;
        vertices.push({ x: wx, y: wy, z: wz });
      }
    }

    const offset = width * height;
    for (let y = 0; y < height; y++) {
      const v = y / Math.max(1, height - 1);
      const wy = bounds.minY + v * (bounds.maxY - bounds.minY);
      for (let x = 0; x < width; x++) {
        const u = x / Math.max(1, width - 1);
        const wx = bounds.minX + u * (bounds.maxX - bounds.minX);
        vertices.push({ x: wx, y: wy, z: baseElevation });
      }
    }

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i0 = y * width + x;
        const i1 = y * width + (x + 1);
        const i2 = (y + 1) * width + x;
        const i3 = (y + 1) * width + (x + 1);
        triangles.push([i0, i1, i2]);
        triangles.push([i1, i3, i2]);
      }
    }

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i0 = offset + y * width + x;
        const i1 = offset + y * width + (x + 1);
        const i2 = offset + (y + 1) * width + x;
        const i3 = offset + (y + 1) * width + (x + 1);
        triangles.push([i0, i2, i1]);
        triangles.push([i1, i2, i3]);
      }
    }

    return {
      vertices,
      triangles,
      vertexCount: vertices.length,
      bounds,
    };
  }

  executeFoundationCut(foundationPolygon, padElevation = 0) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.data || this.width <= 0 || this.height <= 0 || !Array.isArray(foundationPolygon)) {
      return { grid: this, mesh: this.toVolumetricMesh(), executionTimeMs: 0 };
    }

    const { width, height, bounds, data } = this;
    let minE = Infinity;
    let maxE = -Infinity;

    for (let y = 0; y < height; y++) {
      const v = y / Math.max(1, height - 1);
      const wy = bounds.minY + v * (bounds.maxY - bounds.minY);
      for (let x = 0; x < width; x++) {
        const u = x / Math.max(1, width - 1);
        const wx = bounds.minX + u * (bounds.maxX - bounds.minX);
        const idx = y * width + x;

        if (pointInPolygon({ x: wx, y: wy }, foundationPolygon)) {
          data[idx] = Math.min(data[idx], padElevation);
        }

        const currentVal = data[idx];
        if (currentVal < minE) minE = currentVal;
        if (currentVal > maxE) maxE = currentVal;
      }
    }

    this.minElevation = minE === Infinity ? 0 : minE;
    this.maxElevation = maxE === -Infinity ? padElevation : maxE;

    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const executionTimeMs = t1 - t0;

    return {
      grid: this,
      mesh: this.toVolumetricMesh(),
      executionTimeMs,
    };
  }

  subtractCSGVolume(polygon, targetElevation) {
    return this.executeFoundationCut(polygon, targetElevation);
  }
}

function pointInPolygon(p, poly) {
  let inside = false;
  const px = p.x;
  const py = p.y;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Parses Google Maps Elevation API JSON responses.
 * Accepts string or object matching Google Maps Elevation API JSON response format.
 */
export function parseGoogleElevationJson(input, options = {}) {
  const json = typeof input === 'string' ? JSON.parse(input) : input;
  if (!json) {
    throw new Error('Invalid JSON payload');
  }
  if (json.status && json.status !== 'OK') {
    throw new Error(`Google Maps Elevation API error status: ${json.status}`);
  }
  const results = json.results || json.elevationResults || [];
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('No elevation results found in payload');
  }

  let width = options.cols || options.width;
  let height = options.rows || options.height;
  if (!width || !height) {
    const side = Math.round(Math.sqrt(results.length));
    if (side * side === results.length) {
      width = side;
      height = side;
    } else {
      width = results.length;
      height = 1;
    }
  }

  const data = new Float32Array(results.length);
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const elev = typeof item === 'number' ? item : Number(item?.elevation ?? 0);
    data[i] = elev;
    if (elev < minElevation) minElevation = elev;
    if (elev > maxElevation) maxElevation = elev;
  }

  if (minElevation === Infinity) {
    minElevation = 0;
    maxElevation = 10;
  }

  return new ElevationGrid({
    width,
    height,
    data,
    minElevation: options.minElevation ?? minElevation,
    maxElevation: options.maxElevation ?? maxElevation,
    bounds: options.bounds,
    contourInterval: options.contourInterval ?? 1.0,
    verticalScale: options.verticalScale ?? 1.0,
  });
}

/**
 * Parses image heightmap (grayscale/RGB) from ImageData or HTMLImageElement/Canvas.
 */
export function parseImageHeightmap(imageInput, options = {}) {
  let width;
  let height;
  let pixels;

  if (imageInput && typeof imageInput.width === 'number' && imageInput.data) {
    // ImageData
    width = imageInput.width;
    height = imageInput.height;
    pixels = imageInput.data;
  } else if (imageInput && imageInput.getContext) {
    // HTMLCanvasElement
    const ctx = imageInput.getContext('2d');
    width = imageInput.width;
    height = imageInput.height;
    pixels = ctx.getImageData(0, 0, width, height).data;
  } else {
    throw new Error('Unsupported image input for heightmap parsing');
  }

  const minE = options.minElevation ?? 0;
  const maxE = options.maxElevation ?? 10;
  const range = maxE - minE;
  const total = width * height;
  const data = new Float32Array(total);

  let actualMin = Infinity;
  let actualMax = -Infinity;

  for (let i = 0; i < total; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const norm = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
    const elev = minE + norm * range;
    data[i] = elev;
    if (elev < actualMin) actualMin = elev;
    if (elev > actualMax) actualMax = elev;
  }

  return new ElevationGrid({
    width,
    height,
    data,
    minElevation: actualMin === Infinity ? minE : actualMin,
    maxElevation: actualMax === -Infinity ? maxE : actualMax,
    bounds: options.bounds,
    contourInterval: options.contourInterval ?? 1.0,
    verticalScale: options.verticalScale ?? 1.0,
  });
}

/**
 * Helper to extract double precision float arrays from DataView for GeoTIFF tags.
 */
function readDoubleArray(view, offset, count, littleEndian) {
  if (!count || offset <= 0 || offset + count * 8 > view.byteLength) {
    return null;
  }
  try {
    const arr = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      arr[i] = view.getFloat64(offset + i * 8, littleEndian);
    }
    return arr;
  } catch {
    return null;
  }
}

/**
 * Attempts binary GeoTIFF parsing with fallback to standard PNG/image heightmap loading.
 */
export async function parseGeoTIFFWithFallback(arrayBuffer, options = {}) {
  try {
    const view = new DataView(arrayBuffer);
    if (arrayBuffer.byteLength >= 4) {
      const magic = view.getUint16(0, false);
      const isTIFF = magic === 0x4949 || magic === 0x4d4d; // "II" or "MM"
      if (isTIFF) {
        // Attempt simple uncompressed grayscale TIFF tag parsing if present
        const littleEndian = magic === 0x4949;
        const version = view.getUint16(2, littleEndian);
        if (version === 42) {
          const firstIFD = view.getUint32(4, littleEndian);
          if (firstIFD > 0 && firstIFD < arrayBuffer.byteLength - 2) {
            const numEntries = view.getUint16(firstIFD, littleEndian);
            let imgWidth = 0,
              imgHeight = 0,
              stripOffset = 0,
              bitsPerSample = 8;
            let modelPixelScale = null;
            let modelTiepoint = null;
            let modelTransformation = null;

            for (let i = 0; i < numEntries; i++) {
              const entryOffset = firstIFD + 2 + i * 12;
              if (entryOffset + 12 > arrayBuffer.byteLength) break;
              const tag = view.getUint16(entryOffset, littleEndian);
              const type = view.getUint16(entryOffset + 2, littleEndian);
              const count = view.getUint32(entryOffset + 4, littleEndian);
              const val = view.getUint32(entryOffset + 8, littleEndian);

              if (tag === 256)
                imgWidth = val; // ImageWidth
              else if (tag === 257)
                imgHeight = val; // ImageLength
              else if (tag === 258) bitsPerSample = val & 0xffff;
              else if (tag === 273)
                stripOffset = val; // StripOffsets
              else if (tag === 33550 && type === 12) {
                modelPixelScale = readDoubleArray(view, val, count, littleEndian);
              } else if (tag === 33922 && type === 12) {
                modelTiepoint = readDoubleArray(view, val, count, littleEndian);
              } else if (tag === 34264 && type === 12) {
                modelTransformation = readDoubleArray(view, val, count, littleEndian);
              }
            }
            if (imgWidth > 0 && imgHeight > 0 && stripOffset > 0) {
              const total = imgWidth * imgHeight;
              const data = new Float32Array(total);
              let minE = Infinity,
                maxE = -Infinity;
              const bytesPerSample = bitsPerSample === 16 ? 2 : 1;
              if (stripOffset + total * bytesPerSample <= arrayBuffer.byteLength) {
                for (let k = 0; k < total; k++) {
                  let rawVal = 0;
                  if (bytesPerSample === 2) {
                    rawVal = view.getUint16(stripOffset + k * 2, littleEndian);
                  } else {
                    rawVal = view.getUint8(stripOffset + k);
                  }
                  const norm = rawVal / (bytesPerSample === 2 ? 65535 : 255);
                  const elev =
                    (options.minElevation ?? 0) +
                    norm * ((options.maxElevation ?? 10) - (options.minElevation ?? 0));
                  data[k] = elev;
                  if (elev < minE) minE = elev;
                  if (elev > maxE) maxE = elev;
                }

                let computedBounds = null;
                if (
                  modelTiepoint &&
                  modelTiepoint.length >= 6 &&
                  modelPixelScale &&
                  modelPixelScale.length >= 2
                ) {
                  const scaleX = modelPixelScale[0];
                  const scaleY = modelPixelScale[1];
                  const tieI = modelTiepoint[0];
                  const tieJ = modelTiepoint[1];
                  const tieX = modelTiepoint[3];
                  const tieY = modelTiepoint[4];

                  if (
                    scaleX > 0 &&
                    scaleY > 0 &&
                    !isNaN(scaleX) &&
                    !isNaN(scaleY) &&
                    !isNaN(tieX) &&
                    !isNaN(tieY)
                  ) {
                    const xOrigin = tieX - tieI * scaleX;
                    const yOrigin = tieY + tieJ * scaleY;
                    computedBounds = {
                      minX: xOrigin,
                      maxX: xOrigin + imgWidth * scaleX,
                      minY: yOrigin - imgHeight * scaleY,
                      maxY: yOrigin,
                    };
                  }
                } else if (modelTransformation && modelTransformation.length >= 16) {
                  const m = modelTransformation;
                  const x00 = m[3];
                  const y00 = m[7];
                  const xW0 = m[0] * imgWidth + m[3];
                  const yW0 = m[4] * imgWidth + m[7];
                  const x0H = m[1] * imgHeight + m[3];
                  const y0H = m[5] * imgHeight + m[7];
                  const xWH = m[0] * imgWidth + m[1] * imgHeight + m[3];
                  const yWH = m[4] * imgWidth + m[5] * imgHeight + m[7];

                  const minX = Math.min(x00, xW0, x0H, xWH);
                  const maxX = Math.max(x00, xW0, x0H, xWH);
                  const minY = Math.min(y00, yW0, y0H, yWH);
                  const maxY = Math.max(y00, yW0, y0H, yWH);

                  if (!isNaN(minX) && !isNaN(maxX) && !isNaN(minY) && !isNaN(maxY)) {
                    computedBounds = { minX, maxX, minY, maxY };
                  }
                }

                return new ElevationGrid({
                  width: imgWidth,
                  height: imgHeight,
                  data,
                  minElevation: minE,
                  maxElevation: maxE,
                  bounds: options.bounds ?? computedBounds ?? undefined,
                  contourInterval: options.contourInterval ?? 1.0,
                });
              }
            }
          }
        }
      }
    }
  } catch {
    // Fall through to image fallback
  }

  // Fallback: Parse ArrayBuffer as image (PNG/JPEG) heightmap using Image / ImageData
  if (typeof Blob !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    try {
      const blob = new Blob([arrayBuffer]);
      const bitmap = await createImageBitmap(blob);
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (canvas) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        return parseImageHeightmap(canvas, options);
      }
    } catch {
      // Fall through to error
    }
  }

  throw new Error('Failed to decode GeoTIFF binary data or fallback image heightmap');
}

/**
 * Unified elevation raster parser entry point.
 */
export async function parseElevationRaster(input, options = {}) {
  if (!input) throw new Error('No elevation input provided');

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.includes('"results"')) {
      return parseGoogleElevationJson(trimmed, options);
    }
  } else if (typeof input === 'object' && Array.isArray(input.results)) {
    return parseGoogleElevationJson(input, options);
  } else if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const buffer = input.buffer ? input.buffer : input;
    return parseGeoTIFFWithFallback(buffer, options);
  } else if (input && (input.getContext || input.data)) {
    return parseImageHeightmap(input, options);
  }

  throw new Error('Unrecognized elevation raster format');
}

/**
 * Marching Squares lookup table for isoline segment edges.
 * Corners: 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left.
 * Edges: 0=top (0-1), 1=right (1-2), 2=bottom (3-2), 3=left (0-3).
 */
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

/**
 * Synchronous Marching Squares computation.
 * Generates contour lines for configurable elevation levels.
 */
export function computeMarchingSquares(grid, intervalOverride = null) {
  if (!grid || !grid.data || grid.width < 2 || grid.height < 2) {
    return [];
  }

  const interval = intervalOverride || grid.contourInterval || 1.0;
  const minE = grid.minElevation;
  const maxE = grid.maxElevation;

  const startLevel = Math.ceil(minE / interval) * interval;
  const levels = [];
  for (let z = startLevel; z <= maxE; z += interval) {
    levels.push(Number(z.toFixed(2)));
  }

  if (levels.length === 0) return [];

  const { width, height, data, bounds } = grid;
  const contours = [];

  for (const z of levels) {
    const lines = [];

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i0 = y * width + x;
        const i1 = y * width + (x + 1);
        const i2 = (y + 1) * width + (x + 1);
        const i3 = (y + 1) * width + x;

        const v0 = data[i0];
        const v1 = data[i1];
        const v2 = data[i2];
        const v3 = data[i3];

        let index = 0;
        if (v0 >= z) index |= 8;
        if (v1 >= z) index |= 4;
        if (v2 >= z) index |= 2;
        if (v3 >= z) index |= 1;

        if (index === 0 || index === 15) continue;

        const edges = MARCHING_SQUARES_LOOKUP[index];
        for (const [eA, eB] of edges) {
          const pA = getEdgePoint(x, y, eA, v0, v1, v2, v3, z, width, height, bounds);
          const pB = getEdgePoint(x, y, eB, v0, v1, v2, v3, z, width, height, bounds);
          lines.push({ x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
        }
      }
    }

    if (lines.length > 0) {
      contours.push({ elevation: z, lines });
    }
  }

  return contours;
}

function getEdgePoint(x, y, edge, v0, v1, v2, v3, z, width, height, bounds) {
  let cellX1 = x,
    cellY1 = y;
  let cellX2 = x,
    cellY2 = y;
  let val1 = v0,
    val2 = v1;

  switch (edge) {
    case 0: // top edge (0 to 1)
      cellX1 = x;
      cellY1 = y;
      val1 = v0;
      cellX2 = x + 1;
      cellY2 = y;
      val2 = v1;
      break;
    case 1: // right edge (1 to 2)
      cellX1 = x + 1;
      cellY1 = y;
      val1 = v1;
      cellX2 = x + 1;
      cellY2 = y + 1;
      val2 = v2;
      break;
    case 2: // bottom edge (3 to 2)
      cellX1 = x;
      cellY1 = y + 1;
      val1 = v3;
      cellX2 = x + 1;
      cellY2 = y + 1;
      val2 = v2;
      break;
    case 3: // left edge (0 to 3)
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

/**
 * Asynchronous Marching Squares contour generation.
 * Offloads to CAD Web Worker pipeline or falls back synchronously.
 */
export async function computeContoursAsync(grid, intervalOverride = null) {
  if (!grid) return [];

  try {
    const contours = await globalCadWorkerClient.computeIsolinesAsync(grid, intervalOverride);
    if (Array.isArray(contours) && contours.length > 0) {
      return contours;
    }
  } catch {
    // Fall back
  }

  return computeMarchingSquares(grid, intervalOverride);
}

/**
 * Serializes ElevationGrid instance to plain object for plan JSON state.
 */
export function serializeElevationGrid(grid) {
  if (!grid) return null;
  return {
    width: grid.width,
    height: grid.height,
    data: Array.from(grid.data),
    minElevation: grid.minElevation,
    maxElevation: grid.maxElevation,
    bounds: grid.bounds,
    contourInterval: grid.contourInterval,
    verticalScale: grid.verticalScale,
    visible: grid.visible !== false,
  };
}

/**
 * Reconstructs ElevationGrid from plain serialized object.
 */
export function deserializeElevationGrid(obj) {
  if (!obj) return null;
  return new ElevationGrid(obj);
}
