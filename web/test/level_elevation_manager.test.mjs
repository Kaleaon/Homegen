import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STORY_HEIGHT,
  DEFAULT_CEILING_HEIGHT,
  DEFAULT_SLAB_THICKNESS,
  defaultLevelDescriptor,
  getLevelMetadata,
  calculateLevelElevations,
  getLevelElevation,
  validateLevelHierarchy,
  setLevelMetadata,
  formatElevationBadge,
  parseElevationInInches,
  newState,
  serialize,
  deserialize,
} from '../js/model.js';
import { createScene3D } from '../js/scene3d.js';

// Setup DOM and WebGL stubs for Node environment
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: (_p) => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
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
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  scale: () => {},
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  drawImage: () => {},
  translate: () => {},
  strokeRect: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
};

const mockDoc = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ width: 256, height: 256, getContext: () => mock2d }),
};

globalThis.window = { devicePixelRatio: 1 };
globalThis.document = mockDoc;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function createMockCanvas(width = 800, height = 600) {
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    ownerDocument: mockDoc,
    getRootNode: () => mockDoc,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    getContext: (type) => (type === '2d' ? mock2d : mockCtx),
  };
}

test('defaultLevelDescriptor creates standard above-ground and subterranean levels', () => {
  const f0 = defaultLevelDescriptor(0);
  assert.equal(f0.index, 0);
  assert.equal(f0.name, 'Floor 1');
  assert.equal(f0.elevation, 0);
  assert.equal(f0.storyHeight, DEFAULT_STORY_HEIGHT);
  assert.equal(f0.ceilingHeight, DEFAULT_CEILING_HEIGHT);
  assert.equal(f0.slabThickness, DEFAULT_SLAB_THICKNESS);
  assert.equal(f0.subterranean, false);

  const f1 = defaultLevelDescriptor(1);
  assert.equal(f1.index, 1);
  assert.equal(f1.name, 'Floor 2');
  assert.equal(f1.elevation, DEFAULT_STORY_HEIGHT);
  assert.equal(f1.subterranean, false);

  const b1 = defaultLevelDescriptor(-1);
  assert.equal(b1.index, -1);
  assert.equal(b1.name, 'Basement 1');
  assert.equal(b1.elevation, -DEFAULT_STORY_HEIGHT);
  assert.equal(b1.subterranean, true);

  const custom = defaultLevelDescriptor(2, 'Penthouse');
  assert.equal(custom.name, 'Penthouse');
  assert.equal(custom.elevation, 2 * DEFAULT_STORY_HEIGHT);
});

test('getLevelMetadata retrieves configured metadata or synthesizes defaults', () => {
  const state = newState();
  state.levelMetadata = [
    {
      index: 0,
      name: 'Ground Level',
      elevation: 0,
      storyHeight: 120,
      ceilingHeight: 108,
      slabThickness: 12,
      subterranean: false,
    },
    {
      index: 1,
      name: 'Mezzanine',
      elevation: 120,
      storyHeight: 100,
      ceilingHeight: 90,
      slabThickness: 10,
      subterranean: false,
    },
  ];

  const l0 = getLevelMetadata(state, 0);
  assert.equal(l0.name, 'Ground Level');
  assert.equal(l0.elevation, 0);
  assert.equal(l0.storyHeight, 120);

  const l1 = getLevelMetadata(state, 1);
  assert.equal(l1.name, 'Mezzanine');
  assert.equal(l1.elevation, 120);

  // Missing level synthesizes default
  const l2 = getLevelMetadata(state, 2);
  assert.equal(l2.name, 'Floor 3');
  assert.equal(l2.elevation, 2 * DEFAULT_STORY_HEIGHT);
});

test('calculateLevelElevations returns explicit offsets or falls back to dynamic summation', () => {
  // Explicit metadata with custom elevation datums
  const customState = {
    levelMetadata: [
      { index: -1, elevation: -114 },
      { index: 0, elevation: 0 },
      { index: 1, elevation: 126 },
      { index: 2, elevation: 240 },
    ],
  };
  const customElevs = calculateLevelElevations(customState);
  assert.equal(customElevs[-1], -114);
  assert.equal(customElevs[0], 0);
  assert.equal(customElevs[1], 126);
  assert.equal(customElevs[2], 240);
  assert.equal(getLevelElevation(customState, 1), 126);
  assert.equal(getLevelElevation(customState, -1), -114);

  // Fallback state without levelMetadata
  const fallbackState = {
    levels: 3,
    rooms: [
      { id: 'r0', level: 0, ceiling: 100 },
      { id: 'r1', level: 1, ceiling: 120 },
      { id: 'b1', level: -1, ceiling: 90 },
    ],
  };
  const fallbackElevs = calculateLevelElevations(fallbackState);
  assert.equal(fallbackElevs[0], 0);
  assert.equal(fallbackElevs[1], 0 + 100 + DEFAULT_SLAB_THICKNESS); // 110
  assert.equal(fallbackElevs[2], 110 + 120 + DEFAULT_SLAB_THICKNESS); // 240
  assert.equal(fallbackElevs[-1], 0 - (90 + DEFAULT_SLAB_THICKNESS)); // -100
});

test('validateLevelHierarchy validates story height, slab separation, and duplicate indices', () => {
  // Valid hierarchy
  const valid = [defaultLevelDescriptor(-1), defaultLevelDescriptor(0), defaultLevelDescriptor(1)];
  const resValid = validateLevelHierarchy(valid);
  assert.equal(resValid.valid, true);
  assert.equal(resValid.errors.length, 0);

  // Invalid: duplicate level index
  const duplicate = [
    defaultLevelDescriptor(0),
    { ...defaultLevelDescriptor(0), name: 'Duplicate Floor 1' },
  ];
  const resDup = validateLevelHierarchy(duplicate);
  assert.equal(resDup.valid, false);
  assert.ok(resDup.errors.some((e) => e.includes('Duplicate level index 0')));

  // Invalid: storyHeight <= 0
  const badStory = [{ ...defaultLevelDescriptor(0), storyHeight: 0 }];
  const resBadStory = validateLevelHierarchy(badStory);
  assert.equal(resBadStory.valid, false);
  assert.ok(resBadStory.errors.some((e) => e.includes('story height must be greater than 0')));

  // Invalid: storyHeight < slabThickness
  const thinStory = [{ ...defaultLevelDescriptor(0), storyHeight: 8, slabThickness: 10 }];
  const resThinStory = validateLevelHierarchy(thinStory);
  assert.equal(resThinStory.valid, false);
  assert.ok(resThinStory.errors.some((e) => e.includes('cannot be less than slab thickness')));

  // Invalid: ceilingHeight <= 0
  const badCeil = [{ ...defaultLevelDescriptor(0), ceilingHeight: -5 }];
  const resBadCeil = validateLevelHierarchy(badCeil);
  assert.equal(resBadCeil.valid, false);
  assert.ok(resBadCeil.errors.some((e) => e.includes('ceiling height must be positive')));

  // Invalid: overlapping slabs (e.g. Level 1 at elevation 5" while Level 0 is at 0" with 10" slab)
  const overlap = [
    { ...defaultLevelDescriptor(0), elevation: 0, slabThickness: 10 },
    { ...defaultLevelDescriptor(1), elevation: 5, slabThickness: 10 },
  ];
  const resOverlap = validateLevelHierarchy(overlap);
  assert.equal(resOverlap.valid, false);
  assert.ok(resOverlap.errors.some((e) => e.includes('overlaps with level')));
});

test('setLevelMetadata updates state when valid and rejects when invalid', () => {
  const state = newState();
  const newMeta = [
    { ...defaultLevelDescriptor(-1), elevation: -108 },
    { ...defaultLevelDescriptor(0), elevation: 0 },
    { ...defaultLevelDescriptor(1), elevation: 112 },
  ];
  const res = setLevelMetadata(state, newMeta);
  assert.equal(res.valid, true);
  assert.equal(state.levelMetadata.length, 3);
  assert.equal(state.levels, 2); // Max non-negative index 1 + 1 = 2

  // Invalid update leaves state untouched or returns validation error
  const invalidMeta = [
    { ...defaultLevelDescriptor(0), elevation: 0, slabThickness: 12 },
    { ...defaultLevelDescriptor(1), elevation: 8, slabThickness: 12 },
  ];
  const failRes = setLevelMetadata(state, invalidMeta);
  assert.equal(failRes.valid, false);
  assert.ok(failRes.errors.length > 0);
});

test('formatElevationBadge and parseElevationInInches format and parse architectural dimensions', () => {
  assert.equal(formatElevationBadge(0), '+0\' 0"');
  assert.equal(formatElevationBadge(106), '+8\' 10"');
  assert.equal(formatElevationBadge(-108), '-9\' 0"');
  assert.equal(formatElevationBadge(-106), '-8\' 10"');

  assert.equal(parseElevationInInches('0'), 0);
  assert.equal(parseElevationInInches('+0\' 0"'), 0);
  assert.equal(parseElevationInInches('8\' 10"'), 106);
  assert.equal(parseElevationInInches('-9\' 0"'), -108);
  assert.equal(parseElevationInInches('-106'), -106);
  assert.equal(parseElevationInInches('120'), 120);
});

test('serialization and deserialization preserve levelMetadata and maintain backward compatibility', () => {
  const state = newState();
  state.levelMetadata = [
    defaultLevelDescriptor(-1, 'Cellar'),
    defaultLevelDescriptor(0, 'Main Floor'),
    defaultLevelDescriptor(1, 'Second Floor'),
  ];
  state.rooms = [
    { id: 'cellar_room', x: 0, y: 0, w: 120, h: 120, level: -1, floor: 'concrete' },
    { id: 'main_room', x: 0, y: 0, w: 120, h: 120, level: 0, floor: 'floor_oak' },
  ];

  const json = serialize(state);
  const restored = deserialize(json);

  assert.equal(restored.levelMetadata.length, 3);
  assert.equal(restored.levelMetadata[0].name, 'Cellar');
  assert.equal(restored.levelMetadata[0].index, -1);
  assert.equal(restored.levelMetadata[0].subterranean, true);

  // Legacy plan compatibility: JSON without levelMetadata
  const legacyPlan = JSON.stringify({
    version: 1,
    name: 'Legacy House',
    levels: 2,
    rooms: [
      { id: 'r0', x: 0, y: 0, w: 120, h: 120, level: 0 },
      { id: 'r1', x: 0, y: 0, w: 120, h: 120, level: 1 },
      { id: 'r_sub', x: 0, y: 0, w: 120, h: 120, level: -1 },
    ],
  });
  const fromLegacy = deserialize(legacyPlan);
  assert.ok(Array.isArray(fromLegacy.levelMetadata));
  assert.ok(fromLegacy.levelMetadata.some((m) => m.index === -1));
  assert.ok(fromLegacy.levelMetadata.some((m) => m.index === 0));
  assert.ok(fromLegacy.levelMetadata.some((m) => m.index === 1));
});

test('3D scene positions floor slabs, walls, and walk camera at exact configured vertical datums', () => {
  const canvas = createMockCanvas();
  const state = newState();
  state.levelMetadata = [
    {
      index: -1,
      name: 'Basement',
      elevation: -110,
      storyHeight: 110,
      ceilingHeight: 96,
      slabThickness: 10,
      subterranean: true,
    },
    {
      index: 0,
      name: 'Floor 1',
      elevation: 0,
      storyHeight: 120,
      ceilingHeight: 108,
      slabThickness: 12,
      subterranean: false,
    },
    {
      index: 1,
      name: 'Floor 2',
      elevation: 120,
      storyHeight: 106,
      ceilingHeight: 96,
      slabThickness: 10,
      subterranean: false,
    },
  ];
  state.rooms = [
    {
      id: 'sub_room',
      name: 'Basement Room',
      x: 0,
      y: 0,
      w: 144,
      h: 144,
      level: -1,
      ceiling: 96,
      floor: 'concrete',
      walls: { N: 'wall_drywall', S: 'wall_drywall', E: 'wall_drywall', W: 'wall_drywall' },
      openings: [],
      items: [],
    },
    {
      id: 'ground_room',
      name: 'Living Room',
      x: 0,
      y: 0,
      w: 144,
      h: 144,
      level: 0,
      ceiling: 108,
      floor: 'floor_oak',
      walls: { N: 'wall_drywall', S: 'wall_drywall', E: 'wall_drywall', W: 'wall_drywall' },
      openings: [],
      items: [],
    },
    {
      id: 'upper_room',
      name: 'Master Bed',
      x: 0,
      y: 0,
      w: 144,
      h: 144,
      level: 1,
      ceiling: 96,
      floor: 'floor_carpet',
      walls: { N: 'wall_drywall', S: 'wall_drywall', E: 'wall_drywall', W: 'wall_drywall' },
      openings: [],
      items: [],
    },
  ];

  let currentLevel = 0;
  const scene3d = createScene3D(
    canvas,
    () => state,
    () => currentLevel,
    { levels: 'all' }
  );
  scene3d.show();

  const S = 1 / 12;

  // Verify floor slab mesh heights
  let subSlab = null;
  let groundSlab = null;
  let upperSlab = null;
  scene3d.scene.traverse((obj) => {
    if (obj.userData?.id === 'sub_room:slab') subSlab = obj;
    if (obj.userData?.id === 'ground_room:slab') groundSlab = obj;
    if (obj.userData?.id === 'upper_room:slab') upperSlab = obj;
  });

  assert.ok(subSlab, 'Basement slab exists in scene');
  assert.ok(Math.abs(subSlab.position.y - -110 * S) < 1e-4, 'Basement slab placed at -110" datum');

  assert.ok(groundSlab, 'Ground slab exists in scene');
  assert.ok(Math.abs(groundSlab.position.y - 0 * S) < 1e-4, 'Ground slab placed at 0" datum');

  // Ground room eye-level camera height
  scene3d.eyeLevel('ground_room');
  assert.equal(scene3d.getCameraMode(), 'walk');
  assert.ok(
    Math.abs(scene3d.camera.position.y - (0 + 64) * S) < 1e-4,
    'Camera eye-level is (0 + 64) * S on ground level'
  );

  // Switch to subterranean level
  currentLevel = -1;
  scene3d.update();
  scene3d.eyeLevel('sub_room');
  assert.equal(scene3d.getCameraMode(), 'walk');
  // Eye height is datum elevation (-110") + 64" = -46"
  assert.ok(
    Math.abs(scene3d.camera.position.y - (-110 + 64) * S) < 1e-4,
    'Camera eye-level is (-110 + 64) * S on subterranean level'
  );

  // Switch to upper floor eye-level with opts.levels = 'all'
  currentLevel = 1;
  scene3d.update();
  scene3d.scene.traverse((obj) => {
    if (obj.userData?.id === 'upper_room:slab') upperSlab = obj;
  });
  assert.ok(upperSlab, 'Upper slab exists in scene');
  assert.ok(Math.abs(upperSlab.position.y - 120 * S) < 1e-4, 'Upper slab placed at 120" datum');

  scene3d.eyeLevel('upper_room');
  // Eye height is datum elevation (120") + 64" = 184"
  assert.ok(
    Math.abs(scene3d.camera.position.y - (120 + 64) * S) < 1e-4,
    'Camera eye-level is (120 + 64) * S on upper level'
  );

  scene3d.destroy();
});
