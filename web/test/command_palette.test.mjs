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

function createMockElement(id = '', tagName = 'DIV') {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  const element = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    open: false,
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attributes[name] = val;
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
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj = typeof evt === 'string' ? { type, preventDefault: () => {} } : evt;
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
        },
        {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
        }
      ),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelector: (selector) => {
      if (selector === 'li.selected') {
        return element.selectedLi || null;
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (element.items) return element.items;
      return [];
    },
    closest: () => null,
  };
  return element;
}

test('index.html contains required markup for command palette and shortcut overlay dialogs', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="command-palette"'), 'index.html must contain dialog id="command-palette"');
  assert.ok(html.includes('id="cmd-search"'), 'index.html must contain input id="cmd-search"');
  assert.ok(html.includes('id="cmd-list"'), 'index.html must contain list id="cmd-list"');
  assert.ok(html.includes('id="shortcut-overlay"'), 'index.html must contain dialog id="shortcut-overlay"');
  assert.ok(html.includes('<kbd>'), 'index.html must contain shortcut kbd badges');
});

test('style.css defines rules for command palette, kbd badges, and shortcut overlay', () => {
  const cssPath = path.join(__dirname, '../css/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#command-palette'), 'style.css must style #command-palette');
  assert.ok(css.includes('#cmd-search'), 'style.css must style #cmd-search');
  assert.ok(css.includes('#cmd-list'), 'style.css must style #cmd-list');
  assert.ok(css.includes('kbd'), 'style.css must style kbd tags');
  assert.ok(css.includes('#shortcut-overlay'), 'style.css must style #shortcut-overlay');
});

test('command palette query filtering and execution unit test', async () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const cmdPalette = getEl('command-palette');
  const cmdSearch = getEl('cmd-search');
  const cmdList = getEl('cmd-list');
  const shortcutOverlay = getEl('shortcut-overlay');

  // Load app.js module (simulating browser execution)
  // We mock document.querySelector / addEventListener
  const documentListeners = {};
  global.document = {
    activeElement: createMockElement('body', 'BODY'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => {
      const id = s.replace(/^#/, '');
      return getEl(id);
    },
    querySelectorAll: (s) => [],
    addEventListener: (evt, fn) => {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(fn);
    },
  };
  const windowListeners = {};
  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };

  // Import app module to initialize command registry and listeners
  await import(`../js/app.js?t=${Date.now()}`);

  assert.ok(global.window.__homegen, '__homegen test hook must be initialized');
  const homegen = global.window.__homegen;

  assert.ok(Array.isArray(homegen.COMMAND_REGISTRY), 'COMMAND_REGISTRY should be an array');
  assert.ok(homegen.COMMAND_REGISTRY.length >= 10, 'COMMAND_REGISTRY should contain core commands');

  // Check covered categories
  const categories = new Set(homegen.COMMAND_REGISTRY.map((c) => c.category));
  assert.ok(categories.has('Tools'), 'Registry must cover Tools');
  assert.ok(categories.has('Views'), 'Registry must cover Views');
  assert.ok(categories.has('Sidebar Tabs'), 'Registry must cover Sidebar Tabs');
  assert.ok(categories.has('File Operations'), 'Registry must cover File Operations');
  assert.ok(categories.has('Export'), 'Registry must cover Export');

  // Open command palette
  homegen.openCommandPalette();
  assert.equal(cmdPalette.open, true, 'Command palette dialog should be open');

  // Filter commands with query "pdf"
  cmdSearch.value = 'pdf';
  cmdSearch.dispatchEvent({ type: 'input', target: cmdSearch });

  assert.ok(cmdList.innerHTML.includes('Export Scaled Vector PDF'), 'Command list should contain PDF export command when searching "pdf"');

  // Test ArrowDown and Enter key navigation
  let executed = false;
  const originalPdfAction = homegen.COMMAND_REGISTRY.find((c) => c.id === 'export-pdf');
  const origAction = originalPdfAction.action;
  originalPdfAction.action = () => {
    executed = true;
  };

  // Trigger Enter on search input
  cmdSearch.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });

  assert.equal(executed, true, 'Enter key should execute filtered command');
  assert.equal(cmdPalette.open, false, 'Command palette dialog should close after execution');

  // Restore action
  originalPdfAction.action = origAction;
});

test('shortcut overlay opens on ? key when not in text input and ignores ? when in text input', async () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const cmdPalette = getEl('command-palette');
  const shortcutOverlay = getEl('shortcut-overlay');
  const inputEl = createMockElement('plan-name', 'INPUT');

  const windowListeners = {};
  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  global.document = {
    activeElement: createMockElement('body', 'BODY'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await import(`../js/app.js?t=${Date.now() + 1}`);

  const homegen = global.window.__homegen;

  // Press '?' when activeElement is BODY
  const keydownFn = windowListeners['keydown']?.[0];
  assert.ok(keydownFn, 'keydown listener should be attached to window');

  keydownFn({ key: '?', preventDefault: () => {} });
  assert.equal(shortcutOverlay.open, true, '? key should open shortcut overlay modal when outside inputs');

  // Close shortcut overlay
  homegen.closeShortcutOverlay();
  assert.equal(shortcutOverlay.open, false, 'shortcut overlay should close');

  // Focus inside INPUT element
  global.document.activeElement = inputEl;
  keydownFn({ key: '?', preventDefault: () => {} });
  assert.equal(shortcutOverlay.open, false, '? key should be ignored when active element is INPUT');

  // Press Cmd+K when activeElement is INPUT
  keydownFn({ key: 'k', metaKey: true, preventDefault: () => {} });
  assert.equal(cmdPalette.open, true, 'Cmd+K should open command palette even when focus is in INPUT');
});
