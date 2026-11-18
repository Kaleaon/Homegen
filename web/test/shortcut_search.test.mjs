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

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ''));
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
    hidden: false,
    focused: false,
    children: [],
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'open') element.open = true;
      if (name === 'hidden') element.hidden = true;
    },
    getAttribute: (name) => attributes[name],
    removeAttribute: (name) => {
      delete attributes[name];
      if (name === 'open') element.open = false;
      if (name === 'hidden') element.hidden = false;
    },
    hasAttribute: (name) => name in attributes,
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj =
        typeof evt === 'string' ? { type, target: element, preventDefault: () => {} } : evt;
      if (listeners[type]) listeners[type].forEach((fn) => fn(eventObj));
    },
    click: () => element.dispatchEvent('click'),
    focus: () => {
      element.focused = true;
      if (global.document) {
        global.document.activeElement = element;
      }
    },
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
      const matches = element.querySelectorAll(selector);
      return matches[0] || null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      const matchesSelector = (node) => {
        if (selector.startsWith('#')) {
          return node.id === selector.slice(1);
        }
        if (selector.startsWith('.')) {
          return node.classList.contains(selector.slice(1));
        }
        return node.tagName === selector.toUpperCase();
      };
      const walk = (parent) => {
        for (const child of parent.children || []) {
          if (matchesSelector(child)) results.push(child);
          walk(child);
        }
      };
      walk(element);
      return results;
    },
  };
  return element;
}

function buildShortcutOverlayFixtureFromHtml() {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dlgMatch = html.match(/<dialog id="shortcut-overlay"[\s\S]*?<\/dialog>/);
  assert.ok(dlgMatch, '#shortcut-overlay dialog markup must exist in index.html');
  const dlgHtml = dlgMatch[0];

  const dlg = createMockElement('shortcut-overlay', 'DIALOG');
  const searchInput = createMockElement('shortcut-search', 'INPUT');
  const noResults = createMockElement('shortcut-no-results', 'DIV');
  noResults.classList.add('shortcut-no-results');
  noResults.setAttribute('hidden', '');
  noResults.textContent = 'No matching shortcuts found';

  const grid = createMockElement('', 'DIV');
  grid.classList.add('shortcut-grid');

  const groupRegex =
    /<div class="shortcut-group">\s*<h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/div>\s*(?=<div class="shortcut-group">|<\/div>\s*<\/div>\s*<\/dialog>)/g;
  let groupMatch;
  while ((groupMatch = groupRegex.exec(dlgHtml)) !== null) {
    const groupTitle = stripTags(groupMatch[1]).trim();
    const rowsBlock = groupMatch[2];
    const groupEl = createMockElement('', 'DIV');
    groupEl.classList.add('shortcut-group');
    const h3 = createMockElement('', 'H3');
    h3.textContent = groupTitle;
    groupEl.children.push(h3);

    const rowRegex =
      /<div class="shortcut-row"><span>([\s\S]*?)<\/span><span class="keys">([\s\S]*?)<\/span><\/div>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(rowsBlock)) !== null) {
      const descText = stripTags(rowMatch[1]).trim();
      const keysText = stripTags(rowMatch[2]).trim();
      const rowEl = createMockElement('', 'DIV');
      rowEl.classList.add('shortcut-row');

      const descSpan = createMockElement('', 'SPAN');
      descSpan.textContent = descText;
      const keysSpan = createMockElement('', 'SPAN');
      keysSpan.classList.add('keys');
      keysSpan.textContent = keysText;

      rowEl.children = [descSpan, keysSpan];
      rowEl.textContent = `${descText}${keysText}`;
      groupEl.children.push(rowEl);
    }

    grid.children.push(groupEl);
  }

  dlg.children = [searchInput, noResults, grid];
  return { dlg, searchInput, noResults, grid };
}

test('index.html defines #shortcut-search and #shortcut-no-results inside #shortcut-overlay', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dlgMatch = html.match(/<dialog id="shortcut-overlay"[\s\S]*?<\/dialog>/);
  assert.ok(dlgMatch, 'index.html must include #shortcut-overlay dialog');

  const dlgHtml = dlgMatch[0];
  assert.match(
    dlgHtml,
    /<input\s+[^>]*id="shortcut-search"[^>]*>/,
    '#shortcut-overlay must contain #shortcut-search input'
  );
  assert.match(
    dlgHtml,
    /id="shortcut-search"[\s\S]*?aria-label="Search keyboard shortcuts"/,
    '#shortcut-search must provide an accessible aria-label'
  );
  assert.match(
    dlgHtml,
    /<div\s+[^>]*id="shortcut-no-results"[^>]*hidden[^>]*>/,
    '#shortcut-overlay must contain initially hidden #shortcut-no-results element'
  );
});

test('style.css defines search input layout, focus-visible ring, and empty state styles', () => {
  const cssPath = path.join(__dirname, '../css/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#shortcut-search'), 'style.css must style #shortcut-search');
  assert.ok(
    css.includes('#shortcut-search:focus-visible'),
    'style.css must define :focus-visible ring for #shortcut-search'
  );
  const searchRule = css.match(/#shortcut-search\s*\{[^}]+\}/)?.[0] || '';
  assert.ok(
    !searchRule.includes('outline: none') && !searchRule.includes('outline:none'),
    '#shortcut-search base rule must not suppress outline'
  );
  assert.ok(
    css.includes('#shortcut-no-results') || css.includes('.shortcut-no-results'),
    'style.css must style #shortcut-no-results empty state'
  );
  assert.ok(
    css.includes('.shortcut-row[hidden]') && css.includes('.shortcut-group[hidden]'),
    'style.css must ensure [hidden] hides .shortcut-row and .shortcut-group'
  );
});

test('live search filters shortcut rows by description and key bindings, hides empty groups, and resets on reopen', async () => {
  const { dlg, searchInput, noResults, grid } = buildShortcutOverlayFixtureFromHtml();
  const elements = {
    'shortcut-overlay': dlg,
    'shortcut-search': searchInput,
    'shortcut-no-results': noResults,
  };
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
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
  global.document = {
    activeElement: createMockElement('body', 'BODY'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => getEl(s.replace(/^#/, '')),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  await import(`../js/app.js?t=${Date.now()}`);
  const homegen = global.window.__homegen;
  assert.ok(homegen, 'window.__homegen must be initialized');

  const allGroups = dlg.querySelectorAll('.shortcut-group');
  const allRows = dlg.querySelectorAll('.shortcut-row');
  assert.equal(allGroups.length, 4, 'Fixture should parse all 4 shortcut category groups');
  assert.ok(allRows.length >= 18, 'Fixture should parse all shortcut rows from index.html');

  // 1. Open shortcut overlay -> input cleared, all visible, focus moved to #shortcut-search
  searchInput.focused = false;
  homegen.openShortcutOverlay();
  assert.equal(dlg.open, true, 'openShortcutOverlay should open #shortcut-overlay');
  assert.equal(searchInput.value, '', 'openShortcutOverlay should clear #shortcut-search');
  assert.equal(searchInput.focused, true, 'openShortcutOverlay should focus #shortcut-search');
  assert.equal(noResults.hidden, true, '#shortcut-no-results should be hidden initially');
  assert.ok(
    allRows.every((r) => !r.hidden),
    'All shortcut rows should be visible initially'
  );
  assert.ok(
    allGroups.every((g) => !g.hidden),
    'All shortcut groups should be visible initially'
  );

  // 2. Filter by description ("eyedropper") -> only Eyedropper Tool in Tools group remains visible
  searchInput.value = 'Eyedropper';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  const visibleAfterDesc = allRows.filter((r) => !r.hidden);
  assert.equal(visibleAfterDesc.length, 1, 'Only 1 row should match "Eyedropper"');
  assert.equal(visibleAfterDesc[0].children[0].textContent, 'Eyedropper Tool');

  const visibleGroupsDesc = allGroups.filter((g) => !g.hidden);
  assert.equal(visibleGroupsDesc.length, 1, 'Only the Tools group should remain visible');
  assert.equal(visibleGroupsDesc[0].children[0].textContent, 'Tools');
  assert.equal(
    noResults.hidden,
    true,
    '#shortcut-no-results must remain hidden when matches exist'
  );

  // 3. Filter by key binding ("Ctrl+Z" and spaced "Ctrl + Shift + R")
  searchInput.value = 'ctrl+z';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  const visibleCtrlZ = allRows.filter((r) => !r.hidden);
  assert.equal(visibleCtrlZ.length, 1, 'Only Undo row should match "ctrl+z"');
  assert.equal(visibleCtrlZ[0].children[0].textContent, 'Undo');

  searchInput.value = 'ctrl + shift + r';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  const visibleRoomDims = allRows.filter((r) => !r.hidden);
  assert.equal(visibleRoomDims.length, 1, 'Spaced key query "ctrl + shift + r" should match');
  assert.equal(visibleRoomDims[0].children[0].textContent, 'Add Room by Dimensions');

  // 4. Whitespace-only query ("   ") trims cleanly and restores all rows and groups
  searchInput.value = '   ';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  assert.ok(
    allRows.every((r) => !r.hidden),
    'Whitespace-only query must show all shortcut rows'
  );
  assert.ok(
    allGroups.every((g) => !g.hidden),
    'Whitespace-only query must show all shortcut groups'
  );
  assert.equal(noResults.hidden, true, '#shortcut-no-results must be hidden for whitespace query');

  // 5. Zero matching results -> hides all groups and shows #shortcut-no-results
  searchInput.value = 'nonexistent-shortcut-xyz';
  searchInput.dispatchEvent({ type: 'input', target: searchInput });

  assert.equal(
    allRows.filter((r) => !r.hidden).length,
    0,
    'Zero rows should be visible for non-matching query'
  );
  assert.ok(
    allGroups.every((g) => g.hidden),
    'All .shortcut-group sections must be hidden when zero rows match'
  );
  assert.equal(grid.hidden, true, '.shortcut-grid should be hidden when zero rows match');
  assert.equal(
    noResults.hidden,
    false,
    '#shortcut-no-results must be visible when zero rows match'
  );

  // 6. Close and reopen overlay -> resets search field, hides empty state, restores all rows/groups, focuses search input
  homegen.closeShortcutOverlay();
  assert.equal(dlg.open, false, 'closeShortcutOverlay should close #shortcut-overlay');

  searchInput.focused = false;
  homegen.openShortcutOverlay();
  assert.equal(searchInput.value, '', 'Reopening overlay must clear #shortcut-search value');
  assert.equal(searchInput.focused, true, 'Reopening overlay must focus #shortcut-search');
  assert.equal(noResults.hidden, true, 'Reopening overlay must hide #shortcut-no-results');
  assert.equal(grid.hidden, false, 'Reopening overlay must unhide .shortcut-grid');
  assert.ok(
    allRows.every((r) => !r.hidden),
    'Reopening overlay must restore visibility for all shortcut rows'
  );
  assert.ok(
    allGroups.every((g) => !g.hidden),
    'Reopening overlay must restore visibility for all shortcut groups'
  );

  // 7. Typing '?' while #shortcut-search is focused does not close #shortcut-overlay
  const keydownFn = windowListeners.keydown?.[0];
  assert.ok(keydownFn, 'window keydown listener should be registered');
  assert.equal(global.document.activeElement, searchInput, '#shortcut-search is activeElement');
  keydownFn({ key: '?', preventDefault: () => {} });
  assert.equal(
    dlg.open,
    true,
    'Pressing ? inside #shortcut-search must not close #shortcut-overlay'
  );
});
