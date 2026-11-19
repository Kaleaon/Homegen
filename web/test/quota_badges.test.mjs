import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RateLimiter } from '../js/rateLimiter.js';
import { bindHeaderQuotaBadge } from '../js/app.js';
import { bindPhotorealQuotaBadge } from '../js/ui3d.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createMockDom() {
  const elements = new Map();

  function makeElement(id) {
    const listeners = new Map();
    const classes = new Set();
    const dataset = {};
    let focused = false;
    let selected = false;

    const el = {
      id,
      value: '',
      textContent: '',
      hidden: false,
      dataset,
      classList: {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force) => {
          const on = force === undefined ? !classes.has(name) : Boolean(force);
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
        contains: (name) => classes.has(name),
      },
      setAttribute(name, val) {
        if (name.startsWith('data-')) {
          const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          dataset[camel] = String(val);
        }
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : evt.type;
        const set = listeners.get(type);
        if (set) {
          for (const fn of [...set]) fn(evt);
        }
      },
      click() {
        this.dispatchEvent({ type: 'click', currentTarget: this });
      },
      focus() {
        focused = true;
      },
      select() {
        selected = true;
      },
      isFocused: () => focused,
      isSelected: () => selected,
      resetFocus: () => {
        focused = false;
        selected = false;
      },
    };
    return el;
  }

  for (const id of [
    'header-quota-badge',
    'header-quota-count',
    'header-quota-queue',
    'header-quota-upgrade',
    'photo-quota-badge',
    'photo-quota-count',
    'photo-quota-queue',
    'photo-quota-tier',
    'photo-quota-upgrade-wrap',
    'photo-quota-upgrade',
    'photo-quota-upgrade-link',
    'p-key',
  ]) {
    elements.set(`#${id}`, makeElement(id));
  }

  return {
    querySelector: (sel) => elements.get(sel) || null,
    el: (id) => elements.get(`#${id}`),
  };
}

test('web/index.html contains accessible quota badge containers in header#top and dialog#photo', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify header#top contains #header-quota-badge, count, queue, and upgrade button
  const headerMatch = html.match(/<header id="top">([\s\S]*?)<\/header>/);
  assert.ok(headerMatch, 'header#top exists in index.html');
  const headerHtml = headerMatch[1];
  assert.match(headerHtml, /id="header-quota-badge"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(headerHtml, /id="header-quota-count"/);
  assert.match(headerHtml, /id="header-quota-queue"[^>]*hidden/);
  assert.match(headerHtml, /<button[^>]*id="header-quota-upgrade"/);

  // Verify dialog#photo contains #photo-quota-badge, count, queue, tier, and upgrade controls
  const photoMatch = html.match(/<dialog id="photo"[\s\S]*?<\/dialog>/);
  assert.ok(photoMatch, 'dialog#photo exists in index.html');
  const photoHtml = photoMatch[0];
  assert.match(photoHtml, /id="photo-quota-badge"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(photoHtml, /id="photo-quota-count"/);
  assert.match(photoHtml, /id="photo-quota-queue"[^>]*hidden/);
  assert.match(photoHtml, /id="photo-quota-tier"/);
  assert.match(photoHtml, /id="photo-quota-upgrade"/);
  assert.match(photoHtml, /id="photo-quota-upgrade-link"/);
});

test('Header and Photoreal quota badges reflect initial full capacity, consumption, queue updates, exhaustion, and refills', async () => {
  const dom = createMockDom();
  let storedKey = '';
  let upgradeTriggeredWith = null;

  let releaseHold;
  const holdGate = new Promise((r) => {
    releaseHold = r;
  });

  const limiter = new RateLimiter({
    capacity: 5,
    refillRate: 5, // 200ms per token; refills tested deterministically below
    maxConcurrency: 2,
    fetchImpl: async (url) => {
      if (url.startsWith('/hold')) {
        await holdGate;
      }
      return { ok: true };
    },
  });

  const headerBinding = bindHeaderQuotaBadge(limiter, dom, {
    getStoredKey: () => storedKey,
    onUpgrade: (btn) => {
      upgradeTriggeredWith = btn;
    },
  });
  const photoBinding = bindPhotorealQuotaBadge(limiter, dom);

  try {
    // 1. Initial load before token usage: full bucket capacity and hidden empty queue
    assert.equal(dom.el('header-quota-count').textContent, '5 / 5 credits');
    assert.equal(dom.el('photo-quota-count').textContent, '5 / 5 credits');
    assert.equal(dom.el('header-quota-badge').dataset.quotaState, 'full');
    assert.equal(dom.el('photo-quota-badge').dataset.quotaState, 'full');
    assert.equal(dom.el('header-quota-queue').hidden, true);
    assert.equal(dom.el('photo-quota-queue').hidden, true);
    assert.equal(dom.el('photo-quota-tier').textContent, 'Anonymous · 576px');
    assert.equal(dom.el('photo-quota-upgrade-wrap').hidden, false);

    // 2. Consume 2 tokens & enqueue 2 more (exceeding maxConcurrency = 2)
    limiter.lastRefill = Date.now() + 5000;
    const p1 = limiter.fetch('/hold-1');
    const p2 = limiter.fetch('/hold-2');
    const p3 = limiter.fetch('/queued-1');
    const p4 = limiter.fetch('/queued-2');

    assert.equal(dom.el('header-quota-count').textContent, '3 / 5 credits');
    assert.equal(dom.el('photo-quota-count').textContent, '3 / 5 credits');
    assert.equal(dom.el('header-quota-badge').dataset.quotaState, 'available');
    assert.equal(dom.el('header-quota-queue').hidden, false);
    assert.equal(dom.el('header-quota-queue').textContent, '2 queued');
    assert.equal(dom.el('photo-quota-queue').hidden, false);
    assert.equal(dom.el('photo-quota-queue').textContent, '2 queued');

    // 3. Enqueue a 5th request so once hold releases, all 5 tokens are consumed -> low then exhausted
    const p5 = limiter.fetch('/queued-3');
    assert.equal(dom.el('header-quota-queue').textContent, '3 queued');

    // Prevent instant refill while asserting low/exhausted states
    limiter.lastRefill = Date.now() + 5000;
    releaseHold();
    await Promise.all([p1, p2, p3, p4, p5]);

    assert.equal(dom.el('header-quota-count').textContent, '0 / 5 credits');
    assert.equal(dom.el('photo-quota-count').textContent, '0 / 5 credits');
    assert.equal(dom.el('header-quota-badge').dataset.quotaState, 'exhausted');
    assert.equal(dom.el('photo-quota-badge').dataset.quotaState, 'exhausted');
    assert.equal(dom.el('header-quota-queue').hidden, true);
    assert.equal(dom.el('photo-quota-queue').hidden, true);
    assert.equal(dom.el('header-quota-upgrade').textContent, 'Refilling…');
    assert.ok(dom.el('photo-quota-upgrade').classList.contains('quota-upgrade-urgent'));

    // 4. Simulate low state (1 / 5 credits = 20%)
    limiter.tokens = 1;
    limiter._emitQuotaChange('refill');
    assert.equal(dom.el('header-quota-badge').dataset.quotaState, 'low');
    assert.equal(dom.el('photo-quota-badge').dataset.quotaState, 'low');

    // 5. Simulate refill back to full capacity
    limiter.lastRefill = Date.now() - 5000;
    limiter._refillTokens();
    assert.equal(dom.el('header-quota-count').textContent, '5 / 5 credits');
    assert.equal(dom.el('photo-quota-count').textContent, '5 / 5 credits');
    assert.equal(dom.el('header-quota-badge').dataset.quotaState, 'full');
    assert.equal(dom.el('photo-quota-badge').dataset.quotaState, 'full');

    // 6. Verify upgrade trigger interactions and registered key state
    dom.el('header-quota-upgrade').click();
    assert.equal(upgradeTriggeredWith, dom.el('header-quota-upgrade'));

    dom.el('photo-quota-upgrade').click();
    assert.equal(dom.el('p-key').isFocused(), true);
    assert.equal(dom.el('p-key').isSelected(), true);

    // Configure registered AI Horde API key
    storedKey = 'registered-horde-api-key';
    dom.el('p-key').value = storedKey;
    headerBinding.update();
    photoBinding.update();

    assert.equal(dom.el('header-quota-upgrade').textContent, 'HD Key');
    assert.ok(dom.el('header-quota-upgrade').classList.contains('upgraded'));
    assert.equal(dom.el('photo-quota-tier').textContent, 'Priority HD · 768px');
    assert.ok(dom.el('photo-quota-tier').classList.contains('upgraded'));
    assert.equal(dom.el('photo-quota-upgrade-wrap').hidden, true);
  } finally {
    headerBinding.destroy();
    photoBinding.destroy();
    limiter.clear();
  }
});
