import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as M from '../js/model.js';
import { commit } from '../js/codes.js';
import { draw } from '../js/render.js';
import { resolvePDFAttributionAndLicensing, generatePDF } from '../js/pdfEngine.js';
import { GISBridge } from '../js/gisBridge.js';
import { computeContoursAsync } from '../js/elevationEngine.js';
import {
  RateLimiter,
  getGisRateLimiter,
  gisRateLimitedFetch,
  clearGisRateLimiters,
} from '../js/rateLimiter.js';
import {
  GOOGLE_MAPS_API_KEY_STORAGE,
  getGoogleMapsApiKey,
  setGoogleMapsApiKey,
  clearGoogleMapsApiKey,
  parseCoordinatesInput,
  geocodeLocation,
  fetchLiveElevationGrid,
  fetchLiveParcelGeoJSON,
  stitchMapPresetTiles,
  fetchGoogleSatelliteBlueprint,
  resetGoogleMapsSdkLoaderForTest,
} from '../js/gisClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!globalThis.Image) {
  globalThis.Image = class {
    constructor() {
      this.complete = true;
      this.naturalWidth = 256;
      this.naturalHeight = 256;
    }
  };
}

function createMockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function jsonResponse(payload, status = 200) {
  const text = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

function binaryResponse(bytes, mime = 'image/png', status = 200) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? mime : null) },
    arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
  };
}

// Minimal 1x1 PNG bytes
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
);

test('Geocoding parses direct coordinates and queries Nominatim and Google Maps with fallback', async () => {
  clearGisRateLimiters();
  const direct = parseCoordinatesInput('37.7749° N, 122.4194° W');
  assert.ok(direct);
  assert.equal(direct.lat, 37.7749);
  assert.equal(direct.lon, -122.4194);
  assert.equal(direct.isCoordinate, true);

  const storage = createMockStorage();
  const seenUrls = [];
  const fetchMock = async (url) => {
    seenUrls.push(String(url));
    if (String(url).includes('nominatim.openstreetmap.org')) {
      return jsonResponse([
        {
          lat: '37.7751',
          lon: '-122.4193',
          display_name: '100 Van Ness Ave, San Francisco, CA',
          boundingbox: ['37.7745', '37.7756', '-122.4200', '-122.4186'],
        },
      ]);
    }
    if (String(url).includes('maps.googleapis.com/maps/api/geocode/json')) {
      return jsonResponse({
        status: 'OK',
        results: [
          {
            formatted_address: '1600 Amphitheatre Pkwy, Mountain View, CA',
            geometry: { location: { lat: 37.422, lng: -122.0841 } },
          },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const osmRes = await geocodeLocation('100 Van Ness Ave, San Francisco', {
    storage,
    fetchImpl: fetchMock,
  });
  assert.equal(osmRes.provider, 'OpenStreetMap Nominatim');
  assert.ok(Math.abs(osmRes.lat - 37.7751) < 1e-4);
  assert.equal(osmRes.licenseUrl, 'https://www.openstreetmap.org/copyright');

  setGoogleMapsApiKey('AIzaTestPersonalKey123', storage);
  const googleRes = await geocodeLocation('1600 Amphitheatre Pkwy', {
    storage,
    fetchImpl: fetchMock,
  });
  assert.equal(googleRes.provider, 'Google Maps');
  assert.ok(Math.abs(googleRes.lat - 37.422) < 1e-4);
  assert.ok(seenUrls.some((u) => u.includes('key=AIzaTestPersonalKey123')));
});

test('Dedicated GIS RateLimiters cap Nominatim & Overpass to 1 req/s and isolate from defaultRateLimiter', async () => {
  clearGisRateLimiters();
  const nominatimLimiter = getGisRateLimiter('https://nominatim.openstreetmap.org/search?q=test');
  const overpassLimiter = getGisRateLimiter('https://overpass-api.de/api/interpreter');
  const tileLimiter = getGisRateLimiter('https://a.tile.openstreetmap.org/18/41935/101311.png');

  assert.equal(nominatimLimiter.capacity, 1);
  assert.equal(nominatimLimiter.refillRate, 1);
  assert.equal(nominatimLimiter.maxConcurrency, 1);
  assert.equal(overpassLimiter.capacity, 1);
  assert.equal(overpassLimiter.refillRate, 1);
  assert.equal(overpassLimiter.maxConcurrency, 1);
  assert.notEqual(nominatimLimiter, overpassLimiter);
  assert.notEqual(nominatimLimiter, tileLimiter);

  // Saturate a 3D asset limiter completely to verify GIS calls never wait on it
  const saturatedAssetLimiter = new RateLimiter({
    capacity: 1,
    refillRate: 0.01,
    maxConcurrency: 1,
  });
  let releaseAsset;
  const blockedPromise = saturatedAssetLimiter.fetch('https://dl.polyhaven.org/texture.jpg', {
    fetchImpl: () =>
      new Promise((res) => {
        releaseAsset = () => res(binaryResponse(TINY_PNG));
      }),
  });

  const start = Date.now();
  const gisRes = await gisRateLimitedFetch('https://nominatim.openstreetmap.org/search?q=sf', {
    fetchImpl: async () => jsonResponse([]),
  });
  const elapsed = Date.now() - start;
  assert.equal(gisRes.ok, true);
  assert.ok(elapsed < 400, `GIS request completed in ${elapsed}ms without waiting on 3D limiter`);

  releaseAsset();
  await blockedPromise;
});

test('fetchLiveElevationGrid parses Open-Meteo, Open-Elevation fallback, and Google Maps JS ElevationService into contours', async () => {
  clearGisRateLimiters();
  resetGoogleMapsSdkLoaderForTest();

  // 1. Open-Meteo live terrain -> ElevationGrid -> Marching Squares contours
  const openRes = await fetchLiveElevationGrid({
    query: '37.7749, -122.4194',
    cols: 4,
    rows: 4,
    contourInterval: 2.0,
    fetchImpl: async (url) => {
      assert.ok(String(url).includes('api.open-meteo.com/v1/elevation'));
      return jsonResponse({
        elevation: [10, 12, 14, 16, 11, 13, 15, 17, 12, 14, 16, 18, 13, 15, 17, 20],
      });
    },
  });
  assert.equal(openRes.grid.width, 4);
  assert.equal(openRes.grid.height, 4);
  assert.equal(openRes.grid.minElevation, 10);
  assert.equal(openRes.grid.maxElevation, 20);
  assert.equal(openRes.grid.provider, 'Copernicus DEM / Open-Meteo');

  const contours = await computeContoursAsync(openRes.grid);
  assert.ok(contours.length > 0, 'Should generate topographic contour isolines');

  // 2. Fallback to Open-Elevation when Open-Meteo fails
  clearGisRateLimiters();
  const fallbackRes = await fetchLiveElevationGrid({
    query: '37.7749, -122.4194',
    cols: 2,
    rows: 2,
    fetchImpl: async (url) => {
      if (String(url).includes('open-meteo.com')) {
        return jsonResponse({ error: true }, 503);
      }
      if (String(url).includes('open-elevation.com')) {
        return jsonResponse({
          results: [{ elevation: 25 }, { elevation: 30 }, { elevation: 35 }, { elevation: 40 }],
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });
  assert.equal(fallbackRes.grid.provider, 'Open-Elevation / SRTM');
  assert.equal(fallbackRes.grid.maxElevation, 40);

  // 3. Google Maps JS ElevationService (CORS-safe browser SDK path)
  const prevGoogle = globalThis.google;
  globalThis.google = {
    maps: {
      ElevationService: class {
        getElevationForLocations({ locations }, cb) {
          const results = locations.map((loc, idx) => ({
            elevation: 50 + idx * 1.5,
            resolution: 4.7,
            location: { lat: () => loc.lat, lng: () => loc.lng },
          }));
          cb(results, 'OK');
        }
      },
    },
  };
  try {
    const gRes = await fetchLiveElevationGrid({
      query: '37.7749, -122.4194',
      provider: 'google',
      apiKey: 'AIzaBrowserSdkKey',
      cols: 3,
      rows: 3,
    });
    assert.equal(gRes.grid.provider, 'Google Maps');
    assert.equal(gRes.grid.attributionText, 'Elevation Data © Google');
    assert.equal(gRes.grid.source, 'google-elevation');
    assert.equal(gRes.grid.minElevation, 50);
  } finally {
    globalThis.google = prevGoogle;
  }
});

test('fetchLiveParcelGeoJSON converts Overpass cadastral & building vectors and imports via GISBridge.importGeoJSON', async () => {
  clearGisRateLimiters();
  const overpassSample = {
    elements: [
      {
        type: 'way',
        id: 501,
        tags: { boundary: 'parcel', name: 'Parcel 402A', setback: '48' },
        geometry: [
          { lon: -122.4198, lat: 37.7752 },
          { lon: -122.419, lat: 37.7752 },
          { lon: -122.419, lat: 37.7746 },
          { lon: -122.4198, lat: 37.7746 },
          { lon: -122.4198, lat: 37.7752 },
        ],
      },
      {
        type: 'way',
        id: 502,
        tags: { building: 'residential', name: 'Neighbor Residence' },
        geometry: [
          { lon: -122.4196, lat: 37.775 },
          { lon: -122.4193, lat: 37.775 },
          { lon: -122.4193, lat: 37.7748 },
          { lon: -122.4196, lat: 37.7748 },
          { lon: -122.4196, lat: 37.775 },
        ],
      },
    ],
  };

  const { geojson, geoBounds } = await fetchLiveParcelGeoJSON({
    query: '37.7749, -122.4194',
    fetchImpl: async (url, init) => {
      assert.ok(String(url).includes('overpass-api.de/api/interpreter'));
      assert.equal(init.method, 'POST');
      return jsonResponse(overpassSample);
    },
  });

  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features.length, 2);

  const bridge = new GISBridge();
  const site = bridge.importGeoJSON(geojson, {
    targetBounds: { x: 50, y: 50, w: 1100, h: 800 },
    crs: 'EPSG:4326',
    attributionText: geojson.metadata.attributionText,
    provider: geojson.metadata.provider,
    licenseUrl: geojson.metadata.licenseUrl,
    geoBounds,
  });

  assert.ok(site.segments.length >= 4, 'GISBridge should extract parcel setback segments');
  assert.ok(site.attributionText.includes('© OpenStreetMap contributors'));
  assert.equal(site.licenseUrl, 'https://www.openstreetmap.org/copyright');
});

test('MAP_PRESETS stitch live raster tiles, preserve official license links, and fall back to static SVG offline', async () => {
  const expectedLicenses = {
    openstreetmap: 'https://www.openstreetmap.org/copyright',
    'carto-positron': 'https://carto.com/attributions',
    'usgs-topo':
      'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    'copernicus-sentinel':
      'https://sentinels.copernicus.eu/documents/247904/685211/Sentinel_Data_Legal_Notice.pdf',
  };

  for (const [presetId, expectedUrl] of Object.entries(expectedLicenses)) {
    clearGisRateLimiters();
    const preset = M.getMapPreset(presetId);
    assert.equal(preset.licenseUrl, expectedUrl);

    const live = await stitchMapPresetTiles(presetId, {
      lat: 37.7749,
      lon: -122.4194,
      tileCols: 2,
      tileRows: 2,
      fetchImpl: async () => binaryResponse(TINY_PNG, 'image/png'),
    });
    assert.equal(live.isOfflineFallback, false);
    assert.equal(live.tileCount, 4);
    assert.ok(live.dataUrl.startsWith('data:image/'));
    assert.notEqual(live.dataUrl, preset.dataUrl, 'Live stitched dataUrl replaces static SVG');
    assert.equal(live.licenseUrl, expectedUrl);

    const offline = await stitchMapPresetTiles(presetId, { online: false });
    assert.equal(offline.isOfflineFallback, true);
    assert.equal(offline.dataUrl, preset.dataUrl);
  }
});

test('Custom blueprint protection prevents pairing uploaded blueprint dataUrl with preset attribution and handles confirmation', async () => {
  const appMod = await import('../js/app.js');
  const customDataUrl = 'data:image/png;base64,CUSTOM_UPLOADED_SURVEY_BLUEPRINT';

  // 1. Model-level applyMapPreset never pairs custom blueprint dataUrl with preset attribution
  const state = M.newState();
  state.background = {
    dataUrl: customDataUrl,
    x: 10,
    y: 20,
    scale: 2,
    opacity: 0.7,
    visible: true,
    locked: true,
    width: 1000,
    height: 800,
    attributionText: null,
    provider: null,
    presetKey: null,
  };

  // Declining overwrite keeps custom blueprint untouched without preset attribution
  M.applyMapPreset(state, 'openstreetmap', { confirmOverwrite: false });
  assert.equal(state.background.dataUrl, customDataUrl);
  assert.equal(state.background.attributionText, null);
  assert.equal(state.background.presetKey, null);

  // Confirming overwrite replaces BOTH dataUrl and attribution cleanly
  M.applyMapPreset(state, 'openstreetmap');
  assert.notEqual(state.background.dataUrl, customDataUrl);
  assert.equal(state.background.attributionText, '© OpenStreetMap contributors');
  assert.equal(state.background.presetKey, 'openstreetmap');

  // Switching from one preset to another replaces preset imagery without confirmation prompt
  M.applyMapPreset(state, 'usgs-topo');
  assert.equal(state.background.presetKey, 'usgs-topo');
  assert.equal(state.background.provider, 'USGS');

  // 2. App-level handleMapPresetSelect prompts confirmFn before overwriting custom blueprint
  const activeDoc = appMod.getActiveDoc();
  activeDoc.background = {
    dataUrl: customDataUrl,
    x: 0,
    y: 0,
    scale: 1,
    opacity: 0.6,
    visible: true,
    locked: false,
    width: 900,
    height: 700,
    attributionText: null,
    provider: null,
    presetKey: null,
  };

  let promptCount = 0;
  await appMod.handleMapPresetSelect('carto-positron', {
    confirmFn: async () => {
      promptCount++;
      return false; // Decline replacement
    },
    online: false,
  });
  assert.equal(promptCount, 1);
  assert.equal(activeDoc.background.dataUrl, customDataUrl);
  assert.equal(activeDoc.background.attributionText, null);

  await appMod.handleMapPresetSelect('carto-positron', {
    confirmFn: async () => {
      promptCount++;
      return true; // Confirm replacement
    },
    fetchImpl: async () => binaryResponse(TINY_PNG, 'image/png'),
  });
  assert.equal(promptCount, 2);
  assert.notEqual(activeDoc.background.dataUrl, customDataUrl);
  assert.equal(activeDoc.background.presetKey, 'carto-positron');
  assert.equal(activeDoc.background.attributionText, '© OpenStreetMap contributors, © CARTO');
});

test('Google Maps API key stays exclusively in localStorage and is never serialized into exported project JSON', async () => {
  const storage = createMockStorage();
  const secretKey = 'AIzaSySecretPersonalKey99999';
  setGoogleMapsApiKey(secretKey, storage);
  assert.equal(getGoogleMapsApiKey(storage), secretKey);
  assert.equal(storage.getItem(GOOGLE_MAPS_API_KEY_STORAGE), secretKey);

  const sat = await fetchGoogleSatelliteBlueprint({
    query: '37.7749, -122.4194',
    storage,
    fetchImpl: async (url) => {
      assert.ok(String(url).includes(`key=${secretKey}`));
      return binaryResponse(TINY_PNG, 'image/png');
    },
  });

  const state = M.newState();
  state.background = {
    ...sat,
    googleMapsApiKey: secretKey, // Simulate accidental property attachment
    sourceUrl: `https://maps.googleapis.com/maps/api/staticmap?center=0,0&key=${secretKey}`,
  };
  state.settings = {
    ...state.settings,
    googleApiKey: secretKey,
  };

  const exportedJson = M.serialize(state);
  assert.ok(
    !exportedJson.includes(secretKey),
    'Serialized project JSON must never contain user-supplied Google Maps API key'
  );

  clearGoogleMapsApiKey(storage);
  assert.equal(getGoogleMapsApiKey(storage), '');
});

test('Canvas, 3D HUD, and PDF aggregate deduplicated attributions across basemap, parcels, and elevation layers', async () => {
  let state = M.newState();
  const res = commit(state, (n) => M.placeRoomKit(n, 'kit_living', 100, 100, 0));
  if (res.ok) state = res.state;

  M.applyMapPreset(state, 'usgs-topo');
  state.site = {
    crs: 'EPSG:4326',
    features: [{ type: 'Feature', id: 'p1', properties: { layer: 'lot' }, geometry: null }],
    segments: [{ id: 's1', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, setback: 36 }],
    attributionText: '© OpenStreetMap contributors',
    provider: 'OpenStreetMap / Overpass API',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
  };

  const { grid } = await fetchLiveElevationGrid({
    query: '37.7749, -122.4194',
    cols: 3,
    rows: 3,
    fetchImpl: async () => jsonResponse({ elevation: [5, 6, 7, 6, 7, 8, 7, 8, 9] }),
  });
  state.elevationGrid = grid;

  // 1. 2D Canvas overlay badge
  const textCalls = [];
  const mockCtx = new Proxy(
    {
      canvas: { width: 900, height: 700, style: {} },
      fillText: (txt) => textCalls.push(txt),
      measureText: (txt) => ({ width: txt.length * 6 }),
      createPattern: () => ({}),
    },
    {
      get(target, prop) {
        return prop in target ? target[prop] : () => {};
      },
    }
  );
  const prevDoc = globalThis.document;
  if (!globalThis.document) {
    const noop2d = new Proxy(
      {
        measureText: (txt) => ({ width: txt.length * 6 }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => ({}),
      },
      { get: (t, p) => (p in t ? t[p] : () => {}) }
    );
    globalThis.document = {
      addEventListener: () => {},
      removeEventListener: () => {},
      createElement: () => ({ width: 256, height: 256, style: {}, getContext: () => noop2d }),
    };
  }
  try {
    draw(mockCtx, state, { scale: 1, ox: 0, oy: 0 });
  } finally {
    globalThis.document = prevDoc;
  }
  const combinedBadge = textCalls.find(
    (t) =>
      t.includes('U.S. Geological Survey') &&
      t.includes('© OpenStreetMap contributors') &&
      t.includes('Copernicus DEM / Open-Meteo')
  );
  assert.ok(
    combinedBadge,
    '2D Canvas badge should aggregate basemap, parcel, and elevation attributions'
  );

  // 2. Vector PDF title block & footer licensing
  const pdfAttr = resolvePDFAttributionAndLicensing(state);
  assert.ok(pdfAttr.attribution.includes('U.S. Geological Survey'));
  assert.ok(pdfAttr.attribution.includes('© OpenStreetMap contributors'));
  assert.ok(pdfAttr.attribution.includes('Elevation Data © Copernicus DEM / Open-Meteo'));
  assert.ok(pdfAttr.licenseNotice.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(
    pdfAttr.licenseNotice.includes(
      'https://sentinels.copernicus.eu/documents/247904/685211/Sentinel_Data_Legal_Notice.pdf'
    )
  );

  const pdfDoc = generatePDF(state);
  assert.ok(pdfDoc.output('arraybuffer').byteLength > 500);
});

test('Scenario 1 & Terrain replacement: one-step parcel + contour import and replacing existing terrain without clearing', async () => {
  clearGisRateLimiters();
  const appMod = await import('../js/app.js');

  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(
    html.includes('id="btn-fetch-elevation"'),
    '#dlg-elevation should include Fetch Live Terrain button'
  );
  assert.ok(
    html.includes('id="btn-upload-elevation-file"'),
    '#dlg-elevation should include Upload Terrain File button so users can replace terrain without clearing'
  );
  assert.ok(
    html.includes('id="gis-import-site-all"'),
    '#dlg-gis should include one-step Import Parcels & Contours button'
  );

  const fetchMock = async (url) => {
    const s = String(url);
    if (s.includes('nominatim.openstreetmap.org')) {
      return jsonResponse([
        {
          lat: '37.7749',
          lon: '-122.4194',
          display_name: '1 Market St, San Francisco, CA',
          boundingbox: ['37.7744', '37.7754', '-122.4200', '-122.4188'],
        },
      ]);
    }
    if (s.includes('overpass-api.de')) {
      return jsonResponse({
        elements: [
          {
            type: 'way',
            id: 900,
            tags: { boundary: 'parcel', name: '1 Market Parcel' },
            geometry: [
              { lon: -122.4198, lat: 37.7752 },
              { lon: -122.419, lat: 37.7752 },
              { lon: -122.419, lat: 37.7746 },
              { lon: -122.4198, lat: 37.7746 },
              { lon: -122.4198, lat: 37.7752 },
            ],
          },
        ],
      });
    }
    if (s.includes('api.open-meteo.com')) {
      return jsonResponse({
        elevation: Array.from({ length: 16 }, (_, idx) => 12 + idx * 0.75),
      });
    }
    throw new Error(`Unexpected URL: ${s}`);
  };

  const imported = await appMod.importLiveSiteParcelsAndContours({
    query: '1 Market St, San Francisco, CA',
    cols: 4,
    rows: 4,
    fetchImpl: fetchMock,
  });

  assert.ok(imported.site.segments.length >= 4);
  assert.equal(imported.elevationGrid.width, 4);
  assert.ok(imported.contours.length > 0);

  // Replace existing elevation dataset directly without clearing first!
  clearGisRateLimiters();
  const replaced = await appMod.fetchTerrainFromDialog({
    query: '37.8000, -122.4100',
    cols: 3,
    rows: 3,
    fetchImpl: async () => jsonResponse({ elevation: [40, 42, 44, 41, 43, 45, 42, 44, 48] }),
  });
  assert.equal(appMod.getActiveDoc().elevationGrid.maxElevation, 48);
  assert.equal(replaced.grid.width, 3);
});
