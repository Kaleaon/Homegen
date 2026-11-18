import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('web/index.html includes required ARIA attributes on photoreal dialog and close button', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify <dialog id="photo"> has aria-labelledby="photo-title"
  assert.match(html, /<dialog\s+id="photo"\s+aria-labelledby="photo-title"(\s+class="[^"]*")?>/);

  // Verify <h2 id="photo-title">Photoreal render</h2> exists inside dialog
  assert.match(html, /<h2\s+id="photo-title">Photoreal render<\/h2>/);

  // Verify header close button has aria-label="Close photoreal render"
  assert.match(
    html,
    /<button\s+value="close"\s+aria-label="Close photoreal render"><span\s+aria-hidden="true">✕<\/span><\/button>/
  );
});

test('web/js/ui3d.js manages focus when opening and closing photoreal dialog', async () => {
  const jsPath = path.join(__dirname, '../js/ui3d.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verify openPhoto captures trigger element and sets focus to #p-room
  assert.match(js, /triggerEl\s*=\s*\(e\s*&&\s*e\.currentTarget\)\s*\|\|\s*\$\('#o-photo'\);/);
  assert.match(js, /\$\('#p-room'\)/);
  assert.match(js, /pRoom\.focus\(\)/);

  // Verify close listener restores focus to trigger element
  assert.match(js, /dlg\.addEventListener\('close'/);
  assert.match(js, /trigger\.focus\(\)/);
});

test('web/index.html includes #p-resolution-tier selector, lock badges, tier labels, and #p-tier-badges container', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(
    html,
    /<label\s+for="p-resolution-tier">Resolution<\/label>\s*<select\s+id="p-resolution-tier">/
  );
  assert.match(html, /<option\s+value="sd"\s+selected>SD \(576p\) — Free<\/option>/);
  assert.match(html, /<option\s+value="hd">HD \(1024p\) — Pro 🔒<\/option>/);
  assert.match(html, /<option\s+value="4k">4K \(2048p\) — Enterprise 🔒<\/option>/);

  assert.match(
    html,
    /<div\s+id="p-tier-badges"\s+class="p-tier-badges"\s+role="group"\s+aria-label="Resolution plan tiers">/
  );
  assert.match(html, /data-tier="sd">Free<\/span>/);
  assert.match(html, /data-tier="hd">Pro\s*<span[^>]*>🔒<\/span><\/span>/);
  assert.match(html, /data-tier="4k">Enterprise\s*<span[^>]*>🔒<\/span><\/span>/);
  assert.match(
    html,
    /<p\s+id="p-upgrade-hint"\s+class="p-upgrade-hint note"\s+role="status"\s+aria-live="polite"\s+hidden><\/p>/
  );
});

test('initView3D populates resolution tiers, enforces anonymous free fallback with upgrade guidance, passes paid tier width to render, and resets safely on network error', async () => {
  const { initView3D } = await import('../js/ui3d.js');

  const origDocument = globalThis.document;
  const origWindow = globalThis.window;
  const origImage = globalThis.Image;
  const origOffscreenCanvas = globalThis.OffscreenCanvas;
  const origFileReader = globalThis.FileReader;
  const origFetch = globalThis.fetch;

  const elements = new Map();
  function createMockEl(id) {
    const listeners = {};
    const classes = new Set();
    const el = {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      src: '',
      hidden: false,
      disabled: false,
      focused: false,
      classList: {
        add: (...cs) => cs.forEach((c) => classes.add(c)),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
        toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c),
      },
      addEventListener: (evt, fn) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
      dispatchEvent: (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        const payload = typeof evt === 'string' ? { type, currentTarget: el, target: el } : evt;
        if (listeners[type]) {
          for (const fn of listeners[type]) fn(payload);
        }
      },
      click: () => el.dispatchEvent({ type: 'click', currentTarget: el, target: el }),
      focus: () => {
        el.focused = true;
      },
      showModal: () => {
        el.hidden = false;
      },
      close: () => {
        el.hidden = true;
        el.dispatchEvent('close');
      },
    };
    return el;
  }

  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, createMockEl(id));
    return elements.get(id);
  };

  const encodedWidths = [];
  let lastWebpWidth = 576;

  class MockImage {
    set src(val) {
      this._src = val;
      if (typeof val === 'string' && val.startsWith('data:image/webp')) {
        this.width = lastWebpWidth;
        this.height = Math.round((lastWebpWidth * 3) / 4);
      } else {
        this.width = 1024;
        this.height = 768;
      }
      queueMicrotask(() => {
        if (this.onload) this.onload();
      });
    }
    get src() {
      return this._src;
    }
  }

  class MockOffscreenCanvas {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      encodedWidths.push(w);
      lastWebpWidth = w;
    }
    getContext() {
      return { drawImage: () => {} };
    }
    async convertToBlob() {
      return new Blob(['webp-bytes'], { type: 'image/webp' });
    }
  }

  class MockFileReader {
    readAsDataURL() {
      queueMicrotask(() => {
        this.result = 'data:image/webp;base64,QUJD';
        if (this.onloadend) this.onloadend();
      });
    }
  }

  let fetchBehavior = 'success';
  const hordePayloads = [];
  globalThis.fetch = async (url, opts = {}) => {
    if (fetchBehavior === 'network_error') {
      throw new TypeError('Failed to fetch');
    }
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (String(url).endsWith('/generate/async')) {
      hordePayloads.push(JSON.parse(opts.body));
      return ok({ id: 'job-ui-tier-test' });
    }
    if (String(url).includes('/generate/check/')) {
      return ok({ done: true, queue_position: 0, wait_time: 0 });
    }
    return ok({ generations: [{ img: 'https://example.test/render.webp', censored: false }] });
  };

  globalThis.document = {
    querySelector: (sel) => (sel.startsWith('#') ? getEl(sel.slice(1)) : createMockEl(sel)),
    querySelectorAll: () => [],
    createElement: () => createMockEl('dynamic'),
  };
  globalThis.window = { addEventListener: () => {} };
  globalThis.Image = MockImage;
  globalThis.OffscreenCanvas = MockOffscreenCanvas;
  globalThis.FileReader = MockFileReader;

  try {
    const sampleRoom = {
      id: 'r1',
      name: 'Living room',
      type: 'living',
      level: 0,
      x: 0,
      y: 0,
      w: 180,
      h: 144,
      ceiling: 96,
      floor: 'floor_oak',
      walls: { N: 'paint_cream', E: 'paint_cream', S: 'paint_cream', W: 'paint_cream' },
      items: [],
      openings: [],
    };

    initView3D({
      getDoc: () => ({ rooms: [sampleRoom] }),
      getLevel: () => 0,
      getSelectedRoomId: () => 'r1',
      toast: () => {},
      setLevel: () => {},
      scene3dApi: {
        eyeLevelUsed: true,
        capture: () => 'data:image/png;base64,AA==',
      },
      hordeOptions: {
        pollIntervalMs: 1,
        retryDelays: [1, 1, 1],
      },
    });

    // 1. Open dialog -> populates #p-resolution-tier with Free, Pro 🔒, Enterprise 🔒 and defaults to SD
    getEl('o-photo').click();
    const tierSel = getEl('p-resolution-tier');
    const tierBadges = getEl('p-tier-badges');
    const upgradeHint = getEl('p-upgrade-hint');
    const statusEl = getEl('p-status');
    const keyInput = getEl('p-key');

    assert.equal(tierSel.value, 'sd');
    assert.match(tierSel.innerHTML, /SD \(576p\) — Free/);
    assert.match(tierSel.innerHTML, /HD \(1024p\) — Pro 🔒/);
    assert.match(tierSel.innerHTML, /4K \(2048p\) — Enterprise 🔒/);
    assert.match(tierBadges.innerHTML, /tier-free active/);
    assert.equal(upgradeHint.hidden, true);

    // 2. Anonymous user selects locked HD tier -> shows upgrade guidance and enforces SD fallback
    tierSel.value = 'hd';
    tierSel.dispatchEvent('change');
    assert.equal(tierSel.value, 'sd', 'enforces fallback to SD for anonymous user');
    assert.equal(upgradeHint.hidden, false, 'displays upgrade guidance');
    assert.match(upgradeHint.textContent, /Pro tier/);
    assert.match(upgradeHint.textContent, /576p/);
    assert.match(statusEl.textContent, /requires a registered key or paid plan/);

    // 3. Entering a paid/registered key unlocks HD & 4K tiers and passes width to render pipeline
    keyInput.value = 'paid-pro-api-key';
    keyInput.dispatchEvent('input');
    assert.equal(upgradeHint.hidden, true);
    assert.doesNotMatch(tierSel.innerHTML, /🔒/, 'unlocks selector options when key is present');

    tierSel.value = 'hd';
    tierSel.dispatchEvent('change');
    assert.equal(tierSel.value, 'hd');
    assert.match(tierBadges.innerHTML, /tier-pro active/);

    getEl('p-horde').click();
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(encodedWidths.at(-1), 1024, 'passes HD 1024 width to toWebpDataUrl');
    assert.equal(hordePayloads.at(-1).params.width, 1024, 'passes HD 1024 width to hordeRender');

    // 4. Network error safely resets resolution selection back to SD (576p)
    tierSel.value = '4k';
    tierSel.dispatchEvent('change');
    assert.equal(tierSel.value, '4k');

    fetchBehavior = 'network_error';
    getEl('p-horde').click();
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(tierSel.value, 'sd', 'resets resolution tier to SD safely after network error');
    assert.match(tierBadges.innerHTML, /tier-free active/);
  } finally {
    globalThis.document = origDocument;
    globalThis.window = origWindow;
    globalThis.Image = origImage;
    if (origOffscreenCanvas !== undefined) {
      globalThis.OffscreenCanvas = origOffscreenCanvas;
    } else {
      delete globalThis.OffscreenCanvas;
    }
    globalThis.FileReader = origFileReader;
    globalThis.fetch = origFetch;
  }
});
