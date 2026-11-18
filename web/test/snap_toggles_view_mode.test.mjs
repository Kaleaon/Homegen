import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

if (typeof HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = class {};
}

if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const baseWebGLCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
  getExtension: () => null,
  getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
  checkFramebufferStatus: () => 36053,
  createFramebuffer: () => ({ id: Math.random() }),
  createRenderbuffer: () => ({ id: Math.random() }),
  createTexture: () => ({ id: Math.random() }),
  createBuffer: () => ({ id: Math.random() }),
  createProgram: () => ({ id: Math.random() }),
  createShader: () => ({ id: Math.random() }),
  createVertexArray: () => ({ id: Math.random() }),
  TRIANGLES: 4,
};

const mockWebGLCtx = new Proxy(baseWebGLCtx, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => {};
  },
});

const mock2dCtx = new Proxy(
  {
    canvas: { width: 800, height: 600 },
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
  },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
  }
);

function parseSnapTogglesHTML(html) {
  const popoverEl = createMockElement('snap-popover', 'K-POPOVER');

  const triggerMatch = html.match(/<k-button\s+id="snap-trigger"([^>]*)>([\s\S]*?)<\/k-button>/);
  const triggerEl = createMockElement('snap-trigger', 'K-BUTTON');
  if (triggerMatch) {
    const attrsStr = triggerMatch[1];
    triggerEl.innerHTML = triggerMatch[2];
    if (/\bactive\b/.test(attrsStr)) triggerEl.setAttribute('active', '');
    if (/\bdisabled\b/.test(attrsStr)) {
      triggerEl.disabled = true;
      triggerEl.setAttribute('disabled', '');
    }
    const badgeMatch = triggerMatch[2].match(/class="snap-badge[^"]*">(\d+)</);
    triggerEl.badgeText = badgeMatch ? badgeMatch[1] : '';
  }

  const toggleBtns = [];
  const btnRegex = /<k-button\s+class="([^"]*snap-toggle-btn[^"]*)"([^>]*)>([\s\S]*?)<\/k-button>/g;
  let match;
  while ((match = btnRegex.exec(html)) !== null) {
    const classStr = match[1];
    const attrsStr = match[2];
    const inner = match[3];
    const idMatch = attrsStr.match(/data-snap-id="([^"]+)"/);
    const snapId = idMatch ? idMatch[1] : '';
    const btn = createMockElement(`snap-btn-${snapId}`, 'K-BUTTON');
    classStr
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => btn.classList.add(c));
    btn.dataset.snapId = snapId;
    btn.innerHTML = inner;
    if (/\bactive\b/.test(attrsStr)) btn.setAttribute('active', '');
    if (/\bdisabled\b/.test(attrsStr)) {
      btn.disabled = true;
      btn.setAttribute('disabled', '');
    }
    toggleBtns.push(btn);
  }

  return { popoverEl, triggerEl, toggleBtns };
}

function createMockElement(id = '', tagName = 'DIV') {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  let htmlValue = '';
  let parsedSnap = null;

  const element = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    checked: true,
    hidden: id === 'view3d' || id === 'bar3d' || id === 'walkthrough-hud',
    disabled: false,
    open: false,
    dataset: {},
    style: {},
    ownerDocument: null,
    get innerHTML() {
      return htmlValue;
    },
    set innerHTML(val) {
      htmlValue = String(val);
      if (id === 'snap-toggles') {
        parsedSnap = parseSnapTogglesHTML(htmlValue);
      }
    },
    get _parsedSnap() {
      return parsedSnap;
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => {
        const next = v === undefined ? !classes.has(c) : Boolean(v);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attributes[name] = String(val);
      if (name === 'open') element.open = true;
      if (name === 'disabled') element.disabled = true;
    },
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    removeAttribute: (name) => {
      delete attributes[name];
      if (name === 'open') element.open = false;
      if (name === 'disabled') element.disabled = false;
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
          ? { type, preventDefault: () => {}, stopPropagation: () => {} }
          : { preventDefault: () => {}, stopPropagation: () => {}, ...evt };
      if (listeners[type]) listeners[type].forEach((fn) => fn(eventObj));
    },
    click: () => element.dispatchEvent('click'),
    focus: () => {},
    blur: () => {},
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
    getRootNode: () => globalThis.document,
    getContext: (type) => (type === '2d' ? mock2dCtx : mockWebGLCtx),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    closest: () => null,
    querySelector: (selector) => {
      if (id === 'snap-toggles' && parsedSnap) {
        if (selector === 'k-popover' || selector === '#snap-popover') return parsedSnap.popoverEl;
        if (selector === '#snap-trigger') return parsedSnap.triggerEl;
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (id === 'snap-toggles' && parsedSnap) {
        if (selector === '[data-snap-id]' || selector === '.snap-toggle-btn') {
          return parsedSnap.toggleBtns;
        }
      }
      return [];
    },
  };
  return element;
}

const elements = {};
const getEl = (id, tag = 'DIV') => {
  if (!elements[id]) {
    const el = createMockElement(id, tag);
    el.ownerDocument = globalThis.document;
    elements[id] = el;
  }
  return elements[id];
};

const view2dBtn = createMockElement('btn-view-2d', 'BUTTON');
view2dBtn.dataset.view = '2d';
view2dBtn.classList.add('on');

const view3dBtn = createMockElement('btn-view-3d', 'BUTTON');
view3dBtn.dataset.view = '3d';

const toolSelectBtn = createMockElement('btn-tool-select', 'BUTTON');
toolSelectBtn.dataset.tool = 'select';
const toolEraseBtn = createMockElement('btn-tool-erase', 'BUTTON');
toolEraseBtn.dataset.tool = 'erase';

globalThis.document = {
  activeElement: createMockElement('body', 'BODY'),
  getElementById: (id) => getEl(id),
  createElement: (tag) => {
    const el = createMockElement('', tag);
    el.width = 256;
    el.height = 256;
    el.ownerDocument = globalThis.document;
    return el;
  },
  querySelector: (selector) => {
    if (selector === '[data-view="2d"]' || selector === '#toolbar [data-view="2d"]') {
      return view2dBtn;
    }
    if (selector === '[data-view="3d"]' || selector === '#toolbar [data-view="3d"]') {
      return view3dBtn;
    }
    const snapToggles = elements['snap-toggles'];
    if (snapToggles && snapToggles._parsedSnap) {
      if (selector === '#snap-popover') return snapToggles._parsedSnap.popoverEl;
      if (selector === '#snap-trigger') return snapToggles._parsedSnap.triggerEl;
    }
    const id = selector.replace(/^#/, '');
    return getEl(id);
  },
  querySelectorAll: (selector) => {
    if (selector === '[data-view]') return [view2dBtn, view3dBtn];
    if (selector === '#toolbar [data-tool]') return [toolSelectBtn, toolEraseBtn];
    if (selector === '.snap-toggle-btn') {
      const snapToggles = elements['snap-toggles'];
      return snapToggles && snapToggles._parsedSnap ? snapToggles._parsedSnap.toggleBtns : [];
    }
    return [];
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

getEl('plan', 'CANVAS').ownerDocument = globalThis.document;
getEl('view3d', 'CANVAS').ownerDocument = globalThis.document;
getEl('snap-toggles', 'SPAN');

globalThis.window = {
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: '' },
  navigator: { userAgent: 'node' },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
};

await import('../js/app.js');

test('snap toggles and popover synchronize with 2D/3D view mode transitions and block 2D state mutations in 3D mode', async () => {
  const homegen = globalThis.window.__homegen;
  assert.ok(homegen, 'window.__homegen must be initialized');
  assert.ok(homegen.view3d, 'view3d controller must be initialized');

  const snapContainer = getEl('snap-toggles');
  assert.ok(snapContainer._parsedSnap, 'renderSnapToggles should populate #snap-toggles');

  // 1. Verify initial 2D mode state
  assert.equal(homegen.view3d.isThree(), false);
  assert.equal(snapContainer._parsedSnap.triggerEl.disabled, false);
  assert.equal(snapContainer._parsedSnap.triggerEl.hasAttribute('disabled'), false);
  for (const btn of snapContainer._parsedSnap.toggleBtns) {
    assert.equal(btn.disabled, false, `${btn.dataset.snapId} should be enabled in 2D mode`);
    assert.equal(btn.hasAttribute('disabled'), false);
  }

  // Toggle midpoint snap ON in 2D mode and open the popover
  const midpointBtn2D = snapContainer._parsedSnap.toggleBtns.find(
    (b) => b.dataset.snapId === 'midpoint'
  );
  assert.ok(midpointBtn2D, 'midpoint toggle button must exist');
  assert.equal(homegen.interaction.getSnapModeState().midpoint, false);
  midpointBtn2D.click();
  assert.equal(
    homegen.interaction.getSnapModeState().midpoint,
    true,
    'Clicking snap toggle in 2D mode should update snap state'
  );

  // Open #snap-popover prior to switching to 3D mode
  const openPopoverBefore3D = snapContainer._parsedSnap.popoverEl;
  openPopoverBefore3D.setAttribute('open', '');
  assert.equal(openPopoverBefore3D.open, true);
  assert.equal(openPopoverBefore3D.hasAttribute('open'), true);

  const expectedStateBefore3D = { ...homegen.interaction.getSnapModeState() };
  assert.deepEqual(expectedStateBefore3D, {
    grid: true,
    edge: true,
    midpoint: true,
    perpendicular: false,
    angle: true,
  });

  // 2. Switch to 3D mode via setView('3d')
  await homegen.view3d.setView('3d');
  assert.equal(homegen.view3d.isThree(), true);

  // Open popover must be closed immediately
  assert.equal(openPopoverBefore3D.open, false, '#snap-popover.open must be false in 3D mode');
  assert.equal(
    openPopoverBefore3D.hasAttribute('open'),
    false,
    '#snap-popover open attribute must be removed in 3D mode'
  );

  // Trigger and toggle buttons must be disabled with disabled attributes
  assert.equal(snapContainer._parsedSnap.triggerEl.disabled, true);
  assert.equal(snapContainer._parsedSnap.triggerEl.hasAttribute('disabled'), true);
  for (const btn of snapContainer._parsedSnap.toggleBtns) {
    assert.equal(btn.disabled, true, `${btn.dataset.snapId} must have disabled=true in 3D mode`);
    assert.equal(
      btn.hasAttribute('disabled'),
      true,
      `${btn.dataset.snapId} must have disabled attribute in 3D mode`
    );
  }

  // 2D snap settings must NOT be reset when entering 3D mode
  assert.deepEqual(homegen.interaction.getSnapModeState(), expectedStateBefore3D);

  // Clicking snap toggle buttons during 3D mode must NOT mutate 2D snap state
  for (const btn of snapContainer._parsedSnap.toggleBtns) {
    btn.click();
  }
  assert.deepEqual(
    homegen.interaction.getSnapModeState(),
    expectedStateBefore3D,
    'Clicking snap toggle buttons in 3D mode must not mutate 2D snap state'
  );

  // 3. Re-rendering snap toggles while in 3D mode (e.g. via refresh) preserves disabled state and closed popover
  snapContainer._parsedSnap.popoverEl.setAttribute('open', '');
  homegen.renderSnapToggles();

  assert.equal(
    snapContainer._parsedSnap.popoverEl.open,
    false,
    'renderSnapToggles in 3D mode must not keep popover open'
  );
  assert.equal(snapContainer._parsedSnap.triggerEl.hasAttribute('disabled'), true);
  assert.equal(snapContainer._parsedSnap.triggerEl.badgeText, '3');
  for (const btn of snapContainer._parsedSnap.toggleBtns) {
    assert.equal(
      btn.hasAttribute('disabled'),
      true,
      `Re-rendered ${btn.dataset.snapId} must render with disabled attribute in 3D mode`
    );
    btn.click();
  }
  assert.deepEqual(
    homegen.interaction.getSnapModeState(),
    expectedStateBefore3D,
    'Re-rendered snap buttons in 3D mode must still prevent vm.onToggle mutations'
  );

  // 4. Switch back to 2D mode via setView('2d')
  await homegen.view3d.setView('2d');
  assert.equal(homegen.view3d.isThree(), false);

  assert.equal(snapContainer._parsedSnap.triggerEl.disabled, false);
  assert.equal(snapContainer._parsedSnap.triggerEl.hasAttribute('disabled'), false);
  for (const btn of snapContainer._parsedSnap.toggleBtns) {
    assert.equal(btn.disabled, false, `${btn.dataset.snapId} must be re-enabled in 2D mode`);
    assert.equal(
      btn.hasAttribute('disabled'),
      false,
      `${btn.dataset.snapId} disabled attribute must be removed in 2D mode`
    );
  }
  assert.deepEqual(
    homegen.interaction.getSnapModeState(),
    expectedStateBefore3D,
    'Returning to 2D mode must preserve 2D snap settings'
  );

  // Clicking toggle in 2D mode works again
  const midpointBtnRestored = snapContainer._parsedSnap.toggleBtns.find(
    (b) => b.dataset.snapId === 'midpoint'
  );
  midpointBtnRestored.click();
  assert.equal(
    homegen.interaction.getSnapModeState().midpoint,
    false,
    'Clicking snap toggle after returning to 2D mode should mutate 2D snap state again'
  );
});
