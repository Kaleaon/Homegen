import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('HTML dialogs and diff-drawer have accessible ARIA names and roles in index.html', () => {
  // dlg-export
  assert.match(
    htmlContent,
    /<dialog id="dlg-export" aria-labelledby="dlg-export-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="dlg-export-title">SVG Vector Export &amp; Print Sheet<\/h2>/);
  assert.match(
    htmlContent,
    /<button value="close" aria-label="Close SVG export modal"><span aria-hidden="true">✕<\/span><\/button>/
  );

  // pdf-export
  assert.match(
    htmlContent,
    /<dialog id="pdf-export" aria-labelledby="pdf-export-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="pdf-export-title">Export Scaled Vector PDF<\/h2>/);
  assert.match(
    htmlContent,
    /<button value="close" aria-label="Close PDF export modal"><span aria-hidden="true">✕<\/span><\/button>/
  );

  // calib-dlg
  assert.match(
    htmlContent,
    /<dialog id="calib-dlg" aria-labelledby="calib-dlg-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="calib-dlg-title">Calibrate Blueprint Scale<\/h2>/);
  assert.match(
    htmlContent,
    /<button type="button" id="calib-close" aria-label="Close scale calibration modal">✕<\/button>/
  );

  // diff-drawer
  assert.match(
    htmlContent,
    /<div id="diff-drawer" class="diff-drawer k-overlay-drawer" role="dialog" aria-modal="true" aria-labelledby="diff-drawer-title" hidden>/
  );
  assert.match(htmlContent, /<h2 id="diff-drawer-title">✨ Auto-Fix Summary<\/h2>/);
  assert.match(
    htmlContent,
    /<button id="diff-close" class="diff-close-btn" title="Dismiss highlights" aria-label="Dismiss highlights">✕<\/button>/
  );
});

test('app.js exports trapFocus and binds focus trapping to overlays', () => {
  assert.ok(appJsContent.includes('function trapFocus('), 'app.js must define trapFocus');
  assert.ok(appJsContent.includes('trapFocus(dlg,'), 'app.js must trap focus in dialogs');
  assert.ok(appJsContent.includes('trapFocus(drawer,'), 'app.js must trap focus in diff-drawer');
});

test('index.html defines reusable #dlg-confirm modal with Ktheme overlay class and ARIA attributes', () => {
  assert.match(
    htmlContent,
    /<dialog id="dlg-confirm" aria-labelledby="dlg-confirm-title" aria-describedby="dlg-confirm-msg" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="dlg-confirm-title">Confirm Action<\/h2>/);
  assert.match(
    htmlContent,
    /<button value="close" id="dlg-confirm-close" aria-label="Close confirmation modal"><span aria-hidden="true">✕<\/span><\/button>/
  );
  assert.match(htmlContent, /<p id="dlg-confirm-msg" class="confirm-msg"><\/p>/);
  assert.match(htmlContent, /<button id="dlg-confirm-cancel" type="button">Cancel<\/button>/);
  assert.match(
    htmlContent,
    /<button id="dlg-confirm-ok" class="primary" type="button">Confirm<\/button>/
  );

  // Verify synchronous confirm() calls are replaced in selectTemplate and blueprint removal
  assert.doesNotMatch(
    appJsContent,
    /if\s*\(\s*!confirm\(/,
    'selectTemplate must not use synchronous confirm()'
  );
  assert.doesNotMatch(
    appJsContent,
    /if\s*\(\s*confirm\(/,
    'blueprint removal must not use synchronous confirm()'
  );
});

function createConfirmTestHarness() {
  const elements = {};
  const windowListeners = {};
  const documentListeners = {};

  function makeElement(id, tagName = 'DIV') {
    const listeners = {};
    const classes = new Set();
    const attrs = {};
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      value: '',
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      open: false,
      style: {},
      dataset: {},
      showModalCalls: 0,
      closeCalls: 0,
      children: [],
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, force) => {
          const shouldHave = force === undefined ? !classes.has(c) : Boolean(force);
          if (shouldHave) classes.add(c);
          else classes.delete(c);
          return shouldHave;
        },
        contains: (c) => classes.has(c),
      },
      setAttribute: (name, val) => {
        attrs[name] = String(val);
        if (name === 'open') el.open = true;
      },
      getAttribute: (name) => (name in attrs ? attrs[name] : null),
      removeAttribute: (name) => {
        delete attrs[name];
        if (name === 'open') el.open = false;
      },
      hasAttribute: (name) => name in attrs,
      addEventListener: (evt, fn, opts) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push({ fn, once: Boolean(opts && opts.once) });
      },
      removeEventListener: (evt, fn) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter((entry) => entry.fn !== fn);
      },
      dispatchEvent: (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        const eventObj =
          typeof evt === 'string'
            ? { type, preventDefault() {}, stopPropagation() {} }
            : { preventDefault() {}, stopPropagation() {}, ...evt };
        const entries = [...(listeners[type] || [])];
        for (const entry of entries) {
          if (entry.once) {
            el.removeEventListener(type, entry.fn);
          }
          entry.fn(eventObj);
        }
      },
      click: () => el.dispatchEvent('click'),
      focus: () => {
        global.document.activeElement = el;
      },
      showModal: () => {
        el.showModalCalls += 1;
        el.open = true;
        el.hidden = false;
        el.setAttribute('open', '');
      },
      close: () => {
        el.closeCalls += 1;
        const wasOpen = el.open;
        el.open = false;
        el.removeAttribute('open');
        if (wasOpen) {
          el.dispatchEvent('close');
        }
      },
      closest: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      getContext: () =>
        new Proxy(
          {
            canvas: el,
            measureText: () => ({ width: 10 }),
            createLinearGradient: () => ({ addColorStop() {} }),
            createPattern: () => ({}),
          },
          {
            get(target, prop) {
              if (prop in target) return target[prop];
              return () => {};
            },
          }
        ),
      querySelector: (sel) => {
        if (sel.startsWith('#')) return getEl(sel.slice(1));
        return null;
      },
      querySelectorAll: () => (el.focusables ? [...el.focusables] : []),
    };
    return el;
  }

  function getEl(id, tagName = 'DIV') {
    if (!elements[id]) {
      elements[id] = makeElement(id, tagName);
    }
    return elements[id];
  }

  const dlg = getEl('dlg-confirm', 'DIALOG');
  const titleEl = getEl('dlg-confirm-title', 'H2');
  const msgEl = getEl('dlg-confirm-msg', 'P');
  const closeBtn = getEl('dlg-confirm-close', 'BUTTON');
  const cancelBtn = getEl('dlg-confirm-cancel', 'BUTTON');
  const okBtn = getEl('dlg-confirm-ok', 'BUTTON');
  okBtn.classList.add('primary');
  dlg.focusables = [closeBtn, cancelBtn, okBtn];

  const dlgTemplates = getEl('dlg-templates', 'DIALOG');
  const bgToolbar = getEl('bg-toolbar', 'SPAN');
  const bgRemoveBtn = getEl('bg-remove-btn', 'BUTTON');
  const selectToolBtn = makeElement('tool-select', 'BUTTON');

  const bodyEl = makeElement('body', 'BODY');
  global.document = {
    activeElement: bodyEl,
    getElementById: (id) => getEl(id),
    querySelector: (sel) => {
      if (sel === '[data-tool="select"]') return selectToolBtn;
      if (sel.startsWith('#')) return getEl(sel.slice(1));
      return getEl(sel);
    },
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(fn);
    },
    removeEventListener: () => {},
    createElement: (tag) => makeElement(tag, tag),
  };

  const storage = new Map();
  const mockLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  global.localStorage = mockLocalStorage;
  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj =
        typeof evt === 'string'
          ? { type, preventDefault() {}, stopPropagation() {} }
          : { preventDefault() {}, stopPropagation() {}, ...evt };
      for (const fn of windowListeners[type] || []) {
        fn(eventObj);
      }
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    localStorage: mockLocalStorage,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  try {
    global.navigator = global.window.navigator;
  } catch {
    Object.defineProperty(global, 'navigator', {
      value: global.window.navigator,
      configurable: true,
      writable: true,
    });
  }

  return {
    getEl,
    makeElement,
    dlg,
    titleEl,
    msgEl,
    closeBtn,
    cancelBtn,
    okBtn,
    dlgTemplates,
    bgToolbar,
    bgRemoveBtn,
    selectToolBtn,
  };
}

test('confirmDialog resolves Promise on confirm/cancel, manages focus trap, and restores focus', async () => {
  const h = createConfirmTestHarness();
  const triggerBtn = h.makeElement('trigger-btn', 'BUTTON');
  triggerBtn.focus();

  await import(`../js/app.js?t=${Date.now()}`);
  const { confirmDialog } = global.window.__homegen;
  assert.equal(typeof confirmDialog, 'function', 'confirmDialog must be exposed');

  // 1. Confirm flow
  const confirmPromise = confirmDialog({
    title: 'Delete Item?',
    message: 'Are you sure you want to remove this item?',
    confirmLabel: 'Delete',
    cancelLabel: 'Keep',
    danger: true,
  });

  assert.equal(h.dlg.open, true, 'dlg-confirm should open via showModal');
  assert.equal(h.titleEl.textContent, 'Delete Item?');
  assert.equal(h.msgEl.textContent, 'Are you sure you want to remove this item?');
  assert.equal(h.okBtn.textContent, 'Delete');
  assert.equal(h.cancelBtn.textContent, 'Keep');
  assert.equal(h.okBtn.classList.contains('danger'), true, 'danger variant class applied');
  assert.equal(global.document.activeElement, h.cancelBtn, 'initial focus placed on cancel button');

  // Verify Tab wrapping from last focusable element (okBtn) to first (closeBtn)
  h.okBtn.focus();
  let tabPrevented = false;
  h.dlg.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => {
      tabPrevented = true;
    },
  });
  assert.equal(tabPrevented, true, 'Tab at end of dialog must wrap focus');
  assert.equal(global.document.activeElement, h.closeBtn, 'Focus wraps to first focusable element');

  // Verify Shift+Tab wrapping from first focusable element (closeBtn) to last (okBtn)
  let shiftTabPrevented = false;
  h.dlg.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => {
      shiftTabPrevented = true;
    },
  });
  assert.equal(shiftTabPrevented, true, 'Shift+Tab at start of dialog must wrap focus');
  assert.equal(global.document.activeElement, h.okBtn, 'Focus wraps to last focusable element');

  h.okBtn.click();
  const confirmed = await confirmPromise;
  assert.equal(confirmed, true, 'Confirm button resolves Promise to true');
  assert.equal(h.dlg.open, false, 'Dialog closes after confirmation');
  assert.equal(global.document.activeElement, triggerBtn, 'Focus returns to trigger element');

  // 2. Cancel button flow
  triggerBtn.focus();
  const cancelPromise = confirmDialog({
    title: 'Replace Plan?',
    message: 'Unsaved changes will be lost.',
  });
  assert.equal(h.okBtn.classList.contains('primary'), true, 'primary class restored when !danger');
  assert.equal(h.okBtn.classList.contains('danger'), false);
  h.cancelBtn.click();
  assert.equal(await cancelPromise, false, 'Cancel button resolves Promise to false');
  assert.equal(h.dlg.open, false);
  assert.equal(global.document.activeElement, triggerBtn, 'Focus returns to trigger after cancel');

  // 3. Header close (✕) button flow
  triggerBtn.focus();
  const closePromise = confirmDialog({ message: 'Close via header X?' });
  h.closeBtn.click();
  assert.equal(await closePromise, false, 'Header close button resolves Promise to false');
  assert.equal(h.dlg.open, false);
  assert.equal(global.document.activeElement, triggerBtn);
});

test('confirmDialog ESC dismissal resolves false without mutating active document state and handles rapid duplicate triggers', async () => {
  const h = createConfirmTestHarness();
  await import(`../js/app.js?t=${Date.now() + 1}`);
  const homegen = global.window.__homegen;

  // Populate active document with starter home + selection + background
  homegen.sampleHome();
  const initialRoomCount = homegen.doc.rooms.length;
  assert.ok(initialRoomCount > 0, 'Sample home has rooms');
  const firstRoomId = homegen.doc.rooms[0].id;
  homegen.select(firstRoomId);
  homegen.doc.background = {
    dataUrl: 'data:image/png;base64,dummy',
    x: 0,
    y: 0,
    scale: 1,
    opacity: 0.5,
    visible: true,
    locked: false,
  };

  const triggerBtn = h.makeElement('esc-trigger', 'BUTTON');
  triggerBtn.focus();

  // Press Escape while confirmDialog is active (both on dialog and global window listener)
  const escPromise = homegen.confirmDialog({
    title: 'Discard?',
    message: 'Discard active changes?',
  });
  assert.equal(h.dlg.open, true);

  // Dispatch global keydown Escape while dialog is open -> should close dialog, NOT clear selection
  global.window.dispatchEvent({ type: 'keydown', key: 'Escape' });
  const escResult = await escPromise;

  assert.equal(escResult, false, 'Escape resolves confirmDialog Promise to false');
  assert.equal(h.dlg.open, false, 'Dialog closed on Escape');
  assert.equal(homegen.doc.rooms.length, initialRoomCount, 'Active rooms untouched on Escape');
  assert.ok(homegen.doc.background, 'Active blueprint background untouched on Escape');
  assert.equal(homegen.isSelected(firstRoomId), true, 'Active selection preserved on Escape');
  assert.equal(global.document.activeElement, triggerBtn, 'Focus restored to trigger on Escape');

  // Rapid duplicate triggers reuse active modal without calling showModal twice or leaving dangling Promises
  const baseShowModalCalls = h.dlg.showModalCalls;
  triggerBtn.focus();

  const p1 = homegen.confirmDialog({
    title: 'First Prompt',
    message: 'First rapid trigger',
    confirmLabel: 'First OK',
  });
  const p2 = homegen.confirmDialog({
    title: 'Second Prompt',
    message: 'Second rapid trigger',
    confirmLabel: 'Second OK',
  });

  assert.equal(
    h.dlg.showModalCalls - baseShowModalCalls,
    1,
    'Rapid duplicate trigger must reuse open modal without redundant showModal() call'
  );
  assert.equal(h.titleEl.textContent, 'Second Prompt', 'Modal updates to latest prompt title');
  assert.equal(h.msgEl.textContent, 'Second rapid trigger', 'Modal updates to latest message');
  assert.equal(await p1, false, 'Superseded first Promise settles immediately to false');

  h.okBtn.click();
  assert.equal(await p2, true, 'Active second Promise resolves to true on confirmation');
  assert.equal(h.dlg.open, false, 'Modal closes cleanly');
  assert.equal(
    global.document.activeElement,
    triggerBtn,
    'Original trigger focus preserved across rapid duplicate calls'
  );
});

test('selectTemplate and blueprint removal workflows await confirmDialog before mutating state', async () => {
  const h = createConfirmTestHarness();
  await import(`../js/app.js?t=${Date.now() + 2}`);
  const homegen = global.window.__homegen;

  // 1. Template selection workflow with existing rooms
  homegen.sampleHome();
  const initialRoomCount = homegen.doc.rooms.length;
  h.dlgTemplates.showModal();

  // Start selectTemplate('studio') -> pauses at confirmDialog
  const cancelTemplateFlow = homegen.selectTemplate('studio');
  assert.equal(h.dlg.open, true, 'selectTemplate opens #dlg-confirm when rooms exist');
  assert.match(h.msgEl.textContent, /Unsaved changes in your active plan will be replaced/);

  // Dismiss via Escape -> plan and template picker remain intact
  h.dlg.dispatchEvent({ type: 'keydown', key: 'Escape' });
  const cancelOutcome = await cancelTemplateFlow;
  assert.equal(cancelOutcome, false);
  assert.equal(homegen.doc.rooms.length, initialRoomCount, 'Cancelling keeps existing plan rooms');
  assert.equal(h.dlgTemplates.open, true, '#dlg-templates remains open when confirmation cancels');

  // Trigger selectTemplate('studio') again and confirm -> replaces plan and closes #dlg-templates
  const confirmTemplateFlow = homegen.selectTemplate('studio');
  assert.equal(h.dlg.open, true);
  h.okBtn.click();
  const confirmOutcome = await confirmTemplateFlow;
  assert.equal(confirmOutcome, true);
  assert.notEqual(
    homegen.doc.rooms.length,
    initialRoomCount,
    'Confirming replaces plan with selected starter template'
  );
  assert.equal(h.dlgTemplates.open, false, '#dlg-templates closes after template replacement');

  // 2. Blueprint removal workflow via #bg-remove-btn
  homegen.doc.background = {
    dataUrl: 'data:image/png;base64,blueprint',
    x: 10,
    y: 20,
    scale: 1,
    opacity: 0.6,
    visible: true,
    locked: false,
  };
  h.bgToolbar.hidden = false;
  h.bgRemoveBtn.focus();

  // Click #bg-remove-btn and cancel -> background preserved
  h.bgRemoveBtn.click();
  assert.equal(h.dlg.open, true, '#bg-remove-btn opens #dlg-confirm');
  assert.equal(h.msgEl.textContent, 'Remove blueprint image?');
  h.cancelBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(homegen.doc.background, 'Cancelling confirmation preserves blueprint background');

  // Click #bg-remove-btn and confirm -> background removed
  h.bgRemoveBtn.click();
  assert.equal(h.dlg.open, true);
  h.okBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(homegen.doc.background, null, 'Confirming removes blueprint background');
});
