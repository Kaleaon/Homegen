import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    rotate() {
      return this;
    }
    translate() {
      return this;
    }
  };
}

function createMockElement(id = '', tagName = 'DIV') {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  const element = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    open: false,
    dataset: {},
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => {
        if (v === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (v) {
          classes.add(c);
        } else {
          classes.delete(c);
        }
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'open') element.open = true;
    },
    getAttribute: (name) => attributes[name],
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
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj =
        typeof evt === 'string' ? { type, target: element, preventDefault: () => {} } : evt;
      if (!eventObj.target) eventObj.target = element;
      if (!eventObj.preventDefault) eventObj.preventDefault = () => {};
      if (listeners[type]) listeners[type].forEach((fn) => fn(eventObj));
    },
    click: () => element.dispatchEvent('click'),
    focus: () => {},
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
          measureText: () => ({ width: 0 }),
          createPattern: () => ({ setTransform: () => {} }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
        },
        {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
        }
      ),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return element;
}

function createStorageMock() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, val) => map.set(key, String(val)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

test('index.html #shortcut-overlay contains checkbox switch labeled "Disable single-character shortcuts"', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const overlayMatch = html.match(/<dialog id="shortcut-overlay"[\s\S]*?<\/dialog>/);
  assert.ok(overlayMatch, '#shortcut-overlay dialog must exist in index.html');
  const overlayHtml = overlayMatch[0];

  assert.match(
    overlayHtml,
    /<label[^>]*for="disable-single-key-shortcuts"[^>]*>\s*<input[^>]*type="checkbox"[^>]*id="disable-single-key-shortcuts"[^>]*role="switch"[^>]*>\s*Disable single-character shortcuts\s*<\/label>/,
    '#shortcut-overlay must include accessible checkbox switch with label "Disable single-character shortcuts"'
  );
});

test('isSingleKeyShortcutDisabled persists to localStorage and falls back safely when localStorage throws', async () => {
  const storage = createStorageMock();
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };
  const toggleInput = getEl('disable-single-key-shortcuts');
  toggleInput.tagName = 'INPUT';

  global.localStorage = storage;
  global.window = {
    addEventListener: () => {},
    localStorage: storage,
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
    activeElement: createMockElement('body', 'BODY'),
    createElement: (tag) => createMockElement('', tag),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const appMod = await import(`../js/app.js?t=persist-${Date.now()}`);
  const { SINGLE_KEY_SHORTCUTS_KEY, isSingleKeyShortcutDisabled, setSingleKeyShortcutDisabled } =
    appMod;

  assert.equal(SINGLE_KEY_SHORTCUTS_KEY, 'homegen_disable_single_key_shortcuts');
  assert.equal(isSingleKeyShortcutDisabled(), false, 'Default preference should be active (false)');
  assert.equal(toggleInput.checked, false);

  // Persist via setter
  setSingleKeyShortcutDisabled(true);
  assert.equal(isSingleKeyShortcutDisabled(), true);
  assert.equal(storage.getItem('homegen_disable_single_key_shortcuts'), 'true');
  assert.equal(toggleInput.checked, true);
  assert.equal(toggleInput.getAttribute('aria-checked'), 'true');

  // Toggle via UI change event
  toggleInput.checked = false;
  toggleInput.dispatchEvent({ type: 'change', target: toggleInput });
  assert.equal(isSingleKeyShortcutDisabled(), false);
  assert.equal(storage.getItem('homegen_disable_single_key_shortcuts'), 'false');
  assert.equal(toggleInput.getAttribute('aria-checked'), 'false');

  // Direct localStorage update syncs on openShortcutOverlay
  storage.setItem('homegen_disable_single_key_shortcuts', 'true');
  assert.equal(isSingleKeyShortcutDisabled(), true);
  global.window.__homegen.openShortcutOverlay();
  assert.equal(toggleInput.checked, true);
  assert.equal(toggleInput.getAttribute('aria-checked'), 'true');

  // Storage read exception falls back to default active state (false)
  const throwingReadStorage = {
    getItem: () => {
      throw new Error('SecurityError: localStorage disabled');
    },
    setItem: () => {
      throw new Error('SecurityError: localStorage disabled');
    },
  };
  global.localStorage = throwingReadStorage;
  global.window.localStorage = throwingReadStorage;
  assert.equal(
    isSingleKeyShortcutDisabled(),
    false,
    'Must fall back to default active state (false) when localStorage read throws'
  );

  // Toggling UI while localStorage throws still works in-memory without throwing
  assert.doesNotThrow(() => setSingleKeyShortcutDisabled(true));
  assert.equal(isSingleKeyShortcutDisabled(), true);
  setSingleKeyShortcutDisabled(false);
  assert.equal(isSingleKeyShortcutDisabled(), false);
});

test('2D global keydown drops single-character shortcuts when disabled while keeping modifier and arrow keys active', async () => {
  const storage = createStorageMock();
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const shortcutOverlay = getEl('shortcut-overlay');
  const cmdPalette = getEl('command-palette');
  const addRoomDimsDlg = getEl('dlg-add-room-dims');
  const undoBtn = getEl('undo');
  const redoBtn = getEl('redo');
  const zoomInBtn = getEl('zoom-in');
  const zoomOutBtn = getEl('zoom-out');

  let undoClicks = 0;
  let redoClicks = 0;
  let zoomInClicks = 0;
  let zoomOutClicks = 0;
  undoBtn.addEventListener('click', () => {
    undoClicks++;
  });
  redoBtn.addEventListener('click', () => {
    redoClicks++;
  });
  zoomInBtn.addEventListener('click', () => {
    zoomInClicks++;
  });
  zoomOutBtn.addEventListener('click', () => {
    zoomOutClicks++;
  });

  const windowListeners = {};
  global.localStorage = storage;
  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    localStorage: storage,
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
    activeElement: createMockElement('body', 'BODY'),
    createElement: (tag) => createMockElement('', tag),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await import(`../js/app.js?t=2d-${Date.now()}`);
  const homegen = global.window.__homegen;
  const keydownFn = windowListeners.keydown?.[0];
  assert.ok(keydownFn, 'window keydown listener must be registered');

  // Seed a room with a rotatable sofa item
  homegen.sampleHome();
  const roomWithItem = homegen.doc.rooms.find((r) => r.items && r.items.length > 0);
  assert.ok(roomWithItem, 'Sample home should have a room with items');
  const targetItem = roomWithItem.items[0];
  const initialRot = targetItem.rot || 0;
  homegen.select(targetItem.id);

  // 1. Default state (enabled): single-key shortcuts work
  keydownFn({ key: 'x', preventDefault: () => {} });
  assert.equal(homegen.tool.kind, 'erase', '"x" should select erase tool when shortcuts enabled');

  keydownFn({ key: 'i', preventDefault: () => {} });
  assert.equal(
    homegen.tool.kind,
    'eyedropper',
    '"i" should select eyedropper tool when shortcuts enabled'
  );

  keydownFn({ key: 'v', preventDefault: () => {} });
  assert.equal(homegen.tool.kind, 'select', '"v" should select tool when shortcuts enabled');

  keydownFn({ key: '+', preventDefault: () => {} });
  assert.equal(zoomInClicks, 1, '"+" should trigger zoom-in when shortcuts enabled');

  keydownFn({ key: '-', preventDefault: () => {} });
  assert.equal(zoomOutClicks, 1, '"-" should trigger zoom-out when shortcuts enabled');

  // 2. Disable single-character shortcuts
  homegen.setSingleKeyShortcutDisabled(true);
  assert.equal(homegen.isSingleKeyShortcutDisabled(), true);

  // Re-select target item to verify 'r' does not rotate and Delete/Arrow keys still work
  homegen.select(targetItem.id);
  const rotBeforeDisabledR = homegen.doc.rooms
    .flatMap((r) => r.items)
    .find((it) => it.id === targetItem.id).rot;

  let prevented = false;
  for (const key of ['?', 'x', 'i', 'v', 'r', '+', '=', '-']) {
    keydownFn({
      key,
      preventDefault: () => {
        prevented = true;
      },
    });
  }

  assert.equal(prevented, false, 'Disabled single-character keys must not call preventDefault');
  assert.equal(shortcutOverlay.open, false, '"?" must not open shortcut overlay when disabled');
  assert.equal(homegen.tool.kind, 'select', 'Tool must remain unchanged when x/i pressed');
  assert.equal(zoomInClicks, 1, '"+" and "=" must not zoom in when disabled');
  assert.equal(zoomOutClicks, 1, '"-" must not zoom out when disabled');
  assert.equal(
    homegen.doc.rooms.flatMap((r) => r.items).find((it) => it.id === targetItem.id).rot,
    rotBeforeDisabledR ?? initialRot,
    '"r" must not rotate selected item when disabled'
  );

  // 3. Verify modifier shortcuts still work when single-character shortcuts are disabled
  keydownFn({ key: 'k', ctrlKey: true, preventDefault: () => {} });
  assert.equal(cmdPalette.open, true, 'Ctrl+K must still open Command Palette');
  homegen.closeCommandPalette();

  keydownFn({ key: 'z', ctrlKey: true, preventDefault: () => {} });
  assert.equal(undoClicks, 1, 'Ctrl+Z must still trigger Undo');

  keydownFn({ key: 'y', ctrlKey: true, preventDefault: () => {} });
  assert.equal(redoClicks, 1, 'Ctrl+Y must still trigger Redo');

  keydownFn({ key: 'r', ctrlKey: true, shiftKey: true, preventDefault: () => {} });
  assert.equal(addRoomDimsDlg.open, true, 'Ctrl+Shift+R must still open Add Room by Dimensions');
  addRoomDimsDlg.close();

  // 4. Verify Arrow keys and Escape still work when single-character shortcuts are disabled
  homegen.select(null);
  let arrowPrevented = false;
  keydownFn({
    key: 'ArrowRight',
    preventDefault: () => {
      arrowPrevented = true;
    },
  });
  assert.equal(arrowPrevented, true, 'ArrowRight spatial navigation must still run');

  homegen.setTool({ kind: 'erase' });
  keydownFn({ key: 'Escape', preventDefault: () => {} });
  assert.equal(homegen.tool.kind, 'select', 'Escape must still reset tool to select');

  // Delete key still removes selected item when single-character shortcuts are disabled
  homegen.select(targetItem.id);
  keydownFn({ key: 'Delete', preventDefault: () => {} });
  assert.equal(
    homegen.doc.rooms.flatMap((r) => r.items).some((it) => it.id === targetItem.id),
    false,
    'Delete must still remove selected element when single-character shortcuts are disabled'
  );
});

test('3D viewport keydown drops transform and walk character keys when disabled while keeping Tab, Escape, Arrow, Enter, and Home active', async () => {
  const storage = createStorageMock();
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const v3 = getEl('view3d');
  getEl('plan');
  getEl('bar3d');
  getEl('walkthrough-hud');

  global.localStorage = storage;
  global.window = {
    addEventListener: () => {},
    localStorage: storage,
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
    activeElement: v3,
    createElement: (tag) => createMockElement('', tag),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const { setSingleKeyShortcutDisabled } = await import(`../js/app.js?t=3d-app-${Date.now()}`);
  const { initView3D } = await import('../js/ui3d.js');

  let selectedEntity = { type: 'item', item: { id: 'sofa1' } };
  let camMode = 'orbit';
  const calls = {
    transformModes: [],
    steps: [],
    cycles: [],
    clears: 0,
    orbits: 0,
    zooms: 0,
    resets: 0,
    eyeLevels: 0,
  };

  const mockSceneApi = {
    walkKeys: { forward: false, backward: false, left: false, right: false, sprint: false },
    show: () => {},
    hide: () => {},
    getCameraMode: () => camMode,
    setCameraMode: (m) => {
      camMode = m;
    },
    toggleCameraMode: () => {
      camMode = camMode === 'walk' ? 'orbit' : 'walk';
    },
    getSelected3DEntity: () => selectedEntity,
    clear3DSelection: () => {
      selectedEntity = null;
      calls.clears++;
    },
    cycle3DSelection: (dir) => {
      calls.cycles.push(dir);
      return selectedEntity;
    },
    set3DTransformMode: (m) => {
      calls.transformModes.push(m);
    },
    stepTransformSelected: (dx, dy) => {
      calls.steps.push([dx, dy]);
    },
    orbitBy: () => {
      calls.orbits++;
    },
    panBy: () => {},
    zoomBy: () => {
      calls.zooms++;
    },
    eyeLevel: () => {
      calls.eyeLevels++;
      return true;
    },
    resetCamera: () => {
      calls.resets++;
    },
    clearSnapOverlay3D: () => {},
  };

  const view3d = initView3D({
    getDoc: () => ({ rooms: [{ id: 'r1', items: [] }] }),
    getLevel: () => 0,
    getSelectedRoomId: () => 'r1',
    toast: () => {},
    setLevel: () => {},
    interaction: null,
    createScene: () => mockSceneApi,
  });

  await view3d.setView('3d');

  // 1. Enabled: g/r/s transform modes work
  setSingleKeyShortcutDisabled(false);
  v3.dispatchEvent({ type: 'keydown', key: 'g' });
  v3.dispatchEvent({ type: 'keydown', key: 'r' });
  v3.dispatchEvent({ type: 'keydown', key: 's' });
  assert.deepEqual(calls.transformModes, ['move', 'rotate', 'scale']);

  // 2. Disabled with selected entity: g/r/s are dropped, Tab / Arrow / Escape still work
  calls.transformModes.length = 0;
  setSingleKeyShortcutDisabled(true);

  v3.dispatchEvent({ type: 'keydown', key: 'g' });
  v3.dispatchEvent({ type: 'keydown', key: 'r' });
  v3.dispatchEvent({ type: 'keydown', key: 's' });
  assert.deepEqual(
    calls.transformModes,
    [],
    'Transform modes g/r/s must be ignored when single-character shortcuts are disabled'
  );

  v3.dispatchEvent({ type: 'keydown', key: 'Tab', shiftKey: false });
  assert.deepEqual(calls.cycles, [1], 'Tab selection cycling must remain active');

  v3.dispatchEvent({ type: 'keydown', key: 'ArrowRight', shiftKey: false });
  assert.deepEqual(calls.steps, [[6, 0]], 'Arrow key transform stepping must remain active');

  v3.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(calls.clears, 1, 'Escape deselection must remain active');
  assert.equal(selectedEntity, null);

  // 3. Disabled in walk mode: WASD, r, e are dropped; Arrow keys and Escape remain active
  camMode = 'walk';
  for (const key of ['w', 'a', 's', 'd', 'r', 'e']) {
    v3.dispatchEvent({ type: 'keydown', key });
  }
  assert.deepEqual(
    mockSceneApi.walkKeys,
    { forward: false, backward: false, left: false, right: false, sprint: false },
    'WASD keys must not trigger walk movement when disabled'
  );
  assert.equal(camMode, 'walk', '"r" must not exit walk mode when disabled');
  assert.equal(calls.eyeLevels, 0, '"e" must not trigger eye-level when disabled');

  // ArrowUp starts walking forward, and releasing 'w' does not cancel ArrowUp
  v3.dispatchEvent({ type: 'keydown', key: 'ArrowUp' });
  assert.equal(mockSceneApi.walkKeys.forward, true, 'ArrowUp must still walk forward');
  v3.dispatchEvent({ type: 'keyup', key: 'w' });
  assert.equal(
    mockSceneApi.walkKeys.forward,
    true,
    'Disabled "w" keyup must not interrupt active ArrowUp walk movement'
  );
  v3.dispatchEvent({ type: 'keyup', key: 'ArrowUp' });
  assert.equal(mockSceneApi.walkKeys.forward, false);

  v3.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(camMode, 'orbit', 'Escape must still exit walk mode');

  // 4. Disabled in orbit mode: +, -, e, r are dropped; Arrow, Enter, Home remain active
  for (const key of ['+', '=', '-', '_', 'e', 'r']) {
    v3.dispatchEvent({ type: 'keydown', key });
  }
  assert.equal(calls.zooms, 0, '+/- zoom shortcuts must be ignored in 3D orbit mode when disabled');
  assert.equal(calls.eyeLevels, 0, '"e" must be ignored in 3D orbit mode when disabled');
  assert.equal(calls.resets, 0, '"r" must be ignored in 3D orbit mode when disabled');

  v3.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
  assert.equal(calls.orbits, 1, 'ArrowLeft orbit must remain active');

  v3.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(calls.eyeLevels, 1, 'Enter eye-level must remain active');

  v3.dispatchEvent({ type: 'keydown', key: 'Home' });
  assert.equal(calls.resets, 1, 'Home camera reset must remain active');

  setSingleKeyShortcutDisabled(false);
});
