import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderBgToolbar } from '../js/app.js';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('index.html buttons have accessible names and aria-label / aria-hidden where appropriate', () => {
  assert.match(
    htmlContent,
    /<(button|k-button) id="undo" [^>]*aria-label="Undo"[^>]*><span aria-hidden="true">↶<\/span><\/(button|k-button)>/
  );
  assert.match(
    htmlContent,
    /<(button|k-button) id="redo" [^>]*aria-label="Redo"[^>]*><span aria-hidden="true">↷<\/span><\/(button|k-button)>/
  );
  assert.match(
    htmlContent,
    /<button id="zoom-out" [^>]*aria-label="Zoom out"[^>]*><span aria-hidden="true">−<\/span><\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="zoom-in" [^>]*aria-label="Zoom in"[^>]*><span aria-hidden="true">\+<\/span><\/button>/
  );
  assert.match(
    htmlContent,
    /<button value="close" [^>]*aria-label="Close photoreal render"[^>]*><span aria-hidden="true">✕<\/span><\/button>/
  );

  assert.match(
    htmlContent,
    /<button data-tool="select" [^>]*><span aria-hidden="true">⬚<\/span> Select<\/button>/
  );
  assert.match(
    htmlContent,
    /<button data-tool="erase" [^>]*><span aria-hidden="true">⌫<\/span> Erase<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="o-eye" [^>]*><span aria-hidden="true">👁<\/span> Eye level<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="o-photo" [^>]*><span aria-hidden="true">📷<\/span> Photoreal…<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="bg-lock-btn" [^>]*aria-pressed="false"[^>]*><span aria-hidden="true">🔓<\/span> Unlocked<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="bg-calibrate-btn" [^>]*><span aria-hidden="true">📏<\/span> Calibrate<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="bg-remove-btn" [^>]*aria-label="Remove blueprint image"[^>]*><span aria-hidden="true">✕<\/span><\/button>/
  );
});

test('renderBgToolbar updates #bg-lock-btn aria-pressed and decorative glyph wrapper dynamically', () => {
  const prevDocument = globalThis.document;
  const attrs = new Map();
  const bgBar = { hidden: true };
  const lockBtn = {
    innerHTML: '',
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    getAttribute(name) {
      return attrs.get(name);
    },
  };
  const elements = {
    '#bg-toolbar': bgBar,
    '#bg-lock-btn': lockBtn,
  };

  globalThis.document = {
    querySelector(sel) {
      return elements[sel] || null;
    },
  };

  try {
    renderBgToolbar({ dataUrl: 'data:image/png;base64,abc', locked: false });
    assert.equal(bgBar.hidden, false);
    assert.equal(lockBtn.innerHTML, '<span aria-hidden="true">🔓</span> Unlocked');
    assert.equal(lockBtn.getAttribute('aria-pressed'), 'false');

    renderBgToolbar({ dataUrl: 'data:image/png;base64,abc', locked: true });
    assert.equal(bgBar.hidden, false);
    assert.equal(lockBtn.innerHTML, '<span aria-hidden="true">🔒</span> Locked');
    assert.equal(lockBtn.getAttribute('aria-pressed'), 'true');

    renderBgToolbar(null);
    assert.equal(bgBar.hidden, true);
    assert.equal(lockBtn.innerHTML, '<span aria-hidden="true">🔓</span> Unlocked');
    assert.equal(lockBtn.getAttribute('aria-pressed'), 'false');
  } finally {
    if (prevDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = prevDocument;
    }
  }
});

test('renderLevels in app.js includes aria-label and aria-hidden for add-floor and del-floor', () => {
  assert.match(
    appJsContent,
    /id="add-floor" [^>]*aria-label="Add floor above"[^>]*><span aria-hidden="true">\+<\/span> Floor<\/button>/
  );
  assert.match(
    appJsContent,
    /id="del-floor" [^>]*aria-label="Remove top floor"[^>]*><span aria-hidden="true">−<\/span> Floor<\/button>/
  );
});

test('index.html dynamic status updates and error containers declare ARIA live region and alert attributes', () => {
  assert.match(htmlContent, /id="diff-drawer" [^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(htmlContent, /id="p-status" [^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(htmlContent, /id="p-error" [^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(htmlContent, /id="toast" [^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(
    htmlContent,
    /<button type="button" class="toast-dismiss" aria-label="Dismiss notification"><span aria-hidden="true">✕<\/span><\/button>/
  );
});

test('index.html contains skip-to-content link before header and tabindex="-1" on stage section', () => {
  assert.match(
    htmlContent,
    /<body[^>]*>\s*<a href="#stage" class="skip-link">Skip to main content<\/a>\s*<header id="top">/
  );
  assert.match(htmlContent, /<section id="stage" tabindex="-1">/);

  const cssPath = resolve('css/style.css');
  const cssContent = readFileSync(cssPath, 'utf8');
  assert.match(cssContent, /\.skip-link\s*\{/);
  assert.match(cssContent, /\.skip-link:(focus|focus-visible)/);
});

test('index.html includes persistent #catalog-status-announcer live region inside sidebar', () => {
  assert.match(
    htmlContent,
    /<aside id="left">[\s\S]*?<div id="catalog-status-announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"><\/div>[\s\S]*?<div id="palette"[^>]*><\/div>[\s\S]*?<\/aside>/
  );
});

test('announceCatalogResults debounces rapid updates over 300ms and announces final count', async () => {
  const { announceCatalogResults, clearCatalogAnnouncement } = await import('../js/app.js');
  const announcer = { textContent: '' };
  const prevDoc = globalThis.document;

  globalThis.document = {
    getElementById(id) {
      return id === 'catalog-status-announcer' ? announcer : null;
    },
    querySelector(sel) {
      return sel === '#catalog-status-announcer' ? announcer : null;
    },
  };

  try {
    clearCatalogAnnouncement();
    announceCatalogResults(40);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(announcer.textContent, '', 'should not announce before 300ms');

    announceCatalogResults(18);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(announcer.textContent, '', 'rapid typing resets 300ms debounce timer');

    announceCatalogResults(12);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(announcer.textContent, '', 'still debouncing before 300ms after last call');

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(announcer.textContent, '12 furniture items found');

    // Singular item grammar check
    announceCatalogResults(1);
    await new Promise((r) => setTimeout(r, 340));
    assert.equal(announcer.textContent, '1 furniture item found');

    // Zero items check
    announceCatalogResults(0);
    await new Promise((r) => setTimeout(r, 340));
    assert.equal(announcer.textContent, '0 furniture items found');
  } finally {
    clearCatalogAnnouncement();
    globalThis.document = prevDoc;
  }
});

test('Buy tab search and dimension filters update #catalog-status-announcer and switching tabs clears it', async () => {
  const { renderPalette, switchTab, clearCatalogAnnouncement } = await import('../js/app.js');
  const { ITEMS, filterItems } = await import('../js/catalog.js');

  const createMockInput = (id) => {
    const listeners = {};
    return {
      id,
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      setSelectionRange(s, e) {
        this.selectionStart = s;
        this.selectionEnd = e;
      },
      focus() {
        mockDoc.activeElement = this;
      },
      addEventListener(type, fn) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      triggerInput(val) {
        this.value = val;
        this.selectionStart = String(val).length;
        this.selectionEnd = String(val).length;
        (listeners.input || []).forEach((fn) => fn({ target: this }));
      },
    };
  };

  const createMockTab = (id, tabName, isOn = false) => {
    const attrs = {
      id,
      'data-tab': tabName,
      'aria-selected': isOn ? 'true' : 'false',
      tabindex: isOn ? '0' : '-1',
    };
    const classes = new Set(isOn ? ['on'] : []);
    return {
      id,
      dataset: { tab: tabName },
      active: isOn,
      classList: {
        toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => {
        attrs[k] = String(v);
      },
      getAttribute: (k) => attrs[k] ?? null,
      removeAttribute: (k) => {
        delete attrs[k];
      },
      focus() {},
    };
  };

  const announcer = { id: 'catalog-status-announcer', textContent: '' };
  let searchInput = createMockInput('catalog-search');
  let maxWInput = createMockInput('catalog-max-w');
  let maxDInput = createMockInput('catalog-max-d');

  const paletteAttrs = { id: 'palette', 'aria-labelledby': 'tab-build' };
  let paletteHtml = '';
  const palette = {
    id: 'palette',
    get innerHTML() {
      return paletteHtml;
    },
    set innerHTML(html) {
      paletteHtml = html;
      // Simulate fresh input elements mounted inside #palette on each re-render
      if (html.includes('id="catalog-search"')) {
        const prevSearch = searchInput.value;
        const prevW = maxWInput.value;
        const prevD = maxDInput.value;
        searchInput = createMockInput('catalog-search');
        searchInput.value = prevSearch;
        maxWInput = createMockInput('catalog-max-w');
        maxWInput.value = prevW;
        maxDInput = createMockInput('catalog-max-d');
        maxDInput.value = prevD;
      }
    },
    setAttribute(k, v) {
      paletteAttrs[k] = String(v);
    },
    getAttribute(k) {
      return paletteAttrs[k] ?? null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const tabBuild = createMockTab('tab-build', 'build', true);
  const tabBuy = createMockTab('tab-buy', 'buy', false);
  const tabPaint = createMockTab('tab-paint', 'paint', false);
  const tabButtons = [tabBuild, tabBuy, tabPaint];

  const mock2d = {
    scale() {},
    fillRect() {},
    createPattern() {
      return {};
    },
  };

  const prevDoc = globalThis.document;
  const mockDoc = {
    activeElement: null,
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 34,
          height: 34,
          getContext: () => mock2d,
          toDataURL: () => 'data:image/png;base64,',
        };
      }
      return { style: {} };
    },
    getElementById(id) {
      if (id === 'catalog-status-announcer') return announcer;
      if (id === 'palette') return palette;
      return null;
    },
    querySelector(sel) {
      if (sel === '#catalog-status-announcer') return announcer;
      if (sel === '#palette') return palette;
      if (sel === '#catalog-search')
        return paletteHtml.includes('id="catalog-search"') ? searchInput : null;
      if (sel === '#catalog-max-w')
        return paletteHtml.includes('id="catalog-max-w"') ? maxWInput : null;
      if (sel === '#catalog-max-d')
        return paletteHtml.includes('id="catalog-max-d"') ? maxDInput : null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '#tabs button, #tabs k-tab') return tabButtons;
      return [];
    },
  };
  globalThis.document = mockDoc;

  try {
    // Switch to Buy tab: initial full catalog count announced after 300ms
    switchTab(tabBuy);
    await new Promise((r) => setTimeout(r, 340));
    assert.equal(announcer.textContent, `${ITEMS.length} furniture items found`);

    // Rapid search typing only announces settled query result count
    searchInput.focus();
    searchInput.triggerInput('s');
    searchInput.triggerInput('so');
    searchInput.triggerInput('sofa');
    const expectedSofaCount = filterItems(ITEMS, { query: 'sofa' }).length;
    await new Promise((r) => setTimeout(r, 100));
    // Still holds previous value before 300ms debounce fires
    assert.equal(announcer.textContent, `${ITEMS.length} furniture items found`);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(
      announcer.textContent,
      `${expectedSofaCount} furniture ${expectedSofaCount === 1 ? 'item' : 'items'} found`
    );

    // Dimension filter updates announcement
    searchInput.triggerInput('');
    maxWInput.triggerInput('36');
    maxDInput.triggerInput('24');
    const expectedDimCount = filterItems(ITEMS, { query: '', maxW: '36', maxD: '24' }).length;
    await new Promise((r) => setTimeout(r, 340));
    assert.equal(
      announcer.textContent,
      `${expectedDimCount} furniture ${expectedDimCount === 1 ? 'item' : 'items'} found`
    );

    // Switching tabs clears #catalog-status-announcer immediately and cancels pending timers
    searchInput.triggerInput('bed');
    switchTab(tabBuild);
    assert.equal(announcer.textContent, '', 'switching tabs immediately clears status text');
    await new Promise((r) => setTimeout(r, 340));
    assert.equal(announcer.textContent, '', 'cancelled timer must not repopulate status text');

    // Reset catalog inputs cleanly
    switchTab(tabBuy);
    searchInput.triggerInput('');
    maxWInput.triggerInput('');
    maxDInput.triggerInput('');
    switchTab(tabBuild);
    renderPalette();
  } finally {
    clearCatalogAnnouncement();
    globalThis.document = prevDoc;
  }
});
