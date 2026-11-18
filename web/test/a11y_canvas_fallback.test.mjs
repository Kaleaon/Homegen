import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { updatePlanA11yTree } from '../js/app.js';
import { createScene3D, updateView3dA11yTree } from '../js/scene3d.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../index.html');
const cssPath = path.join(__dirname, '../css/style.css');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');

test('index.html associates #plan and #view3d with offscreen ARIA live regions', () => {
  assert.match(
    htmlContent,
    /<canvas id="plan" [^>]*aria-describedby="plan-fallback-summary"[^>]*><\/canvas>/
  );
  assert.match(
    htmlContent,
    /<div id="plan-fallback-summary" class="sr-only" aria-live="polite"><\/div>/
  );
  assert.match(
    htmlContent,
    /<canvas id="view3d" [^>]*aria-describedby="view3d-fallback-summary"[^>]*><\/canvas>/
  );
  assert.match(
    htmlContent,
    /<div id="view3d-fallback-summary" class="sr-only" aria-live="polite"><\/div>/
  );
});

test('css/style.css defines standard .sr-only utility class for visually hidden text', () => {
  assert.match(cssContent, /\.sr-only\s*\{/);
  assert.match(cssContent, /position:\s*absolute\s*!important/);
  assert.match(cssContent, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)\s*!important/);
});

test('updatePlanA11yTree updates fallback DOM for empty and non-empty levels', async () => {
  const mockElements = {};
  global.document = {
    getElementById(id) {
      if (!mockElements[id]) {
        mockElements[id] = { innerHTML: '', textContent: '' };
      }
      return mockElements[id];
    },
  };

  // Test empty state
  updatePlanA11yTree({ rooms: [] }, 0);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const container = document.getElementById('plan-fallback-summary');
  assert.equal(
    container.innerHTML,
    '<p>Level 1 is empty. Use drafting tools to add rooms or furniture.</p>'
  );

  // Test state with rooms, items, and openings
  const state = {
    rooms: [
      {
        id: 'r1',
        name: 'Living Room',
        level: 0,
        w: 144, // 12 ft
        h: 180, // 15 ft
        items: [{ type: 'sofa' }],
        openings: [{ type: 'door' }],
      },
    ],
  };

  updatePlanA11yTree(state, 0);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.match(container.innerHTML, /Level 1 floorplan contains 1 room\(s\):/);
  assert.match(container.innerHTML, /<strong>Living Room<\/strong>: 12 ft by 15 ft\./);
  assert.match(container.innerHTML, /Openings: door\./i);
  assert.match(container.innerHTML, /Items: Sofa\./i);
});

test('updateView3dA11yTree updates fallback description for orbit and walkthrough camera modes', () => {
  const mockElements = {};
  global.document = {
    getElementById(id) {
      if (!mockElements[id]) {
        mockElements[id] = { innerHTML: '', textContent: '' };
      }
      return mockElements[id];
    },
  };

  const state = {
    rooms: [
      { id: 'r1', name: 'Kitchen', level: 0 },
      { id: 'r2', name: 'Bedroom', level: 0 },
    ],
  };

  // Orbit view
  updateView3dA11yTree(state, 0, 'orbit');
  const container = document.getElementById('view3d-fallback-summary');
  assert.equal(
    container.textContent,
    '3D Viewport in Orbit View mode. Rendering Level 1 with 2 room(s) and standard scene lighting.'
  );

  // Walkthrough mode
  updateView3dA11yTree(state, 0, 'walkthrough');
  assert.equal(
    container.textContent,
    '3D Viewport in First-Person Walkthrough mode. Rendering Level 1 with 2 room(s) and standard scene lighting.'
  );

  // Walk mode
  updateView3dA11yTree(state, 0, 'walk');
  assert.equal(
    container.textContent,
    '3D Viewport in First-Person Walkthrough mode. Rendering Level 1 with 2 room(s) and standard scene lighting.'
  );
});

test('updateView3dA11yTree caches DOM element and skips textContent writes on unchanged frames', () => {
  let getByIdCalls = 0;
  let textWrites = 0;
  let currentText = '';

  const summaryEl = {
    isConnected: true,
    get textContent() {
      return currentText;
    },
    set textContent(val) {
      textWrites++;
      currentText = val;
    },
  };

  global.document = {
    getElementById(id) {
      getByIdCalls++;
      return id === 'view3d-fallback-summary' ? summaryEl : null;
    },
  };

  const state = {
    rooms: [{ id: 'r1', name: 'Kitchen', level: 0 }],
  };

  for (let i = 0; i < 60; i++) {
    updateView3dA11yTree(state, 0, 'orbit');
  }
  assert.equal(getByIdCalls, 1, 'getElementById should only be called once across repeated frames');
  assert.equal(textWrites, 1, 'textContent should only be written once when summary is unchanged');

  for (let i = 0; i < 60; i++) {
    updateView3dA11yTree(state, 0, 'walk');
  }
  assert.equal(getByIdCalls, 1, 'cached element reference should still be reused');
  assert.equal(textWrites, 2, 'textContent should update once when camera mode changes');

  state.rooms.push({ id: 'r2', name: 'Office', level: 0 });
  for (let i = 0; i < 60; i++) {
    updateView3dA11yTree(state, 0, 'walk');
  }
  assert.equal(getByIdCalls, 1, 'cached element reference should still be reused');
  assert.equal(textWrites, 3, 'textContent should update once when room count changes');
});

test('updateView3dA11yTree handles dynamic DOM element replacement and null or empty state objects', () => {
  let activeEl = { isConnected: true, textContent: '' };
  let getByIdCalls = 0;

  global.document = {
    getElementById(id) {
      getByIdCalls++;
      return id === 'view3d-fallback-summary' ? activeEl : null;
    },
  };

  // Null and empty state objects
  updateView3dA11yTree(null, null, 'orbit');
  assert.equal(
    activeEl.textContent,
    '3D Viewport in Orbit View mode. Rendering Level 1 with 0 room(s) and standard scene lighting.'
  );
  assert.equal(getByIdCalls, 1);

  updateView3dA11yTree({}, 0, 'orbit');
  assert.equal(getByIdCalls, 1, 'unchanged empty state should reuse cached element');

  // Simulate dynamic DOM element detachment and replacement
  activeEl.isConnected = false;
  const replacementEl = { isConnected: true, textContent: '' };
  activeEl = replacementEl;

  updateView3dA11yTree(undefined, 0, 'orbit');
  assert.equal(getByIdCalls, 2, 'detached element should trigger fresh getElementById lookup');
  assert.equal(
    replacementEl.textContent,
    '3D Viewport in Orbit View mode. Rendering Level 1 with 0 room(s) and standard scene lighting.'
  );
});

test('createScene3D updateHudAttribution caches badge reference and diffs attribution text across frames', () => {
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevRO = globalThis.ResizeObserver;
  const prevWin = globalThis.window;

  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.window = { devicePixelRatio: 1 };

  let querySelectorCalls = 0;
  let createDivCalls = 0;
  let hudTextWrites = 0;
  let hudDisplayWrites = 0;
  let attachedBadge = null;

  const mock2d = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  const baseGl = {
    canvas: { width: 800, height: 600 },
    getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
    getExtension: () => null,
    getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
    checkFramebufferStatus: () => 36053,
    createFramebuffer: () => ({ id: 1 }),
    createRenderbuffer: () => ({ id: 1 }),
    createTexture: () => ({ id: 1 }),
    createBuffer: () => ({ id: 1 }),
    createProgram: () => ({ id: 1 }),
    createShader: () => ({ id: 1 }),
    createVertexArray: () => ({ id: 1 }),
    TRIANGLES: 4,
  };
  const mockGl = new Proxy(baseGl, { get: (t, p) => (p in t ? t[p] : () => {}) });

  const parentEl = {
    style: { position: 'relative' },
    contains: (el) => el === attachedBadge,
    querySelector(sel) {
      querySelectorCalls++;
      return sel === '.scene3d-hud-attribution' ? attachedBadge : null;
    },
    appendChild(el) {
      el.parentElement = parentEl;
      attachedBadge = el;
    },
  };

  const mockDoc = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    createElement(tag) {
      if (tag === 'div') {
        createDivCalls++;
        let txt = '';
        let disp = '';
        return {
          className: '',
          style: {
            set cssText(_v) {},
            get display() {
              return disp;
            },
            set display(v) {
              hudDisplayWrites++;
              disp = v;
            },
          },
          get textContent() {
            return txt;
          },
          set textContent(v) {
            hudTextWrites++;
            txt = v;
          },
        };
      }
      return { width: 256, height: 256, getContext: () => mock2d, style: {} };
    },
  };
  global.document = mockDoc;

  const canvas = {
    width: 800,
    height: 600,
    style: {},
    parentElement: parentEl,
    ownerDocument: mockDoc,
    getRootNode: () => mockDoc,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: (type) => (type === '2d' ? mock2d : mockGl),
  };

  try {
    const state = { rooms: [], background: null };
    const api = createScene3D(
      canvas,
      () => state,
      () => 0
    );

    // 1. 60 frames with empty attribution
    for (let i = 0; i < 60; i++) {
      api.updateHudAttribution();
    }
    assert.equal(querySelectorCalls, 1, 'initial empty check queries parent once');
    assert.equal(createDivCalls, 0, 'badge is not created when attribution is empty');
    assert.equal(hudTextWrites, 0);
    assert.equal(hudDisplayWrites, 0);

    // 2. Enable HD textures and run 60 frames
    api.opts.hd = true;
    for (let i = 0; i < 60; i++) {
      api.updateHudAttribution();
    }
    assert.equal(createDivCalls, 1, 'badge created once when attribution becomes active');
    assert.equal(hudTextWrites, 1, 'badge textContent written once across 60 unchanged frames');
    assert.equal(hudDisplayWrites, 1, 'badge display written once across 60 unchanged frames');
    assert.equal(attachedBadge.style.display, 'block');
    assert.equal(attachedBadge.textContent, 'HD Textures © Poly Haven (CC0)');

    const qsAfterCreate = querySelectorCalls;

    // 3. Add geospatial background attribution and run 60 frames
    state.background = { visible: true, attributionText: '© OpenStreetMap contributors' };
    for (let i = 0; i < 60; i++) {
      api.updateHudAttribution();
    }
    assert.equal(querySelectorCalls, qsAfterCreate, 'cached badge reused without querySelector');
    assert.equal(createDivCalls, 1);
    assert.equal(hudTextWrites, 2, 'textContent updated once for new attribution string');
    assert.equal(hudDisplayWrites, 1, 'display not rewritten when already block');
    assert.match(attachedBadge.textContent, /OpenStreetMap/);

    // 4. Clear attribution and run 60 frames
    api.opts.hd = false;
    state.background = null;
    for (let i = 0; i < 60; i++) {
      api.updateHudAttribution();
    }
    assert.equal(querySelectorCalls, qsAfterCreate);
    assert.equal(hudTextWrites, 2, 'hiding badge does not rewrite textContent');
    assert.equal(hudDisplayWrites, 2, 'display updated once to none');
    assert.equal(attachedBadge.style.display, 'none');

    // 5. Simulate badge detachment and re-enable attribution
    attachedBadge.parentElement = null;
    attachedBadge = null;
    api.opts.hd = true;
    api.updateHudAttribution();
    assert.equal(createDivCalls, 2, 'detached badge is recreated when attribution becomes active');
    assert.equal(attachedBadge.style.display, 'block');
    assert.equal(attachedBadge.textContent, 'HD Textures © Poly Haven (CC0)');

    api.destroy();
  } finally {
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.cancelAnimationFrame = prevCaf;
    globalThis.ResizeObserver = prevRO;
    globalThis.window = prevWin;
  }
});
