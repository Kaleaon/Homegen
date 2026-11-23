/**
 * Serverless Direct Client GIS Ingestion Module
 * Provides geocoding (coordinates, OpenStreetMap Nominatim, Google Maps),
 * live elevation grids (Open-Meteo / Copernicus DEM, Open-Elevation, Google Maps JS ElevationService),
 * cadastral & building footprint vectors (OpenStreetMap Overpass API -> GeoJSON),
 * and georeferenced slippy raster tile stitching (OSM, CARTO, USGS Topo, Copernicus Sentinel, Google Satellite).
 */

import { gisRateLimitedFetch } from './rateLimiter.js';
import { parseElevationRaster } from './elevationEngine.js';
import { MAP_PRESETS, getMapPreset } from './model.js';
import { computeGeoBounds, worldfileToAffineMatrix } from './geometry.js';

export const GOOGLE_MAPS_API_KEY_STORAGE = 'homegen.googleMapsApiKey';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_INTERPRETER_URL = 'https://overpass-api.de/api/interpreter';
const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const OPEN_ELEVATION_URL = 'https://api.open-elevation.com/api/v1/lookup';
const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const GOOGLE_STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap';

function resolveLocalStorage(explicitStorage = null) {
  if (explicitStorage) return explicitStorage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return null;
}

/**
 * Reads the user-supplied Google Maps API key from browser localStorage only.
 */
export function getGoogleMapsApiKey(storage = null) {
  const store = resolveLocalStorage(storage);
  if (!store || typeof store.getItem !== 'function') return '';
  const raw = store.getItem(GOOGLE_MAPS_API_KEY_STORAGE);
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Saves or clears the user-supplied Google Maps API key in browser localStorage only.
 */
export function setGoogleMapsApiKey(apiKey, storage = null) {
  const store = resolveLocalStorage(storage);
  if (!store) return '';
  const cleaned = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!cleaned) {
    if (typeof store.removeItem === 'function') {
      store.removeItem(GOOGLE_MAPS_API_KEY_STORAGE);
    } else if (typeof store.setItem === 'function') {
      store.setItem(GOOGLE_MAPS_API_KEY_STORAGE, '');
    }
    return '';
  }
  if (typeof store.setItem === 'function') {
    store.setItem(GOOGLE_MAPS_API_KEY_STORAGE, cleaned);
  }
  return cleaned;
}

export function clearGoogleMapsApiKey(storage = null) {
  return setGoogleMapsApiKey('', storage);
}

export function isClientOffline(options = {}) {
  if (typeof options.online === 'boolean') return !options.online;
  if (options.fetchImpl) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  return false;
}

/**
 * Computes a geographic bounding box around (lat, lon) given a span in meters.
 */
export function computeSiteBoundingBox(lat, lon, spanMeters = 120) {
  const halfSpan = Math.max(10, Number(spanMeters) || 120) / 2;
  const latDelta = halfSpan / 111320;
  const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const lonDelta = halfSpan / (111320 * cosLat);

  const south = Math.max(-89.99, lat - latDelta);
  const north = Math.min(89.99, lat + latDelta);
  const west = Math.max(-180, lon - lonDelta);
  const east = Math.min(180, lon + lonDelta);

  return {
    south,
    north,
    west,
    east,
    minLat: south,
    maxLat: north,
    minLon: west,
    maxLon: east,
  };
}

/**
 * Parses direct coordinate strings such as "37.7749, -122.4194" or "37.7749° N, 122.4194° W".
 * Returns null if the query is a street address rather than coordinates.
 */
export function parseCoordinatesInput(query, spanMeters = 120) {
  if (typeof query !== 'string') return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Match cardinal coordinates e.g. "37.7749° N, 122.4194° W"
  const cardinalRe =
    /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]+\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/;
  const match = trimmed.match(cardinalRe);
  if (!match) return null;

  let first = Number(match[1]);
  const dir1 = (match[2] || '').toUpperCase();
  let second = Number(match[3]);
  const dir2 = (match[4] || '').toUpperCase();

  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  if (dir1 === 'S') first = -Math.abs(first);
  else if (dir1 === 'N') first = Math.abs(first);

  if (dir2 === 'W') second = -Math.abs(second);
  else if (dir2 === 'E') second = Math.abs(second);

  let lat = first;
  let lon = second;

  // Swap if entered as "lon, lat" where |lon| > 90
  if (Math.abs(first) > 90 && Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    lon = first;
    lat = second;
  }

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return {
    lat,
    lon,
    displayName: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    boundingBox: computeSiteBoundingBox(lat, lon, spanMeters),
    provider: 'Coordinates',
    attributionText: null,
    licenseUrl: null,
    isCoordinate: true,
  };
}

function normalizeGeoBounds(rawBounds, fallbackLat = 37.7749, fallbackLon = -122.4194) {
  if (!rawBounds || typeof rawBounds !== 'object') {
    return computeSiteBoundingBox(fallbackLat, fallbackLon, 120);
  }
  const south = Number(rawBounds.south ?? rawBounds.minLat ?? rawBounds.minY);
  const north = Number(rawBounds.north ?? rawBounds.maxLat ?? rawBounds.maxY);
  const west = Number(rawBounds.west ?? rawBounds.minLon ?? rawBounds.minX);
  const east = Number(rawBounds.east ?? rawBounds.maxLon ?? rawBounds.maxX);
  if (
    !Number.isFinite(south) ||
    !Number.isFinite(north) ||
    !Number.isFinite(west) ||
    !Number.isFinite(east) ||
    north <= south ||
    east <= west
  ) {
    return computeSiteBoundingBox(fallbackLat, fallbackLon, 120);
  }
  return {
    south,
    north,
    west,
    east,
    minLat: south,
    maxLat: north,
    minLon: west,
    maxLon: east,
  };
}

function clampSiteBoundsAroundPoint(bounds, lat, lon, maxSpanMeters = 180) {
  const normalized = normalizeGeoBounds(bounds, lat, lon);
  const latSpanMeters = (normalized.north - normalized.south) * 111320;
  const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const lonSpanMeters = (normalized.east - normalized.west) * 111320 * cosLat;
  if (latSpanMeters > maxSpanMeters || lonSpanMeters > maxSpanMeters || latSpanMeters < 15) {
    return computeSiteBoundingBox(lat, lon, Math.min(maxSpanMeters, 120));
  }
  return normalized;
}

/**
 * Geocodes a street address or coordinate string using direct coordinate parsing,
 * optional Google Maps Geocoding (when an API key is supplied), or OpenStreetMap Nominatim.
 */
export async function geocodeLocation(query, options = {}) {
  const spanMeters = options.spanMeters || 120;
  const coordMatch = parseCoordinatesInput(query, spanMeters);
  if (coordMatch) return coordMatch;

  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) {
    throw new Error('Enter a street address or latitude, longitude coordinates.');
  }

  if (isClientOffline(options)) {
    throw new Error(
      'Client is offline. Enter numeric latitude, longitude coordinates or upload a local file.'
    );
  }

  const apiKey = (options.apiKey ?? getGoogleMapsApiKey(options.storage)).trim();
  const fetchOpts = options.fetchImpl
    ? { fetchImpl: options.fetchImpl, signal: options.signal }
    : { signal: options.signal };

  if (apiKey && options.preferGoogle !== false) {
    try {
      if (globalThis.google?.maps?.Geocoder && !options.fetchImpl) {
        const geocoder = new globalThis.google.maps.Geocoder();
        const response = await new Promise((resolve, reject) => {
          const maybePromise = geocoder.geocode({ address: trimmed }, (results, status) => {
            if (status === 'OK' && Array.isArray(results) && results.length > 0) {
              resolve({ results });
            } else {
              reject(new Error(`Google Geocoder status: ${status}`));
            }
          });
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(resolve, reject);
          }
        });
        const top = response.results[0];
        const loc = top.geometry.location;
        const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
        const lon = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
        return {
          lat,
          lon,
          displayName: top.formatted_address || trimmed,
          boundingBox: computeSiteBoundingBox(lat, lon, spanMeters),
          provider: 'Google Maps',
          attributionText: 'Geocoding © Google',
          licenseUrl: 'https://cloud.google.com/maps-platform/terms',
          isCoordinate: false,
        };
      }

      const googleUrl = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(trimmed)}&key=${encodeURIComponent(apiKey)}`;
      const gRes = await gisRateLimitedFetch(googleUrl, fetchOpts);
      if (gRes.ok) {
        const gJson = await gRes.json();
        if (gJson.status === 'OK' && Array.isArray(gJson.results) && gJson.results.length > 0) {
          const top = gJson.results[0];
          const lat = Number(top.geometry?.location?.lat);
          const lon = Number(top.geometry?.location?.lng);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const vp = top.geometry?.bounds || top.geometry?.viewport;
            const rawBox = vp
              ? {
                  south: Number(vp.southwest?.lat),
                  north: Number(vp.northeast?.lat),
                  west: Number(vp.southwest?.lng),
                  east: Number(vp.northeast?.lng),
                }
              : null;
            return {
              lat,
              lon,
              displayName: top.formatted_address || trimmed,
              boundingBox:
                options.clampSiteSpan === false && rawBox
                  ? normalizeGeoBounds(rawBox, lat, lon)
                  : clampSiteBoundsAroundPoint(rawBox, lat, lon, 180),
              rawBoundingBox: rawBox,
              provider: 'Google Maps',
              attributionText: 'Geocoding © Google',
              licenseUrl: 'https://cloud.google.com/maps-platform/terms',
              isCoordinate: false,
            };
          }
        } else if (options.fallbackToOpen === false) {
          throw new Error(`Google Geocoding error: ${gJson.status || 'NO_RESULTS'}`);
        }
      }
    } catch (err) {
      if (options.fallbackToOpen === false) throw err;
    }
  }

  const nominatimUrl = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(trimmed)}`;
  const res = await gisRateLimitedFetch(nominatimUrl, {
    ...fetchOpts,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Geocoding search failed with HTTP ${res.status}`);
  }
  const matches = await res.json();
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error(`No location matches found for "${trimmed}".`);
  }

  const best = matches[0];
  const lat = Number(best.lat);
  const lon = Number(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Geocoder returned invalid coordinates.');
  }

  let rawBox = null;
  if (Array.isArray(best.boundingbox) && best.boundingbox.length >= 4) {
    rawBox = {
      south: Number(best.boundingbox[0]),
      north: Number(best.boundingbox[1]),
      west: Number(best.boundingbox[2]),
      east: Number(best.boundingbox[3]),
    };
  }

  const boundingBox =
    options.clampSiteSpan === false && rawBox
      ? normalizeGeoBounds(rawBox, lat, lon)
      : clampSiteBoundsAroundPoint(rawBox, lat, lon, 180);

  return {
    lat,
    lon,
    displayName: best.display_name || trimmed,
    boundingBox,
    rawBoundingBox: rawBox,
    provider: 'OpenStreetMap Nominatim',
    attributionText: '© OpenStreetMap contributors',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    isCoordinate: false,
  };
}

let googleMapsSdkPromise = null;
let googleMapsSdkKey = null;

/**
 * Dynamically loads the Google Maps JavaScript SDK so `google.maps.ElevationService`
 * can run directly in the browser without CORS errors on REST Elevation endpoints.
 */
export function loadGoogleMapsJsSdk(apiKey) {
  if (globalThis.google?.maps?.ElevationService) {
    return Promise.resolve(globalThis.google.maps);
  }
  const cleanedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!cleanedKey) {
    return Promise.reject(
      new Error('Google Maps API key is required for Google ElevationService.')
    );
  }
  if (googleMapsSdkPromise && googleMapsSdkKey === cleanedKey) {
    return googleMapsSdkPromise;
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return Promise.reject(
      new Error(
        'Google Maps JavaScript SDK requires a browser DOM or preloaded google.maps object.'
      )
    );
  }

  googleMapsSdkKey = cleanedKey;
  googleMapsSdkPromise = new Promise((resolve, reject) => {
    const existingScript =
      typeof document.querySelector === 'function'
        ? document.querySelector('script[data-homegen-gmaps="1"]')
        : null;
    if (existingScript) {
      if (globalThis.google?.maps?.ElevationService) {
        resolve(globalThis.google.maps);
        return;
      }
      existingScript.remove?.();
    }

    const script = document.createElement('script');
    script.setAttribute('data-homegen-gmaps', '1');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cleanedKey)}&v=weekly`;
    script.onload = () => {
      if (globalThis.google?.maps?.ElevationService) {
        resolve(globalThis.google.maps);
      } else {
        googleMapsSdkPromise = null;
        reject(new Error('Google Maps JavaScript SDK loaded without ElevationService.'));
      }
    };
    script.onerror = () => {
      googleMapsSdkPromise = null;
      reject(new Error('Failed to load Google Maps JavaScript SDK.'));
    };
    (document.head || document.body || document.documentElement)?.appendChild?.(script);
  });

  return googleMapsSdkPromise;
}

export function resetGoogleMapsSdkLoaderForTest() {
  googleMapsSdkPromise = null;
  googleMapsSdkKey = null;
}

function invokeGoogleElevationService(service, locations) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishOk = (results) => {
      if (settled) return;
      settled = true;
      resolve(results);
    };
    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    try {
      const maybePromise = service.getElevationForLocations({ locations }, (results, status) => {
        if (!status || status === 'OK') {
          finishOk(results || []);
        } else {
          finishErr(new Error(`Google ElevationService error: ${status}`));
        }
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((resp) => {
          const list = Array.isArray(resp) ? resp : resp?.results || [];
          finishOk(list);
        }, finishErr);
      }
    } catch (err) {
      finishErr(err);
    }
  });
}

/**
 * Fetches a live elevation sample grid across a geographic bounding box using either
 * Google Maps JS `ElevationService` (when an API key is supplied/selected) or open terrain
 * endpoints (Open-Meteo Copernicus DEM with Open-Elevation fallback), then parses into
 * an `ElevationGrid` via `parseElevationRaster` -> `parseGoogleElevationJson`.
 */
export async function fetchLiveElevationGrid(options = {}) {
  if (isClientOffline(options) && !globalThis.google?.maps?.ElevationService) {
    throw new Error(
      'Client is offline. Use Upload Terrain File to load a local elevation dataset.'
    );
  }

  let geocodeResult = null;
  let geoBounds = options.boundingBox || options.geoBounds || null;
  if (!geoBounds && options.query) {
    geocodeResult = await geocodeLocation(options.query, options);
    geoBounds = geocodeResult.boundingBox;
  } else if (!geoBounds) {
    const originLat = Number(options.origin?.latitude ?? options.origin?.lat ?? 37.7749);
    const originLon = Number(options.origin?.longitude ?? options.origin?.lon ?? -122.4194);
    geoBounds = computeSiteBoundingBox(originLat, originLon, options.spanMeters || 120);
  } else {
    geoBounds = normalizeGeoBounds(geoBounds);
  }

  const cols = Math.max(2, Math.min(64, Number(options.cols || options.width) || 12));
  const rows = Math.max(2, Math.min(64, Number(options.rows || options.height) || 12));
  const locations = [];

  // Row 0 = North (minY in screen/plan space), Row rows-1 = South (maxY in screen/plan space)
  for (let r = 0; r < rows; r++) {
    const v = r / Math.max(1, rows - 1);
    const lat = geoBounds.north - v * (geoBounds.north - geoBounds.south);
    for (let c = 0; c < cols; c++) {
      const u = c / Math.max(1, cols - 1);
      const lng = geoBounds.west + u * (geoBounds.east - geoBounds.west);
      locations.push({ lat, lng });
    }
  }

  const apiKey = (options.apiKey ?? getGoogleMapsApiKey(options.storage)).trim();
  const requestedProvider = (options.provider || 'auto').toLowerCase();
  const useGoogle =
    requestedProvider === 'google' || (requestedProvider === 'auto' && Boolean(apiKey));

  const planBounds = options.planBounds || {
    minX: 50,
    maxX: 1150,
    minY: 50,
    maxY: 850,
  };

  if (useGoogle) {
    if (!apiKey && !globalThis.google?.maps?.ElevationService) {
      throw new Error('Enter a Google Maps API key or switch Terrain Source to Open Terrain.');
    }
    const maps = await loadGoogleMapsJsSdk(apiKey);
    const service = new maps.ElevationService();
    const chunkSize = 256;
    const allResults = [];

    for (let i = 0; i < locations.length; i += chunkSize) {
      const batch = locations.slice(i, i + chunkSize);
      const batchResults = await invokeGoogleElevationService(service, batch);
      for (let j = 0; j < batch.length; j++) {
        const item = batchResults[j] || {};
        const loc = item.location || batch[j];
        const latVal = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat ?? batch[j].lat);
        const lngVal = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng ?? batch[j].lng);
        allResults.push({
          elevation: Number(item.elevation ?? 0),
          resolution: Number(item.resolution ?? 0),
          location: { lat: latVal, lng: lngVal },
        });
      }
    }

    const grid = await parseElevationRaster(
      { status: 'OK', results: allResults },
      {
        cols,
        rows,
        bounds: planBounds,
        geoBounds,
        elevationUnit: options.elevationUnit || 'm',
        contourInterval: options.contourInterval ?? 1.0,
        verticalScale: options.verticalScale ?? 1.0,
        attributionText: 'Elevation Data © Google',
        provider: 'Google Maps',
        licenseUrl: 'https://cloud.google.com/maps-platform/terms',
        source: 'google-elevation',
      }
    );
    return { grid, geocodeResult, geoBounds };
  }

  // Open Terrain Services: Open-Meteo (Copernicus DEM) with Open-Elevation fallback
  const fetchOpts = options.fetchImpl
    ? { fetchImpl: options.fetchImpl, signal: options.signal }
    : { signal: options.signal };

  const elevations = [];
  let providerName = 'Copernicus DEM / Open-Meteo';
  let attributionText = 'Elevation Data © Copernicus DEM / Open-Meteo';
  let licenseUrl =
    'https://sentinels.copernicus.eu/documents/247904/685211/Sentinel_Data_Legal_Notice.pdf';

  try {
    const batchSize = 100;
    for (let i = 0; i < locations.length; i += batchSize) {
      const batch = locations.slice(i, i + batchSize);
      const lats = batch.map((p) => p.lat.toFixed(6)).join(',');
      const lngs = batch.map((p) => p.lng.toFixed(6)).join(',');
      const url = `${OPEN_METEO_ELEVATION_URL}?latitude=${lats}&longitude=${lngs}`;
      const res = await gisRateLimitedFetch(url, fetchOpts);
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const json = await res.json();
      if (Array.isArray(json.elevation)) {
        for (const val of json.elevation) {
          elevations.push(Number.isFinite(Number(val)) ? Number(val) : 0);
        }
      } else if (Array.isArray(json.results)) {
        for (const r of json.results) {
          elevations.push(Number(r?.elevation ?? 0));
        }
      } else {
        throw new Error('Unexpected Open-Meteo response payload');
      }
    }
  } catch (openMeteoErr) {
    elevations.length = 0;
    const fallbackRes = await gisRateLimitedFetch(OPEN_ELEVATION_URL, {
      ...fetchOpts,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: locations.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      }),
    }).catch(() => {
      throw openMeteoErr;
    });
    if (!fallbackRes.ok) throw openMeteoErr;
    const fbJson = await fallbackRes.json();
    if (!Array.isArray(fbJson.results) || fbJson.results.length === 0) {
      throw openMeteoErr;
    }
    for (const r of fbJson.results) {
      elevations.push(Number(r?.elevation ?? 0));
    }
    providerName = 'Open-Elevation / SRTM';
    attributionText = 'Elevation Data © SRTM / Open-Elevation';
    licenseUrl =
      'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits';
  }

  const normalizedPayload = {
    status: 'OK',
    results: locations.map((loc, idx) => ({
      elevation: elevations[idx] ?? 0,
      location: { lat: loc.lat, lng: loc.lng },
    })),
  };

  const grid = await parseElevationRaster(normalizedPayload, {
    cols,
    rows,
    bounds: planBounds,
    geoBounds,
    elevationUnit: options.elevationUnit || 'm',
    contourInterval: options.contourInterval ?? 1.0,
    verticalScale: options.verticalScale ?? 1.0,
    attributionText,
    provider: providerName,
    licenseUrl,
    source: 'open-elevation',
  });

  return { grid, geocodeResult, geoBounds };
}

function classifyOsmTags(tags = {}) {
  const boundary = String(tags.boundary || '').toLowerCase();
  const landuse = String(tags.landuse || '').toLowerCase();
  if (
    boundary === 'parcel' ||
    boundary === 'lot' ||
    boundary === 'cadastre' ||
    boundary === 'property' ||
    tags.parcel ||
    tags.cadastre ||
    landuse === 'residential' ||
    landuse === 'commercial' ||
    landuse === 'retail' ||
    landuse === 'industrial' ||
    landuse === 'allotments' ||
    landuse === 'farmyard'
  ) {
    return 'lot';
  }
  if (tags.power || tags.easement || tags['man_made'] === 'pipeline') {
    return 'easement';
  }
  if (tags.building || tags['building:part']) {
    return 'building';
  }
  return 'lot';
}

function closeRing(coords) {
  if (!Array.isArray(coords) || coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, [first[0], first[1]]];
  }
  return coords;
}

/**
 * Converts an Overpass API JSON response (or raw GeoJSON FeatureCollection) into a
 * normalized GeoJSON FeatureCollection with cadastral parcels (`layer: 'lot'`),
 * building footprints (`layer: 'building'`), and easements (`layer: 'easement'`).
 */
export function overpassToGeoJSON(payload, boundingBox = null, options = {}) {
  const attributionText = 'Parcel & Footprint Vectors © OpenStreetMap contributors';
  const provider = 'OpenStreetMap / Overpass API';
  const licenseUrl = 'https://www.openstreetmap.org/copyright';

  if (payload && payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    return {
      ...payload,
      attributionText: payload.attributionText || attributionText,
      provider: payload.provider || provider,
      licenseUrl: payload.licenseUrl || licenseUrl,
      geoBounds: boundingBox || payload.geoBounds || null,
    };
  }

  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const nodeMap = new Map();
  const wayMap = new Map();

  for (const el of elements) {
    if (el?.type === 'node' && Number.isFinite(el.lon) && Number.isFinite(el.lat)) {
      nodeMap.set(el.id, [Number(el.lon), Number(el.lat)]);
    } else if (el?.type === 'way') {
      wayMap.set(el.id, el);
    }
  }

  const resolveWayCoords = (way) => {
    if (Array.isArray(way.geometry) && way.geometry.length >= 2) {
      return way.geometry
        .filter((pt) => pt && Number.isFinite(Number(pt.lon)) && Number.isFinite(Number(pt.lat)))
        .map((pt) => [Number(pt.lon), Number(pt.lat)]);
    }
    if (Array.isArray(way.nodes) && way.nodes.length >= 2) {
      return way.nodes.map((nid) => nodeMap.get(nid)).filter(Boolean);
    }
    return [];
  };

  const features = [];

  for (const el of elements) {
    if (!el || (el.type !== 'way' && el.type !== 'relation')) continue;
    const tags = el.tags || {};
    if (Object.keys(tags).length === 0) continue;

    const kind = classifyOsmTags(tags);
    const addrLabel =
      tags['addr:housenumber'] && tags['addr:street']
        ? `${tags['addr:housenumber']} ${tags['addr:street']}`
        : null;
    const featureName =
      tags.name ||
      addrLabel ||
      (kind === 'lot'
        ? 'Parcel Boundary'
        : kind === 'building'
          ? 'Building Footprint'
          : 'Utility Easement');

    if (el.type === 'way') {
      const coords = resolveWayCoords(el);
      if (coords.length < 2) continue;
      const isArea =
        coords.length >= 3 &&
        (kind === 'lot' ||
          kind === 'building' ||
          tags.area === 'yes' ||
          (coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]));

      if (isArea) {
        const ring = closeRing(coords);
        if (ring.length >= 4) {
          features.push({
            type: 'Feature',
            id: `osm-way-${el.id}`,
            properties: {
              ...tags,
              name: featureName,
              layer: kind,
              role: kind,
              ...(kind === 'lot' ? { setback: Number(tags.setback) || 36 } : {}),
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          });
        }
      } else {
        features.push({
          type: 'Feature',
          id: `osm-way-${el.id}`,
          properties: {
            ...tags,
            name: featureName,
            layer: 'easement',
            role: 'easement',
          },
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });
      }
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const outerRings = [];
      for (const member of el.members) {
        if (member.type === 'way' && (!member.role || member.role === 'outer')) {
          const memberWay = member.geometry ? member : wayMap.get(member.ref);
          if (!memberWay) continue;
          const coords = resolveWayCoords(memberWay);
          if (coords.length >= 3) {
            outerRings.push(closeRing(coords));
          }
        }
      }
      if (outerRings.length > 0) {
        features.push({
          type: 'Feature',
          id: `osm-rel-${el.id}`,
          properties: {
            ...tags,
            name: featureName,
            layer: kind,
            role: kind,
            ...(kind === 'lot' ? { setback: Number(tags.setback) || 36 } : {}),
          },
          geometry:
            outerRings.length === 1
              ? { type: 'Polygon', coordinates: [outerRings[0]] }
              : { type: 'MultiPolygon', coordinates: outerRings.map((r) => [r]) },
        });
      }
    }
  }

  // Ensure a primary lot boundary polygon exists when OSM maps buildings without cadastral parcel lines
  const hasLotPolygon = features.some(
    (f) => f.properties?.layer === 'lot' && f.geometry?.type?.includes('Polygon')
  );
  if (!hasLotPolygon && boundingBox && options.synthesizeSiteLot !== false) {
    const box = normalizeGeoBounds(boundingBox);
    const padLat = (box.north - box.south) * 0.08;
    const padLon = (box.east - box.west) * 0.08;
    const minLon = box.west + padLon;
    const maxLon = box.east - padLon;
    const minLat = box.south + padLat;
    const maxLat = box.north - padLat;
    features.unshift({
      type: 'Feature',
      id: 'site-parcel-bounds',
      properties: {
        name: options.siteLabel || 'Site Parcel Boundary',
        layer: 'lot',
        role: 'parcel',
        setback: 36,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [minLon, maxLat],
            [maxLon, maxLat],
            [maxLon, minLat],
            [minLon, minLat],
            [minLon, maxLat],
          ],
        ],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    attributionText,
    provider,
    licenseUrl,
    metadata: {
      attributionText,
      provider,
      licenseUrl,
    },
    geoBounds: boundingBox,
    features,
  };
}

export function buildOverpassParcelQuery(boundingBox) {
  const b = normalizeGeoBounds(boundingBox);
  const bboxStr = `${b.south.toFixed(6)},${b.west.toFixed(6)},${b.north.toFixed(6)},${b.east.toFixed(6)}`;
  return `[out:json][timeout:15];(way["boundary"~"parcel|lot|cadastre|property"](${bboxStr});way["parcel"](${bboxStr});way["landuse"~"residential|commercial|retail|industrial|allotments"](${bboxStr});way["building"](${bboxStr});way["power"="line"](${bboxStr});relation["boundary"~"parcel|lot|cadastre"](${bboxStr});relation["building"](${bboxStr}););out body geom;`;
}

/**
 * Queries public cadastral parcels and building footprints within the active site bounds
 * via Overpass API (using the dedicated 1 req/s Overpass RateLimiter) and returns GeoJSON.
 */
export async function fetchLiveParcelGeoJSON(options = {}) {
  if (isClientOffline(options)) {
    throw new Error(
      'Client is offline. Upload a local GeoJSON file or load the sample municipal lot.'
    );
  }

  let geocodeResult = null;
  let geoBounds = options.boundingBox || options.geoBounds || null;
  if (!geoBounds && options.query) {
    geocodeResult = await geocodeLocation(options.query, options);
    geoBounds = geocodeResult.boundingBox;
  } else if (!geoBounds) {
    const originLat = Number(options.origin?.latitude ?? options.origin?.lat ?? 37.7749);
    const originLon = Number(options.origin?.longitude ?? options.origin?.lon ?? -122.4194);
    geoBounds = computeSiteBoundingBox(originLat, originLon, options.spanMeters || 120);
  } else {
    geoBounds = normalizeGeoBounds(geoBounds);
  }

  const ql = buildOverpassParcelQuery(geoBounds);
  const fetchOpts = options.fetchImpl
    ? { fetchImpl: options.fetchImpl, signal: options.signal }
    : { signal: options.signal };

  const res = await gisRateLimitedFetch(OVERPASS_INTERPRETER_URL, {
    ...fetchOpts,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      ...(options.headers || {}),
    },
    body: `data=${encodeURIComponent(ql)}`,
  });

  if (!res.ok) {
    throw new Error(`Overpass vector query failed with HTTP ${res.status}`);
  }

  const payload = await res.json();
  const geojson = overpassToGeoJSON(payload, geoBounds, {
    synthesizeSiteLot: options.synthesizeSiteLot,
    siteLabel: geocodeResult?.displayName
      ? `Site Parcel (${geocodeResult.displayName.split(',')[0]})`
      : 'Site Parcel Boundary',
  });

  return {
    geojson,
    geocodeResult,
    geoBounds,
  };
}

export function lonLatToTileXY(lon, lat, zoom) {
  const n = Math.pow(2, zoom);
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const xFloat = ((lon + 180) / 360) * n;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    x: Math.max(0, Math.min(n - 1, Math.floor(xFloat))),
    y: Math.max(0, Math.min(n - 1, Math.floor(yFloat))),
    xFloat,
    yFloat,
  };
}

export function tileXYToLonLat(x, y, zoom) {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}

export function formatTileUrl(template, z, x, y) {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) {
    binary += String.fromCharCode(view[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

async function decodeTileImage(bytes, mimeType = 'image/png') {
  if (typeof createImageBitmap === 'function' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([bytes], { type: mimeType });
      return await createImageBitmap(blob);
    } catch {
      // Fall through to Image element decoding
    }
  }
  if (typeof Image !== 'undefined') {
    const b64 = bytesToBase64(bytes);
    const dataUrl = `data:${mimeType};base64,${b64}`;
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e || new Error('Tile image decode failed'));
      img.src = dataUrl;
      if (img.complete && img.naturalWidth > 0) {
        resolve(img);
      }
    });
  }
  return null;
}

/**
 * Fetches and stitches Web Mercator slippy raster tiles for any preset in `MAP_PRESETS`,
 * returning a georeferenced `dataUrl`, `width`, `height`, `geoBounds`, and `affineMatrix`.
 * Falls back cleanly to the preset's static SVG `dataUrl` when offline or unreachable.
 */
export async function stitchMapPresetTiles(presetKeyOrObj, options = {}) {
  const preset =
    typeof presetKeyOrObj === 'object' && presetKeyOrObj
      ? presetKeyOrObj
      : getMapPreset(presetKeyOrObj) || MAP_PRESETS.openstreetmap;

  const originLat = Number(
    options.lat ?? options.origin?.latitude ?? options.origin?.lat ?? 37.7749
  );
  const originLon = Number(
    options.lon ?? options.origin?.longitude ?? options.origin?.lon ?? -122.4194
  );
  const zoom = Math.min(
    preset.maxZoom || 19,
    Math.max(1, Number(options.zoom ?? preset.defaultZoom ?? 17))
  );
  const gridCols = Math.max(1, Math.min(4, Number(options.tileCols) || 2));
  const gridRows = Math.max(1, Math.min(4, Number(options.tileRows) || 2));
  const tileSize = 256;
  const width = gridCols * tileSize;
  const height = gridRows * tileSize;

  const centerTile = lonLatToTileXY(originLon, originLat, zoom);
  const maxIndex = Math.max(0, Math.pow(2, zoom) - 1);
  const startX = Math.max(
    0,
    Math.min(maxIndex - gridCols + 1, Math.round(centerTile.xFloat - gridCols / 2))
  );
  const startY = Math.max(
    0,
    Math.min(maxIndex - gridRows + 1, Math.round(centerTile.yFloat - gridRows / 2))
  );

  const nw = tileXYToLonLat(startX, startY, zoom);
  const se = tileXYToLonLat(startX + gridCols, startY + gridRows, zoom);
  const geoBounds = {
    west: nw.lon,
    north: nw.lat,
    east: se.lon,
    south: se.lat,
    minLon: nw.lon,
    maxLon: se.lon,
    minLat: se.lat,
    maxLat: nw.lat,
  };

  const pixelLon = (geoBounds.east - geoBounds.west) / width;
  const pixelLat = (geoBounds.south - geoBounds.north) / height; // negative (north-up)
  const worldfile = [pixelLon, 0, 0, pixelLat, geoBounds.west, geoBounds.north];
  const affineMatrix = options.targetPlanBounds
    ? [
        options.targetPlanBounds.w / width,
        0,
        0,
        options.targetPlanBounds.h / height,
        options.targetPlanBounds.x,
        options.targetPlanBounds.y,
      ]
    : worldfileToAffineMatrix(worldfile, 'EPSG:4326', 'PLAN');

  if (isClientOffline(options) || !preset.tileUrlTemplate) {
    return {
      presetKey: preset.id,
      dataUrl: preset.dataUrl,
      width: 800,
      height: 600,
      geoBounds,
      affineMatrix,
      attributionText: preset.attributionText,
      provider: preset.provider,
      licenseUrl: preset.licenseUrl,
      isOfflineFallback: true,
    };
  }

  const fetchOpts = options.fetchImpl
    ? { fetchImpl: options.fetchImpl, signal: options.signal }
    : { signal: options.signal };

  const tileTasks = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const tx = startX + col;
      const ty = startY + row;
      const url = formatTileUrl(preset.tileUrlTemplate, zoom, tx, ty);
      tileTasks.push(
        (async () => {
          const res = await gisRateLimitedFetch(url, fetchOpts);
          if (!res.ok) throw new Error(`Tile HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          const mime =
            res.headers?.get?.('content-type') ||
            (url.endsWith('.jpg') || url.endsWith('.jpeg') ? 'image/jpeg' : 'image/png');
          return { col, row, bytes: new Uint8Array(buf), mime, url };
        })()
      );
    }
  }

  const settled = await Promise.allSettled(tileTasks);
  const fulfilledTiles = settled
    .filter((s) => s.status === 'fulfilled' && s.value.bytes.length > 0)
    .map((s) => s.value);

  if (fulfilledTiles.length === 0) {
    return {
      presetKey: preset.id,
      dataUrl: preset.dataUrl,
      width: 800,
      height: 600,
      geoBounds,
      affineMatrix,
      attributionText: preset.attributionText,
      provider: preset.provider,
      licenseUrl: preset.licenseUrl,
      isOfflineFallback: true,
    };
  }

  let stitchedDataUrl = null;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    if (canvas && typeof canvas.getContext === 'function') {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      let drawnCount = 0;
      if (ctx && typeof ctx.drawImage === 'function') {
        for (const tile of fulfilledTiles) {
          try {
            const decoded = await decodeTileImage(tile.bytes, tile.mime);
            if (decoded) {
              ctx.drawImage(decoded, tile.col * tileSize, tile.row * tileSize, tileSize, tileSize);
              drawnCount++;
            }
          } catch {
            // Continue stitching remaining tiles
          }
        }
        if (drawnCount > 0 && typeof canvas.toDataURL === 'function') {
          const candidate = canvas.toDataURL('image/png');
          if (candidate && candidate.startsWith('data:image/') && candidate.length > 32) {
            stitchedDataUrl = candidate;
          }
        }
      }
    }
  }

  // Headless / mock environment fallback when <canvas>.toDataURL is unimplemented
  if (!stitchedDataUrl) {
    const totalLen = fulfilledTiles.reduce((acc, t) => acc + t.bytes.length, 0);
    const combined = new Uint8Array(totalLen);
    let offset = 0;
    for (const t of fulfilledTiles) {
      combined.set(t.bytes, offset);
      offset += t.bytes.length;
    }
    const mime = fulfilledTiles[0].mime || 'image/png';
    stitchedDataUrl = `data:${mime};base64,${bytesToBase64(combined)}`;
  }

  return {
    presetKey: preset.id,
    dataUrl: stitchedDataUrl,
    width,
    height,
    x: affineMatrix[4],
    y: affineMatrix[5],
    scale: Math.hypot(affineMatrix[0], affineMatrix[1]) || 1,
    affineMatrix,
    geoBounds: computeGeoBounds(affineMatrix, width, height, 'PLAN'),
    rawGeoBounds: geoBounds,
    attributionText: preset.attributionText,
    provider: preset.provider,
    licenseUrl: preset.licenseUrl,
    tileCount: fulfilledTiles.length,
    isOfflineFallback: false,
  };
}

/**
 * Fetches high-resolution Google Maps satellite imagery using the user's personal API key,
 * converting the response into a self-contained base64 dataURL so the API key is never
 * persisted in project state or exported files.
 */
export async function fetchGoogleSatelliteBlueprint(options = {}) {
  if (isClientOffline(options)) {
    throw new Error('Client is offline. Cannot fetch Google Maps satellite imagery.');
  }
  const apiKey = (options.apiKey ?? getGoogleMapsApiKey(options.storage)).trim();
  if (!apiKey) {
    throw new Error('Enter a Google Maps API key to fetch Google Satellite imagery.');
  }

  let lat = Number(options.lat ?? options.origin?.latitude ?? options.origin?.lat);
  let lon = Number(options.lon ?? options.origin?.longitude ?? options.origin?.lon);
  let geocodeResult = null;
  if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && options.query) {
    geocodeResult = await geocodeLocation(options.query, { ...options, apiKey });
    lat = geocodeResult.lat;
    lon = geocodeResult.lon;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    lat = 37.7749;
    lon = -122.4194;
  }

  const zoom = Math.max(15, Math.min(20, Number(options.zoom) || 19));
  const sizePx = 640;
  const scaleFactor = 2;
  const width = sizePx * scaleFactor;
  const height = sizePx * scaleFactor;
  const url = `${GOOGLE_STATIC_MAP_URL}?center=${lat.toFixed(6)},${lon.toFixed(6)}&zoom=${zoom}&size=${sizePx}x${sizePx}&scale=${scaleFactor}&maptype=satellite&key=${encodeURIComponent(apiKey)}`;

  const fetchOpts = options.fetchImpl
    ? { fetchImpl: options.fetchImpl, signal: options.signal }
    : { signal: options.signal };
  const res = await gisRateLimitedFetch(url, fetchOpts);
  if (!res.ok) {
    throw new Error(`Google Static Maps failed with HTTP ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = res.headers?.get?.('content-type') || 'image/png';
  const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;

  const geoBounds = computeSiteBoundingBox(lat, lon, 120);
  const affineMatrix = options.targetPlanBounds
    ? [
        options.targetPlanBounds.w / width,
        0,
        0,
        options.targetPlanBounds.h / height,
        options.targetPlanBounds.x,
        options.targetPlanBounds.y,
      ]
    : [1, 0, 0, 1, 0, 0];

  return {
    presetKey: 'google-satellite',
    dataUrl,
    width,
    height,
    x: affineMatrix[4],
    y: affineMatrix[5],
    scale: Math.hypot(affineMatrix[0], affineMatrix[1]) || 1,
    affineMatrix,
    geoBounds,
    geocodeResult,
    attributionText: 'Imagery © Google',
    provider: 'Google Maps',
    licenseUrl: 'https://cloud.google.com/maps-platform/terms',
    isGeospatial: true,
  };
}
