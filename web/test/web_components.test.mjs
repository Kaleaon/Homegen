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

test('k-components.js encapsulates Ktheme tokens and focus ring styles', () => {
  const compPath = path.join(__dirname, '../js/k-components.js');
  const code = fs.readFileSync(compPath, 'utf8');

  assert.ok(code.includes('--ktheme-accent:'), 'Includes --ktheme-accent');
  assert.ok(code.includes('--ktheme-bg-surface:'), 'Includes --ktheme-bg-surface');
  assert.ok(code.includes('--ktheme-border:'), 'Includes --ktheme-border');
  assert.ok(code.includes('--ktheme-text:'), 'Includes --ktheme-text');
  assert.ok(code.includes('--focus-ring-width'), 'Includes focus ring width');
  assert.ok(code.includes('--focus-ring-color'), 'Includes focus ring color');
  assert.ok(code.includes('--focus-ring-offset'), 'Includes focus ring offset');
});
