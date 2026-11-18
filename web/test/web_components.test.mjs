import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (typeof customElements === 'undefined') {
  const registry = new Map();
  global.customElements = {
    define: (name, constructor) => registry.set(name, constructor),
    get: (name) => registry.get(name),
  };
}

// Import custom elements definition
await import('../js/k-components.js');

test('customElements registers <k-button>, <k-input>, <k-select>, <k-tab>, <k-card>, <k-popover>', () => {
  assert.ok(customElements.get('k-button'), 'k-button element registered');
  assert.ok(customElements.get('k-input'), 'k-input element registered');
  assert.ok(customElements.get('k-select'), 'k-select element registered');
  assert.ok(customElements.get('k-tab'), 'k-tab element registered');
  assert.ok(customElements.get('k-card'), 'k-card element registered');
  assert.ok(customElements.get('k-popover'), 'k-popover element registered');
});

test('index.html uses <k-input> and <k-button> for header controls and <k-tab> for tabs', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Header input
  assert.match(
    html,
    /<k-input id="plan-name" [^>]*value="My home"><\/k-input>/,
    'Header plan-name uses <k-input>'
  );

  // Header buttons
  assert.match(html, /<k-button id="undo" [^>]*aria-label="Undo">/, 'Header #undo uses <k-button>');
  assert.match(html, /<k-button id="redo" [^>]*aria-label="Redo">/, 'Header #redo uses <k-button>');
  assert.match(html, /<k-button id="sample">/, 'Header #sample uses <k-button>');
  assert.match(html, /<k-button id="new">/, 'Header #new uses <k-button>');
  assert.match(html, /<k-button id="save">/, 'Header #save uses <k-button>');
  assert.match(html, /<k-button id="load">/, 'Header #load uses <k-button>');
  assert.match(html, /<k-button id="export-pdf">/, 'Header #export-pdf uses <k-button>');

  // Navigation tabs
  assert.match(
    html,
    /<nav id="tabs"[^>]*>\s*<k-tab [^>]*data-tab="build"[^>]*active[^>]*>Build<\/k-tab>/,
    'Navigation tabs use <k-tab> with active state'
  );
  assert.match(html, /<k-tab [^>]*data-tab="buy"[^>]*>Buy<\/k-tab>/, 'Buy tab uses <k-tab>');
  assert.match(html, /<k-tab [^>]*data-tab="paint"[^>]*>Paint<\/k-tab>/, 'Paint tab uses <k-tab>');
  assert.match(html, /<k-tab [^>]*data-tab="kits"[^>]*>Kits<\/k-tab>/, 'Kits tab uses <k-tab>');
});

test('app.js card generator renders <k-card> elements', () => {
  const appJsPath = path.join(__dirname, '../js/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  assert.match(
    appJs,
    /<k-card class="card \${on \? 'on' : ''}" \${on \? 'active selected' : ''} \${attrs}>/,
    'card() function generates <k-card> elements'
  );
});

test('k-components.js encapsulates Ktheme tokens and focus ring styles without :host shadowing', () => {
  const compPath = path.join(__dirname, '../js/k-components.js');
  const code = fs.readFileSync(compPath, 'utf8');

  // Verify :host block in KTHEME_STYLES does not re-declare --ktheme-* tokens (preventing shadowing)
  const hostMatch = code.match(/const KTHEME_STYLES = `\s*:host\s*\{([^}]*)\}/);
  assert.ok(hostMatch, 'KTHEME_STYLES :host block found');
  const hostContent = hostMatch[1];
  assert.ok(!hostContent.includes('--ktheme-accent:'), ':host must not redefine --ktheme-accent');
  assert.ok(
    !hostContent.includes('--ktheme-bg-surface:'),
    ':host must not redefine --ktheme-bg-surface'
  );
  assert.ok(!hostContent.includes('--ktheme-border:'), ':host must not redefine --ktheme-border');
  assert.ok(!hostContent.includes('--ktheme-text:'), ':host must not redefine --ktheme-text');

  // Verify components use multi-level fallback chains for canonical Ktheme tokens
  assert.ok(
    code.includes('var(--ktheme-accent, var(--accent, #2f6f5e))'),
    'Includes --ktheme-accent fallback chain'
  );
  assert.ok(
    code.includes('var(--ktheme-bg-surface, var(--panel, #fffdf9))'),
    'Includes --ktheme-bg-surface fallback chain'
  );
  assert.ok(
    code.includes('var(--ktheme-border, var(--line, #ded8cb))'),
    'Includes --ktheme-border fallback chain'
  );
  assert.ok(
    code.includes('var(--ktheme-text, var(--ink, #2b2824))'),
    'Includes --ktheme-text fallback chain'
  );
  assert.ok(
    code.includes('var(--ktheme-text-muted, var(--muted, #5f5950))'),
    'Includes --ktheme-text-muted fallback chain'
  );
  assert.ok(
    code.includes('var(--ktheme-accent-ink, var(--accent-ink, #ffffff))'),
    'Includes --ktheme-accent-ink fallback chain'
  );

  // Focus ring properties retained on :host
  assert.ok(code.includes('--focus-ring-width'), 'Includes focus ring width');
  assert.ok(code.includes('--focus-ring-color'), 'Includes focus ring color');
  assert.ok(code.includes('--focus-ring-offset'), 'Includes focus ring offset');
});

test('shadow DOM components inherit document-level Ktheme tokens without :host shadowing', () => {
  const components = [
    { name: 'k-button', cls: customElements.get('k-button') },
    { name: 'k-input', cls: customElements.get('k-input') },
    { name: 'k-select', cls: customElements.get('k-select') },
    { name: 'k-tab', cls: customElements.get('k-tab') },
    { name: 'k-card', cls: customElements.get('k-card') },
    { name: 'k-popover', cls: customElements.get('k-popover') },
  ];

  for (const { name, cls } of components) {
    let shadowRoot = null;
    cls.prototype.attachShadow = function ({ mode: _mode }) {
      shadowRoot = {
        innerHTML: '',
        querySelector: () => ({ addEventListener: () => {}, classList: { toggle: () => {} } }),
      };
      this.shadowRoot = shadowRoot;
      return shadowRoot;
    };
    cls.prototype.setAttribute = function () {};
    cls.prototype.removeAttribute = function () {};
    cls.prototype.hasAttribute = function () {
      return false;
    };
    cls.prototype.getAttribute = function () {
      return null;
    };
    cls.prototype.dispatchEvent = function () {};

    const inst = new cls();
    const styleContent = inst.shadowRoot
      ? inst.shadowRoot.innerHTML
      : shadowRoot
        ? shadowRoot.innerHTML
        : '';
    assert.ok(styleContent, `${name} shadow root populated with styles`);

    // Ensure :host block inside component shadow DOM does not redefine --ktheme-* variables
    const hostBlockMatch = styleContent.match(/:host\s*\{([^}]*)\}/);
    if (hostBlockMatch) {
      const hostCss = hostBlockMatch[1];
      assert.ok(
        !hostCss.includes('--ktheme-accent:'),
        `${name} :host block must not shadow --ktheme-accent`
      );
      assert.ok(
        !hostCss.includes('--ktheme-bg-surface:'),
        `${name} :host block must not shadow --ktheme-bg-surface`
      );
      assert.ok(
        !hostCss.includes('--ktheme-text:'),
        `${name} :host block must not shadow --ktheme-text`
      );
    }

    // Ensure element styles reference canonical --ktheme-* tokens with legacy fallbacks
    assert.ok(
      styleContent.includes('var(--ktheme-'),
      `${name} shadow styles must reference canonical --ktheme-* design tokens`
    );
  }
});

test('modal dialogs in index.html use Ktheme custom elements (<k-select>, <k-input>, <k-button>, <k-tab>)', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const extractDialog = (id) => {
    const m = html.match(new RegExp(`<dialog[^>]*id="${id}"[\\s\\S]*?<\\/dialog>`));
    assert.ok(m, `Dialog #${id} must exist in index.html`);
    return m[0];
  };

  // #dlg-export
  const dlgExport = extractDialog('dlg-export');
  assert.match(dlgExport, /<k-select id="e-sheet">/);
  assert.match(dlgExport, /<k-select id="e-orient">/);
  assert.match(dlgExport, /<k-select id="e-scale">/);
  assert.match(dlgExport, /<k-select id="e-level"><\/k-select>/);
  assert.match(dlgExport, /<k-button id="e-download" primary>/);
  assert.match(dlgExport, /<k-button id="e-print" primary>/);
  assert.doesNotMatch(dlgExport, /<select\b/);

  // #pdf-export
  const pdfExport = extractDialog('pdf-export');
  assert.match(pdfExport, /<k-select id="pdf-size">/);
  assert.match(pdfExport, /<k-select id="pdf-orientation">/);
  assert.match(pdfExport, /<k-select id="pdf-scale">/);
  assert.match(pdfExport, /<k-select id="pdf-level">/);
  assert.match(pdfExport, /<k-select id="pdf-branding-mode">/);
  assert.match(pdfExport, /<k-input id="pdf-title"/);
  assert.match(pdfExport, /<k-input id="pdf-designer"/);
  assert.match(pdfExport, /<k-input id="pdf-date" type="date"/);
  assert.match(pdfExport, /<k-input id="pdf-subtitle"/);
  assert.match(pdfExport, /<k-input id="pdf-session-stamp-title"/);
  assert.match(pdfExport, /<k-input id="pdf-session-watermark"/);
  assert.match(pdfExport, /<k-button id="pdf-cancel"/);
  assert.match(pdfExport, /<k-button id="pdf-generate" primary/);
  assert.doesNotMatch(pdfExport, /<select\b/);

  // #csv-export
  const csvExport = extractDialog('csv-export');
  assert.match(csvExport, /<k-button id="csv-cancel"/);
  assert.match(csvExport, /<k-button id="csv-generate" primary/);

  // #dxf-export
  const dxfExport = extractDialog('dxf-export');
  assert.match(dxfExport, /<k-select id="dxf-units">/);
  assert.match(dxfExport, /<k-select id="dxf-level"><\/k-select>/);
  assert.match(dxfExport, /<k-button id="dxf-cancel"/);
  assert.match(dxfExport, /<k-button id="dxf-generate" primary/);
  assert.doesNotMatch(dxfExport, /<select\b/);

  // #dlg-branding
  const dlgBranding = extractDialog('dlg-branding');
  assert.match(dlgBranding, /<k-tab class="tab-btn on" active data-bsection="stamp"/);
  assert.match(dlgBranding, /<k-tab class="tab-btn" data-bsection="logo"/);
  assert.match(dlgBranding, /<k-tab class="tab-btn" data-bsection="watermark"/);
  assert.match(dlgBranding, /<k-select id="stamp-shape">/);
  assert.match(dlgBranding, /<k-select id="stamp-border-style">/);
  assert.match(dlgBranding, /<k-input id="stamp-title"/);
  assert.match(dlgBranding, /<k-input type="file" id="logo-file"/);
  assert.match(dlgBranding, /<k-button id="logo-clear-btn"/);
  assert.match(dlgBranding, /<k-button id="branding-cancel"/);
  assert.match(dlgBranding, /<k-button id="branding-save" primary/);
  assert.doesNotMatch(dlgBranding, /<select\b/);

  // #dlg-gis
  const dlgGis = extractDialog('dlg-gis');
  assert.match(dlgGis, /<k-select id="gis-crs">/);
  assert.match(dlgGis, /<k-select id="gis-map-preset">/);
  assert.match(dlgGis, /<k-button type="button" id="gis-load-sample" primary>/);
  assert.match(dlgGis, /<k-button type="button" id="gis-import-file">/);
  assert.match(dlgGis, /<k-button type="button" id="gis-done" primary>/);
  assert.doesNotMatch(dlgGis, /<select\b/);

  // #calib-dlg
  const calibDlg = extractDialog('calib-dlg');
  assert.match(calibDlg, /<k-input id="calib-distance"/);
  assert.match(calibDlg, /<k-button type="submit" id="calib-submit" primary>/);
  assert.match(calibDlg, /<k-button type="button" id="calib-cancel">/);

  // #dlg-add-room-dims
  const roomDimsDlg = extractDialog('dlg-add-room-dims');
  assert.match(roomDimsDlg, /<k-select id="room-dims-type">/);
  assert.match(roomDimsDlg, /<k-input id="room-dims-width"/);
  assert.match(roomDimsDlg, /<k-input id="room-dims-depth"/);
  assert.match(roomDimsDlg, /<k-input id="room-dims-x"/);
  assert.match(roomDimsDlg, /<k-input id="room-dims-y"/);
  assert.match(roomDimsDlg, /<k-button id="btn-add-room-dims-submit" primary/);
  assert.match(roomDimsDlg, /<k-button id="btn-add-room-dims-cancel"/);
  assert.doesNotMatch(roomDimsDlg, /<select\b/);
});

test('style.css defines .row layout rules targeting k-input, k-select, and k-button', () => {
  const cssPath = path.join(__dirname, '../css/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    css,
    /\.row\s+k-input,\s*\.row\s+k-select,\s*\.row\s+k-button\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0;/,
    'style.css must apply flex: 1 and min-width: 0 to .row k-input, .row k-select, and .row k-button'
  );
});

test('KSelect synchronizes dynamically populated options and preserves slot outside select', () => {
  const KSelect = customElements.get('k-select');
  let lightOptions = [];
  const attrs = new Map();

  const makeShadowSelect = () => {
    const opts = [];
    let currentVal = '';
    return {
      get options() {
        return opts;
      },
      get innerHTML() {
        return '';
      },
      set innerHTML(_v) {
        opts.length = 0;
        currentVal = '';
      },
      appendChild(opt) {
        opts.push(opt);
        if (opt.selected || opts.length === 1) currentVal = opt.value;
      },
      get value() {
        return currentVal;
      },
      set value(v) {
        if (opts.some((o) => o.value === v)) currentVal = v;
      },
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
    };
  };

  const inst = Object.create(KSelect.prototype);
  inst._select = makeShadowSelect();
  inst.querySelectorAll = (sel) => (sel === 'option' ? lightOptions : []);
  inst.hasAttribute = (k) => attrs.has(k);
  inst.getAttribute = (k) => attrs.get(k) ?? null;
  inst.setAttribute = (k, v) => attrs.set(k, String(v));
  inst.removeAttribute = (k) => attrs.delete(k);

  const mkOpt = (value, textContent, selected = false) => ({
    value,
    textContent,
    selected,
    disabled: false,
    cloneNode: () => ({ value, textContent, selected, disabled: false }),
  });

  // 1. Dynamic population from empty (#e-level) + immediate synchronous .value write/read
  lightOptions = [mkOpt('0', 'Floor 1'), mkOpt('1', 'Floor 2'), mkOpt('all', 'All Floors')];
  inst.value = '1';
  assert.equal(inst.value, '1');
  assert.equal(inst._select.options.length, 3);

  // 2. Same-length option label replacement (#pdf-level) updates cloned options
  lightOptions = [
    mkOpt('all', 'All levels (Multi-page)', true),
    mkOpt('0', 'Level 1 (Current)'),
    mkOpt('1', 'Level 2'),
  ];
  inst.value = 'all';
  assert.equal(inst.value, 'all');
  assert.equal(inst._select.options[1].textContent, 'Level 1 (Current)');

  // 3. Verify shadow markup keeps <slot> outside <select> so innerHTML clearing preserves slotchange
  const compCode = fs.readFileSync(path.join(__dirname, '../js/k-components.js'), 'utf8');
  assert.match(compCode, /<select part="select"><\/select>\s*<slot hidden><\/slot>/);
});

test('KButton type="submit" triggers ancestor form submission and method="dialog" close fallback', () => {
  const KButton = customElements.get('k-button');
  let clickHandler = null;
  let submitted = false;
  let dialogClosed = false;

  const mockDialog = {
    close: () => {
      dialogClosed = true;
    },
  };
  const mockForm = {
    querySelectorAll: () => [],
    getAttribute: (k) => (k === 'method' ? 'dialog' : null),
    closest: (sel) => (sel === 'dialog' ? mockDialog : null),
    dispatchEvent: (evt) => {
      if (evt.type === 'submit') submitted = true;
      return true;
    },
  };

  KButton.prototype.attachShadow = function () {
    const btn = {
      addEventListener: (type, fn) => {
        if (type === 'click') clickHandler = fn;
      },
      click: () => {
        if (clickHandler) clickHandler({});
      },
      classList: { toggle: () => {} },
    };
    this.shadowRoot = {
      innerHTML: '',
      querySelector: () => btn,
    };
    return this.shadowRoot;
  };
  KButton.prototype.hasAttribute = function (k) {
    return k === 'type';
  };
  KButton.prototype.getAttribute = function (k) {
    return k === 'type' ? 'submit' : null;
  };
  KButton.prototype.closest = function (sel) {
    return sel === 'form' ? mockForm : null;
  };

  const submitBtn = new KButton();
  submitBtn.click();

  assert.equal(submitted, true, 'Clicking <k-button type="submit"> must dispatch form submit');
  assert.equal(dialogClosed, true, 'Unprevented method="dialog" submit must close ancestor dialog');
});
