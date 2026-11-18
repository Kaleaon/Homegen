import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PLAN_TIER_RANKS,
  getCurrentPlanTier,
  initExportModalTierState,
  openPlanUpgradePrompt,
  bindUpgradeTriggerLinks,
  trapFocus,
} from '../js/app.js';
import { generatePDF } from '../js/pdfEngine.js';
import { generateBOMCSV } from '../js/bomExporter.js';
import { exportDXF } from '../js/dxfExporter.js';
import { buildStudio } from '../js/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '..');
const htmlPath = path.join(webDir, 'index.html');
const overlaysCssPath = path.join(webDir, 'css/overlays.css');
const appJsPath = path.join(webDir, 'js/app.js');

function extractDialogBlock(html, dialogId) {
  const regex = new RegExp(`<dialog\\s+id="${dialogId}"[\\s\\S]*?<\\/dialog>`);
  const match = html.match(regex);
  return match ? match[0] : '';
}

function createMockNode(tagName, opts = {}) {
  const attrs = new Map(Object.entries(opts.attrs || {}));
  const classes = new Set(opts.classes || []);
  const listeners = new Map();
  const children = [];

  const node = {
    tagName: tagName.toUpperCase(),
    id: opts.id || '',
    textContent: opts.textContent || '',
    hidden: Boolean(opts.hidden),
    disabled: Boolean(opts.disabled),
    open: Boolean(opts.open),
    parentElement: null,
    ownerDocument: null,
    dataset: { ...(opts.dataset || {}) },
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        const next = force === undefined ? !classes.has(name) : Boolean(force);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        node.dataset[camel] = String(v);
      }
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
    },
    hasAttribute(k) {
      return attrs.has(k);
    },
    appendChild(child) {
      child.parentElement = node;
      child.ownerDocument = node.ownerDocument;
      children.push(child);
      return child;
    },
    closest(selector) {
      if (selector === '[hidden]') {
        let cur = node;
        while (cur) {
          if (cur.hidden || cur.hasAttribute?.('hidden')) return cur;
          cur = cur.parentElement;
        }
      }
      return null;
    },
    addEventListener(type, fn, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, once: Boolean(options?.once) });
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(
        type,
        listeners.get(type).filter((entry) => entry.fn !== fn)
      );
    },
    dispatchEvent(evt) {
      const entries = [...(listeners.get(evt.type) || [])];
      for (const entry of entries) {
        if (entry.once) {
          node.removeEventListener(evt.type, entry.fn);
        }
        entry.fn(evt);
      }
    },
    focus() {
      if (node.ownerDocument) {
        node.ownerDocument.activeElement = node;
      }
      node._focused = true;
    },
    click() {
      let prevented = false;
      node.dispatchEvent({
        type: 'click',
        currentTarget: node,
        target: node,
        preventDefault() {
          prevented = true;
        },
        get defaultPrevented() {
          return prevented;
        },
      });
      return prevented;
    },
    showModal() {
      node.open = true;
      node.hidden = false;
      node.setAttribute('open', '');
    },
    close() {
      node.open = false;
      node.removeAttribute('open');
      node.dispatchEvent({ type: 'close', target: node });
    },
    querySelectorAll(selector) {
      const results = [];
      const visit = (el) => {
        for (const child of el._children) {
          if (matchesSelector(child, selector)) results.push(child);
          visit(child);
        }
      };
      visit(node);
      return results;
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null;
    },
    _children: children,
  };

  return node;
}

function matchesSelector(el, selector) {
  const parts = selector.split(',').map((s) => s.trim());
  return parts.some((part) => {
    if (part === 'button') return el.tagName === 'BUTTON';
    if (part === 'input') return el.tagName === 'INPUT';
    if (part === 'select') return el.tagName === 'SELECT';
    if (part === 'textarea') return el.tagName === 'TEXTAREA';
    if (part === '[href]') return el.hasAttribute('href');
    if (part === '[data-select-tier]') return el.hasAttribute('data-select-tier');
    if (part === '[tabindex]:not([tabindex="-1"])') {
      return el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
    }
    if (part.startsWith('#')) return el.id === part.slice(1);
    if (part.startsWith('.')) return el.classList.contains(part.slice(1));
    return false;
  });
}

test('index.html renders Pro and Plus plan tier badges and upgrade trigger banners across PDF, CSV, and DXF modals', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  const pdfBlock = extractDialogBlock(html, 'pdf-export');
  const csvBlock = extractDialogBlock(html, 'csv-export');
  const dxfBlock = extractDialogBlock(html, 'dxf-export');
  const upgradeBlock = extractDialogBlock(html, 'dlg-plan-upgrade');

  assert.ok(pdfBlock, '#pdf-export dialog must exist in index.html');
  assert.ok(csvBlock, '#csv-export dialog must exist in index.html');
  assert.ok(dxfBlock, '#dxf-export dialog must exist in index.html');
  assert.ok(upgradeBlock, '#dlg-plan-upgrade dialog must exist in index.html');

  // PDF modal header badge, option badges, and upgrade banner
  assert.match(
    pdfBlock,
    /<div class="dlg-head-title">\s*<h2 id="pdf-export-title">Export Scaled Vector PDF<\/h2>\s*<span class="plan-tier-badge plan-tier-pro" data-tier="pro">Pro<\/span>\s*<\/div>/
  );
  assert.match(pdfBlock, /class="upgrade-trigger-banner"[^>]*data-required-tier="pro"/);
  assert.match(
    pdfBlock,
    /<a href="#upgrade-plan" class="upgrade-trigger-link" data-upgrade-tier="pro" data-export-type="pdf">/
  );
  assert.match(pdfBlock, /for="pdf-tb"[\s\S]*?plan-tier-badge plan-tier-plus/);
  assert.match(pdfBlock, /for="pdf-schedule"[\s\S]*?plan-tier-badge plan-tier-plus/);
  assert.match(pdfBlock, /for="pdf-inc-logo"[\s\S]*?plan-tier-badge plan-tier-pro/);
  assert.match(pdfBlock, /for="pdf-inc-stamp"[\s\S]*?plan-tier-badge plan-tier-pro/);
  assert.match(pdfBlock, /for="pdf-inc-watermark"[\s\S]*?plan-tier-badge plan-tier-plus/);

  // CSV modal header badge, option badges, and upgrade banner
  assert.match(
    csvBlock,
    /<div class="dlg-head-title">\s*<h2 id="csv-export-title">Export Bill of Materials \(CSV\)<\/h2>\s*<span class="plan-tier-badge plan-tier-plus" data-tier="plus">Plus<\/span>\s*<\/div>/
  );
  assert.match(csvBlock, /class="upgrade-trigger-banner"[^>]*data-required-tier="plus"/);
  assert.match(
    csvBlock,
    /<a href="#upgrade-plan" class="upgrade-trigger-link" data-upgrade-tier="plus" data-export-type="csv">/
  );
  assert.match(csvBlock, /for="csv-sec-openings"[\s\S]*?plan-tier-badge plan-tier-plus/);
  assert.match(csvBlock, /for="csv-sec-finishes"[\s\S]*?plan-tier-badge plan-tier-pro/);
  assert.match(csvBlock, /for="csv-sec-rooms"[\s\S]*?plan-tier-badge plan-tier-plus/);

  // DXF modal header badge, option badges, and upgrade banner
  assert.match(
    dxfBlock,
    /<div class="dlg-head-title">\s*<h2 id="dxf-export-title">Export DXF CAD Exchange Format<\/h2>\s*<span class="plan-tier-badge plan-tier-pro" data-tier="pro">Pro<\/span>\s*<\/div>/
  );
  assert.match(dxfBlock, /class="upgrade-trigger-banner"[^>]*data-required-tier="pro"/);
  assert.match(
    dxfBlock,
    /<a href="#upgrade-plan" class="upgrade-trigger-link" data-upgrade-tier="pro" data-export-type="dxf">/
  );
  assert.match(dxfBlock, /for="dxf-units"[\s\S]*?plan-tier-badge plan-tier-plus/);
  assert.match(dxfBlock, /for="dxf-level"[\s\S]*?plan-tier-badge plan-tier-pro/);
});

test('overlays.css defines Ktheme-tokenized .plan-tier-badge, .plan-tier-pro, .plan-tier-plus, and responsive .upgrade-trigger-banner styles', () => {
  const css = fs.readFileSync(overlaysCssPath, 'utf8');

  assert.ok(css.includes('.plan-tier-badge'), 'overlays.css must define .plan-tier-badge');
  assert.ok(css.includes('.plan-tier-pro'), 'overlays.css must define .plan-tier-pro');
  assert.ok(css.includes('.plan-tier-plus'), 'overlays.css must define .plan-tier-plus');
  assert.ok(
    css.includes('.upgrade-trigger-banner'),
    'overlays.css must define .upgrade-trigger-banner'
  );
  assert.ok(
    css.includes('.upgrade-trigger-link'),
    'overlays.css must define .upgrade-trigger-link'
  );
  assert.match(css, /@media\s*\(max-width:\s*540px\)/, 'overlays.css must handle small viewports');

  const linterOut = execSync('node scripts/lint-css.mjs css/overlays.css', {
    cwd: webDir,
    encoding: 'utf8',
  });
  assert.ok(
    linterOut.includes('All CSS rules comply with Ktheme design tokens!'),
    'overlays.css must pass Ktheme token linter without hardcoded colors or radii'
  );
});

test('initExportModalTierState initializes locked and unlocked tier badge states and banner visibility across tiers', () => {
  assert.deepEqual(PLAN_TIER_RANKS, { free: 0, plus: 1, pro: 2 });
  assert.equal(getCurrentPlanTier({ settings: {} }), 'free');
  assert.equal(getCurrentPlanTier({ settings: { planTier: 'Plus' } }), 'plus');
  assert.equal(getCurrentPlanTier({ settings: { planTier: 'PRO' } }), 'pro');

  const modal = createMockNode('dialog', { id: 'pdf-export' });
  const proBadge = modal.appendChild(
    createMockNode('span', {
      classes: ['plan-tier-badge', 'plan-tier-pro'],
      dataset: { tier: 'pro' },
      textContent: 'Pro',
    })
  );
  const plusBadge = modal.appendChild(
    createMockNode('span', {
      classes: ['plan-tier-badge', 'plan-tier-plus'],
      dataset: { tier: 'plus' },
      textContent: 'Plus',
    })
  );
  const banner = modal.appendChild(
    createMockNode('div', {
      classes: ['upgrade-trigger-banner'],
      dataset: { requiredTier: 'plus' },
    })
  );
  const link = banner.appendChild(
    createMockNode('a', {
      classes: ['upgrade-trigger-link'],
      attrs: { href: '#upgrade-plan', 'data-upgrade-tier': 'plus', 'data-export-type': 'csv' },
      textContent: 'Upgrade to Plus',
    })
  );

  // 1. Free tier: both Plus and Pro locked, banner visible
  const freeSummary = initExportModalTierState(modal, 'free');
  assert.equal(freeSummary.activePlanTier, 'free');
  assert.equal(proBadge.dataset.tierState, 'locked');
  assert.equal(plusBadge.dataset.tierState, 'locked');
  assert.equal(banner.hidden, false);
  assert.equal(link.textContent, 'Upgrade to Plus');

  // 2. Plus tier: Plus unlocked, Pro still locked, banner stays visible and promotes Pro
  initExportModalTierState(modal, 'plus');
  assert.equal(plusBadge.dataset.tierState, 'unlocked');
  assert.equal(plusBadge.classList.contains('is-unlocked'), true);
  assert.equal(proBadge.dataset.tierState, 'locked');
  assert.equal(proBadge.classList.contains('is-locked'), true);
  assert.equal(banner.hidden, false);
  assert.equal(link.textContent, 'Upgrade to Pro');
  assert.equal(link.dataset.upgradeTier, 'pro');

  // 3. Pro tier: all badges unlocked, upgrade banner hidden
  initExportModalTierState(modal, 'pro');
  assert.equal(plusBadge.dataset.tierState, 'unlocked');
  assert.equal(proBadge.dataset.tierState, 'unlocked');
  assert.equal(banner.hidden, true);
});

test('clicking upgrade trigger link opens plan upgrade prompt, highlights requested tier, traps keyboard focus, and restores focus on Escape', () => {
  const docMock = {
    activeElement: null,
    _root: createMockNode('body'),
    querySelector(sel) {
      return this._root.querySelector(sel);
    },
    querySelectorAll(sel) {
      return this._root.querySelectorAll(sel);
    },
  };
  docMock._root.ownerDocument = docMock;

  const pdfDialog = docMock._root.appendChild(createMockNode('dialog', { id: 'pdf-export' }));
  const closeBtn = pdfDialog.appendChild(createMockNode('button', { id: 'pdf-close' }));
  const banner = pdfDialog.appendChild(
    createMockNode('div', {
      classes: ['upgrade-trigger-banner'],
      dataset: { requiredTier: 'pro' },
    })
  );
  const upgradeLink = banner.appendChild(
    createMockNode('a', {
      id: 'pdf-upgrade-link',
      classes: ['upgrade-trigger-link'],
      attrs: {
        href: '#upgrade-plan',
        'data-upgrade-tier': 'pro',
        'data-export-type': 'pdf',
      },
      textContent: 'Upgrade to Pro',
    })
  );
  const generateBtn = pdfDialog.appendChild(createMockNode('button', { id: 'pdf-generate' }));

  const upgradeDlg = docMock._root.appendChild(
    createMockNode('dialog', { id: 'dlg-plan-upgrade' })
  );
  const upgradeCloseX = upgradeDlg.appendChild(createMockNode('button', { id: 'upgrade-x' }));
  const contextLead = upgradeDlg.appendChild(createMockNode('p', { id: 'upgrade-prompt-context' }));
  const plusCard = upgradeDlg.appendChild(
    createMockNode('div', {
      classes: ['upgrade-tier-card'],
      attrs: { 'data-tier': 'plus' },
    })
  );
  plusCard.appendChild(
    createMockNode('button', {
      id: 'btn-upgrade-plus',
      attrs: { 'data-select-tier': 'plus' },
    })
  );
  const proCard = upgradeDlg.appendChild(
    createMockNode('div', {
      classes: ['upgrade-tier-card'],
      attrs: { 'data-tier': 'pro' },
    })
  );
  proCard.appendChild(
    createMockNode('button', {
      id: 'btn-upgrade-pro',
      attrs: { 'data-select-tier': 'pro' },
    })
  );
  const maybeLaterBtn = upgradeDlg.appendChild(
    createMockNode('button', { id: 'btn-upgrade-close' })
  );

  // Verify focus trap on export modal includes upgradeLink in cycle
  pdfDialog.showModal();
  const cleanupPdfFocus = trapFocus(pdfDialog, null);
  assert.equal(docMock.activeElement, closeBtn, 'First focusable element receives focus');

  // Shift+Tab from first element wraps to last element (generateBtn), and upgradeLink is focusable
  pdfDialog.dispatchEvent({
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    preventDefault() {},
  });
  assert.equal(docMock.activeElement, generateBtn);
  upgradeLink.focus();
  assert.equal(docMock.activeElement, upgradeLink);

  // Bind and click upgrade trigger link
  const bound = bindUpgradeTriggerLinks(docMock);
  assert.equal(bound, 1);

  const defaultPrevented = upgradeLink.click();
  assert.equal(defaultPrevented, true, 'Upgrade link click must prevent hash navigation');
  assert.equal(upgradeDlg.open, true, '#dlg-plan-upgrade modal must open');
  assert.equal(upgradeDlg.dataset.requestedTier, 'pro');
  assert.equal(upgradeDlg.dataset.exportContext, 'pdf');
  assert.equal(proCard.classList.contains('highlighted'), true);
  assert.equal(plusCard.classList.contains('highlighted'), false);
  assert.match(contextLead.textContent, /Vector PDF/i);
  assert.equal(docMock.activeElement, upgradeCloseX, 'Focus moves into upgrade modal');

  // Pressing Escape inside upgrade modal closes ONLY upgrade modal and restores focus to upgradeLink
  let escPrevented = false;
  let escStopped = false;
  upgradeDlg.dispatchEvent({
    type: 'keydown',
    key: 'Escape',
    preventDefault() {
      escPrevented = true;
    },
    stopPropagation() {
      escStopped = true;
    },
  });
  assert.equal(escPrevented, true);
  assert.equal(escStopped, true);
  assert.equal(upgradeDlg.open, false, 'Upgrade modal closes on Escape');
  assert.equal(pdfDialog.open, true, 'Underlying PDF export modal stays open');
  assert.equal(docMock.activeElement, upgradeLink, 'Focus returns to upgrade trigger link');

  // Direct openPlanUpgradePrompt for CSV highlights Plus tier
  openPlanUpgradePrompt({
    tier: 'plus',
    exportType: 'csv',
    triggerEl: upgradeLink,
    root: docMock,
  });
  assert.equal(upgradeDlg.open, true);
  assert.equal(plusCard.classList.contains('highlighted'), true);
  assert.equal(proCard.classList.contains('highlighted'), false);
  maybeLaterBtn.click();
  assert.equal(upgradeDlg.open, false);

  cleanupPdfFocus();
});

test('app.js wires initExportModalTierState and bindUpgradeTriggerLinks into #export-pdf, #export-csv, and #export-dxf listeners while preserving file generation functions', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  assert.match(
    appJs,
    /\$\('#export-pdf'\)\?\.addEventListener\('click',[\s\S]*?initExportModalTierState\(dlg\)/
  );
  assert.match(
    appJs,
    /\$\('#export-csv'\)\?\.addEventListener\('click',[\s\S]*?initExportModalTierState\(dlg\)/
  );
  assert.match(
    appJs,
    /\$\('#export-dxf'\)\?\.addEventListener\('click',[\s\S]*?initExportModalTierState\(dlg\)/
  );

  // Verify existing file generation functions remain unchanged and operational
  const sampleState = buildStudio();
  const pdf = generatePDF(sampleState, { pageSize: 'Letter', orientation: 'landscape' });
  assert.ok(pdf.output('arraybuffer').byteLength > 500, 'generatePDF continues to work');

  const csv = generateBOMCSV(sampleState);
  assert.ok(csv.includes('=== PROJECT METADATA ==='), 'generateBOMCSV continues to work');

  const dxf = exportDXF(sampleState, { units: 'inches' });
  assert.ok(dxf.includes('0\nEOF'), 'exportDXF continues to work');
});
