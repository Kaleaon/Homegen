import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

if (typeof HTMLCanvasElement === 'undefined') {
  global.HTMLCanvasElement = class {};
}

function createMockElement(id = '', tagName = 'DIV', ctxCalls = null) {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  const element = {
    id,
    tagName: tagName.toUpperCase(),
    width: 800,
    height: 600,
    value: '',
    checked: id === 'auto' || id === 'bg-visible',
    textContent: '',
    innerHTML: '',
    hidden: id === 'bg-toolbar' || id === 'view3d' || id === 'bar3d',
    disabled: false,
    open: false,
    dataset: {},
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => {
        if (v === undefined) {
          if (classes.has(c)) {
            classes.delete(c);
            return false;
          }
          classes.add(c);
          return true;
        }
        if (v) classes.add(c);
        else classes.delete(c);
        return Boolean(v);
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (name, val) => {
      attributes[name] = String(val);
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
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const eventObj =
        typeof evt === 'string'
          ? { type, preventDefault: () => {}, stopPropagation: () => {}, target: element }
          : {
              preventDefault: () => {},
              stopPropagation: () => {},
              target: element,
              ...evt,
            };
      if (listeners[type]) listeners[type].forEach((fn) => fn(eventObj));
      return true;
    },
    click: () => element.dispatchEvent('click'),
    focus: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
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
          measureText: () => ({ width: 20 }),
          createPattern: () => ({}),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
          setLineDash: (segments) => {
            if (ctxCalls) ctxCalls.lineDash.push(segments);
          },
          strokeRect: (x, y, w, h) => {
            if (ctxCalls) ctxCalls.strokeRect.push({ x, y, w, h });
          },
          fillRect: (x, y, w, h) => {
            if (ctxCalls) ctxCalls.fillRect.push({ x, y, w, h });
          },
        },
        {
          get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
          },
          set(target, prop, value) {
            target[prop] = value;
            return true;
          },
        }
      ),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return element;
}

function setupMockAppDOM() {
  const ctxCalls = {
    lineDash: [],
    strokeRect: [],
    fillRect: [],
  };
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) {
      const tag = id === 'plan' || id === 'view3d' ? 'CANVAS' : 'DIV';
      elements[id] = createMockElement(id, tag, id === 'plan' ? ctxCalls : null);
    }
    return elements[id];
  };

  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };
  // Pre-skip onboarding wizard so startup doesn't open welcome modal
  global.localStorage.setItem('homegen_onboarding_status', 'skipped');

  global.confirm = () => true;

  global.FileReader = class MockFileReader {
    readAsDataURL(file) {
      const dataUrl =
        file._dataUrl ||
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC';
      if (typeof this.onload === 'function') {
        this.onload({ target: { result: dataUrl } });
      }
    }
  };

  global.Image = class MockImage {
    constructor() {
      this.width = 640;
      this.height = 480;
      this.naturalWidth = 640;
      this.naturalHeight = 480;
      this.complete = true;
    }
    set src(val) {
      this._src = val;
      if (val && val.includes('corrupt')) {
        if (typeof this.onerror === 'function') this.onerror(new Error('Invalid image'));
      } else if (typeof this.onload === 'function') {
        this.onload();
      }
    }
    get src() {
      return this._src;
    }
  };

  const documentListeners = {};
  global.document = {
    activeElement: createMockElement('body', 'BODY'),
    createElement: (tag) => createMockElement('', tag),
    getElementById: (id) => getEl(id),
    querySelector: (s) => {
      if (s.startsWith('#') && !s.includes(' ')) {
        return getEl(s.slice(1));
      }
      return createMockElement(s);
    },
    querySelectorAll: () => [],
    addEventListener: (evt, fn) => {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(fn);
    },
  };

  const windowListeners = {};
  global.window = {
    devicePixelRatio: 1,
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
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

  return { elements, getEl, ctxCalls };
}

test('index.html and overlays.css define empty-state blueprint dropzone with Ktheme compliance', () => {
  const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
  const overlaysCss = fs.readFileSync(path.join(webDir, 'css/overlays.css'), 'utf8');

  assert.match(
    html,
    /<div id="blueprint-dropzone" class="blueprint-dropzone"[^>]*role="region"[^>]*aria-label="Blueprint upload dropzone"/,
    'index.html must include #blueprint-dropzone region over #plan'
  );
  assert.match(
    html,
    /<button type="button" id="blueprint-dropzone-btn"[^>]*class="[^"]*k-target-min-size[^"]*"[^>]*>/,
    'index.html must include #blueprint-dropzone-btn trigger button with k-target-min-size'
  );

  assert.ok(
    overlaysCss.includes('.blueprint-dropzone'),
    'overlays.css must style .blueprint-dropzone'
  );
  assert.ok(
    overlaysCss.includes('.blueprint-dropzone.drag-over'),
    'overlays.css must style .blueprint-dropzone.drag-over'
  );
  assert.ok(
    overlaysCss.includes('#blueprint-dropzone-btn'),
    'overlays.css must style #blueprint-dropzone-btn'
  );

  const lintOut = execSync('node scripts/lint-css.mjs css/overlays.css', {
    cwd: webDir,
    encoding: 'utf8',
  });
  assert.ok(
    lintOut.includes('All CSS rules comply with Ktheme design tokens!'),
    'overlays.css must pass Ktheme token linter'
  );
});

test('canvas drag-and-drop blueprint upload, drag-over overlay outline, and non-image rejection', async () => {
  const { getEl, ctxCalls } = setupMockAppDOM();
  const planCanvas = getEl('plan');
  const dropzone = getEl('blueprint-dropzone');
  const dropzoneBtn = getEl('blueprint-dropzone-btn');
  const blueprintFileInput = getEl('blueprint-file');
  const bgToolbar = getEl('bg-toolbar');
  const bgRemoveBtn = getEl('bg-remove-btn');
  const toastEl = getEl('toast');

  await import(`../js/app.js?t=${Date.now()}`);
  const homegen = global.window.__homegen;
  assert.ok(homegen, 'window.__homegen should be initialized');

  // 1. Validate isValidBlueprintImageFile helper
  assert.equal(
    homegen.isValidBlueprintImageFile({ name: 'floorplan.png', type: 'image/png' }),
    true
  );
  assert.equal(homegen.isValidBlueprintImageFile({ name: 'scan.jpg', type: 'image/jpeg' }), true);
  assert.equal(homegen.isValidBlueprintImageFile({ name: 'scan.webp', type: 'image/webp' }), true);
  assert.equal(homegen.isValidBlueprintImageFile({ name: 'fallback.png', type: '' }), true);
  assert.equal(
    homegen.isValidBlueprintImageFile({ name: 'plan.json', type: 'application/json' }),
    false
  );
  assert.equal(homegen.isValidBlueprintImageFile({ name: 'plan.homegen.json', type: '' }), false);
  assert.equal(
    homegen.isValidBlueprintImageFile({ name: 'archive.zip', type: 'application/zip' }),
    false
  );
  assert.equal(homegen.isValidBlueprintImageFile(null), false);

  // 2. Empty-state dropzone prompt visibility and button click forwarding
  assert.equal(homegen.doc.background, null, 'Initial doc.background should be null');
  assert.equal(dropzone.hidden, false, 'Dropzone should be visible when doc.background is null');

  let filePickerClicked = false;
  blueprintFileInput.addEventListener('click', () => {
    filePickerClicked = true;
  });
  dropzoneBtn.click();
  assert.equal(
    filePickerClicked,
    true,
    'Clicking #blueprint-dropzone-btn must trigger #blueprint-file click'
  );

  // 3. Drag-over feedback & dotted target outline in drawOverlay()
  ctxCalls.lineDash.length = 0;
  ctxCalls.strokeRect.length = 0;

  const dragDataTransfer = { types: ['Files'], dropEffect: 'none' };
  let dragOverPrevented = false;
  planCanvas.dispatchEvent({
    type: 'dragenter',
    dataTransfer: dragDataTransfer,
    preventDefault: () => {},
  });
  planCanvas.dispatchEvent({
    type: 'dragover',
    dataTransfer: dragDataTransfer,
    preventDefault: () => {
      dragOverPrevented = true;
    },
  });

  assert.equal(dragOverPrevented, true, 'dragover must call preventDefault()');
  assert.equal(dragDataTransfer.dropEffect, 'copy', 'dragover must set dropEffect to copy');
  assert.equal(homegen.isCanvasDragOver, true, 'isCanvasDragOver must be true while dragging');
  assert.equal(
    dropzone.classList.contains('drag-over'),
    true,
    '#blueprint-dropzone must gain .drag-over class during dragover'
  );
  assert.ok(
    ctxCalls.lineDash.some((d) => Array.isArray(d) && d.length === 2 && d[0] > 0),
    'drawOverlay must set a dashed/dotted line pattern during dragover'
  );
  assert.ok(
    ctxCalls.strokeRect.length > 0,
    'drawOverlay must draw target outline strokeRect on canvas during dragover'
  );

  // Dragleave clears drag-over state
  planCanvas.dispatchEvent({
    type: 'dragleave',
    dataTransfer: dragDataTransfer,
    preventDefault: () => {},
  });
  assert.equal(homegen.isCanvasDragOver, false, 'dragleave must clear isCanvasDragOver');
  assert.equal(
    dropzone.classList.contains('drag-over'),
    false,
    'dragleave must remove .drag-over class from #blueprint-dropzone'
  );

  // 4. Dropping a non-image file (e.g. .json) rejects with error toast and preserves canvas pointer state
  const origImporter = homegen.handleBlueprintImport;
  let importCallCount = 0;
  homegen.handleBlueprintImport = (file, meta) => {
    importCallCount++;
    return origImporter(file, meta);
  };

  let dropPrevented = false;
  planCanvas.dispatchEvent({
    type: 'dragenter',
    dataTransfer: { types: ['Files'] },
    preventDefault: () => {},
  });
  planCanvas.dispatchEvent({
    type: 'drop',
    dataTransfer: {
      files: [{ name: 'project.json', type: 'application/json' }],
    },
    preventDefault: () => {
      dropPrevented = true;
    },
  });

  assert.equal(dropPrevented, true, 'drop must call preventDefault()');
  assert.equal(importCallCount, 0, 'Dropping .json must not invoke handleBlueprintImport');
  assert.equal(homegen.doc.background, null, 'doc.background must remain null after .json drop');
  assert.equal(
    homegen.isCanvasDragOver,
    false,
    'isCanvasDragOver must be reset after invalid drop'
  );
  assert.equal(toastEl.className, 'err', 'Error toast must be shown for non-image file drop');
  assert.match(toastEl.textContent, /Unsupported file type/i);

  // Verify canvas pointer interaction still works cleanly after rejected .json drop
  homegen.setTool({ kind: 'room', type: 'living' });
  planCanvas.dispatchEvent({
    type: 'pointerdown',
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  planCanvas.dispatchEvent({
    type: 'pointermove',
    pointerId: 1,
    button: 0,
    clientX: 340,
    clientY: 340,
  });
  planCanvas.dispatchEvent({
    type: 'pointerup',
    pointerId: 1,
    button: 0,
    clientX: 340,
    clientY: 340,
  });
  assert.equal(
    homegen.doc.rooms.length,
    1,
    'Canvas pointer events (room drawing) must continue working after rejected .json drop'
  );

  // 5. Dropping a valid image file delegates to handleBlueprintImport and populates doc.background
  const validPngFile = {
    name: 'architectural-plan.png',
    type: 'image/png',
    _dataUrl: 'data:image/png;base64,validBlueprintPayload',
  };

  planCanvas.dispatchEvent({
    type: 'dragenter',
    dataTransfer: { types: ['Files'] },
    preventDefault: () => {},
  });
  planCanvas.dispatchEvent({
    type: 'drop',
    dataTransfer: {
      files: [validPngFile],
    },
    preventDefault: () => {},
  });

  assert.equal(importCallCount, 1, 'Dropping valid PNG must call handleBlueprintImport once');
  assert.ok(homegen.doc.background, 'doc.background must be populated after image drop');
  assert.equal(homegen.doc.background.dataUrl, 'data:image/png;base64,validBlueprintPayload');
  assert.equal(homegen.doc.background.width, 640);
  assert.equal(homegen.doc.background.height, 480);
  assert.equal(homegen.doc.background.visible, true);
  assert.equal(homegen.doc.background.opacity, 0.5);
  assert.equal(dropzone.hidden, true, '#blueprint-dropzone must hide once doc.background exists');
  assert.equal(bgToolbar.hidden, false, '#bg-toolbar must appear once doc.background exists');

  // 6. Removing blueprint restores empty-state dropzone
  bgRemoveBtn.click();
  getEl('dlg-confirm-ok').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(homegen.doc.background, null, 'Removing blueprint clears doc.background');
  assert.equal(
    dropzone.hidden,
    false,
    '#blueprint-dropzone must reappear when blueprint is removed'
  );
  assert.equal(bgToolbar.hidden, true, '#bg-toolbar must hide when blueprint is removed');
});
