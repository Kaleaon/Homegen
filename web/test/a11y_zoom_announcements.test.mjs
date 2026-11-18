import test from 'node:test';
import assert from 'node:assert/strict';

function setupMockDOM() {
  const elements = {};
  const textWrites = {};

  const getEl = (id) => {
    if (!elements[id]) {
      const listeners = {};
      const attrs = {};
      let textVal = '';
      let htmlVal = '';
      textWrites[id] = [];

      const elObj = {
        id,
        tagName: id === 'plan' ? 'CANVAS' : 'DIV',
        style: {},
        dataset: {},
        hidden: false,
        checked: true,
        value: '',
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        querySelector: (s) => getEl(s.replace(/^#/, '')),
        querySelectorAll: () => [],
        addEventListener(type, fn) {
          listeners[type] ||= [];
          listeners[type].push(fn);
        },
        removeEventListener(type, fn) {
          if (!listeners[type]) return;
          listeners[type] = listeners[type].filter((cb) => cb !== fn);
        },
        dispatchEvent(evt) {
          const list = listeners[evt.type] || [];
          for (const cb of list) cb(evt);
        },
        click() {
          this.dispatchEvent({
            type: 'click',
            target: this,
            currentTarget: this,
            preventDefault() {},
          });
        },
        closest: () => null,
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        setAttribute: (k, v) => {
          attrs[k] = String(v);
        },
        removeAttribute: (k) => {
          delete attrs[k];
        },
        hasAttribute: (k) => k in attrs,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      };

      Object.defineProperty(elObj, 'textContent', {
        get: () => textVal,
        set: (val) => {
          textVal = String(val);
          htmlVal = textVal;
          textWrites[id].push(textVal);
        },
        configurable: true,
      });

      Object.defineProperty(elObj, 'innerHTML', {
        get: () => htmlVal,
        set: (val) => {
          htmlVal = String(val);
          textVal = htmlVal.replace(/<[^>]*>/g, '');
          textWrites[id].push(`html:${htmlVal}`);
        },
        configurable: true,
      });

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

  const windowListeners = {};
  globalThis.document = {
    activeElement: getEl('body'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag) => getEl(tag),
  };

  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener(type, fn) {
      windowListeners[type] ||= [];
      windowListeners[type].push(fn);
    },
    dispatchEvent(evt) {
      const list = windowListeners[evt.type] || [];
      for (const cb of list) cb(evt);
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    localStorage: { getItem: () => null, setItem: () => {} },
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: globalThis.window.navigator,
    configurable: true,
    writable: true,
  });

  return { elements, getEl, textWrites };
}

test('debounced zoom status announcements via #plan-fallback-summary live region', async (t) => {
  const { getEl, textWrites } = setupMockDOM();
  const app = await import(`../js/app.js?t=${Date.now()}`);
  const { announceZoom, ZOOM_ANNOUNCE_DEBOUNCE_MS } = app;
  const homegen = globalThis.window.__homegen;

  assert.equal(ZOOM_ANNOUNCE_DEBOUNCE_MS, 300);

  // Wait for any initial startup timers to settle
  await new Promise((r) => setTimeout(r, 350));

  const liveRegion = getEl('plan-fallback-summary');
  const zoomLabel = getEl('zoom-label');

  await t.test(
    'announceZoom formats scale percentage and updates live region after debounce',
    async () => {
      textWrites['plan-fallback-summary'].length = 0;

      announceZoom(1.92); // (1.92 / 1.6) * 100 = 120%
      // Should not write immediately before debounce window elapses
      assert.equal(textWrites['plan-fallback-summary'].length, 0);

      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 40));

      assert.equal(liveRegion.textContent, 'Zoom level: 120%');
      assert.equal(liveRegion.getAttribute('role'), 'status');
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 120%']);
    }
  );

  await t.test(
    'rapid successive announceZoom calls debounce to a single status message',
    async () => {
      textWrites['plan-fallback-summary'].length = 0;

      announceZoom(1.792); // 112%
      await new Promise((r) => setTimeout(r, 50));
      announceZoom(2.007); // 125%
      await new Promise((r) => setTimeout(r, 50));
      announceZoom(2.248); // 141%
      await new Promise((r) => setTimeout(r, 50));
      announceZoom(2.4); // 150%

      // Still inside the 300ms window from the final call
      assert.equal(textWrites['plan-fallback-summary'].length, 0);

      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));

      assert.equal(
        textWrites['plan-fallback-summary'].length,
        1,
        'expected rapid calls to coalesce into a single live region update'
      );
      assert.equal(liveRegion.textContent, 'Zoom level: 150%');
    }
  );

  await t.test(
    'toolbar #zoom-in, #zoom-out, and #fit buttons emit zoom announcements',
    async () => {
      // Reset baseline via fit() on empty plan -> scale 1.6 (100%)
      getEl('fit').click();
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.equal(zoomLabel.textContent, '100%');
      assert.equal(liveRegion.textContent, 'Zoom level: 100%');

      textWrites['plan-fallback-summary'].length = 0;
      getEl('zoom-in').click(); // 1.6 * 1.2 = 1.92 -> 120%
      assert.equal(zoomLabel.textContent, '120%');
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 120%']);

      textWrites['plan-fallback-summary'].length = 0;
      getEl('zoom-out').click(); // 1.92 / 1.2 = 1.6 -> 100%
      assert.equal(zoomLabel.textContent, '100%');
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 100%']);
    }
  );

  await t.test(
    'keyboard shortcuts (+, =, -) and rapid wheel scrolling debounce announcements',
    async () => {
      textWrites['plan-fallback-summary'].length = 0;

      // Press '+' then '=' rapidly -> 1.6 * 1.2 * 1.2 = 2.304 -> 144%
      globalThis.window.dispatchEvent({ type: 'keydown', key: '+', preventDefault() {} });
      globalThis.window.dispatchEvent({ type: 'keydown', key: '=', preventDefault() {} });
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 144%']);

      // Press '-' -> 2.304 / 1.2 = 1.92 -> 120%
      textWrites['plan-fallback-summary'].length = 0;
      globalThis.window.dispatchEvent({ type: 'keydown', key: '-', preventDefault() {} });
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 120%']);

      // Simulate burst of wheel events on #plan canvas
      textWrites['plan-fallback-summary'].length = 0;
      const canvas = getEl('plan');
      for (let i = 0; i < 5; i++) {
        canvas.dispatchEvent({
          type: 'wheel',
          clientX: 400,
          clientY: 300,
          deltaY: -100,
          preventDefault() {},
        });
      }
      const expectedPct = Math.round((homegen.view.scale / 1.6) * 100);
      assert.equal(textWrites['plan-fallback-summary'].length, 0);
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], [`Zoom level: ${expectedPct}%`]);
    }
  );

  await t.test(
    'boundary scale clamping announces min (25%) and max (500%) limits, and fit() with rooms announces fitted scale',
    async () => {
      // Clamp to maximum scale (8 -> (8 / 1.6) * 100 = 500%)
      textWrites['plan-fallback-summary'].length = 0;
      homegen.zoomAt(400, 300, 100);
      assert.equal(homegen.view.scale, 8);
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 500%']);

      // Clamp to minimum scale (0.4 -> (0.4 / 1.6) * 100 = 25%)
      textWrites['plan-fallback-summary'].length = 0;
      homegen.zoomAt(400, 300, 0.001);
      assert.equal(homegen.view.scale, 0.4);
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], ['Zoom level: 25%']);

      // Populate sample home and verify fit() announces fitted scale
      textWrites['plan-fallback-summary'].length = 0;
      homegen.sampleHome();
      const fittedPct = Math.round((homegen.view.scale / 1.6) * 100);
      await new Promise((r) => setTimeout(r, ZOOM_ANNOUNCE_DEBOUNCE_MS + 50));
      assert.deepEqual(textWrites['plan-fallback-summary'], [`Zoom level: ${fittedPct}%`]);
    }
  );
});
