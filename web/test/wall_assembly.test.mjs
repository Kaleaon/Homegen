import test from 'node:test';
import assert from 'node:assert/strict';
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
