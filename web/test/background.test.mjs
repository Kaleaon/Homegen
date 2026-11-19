import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import * as c from '../js/codes.js';
import { parseRoomDimensionsInput } from '../js/app.js';

test('newState initializes background as null', () => {
  const s = m.newState();
  assert.equal(s.background, null);
});

test('serialization round-trips document background state', () => {
  const s = m.newState();
  s.background = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    x: 12,
    y: 24,
    scale: 1.5,
    opacity: 0.7,
    visible: true,
    locked: true,
    width: 100,
    height: 100,
  };
  const json = m.serialize(s);
  const loaded = m.deserialize(json);
  assert.deepEqual(loaded.background, s.background);
});

test('parseDistanceInInches parses various measurement formats correctly', () => {
  assert.equal(m.parseDistanceInInches("10'"), 120);
  assert.equal(m.parseDistanceInInches('10 ft'), 120);
  assert.equal(m.parseDistanceInInches('10 feet'), 120);
  assert.equal(m.parseDistanceInInches('10\' 6"'), 126);
  assert.equal(m.parseDistanceInInches('10ft 6in'), 126);
  assert.equal(m.parseDistanceInInches('120"'), 120);
  assert.equal(m.parseDistanceInInches('120 in'), 120);
  assert.equal(m.parseDistanceInInches('120 inches'), 120);
  assert.equal(m.parseDistanceInInches('120'), 120);
  assert.equal(m.parseDistanceInInches('10'), 120);
  assert.ok(Math.abs(m.parseDistanceInInches('1 m') - 39.3701) < 0.01);
  assert.equal(m.parseDistanceInInches(''), null);
  assert.equal(m.parseDistanceInInches('abc'), null);
  assert.equal(m.parseDistanceInInches('-10'), null);
  assert.equal(m.parseDistanceInInches('10\' 6 1/2"'), 126.5);
  assert.equal(m.parseDistanceInInches('6 1/4"'), 6.25);
  assert.equal(m.parseDistanceInInches('1/16"'), 0.0625);
});

test('parseDistanceInInches handles large spans, sub-30 inch values, quote marks, mixed units, and fractions', () => {
  // Large spans (>= 30 ft and > 50 ft)
  assert.equal(m.parseDistanceInInches('32 ft'), 384);
  assert.equal(m.parseDistanceInInches("32'"), 384);
  assert.equal(m.parseDistanceInInches('60 ft'), 720);
  assert.equal(m.parseDistanceInInches('32', { defaultUnit: 'ft' }), 384);
  assert.equal(m.parseDistanceInInches('60', { defaultUnit: 'ft' }), 720);

  // Sub-30 inch explicit values (must NOT multiply by 12)
  assert.equal(m.parseDistanceInInches('24 in'), 24);
  assert.equal(m.parseDistanceInInches('24"'), 24);
  assert.equal(m.parseDistanceInInches('18 inches'), 18);
  assert.equal(m.parseDistanceInInches('1 inch'), 1);
  assert.equal(m.parseDistanceInInches('24 in', { defaultUnit: 'ft' }), 24);
  assert.equal(m.parseDistanceInInches('24"', { defaultUnit: 'ft' }), 24);

  // Typographic curly quotes, primes, and double-apostrophes
  assert.equal(m.parseDistanceInInches('10’ 6”'), 126);
  assert.equal(m.parseDistanceInInches('10′ 6″'), 126);
  assert.equal(m.parseDistanceInInches("24''"), 24);
  assert.equal(m.parseDistanceInInches('1 foot 6 inches'), 18);

  // Architectural hyphenation and mixed units
  assert.equal(m.parseDistanceInInches('10\'-6"'), 126);
  assert.equal(m.parseDistanceInInches('10\' - 6"'), 126);
  assert.equal(m.parseDistanceInInches('10ft6in'), 126);
  assert.equal(m.parseDistanceInInches("10'-6"), 126);

  // Fractional and mixed-fraction inputs
  assert.equal(m.parseDistanceInInches('1/2 ft'), 6);
  assert.equal(m.parseDistanceInInches("1/2'"), 6);
  assert.equal(m.parseDistanceInInches('3/4 in'), 0.75);
  assert.equal(m.parseDistanceInInches('3/4"'), 0.75);
  assert.equal(m.parseDistanceInInches('10 1/2 ft'), 126);
  assert.equal(m.parseDistanceInInches("10-1/2'"), 126);
  assert.equal(m.parseDistanceInInches('24 1/2 in'), 24.5);
  assert.equal(m.parseDistanceInInches('24-3/4"'), 24.75);
  assert.equal(m.parseDistanceInInches('10\' 6 1/2"'), 126.5);
  assert.equal(m.parseDistanceInInches('10\'-6 1/2"'), 126.5);
  assert.equal(m.parseDistanceInInches('10\' 1/2"'), 120.5);
  assert.equal(m.parseDistanceInInches('10½ ft'), 126);
  assert.equal(m.parseDistanceInInches('10’ 6½”'), 126.5);

  // Invalid / non-positive inputs
  assert.equal(m.parseDistanceInInches('1/0 in'), null);
  assert.equal(m.parseDistanceInInches('-24 in'), null);
  assert.equal(m.parseDistanceInInches('room'), null);
});

test('parseRoomDimensionsInput parses single and dual room dimension constraints accurately', () => {
  // Unitless defaults to feet, including large spans >= 30 ft and > 50 ft
  assert.deepEqual(parseRoomDimensionsInput('12 × 10'), [144, 120]);
  assert.deepEqual(parseRoomDimensionsInput('32 × 20'), [384, 240]);
  assert.deepEqual(parseRoomDimensionsInput('60 x 40'), [720, 480]);
  assert.deepEqual(parseRoomDimensionsInput('35, 25'), [420, 300]);
  assert.deepEqual(parseRoomDimensionsInput('32'), [384]);
  assert.deepEqual(parseRoomDimensionsInput('10 1/2 × 8 1/4'), [126, 99]);

  // Explicit unit tags override default feet (including sub-30 inch and >= 30 inch values)
  assert.deepEqual(parseRoomDimensionsInput('32 ft'), [384]);
  assert.deepEqual(parseRoomDimensionsInput('24 in'), [24]);
  assert.deepEqual(parseRoomDimensionsInput('24" × 36"'), [24, 36]);
  assert.deepEqual(parseRoomDimensionsInput('144 in'), [144]);
  assert.deepEqual(parseRoomDimensionsInput('32 ft × 20 ft'), [384, 240]);
  assert.deepEqual(parseRoomDimensionsInput('10\' 6" × 12\' 6 1/2"'), [126, 150.5]);

  // Integration with room clamping preserves exact valid spans and enforces minimums only when undersized
  const living = { type: 'living', w: 144, h: 120 };
  const [largeW, largeH] = parseRoomDimensionsInput('32 × 20');
  assert.deepEqual(c.clampRoomDimensions(living, largeW, largeH), { w: 384, h: 240 });

  const closet = { type: 'closet', w: 48, h: 48 };
  const [sub30InW] = parseRoomDimensionsInput('24 in');
  assert.equal(sub30InW, 24);
  assert.equal(c.clampRoomWidth(closet, sub30InW, closet.h), 36);

  // Rejects empty or invalid entries
  assert.deepEqual(parseRoomDimensionsInput(''), []);
  assert.deepEqual(parseRoomDimensionsInput('invalid'), []);
  assert.deepEqual(parseRoomDimensionsInput('-10 × -20'), []);
});

test('2-point scale calibration recalculates scale and anchor position', () => {
  const bg = {
    dataUrl: 'data:image/png;base64,dummy',
    x: 0,
    y: 0,
    scale: 1.0,
    opacity: 0.5,
    visible: true,
    locked: false,
    width: 500,
    height: 500,
  };

  const p1 = { x: 50, y: 50 };
  const p2 = { x: 150, y: 50 };
  const currentDistPx = Math.hypot(p2.x - p1.x, p2.y - p1.y); // 100
  const targetInches = 200; // Want 200 inches

  const factor = targetInches / currentDistPx; // 2.0
  bg.scale *= factor;
  bg.x = p1.x - (p1.x - bg.x) * factor;
  bg.y = p1.y - (p1.y - bg.y) * factor;

  assert.equal(bg.scale, 2.0);
  assert.equal(bg.x, -50);
  assert.equal(bg.y, -50);
});

// Setup WebGL and DOM mocks for scene3d tests in headless Node environment
function setupScene3DEnvironment() {
  if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = () => {};
  if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = () => 1;

  const baseCtx = {
    canvas: { width: 800, height: 600 },
    getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
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

  const doc = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ width: 256, height: 256, getContext: () => mock2d }),
  };
  doc.documentElement = doc;

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

  if (!globalThis.window) globalThis.window = { devicePixelRatio: 1 };
  if (!globalThis.document) globalThis.document = doc;
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  return { canvas };
}

test('scene3d.js initializes background and lighting colors from active Ktheme tokens', async () => {
  const { canvas } = setupScene3DEnvironment();
  const { createScene3D } = await import('../js/scene3d.js');
  const { invalidateCache, DEFAULT_TOKENS } = await import('../js/kthemeTokens.js');

  delete globalThis.window.getComputedStyle;
  invalidateCache();

  const state = m.newState();
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );

  assert.equal(
    api.scene.background.getHexString(),
    DEFAULT_TOKENS['--ktheme-tertiary'].replace('#', '').toLowerCase()
  );

  const hemi = api.scene.children.find((c) => c.isHemisphereLight);
  assert.ok(hemi, 'Hemisphere light should exist in scene');
  assert.equal(
    hemi.color.getHexString(),
    DEFAULT_TOKENS['--ktheme-on-primary'].replace('#', '').toLowerCase()
  );
  assert.equal(
    hemi.groundColor.getHexString(),
    DEFAULT_TOKENS['--ktheme-secondary'].replace('#', '').toLowerCase()
  );

  const sun = api.scene.children.find((c) => c.isDirectionalLight);
  assert.ok(sun, 'Directional sun light should exist in scene');
  assert.equal(
    sun.color.getHexString(),
    DEFAULT_TOKENS['--ktheme-primary'].replace('#', '').toLowerCase()
  );

  api.destroy();
});

test('scene colors update dynamically when invalidateCache() is triggered', async () => {
  const { canvas } = setupScene3DEnvironment();
  const { createScene3D } = await import('../js/scene3d.js');
  const { invalidateCache } = await import('../js/kthemeTokens.js');

  delete globalThis.window.getComputedStyle;
  invalidateCache();

  const state = m.newState();
  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );

  const customTokens = {
    '--ktheme-tertiary': '#112233',
    '--ktheme-on-primary': '#445566',
    '--ktheme-secondary': '#778899',
    '--ktheme-primary': '#aabbcc',
  };

  globalThis.window.getComputedStyle = () => ({
    getPropertyValue: (prop) => customTokens[prop] || '',
  });

  invalidateCache();

  assert.equal(api.scene.background.getHexString(), '112233');

  const hemi = api.scene.children.find((c) => c.isHemisphereLight);
  assert.equal(hemi.color.getHexString(), '445566');
  assert.equal(hemi.groundColor.getHexString(), '778899');

  const sun = api.scene.children.find((c) => c.isDirectionalLight);
  assert.equal(sun.color.getHexString(), 'aabbcc');

  // Verify destroy unsubscribes from further token invalidations
  api.destroy();

  customTokens['--ktheme-tertiary'] = '#ff0000';
  invalidateCache();

  assert.equal(
    api.scene.background.getHexString(),
    '112233',
    'Background should not update after api.destroy()'
  );

  delete globalThis.window.getComputedStyle;
  invalidateCache();
});
