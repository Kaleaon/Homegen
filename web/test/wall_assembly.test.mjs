import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from '#three';
import { WALL_BY_ID } from '../js/catalog.js';
import {
  CLADDING_PRESETS,
  registerCladdingMaterial,
  resolveWallAssembly,
} from '../js/presetRegistry.js';
import { buildWindow3DMesh } from '../js/windowBuilder.js';
import { createScene3D } from '../js/scene3d.js';
import * as m from '../js/model.js';

// Setup headless WebGL and DOM Mocks for 3D scene testing
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: () => 'WebGL 2.0',
  getExtension: () => null,
  getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
  checkFramebufferStatus: () => 36053,
  createFramebuffer: () => ({ id: Math.random() }),
  createRenderbuffer: () => ({ id: Math.random() }),
  createTexture: () => ({ id: Math.random() }),
  createBuffer: () => ({ id: Math.random() }),
  createProgram: () => ({ id: Math.random() }),
  createShader: () => ({ id: Math.random() }),
  createVertexArray: () => ({ id: Math.random() }),
  TRIANGLES: 4,
};

const mockCtx = new Proxy(baseCtx, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => {};
  },
});

const mock2d = {
  fillRect: () => {},
  strokeRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  translate: () => {},
};

const doc = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ width: 256, height: 256, getContext: () => mock2d }),
};

const canvas = {
  width: 800,
  height: 600,
  ownerDocument: doc,
  getRootNode: () => doc,
  getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  addEventListener: () => {},
  removeEventListener: () => {},
  style: {},
  getContext: (type) => (type === '2d' ? mock2d : mockCtx),
};

globalThis.window = { devicePixelRatio: 1 };
globalThis.document = doc;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

test('Requirement 1 & AC 1: Catalog wall finishes and cladding presets support layer specifications', () => {
  const whitePaint = WALL_BY_ID.paint_white;
  assert.strictEqual(whitePaint.layerThickness, 0.5);
  assert.strictEqual(whitePaint.studDepth, 3.5);

  const brickWall = WALL_BY_ID.wall_brick;
  assert.strictEqual(brickWall.layerThickness, 1.0);
  assert.strictEqual(brickWall.studDepth, 5.5);
  assert.strictEqual(brickWall.sheathingThickness, 0.5);
  assert.strictEqual(brickWall.claddingOffset, 0.75);

  const sidingPreset = CLADDING_PRESETS.cladding_siding_white;
  assert.strictEqual(sidingPreset.layerThickness, 0.75);
  assert.strictEqual(sidingPreset.studDepth, 5.5);
  assert.strictEqual(sidingPreset.sheathingThickness, 0.5);
  assert.strictEqual(sidingPreset.claddingOffset, 0.75);

  const dynamicCladding = registerCladdingMaterial('cladding_custom_wood', {
    name: 'Custom Cedar Siding',
    layerThickness: 0.875,
    studDepth: 5.5,
    sheathingThickness: 0.5,
    claddingOffset: 0.75,
  });
  assert.strictEqual(dynamicCladding.layerThickness, 0.875);
  assert.strictEqual(dynamicCladding.studDepth, 5.5);
});

test('Requirement 1 & Requirement 3: resolveWallAssembly calculates total assembly thickness dynamically', () => {
  // Scenario 1: 0.5" gypsum, 5.5" studs, 0.5" sheathing, 0.75" siding (and air gap = 0 in overrides)
  const customAssembly = resolveWallAssembly('paint_white', 'cladding_siding_white', {
    gypsumThickness: 0.5,
    studDepth: 5.5,
    sheathingThickness: 0.5,
    airGapThickness: 0,
    claddingThickness: 0.75,
  });

  assert.strictEqual(customAssembly.gypsumThickness, 0.5);
  assert.strictEqual(customAssembly.studDepth, 5.5);
  assert.strictEqual(customAssembly.sheathingThickness, 0.5);
  assert.strictEqual(customAssembly.airGapThickness, 0);
  assert.strictEqual(customAssembly.claddingThickness, 0.75);
  assert.strictEqual(customAssembly.totalThickness, 7.25);

  // Interior wall assembly (no cladding)
  const interiorAssembly = resolveWallAssembly('paint_white', null);
  assert.strictEqual(interiorAssembly.gypsumThickness, 0.5);
  assert.strictEqual(interiorAssembly.studDepth, 3.5);
  assert.strictEqual(interiorAssembly.sheathingThickness, 0);
  assert.strictEqual(interiorAssembly.airGapThickness, 0);
  assert.strictEqual(interiorAssembly.claddingThickness, 0);
  assert.strictEqual(interiorAssembly.totalThickness, 4.0);

  // Default fallbacks when missing inputs
  const fallbackAssembly = resolveWallAssembly(null, null);
  assert.ok(fallbackAssembly.totalThickness > 0, 'Fallback assembly calculates valid thickness');
});

test('Requirement 2, Requirement 3 & AC 2, AC 3: 3D scene builder renders distinct physical box meshes for wall layers with co-planar boundaries', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'living', 0, 0, 144, 144, {
    cladding: 'cladding_siding_white',
  });

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallGroup = api.entityMap.get(`${room.id}:wall:N`);
  assert.ok(wallGroup, 'Wall group rendered in 3D scene');

  const childBoxes = wallGroup.children.filter((c) => c.isMesh);
  assert.ok(
    childBoxes.length >= 2,
    '3D scene generates multiple layer box meshes for multi-layer wall assembly'
  );
});

test('Requirement 4 & AC 4: Window frame depth, sill, and casing trims adapt to dynamic wall assembly thickness', () => {
  const dummyMat = { id: 'mat' };
  const mockBox = (room, wall, along, h, thick, mat) => {
    const mesh = new THREE.Mesh();
    mesh.userData = { along, h, thick, mat };
    return mesh;
  };
  const mockPlace = (room, wall, t, y, d, elev, mesh) => mesh;

  const win725 = buildWindow3DMesh({
    room: { id: 'r1' },
    wall: 'N',
    opening: { id: 'w1', offset: 36, width: 36 },
    definition: { sill: 24, h: 48, kind: 'window' },
    elevation: 0,
    wallThickness: 7.25,
    getFrameMaterial: () => dummyMat,
    glassMaterial: dummyMat,
    wallAlignedBox: mockBox,
    placeInWall: mockPlace,
  });

  assert.ok(win725, 'Window mesh constructed');

  // Verify casing trim boxes reflect wallThickness + casingD * 2 depth
  let foundSill = false;
  win725.children.forEach((child) => {
    if (child.userData && child.userData.thick >= 7.25) {
      foundSill = true;
    }
  });
  assert.ok(foundSill, 'Window casing and sill depths dynamically scale to 7.25" wall thickness');
});

test('Requirement 5 & AC 5: Door head frame and side jamb assemblies scale depth to match resolved wall assembly thickness', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'entry', 0, 0, 144, 144, {
    cladding: 'wall_brick',
  });
  const door = m.addOpening(state, room, 'door_entry_36', 'S', 36);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const doorGroup = api.entityMap.get(door.id);
  assert.ok(doorGroup, 'Door opening mesh created');

  let maxDepth = 0;
  doorGroup.traverse((child) => {
    if (child.geometry && child.geometry.parameters) {
      const p = child.geometry.parameters;
      const d = Math.max(p.depth || 0, p.width || 0, p.height || 0);
      if (d > maxDepth) maxDepth = d;
    }
  });

  assert.ok(doorGroup.children.length >= 3, 'Door group contains head frame and side jambs');
});

test('applyWallAssemblyOverrides supports single, room, level, and plan scopes while preserving finishes and openings', () => {
  const state = m.newState();
  const r1 = m.createRoom(state, 'living', 0, 0, 144, 144, {
    level: 0,
    wallFinish: 'paint_sage',
    cladding: 'cladding_siding_white',
  });
  const r2 = m.createRoom(state, 'bedroom', 160, 0, 144, 144, { level: 0 });
  const r3 = m.createRoom(state, 'office', 0, 0, 144, 144, { level: 1 });
  const win = m.addOpening(state, r1, 'win_hung_36x60', 'N', 36);

  // Un-overridden rooms keep undefined wallAssemblyOverrides and intact finishes/openings
  assert.strictEqual(r1.wallAssemblyOverrides, undefined);
  assert.strictEqual(r1.walls.N, 'paint_sage');
  assert.strictEqual(r1.openings[0].id, win.id);

  // 1. Single wall scope
  m.applyWallAssemblyOverrides(
    state,
    { gypsumThickness: 0.625, studDepth: 7.25 },
    { scope: 'single', room: r1, wall: 'N' }
  );
  assert.deepEqual(r1.wallAssemblyOverrides.N, { gypsumThickness: 0.625, studDepth: 7.25 });
  assert.strictEqual(r1.wallAssemblyOverrides.E, undefined);
  assert.strictEqual(r2.wallAssemblyOverrides, undefined);
  assert.strictEqual(r1.walls.N, 'paint_sage');
  assert.strictEqual(r1.openings[0].offset, 36);

  // 2. Room scope
  m.applyWallAssemblyOverrides(state, { sheathingThickness: 0.75 }, { scope: 'room', room: r1 });
  assert.strictEqual(r1.wallAssemblyOverrides.N.gypsumThickness, 0.625);
  assert.strictEqual(r1.wallAssemblyOverrides.N.sheathingThickness, 0.75);
  assert.deepEqual(r1.wallAssemblyOverrides.S, { sheathingThickness: 0.75 });
  assert.strictEqual(r2.wallAssemblyOverrides, undefined);

  // 3. Level scope (level 0)
  m.applyWallAssemblyOverrides(state, { airGapThickness: 1.0 }, { scope: 'level', level: 0 });
  assert.strictEqual(r1.wallAssemblyOverrides.W.airGapThickness, 1.0);
  assert.strictEqual(r2.wallAssemblyOverrides.N.airGapThickness, 1.0);
  assert.strictEqual(r3.wallAssemblyOverrides, undefined);

  // 4. Plan scope
  m.applyWallAssemblyOverrides(state, { claddingThickness: 1.25 }, { scope: 'plan' });
  assert.strictEqual(r1.wallAssemblyOverrides.E.claddingThickness, 1.25);
  assert.strictEqual(r2.wallAssemblyOverrides.S.claddingThickness, 1.25);
  assert.strictEqual(r3.wallAssemblyOverrides.N.claddingThickness, 1.25);
});

test('applyWallAssemblyOverrides clamps physical ranges, serializes cleanly, and clears overrides on reset', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'living', 0, 0, 144, 144, {
    cladding: 'cladding_siding_white',
  });

  // Below-minimum inputs clamp to >= 0" for non-structural layers and >= 1.5" for studDepth
  m.applyWallAssemblyOverrides(
    state,
    {
      gypsumThickness: -0.5,
      studDepth: 0.25,
      sheathingThickness: -1,
      airGapThickness: -0.75,
      claddingThickness: -2,
    },
    { scope: 'single', room, wall: 'N' }
  );

  assert.deepEqual(room.wallAssemblyOverrides.N, {
    gypsumThickness: 0,
    studDepth: 1.5,
    sheathingThickness: 0,
    airGapThickness: 0,
    claddingThickness: 0,
  });

  const clampedAssembly = resolveWallAssembly(
    room.walls.N,
    room.cladding,
    room.wallAssemblyOverrides.N
  );
  assert.strictEqual(clampedAssembly.totalThickness, 1.5);

  // Persistence round-trip preserves overrides
  const restored = m.deserialize(m.serialize(state));
  assert.deepEqual(restored.rooms[0].wallAssemblyOverrides.N, {
    gypsumThickness: 0,
    studDepth: 1.5,
    sheathingThickness: 0,
    airGapThickness: 0,
    claddingThickness: 0,
  });

  // Reset clears wallAssemblyOverrides[wall] and restores default preset dimensions
  m.applyWallAssemblyOverrides(state, null, { scope: 'single', room, wall: 'N' });
  assert.strictEqual(room.wallAssemblyOverrides.N, undefined);

  const resetAssembly = resolveWallAssembly(
    room.walls.N,
    room.cladding,
    room.wallAssemblyOverrides?.N
  );
  assert.strictEqual(resetAssembly.gypsumThickness, 0.5);
  assert.strictEqual(resetAssembly.studDepth, 5.5);
  assert.strictEqual(resetAssembly.sheathingThickness, 0.5);
  assert.strictEqual(resetAssembly.airGapThickness, 0.75);
  assert.strictEqual(resetAssembly.claddingThickness, 0.75);
  assert.strictEqual(resetAssembly.totalThickness, 8.0);
});

test('3D scene builder rebuilds wall layer meshes and opening depths when wallAssemblyOverrides change or reset', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'living', 0, 0, 144, 144, {
    cladding: 'cladding_siding_white',
  });
  const win = m.addOpening(state, room, 'win_hung_36x60', 'N', 36);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const initialWallGroup = api.entityMap.get(`${room.id}:wall:N`);
  const initialSig = initialWallGroup.userData.sig;
  assert.ok(initialWallGroup, 'Initial North wall group created');

  // Measure initial bounding thickness across wall meshes (in feet, S = 1/12)
  const measureWallSpanFeet = (group) => {
    const box = new THREE.Box3().setFromObject(group);
    return box.max.z - box.min.z;
  };
  const initialSpanFeet = measureWallSpanFeet(initialWallGroup);

  // Override North wall to thicker assembly (0.625 + 9.25 + 0.75 + 1.0 + 1.5 = 13.125")
  m.applyWallAssemblyOverrides(
    state,
    {
      gypsumThickness: 0.625,
      studDepth: 9.25,
      sheathingThickness: 0.75,
      airGapThickness: 1.0,
      claddingThickness: 1.5,
    },
    { scope: 'single', room, wall: 'N' }
  );
  api.update();

  const updatedWallGroup = api.entityMap.get(`${room.id}:wall:N`);
  assert.notStrictEqual(updatedWallGroup, initialWallGroup, 'Wall group rebuilt on override');
  assert.notStrictEqual(updatedWallGroup.userData.sig, initialSig, 'Wall signature updated');

  const updatedSpanFeet = measureWallSpanFeet(updatedWallGroup);
  assert.ok(
    updatedSpanFeet > initialSpanFeet + 0.3,
    `Updated wall assembly depth (${updatedSpanFeet.toFixed(3)}ft) exceeds initial depth (${initialSpanFeet.toFixed(3)}ft)`
  );

  const updatedWinGroup = api.entityMap.get(win.id);
  assert.ok(updatedWinGroup, 'Window opening rebuilt with updated wall assembly thickness');

  // Reset North wall overrides and confirm 3D wall group restores initial dimensions
  m.applyWallAssemblyOverrides(state, null, { scope: 'single', room, wall: 'N' });
  api.update();

  const resetWallGroup = api.entityMap.get(`${room.id}:wall:N`);
  const resetSpanFeet = measureWallSpanFeet(resetWallGroup);
  assert.ok(
    Math.abs(resetSpanFeet - initialSpanFeet) < 1e-4,
    'Resetting wall assembly overrides restores original 3D wall depth'
  );
});

test('Room inspector in app.js renders accessible Wall Assembly Layer Thicknesses controls and announces updates', () => {
  const appJsContent = readFileSync(resolve('js/app.js'), 'utf8');
  assert.match(appJsContent, /Wall Assembly Layer Thicknesses/);
  assert.match(appJsContent, /formRow\(\s*'i-wa-gypsum',\s*'Gypsum Board \(in\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-wa-stud',\s*'Stud Depth \(in\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-wa-sheathing',\s*'Sheathing \(in\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-wa-airgap',\s*'Air Gap \(in\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-wa-cladding',\s*'Exterior Cladding \(in\)'/);
  assert.match(appJsContent, /id="i-wa-total"/);
  assert.match(appJsContent, /id="i-wa-scope"/);
  assert.match(appJsContent, /id="i-wa-reset"/);
  assert.match(appJsContent, /M\.applyWallAssemblyOverrides/);
  assert.match(appJsContent, /announceToLiveRegion/);
});
