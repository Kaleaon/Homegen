import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class {};
}

function setupMockEnvironment() {
  const elements = {};
  const windowListeners = {};
  const documentListeners = {};

  function createMockElement(id = '', tagName = 'DIV') {
    const listeners = {};
    const classes = new Set();
    const attributes = {};
    const element = {
      id,
      tagName: tagName.toUpperCase(),
      value: '',
      checked: true,
      disabled: false,
      hidden: id === 'history-popover' || id === 'diff-drawer',
      textContent: '',
      open: false,
      style: {},
      dataset: {},
      parentElement: null,
      children: [],
      _innerHTML: '',
      get innerHTML() {
        return element._innerHTML;
      },
      set innerHTML(html) {
        element._innerHTML = html;
        if (id === 'history-list') {
          const itemMatches = [
            ...html.matchAll(/<li\s+class="([^"]*)"\s+data-index="(\d+)"[^>]*tabindex="0"[^>]*>/g),
          ];
          element.children = itemMatches.map((m) => {
            const li = createMockElement(`history-item-${m[2]}`, 'LI');
            m[1]
              .split(/\s+/)
              .filter(Boolean)
              .forEach((c) => li.classList.add(c));
            li.dataset.index = m[2];
            li.setAttribute('tabindex', '0');
            li.parentElement = element;
            return li;
          });
        }
      },
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
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
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter((h) => h !== fn);
      },
      listenerCount: (evt) => (listeners[evt] ? listeners[evt].length : 0),
      dispatchEvent: (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        let stopped = false;
        const eventObj =
          typeof evt === 'string'
            ? {
                type,
                preventDefault: () => {},
                stopPropagation: () => {
                  stopped = true;
                },
              }
            : {
                preventDefault: () => {},
                ...evt,
                stopPropagation: () => {
                  stopped = true;
                  if (typeof evt.stopPropagation === 'function') evt.stopPropagation();
                },
              };
        if (listeners[type]) {
          for (const fn of [...listeners[type]]) {
            fn(eventObj);
          }
        }
        if (!stopped && element.parentElement) {
          element.parentElement.dispatchEvent(eventObj);
        }
        return eventObj;
      },
      click: () => element.dispatchEvent('click'),
      focus: () => {
        global.document.activeElement = element;
      },
      scrollIntoView: () => {},
      ...(tagName.toUpperCase() === 'DIALOG'
        ? {
            showModal: () => {
              element.open = true;
              element.setAttribute('open', '');
            },
            close: () => {
              element.open = false;
              element.removeAttribute('open');
              element.dispatchEvent('close');
            },
          }
        : {}),
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
      contains: (other) => {
        if (!other) return false;
        let cur = other;
        while (cur) {
          if (cur === element) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      querySelector: (selector) => {
        const matchIdx = selector.match(/^\.history-item\[data-index="(\d+)"\]$/);
        if (matchIdx) {
          return element.children.find((c) => c.dataset.index === matchIdx[1]) || null;
        }
        return null;
      },
      querySelectorAll: (selector) => {
        if (id === 'history-popover' && selector.includes('[tabindex]:not([tabindex="-1"])')) {
          const closeBtn = getEl('history-close', 'BUTTON');
          const listEl = getEl('history-list', 'UL');
          return [closeBtn, ...listEl.children];
        }
        if (id === 'history-list' && selector === '.history-item') {
          return [...element.children];
        }
        return [];
      },
    };
    return element;
  }

  function getEl(id, tag = 'DIV') {
    if (!elements[id]) elements[id] = createMockElement(id, tag);
    return elements[id];
  }

  const historyBtn = getEl('history-btn', 'K-BUTTON');
  historyBtn.setAttribute('aria-expanded', 'false');
  const historyPopover = getEl('history-popover', 'DIV');
  const historyClose = getEl('history-close', 'BUTTON');
  const historyList = getEl('history-list', 'UL');
  historyClose.parentElement = historyPopover;
  historyList.parentElement = historyPopover;

  global.document = {
    activeElement: createMockElement('body', 'BODY'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => {
      const id = s.replace(/^#/, '');
      return getEl(id);
    },
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(fn);
    },
  };

  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj = typeof evt === 'string' ? { type, preventDefault: () => {} } : evt;
      if (windowListeners[type]) {
        for (const fn of [...windowListeners[type]]) {
          fn(eventObj);
        }
      }
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });

  return {
    getEl,
    createMockElement,
    historyBtn,
    historyPopover,
    historyClose,
    historyList,
  };
}

test('history popover integrates trapFocus lifecycle for open, Tab cycling, dynamic updates, close button, and Escape', async () => {
  const { historyBtn, historyPopover, historyClose, historyList, createMockElement } =
    setupMockEnvironment();

  await import(`../js/app.js?t=${Date.now()}`);
  const homegen = global.window.__homegen;
  assert.ok(homegen, '__homegen must be initialized');

  // Initial state: popover hidden, trigger aria-expanded="false"
  assert.equal(historyPopover.hidden, true);
  assert.equal(historyBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(historyList.children.length, 1, 'Initial history timeline has 1 entry');

  // 1. Open popover via #history-btn click -> traps focus on #history-close
  historyBtn.focus();
  historyBtn.click();
  assert.equal(historyPopover.hidden, false);
  assert.equal(historyBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(global.document.activeElement, historyClose);
  assert.equal(historyPopover.listenerCount('keydown'), 1);

  // 2. Shift+Tab on #history-close wraps to last history item
  let prevented = false;
  historyClose.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(global.document.activeElement, historyList.children[0]);

  // 3. Dynamic item update while popover is open -> Tab order picks up newly added item
  homegen.apply((n) => {
    n.name = 'Updated Plan Name';
  }, 'Rename Plan');
  assert.equal(historyList.children.length, 2, 'History timeline updated dynamically while open');

  // Focus first item and press Tab -> should NOT wrap yet because a 2nd item now exists
  historyList.children[0].focus();
  prevented = false;
  historyList.children[0].dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, false, 'Tab on non-last item lets browser advance to newly added item');

  // Focus newly added last item and press Tab -> wraps back to #history-close
  historyList.children[1].focus();
  prevented = false;
  historyList.children[1].dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true, 'Tab on dynamically added last item wraps to first element');
  assert.equal(global.document.activeElement, historyClose);

  // 4. Close via #history-close button -> cleans up listener and returns focus to #history-btn
  historyClose.click();
  assert.equal(historyPopover.hidden, true);
  assert.equal(historyBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(historyPopover.listenerCount('keydown'), 0);
  assert.equal(global.document.activeElement, historyBtn);

  // 5. Re-open and close via Escape inside #history-popover -> returns focus to #history-btn
  historyBtn.click();
  assert.equal(historyPopover.hidden, false);
  assert.equal(global.document.activeElement, historyClose);

  historyClose.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault: () => {},
  });
  assert.equal(historyPopover.hidden, true);
  assert.equal(historyBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(historyPopover.listenerCount('keydown'), 0);
  assert.equal(global.document.activeElement, historyBtn);

  // 6. Re-open, move focus outside, and press Escape on window -> cleans up and returns focus to #history-btn
  historyBtn.click();
  assert.equal(historyPopover.hidden, false);
  assert.equal(historyPopover.listenerCount('keydown'), 1);
  const outsideEl = createMockElement('stage', 'SECTION');
  outsideEl.focus();
  global.window.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault: () => {},
  });
  assert.equal(historyPopover.hidden, true);
  assert.equal(historyBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(historyPopover.listenerCount('keydown'), 0);
  assert.equal(global.document.activeElement, historyBtn);

  // 7. Empty #history-list edge case: focus moves to #history-close and stays trapped on Tab / Shift+Tab
  historyList.innerHTML = '';
  assert.equal(historyList.children.length, 0);
  historyBtn.click();
  assert.equal(historyPopover.hidden, false);
  assert.equal(global.document.activeElement, historyClose);

  prevented = false;
  historyClose.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(global.document.activeElement, historyClose);

  prevented = false;
  historyClose.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(global.document.activeElement, historyClose);

  // Close by toggling #history-btn again -> cleans up and returns focus to #history-btn
  historyBtn.click();
  assert.equal(historyPopover.hidden, true);
  assert.equal(historyBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(historyPopover.listenerCount('keydown'), 0);
  assert.equal(global.document.activeElement, historyBtn);
});

test('KButton delegates focus() and blur() to internal shadow button', async () => {
  if (typeof customElements === 'undefined') {
    const registry = new Map();
    global.customElements = {
      define: (name, constructor) => registry.set(name, constructor),
      get: (name) => registry.get(name),
    };
  }
  await import(`../js/k-components.js?t=${Date.now()}`);
  const KButton = customElements.get('k-button');
  assert.ok(KButton, 'k-button custom element must be registered');
  let focused = false;
  let blurred = false;
  const inst = Object.create(KButton.prototype);
  inst._btn = {
    focus: () => {
      focused = true;
    },
    blur: () => {
      blurred = true;
    },
  };
  inst.focus();
  assert.equal(focused, true, 'KButton.focus() delegates to internal shadow button');
  inst.blur();
  assert.equal(blurred, true, 'KButton.blur() delegates to internal shadow button');
});
