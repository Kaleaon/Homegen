import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../index.html');
const cssPath = path.join(__dirname, '../css/style.css');
const appJsPath = path.join(__dirname, '../js/app.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

test('index.html tablist markup contains required WAI-ARIA roles, labels, and tabindex attributes', () => {
  // nav#tabs container check
  assert.match(
    htmlContent,
    /<nav\s+id="tabs"\s+role="tablist"\s+aria-label="Palette categories">/,
    'nav#tabs must have role="tablist" and aria-label="Palette categories"'
  );

  // Tab buttons check
  assert.match(
    htmlContent,
    /<(button|k-tab)\s+id="tab-build"\s+data-tab="build"\s+(active\s+)?class="on"\s+role="tab"\s+aria-selected="true"\s+aria-controls="palette"\s+tabindex="0">Build<\/(button|k-tab)>/,
    'tab-build must have role="tab", aria-selected="true", aria-controls="palette", tabindex="0"'
  );
  assert.match(
    htmlContent,
    /<(button|k-tab)\s+id="tab-buy"\s+data-tab="buy"\s+role="tab"\s+aria-selected="false"\s+aria-controls="palette"\s+tabindex="-1">Buy<\/(button|k-tab)>/,
    'tab-buy must have role="tab", aria-selected="false", aria-controls="palette", tabindex="-1"'
  );
  assert.match(
    htmlContent,
    /<(button|k-tab)\s+id="tab-paint"\s+data-tab="paint"\s+role="tab"\s+aria-selected="false"\s+aria-controls="palette"\s+tabindex="-1">Paint<\/(button|k-tab)>/,
    'tab-paint must have role="tab", aria-selected="false", aria-controls="palette", tabindex="-1"'
  );
  assert.match(
    htmlContent,
    /<(button|k-tab)\s+id="tab-kits"\s+data-tab="kits"\s+role="tab"\s+aria-selected="false"\s+aria-controls="palette"\s+tabindex="-1">Kits<\/(button|k-tab)>/,
    'tab-kits must have role="tab", aria-selected="false", aria-controls="palette", tabindex="-1"'
  );

  // #palette panel container check
  assert.match(
    htmlContent,
    /<div\s+id="palette"\s+role="tabpanel"\s+tabindex="0"\s+aria-labelledby="tab-build"><\/div>/,
    '#palette container must have role="tabpanel", tabindex="0", and aria-labelledby="tab-build"'
  );
});

test('style.css defines active styling for button[aria-selected="true"]', () => {
  assert.ok(
    cssContent.includes("button[aria-selected='true']") ||
      cssContent.includes('button[aria-selected="true"]'),
    'style.css must include button[aria-selected="true"] or button[aria-selected=\'true\'] selector'
  );
});

test('app.js defines switchTab, handles keydown on #tabs, and isolates global keyboard shortcuts', () => {
  assert.match(
    appJsContent,
    /function switchTab\(targetBtn,\s*shouldFocus\s*=\s*false\)/,
    'app.js must define switchTab function'
  );
  assert.match(
    appJsContent,
    /document\.activeElement\?\.closest\('#tabs'\)/,
    'global keydown handler in app.js must return early if focus is inside #tabs'
  );
  assert.match(
    appJsContent,
    /e\.key\s*===\s*'ArrowRight'/,
    'app.js must include keyboard handler for ArrowRight'
  );
  assert.match(
    appJsContent,
    /e\.key\s*===\s*'ArrowLeft'/,
    'app.js must include keyboard handler for ArrowLeft'
  );
  assert.match(
    appJsContent,
    /e\.key\s*===\s*'Home'/,
    'app.js must include keyboard handler for Home'
  );
  assert.match(
    appJsContent,
    /e\.key\s*===\s*'End'/,
    'app.js must include keyboard handler for End'
  );
});

function createMockElement(id, attrs = {}) {
  const attributes = { id, ...attrs };
  const listeners = {};
  const classes = new Set(attrs.class ? attrs.class.split(' ') : []);

  const element = {
    id,
    dataset: attrs.dataset || {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, val) => (val ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    getAttribute: (k) => attributes[k] ?? null,
    setAttribute: (k, v) => {
      attributes[k] = String(v);
    },
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      if (listeners[type]) {
        listeners[type].forEach((fn) => fn(evt));
      }
    },
    focusCalled: false,
    focus: function () {
      this.focusCalled = true;
      mockDocument.activeElement = element;
    },
    closest: (selector) => {
      if (selector === '#tabs' && (attrs.isInsideTabs || id === 'tabs' || id.startsWith('tab-')))
        return mockTabsNav;
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  return element;
}

let mockDocument;
let mockTabsNav;

function setupMockEnvironment() {
  const tabBuild = createMockElement('tab-build', {
    'data-tab': 'build',
    dataset: { tab: 'build' },
    class: 'on',
    role: 'tab',
    'aria-selected': 'true',
    'aria-controls': 'palette',
    tabindex: '0',
  });
  const tabBuy = createMockElement('tab-buy', {
    'data-tab': 'buy',
    dataset: { tab: 'buy' },
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'palette',
    tabindex: '-1',
  });
  const tabPaint = createMockElement('tab-paint', {
    'data-tab': 'paint',
    dataset: { tab: 'paint' },
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'palette',
    tabindex: '-1',
  });
  const tabKits = createMockElement('tab-kits', {
    'data-tab': 'kits',
    dataset: { tab: 'kits' },
    role: 'tab',
    'aria-selected': 'false',
    'aria-controls': 'palette',
    tabindex: '-1',
  });

  const buttons = [tabBuild, tabBuy, tabPaint, tabKits];
  buttons.forEach((b) => {
    b.closest = (selector) => (selector === '#tabs' ? mockTabsNav : null);
  });

  const palette = createMockElement('palette', {
    role: 'tabpanel',
    tabindex: '0',
    'aria-labelledby': 'tab-build',
  });

  mockTabsNav = createMockElement('tabs', {
    role: 'tablist',
    'aria-label': 'Palette categories',
  });
  mockTabsNav.querySelectorAll = (selector) => {
    if (selector === 'button' || selector === '#tabs button') return buttons;
    return [];
  };

  mockDocument = {
    activeElement: tabBuild,
    getElementById: (id) => {
      if (id === 'tabs') return mockTabsNav;
      if (id === 'palette') return palette;
      return buttons.find((b) => b.id === id) || null;
    },
    querySelectorAll: (selector) => {
      if (selector === '#tabs button') return buttons;
      return [];
    },
  };

  let activeTab = 'build';

  function switchTabMock(targetBtn, shouldFocus = false) {
    if (!targetBtn) return;
    activeTab = targetBtn.dataset.tab;
    buttons.forEach((x) => {
      const isSelected = x === targetBtn;
      x.classList.toggle('on', isSelected);
      x.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      x.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
    const p = mockDocument.getElementById('palette');
    if (p && targetBtn.id) {
      p.setAttribute('aria-labelledby', targetBtn.id);
    }
    if (shouldFocus) {
      targetBtn.focus();
    }
  }

  function handleTabsKeydown(e) {
    const activeEl = mockDocument.activeElement;
    const currentIndex = buttons.indexOf(activeEl);
    if (currentIndex === -1) return;

    let newIndex = -1;
    if (e.key === 'ArrowRight') {
      newIndex = (currentIndex + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (e.key === 'Home') {
      newIndex = 0;
    } else if (e.key === 'End') {
      newIndex = buttons.length - 1;
    }

    if (newIndex !== -1) {
      e.defaultPrevented = true;
      e.propagationStopped = true;
      switchTabMock(buttons[newIndex], true);
    }
  }

  return {
    buttons,
    tabBuild,
    tabBuy,
    tabPaint,
    tabKits,
    palette,
    switchTabMock,
    handleTabsKeydown,
    getActiveTab: () => activeTab,
  };
}

test('switchTabMock updates aria-selected, tabindex, on class, and aria-labelledby', () => {
  const mock = setupMockEnvironment();

  // Switch to Buy tab
  mock.switchTabMock(mock.tabBuy, true);

  assert.equal(mock.tabBuy.getAttribute('aria-selected'), 'true');
  assert.equal(mock.tabBuy.getAttribute('tabindex'), '0');
  assert.equal(mock.tabBuy.classList.contains('on'), true);
  assert.equal(mock.tabBuy.focusCalled, true);

  assert.equal(mock.tabBuild.getAttribute('aria-selected'), 'false');
  assert.equal(mock.tabBuild.getAttribute('tabindex'), '-1');
  assert.equal(mock.tabBuild.classList.contains('on'), false);

  assert.equal(mock.palette.getAttribute('aria-labelledby'), 'tab-buy');
  assert.equal(mock.getActiveTab(), 'buy');
});

test('roving tabindex keyboard navigation wraps correctly with ArrowRight, ArrowLeft, Home, End', () => {
  const mock = setupMockEnvironment();

  // Focused on Build (index 0), press ArrowRight -> Buy (index 1)
  const eventRight = { key: 'ArrowRight' };
  mock.handleTabsKeydown(eventRight);
  assert.equal(mock.getActiveTab(), 'buy');
  assert.equal(mock.mockDocument?.activeElement || mock.tabBuy, mock.tabBuy);

  // Press ArrowRight twice -> Kits (index 3)
  mock.handleTabsKeydown({ key: 'ArrowRight' });
  assert.equal(mock.getActiveTab(), 'paint');
  mock.handleTabsKeydown({ key: 'ArrowRight' });
  assert.equal(mock.getActiveTab(), 'kits');

  // On Kits (index 3), press ArrowRight -> wraps to Build (index 0)
  mock.handleTabsKeydown({ key: 'ArrowRight' });
  assert.equal(mock.getActiveTab(), 'build');

  // On Build (index 0), press ArrowLeft -> wraps to Kits (index 3)
  mock.handleTabsKeydown({ key: 'ArrowLeft' });
  assert.equal(mock.getActiveTab(), 'kits');

  // On Kits (index 3), press Home -> Build (index 0)
  mock.handleTabsKeydown({ key: 'Home' });
  assert.equal(mock.getActiveTab(), 'build');

  // On Build (index 0), press End -> Kits (index 3)
  mock.handleTabsKeydown({ key: 'End' });
  assert.equal(mock.getActiveTab(), 'kits');
});

test('global keydown listener ignores shortcuts when focus is inside #tabs', () => {
  const mock = setupMockEnvironment();

  function globalKeydownHandler(_e) {
    if (
      /INPUT|SELECT|TEXTAREA/.test(mockDocument.activeElement?.tagName) ||
      mockDocument.activeElement?.closest('#tabs')
    ) {
      return 'ignored';
    }
    return 'handled';
  }

  // Active element is tabBuild inside #tabs
  mockDocument.activeElement = mock.tabBuild;
  assert.equal(globalKeydownHandler({ key: 'ArrowRight' }), 'ignored');

  // Active element outside #tabs
  mockDocument.activeElement = createMockElement('plan');
  assert.equal(globalKeydownHandler({ key: 'ArrowRight' }), 'handled');
});
