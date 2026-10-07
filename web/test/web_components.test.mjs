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

test('customElements registers <k-button>, <k-input>, <k-tab>, <k-card>', () => {
  assert.ok(customElements.get('k-button'), 'k-button element registered');
  assert.ok(customElements.get('k-input'), 'k-input element registered');
  assert.ok(customElements.get('k-tab'), 'k-tab element registered');
  assert.ok(customElements.get('k-card'), 'k-card element registered');
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
    { name: 'k-tab', cls: customElements.get('k-tab') },
    { name: 'k-card', cls: customElements.get('k-card') },
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
