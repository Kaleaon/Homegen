import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('overlays.css module defines component custom properties mapped to Ktheme tokens', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  assert.ok(fs.existsSync(cssPath), 'web/css/overlays.css must exist');

  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify internal component variables
  assert.ok(css.includes('--overlay-bg:'), 'overlays.css must define --overlay-bg');
  assert.ok(css.includes('--overlay-border:'), 'overlays.css must define --overlay-border');
  assert.ok(css.includes('--overlay-radius:'), 'overlays.css must define --overlay-radius');
  assert.ok(css.includes('--overlay-blur:'), 'overlays.css must define --overlay-blur');
  assert.ok(css.includes('--overlay-shadow:'), 'overlays.css must define --overlay-shadow');

  // Verify mapping to canonical Ktheme tokens
  assert.ok(
    css.includes('--ktheme-bg-surface'),
    'overlays.css must map --overlay-bg to --ktheme-bg-surface'
  );
  assert.ok(
    css.includes('--ktheme-border'),
    'overlays.css must map --overlay-border to --ktheme-border'
  );
  assert.ok(css.includes('--radius-lg'), 'overlays.css must map --overlay-radius to --radius-lg');
  assert.ok(css.includes('--shadow-lg'), 'overlays.css must map --overlay-shadow to --shadow-lg');
});

test('overlays.css defines required BEM component overlay classes', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.k-overlay-dialog'), 'overlays.css must define .k-overlay-dialog');
  assert.ok(css.includes('.k-overlay-drawer'), 'overlays.css must define .k-overlay-drawer');
  assert.ok(css.includes('.k-overlay-hud'), 'overlays.css must define .k-overlay-hud');
  assert.ok(css.includes('.k-overlay-card'), 'overlays.css must define .k-overlay-card');
});

test('index.html links tokens.css, style.css, and overlays.css in correct order', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const tokensIdx = html.indexOf('css/tokens.css');
  const styleIdx = html.indexOf('css/style.css');
  const overlaysIdx = html.indexOf('css/overlays.css');

  assert.ok(tokensIdx !== -1, 'index.html must link css/tokens.css');
  assert.ok(styleIdx !== -1, 'index.html must link css/style.css');
  assert.ok(overlaysIdx !== -1, 'index.html must link css/overlays.css');

  assert.ok(tokensIdx < styleIdx, 'tokens.css must be loaded before style.css');
  assert.ok(styleIdx < overlaysIdx, 'style.css must be loaded before overlays.css');
});

test('index.html applies BEM overlay classes to floating elements and replaces inline styles on #svg-preview', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Check dialogs have k-overlay-dialog class
  assert.ok(
    html.includes('class="k-overlay-dialog"') || html.includes('k-overlay-dialog'),
    'dialogs in index.html must use k-overlay-dialog class'
  );

  // Check diff-drawer has k-overlay-drawer
  assert.ok(
    html.includes('k-overlay-drawer'),
    '#diff-drawer in index.html must use k-overlay-drawer class'
  );

  // Check walkthrough-hud has k-overlay-hud
  assert.ok(
    html.includes('k-overlay-hud'),
    '#walkthrough-hud in index.html must use k-overlay-hud class'
  );

  // Check svg-preview uses k-overlay-card and lacks inline style
  assert.match(
    html,
    /<div\s+id="svg-preview"\s+class="k-overlay-card"><\/div>/,
    '#svg-preview must use k-overlay-card class without inline style'
  );
});

test('overlays.css defines .k-target-min-size utility class for 24x24px minimum hit targets', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    css.includes('.k-target-min-size'),
    'overlays.css must define .k-target-min-size utility class'
  );
  assert.ok(
    css.includes('min-width: 24px') || css.includes('min-width:24px'),
    'overlays.css must set min-width: 24px on min target utility'
  );
  assert.ok(
    css.includes('min-height: 24px') || css.includes('min-height:24px'),
    'overlays.css must set min-height: 24px on min target utility'
  );
});

test('style.css defines .diff-close-btn with 24x24px minimum target size and centered flex alignment', () => {
  const cssPath = path.join(__dirname, '../css/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.diff-close-btn'), 'style.css must define .diff-close-btn');
  assert.ok(
    css.includes('padding: 6px 10px;'),
    '.diff-close-btn must use expanded padding (6px 10px)'
  );
  assert.ok(css.includes('min-width: 24px;'), '.diff-close-btn must set min-width: 24px');
  assert.ok(css.includes('min-height: 24px;'), '.diff-close-btn must set min-height: 24px');
  assert.ok(
    css.includes('display: inline-flex;') || css.includes('display:inline-flex;'),
    '.diff-close-btn must use display: inline-flex'
  );
  assert.ok(
    css.includes('align-items: center;') || css.includes('align-items:center;'),
    '.diff-close-btn must use align-items: center'
  );
  assert.ok(
    css.includes('justify-content: center;') || css.includes('justify-content:center;'),
    '.diff-close-btn must use justify-content: center'
  );
});

test('overlays.css defines tokenized GIS lot setback table styles', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.gis-empty-msg'), 'overlays.css must define .gis-empty-msg');
  assert.ok(css.includes('.gis-segment-table'), 'overlays.css must define .gis-segment-table');
  assert.ok(css.includes('.gis-table-head-row'), 'overlays.css must define .gis-table-head-row');
  assert.ok(css.includes('.gis-table-row'), 'overlays.css must define .gis-table-row');
  assert.ok(css.includes('.gis-table-cell'), 'overlays.css must define .gis-table-cell');
  assert.ok(css.includes('.gis-setback-input'), 'overlays.css must define .gis-setback-input');
});

test('renderGISSegments in app.js uses <k-input type="number"> and contains zero hardcoded inline style attributes or color hex strings', () => {
  const appJsPath = path.join(__dirname, '../js/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Extract renderGISSegments function block
  const fnMatch = appJs.match(/export function renderGISSegments\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, 'renderGISSegments function found in app.js');
  const fnCode = fnMatch[1];

  // Verify k-input usage
  assert.match(
    fnCode,
    /<k-input type="number" min="0" max="360" value="\${seg\.setback \?\? 36}" data-seg-id="\${seg\.id}" class="gis-setback-input"><\/k-input>/,
    'renderGISSegments renders setback inputs using <k-input>'
  );

  // Verify zero hardcoded inline style attributes
  assert.ok(
    !fnCode.includes('style='),
    'renderGISSegments must contain zero style= inline attributes'
  );

  // Verify zero hardcoded hex color strings
  assert.ok(
    !/#([0-9a-fA-F]{3}){1,2}\b/.test(fnCode),
    'renderGISSegments must contain zero hardcoded hex color strings'
  );
});

test('overlays.css defines .scene3d-hud-attribution using tokenized Ktheme custom properties', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const ruleMatch = css.match(/\.scene3d-hud-attribution\s*\{([\s\S]*?)\}/);
  assert.ok(ruleMatch, 'overlays.css must define .scene3d-hud-attribution');
  const ruleBody = ruleMatch[1];

  assert.match(ruleBody, /position:\s*absolute;/, 'must maintain position: absolute');
  assert.match(ruleBody, /bottom:\s*12px;/, 'must maintain bottom: 12px');
  assert.match(ruleBody, /right:\s*12px;/, 'must maintain right: 12px');
  assert.match(ruleBody, /pointer-events:\s*none;/, 'must maintain pointer-events: none');
  assert.match(ruleBody, /z-index:\s*15;/, 'must maintain z-index: 15');
  assert.ok(
    ruleBody.includes('var(--overlay-bg-hud'),
    'must map background to var(--overlay-bg-hud, ...)'
  );
  assert.ok(
    ruleBody.includes('var(--ktheme-text'),
    'must map text color to var(--ktheme-text, ...)'
  );
  assert.ok(
    ruleBody.includes('var(--overlay-border'),
    'must map border to var(--overlay-border, ...)'
  );
  assert.ok(
    ruleBody.includes('var(--radius-xs'),
    'must map border-radius to var(--radius-xs, 4px)'
  );
  assert.ok(
    ruleBody.includes('var(--font-size-xs'),
    'must map font-size to var(--font-size-xs, 11px)'
  );
  assert.ok(
    ruleBody.includes('var(--font-family-sans)'),
    'must map font-family to var(--font-family-sans)'
  );
  assert.ok(
    ruleBody.includes('blur(var(--overlay-blur'),
    'must map backdrop-filter to blur(var(--overlay-blur, ...))'
  );
  assert.ok(ruleBody.includes('var(--shadow-sm'), 'must map box-shadow to var(--shadow-sm)');
});

test('updateHudAttribution in scene3d.js assigns .scene3d-hud-attribution class and contains zero inline cssText or hardcoded hex colors', () => {
  const scene3dPath = path.join(__dirname, '../js/scene3d.js');
  const scene3dCode = fs.readFileSync(scene3dPath, 'utf8');

  const fnMatch = scene3dCode.match(/function updateHudAttribution\(\)\s*\{([\s\S]*?)\n\s{2}\}/);
  assert.ok(fnMatch, 'updateHudAttribution function must exist in scene3d.js');
  const fnCode = fnMatch[1];

  assert.ok(
    fnCode.includes("hudBadge.className = 'scene3d-hud-attribution'"),
    'updateHudAttribution must set className to scene3d-hud-attribution'
  );
  assert.ok(
    fnCode.includes("hudBadge.style.display = 'block'") &&
      fnCode.includes("hudBadge.style.display = 'none'"),
    'updateHudAttribution must retain dynamic display visibility toggling'
  );
  assert.ok(
    !fnCode.includes('cssText'),
    'updateHudAttribution must contain zero inline cssText assignments'
  );
  assert.ok(
    !fnCode.includes('#f8fafc') && !/#([0-9a-fA-F]{3}){1,2}\b/.test(fnCode),
    'updateHudAttribution must contain zero static hardcoded hex colors'
  );
});

test('updateHudAttribution dynamically injects .scene3d-hud-attribution without inline cssText and toggles display', async () => {
  const prevDoc = globalThis.document;
  const prevCancel = globalThis.cancelAnimationFrame;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevRO = globalThis.ResizeObserver;

  globalThis.cancelAnimationFrame = () => {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const baseGlCtx = {
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
  const mockGlCtx = new Proxy(baseGlCtx, {
    get(target, prop) {
      return prop in target ? target[prop] : () => {};
    },
  });
  const mock2d = new Proxy(
    {
      measureText: (txt) => ({ width: txt.length * 7 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => ({}),
    },
    {
      get(target, prop) {
        return prop in target ? target[prop] : () => {};
      },
    }
  );

  let appendedBadge = null;
  const mockDoc = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      width: 256,
      height: 256,
      getContext: () => mock2d,
      style: {},
    }),
  };
  globalThis.document = mockDoc;

  try {
    const { createScene3D } = await import('../js/scene3d.js');
    const state = {
      rooms: [],
      background: {
        visible: true,
        attributionText: '© OpenStreetMap contributors',
        provider: 'OpenStreetMap',
        isGeospatial: true,
      },
    };

    const parentElement = {
      style: {},
      querySelector: (sel) => (sel === '.scene3d-hud-attribution' ? appendedBadge : null),
      appendChild: (el) => {
        appendedBadge = el;
      },
    };

    const canvas = {
      width: 800,
      height: 600,
      style: {},
      ownerDocument: mockDoc,
      getRootNode: () => mockDoc,
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: (type) => (type === 'webgl' || type === 'webgl2' ? mockGlCtx : mock2d),
      parentElement,
    };

    const api = createScene3D(
      canvas,
      () => state,
      () => 0
    );

    api.updateHudAttribution();
    assert.ok(appendedBadge, 'HUD attribution element must be created and appended');
    assert.equal(appendedBadge.className, 'scene3d-hud-attribution');
    assert.equal(appendedBadge.style.cssText, undefined, 'style.cssText must not be assigned');
    assert.equal(appendedBadge.style.display, 'block');
    assert.equal(appendedBadge.textContent, '© OpenStreetMap contributors');

    state.background.visible = false;
    api.updateHudAttribution();
    assert.equal(appendedBadge.style.display, 'none', 'HUD badge hides when attribution is empty');
  } finally {
    globalThis.document = prevDoc;
    globalThis.cancelAnimationFrame = prevCancel;
    globalThis.requestAnimationFrame = prevRaf;
    globalThis.ResizeObserver = prevRO;
  }
});
