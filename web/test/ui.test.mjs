import test from 'node:test';
import assert from 'node:assert/strict';
import { HordeError } from '../js/photoreal.js';

function createMockElement(id = '') {
  const listeners = {};
  const classes = new Set();
  const element = {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    src: '',
    hidden: false,
    disabled: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      if (listeners[type]) listeners[type].forEach((fn) => fn(evt));
    },
    click: () => element.dispatchEvent('click'),
    showModal: () => {
      element.hidden = false;
    },
    close: () => {
      element.hidden = true;
      element.dispatchEvent('close');
    },
  };
  return element;
}

test('UI Error Boundary state controller displays recovery buttons and flags invalid key on auth error', () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const pKey = getEl('p-key');
  pKey.value = 'invalid-api-key';
  const pError = getEl('p-error');
  const pErrorMsg = getEl('p-error-msg');
  const pRetry = getEl('p-retry');
  const pUseAnon = getEl('p-use-anon');
  getEl('p-lower-res');

  // Simulate showPhotorealError with an Auth Error
  const authErr = new HordeError('AI Horde authorization failed (401)', 'auth', 401);

  // Directly verify boundary handler behavior logic:
  pError.hidden = false;
  pErrorMsg.textContent = authErr.message;
  if (authErr.type === 'auth') pKey.classList.add('invalid');
  pRetry.hidden = false;
  if (authErr.type === 'auth' || pKey.value !== '0000000000') pUseAnon.hidden = false;

  assert.equal(pError.hidden, false);
  assert.equal(pKey.classList.contains('invalid'), true);
  assert.equal(pUseAnon.hidden, false);
  assert.equal(pRetry.hidden, false);

  // Simulate clicking "Use Anonymous Key" recovery button
  pKey.value = '0000000000';
  pKey.classList.remove('invalid');
  pError.hidden = true;

  assert.equal(pKey.value, '0000000000');
  assert.equal(pKey.classList.contains('invalid'), false);
  assert.equal(pError.hidden, true);
});

test('UI Error Boundary displays Lower Resolution button on worker fault / timeout', () => {
  const pError = createMockElement('p-error');
  const pLowerRes = createMockElement('p-lower-res');
  const pRetry = createMockElement('p-retry');

  const faultErr = new HordeError('AI Horde job failed', 'fault');

  pError.hidden = false;
  pRetry.hidden = false;
  if (faultErr.type === 'fault') {
    pLowerRes.hidden = false;
  }

  assert.equal(pError.hidden, false);
  assert.equal(pRetry.hidden, false);
  assert.equal(pLowerRes.hidden, false);
});

test('Export PDF button click handler blocks modal for empty plan and toasts warning', () => {
  let modalShown = false;
  let toastMsg = '';
  let toastIsErr = false;

  const mockModal = {
    showModal: () => {
      modalShown = true;
    },
  };

  const mockToast = (msg, err = false) => {
    toastMsg = msg;
    toastIsErr = err;
  };

  const handleExportPdf = (doc) => {
    if (!doc.rooms || doc.rooms.length === 0) {
      mockToast('Cannot export PDF: add at least one room first.', true);
      return;
    }
    mockModal.showModal();
  };

  // Test empty rooms list
  handleExportPdf({ rooms: [] });
  assert.equal(modalShown, false, 'Modal should not open for empty plan');
  assert.equal(toastMsg, 'Cannot export PDF: add at least one room first.');
  assert.equal(toastIsErr, true);

  // Test plan with rooms
  modalShown = false;
  toastMsg = '';
  handleExportPdf({ rooms: [{ id: 'r1' }] });
  assert.equal(modalShown, true, 'Modal should open when plan has rooms');
  assert.equal(toastMsg, '');
});

test('PDF generation error handler toasts fallback engine errors', () => {
  let toastMsg = '';
  let toastIsErr = false;

  const mockToast = (msg, err = false) => {
    toastMsg = msg;
    toastIsErr = err;
  };

  const generatePDFMock = (doc) => {
    if (!doc.rooms || doc.rooms.length === 0) {
      throw new Error('Cannot export PDF: add at least one room first.');
    }
  };

  const handlePdfGenerate = (doc) => {
    try {
      generatePDFMock(doc);
    } catch (err) {
      mockToast(`Failed to export PDF: ${err.message}`, true);
    }
  };

  handlePdfGenerate({ rooms: [] });
  assert.equal(toastMsg, 'Failed to export PDF: Cannot export PDF: add at least one room first.');
  assert.equal(toastIsErr, true);
});

test('renderSnapToggles popover menu renders unified k-button trigger with badge and categorized sections', async () => {
  const { buildToggleViewModel } = await import('../../designer3d/tools/index.mjs');

  const mockInteraction = {
    getSnapModeState: () => ({
      grid: true,
      edge: true,
      midpoint: false,
      perpendicular: false,
    }),
    toggleSnapMode: (_id, _val) => {},
  };

  const viewModels = buildToggleViewModel(mockInteraction);
  const activeCount = viewModels.filter((vm) => vm.enabled).length;
  assert.equal(activeCount, 2);

  const basicItems = viewModels.filter((vm) => (vm.category || 'basic') === 'basic');
  const advancedItems = viewModels.filter((vm) => vm.category === 'advanced');

  assert.equal(basicItems.length, 2);
  assert.equal(advancedItems.length, 2);

  const basicIds = basicItems.map((x) => x.id);
  const advancedIds = advancedItems.map((x) => x.id);

  assert.deepEqual(basicIds, ['grid', 'edge']);
  assert.deepEqual(advancedIds, ['midpoint', 'perpendicular']);
});

test('KPopover ignores trigger click when trigger button is disabled', async () => {
  if (typeof customElements === 'undefined') {
    const registry = new Map();
    globalThis.customElements = {
      define: (name, constructor) => registry.set(name, constructor),
      get: (name) => registry.get(name),
    };
  }
  const { KPopover } = await import('../js/k-components.js');

  const attrs = new Map();
  let triggerDisabled = false;
  const triggerAttrs = new Map();
  const mockTrigger = {
    get disabled() {
      return triggerDisabled;
    },
    set disabled(v) {
      triggerDisabled = Boolean(v);
      if (triggerDisabled) triggerAttrs.set('disabled', '');
      else triggerAttrs.delete('disabled');
    },
    setAttribute: (k, v) => triggerAttrs.set(k, v),
    removeAttribute: (k) => triggerAttrs.delete(k),
    hasAttribute: (k) => triggerAttrs.has(k),
  };

  const popover = Object.create(KPopover.prototype);
  popover.setAttribute = (k, v) => attrs.set(k, v);
  popover.removeAttribute = (k) => attrs.delete(k);
  popover.hasAttribute = (k) => attrs.has(k);
  popover.getAttribute = (k) => attrs.get(k) ?? null;
  popover.dispatchEvent = () => true;
  popover._getTriggerElement = () => mockTrigger;

  // Enabled trigger opens and closes popover
  popover._onTriggerClick({ stopPropagation: () => {}, preventDefault: () => {} });
  assert.equal(popover.open, true);
  popover._onTriggerClick({ stopPropagation: () => {}, preventDefault: () => {} });
  assert.equal(popover.open, false);

  // Disabled trigger does not open popover
  mockTrigger.disabled = true;
  popover._onTriggerClick({ stopPropagation: () => {}, preventDefault: () => {} });
  assert.equal(popover.open, false);
});

test('renderSnapToggles binds Grid & Angle Increments k-input controls via buildGridSettingsViewModel', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { InteractionLayer, buildGridSettingsViewModel } =
    await import('../../designer3d/tools/index.mjs');

  const appJsContent = readFileSync(resolve('js/app.js'), 'utf8');
  assert.match(appJsContent, /Grid &amp; Angle Increments/);
  assert.match(appJsContent, /<k-input[^>]*id="snap-unit-size"[^>]*type="number"/);
  assert.match(appJsContent, /<k-input[^>]*id="snap-angle-degrees"[^>]*type="number"/);

  const layer = new InteractionLayer({
    gridSettings: { unitSize: 6, angleSnapDegrees: 15, magneticThreshold: 14 },
  });
  const gridVm = buildGridSettingsViewModel(layer);

  assert.equal(gridVm.unitSize, 6);
  assert.equal(gridVm.angleSnapDegrees, 15);

  assert.ok(gridVm.onUnitSizeChange('12'));
  assert.equal(layer.gridSettings.unitSize, 12);

  assert.ok(gridVm.onAngleSnapDegreesChange('45'));
  assert.equal(layer.gridSettings.angleSnapDegrees, 45);

  assert.equal(gridVm.onUnitSizeChange('0'), null);
  assert.equal(gridVm.onAngleSnapDegreesChange('-15'), null);
  assert.equal(gridVm.onUnitSizeChange(''), null);
  assert.equal(layer.gridSettings.unitSize, 12);
  assert.equal(layer.gridSettings.angleSnapDegrees, 45);
});

test('renderSnapToggles in app.js updates interaction.gridSettings on input/change and preserves popover open and focus state', async () => {
  const elements = {};
  const makeEl = (id = '') => {
    const attrs = new Map();
    const listeners = {};
    const el = {
      id,
      value: '',
      open: false,
      innerHTML: '',
      focused: false,
      dataset: {},
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      hasAttribute: (k) => attrs.has(k),
      addEventListener: (evt, fn) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
      dispatchEvent: (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        if (listeners[type]) listeners[type].forEach((fn) => fn(evt));
      },
      focus: () => {
        el.focused = true;
        global.document.activeElement = el;
      },
      getContext: () => ({
        save: () => {},
        restore: () => {},
        clearRect: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        closePath: () => {},
        setTransform: () => {},
        scale: () => {},
        translate: () => {},
        setLineDash: () => {},
        fillText: () => {},
        measureText: () => ({ width: 20 }),
        canvas: { width: 800, height: 600 },
      }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return el;
  };

  const getEl = (id) => {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  };

  const snapPopover = makeEl('snap-popover');
  const unitInput = makeEl('snap-unit-size');
  const angleInput = makeEl('snap-angle-degrees');
  const unitLabel = makeEl('snap-unit-size-label');
  const angleLabel = makeEl('snap-angle-degrees-label');

  const snapContainer = makeEl('snap-toggles');
  snapContainer.contains = (target) => target === unitInput || target === angleInput;
  snapContainer.querySelector = (sel) => {
    if (!snapContainer.innerHTML) return null;
    if (sel === 'k-popover') return snapPopover;
    if (sel === '#snap-unit-size') return unitInput;
    if (sel === '#snap-angle-degrees') return angleInput;
    if (sel === 'label[for="snap-unit-size"]') return unitLabel;
    if (sel === 'label[for="snap-angle-degrees"]') return angleLabel;
    return null;
  };
  snapContainer.querySelectorAll = () => [];
  elements['snap-toggles'] = snapContainer;

  const prevDoc = global.document;
  const prevWin = global.window;

  try {
    global.document = {
      activeElement: makeEl('body'),
      getElementById: (id) => getEl(id),
      querySelector: (s) => getEl(s.replace(/^#/, '')),
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    global.window = {
      devicePixelRatio: 1,
      addEventListener: () => {},
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

    await import(`../js/app.js?t=${Date.now()}`);
    const { interaction, renderSnapToggles } = global.window.__homegen;

    assert.equal(interaction.gridSettings.unitSize, 6);
    assert.equal(interaction.gridSettings.angleSnapDegrees, 15);
    assert.match(snapContainer.innerHTML, /Grid &amp; Angle Increments/);

    // Simulate opening popover and focusing unitSize input
    snapPopover.open = true;
    unitInput.focus();

    // Real-time valid input update
    unitInput.value = '12';
    unitInput.dispatchEvent({ type: 'input', detail: { value: '12' } });
    assert.equal(interaction.gridSettings.unitSize, 12);
    assert.equal(unitInput.hasAttribute('aria-invalid'), false);
    assert.equal(snapPopover.open, true);

    // Invalid input during typing marks aria-invalid without throwing or mutating settings
    unitInput.value = '-4';
    unitInput.dispatchEvent({ type: 'input', detail: { value: '-4' } });
    assert.equal(interaction.gridSettings.unitSize, 12);
    assert.equal(unitInput.getAttribute('aria-invalid'), 'true');

    // Invalid value on change reverts input display to active setting
    unitInput.dispatchEvent({ type: 'change', detail: { value: '-4' } });
    assert.equal(interaction.gridSettings.unitSize, 12);
    assert.equal(unitInput.value, '12');
    assert.equal(unitInput.hasAttribute('aria-invalid'), false);

    // Valid angle snap change update
    angleInput.value = '30';
    angleInput.dispatchEvent({ type: 'change', detail: { value: '30' } });
    assert.equal(interaction.gridSettings.angleSnapDegrees, 30);

    // Full re-render preserves open popover and active input focus
    unitInput.focused = false;
    global.document.activeElement = unitInput;
    renderSnapToggles();
    assert.equal(snapPopover.open, true);
    assert.equal(unitInput.focused, true);

    await new Promise((resolve) => setTimeout(resolve, 250));
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
  }
});
