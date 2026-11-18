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

function toFiniteCoord(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/**
 * Parses Google Maps Elevation API JSON responses.
 * Accepts string or object matching Google Maps Elevation API JSON response format.
 */
function parseGoogleElevationJson(input, options = {}) {
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
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const elev = typeof item === 'number' ? item : Number(item?.elevation ?? 0);
    data[i] = elev;
    if (elev < minElevation) minElevation = elev;
    if (elev > maxElevation) maxElevation = elev;

    if (item && typeof item === 'object') {
      const loc = item.location && typeof item.location === 'object' ? item.location : item;
      const rawX = loc.lng ?? loc.longitude ?? loc.x ?? item.lng ?? item.longitude ?? item.x;
      const rawY = loc.lat ?? loc.latitude ?? loc.y ?? item.lat ?? item.latitude ?? item.y;
      const x = toFiniteCoord(rawX);
      const y = toFiniteCoord(rawY);
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minElevation === Infinity) {
    minElevation = 0;
    maxElevation = 10;
  }

  const computedBounds =
    Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)
      ? { minX, maxX, minY, maxY }
      : null;

  return new ElevationGrid({
    width,
    height,
    data,
    minElevation: options.minElevation ?? minElevation,
    maxElevation: options.maxElevation ?? maxElevation,
    bounds: options.bounds ?? computedBounds,
    contourInterval: options.contourInterval ?? 1.0,
    verticalScale: options.verticalScale ?? 1.0,
  });
}

/**
 * Parses image heightmap (grayscale/RGB) from ImageData or HTMLImageElement/Canvas.
 */
function parseImageHeightmap(imageInput, options = {}) {
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
 * Helper to extract ASCII string values (TIFF Type 2) from an IFD entry.
 * Handles inline values (count <= 4 bytes stored at entryOffset + 8) and
 * out-of-line offset strings (count > 4 bytes stored at the 32-bit offset).
 */
function readAsciiTag(view, entryOffset, count, littleEndian) {
  if (!count || count <= 0) {
    return null;
  }
  try {
    let strOffset;
    if (count <= 4) {
      strOffset = entryOffset + 8;
      if (strOffset < 0 || strOffset + count > view.byteLength) {
        return null;
      }
    } else {
      strOffset = view.getUint32(entryOffset + 8, littleEndian);
      if (strOffset <= 0 || strOffset + count > view.byteLength) {
        return null;
      }
    }
    let result = '';
    for (let i = 0; i < count; i++) {
      const byte = view.getUint8(strOffset + i);
      if (byte === 0) break;
      result += String.fromCharCode(byte);
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Converts a raw GDAL_NODATA string or option value into a numeric sentinel,
 * returning null for empty, corrupt, or non-numeric inputs.
 */
function parseNoDataValue(raw) {
  if (raw === null || raw === undefined || raw === false || typeof raw === 'boolean') {
    return null;
  }
  if (typeof raw === 'number') {
    if (Number.isNaN(raw)) return NaN;
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.toLowerCase() === 'nan') return NaN;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseGeoTIFFSync(arrayBuffer, options) {
  const byteLength = arrayBuffer.byteLength;
  if (byteLength < 8) return null;

  const view = new DataView(arrayBuffer);
  const magic = view.getUint16(0, false);
  if (magic !== 0x4949 && magic !== 0x4d4d) return null; // "II" or "MM"

  const littleEndian = magic === 0x4949;
  if (view.getUint16(2, littleEndian) !== 42) return null;

  const firstIFD = view.getUint32(4, littleEndian);
  if (firstIFD <= 0 || firstIFD >= byteLength - 2) return null;

  const numEntries = view.getUint16(firstIFD, littleEndian);
  let imgWidth = 0;
  let imgHeight = 0;
  let stripOffset = 0;
  let bitsPerSample = 8;
  let sampleFormat = 1;
  let hasExplicitSampleFormat = false;
  let modelPixelScale = null;
  let modelTiepoint = null;
  let modelTransformation = null;
  let gdalNoData = null;

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = firstIFD + 2 + i * 12;
    if (entryOffset + 12 > byteLength) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const val = view.getUint32(entryOffset + 8, littleEndian);

    if (tag === 256) imgWidth = !littleEndian && type === 3 && val > 0xffff ? val >>> 16 : val;
    else if (tag === 257)
      imgHeight = !littleEndian && type === 3 && val > 0xffff ? val >>> 16 : val;
    else if (tag === 258)
      bitsPerSample = !littleEndian && type === 3 && val > 0xffff ? val >>> 16 : val & 0xffff;
    else if (tag === 273)
      stripOffset = !littleEndian && type === 3 && val > 0xffff ? val >>> 16 : val;
    else if (tag === 339) {
      sampleFormat = !littleEndian && type === 3 && val > 0xffff ? val >>> 16 : val & 0xffff;
      hasExplicitSampleFormat = true;
    } else if (tag === 33550 && type === 12) {
      modelPixelScale = readDoubleArray(view, val, count, littleEndian);
    } else if (tag === 33922 && type === 12) {
      modelTiepoint = readDoubleArray(view, val, count, littleEndian);
    } else if (tag === 34264 && type === 12) {
      modelTransformation = readDoubleArray(view, val, count, littleEndian);
    } else if (tag === 42113 && type === 2) {
      const asciiNoData = readAsciiTag(view, entryOffset, count, littleEndian);
      const parsedNoData = parseNoDataValue(asciiNoData);
      if (parsedNoData !== null) {
        gdalNoData = parsedNoData;
      }
    }
  }

  if (imgWidth <= 0 || imgHeight <= 0 || stripOffset <= 0) return null;

  const total = imgWidth * imgHeight;
  const bytesPerSample =
    bitsPerSample === 64 ? 8 : bitsPerSample === 32 ? 4 : bitsPerSample === 16 ? 2 : 1;
  if (stripOffset + total * bytesPerSample > byteLength) return null;

  const data = new Float32Array(total);
  let minE = Infinity;
  let maxE = -Infinity;

  const effectiveNoData =
    options.noDataValue !== undefined ? parseNoDataValue(options.noDataValue) : gdalNoData;
  const hasNumericNoData = effectiveNoData !== null && !Number.isNaN(effectiveNoData);

  const isFloatSample =
    sampleFormat === 3 ||
    bytesPerSample === 8 ||
    (!hasExplicitSampleFormat &&
      bytesPerSample === 4 &&
      hasNumericNoData &&
      (!Number.isInteger(effectiveNoData) || Math.abs(effectiveNoData) > 2147483647));
  const isSignedSample =
    !isFloatSample &&
    (sampleFormat === 2 ||
      (!hasExplicitSampleFormat &&
        hasNumericNoData &&
        effectiveNoData < 0 &&
        ((bytesPerSample === 2 && effectiveNoData >= -32768) ||
          (bytesPerSample === 4 && effectiveNoData >= -2147483648) ||
          (bytesPerSample === 1 && effectiveNoData >= -128))));
  const isUnsignedNormalized = !isFloatSample && !isSignedSample;

  const baseMin = options.minElevation ?? 0;
  const rangeElev = (options.maxElevation ?? 10) - baseMin;
  const maxUnsignedSample = bytesPerSample === 4 ? 4294967295 : bytesPerSample === 2 ? 65535 : 255;

  const enableStandardSentinels = Boolean(
    options.filterStandardSentinels || options.standardSentinels || options.detectStandardSentinels
  );
  const stdSentinelVal =
    enableStandardSentinels && isUnsignedNormalized
      ? bytesPerSample === 2
        ? 65535
        : bytesPerSample === 1
          ? 255
          : -1
      : -1;

  if (
    bytesPerSample === 1 &&
    isUnsignedNormalized &&
    effectiveNoData === null &&
    stdSentinelVal < 0
  ) {
    const samples = new Uint8Array(arrayBuffer, stripOffset, total);
    const lut = new Float64Array(256);
    for (let v = 0; v < 256; v++) {
      lut[v] = baseMin + (v / 255) * rangeElev;
    }
    const zeroElev = lut[0];
    if (zeroElev !== 0) {
      data.fill(zeroElev);
    }
    let minRaw = 255;
    let maxRaw = 0;
    let k = 0;
    const limit8 = total - 7;
    for (; k < limit8; k += 8) {
      const b0 = samples[k];
      const b1 = samples[k + 1];
      const b2 = samples[k + 2];
      const b3 = samples[k + 3];
      const b4 = samples[k + 4];
      const b5 = samples[k + 5];
      const b6 = samples[k + 6];
      const b7 = samples[k + 7];
      if ((b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7) === 0) {
        if (0 < minRaw) minRaw = 0;
        if (0 > maxRaw) maxRaw = 0;
        continue;
      }
      data[k] = lut[b0];
      data[k + 1] = lut[b1];
      data[k + 2] = lut[b2];
      data[k + 3] = lut[b3];
      data[k + 4] = lut[b4];
      data[k + 5] = lut[b5];
      data[k + 6] = lut[b6];
      data[k + 7] = lut[b7];
      let lo = b0 < b1 ? b0 : b1;
      if (b2 < lo) lo = b2;
      if (b3 < lo) lo = b3;
      if (b4 < lo) lo = b4;
      if (b5 < lo) lo = b5;
      if (b6 < lo) lo = b6;
      if (b7 < lo) lo = b7;
      if (lo < minRaw) minRaw = lo;
      let hi = b0 > b1 ? b0 : b1;
      if (b2 > hi) hi = b2;
      if (b3 > hi) hi = b3;
      if (b4 > hi) hi = b4;
      if (b5 > hi) hi = b5;
      if (b6 > hi) hi = b6;
      if (b7 > hi) hi = b7;
      if (hi > maxRaw) maxRaw = hi;
    }
    for (; k < total; k++) {
      const b = samples[k];
      if (b !== 0) data[k] = lut[b];
      if (b < minRaw) minRaw = b;
      if (b > maxRaw) maxRaw = b;
    }
    const eA = lut[minRaw];
    const eB = lut[maxRaw];
    minE = eA <= eB ? eA : eB;
    maxE = eA <= eB ? eB : eA;
  } else {
    const noDataF32 = hasNumericNoData ? Math.fround(effectiveNoData) : 0;
    const noDataTol = hasNumericNoData
      ? (bytesPerSample === 8 ? 1e-9 : 1e-6) * Math.max(1, Math.abs(effectiveNoData))
      : 0;

    let voidMask = null;
    for (let k = 0; k < total; k++) {
      let rawVal;
      if (bytesPerSample === 8) {
        rawVal = view.getFloat64(stripOffset + k * 8, littleEndian);
      } else if (bytesPerSample === 4) {
        if (isFloatSample) {
          rawVal = view.getFloat32(stripOffset + k * 4, littleEndian);
        } else if (isSignedSample) {
          rawVal = view.getInt32(stripOffset + k * 4, littleEndian);
        } else {
          rawVal = view.getUint32(stripOffset + k * 4, littleEndian);
        }
      } else if (bytesPerSample === 2) {
        rawVal = isSignedSample
          ? view.getInt16(stripOffset + k * 2, littleEndian)
          : view.getUint16(stripOffset + k * 2, littleEndian);
      } else {
        rawVal = isSignedSample ? view.getInt8(stripOffset + k) : view.getUint8(stripOffset + k);
      }

      let isVoid = !Number.isFinite(rawVal);
      if (!isVoid && hasNumericNoData) {
        if (isFloatSample) {
          isVoid =
            rawVal === effectiveNoData ||
            (bytesPerSample === 4 && rawVal === noDataF32) ||
            Math.abs(rawVal - effectiveNoData) <= noDataTol;
        } else {
          isVoid = rawVal === effectiveNoData;
        }
      }
      if (!isVoid && stdSentinelVal >= 0 && rawVal === stdSentinelVal) {
        isVoid = true;
      }

      if (isVoid) {
        if (!voidMask) voidMask = new Uint8Array(total);
        voidMask[k] = 1;
        continue;
      }

      const elev = isUnsignedNormalized
        ? baseMin + (rawVal / maxUnsignedSample) * rangeElev
        : rawVal;
      data[k] = elev;
      if (elev < minE) minE = elev;
      if (elev > maxE) maxE = elev;
    }

    if (minE === Infinity || maxE === -Infinity) {
      minE = baseMin;
      maxE = options.maxElevation ?? 10;
    }

    if (voidMask) {
      const baselineElevation =
        typeof options.noDataReplacement === 'number' && Number.isFinite(options.noDataReplacement)
          ? options.noDataReplacement
          : minE;
      for (let k = 0; k < total; k++) {
        if (voidMask[k]) {
          data[k] = baselineElevation;
        }
      }
    }
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

/**
 * Attempts binary GeoTIFF parsing with fallback to standard PNG/image heightmap loading.
 */
export async function parseGeoTIFFWithFallback(arrayBuffer, options = {}) {
  try {
    const grid = parseGeoTIFFSync(arrayBuffer, options);
    if (grid) return grid;
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
  if (!Number.isFinite(interval) || interval <= 0) {
    return [];
  }

  const minE = grid.minElevation;
  const maxE = grid.maxElevation;
  if (!Number.isFinite(minE) || !Number.isFinite(maxE) || minE > maxE) {
    return [];
  }

  const startLevel = Math.ceil(minE / interval) * interval;
  const levels = [];
  for (let z = startLevel; z <= maxE; z += interval) {
    levels.push(Number(z.toFixed(2)));
  }

  const numLevels = levels.length;
  if (numLevels === 0) return [];

  const { width, height, data } = grid;
  const bounds = grid.bounds || { minX: -600, maxX: 600, minY: -600, maxY: 600 };
  const minLevel = levels[0];
  const maxLevel = levels[numLevels - 1];
  const invInterval = 1 / interval;

  const buckets = new Array(numLevels);
  for (let i = 0; i < numLevels; i++) {
    buckets[i] = [];
  }

  for (let y = 0; y < height - 1; y++) {
    const row0 = y * width;
    const row1 = row0 + width;

    for (let x = 0; x < width - 1; x++) {
      const v0 = data[row0 + x];
      const v1 = data[row0 + x + 1];
      const v2 = data[row1 + x + 1];
      const v3 = data[row1 + x];

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

      let startIdx = Math.floor((cellMin - startLevel) * invInterval);
      if (startIdx < 0) startIdx = 0;
      else if (startIdx >= numLevels) startIdx = numLevels - 1;
      while (startIdx > 0 && levels[startIdx - 1] > cellMin) {
        startIdx--;
      }
      while (startIdx < numLevels && levels[startIdx] <= cellMin) {
        startIdx++;
      }

      for (let lIdx = startIdx; lIdx < numLevels; lIdx++) {
        const z = levels[lIdx];
        if (z > cellMax) break;

        let index = 0;
        if (v0 >= z) index |= 8;
        if (v1 >= z) index |= 4;
        if (v2 >= z) index |= 2;
        if (v3 >= z) index |= 1;

        if (index === 0 || index === 15) continue;

        const edges = MARCHING_SQUARES_LOOKUP[index];
        const lines = buckets[lIdx];
        for (let k = 0; k < edges.length; k++) {
          const edgePair = edges[k];
          const pA = getEdgePoint(x, y, edgePair[0], v0, v1, v2, v3, z, width, height, bounds);
          const pB = getEdgePoint(x, y, edgePair[1], v0, v1, v2, v3, z, width, height, bounds);
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
 * Reconstructs ElevationGrid from plain serialized object.
 */
export function deserializeElevationGrid(obj) {
  if (!obj) return null;
  return new ElevationGrid(obj);
}
