import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { reproject, reprojectionCache } from '../js/geometry.js';
import { exportGeoJSON, importGeoJSON } from '../js/app.js';

test('Multi-CRS Model State & Fallback Deserialization', () => {
  // Test 1: newState includes default CRS definition
  const state = M.newState();
  assert.ok(state.crs, 'newState() must initialize state.crs');
  assert.equal(state.crs.epsg, 'EPSG:4326', 'Default EPSG should be EPSG:4326');
  assert.ok(state.crs.proj4, 'Default CRS must include proj4 definition string');
  assert.ok(state.crs.wkt, 'Default CRS must include WKT definition string');
  assert.ok(state.crs.origin, 'Default CRS must include geographic origin');

  // Test 2: deserialize preserves valid custom CRS definitions
  const customState = M.newState();
  customState.crs = {
    epsg: 'EPSG:2227',
    proj4:
      '+proj=lcc +lat_0=36.5 +lon_0=-120.5 +lat_1=38.43333333333333 +lat_2=37.06666666666667 +x_0=2000000.0001016 +y_0=500000.0001016 +datum=NAD83 +units=us-ft +no_defs',
    wkt: 'PROJCS["NAD83 / California zone 3 (ftUS)"]',
    origin: { longitude: -122.4194, latitude: 37.7749 },
    units: 'us-ft',
  };
  const serialized = M.serialize(customState);
  const deserialized = M.deserialize(serialized);
  assert.equal(deserialized.crs.epsg, 'EPSG:2227', 'deserialized state must preserve EPSG:2227');
  assert.equal(deserialized.crs.units, 'us-ft', 'deserialized state must preserve units');

  // Test 3: deserialize falls back to default EPSG:4326 when EPSG is missing or invalid
  const invalidJson = JSON.stringify({
    version: 2,
    rooms: [],
    crs: { epsg: 'INVALID_EPSG_CODE' },
  });
  const fallbackState = M.deserialize(invalidJson);
  assert.equal(
    fallbackState.crs.epsg,
    'EPSG:4326',
    'Invalid EPSG code must fall back to EPSG:4326'
  );
  assert.ok(fallbackState.crs.proj4, 'Fallback state must possess default proj4 definition');
});

test('Multi-CRS Reprojection Engine across State Plane, UTM, Web Mercator, WGS84, and PLAN', () => {
  // Test 1: WGS84 (EPSG:4326) <-> Web Mercator (EPSG:3857)
  const sfLonLat = [-122.4194, 37.7749];
  const sfMercator = reproject(sfLonLat, 'EPSG:4326', 'EPSG:3857');
  assert.ok(
    Math.abs(sfMercator[0] - -13627665.27) < 1.0,
    'X coordinate in Web Mercator should match expected meters'
  );
  assert.ok(
    Math.abs(sfMercator[1] - 4547675.35) < 1.0,
    'Y coordinate in Web Mercator should match expected meters'
  );

  const sfLonLatBack = reproject(sfMercator, 'EPSG:3857', 'EPSG:4326');
  assert.ok(Math.abs(sfLonLatBack[0] - sfLonLat[0]) < 1e-6, 'Lon roundtrip millimeter accuracy');
  assert.ok(Math.abs(sfLonLatBack[1] - sfLonLat[1]) < 1e-6, 'Lat roundtrip millimeter accuracy');

  // Test 2: WGS84 (EPSG:4326) <-> UTM Zone 10N (EPSG:32610 / EPSG:26910)
  const utmCoords = reproject(sfLonLat, 'EPSG:4326', 'EPSG:26910');
  assert.ok(
    utmCoords[0] > 500000 && utmCoords[0] < 600000,
    'UTM easting in Zone 10N should be reasonable'
  );
  assert.ok(
    utmCoords[1] > 4100000 && utmCoords[1] < 4200000,
    'UTM northing in Zone 10N should be reasonable'
  );

  const utmRoundtrip = reproject(utmCoords, 'EPSG:26910', 'EPSG:4326');
  assert.ok(Math.abs(utmRoundtrip[0] - sfLonLat[0]) < 1e-5, 'UTM roundtrip longitude match');
  assert.ok(Math.abs(utmRoundtrip[1] - sfLonLat[1]) < 1e-5, 'UTM roundtrip latitude match');

  // Test 3: WGS84 (EPSG:4326) <-> State Plane California Zone 3 (EPSG:2227)
  const spCoords = reproject(sfLonLat, 'EPSG:4326', 'EPSG:2227');
  assert.ok(spCoords[0] > 500000 && spCoords[0] < 7000000, 'State Plane Easting in US Survey Feet');

  const spRoundtrip = reproject(spCoords, 'EPSG:2227', 'EPSG:4326');
  assert.ok(Math.abs(spRoundtrip[0] - sfLonLat[0]) < 1e-5, 'State Plane roundtrip longitude match');
  assert.ok(Math.abs(spRoundtrip[1] - sfLonLat[1]) < 1e-5, 'State Plane roundtrip latitude match');

  // Test 4: Local PLAN Inches <-> EPSG:4326
  const crsState = M.defaultCRS();
  const planInchPt = [120, 120]; // 10 ft East (+X), 10 ft South (+Y)
  const geoPt = reproject(planInchPt, 'PLAN', crsState);
  assert.ok(geoPt[0] > sfLonLat[0], '10ft East should increase longitude');
  assert.ok(geoPt[1] < sfLonLat[1], '10ft South should decrease latitude');

  const inchBack = reproject(geoPt, crsState, 'PLAN');
  assert.ok(
    Math.abs(inchBack[0] - planInchPt[0]) < 1e-3,
    'Plan inch X roundtrip millimeter accuracy'
  );
  assert.ok(
    Math.abs(inchBack[1] - planInchPt[1]) < 1e-3,
    'Plan inch Y roundtrip millimeter accuracy'
  );
});

test('Spatial Reprojection Caching Performance', () => {
  reprojectionCache.clear();
  const point = [-122.4194, 37.7749];

  for (let i = 0; i < 100; i++) {
    reproject([100 + i * 0.0001, 200 + i * 0.0001], 'PLAN', 'EPSG:4326');
  }

  const startCache = performance.now();
  for (let i = 0; i < 1000; i++) {
    reproject(point, 'EPSG:4326', 'EPSG:3857');
  }
  const durationCache = performance.now() - startCache;

  assert.ok(
    durationCache < 20,
    'Cached reprojections must complete rapidly (<20ms for 1000 calls)'
  );
});

test('GeoJSON Feature Collection Import & Export Workflows', () => {
  const state = M.newState();
  M.createRoom(state, 'living', 0, 0, 240, 180); // 20ft x 15ft
  M.addItem(state, state.rooms[0], 'sofa', { x: 120, y: 90 });

  // Test 1: Export GeoJSON FeatureCollection in EPSG:4326
  const geojson = exportGeoJSON(state, 'EPSG:4326');
  assert.equal(geojson.type, 'FeatureCollection', 'GeoJSON export must be a FeatureCollection');
  assert.equal(geojson.features.length, 2, 'Should export room polygon and sofa point');

  const roomFeature = geojson.features.find((f) => f.geometry.type === 'Polygon');
  assert.ok(roomFeature, 'Room feature must be a Polygon');
  assert.equal(
    roomFeature.geometry.coordinates[0].length,
    5,
    'Polygon ring must have 5 closed coordinates'
  );
  assert.equal(roomFeature.properties.name, 'Living room', 'Property name should match');

  // Test 2: Import GeoJSON Parcel / Room Boundaries
  const newStateObj = M.newState();
  const importedCount = importGeoJSON(geojson, newStateObj);
  assert.equal(importedCount, 1, 'Should import 1 room polygon');
  assert.equal(newStateObj.rooms.length, 1, 'Imported room should be added to state');
  assert.ok(
    Math.abs(newStateObj.rooms[0].w - 240) <= 6,
    'Imported room width should match 240 inches within grid snap'
  );
  assert.ok(
    Math.abs(newStateObj.rooms[0].h - 180) <= 6,
    'Imported room height should match 180 inches within grid snap'
  );
});
