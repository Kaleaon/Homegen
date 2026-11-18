import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../js/model.js';
import { wallLength, getRoomPoints } from '../js/geometry.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class {};
}
if (typeof DOMMatrix === 'undefined') {
  global.DOMMatrix = class {
    scale() {
      return this;
    }
  };
}

function createMockElement(id = '', tagName = 'DIV', registry = null) {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  const dataset = {};
  let childInputs = [];

  const element = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    checked: false,
    textContent: '',
    _innerHTML: '',
    hidden: false,
    disabled: false,
    open: false,
    style: {},
    dataset,
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, v) => {
        const next = v !== undefined ? Boolean(v) : !classes.has(c);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'open') element.open = true;
    },
    getAttribute: (name) => attributes[name] ?? null,
    removeAttribute: (name) => {
      delete attributes[name];
      if (name === 'open') element.open = false;
    },
    hasAttribute: (name) => name in attributes,
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!listeners[evt]) return;
      listeners[evt] = listeners[evt].filter((f) => f !== fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj =
        typeof evt === 'string'
          ? {
              type,
              target: element,
              currentTarget: element,
              preventDefault: () => {},
              stopPropagation: () => {},
            }
          : {
              target: element,
              currentTarget: element,
              preventDefault: () => {},
              stopPropagation: () => {},
              ...evt,
            };
      if (listeners[type]) {
        listeners[type].forEach((fn) => fn(eventObj));
      }
    },
    click: () => element.dispatchEvent('click'),
    focus: () => {
      if (global.document) global.document.activeElement = element;
      element.dispatchEvent('focus');
    },
    select: () => {},
    setPointerCapture: () => {},
    scrollIntoView: () => {},
    showModal: () => {
      element.open = true;
      element.setAttribute('open', '');
    },
    close: () => {
      element.open = false;
      element.removeAttribute('open');
      element.dispatchEvent('close');
    },
    getContext: () =>
      new Proxy(
        {
          canvas: element,
          measureText: (t) => ({ width: String(t || '').length * 6 }),
          createPattern: () => ({ setTransform: () => {} }),
        },
        {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
        }
      ),
    getBoundingClientRect: () => ({ left: 0, top: 40, width: 800, height: 600 }),
    closest: () => null,
    querySelector: (sel) => {
      if (registry && sel.startsWith('#')) {
        return registry.get(sel.slice(1));
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.i-wall-len-input') {
        return childInputs;
      }
      return [];
    },
  };

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return element._innerHTML;
    },
    set(html) {
      element._innerHTML = String(html || '');
      if (id === 'inspector' && registry) {
        childInputs = [];
        const inputRegex = /<input\s+([^>]*class="i-wall-len-input"[^>]*)>/g;
        for (const match of element._innerHTML.matchAll(inputRegex)) {
          const attrs = match[1];
          const idMatch = attrs.match(/id="([^"]+)"/);
          const keyMatch = attrs.match(/data-wall-key="([^"]+)"/);
          const idxMatch = attrs.match(/data-wall-index="([^"]+)"/);
          const valMatch = attrs.match(/value="([^"]+)"/);
          const inpId = idMatch ? idMatch[1] : `wall-inp-${childInputs.length}`;
          const inp = createMockElement(inpId, 'INPUT', registry);
          inp.value = valMatch ? valMatch[1] : '';
          inp.dataset.wallKey = keyMatch ? keyMatch[1] : '';
          inp.dataset.wallIndex = idxMatch ? idxMatch[1] : '0';
          registry.set(inpId, inp);
          childInputs.push(inp);
        }
        if (element._innerHTML.includes('id="i-wall-len-error"')) {
          const errEl = registry.get('i-wall-len-error');
          errEl.hidden = true;
          errEl.textContent = '';
        }
      }
    },
  });

  return element;
}

test('M.adjustRoomWallLength updates individual walls on 4-gon and L-shaped rooms without breaking closure', () => {
  const state = M.newState();
  const rectRoom = M.addRoom(state, 0, 0, 144, 120, 'living');

  // Extend North wall from 144" (12') to 174" (14'6") along its +X vector
  const northRes = M.adjustRoomWallLength(rectRoom, 'N', 174, state);
  assert.equal(northRes.ok, true);
  assert.equal(Math.round(wallLength(rectRoom, 'N')), 174);
  assert.equal(Math.round(wallLength(rectRoom, 'S')), 144);
  assert.equal(Math.round(wallLength(rectRoom, 'W')), 120);
  assert.equal(getRoomPoints(rectRoom).length, 4);

  // L-shaped 6-vertex room
  const lPts = [
    { x: 0, y: 0 },
    { x: 180, y: 0 },
    { x: 180, y: 84 },
    { x: 96, y: 84 },
    { x: 96, y: 168 },
    { x: 0, y: 168 },
  ];
  const lRoom = M.createRoom(state, 'living', 0, 0, 180, 168, { points: lPts });
  const seg0Res = M.adjustRoomWallLength(lRoom, 0, 204, state);
  assert.equal(seg0Res.ok, true);
  assert.equal(Math.round(wallLength(lRoom, 0)), 204);
  assert.equal(getRoomPoints(lRoom).length, 6);

  // Reject clear span < 36"
  const shortRes = M.adjustRoomWallLength(rectRoom, 'N', 24, state);
  assert.equal(shortRes.ok, false);
  assert.match(shortRes.error, /36 in/);
  assert.equal(Math.round(wallLength(rectRoom, 'N')), 174);
});

test('ComplianceOverlayScene emits wallDimensionLabel nodes for selected rooms and supports hitTest', () => {
  const state = M.newState();
  const room = M.addRoom(state, 0, 0, 144, 120, 'bedroom');
  const scene = new ComplianceOverlayScene();
  scene.update(
    state,
    { violations: [] },
    { curLevel: 0, selection: room.id, view: { scale: 1.6, ox: 40, oy: 40 } }
  );

  const wallNodes = scene.getNodesByType('wallDimensionLabel');
  assert.equal(wallNodes.length, 4);
  const northNode = wallNodes.find((n) => n.data.wallKey === 'N');
  assert.ok(northNode);
  assert.equal(northNode.data.lengthInches, 144);

  const hit = scene.hitTest({ x: northNode.data.midX, y: northNode.data.midY }, { scale: 1.6 });
  assert.ok(hit);
  assert.equal(hit.type, 'wallDimensionLabel');
  assert.equal(hit.data.roomId, room.id);
});

test('index.html includes #wall-length-hud and app.js removes legacy dblclick prompt()', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

  assert.ok(html.includes('id="wall-length-hud"'));
  assert.ok(html.includes('id="wall-length-hud-input"'));
  assert.ok(html.includes('id="wall-length-hud-error"'));

  const dblClickBlock = appJs.split("canvas?.addEventListener('dblclick'")[1]?.slice(0, 1800) || '';
  assert.ok(!dblClickBlock.includes('prompt('), 'dblclick handler must not invoke legacy prompt()');
});

test('HUD keyboard shortcuts (Tab, Enter, Escape), zoom/pan re-projection, and Inspector per-wall editor update state and history', async () => {
  const elements = new Map();
  const registry = {
    get(id) {
      if (!elements.has(id)) {
        const tag =
          id === 'plan' || id === 'view3d'
            ? 'CANVAS'
            : id.includes('input') || id === 'auto'
              ? 'INPUT'
              : 'DIV';
        const el = createMockElement(id, tag, registry);
        if (id === 'stage') {
          el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 640 });
        }
        elements.set(id, el);
      }
      return elements.get(id);
    },
    set(id, el) {
      elements.set(id, el);
    },
  };

  const windowListeners = {};
  let promptCalled = false;
  global.prompt = () => {
    promptCalled = true;
    return null;
  };

  global.window = {
    devicePixelRatio: 1,
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    dispatchKeydown: (evt) => {
      (windowListeners.keydown || []).forEach((fn) =>
        fn({
          preventDefault: () => {},
          stopPropagation: () => {},
          ...evt,
        })
      );
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  Object.defineProperty(global, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });

  global.document = {
    activeElement: registry.get('plan'),
    createElement: (tag) => createMockElement('', tag, registry),
    getElementById: (id) => registry.get(id),
    querySelector: (s) => registry.get(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await import(`../js/app.js?t=${Date.now()}`);
  const homegen = global.window.__homegen;
  assert.ok(homegen, '__homegen must be initialized');

  const canvas = registry.get('plan');
  const hudEl = registry.get('wall-length-hud');
  const hudInput = registry.get('wall-length-hud-input');
  const hudError = registry.get('wall-length-hud-error');

  // 1. Add a room and select it
  let roomId = null;
  homegen.apply((n) => {
    const rm = M.addRoom(n, 24, 24, 144, 120, 'bedroom');
    roomId = rm.id;
  }, 'Create Bedroom');
  homegen.select(roomId);
  canvas.focus();

  const historyBefore = homegen.hist.getTimeline().length;

  // 2. Press Tab on focused canvas -> opens HUD on North wall (index 0) and focuses input
  global.window.dispatchKeydown({ key: 'Tab', shiftKey: false });
  assert.equal(hudEl.hidden, false, 'HUD must become visible on Tab');
  assert.equal(global.document.activeElement, hudInput, 'HUD input must receive focus on Tab');
  assert.equal(homegen.getWallHudState().wallKey, 'N');

  // 3. Re-project HUD position when zooming / panning while HUD is active
  const initialLeft = hudEl.style.left;
  const initialTop = hudEl.style.top;
  homegen.setView({ scale: 2.5, ox: 120, oy: 90 });
  assert.notEqual(hudEl.style.left, initialLeft, 'HUD left must re-project on zoom/pan');
  assert.notEqual(hudEl.style.top, initialTop, 'HUD top must re-project on zoom/pan');

  // 4. Reject < 36" clear span with inline error state
  hudInput.value = '24';
  hudInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(hudEl.hidden, false, 'HUD must remain open when clear span < 36"');
  assert.equal(hudEl.classList.contains('is-invalid'), true);
  assert.equal(hudError.hidden, false);
  assert.match(hudError.textContent, /36 in/);

  // 5. Escape cancels without modifying room or history
  hudInput.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(hudEl.hidden, true, 'Escape must close HUD');
  assert.equal(global.document.activeElement, canvas, 'Escape must restore focus to canvas');
  assert.equal(homegen.hist.getTimeline().length, historyBefore);
  assert.equal(Math.round(wallLength(homegen.doc.rooms[0], 'N')), 144);

  // 6. Double-click on North wall opens inline HUD without calling prompt(), Enter commits 14'6" (174")
  const view = homegen.getView();
  const northWorldX = 24 + 72;
  const northWorldY = 24;
  canvas.dispatchEvent({
    type: 'dblclick',
    clientX: northWorldX * view.scale + view.ox,
    clientY: 40 + northWorldY * view.scale + view.oy,
  });
  assert.equal(promptCalled, false, 'dblclick must never invoke legacy prompt()');
  assert.equal(hudEl.hidden, false, 'dblclick on wall must open inline HUD');

  hudInput.value = '14\'6"';
  hudInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(hudEl.hidden, true, 'Enter must commit and close HUD');
  assert.equal(Math.round(wallLength(homegen.doc.rooms[0], 'N')), 174);
  const timelineAfterHud = homegen.hist.getTimeline();
  assert.equal(timelineAfterHud.length, historyBefore + 1);
  assert.equal(timelineAfterHud[timelineAfterHud.length - 1].label, 'Edit Wall Length');

  // 7. Inspector per-wall segment length editor updates East wall to 13' (156") and records history
  homegen.renderInspector();
  const westInput = registry.get('i-wall-len-W');
  const eastInput = registry.get('i-wall-len-E');
  assert.ok(eastInput, 'Inspector must render per-wall input for East wall');
  assert.equal(westInput.value, '120');
  assert.equal(eastInput.value, '123.69');

  // Invalid < 36" in Inspector shows inline error and rejects
  eastInput.value = '18';
  eastInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
  const inspError = registry.get('i-wall-len-error');
  assert.equal(inspError.hidden, false);
  assert.match(inspError.textContent, /36 in/);
  assert.equal(Number(wallLength(homegen.doc.rooms[0], 'E').toFixed(2)), 123.69);

  // Valid 13' (156") commits via M.updateRoomPoints and records history
  eastInput.value = "13'";
  eastInput.dispatchEvent({ type: 'change' });
  assert.equal(Math.round(wallLength(homegen.doc.rooms[0], 'E')), 156);
  assert.equal(homegen.hist.getTimeline().length, historyBefore + 2);

  // 8. Sequential room drawing via HUD commits exact length and falls back on invalid string
  homegen.setTool({ kind: 'room', type: 'office' });
  homegen.interaction.resetRoomDrawing();
  homegen.interaction.addRoomCorner({ x: 300, y: 24 });
  canvas.dispatchEvent({
    type: 'pointermove',
    clientX: 420 * view.scale + view.ox,
    clientY: 40 + 24 * view.scale + view.oy,
  });
  global.window.dispatchKeydown({ key: 'Tab', shiftKey: false });
  assert.equal(homegen.getWallHudState().mode, 'draw-corner');

  hudInput.value = '174';
  hudInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(homegen.interaction.getRoomPoints().length, 2);
  assert.deepEqual(homegen.interaction.getRoomPoints()[1], { x: 474, y: 24 });

  // Next segment with non-numeric input safely falls back to 6"-snapped pointer (474, 144)
  homegen.interaction.toggleSnapMode('angle', false);
  canvas.dispatchEvent({
    type: 'pointermove',
    clientX: 475 * view.scale + view.ox,
    clientY: 40 + 143 * view.scale + view.oy,
  });
  global.window.dispatchKeydown({ key: 'Tab', shiftKey: false });
  hudInput.value = 'not-a-number';
  hudInput.dispatchEvent({ type: 'keydown', key: 'Enter' });
  const drawnPts = homegen.interaction.getRoomPoints();
  assert.equal(drawnPts.length, 3);
  assert.deepEqual(drawnPts[2], { x: 474, y: 144 });
});
