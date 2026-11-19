import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createScene3D } from '../js/scene3d.js';
import { footprint, interior } from '../js/geometry.js';
import { ITEM_BY_ID } from '../js/catalog.js';
import {
  parseCoordinateInput,
  normalizeRotationDegrees,
  clampPositionToBounds,
} from '../../designer3d/tools/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const ui3dContent = fs.readFileSync(path.join(__dirname, '../js/ui3d.js'), 'utf8');

globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

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

test('index.html exposes #coord3d-overlay with labeled X, Y, Z, and Rotation inputs', () => {
  assert.match(htmlContent, /id="coord3d-overlay"/);
  for (const fieldId of ['coord3d-x', 'coord3d-y', 'coord3d-z', 'coord3d-rot']) {
    assert.match(htmlContent, new RegExp(`for="${fieldId}"`));
    assert.match(htmlContent, new RegExp(`id="${fieldId}"`));
  }
});

test('Inspector and 3D UI wire direct numerical coordinate and rotation controls while preserving step nudge buttons', () => {
  for (const id of [
    'i-pos-x',
    'i-pos-y',
    'i-pos-z',
    'i-rot-deg',
    'i-item-pos-x',
    'i-item-pos-y',
    'i-item-z',
    'i-item-rot',
    'i-item-scale',
  ]) {
    assert.match(appJsContent, new RegExp(`id="${id}"`));
  }
  assert.match(appJsContent, /class="i-nudge-btn"/);
  assert.match(appJsContent, /class="i-item-nudge-btn"/);
  assert.match(ui3dContent, /setSelectedPosition/);
  assert.match(ui3dContent, /setSelectedRotation/);
});

test('Coordinate helpers handle invalid input fallback, clamping, and rotation bounds', () => {
  assert.equal(parseCoordinateInput('', 48), 48);
  assert.equal(parseCoordinateInput('   ', 48), 48);
  assert.equal(parseCoordinateInput('abc', 48), 48);
  assert.equal(parseCoordinateInput('72.5', 48), 72.5);

  assert.equal(normalizeRotationDegrees(405, 0), 45);
  assert.equal(normalizeRotationDegrees(-30, 0), 330);
  assert.equal(normalizeRotationDegrees(360, 15), 0);
  assert.equal(normalizeRotationDegrees('', 90), 90);

  const clamped = clampPositionToBounds(
    { x: -20, y: 500, z: 120 },
    { minX: 10, maxX: 140, minY: 12, maxY: 110, minZ: 0, maxZ: 96 }
  );
  assert.deepEqual(clamped, { x: 10, y: 110, z: 96 });
});

test('footprint computes accurate axis-aligned bounds for arbitrary rotation angles', () => {
  const sofaDef = ITEM_BY_ID.sofa; // w: 84, d: 36
  const fp0 = footprint({ x: 100, y: 80, rot: 0 }, sofaDef);
  assert.equal(fp0.w, 84);
  assert.equal(fp0.h, 36);

  const fp90 = footprint({ x: 100, y: 80, rot: 90 }, sofaDef);
  assert.equal(fp90.w, 36);
  assert.equal(fp90.h, 84);

  const fp45 = footprint({ x: 100, y: 80, rot: 45 }, sofaDef);
  const expected = (84 + 36) * Math.SQRT1_2;
  assert.ok(Math.abs(fp45.w - expected) < 1e-6);
  assert.ok(Math.abs(fp45.h - expected) < 1e-6);
});

test('scene3d setSelectedPosition and setSelectedRotation update entities, clamp to room interior, and revert invalid inputs', async () => {
  const liveEl = { textContent: '' };
  const transformEvents = [];

  const sampleDoc = {
    rooms: [
      {
        id: 'r1',
        name: 'Living Room',
        type: 'living',
        x: 0,
        y: 0,
        w: 180,
        h: 144,
        ceiling: 96,
        floor: 'floor_oak',
        walls: { N: 'paint_white', S: 'paint_white', E: 'paint_white', W: 'paint_white' },
        openings: [],
        items: [{ id: 'sofa1', type: 'sofa', x: 72, y: 60, rot: 0 }],
      },
    ],
    levels: 1,
  };

  const createDummyCanvas = () => ({
    width: 256,
    height: 256,
    getContext: () => mock2d,
    style: {},
  });

  const docMock = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: createDummyCanvas,
  };

  const mockCanvas = {
    width: 800,
    height: 600,
    ownerDocument: docMock,
    getRootNode: () => docMock,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
    getContext: (type) => (type === '2d' ? mock2d : mockCtx),
  };

  const oldWindow = globalThis.window;
  const oldDoc = globalThis.document;
  const oldResizeObserver = globalThis.ResizeObserver;

  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.document = {
    ...docMock,
    getElementById: (id) => {
      if (id === 'view3d-a11y-live') return liveEl;
      if (id === 'view3d') return mockCanvas;
      if (id === 'plan') return { hidden: false };
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: createDummyCanvas,
  };

  try {
    const sceneApi = createScene3D(
      mockCanvas,
      () => sampleDoc,
      () => 0,
      {
        onTransformChange: (ent, kind) => transformEvents.push({ id: ent.id, kind }),
      }
    );

    // Select sofa directly
    const sel = sceneApi.select3DEntity('sofa1');
    assert.ok(sel);
    assert.equal(sel.type, 'item');

    // 1. Explicit coordinate update within bounds
    const snap1 = sceneApi.setSelectedPosition({ x: 90, y: 78, z: 12 });
    assert.equal(snap1.x, 90);
    assert.equal(snap1.y, 78);
    assert.equal(snap1.z, 12);
    assert.equal(sampleDoc.rooms[0].items[0].x, 90);
    assert.equal(sampleDoc.rooms[0].items[0].y, 78);
    assert.equal(sampleDoc.rooms[0].items[0].z, 12);
    assert.equal(transformEvents.length, 1);

    // 2. Empty / invalid inputs fall back to current coordinates
    const snapFallback = sceneApi.setSelectedPosition({ x: '', y: 'invalid', z: NaN });
    assert.equal(snapFallback.x, 90);
    assert.equal(snapFallback.y, 78);
    assert.equal(snapFallback.z, 12);

    // 3. Out-of-bounds coordinates clamp to room interior & ceiling limits
    const ir = interior(sampleDoc.rooms[0]);
    const sofaDef = ITEM_BY_ID.sofa;
    const snapClamped = sceneApi.setSelectedPosition({ x: -500, y: 999, z: 300 });
    assert.equal(snapClamped.x, Math.round((ir.x + sofaDef.w / 2) * 100) / 100);
    assert.equal(snapClamped.y, Math.round((ir.y + ir.h - sofaDef.d / 2) * 100) / 100);
    assert.equal(snapClamped.z, sampleDoc.rooms[0].ceiling - sofaDef.h);

    // 4. Explicit rotation normalizes to [0, 360) and preserves invalid fallback
    const rot1 = sceneApi.setSelectedRotation(405);
    assert.equal(rot1.rot, 45);
    assert.equal(sampleDoc.rooms[0].items[0].rot, 45);

    const rotInvalid = sceneApi.setSelectedRotation('');
    assert.equal(rotInvalid.rot, 45);

    const rotNeg = sceneApi.setSelectedRotation(-90);
    assert.equal(rotNeg.rot, 270);

    // 5. Room direct positioning and elevation
    const selRoom = sceneApi.select3DEntity('r1');
    assert.ok(selRoom);
    assert.equal(selRoom.type, 'room');
    const roomSnap = sceneApi.setSelectedPosition({ x: 24, y: 36, z: 6 });
    assert.equal(roomSnap.x, 24);
    assert.equal(roomSnap.y, 36);
    assert.equal(roomSnap.z, 6);
    assert.equal(sampleDoc.rooms[0].x, 24);
    assert.equal(sampleDoc.rooms[0].y, 36);
    assert.equal(sampleDoc.rooms[0].z, 6);

    sceneApi.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    globalThis.window = oldWindow;
    if (oldDoc) {
      globalThis.document = oldDoc;
      if (!globalThis.document.createElement) {
        globalThis.document.createElement = createDummyCanvas;
      }
    } else {
      globalThis.document = { createElement: createDummyCanvas };
    }
    globalThis.ResizeObserver = oldResizeObserver;
  }
});
