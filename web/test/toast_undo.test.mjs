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

function createRichMockElement(id = '', tagName = 'DIV') {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  let _textContent = '';

  const element = {
    id,
    tagName: tagName.toUpperCase(),
    type: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    open: false,
    title: '',
    innerHTML: '',
    style: {},
    dataset: {},
    children: [],
    get firstChild() {
      return element.children[0] || null;
    },
    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      String(val || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c));
    },
    get textContent() {
      if (element.children.length > 0) {
        return element.children.map((c) => c.textContent).join('');
      }
      return _textContent;
    },
    set textContent(val) {
      element.children = [];
      _textContent = String(val ?? '');
    },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    replaceChildren: (...nodes) => {
      element.children = [...nodes];
      _textContent = '';
    },
    appendChild: (child) => {
      element.children.push(child);
      return child;
    },
    removeChild: (child) => {
      const idx = element.children.indexOf(child);
      if (idx !== -1) element.children.splice(idx, 1);
      return child;
    },
    setAttribute: (name, val) => {
      attributes[name] = val;
      if (name === 'open') element.open = true;
    },
    getAttribute: (name) => attributes[name] ?? null,
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
      const eventObj =
        typeof evt === 'string'
          ? { type, preventDefault: () => {}, currentTarget: element, target: element }
          : evt;
      if (listeners[type]) listeners[type].forEach((fn) => fn(eventObj));
    },
    click: () => {
      if (element.disabled) return;
      element.dispatchEvent('click');
    },
    focus: () => {},
    scrollIntoView: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    closest: () => null,
    getContext: () =>
      new Proxy(
        {
          canvas: { width: 800, height: 600 },
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
    querySelector: (selector) => {
      for (const child of element.children) {
        if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) return child;
        if (selector.startsWith('#') && child.id === selector.slice(1)) return child;
        if (child.tagName.toLowerCase() === selector.toLowerCase()) return child;
        const nested = child.querySelector?.(selector);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll: (selector) => {
      const matches = [];
      for (const child of element.children) {
        if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
          matches.push(child);
        } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
          matches.push(child);
        }
      }
      return matches;
    },
  };
  return element;
}

function setupAppTestEnv() {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) {
      const el = createRichMockElement(id);
      let rawHtml = '';
      Object.defineProperty(el, 'innerHTML', {
        get: () => rawHtml,
        set: (val) => {
          rawHtml = String(val ?? '');
          // Mirror real DOM innerHTML replacement for dynamically rendered inspector buttons
          if (id === 'inspector') {
            delete elements['i-del'];
            delete elements['i-del-all'];
          }
        },
      });
      elements[id] = el;
    }
    return elements[id];
  };

  // Ensure #auto checkbox starts unchecked unless requested so room/item counts are deterministic
  getEl('auto').checked = false;

  const windowListeners = {};
  const documentListeners = {};

  global.window = {
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  };
  global.localStorage = global.window.localStorage;
  Object.defineProperty(global, 'navigator', {
    value: global.window.navigator,
    configurable: true,
    writable: true,
  });

  global.document = {
    activeElement: createRichMockElement('body', 'BODY'),
    getElementById: (id) => getEl(id),
    querySelector: (s) => {
      if (s.startsWith('#')) {
        // Support simple `#id` queries used across app.js
        const id = s.slice(1);
        return getEl(id);
      }
      return createRichMockElement(s);
    },
    querySelectorAll: () => [],
    createElement: (tag) => createRichMockElement('', tag),
    addEventListener: (evt, fn) => {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(fn);
    },
  };

  return { elements, getEl, windowListeners, documentListeners };
}

test('style.css configures #toast flexbox layout and .toast-action-btn interactive styles', () => {
  const srcCssPath = path.join(__dirname, '../css/src/style.css');
  const compiledCssPath = path.join(__dirname, '../css/style.css');

  const srcCss = fs.readFileSync(srcCssPath, 'utf8');
  const compiledCss = fs.readFileSync(compiledCssPath, 'utf8');

  const toastBlock = srcCss.match(/#toast\s*\{[^}]+\}/)?.[0] || '';
  assert.ok(toastBlock.includes('display: flex'), '#toast must use display: flex');
  assert.ok(toastBlock.includes('align-items: center'), '#toast must align items center');
  assert.ok(toastBlock.includes('gap: 12px'), '#toast must set 12px gap');

  assert.ok(srcCss.includes('.toast-action-btn'), 'src/style.css must define .toast-action-btn');
  assert.ok(
    srcCss.includes('.toast-action-btn:hover'),
    'src/style.css must define .toast-action-btn:hover'
  );
  assert.ok(
    srcCss.includes('.toast-action-btn:focus-visible'),
    'src/style.css must define .toast-action-btn:focus-visible'
  );
  assert.ok(
    compiledCss.includes('.toast-action-btn'),
    'compiled style.css must include .toast-action-btn'
  );
});

test('toast() renders plain text span without action button and supports action button callback, replacement, and rapid-click guard', async () => {
  const { getEl } = setupAppTestEnv();
  const mod = await import(`../js/app.js?t=${Date.now()}_toast_unit`);
  const { toast } = mod;
  const toastEl = getEl('toast');

  // 1. Standard plain-text toast (.toast-msg + .toast-dismiss, no .toast-action-btn)
  toast('Saved project successfully', false, 120);
  assert.equal(toastEl.style.display, 'flex');
  assert.equal(toastEl.className, '');
  assert.equal(toastEl.children.length, 2, 'Plain toast should have .toast-msg + .toast-dismiss');
  assert.equal(toastEl.children[0].tagName, 'SPAN');
  assert.equal(toastEl.querySelector('.toast-msg').textContent, 'Saved project successfully');
  assert.ok(toastEl.querySelector('.toast-dismiss'), 'Plain toast keeps .toast-dismiss button');
  assert.equal(toastEl.querySelector('.toast-action-btn'), null);

  // 2. Error toast without action
  toast('Export failed', true, 120);
  assert.equal(toastEl.className, 'err');
  assert.equal(toastEl.children.length, 2);
  assert.equal(toastEl.querySelector('.toast-msg').textContent, 'Export failed');
  assert.equal(toastEl.querySelector('.toast-action-btn'), null);

  // 3. Toast with action button (.toast-msg + .toast-action-btn + .toast-dismiss)
  let undoCount = 0;
  toast('Deleted Sofa in Living room', false, 5000, {
    label: 'Undo',
    onClick: () => {
      undoCount += 1;
    },
  });

  assert.equal(toastEl.className, '');
  assert.equal(toastEl.style.display, 'flex');
  assert.equal(
    toastEl.children.length,
    3,
    'Action toast should contain .toast-msg + .toast-action-btn + .toast-dismiss'
  );
  assert.equal(toastEl.children[0].tagName, 'SPAN');
  assert.equal(toastEl.children[0].textContent, 'Deleted Sofa in Living room');
  assert.equal(toastEl.children[1].className, 'toast-action-btn');
  assert.equal(toastEl.children[2].className, 'toast-dismiss');

  const btn = toastEl.querySelector('.toast-action-btn');
  assert.ok(btn, 'Action toast must contain .toast-action-btn button');
  assert.equal(btn.tagName, 'BUTTON');
  assert.equal(btn.textContent, 'Undo');

  // Rapid multiple clicks on action button should hide immediately and fire callback once
  btn.click();
  btn.click();
  assert.equal(undoCount, 1, 'Undo callback must execute only once on rapid clicks');
  assert.equal(toastEl.style.display, 'none', 'Toast must hide immediately when action clicked');

  // 4. Replacing an active action toast with a standard toast removes the old button
  toast('Deleted Chair', false, 5000, { label: 'Undo', onClick: () => {} });
  assert.ok(toastEl.querySelector('.toast-action-btn'));
  toast('Selection cleared', false, 40);
  assert.equal(
    toastEl.querySelector('.toast-action-btn'),
    null,
    'Subsequent plain toast must clear previous action button'
  );
  assert.equal(toastEl.querySelector('.toast-msg').textContent, 'Selection cleared');

  // Wait for auto-hide timer
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(toastEl.style.display, 'none', 'Toast should hide after timeout expires');
});

test('keyboard deletion, inspector deletion, and erase tool trigger Undo toast that restores deleted elements', async () => {
  const { getEl, windowListeners } = setupAppTestEnv();
  await import(`../js/app.js?t=${Date.now()}_toast_integration`);
  const homegen = global.window.__homegen;
  const toastEl = getEl('toast');
  const planCanvas = getEl('plan');

  // Seed plan with a room and two furniture items using model helpers
  const M = await import('../js/model.js');
  let roomId = '';
  let sofaId = '';
  let chairId = '';
  homegen.apply((n) => {
    const room = M.createRoom(n, 'living', 0, 0, 240, 240);
    room.name = 'Living Room';
    M.addOpening(n, room, 'door_entry_36', 'S', 60);
    const sofa = M.addItem(n, room, 'sofa', { x: 60, y: 60, rot: 0 });
    const chair = M.addItem(n, room, 'armchair', { x: 160, y: 160, rot: 0 });
    roomId = room.id;
    sofaId = sofa.id;
    chairId = chair.id;
  }, 'Setup Room');

  assert.equal(homegen.doc.rooms[0].items.length, 2);

  // 1. Keyboard Delete triggers toast with Undo button; clicking Undo restores deleted item
  homegen.select(sofaId);
  const keydownFn = windowListeners['keydown']?.[0];
  assert.ok(keydownFn, 'window keydown handler should be registered');

  keydownFn({ key: 'Delete', preventDefault: () => {} });
  assert.equal(homegen.doc.rooms[0].items.length, 1, 'Sofa should be deleted after Delete key');

  let undoBtn = toastEl.querySelector('.toast-action-btn');
  assert.ok(undoBtn, 'Keyboard delete toast must display inline Undo button');
  assert.equal(undoBtn.textContent, 'Undo');
  assert.match(toastEl.children[0].textContent, /Deleted Sofa in Living Room/);

  undoBtn.click();
  assert.equal(toastEl.style.display, 'none', 'Toast hides immediately after clicking Undo');
  assert.equal(
    homegen.doc.rooms[0].items.length,
    2,
    'Clicking inline Undo button restores the deleted Sofa'
  );

  // 2. Inspector single-element #i-del deletion shows Undo toast and restores on click
  homegen.select(chairId);
  const inspectorDelBtn = getEl('i-del');
  inspectorDelBtn.click();
  assert.equal(homegen.doc.rooms[0].items.length, 1, 'Armchair deleted via inspector #i-del');

  undoBtn = toastEl.querySelector('.toast-action-btn');
  assert.ok(undoBtn, 'Inspector #i-del toast must display inline Undo button');
  undoBtn.click();
  assert.equal(
    homegen.doc.rooms[0].items.length,
    2,
    'Clicking Undo restores element deleted from inspector'
  );

  // 3. Multi-selection #i-del-all deletion shows Undo toast and restores all items on click
  homegen.select([sofaId, chairId]);
  const delAllBtn = getEl('i-del-all');
  delAllBtn.click();
  assert.equal(homegen.doc.rooms[0].items.length, 0, 'Both items deleted via #i-del-all');

  undoBtn = toastEl.querySelector('.toast-action-btn');
  assert.ok(undoBtn, 'Multi-selection #i-del-all toast must display inline Undo button');
  assert.match(toastEl.children[0].textContent, /Deleted 2 selected elements/);
  undoBtn.click();
  assert.equal(
    homegen.doc.rooms[0].items.length,
    2,
    'Clicking Undo restores multi-selected deleted items'
  );

  // 4. Erase tool pointerdown deletes element, shows Undo toast, and restores on click
  homegen.setTool({ kind: 'erase' });
  // view = { scale: 1.6, ox: 40, oy: 40 }; sofa at (60, 60) -> clientX = 40 + 70 * 1.6 = 152, clientY = 40 + 70 * 1.6 = 152
  planCanvas.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    clientX: 40 + 70 * 1.6,
    clientY: 40 + 70 * 1.6,
    preventDefault: () => {},
  });
  assert.equal(homegen.doc.rooms[0].items.length, 1, 'Erase tool click deletes item under pointer');

  undoBtn = toastEl.querySelector('.toast-action-btn');
  assert.ok(undoBtn, 'Erase tool toast must display inline Undo button');
  undoBtn.click();
  assert.equal(
    homegen.doc.rooms[0].items.length,
    2,
    'Clicking Undo restores element deleted by Erase tool'
  );

  // 5. Room deletion via inspector #i-del shows Undo toast and restores room on click
  homegen.setTool({ kind: 'select' });
  homegen.select(roomId);
  getEl('i-del').click();
  assert.equal(homegen.doc.rooms.length, 0, 'Room deleted via inspector #i-del');

  undoBtn = toastEl.querySelector('.toast-action-btn');
  assert.ok(undoBtn, 'Room deletion toast must display inline Undo button');
  undoBtn.click();
  assert.equal(homegen.doc.rooms.length, 1, 'Clicking Undo restores deleted room');
});
