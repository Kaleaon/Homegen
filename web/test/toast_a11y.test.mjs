import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockNode(tagName = 'DIV', id = '') {
  const listeners = {};
  const classes = new Set();
  const attrs = {};
  const children = [];

  const node = {
    id,
    tagName: tagName.toUpperCase(),
    type: '',
    hidden: false,
    style: {},
    parentNode: null,
    children,
    listenerCounts: {},
    focusCount: 0,
    _className: '',
    get className() {
      return this._className;
    },
    set className(val) {
      this._className = String(val || '');
      classes.clear();
      this._className
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c));
      attrs.class = this._className;
    },
    _textContent: '',
    get textContent() {
      if (children.length > 0) {
        return children.map((c) => c.textContent).join('');
      }
      return this._textContent;
    },
    set textContent(val) {
      this._textContent = String(val ?? '');
      children.forEach((c) => {
        c.parentNode = null;
      });
      children.length = 0;
    },
    classList: {
      add: (c) => {
        classes.add(c);
        node._className = [...classes].join(' ');
      },
      remove: (c) => {
        classes.delete(c);
        node._className = [...classes].join(' ');
      },
      toggle: (c, force) => {
        const shouldAdd = force === undefined ? !classes.has(c) : Boolean(force);
        if (shouldAdd) classes.add(c);
        else classes.delete(c);
        node._className = [...classes].join(' ');
        return shouldAdd;
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attrs[name] = String(val);
      if (name === 'class') node.className = val;
      if (name === 'id') node.id = String(val);
      if (name === 'type') node.type = String(val);
    },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    removeAttribute: (name) => {
      delete attrs[name];
    },
    hasAttribute: (name) => name in attrs,
    appendChild: (child) => {
      child.parentNode = node;
      children.push(child);
      return child;
    },
    contains: (other) => {
      let cur = other;
      while (cur) {
        if (cur === node) return true;
        cur = cur.parentNode;
      }
      return false;
    },
    querySelector: (selector) => {
      const match = (el) => {
        if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
        if (selector.startsWith('#')) return el.id === selector.slice(1);
        return el.tagName === selector.toUpperCase();
      };
      const walk = (list) => {
        for (const child of list) {
          if (match(child)) return child;
          const nested = walk(child.children || []);
          if (nested) return nested;
        }
        return null;
      };
      return walk(children);
    },
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
      node.listenerCounts[evt] = listeners[evt].length;
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj =
        typeof evt === 'string'
          ? { type, preventDefault() {}, stopPropagation() {} }
          : {
              preventDefault() {},
              stopPropagation() {},
              ...evt,
            };
      if (listeners[type]) {
        for (const fn of [...listeners[type]]) {
          fn(eventObj);
        }
      }
    },
    click: () => node.dispatchEvent({ type: 'click' }),
    focus: () => {
      node.focusCount += 1;
      if (global.document) global.document.activeElement = node;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: () =>
      new Proxy(
        {
          canvas: node,
          measureText: () => ({ width: 0 }),
          createLinearGradient: () => ({ addColorStop() {} }),
          createPattern: () => ({}),
        },
        {
          get(target, prop) {
            return prop in target ? target[prop] : () => {};
          },
        }
      ),
  };

  if (id) attrs.id = id;
  return node;
}

function setupMockDom({ populateToastChildren = true } = {}) {
  const elements = {};
  const getEl = (id, tag = 'DIV') => {
    if (!elements[id]) elements[id] = createMockNode(tag, id);
    return elements[id];
  };

  const body = getEl('body', 'BODY');
  const stage = getEl('stage', 'SECTION');
  const plan = getEl('plan', 'CANVAS');
  const toastEl = getEl('toast', 'DIV');
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.style.display = 'none';

  if (populateToastChildren) {
    const msgSpan = createMockNode('SPAN');
    msgSpan.className = 'toast-msg';
    const dismissBtn = createMockNode('BUTTON');
    dismissBtn.type = 'button';
    dismissBtn.className = 'toast-dismiss';
    dismissBtn.setAttribute('type', 'button');
    dismissBtn.setAttribute('aria-label', 'Dismiss notification');
    const iconSpan = createMockNode('SPAN');
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = '✕';
    dismissBtn.appendChild(iconSpan);
    toastEl.appendChild(msgSpan);
    toastEl.appendChild(dismissBtn);
  }

  global.document = {
    body,
    activeElement: body,
    createElement: (tag) => createMockNode(tag),
    getElementById: (id) => getEl(id),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return getEl(sel.slice(1));
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  global.window = {
    addEventListener: () => {},
    location: { href: '' },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem: () => {} },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };

  Object.defineProperty(global, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });

  return { elements, getEl, body, stage, plan, toastEl };
}

test('style.css defines accessible .toast-dismiss button sizing and focus-visible ring', () => {
  const cssPath = path.join(__dirname, '../css/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#toast .toast-msg'), 'style.css must style #toast .toast-msg');
  assert.ok(css.includes('#toast .toast-dismiss'), 'style.css must style #toast .toast-dismiss');
  assert.ok(
    css.includes('#toast .toast-dismiss:focus-visible'),
    'style.css must define :focus-visible outline for .toast-dismiss'
  );
  const dismissBlock = css.match(/#toast\s+\.toast-dismiss\s*\{[^}]+\}/)?.[0] || '';
  assert.match(dismissBlock, /min-width:\s*24px/, '.toast-dismiss meets 24px minimum target width');
  assert.match(
    dismissBlock,
    /min-height:\s*24px/,
    '.toast-dismiss meets 24px minimum target height'
  );
});

test('toast() dynamically toggles ARIA role and aria-live attributes between error and status modes', async () => {
  const { toastEl } = setupMockDom({ populateToastChildren: false });
  const { toast, dismissToast } = await import(`../js/app.js?toastTest=${Date.now()}`);

  // Empty #toast should dynamically receive .toast-msg and .toast-dismiss
  toast('Error message', true);

  assert.equal(toastEl.getAttribute('role'), 'alert');
  assert.equal(toastEl.getAttribute('aria-live'), 'assertive');
  assert.equal(toastEl.className, 'err');
  assert.notEqual(toastEl.style.display, 'none');

  const msgEl = toastEl.querySelector('.toast-msg');
  const dismissBtn = toastEl.querySelector('.toast-dismiss');
  assert.ok(msgEl, '.toast-msg should be dynamically created inside #toast');
  assert.ok(dismissBtn, '.toast-dismiss should be dynamically created inside #toast');
  assert.equal(msgEl.textContent, 'Error message');
  assert.equal(dismissBtn.getAttribute('type'), 'button');
  assert.equal(dismissBtn.getAttribute('aria-label'), 'Dismiss notification');

  // Subsequent non-error status toast resets role="status" and aria-live="polite"
  toast('Plan saved successfully.', false, 200);
  assert.equal(toastEl.getAttribute('role'), 'status');
  assert.equal(toastEl.getAttribute('aria-live'), 'polite');
  assert.equal(toastEl.className, '');
  assert.equal(msgEl.textContent, 'Plan saved successfully.');

  dismissToast();
});

test('error notifications remain persistent and do not auto-dismiss', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { toastEl } = setupMockDom();
  const { toast, dismissToast } = await import(`../js/app.js?toastErrPersist=${Date.now()}`);

  toast('Cannot export PDF: add at least one room first.', true);
  assert.equal(toastEl.getAttribute('role'), 'alert');
  assert.equal(toastEl.getAttribute('aria-live'), 'assertive');
  assert.equal(toastEl.style.display, 'flex');

  // Advance well beyond default 4500ms timeout
  t.mock.timers.tick(60_000);
  assert.equal(toastEl.style.display, 'flex', 'Error toast must remain open past 60s');

  // Even when a caller passes an explicit ms argument with err=true, it stays persistent
  toast('Add a room first.', true, 2000);
  t.mock.timers.tick(10_000);
  assert.equal(
    toastEl.style.display,
    'flex',
    'Error toast with explicit ms must also remain persistent until dismissed'
  );

  dismissToast();
  assert.equal(toastEl.style.display, 'none');
});

test('status notifications pause auto-dismiss timer on mouse hover and keyboard focus', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { toastEl } = setupMockDom();
  const { toast } = await import(`../js/app.js?toastPause=${Date.now()}`);

  // 1. Hover pause & resume
  toast('Moved Sofa in Living Room', false, 1000);
  assert.equal(toastEl.style.display, 'flex');

  // Advance 400ms (600ms remaining), then hover
  t.mock.timers.tick(400);
  toastEl.dispatchEvent({ type: 'mouseenter' });

  // Advance 5000ms while hovered — should stay visible
  t.mock.timers.tick(5000);
  assert.equal(toastEl.style.display, 'flex', 'Status toast must stay visible while hovered');

  // Mouse leaves — should dismiss after ~600ms remaining
  toastEl.dispatchEvent({ type: 'mouseleave' });
  t.mock.timers.tick(500);
  assert.equal(toastEl.style.display, 'flex', 'Still visible with 100ms remaining after resume');
  t.mock.timers.tick(150);
  assert.equal(toastEl.style.display, 'none', 'Auto-dismissed after remaining duration elapsed');

  // 2. Keyboard focus pause & resume (including overlapping hover + focus)
  toast('Rotated Sofa to 90°', false, 1000);
  const dismissBtn = toastEl.querySelector('.toast-dismiss');
  t.mock.timers.tick(300); // 700ms remaining

  toastEl.dispatchEvent({ type: 'focusin' });
  t.mock.timers.tick(4000);
  assert.equal(toastEl.style.display, 'flex', 'Status toast must stay visible while focused');

  // Focus moving within #toast keeps timer paused
  toastEl.dispatchEvent({ type: 'focusout', relatedTarget: dismissBtn });
  t.mock.timers.tick(2000);
  assert.equal(
    toastEl.style.display,
    'flex',
    'Moving focus inside #toast must not prematurely resume timer'
  );

  // Also hover while focused, then blur out — still hovered, so remains paused
  toastEl.dispatchEvent({ type: 'mouseenter' });
  toastEl.dispatchEvent({ type: 'focusout', relatedTarget: null });
  t.mock.timers.tick(2000);
  assert.equal(
    toastEl.style.display,
    'flex',
    'Toast remains paused while pointer hover is still active'
  );

  // Finally mouseleave — resumes remaining ~700ms
  toastEl.dispatchEvent({ type: 'mouseleave' });
  t.mock.timers.tick(650);
  assert.equal(toastEl.style.display, 'flex');
  t.mock.timers.tick(100);
  assert.equal(toastEl.style.display, 'none');
});

test('dismiss button click and Escape key hide toast and return focus cleanly', async () => {
  const { toastEl, getEl, plan } = setupMockDom();
  const { toast } = await import(`../js/app.js?toastDismiss=${Date.now()}`);
  const dismissBtn = toastEl.querySelector('.toast-dismiss');
  const exportBtn = getEl('export-pdf', 'BUTTON');

  // Focus originates on #export-pdf before error toast opens
  exportBtn.focus();
  assert.equal(global.document.activeElement, exportBtn);

  toast('Cannot export PDF: add at least one room first.', true);
  assert.equal(toastEl.style.display, 'flex');

  // User focuses dismiss button and clicks it
  dismissBtn.focus();
  const prevFocusCount = exportBtn.focusCount;
  dismissBtn.click();

  assert.equal(toastEl.style.display, 'none', 'Clicking .toast-dismiss hides #toast');
  assert.equal(
    exportBtn.focusCount,
    prevFocusCount + 1,
    'Clicking .toast-dismiss returns focus to triggering control'
  );
  assert.equal(global.document.activeElement, exportBtn);

  // Pressing Escape on .toast-dismiss stops propagation, hides toast, and restores fallback focus when origin was body
  global.document.activeElement = getEl('body', 'BODY');
  toast('Failed to parse GeoJSON', true);
  dismissBtn.focus();

  let defaultPrevented = false;
  let propagationStopped = false;
  dismissBtn.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
  });

  assert.equal(toastEl.style.display, 'none', 'Escape key on .toast-dismiss hides #toast');
  assert.equal(defaultPrevented, true, 'Escape key calls preventDefault');
  assert.equal(propagationStopped, true, 'Escape key calls stopPropagation');
  assert.equal(global.document.activeElement, plan, 'Fallback focus returns to #plan canvas');

  // Shadow DOM custom element host (e.g. <k-button>) focus restoration delegates to inner button
  const kBtnHost = getEl('save', 'K-BUTTON');
  const shadowInnerBtn = createMockNode('BUTTON');
  kBtnHost.shadowRoot = {
    querySelector: () => shadowInnerBtn,
  };
  global.document.activeElement = kBtnHost;
  toast('Failed to save plan', true);
  dismissBtn.focus();
  dismissBtn.click();
  assert.equal(
    shadowInnerBtn.focusCount,
    1,
    'Focus returns cleanly to inner focusable control of Shadow DOM host'
  );
});

test('rapid consecutive calls to toast() clear pending pause timers and avoid duplicate listeners', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { toastEl } = setupMockDom();
  const { toast } = await import(`../js/app.js?toastRapid=${Date.now()}`);
  const dismissBtn = toastEl.querySelector('.toast-dismiss');

  toast('First status', false, 500);
  toastEl.dispatchEvent({ type: 'mouseenter' }); // Pause first status
  t.mock.timers.tick(200);
  toastEl.dispatchEvent({ type: 'mouseleave' });

  // Immediately fire error toast, then status toast
  toast('Critical error', true);
  assert.equal(toastEl.getAttribute('role'), 'alert');
  assert.equal(toastEl.getAttribute('aria-live'), 'assertive');

  toast('Final status', false, 1000);
  assert.equal(toastEl.getAttribute('role'), 'status');
  assert.equal(toastEl.getAttribute('aria-live'), 'polite');
  assert.equal(toastEl.querySelector('.toast-msg').textContent, 'Final status');

  // Verify listeners were bound only once across rapid calls
  assert.equal(toastEl.listenerCounts.mouseenter, 1);
  assert.equal(toastEl.listenerCounts.mouseleave, 1);
  assert.equal(toastEl.listenerCounts.focusin, 1);
  assert.equal(toastEl.listenerCounts.focusout, 1);
  assert.equal(dismissBtn.listenerCounts.click, 1);

  // Earlier 500ms timer must NOT prematurely close the 1000ms Final status toast
  t.mock.timers.tick(600);
  assert.equal(toastEl.style.display, 'flex', 'Cleared earlier timer must not close newer toast');

  t.mock.timers.tick(450);
  assert.equal(toastEl.style.display, 'none', 'Newer toast closes at its own 1000ms duration');
});
