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
    closest: () => null,
    querySelector: (selector) => {
      if (selector === 'li.selected') {
        if (element.selectedLi) return element.selectedLi;
        return { scrollIntoView: () => {} };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (element.items) return element.items;
      if (selector.includes('li[data-cmd-idx]')) {
        const matches = [...element.innerHTML.matchAll(/data-cmd-idx="(\d+)"/g)];
        return matches.map((m) => {
          const idx = m[1];
          const liListeners = {};
          return {
            dataset: { cmdIdx: idx },
            addEventListener: (evt, fn) => {
              if (!liListeners[evt]) liListeners[evt] = [];
              liListeners[evt].push(fn);
            },
            dispatchEvent: (evt) => {
              const type = typeof evt === 'string' ? evt : evt.type;
              if (liListeners[type]) liListeners[type].forEach((fn) => fn(evt));
            },
            click: function () {
              this.dispatchEvent('click');
            },
          };
        });
      }
      return [];
    },
  };
  return element;
}

test('index.html contains required markup for command palette and shortcut overlay dialogs', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(
    html.includes('id="command-palette"'),
    'index.html must contain dialog id="command-palette"'
  );
  assert.ok(html.includes('id="cmd-search"'), 'index.html must contain input id="cmd-search"');
  assert.ok(html.includes('role="combobox"'), 'index.html #cmd-search must have role="combobox"');
  assert.ok(
    html.includes('aria-autocomplete="list"'),
    'index.html #cmd-search must have aria-autocomplete="list"'
  );
  assert.ok(
    html.includes('aria-expanded="false"'),
    'index.html #cmd-search must have aria-expanded="false"'
  );
  assert.ok(
    html.includes('aria-controls="cmd-list"'),
    'index.html #cmd-search must have aria-controls="cmd-list"'
  );
  assert.ok(
    html.includes('aria-haspopup="listbox"'),
    'index.html #cmd-search must have aria-haspopup="listbox"'
  );
  assert.ok(html.includes('id="cmd-list"'), 'index.html must contain list id="cmd-list"');
  assert.ok(
    html.includes('id="shortcut-overlay"'),
    'index.html must contain dialog id="shortcut-overlay"'
  );
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
  const _shortcutOverlay = getEl('shortcut-overlay');

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
    querySelectorAll: (_s) => [],
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
  Object.defineProperty(global, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });

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

  assert.ok(
    cmdList.innerHTML.includes('Export Scaled Vector PDF'),
    'Command list should contain PDF export command when searching "pdf"'
  );

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
  Object.defineProperty(global, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });
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
  assert.equal(
    shortcutOverlay.open,
    true,
    '? key should open shortcut overlay modal when outside inputs'
  );

  // Close shortcut overlay
  homegen.closeShortcutOverlay();
  assert.equal(shortcutOverlay.open, false, 'shortcut overlay should close');

  // Focus inside INPUT element
  global.document.activeElement = inputEl;
  keydownFn({ key: '?', preventDefault: () => {} });
  assert.equal(shortcutOverlay.open, false, '? key should be ignored when active element is INPUT');

  // Press Cmd+K when activeElement is INPUT
  keydownFn({ key: 'k', metaKey: true, preventDefault: () => {} });
  assert.equal(
    cmdPalette.open,
    true,
    'Cmd+K should open command palette even when focus is in INPUT'
  );
});

test('command palette manages aria-expanded and aria-activedescendant dynamically', async () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const _cmdPalette = getEl('command-palette');
  const cmdSearch = getEl('cmd-search');
  const cmdList = getEl('cmd-list');

  global.window = {
    addEventListener: () => {},
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
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await import(`../js/app.js?t=${Date.now() + 2}`);

  const homegen = global.window.__homegen;

  // Initially aria-expanded shouldn't be 'true'
  assert.notEqual(cmdSearch.getAttribute('aria-expanded'), 'true');

  // Open command palette
  homegen.openCommandPalette();
  assert.equal(
    cmdSearch.getAttribute('aria-expanded'),
    'true',
    'openCommandPalette must set aria-expanded="true" on #cmd-search'
  );
  assert.equal(
    cmdSearch.getAttribute('aria-activedescendant'),
    'cmd-option-0',
    'openCommandPalette must set aria-activedescendant="cmd-option-0" when rendering default list'
  );
  assert.ok(
    cmdList.innerHTML.includes('id="cmd-option-0"'),
    'Rendered option <li> must have id="cmd-option-0"'
  );

  // Search for zero results
  cmdSearch.value = 'nonexistentcommand12345';
  homegen.renderCommandList(cmdSearch.value);
  assert.equal(
    cmdSearch.getAttribute('aria-activedescendant'),
    undefined,
    'Zero results must remove aria-activedescendant attribute'
  );

  // Search for matching result
  cmdSearch.value = 'save';
  homegen.renderCommandList(cmdSearch.value);
  assert.equal(
    cmdSearch.getAttribute('aria-activedescendant'),
    'cmd-option-0',
    'Matching search must set aria-activedescendant="cmd-option-0"'
  );
  assert.ok(
    cmdList.innerHTML.includes('id="cmd-option-0"'),
    'Option must have unique id attribute matching option index'
  );

  // Close command palette
  homegen.closeCommandPalette();
  assert.equal(
    cmdSearch.getAttribute('aria-expanded'),
    'false',
    'closeCommandPalette must set aria-expanded="false" on #cmd-search'
  );
  assert.equal(
    cmdSearch.getAttribute('aria-activedescendant'),
    undefined,
    'closeCommandPalette must remove aria-activedescendant'
  );
});

test('recent command execution persists in localStorage and prioritizes top ranking commands', async () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const storageMap = new Map();
  const mockLocalStorage = {
    getItem: (key) => storageMap.get(key) || null,
    setItem: (key, val) => storageMap.set(key, String(val)),
    removeItem: (key) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  const windowListeners = {};
  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    localStorage: mockLocalStorage,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  Object.defineProperty(global, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });
  global.localStorage = mockLocalStorage;
  global.document = {
    activeElement: createMockElement('body', 'BODY'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await import(`../js/app.js?t=${Date.now() + 10}`);

  const homegen = global.window.__homegen;
  assert.ok(homegen, '__homegen must be present');

  // Clear previous recent history
  homegen.clearRecentCommands();
  assert.deepEqual(homegen.getRecentCommands(), [], 'Recent commands should initially be empty');

  // Verify default list order before any command execution
  homegen.openCommandPalette();
  const cmdList = getEl('cmd-list');
  const defaultFirstCmdName = homegen.COMMAND_REGISTRY[0].name;
  assert.ok(
    cmdList.innerHTML.includes(defaultFirstCmdName),
    'Command list should display first command in registry by default'
  );

  // Execute a command (e.g. 'export-pdf') via recordCommandExecution or Enter key
  const targetCmd1 = homegen.COMMAND_REGISTRY.find((c) => c.id === 'export-pdf');
  homegen.recordCommandExecution(targetCmd1.id);

  // Check state persistence
  const recent1 = homegen.getRecentCommands();
  assert.equal(recent1[0], 'export-pdf', 'export-pdf should be at index 0 of recent commands');
  assert.equal(
    mockLocalStorage.getItem('homegen_recent_commands'),
    JSON.stringify(['export-pdf']),
    'localStorage must persist recent commands JSON array'
  );

  // Render command palette list and verify export-pdf is prioritized at top
  homegen.renderCommandList('');
  assert.ok(
    cmdList.innerHTML.indexOf('Export Scaled Vector PDF') <
      cmdList.innerHTML.indexOf(defaultFirstCmdName),
    'Recently executed command (Export Scaled Vector PDF) must be prioritized ahead of default first command'
  );

  // Execute second command (e.g. 'view-3d')
  const targetCmd2 = homegen.COMMAND_REGISTRY.find((c) => c.id === 'view-3d');
  homegen.recordCommandExecution(targetCmd2.id);

  const recent2 = homegen.getRecentCommands();
  assert.equal(recent2[0], 'view-3d', 'view-3d should now be most recent (index 0)');
  assert.equal(recent2[1], 'export-pdf', 'export-pdf should be second most recent (index 1)');

  homegen.renderCommandList('');
  assert.ok(
    cmdList.innerHTML.indexOf('3D View') < cmdList.innerHTML.indexOf('Export Scaled Vector PDF'),
    'Most recent command (3D View) must appear before second most recent (Export Scaled Vector PDF)'
  );

  // Re-execute export-pdf to test recency re-ordering
  homegen.recordCommandExecution('export-pdf');
  const recent3 = homegen.getRecentCommands();
  assert.equal(recent3[0], 'export-pdf', 'export-pdf should move back to index 0');
  assert.equal(recent3[1], 'view-3d', 'view-3d should move to index 1');

  // Test history size limit (maximum 5)
  const testCmdIds = [
    'tool-select',
    'tool-eyedropper',
    'tool-erase',
    'view-2d',
    'file-new',
    'file-save',
  ];
  for (const cmdId of testCmdIds) {
    homegen.recordCommandExecution(cmdId);
  }

  const recent4 = homegen.getRecentCommands();
  assert.equal(recent4.length, 5, 'Recent command history must cap size at 5');
  assert.equal(recent4[0], 'file-save', 'Most recently executed command must be first');
  assert.equal(
    recent4.includes('export-pdf'),
    false,
    'Oldest command beyond size 5 must be evicted'
  );

  // Test storage failure fallback to in-memory state
  const failingStorage = {
    getItem: () => {
      throw new Error('Storage access blocked');
    },
    setItem: () => {
      throw new Error('Storage write denied');
    },
  };
  global.localStorage = failingStorage;
  global.window.localStorage = failingStorage;

  // Execute command despite failing localStorage
  homegen.recordCommandExecution('view-photo');
  assert.equal(
    homegen.getRecentCommands()[0],
    'view-photo',
    'In-memory state fallback must handle storage failure gracefully'
  );
});
