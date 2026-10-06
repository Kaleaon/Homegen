import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate } from '../js/codes.js';
import {
  buildMultiLevel,
  TEMPLATES,
  TEMPLATE_BY_ID,
  renderTemplatePreviewSVG,
} from '../js/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('TEMPLATES gallery offers at least 4 distinct starter layout presets', () => {
  assert.ok(Array.isArray(TEMPLATES));
  assert.ok(TEMPLATES.length >= 4, `Expected at least 4 templates, got ${TEMPLATES.length}`);

  const requiredIds = ['blank', 'studio', 'family_2br', 'multilevel'];
  for (const id of requiredIds) {
    const found = TEMPLATE_BY_ID(id);
    assert.ok(found, `Missing required template id: ${id}`);
    assert.ok(typeof found.title === 'string' && found.title.length > 0);
    assert.ok(typeof found.dimensions === 'string' && found.dimensions.length > 0);
    assert.ok(typeof found.summary === 'string' && found.summary.length > 0);
    assert.ok(typeof found.createState === 'function');
  }
});

test('All starter templates evaluate with zero building code errors', () => {
  for (const template of TEMPLATES) {
    const state = template.createState();
    const report = evaluate(state);
    assert.equal(
      report.errors,
      0,
      `Template "${template.title}" produced ${report.errors} blocking violations: ${JSON.stringify(report.violations.filter((v) => v.severity === 'error'))}`
    );
  }
});

test('renderTemplatePreviewSVG generates valid SVG markup for all template states', () => {
  for (const template of TEMPLATES) {
    const state = template.createState();
    const svg = renderTemplatePreviewSVG(state);
    assert.ok(typeof svg === 'string');
    assert.ok(svg.includes('<svg'), `Template "${template.title}" preview missing <svg tag`);
    assert.ok(svg.includes('</svg>'), `Template "${template.title}" preview missing </svg> tag`);
  }
});

test('index.html contains dlg-templates with correct ARIA accessibility attributes', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(
    html,
    /<dialog\s+id="dlg-templates"\s+aria-labelledby="dlg-templates-title"(\s+class="[^"]*")?>/
  );
  assert.match(html, /<h2\s+id="dlg-templates-title">Choose a Starter Template<\/h2>/);
  assert.match(
    html,
    /<button\s+value="close"\s+aria-label="Close template picker"><span\s+aria-hidden="true">✕<\/span><\/button>/
  );
  assert.match(html, /<div\s+id="template-gallery"\s+class="template-gallery"\s+role="radiogroup"/);
});

test('buildMultiLevel creates a 2-level starter home state with expected room counts and zero errors', () => {
  const state = buildMultiLevel();
  assert.equal(state.name, 'Multi-Level Home');
  assert.equal(state.levels, 2);
  assert.equal(state.rooms.length, 12);

  const level0Rooms = state.rooms.filter((r) => (r.level || 0) === 0);
  const level1Rooms = state.rooms.filter((r) => (r.level || 0) === 1);
  assert.equal(level0Rooms.length, 7);
  assert.equal(level1Rooms.length, 5);

  const report = evaluate(state);
  assert.equal(report.errors, 0, 'buildMultiLevel state should have 0 blocking code errors');
});

test('sampleHome in app.js delegates floorplan generation to buildMultiLevel', async () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) {
      const elObj = {
        id,
        tagName: 'DIV',
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        querySelector: (s) => getEl(s.replace(/^#/, '')),
        querySelectorAll: () => [],
        addEventListener: () => {},
        getAttribute: () => null,
        setAttribute: () => {},
        removeAttribute: () => {},
        hasAttribute: () => false,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      };
      const dummyCtx = {
        canvas: { width: 800, height: 600 },
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createPattern: () => ({}),
      };
      const proxyCtx = new Proxy(dummyCtx, {
        get(target, prop) {
          if (prop in target) return target[prop];
          return () => {};
        },
      });
      elObj.getContext = () => proxyCtx;
      elements[id] = elObj;
    }
    return elements[id];
  };

  global.document = {
    activeElement: getEl('body'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag) => getEl(tag),
  };
  global.window = {
    addEventListener: () => {},
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  global.navigator = global.window.navigator;

  await import(`../js/app.js?t=${Date.now()}`);

  assert.ok(global.window.__homegen, '__homegen test hook should be present');
  const homegen = global.window.__homegen;

  homegen.sampleHome();

  const multiLevelExpected = buildMultiLevel();
  const currentDoc = homegen.doc;

  assert.equal(currentDoc.levels, multiLevelExpected.levels);
  assert.equal(currentDoc.rooms.length, multiLevelExpected.rooms.length);
  assert.deepEqual(
    currentDoc.rooms.map((r) => r.type),
    multiLevelExpected.rooms.map((r) => r.type)
  );
  assert.deepEqual(
    currentDoc.rooms.map((r) => r.level || 0),
    multiLevelExpected.rooms.map((r) => r.level || 0)
  );
});
