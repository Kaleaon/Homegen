import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatRangeValueText,
  updateRangeAriaValueText,
  RANGE_VALUE_FORMATTERS,
} from '../js/app.js';
import {
  initView3D,
  formatRangeValueText as ui3dFormatRangeValueText,
  updateRangeAriaValueText as ui3dUpdateRangeAriaValueText,
} from '../js/ui3d.js';
import { updateView3dA11yTree } from '../js/scene3d.js';
import { KInput } from '../js/k-components.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function createMockControl(initialValue = '') {
  const attrs = new Map();
  const listeners = new Map();
  return {
    value: String(initialValue),
    checked: false,
    hidden: false,
    innerHTML: '',
    textContent: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    setAttribute(name, val) {
      attrs.set(name, String(val));
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type) {
      const fns = listeners.get(type) || [];
      for (const fn of fns) {
        fn({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} });
      }
    },
  };
}

test('static range sliders in index.html declare initial formatted aria-valuetext attributes', () => {
  assert.match(
    htmlContent,
    /<input id="bg-opacity"[^>]*type="range"[^>]*value="0\.5"[^>]*aria-valuetext="50%"/
  );
  assert.match(
    htmlContent,
    /<input id="o-sun"[^>]*type="range"[^>]*value="0\.65"[^>]*aria-valuetext="65%"/
  );
  assert.match(
    htmlContent,
    /<k-input id="stamp-opacity"[^>]*type="range"[^>]*value="0\.9"[^>]*aria-valuetext="90%"/
  );
  assert.match(
    htmlContent,
    /<k-input id="wm-opacity"[^>]*type="range"[^>]*value="0\.2"[^>]*aria-valuetext="20%"/
  );

  assert.ok(KInput.observedAttributes.includes('aria-valuetext'));
  const innerAttrs = new Map();
  const hostAttrs = new Map([['aria-valuetext', '90%']]);
  const instance = Object.create(KInput.prototype);
  instance._input = {
    value: '0.9',
    disabled: false,
    readOnly: false,
    setAttribute(name, val) {
      innerAttrs.set(name, val);
    },
    removeAttribute(name) {
      innerAttrs.delete(name);
    },
  };
  instance.hasAttribute = (name) => hostAttrs.has(name);
  instance.getAttribute = (name) => hostAttrs.get(name) ?? null;
  instance.connectedCallback();
  assert.equal(innerAttrs.get('aria-valuetext'), '90%');

  hostAttrs.set('aria-valuetext', '45%');
  instance.attributeChangedCallback('aria-valuetext', '90%', '45%');
  assert.equal(innerAttrs.get('aria-valuetext'), '45%');
});

test('dynamic UV inspector range templates and bindPair in app.js wire initial and reactive aria-valuetext', () => {
  assert.match(
    appJsContent,
    /<input id="i-uv-scale-u-range"[^>]*aria-valuetext="\$\{formatRangeValueText\(uv\.scaleU, 'multiplier'\)\}"/
  );
  assert.match(
    appJsContent,
    /<input id="i-uv-scale-v-range"[^>]*aria-valuetext="\$\{formatRangeValueText\(uv\.scaleV, 'multiplier'\)\}"/
  );
  assert.match(
    appJsContent,
    /<input id="i-uv-rot-range"[^>]*aria-valuetext="\$\{formatRangeValueText\(uv\.rotation, 'degrees'\)\}"/
  );
  assert.match(
    appJsContent,
    /<input id="i-uv-off-u-range"[^>]*aria-valuetext="\$\{formatRangeValueText\(uv\.offsetU, 'offset'\)\}"/
  );
  assert.match(
    appJsContent,
    /<input id="i-uv-off-v-range"[^>]*aria-valuetext="\$\{formatRangeValueText\(uv\.offsetV, 'offset'\)\}"/
  );
  assert.match(
    appJsContent,
    /bindPair\('#i-uv-scale-u-range',\s*'#i-uv-scale-u-num',\s*'multiplier'\)/
  );
  assert.match(appJsContent, /bindPair\('#i-uv-rot-range',\s*'#i-uv-rot-num',\s*'degrees'\)/);
  assert.match(appJsContent, /bindPair\('#i-uv-off-u-range',\s*'#i-uv-off-u-num',\s*'offset'\)/);
});

test('formatRangeValueText and updateRangeAriaValueText format percent, degrees, multipliers, and offsets accurately', () => {
  assert.equal(formatRangeValueText, ui3dFormatRangeValueText);
  assert.equal(updateRangeAriaValueText, ui3dUpdateRangeAriaValueText);
  assert.ok(RANGE_VALUE_FORMATTERS.percent);

  // Percent
  assert.equal(formatRangeValueText(0.5, 'percent'), '50%');
  assert.equal(formatRangeValueText(0.55, 'percent'), '55%');
  assert.equal(formatRangeValueText('0.65', 'percent'), '65%');
  assert.equal(formatRangeValueText(0, 'percent'), '0%');
  assert.equal(formatRangeValueText(1, 'percent'), '100%');

  // Degrees
  assert.equal(formatRangeValueText(0, 'degrees'), '0°');
  assert.equal(formatRangeValueText(180, 'degrees'), '180°');
  assert.equal(formatRangeValueText('22.5', 'degrees'), '22.5°');

  // Multiplier (including IEEE-754 float precision)
  assert.equal(formatRangeValueText(1.0, 'multiplier'), '1x');
  assert.equal(formatRangeValueText(0.1 + 0.2, 'multiplier'), '0.3x');
  assert.equal(formatRangeValueText('2.5', 'multiplier'), '2.5x');

  // Offset (signed tiles + singular/plural + float precision)
  assert.equal(formatRangeValueText(0, 'offset'), '0 tiles');
  assert.equal(formatRangeValueText(0.1 + 0.2, 'offset'), '+0.3 tiles');
  assert.equal(formatRangeValueText(-0.5, 'offset'), '-0.5 tiles');
  assert.equal(formatRangeValueText(1, 'offset'), '+1 tile');
  assert.equal(formatRangeValueText(-1, 'offset'), '-1 tile');

  // Custom formatter function & DOM attribute update
  const slider = createMockControl('0.75');
  updateRangeAriaValueText(slider, 'percent');
  assert.equal(slider.getAttribute('aria-valuetext'), '75%');

  slider.value = '1.4';
  updateRangeAriaValueText(slider, 'multiplier');
  assert.equal(slider.getAttribute('aria-valuetext'), '1.4x');

  slider.value = '12';
  updateRangeAriaValueText(slider, (v) => `${v} inches`);
  assert.equal(slider.getAttribute('aria-valuetext'), '12 inches');
});

test('initView3D initializes #o-sun aria-valuetext and updates it on input and change events', () => {
  const controls = new Map();
  const getCtrl = (sel) => {
    if (!controls.has(sel)) {
      controls.set(sel, createMockControl(sel === '#o-sun' ? '0.65' : ''));
    }
    return controls.get(sel);
  };

  const oldDoc = globalThis.document;
  const oldWin = globalThis.window;

  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = {
    querySelector: (sel) => getCtrl(sel),
    querySelectorAll: () => [],
  };

  try {
    initView3D({
      getDoc: () => ({ rooms: [] }),
      getLevel: () => 0,
      getSelectedRoomId: () => null,
      toast: () => {},
      setLevel: () => {},
    });

    const sunSlider = getCtrl('#o-sun');
    assert.equal(sunSlider.getAttribute('aria-valuetext'), '65%');

    sunSlider.value = '0.35';
    sunSlider.dispatch('input');
    assert.equal(sunSlider.getAttribute('aria-valuetext'), '35%');

    sunSlider.value = '0.8';
    sunSlider.dispatch('change');
    assert.equal(sunSlider.getAttribute('aria-valuetext'), '80%');
  } finally {
    globalThis.document = oldDoc;
    globalThis.window = oldWin;
  }
});

test('updateView3dA11yTree renders granular room dimensions, finishes, openings, and items and caches unchanged HTML', () => {
  const oldDoc = globalThis.document;
  let htmlValue = '';
  let writeCount = 0;

  const container = {};
  Object.defineProperty(container, 'innerHTML', {
    get() {
      return htmlValue;
    },
    set(val) {
      writeCount += 1;
      htmlValue = val;
    },
    configurable: true,
  });

  globalThis.document = {
    getElementById(id) {
      if (id === 'view3d-fallback-summary') return container;
      return null;
    },
  };

  try {
    // 1. Empty level state
    updateView3dA11yTree({ rooms: [] }, 0, 'orbit');
    assert.equal(writeCount, 1);
    assert.match(
      htmlValue,
      /Level 1 is empty\. Switch to 2D plan view to add rooms or furniture\./
    );

    // Repeated call with identical empty state does not touch innerHTML setter
    updateView3dA11yTree({ rooms: [] }, 0, 'orbit');
    assert.equal(writeCount, 1);

    // 2. Populated architectural scene state
    const sceneState = {
      rooms: [
        {
          id: 'r1',
          name: 'Master Suite & Bath',
          level: 0,
          w: 180, // 15 ft
          h: 144, // 12 ft
          ceiling: 108, // 9 ft
          floor: 'floor_walnut',
          walls: {
            N: 'paint_sage',
            E: 'paint_white',
            S: 'paint_white',
            W: 'tex_custom123',
          },
          openings: [{ type: 'door_interior_32' }, { type: 'win_casement_30x48' }],
          items: [{ type: 'bed_queen' }, { type: 'dresser' }],
        },
        {
          id: 'r2',
          name: 'Upper Loft',
          level: 1,
          w: 120,
          h: 120,
          ceiling: 96,
          floor: 'floor_oak',
        },
      ],
    };

    updateView3dA11yTree(sceneState, 0, 'orbit');
    assert.equal(writeCount, 2);
    assert.match(
      htmlValue,
      /<p>3D Viewport in Orbit View mode\. Rendering Level 1 with 1 room\(s\) and standard scene lighting\.<\/p>/
    );
    assert.match(
      htmlValue,
      /<li><strong>Master Suite &amp; Bath<\/strong>: 15 ft by 12 ft \(9 ft ceiling\)\./
    );
    assert.match(
      htmlValue,
      /Finishes: Walnut plank floor, Sage green, White paint, Custom texture walls\./
    );
    assert.match(htmlValue, /Openings: Interior door 32&quot;, Casement 30×48\./);
    assert.match(htmlValue, /Items: Queen bed, Dresser\.<\/li>/);

    // 3. Simulate 60 FPS WebGL render loop frames with unchanged state -> zero extra DOM writes
    for (let frame = 0; frame < 60; frame++) {
      updateView3dA11yTree(sceneState, 0, 'orbit');
    }
    assert.equal(writeCount, 2);

    // 4. Camera mode switch updates DOM once and caches again
    updateView3dA11yTree(sceneState, 0, 'walk');
    assert.equal(writeCount, 3);
    assert.match(htmlValue, /First-Person Walkthrough mode/);

    updateView3dA11yTree(sceneState, 0, 'walk');
    assert.equal(writeCount, 3);

    // 5. Level switch updates DOM to Level 2 room
    updateView3dA11yTree(sceneState, 1, 'walk');
    assert.equal(writeCount, 4);
    assert.match(htmlValue, /Rendering Level 2 with 1 room\(s\)/);
    assert.match(htmlValue, /<strong>Upper Loft<\/strong>: 10 ft by 10 ft \(8 ft ceiling\)\./);
  } finally {
    globalThis.document = oldDoc;
  }
});
