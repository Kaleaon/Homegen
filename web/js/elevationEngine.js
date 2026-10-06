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
    this.width = width;
    this.height = height;
    if (data instanceof Float32Array) {
      this.data = data;
    } else if (Array.isArray(data)) {
      this.data = new Float32Array(data);
    } else if (data && typeof data === 'object') {
      this.data = new Float32Array(Object.values(data));
    } else if (width > 0 && height > 0) {
      this.data = new Float32Array(width * height);
    } else {
      this.data = new Float32Array(0);
    }
    this.minElevation = minElevation;
    this.maxElevation = maxElevation;
    // World bounds in plan inches: defaults to -600" to +600" (100ft x 100ft area)
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
            for (let i = 0; i < numEntries; i++) {
              const entryOffset = firstIFD + 2 + i * 12;
              if (entryOffset + 12 > arrayBuffer.byteLength) break;
              const tag = view.getUint16(entryOffset, littleEndian);
              const val = view.getUint32(entryOffset + 8, littleEndian);
              if (tag === 256) imgWidth = val; // ImageWidth
              else if (tag === 257) imgHeight = val; // ImageLength
              else if (tag === 258) bitsPerSample = val & 0xffff;
              else if (tag === 273) stripOffset = val; // StripOffsets
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
                  const elev = (options.minElevation ?? 0) + norm * ((options.maxElevation ?? 10) - (options.minElevation ?? 0));
                  data[k] = elev;
                  if (elev < minE) minE = elev;
                  if (elev > maxE) maxE = elev;
                }
                return new ElevationGrid({
                  width: imgWidth,
                  height: imgHeight,
                  data,
                  minElevation: minE,
                  maxElevation: maxE,
                  bounds: options.bounds,
                  contourInterval: options.contourInterval ?? 1.0,
                });
              }
            }
          }
        }
      }
    }
  } catch (_) {
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
    } catch (_) {
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
  [[3, 0], [2, 1]], // 5: corners 1,3 (saddle)
  [[2, 0]], // 6: corners 1,2
  [[3, 0]], // 7: corners 1,2,3
  [[0, 3]], // 8: corner 0
  [[0, 2]], // 9: corners 0,3
  [[0, 1], [3, 2]], // 10: corners 0,2 (saddle)
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
  let cellX1 = x, cellY1 = y;
  let cellX2 = x, cellY2 = y;
  let val1 = v0, val2 = v1;

  switch (edge) {
    case 0: // top edge (0 to 1)
      cellX1 = x; cellY1 = y; val1 = v0;
      cellX2 = x + 1; cellY2 = y; val2 = v1;
      break;
    case 1: // right edge (1 to 2)
      cellX1 = x + 1; cellY1 = y; val1 = v1;
      cellX2 = x + 1; cellY2 = y + 1; val2 = v2;
      break;
    case 2: // bottom edge (3 to 2)
      cellX1 = x; cellY1 = y + 1; val1 = v3;
      cellX2 = x + 1; cellY2 = y + 1; val2 = v2;
      break;
    case 3: // left edge (0 to 3)
      cellX1 = x; cellY1 = y; val1 = v0;
      cellX2 = x; cellY2 = y + 1; val2 = v3;
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
 * Runs non-blockingly using Worker or async time-slicing.
 */
export async function computeContoursAsync(grid, intervalOverride = null) {
  if (!grid) return [];

  // If Web Worker and Blob are available, run in background worker
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    try {
      const workerCode = `
        self.onmessage = function(e) {
          const { gridData, width, height, minElevation, maxElevation, bounds, interval } = e.data;
          const grid = {
            width,
            height,
            data: gridData,
            minElevation,
            maxElevation,
            bounds,
            contourInterval: interval
          };

          const MARCHING_SQUARES_LOOKUP = ${JSON.stringify(MARCHING_SQUARES_LOOKUP)};

          function getEdgePoint(x, y, edge, v0, v1, v2, v3, z, width, height, bounds) {
            let cellX1 = x, cellY1 = y, cellX2 = x, cellY2 = y;
            let val1 = v0, val2 = v1;
            switch (edge) {
              case 0: cellX1 = x; cellY1 = y; val1 = v0; cellX2 = x + 1; cellY2 = y; val2 = v1; break;
              case 1: cellX1 = x + 1; cellY1 = y; val1 = v1; cellX2 = x + 1; cellY2 = y + 1; val2 = v2; break;
              case 2: cellX1 = x; cellY1 = y + 1; val1 = v3; cellX2 = x + 1; cellY2 = y + 1; val2 = v2; break;
              case 3: cellX1 = x; cellY1 = y; val1 = v0; cellX2 = x; cellY2 = y + 1; val2 = v3; break;
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

          const startLevel = Math.ceil(minElevation / interval) * interval;
          const contours = [];
          for (let z = startLevel; z <= maxElevation; z += interval) {
            const levelVal = Number(z.toFixed(2));
            const lines = [];
            for (let y = 0; y < height - 1; y++) {
              for (let x = 0; x < width - 1; x++) {
                const i0 = y * width + x;
                const i1 = y * width + (x + 1);
                const i2 = (y + 1) * width + (x + 1);
                const i3 = (y + 1) * width + x;
                const v0 = gridData[i0];
                const v1 = gridData[i1];
                const v2 = gridData[i2];
                const v3 = gridData[i3];

                let index = 0;
                if (v0 >= levelVal) index |= 8;
                if (v1 >= levelVal) index |= 4;
                if (v2 >= levelVal) index |= 2;
                if (v3 >= levelVal) index |= 1;

                if (index === 0 || index === 15) continue;
                const edges = MARCHING_SQUARES_LOOKUP[index];
                for (let k = 0; k < edges.length; k++) {
                  const e = edges[k];
                  const pA = getEdgePoint(x, y, e[0], v0, v1, v2, v3, levelVal, width, height, bounds);
                  const pB = getEdgePoint(x, y, e[1], v0, v1, v2, v3, levelVal, width, height, bounds);
                  lines.push({ x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
                }
              }
            }
            if (lines.length > 0) {
              contours.push({ elevation: levelVal, lines });
            }
          }

          self.postMessage(contours);
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      return new Promise((res, rej) => {
        worker.onmessage = (evt) => {
          URL.revokeObjectURL(workerUrl);
          worker.terminate();
          res(evt.data);
        };
        worker.onerror = (err) => {
          URL.revokeObjectURL(workerUrl);
          worker.terminate();
          // Fallback to sync
          res(computeMarchingSquares(grid, intervalOverride));
        };
        const interval = intervalOverride || grid.contourInterval || 1.0;
        worker.postMessage({
          gridData: grid.data,
          width: grid.width,
          height: grid.height,
          minElevation: grid.minElevation,
          maxElevation: grid.maxElevation,
          bounds: grid.bounds,
          interval,
        });
      });
    } catch (_) {
      // Fallback
    }
  }

  // Fallback: microtask async resolution
  return new Promise((res) => {
    setTimeout(() => {
      res(computeMarchingSquares(grid, intervalOverride));
    }, 0);
  });
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
