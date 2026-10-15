import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { announce3DStateChange, createScene3D } from '../js/scene3d.js';
import { TransformGizmo, stepResize, createGridSettings } from '../../designer3d/tools/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

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

test('index.html contains #view3d-a11y-live polite live region', () => {
  assert.match(
    htmlContent,
    /<div id="view3d-a11y-live" class="sr-only" aria-live="polite"><\/div>/
  );
});

test('announce3DStateChange updates DOM #view3d-a11y-live textContent', () => {
  const mockDiv = { textContent: '' };
  const originalGetById = globalThis.document?.getElementById;

  if (!globalThis.document) {
    globalThis.document = {
      createElement: () => ({ width: 256, height: 256, getContext: () => mock2d }),
    };
  }
  globalThis.document.getElementById = (id) => {
    if (id === 'view3d-a11y-live') return mockDiv;
    return null;
  };

  try {
    announce3DStateChange('Selected Sofa, Position: X 5\' 0", Z 4\' 0"');
    assert.equal(mockDiv.textContent, 'Selected Sofa, Position: X 5\' 0", Z 4\' 0"');
  } finally {
    if (originalGetById) {
      globalThis.document.getElementById = originalGetById;
    }
  }
});

test('TransformGizmo and stepResize perform discrete step calculations correctly', () => {
  const gizmo = new TransformGizmo(createGridSettings({ unitSize: 6, angleSnapDegrees: 15 }), {
    isEnabled: () => false,
  });

  const item = { id: 'sofa_1', position: { x: 60, y: 48 }, rot: 0 };
  const moved = gizmo.stepMove(item, 6, 12);
  assert.deepEqual(moved.position, { x: 66, y: 60 });

  const rotated = gizmo.stepRotate(item, 15);
  assert.ok(Math.abs(rotated.rotation - (15 * Math.PI) / 180) < 0.001);

  const room = { id: 'r1', name: 'Living Room', type: 'living', x: 0, y: 0, w: 144, h: 120 };
  const resized = stepResize(room, 'se', 0, 12);
  assert.equal(resized.rect.w, 144);
  assert.equal(resized.rect.h, 132);
  assert.equal(resized.isValid, true);
  assert.equal(resized.dimensionText, '12\' 0" × 11\' 0"');
});

test('3D Canvas keyboard navigation cycles selection, transforms items, and resizes handles', async () => {
  const liveEl = { textContent: '' };

  const sampleDoc = {
    rooms: [
      {
        id: 'r1',
        name: 'Living Room',
        type: 'living',
        x: 0,
        y: 0,
        w: 144,
        h: 120,
        ceiling: 96,
        floor: 'floor_oak',
        walls: { N: 'paint_white', S: 'paint_white', E: 'paint_white', W: 'paint_white' },
        openings: [],
        items: [{ id: 'sofa1', type: 'sofa', x: 60, y: 48, rot: 0 }],
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

  const getDoc = () => sampleDoc;
  const getLevel = () => 0;

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
    const sceneApi = createScene3D(mockCanvas, getDoc, getLevel);

    // Initial state: nothing selected
    assert.equal(sceneApi.getSelected3DEntity(), null);

    // 1. Cycle selection using cycle3DSelection
    const sel1 = sceneApi.cycle3DSelection(1);
    assert.ok(sel1);
    assert.equal(sel1.type, 'handle');
    assert.match(liveEl.textContent, /Living Room Top-Left Handle/);

    // Cycle to Sofa item
    let selItem = null;
    for (let i = 0; i < 5; i++) {
      const candidate = sceneApi.cycle3DSelection(1);
      if (candidate.type === 'item') {
        selItem = candidate;
        break;
      }
    }
    assert.ok(selItem);
    assert.equal(selItem.item.id, 'sofa1');
    assert.match(liveEl.textContent, /Selected Sofa, Position: X 5' 0", Z 4' 0"/);

    // 2. Move sofa right by 6 inches
    sceneApi.stepTransformSelected(6, 0);
    assert.equal(sampleDoc.rooms[0].items[0].x, 66);
    assert.match(liveEl.textContent, /Moved Sofa right to X 5' 6", Z 4' 0"/);

    // 3. Switch to rotate mode and rotate
    sceneApi.set3DTransformMode('rotate');
    assert.match(liveEl.textContent, /Rotate mode active/);
    sceneApi.stepTransformSelected(15, 0);
    assert.equal(sampleDoc.rooms[0].items[0].rot, 15);
    assert.match(liveEl.textContent, /Rotated Sofa to 15°/);

    // 4. Select SE handle (Bottom-Right) and resize room
    let selHandle = null;
    for (let i = 0; i < 5; i++) {
      const candidate = sceneApi.cycle3DSelection(1);
      if (candidate.type === 'handle' && candidate.handleId === 'se') {
        selHandle = candidate;
        break;
      }
    }
    assert.ok(selHandle);
    assert.match(liveEl.textContent, /Living Room Bottom-Right Handle/);

    // Expand length down by 12 inches (1 foot)
    sceneApi.stepTransformSelected(0, 12);
    assert.equal(sampleDoc.rooms[0].h, 132);
    assert.match(liveEl.textContent, /Living Room resized to 12' 0" × 11' 0" \(132 sq ft, Valid\)/);

    // 5. Clear selection
    sceneApi.clear3DSelection();
    assert.equal(sceneApi.getSelected3DEntity(), null);
    assert.equal(liveEl.textContent, 'Deselected 3D object.');

    // Wait briefly for any background async texture preloading promises to resolve
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
