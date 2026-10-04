import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('overlays.css module defines component custom properties mapped to Ktheme tokens', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  assert.ok(fs.existsSync(cssPath), 'web/css/overlays.css must exist');

  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify internal component variables
  assert.ok(css.includes('--overlay-bg:'), 'overlays.css must define --overlay-bg');
  assert.ok(css.includes('--overlay-border:'), 'overlays.css must define --overlay-border');
  assert.ok(css.includes('--overlay-radius:'), 'overlays.css must define --overlay-radius');
  assert.ok(css.includes('--overlay-blur:'), 'overlays.css must define --overlay-blur');
  assert.ok(css.includes('--overlay-shadow:'), 'overlays.css must define --overlay-shadow');

  // Verify mapping to canonical Ktheme tokens
  assert.ok(css.includes('--ktheme-bg-surface'), 'overlays.css must map --overlay-bg to --ktheme-bg-surface');
  assert.ok(css.includes('--ktheme-border'), 'overlays.css must map --overlay-border to --ktheme-border');
  assert.ok(css.includes('--radius-lg'), 'overlays.css must map --overlay-radius to --radius-lg');
  assert.ok(css.includes('--shadow-lg'), 'overlays.css must map --overlay-shadow to --shadow-lg');
});

test('overlays.css defines required BEM component overlay classes', () => {
  const cssPath = path.join(__dirname, '../css/overlays.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.k-overlay-dialog'), 'overlays.css must define .k-overlay-dialog');
  assert.ok(css.includes('.k-overlay-drawer'), 'overlays.css must define .k-overlay-drawer');
  assert.ok(css.includes('.k-overlay-hud'), 'overlays.css must define .k-overlay-hud');
  assert.ok(css.includes('.k-overlay-card'), 'overlays.css must define .k-overlay-card');
});

test('index.html links tokens.css, style.css, and overlays.css in correct order', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const tokensIdx = html.indexOf('css/tokens.css');
  const styleIdx = html.indexOf('css/style.css');
  const overlaysIdx = html.indexOf('css/overlays.css');

  assert.ok(tokensIdx !== -1, 'index.html must link css/tokens.css');
  assert.ok(styleIdx !== -1, 'index.html must link css/style.css');
  assert.ok(overlaysIdx !== -1, 'index.html must link css/overlays.css');

  assert.ok(tokensIdx < styleIdx, 'tokens.css must be loaded before style.css');
  assert.ok(styleIdx < overlaysIdx, 'style.css must be loaded before overlays.css');
});

test('index.html applies BEM overlay classes to floating elements and replaces inline styles on #svg-preview', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Check dialogs have k-overlay-dialog class
  assert.ok(html.includes('class="k-overlay-dialog"') || html.includes('k-overlay-dialog'), 'dialogs in index.html must use k-overlay-dialog class');

  // Check diff-drawer has k-overlay-drawer
  assert.ok(html.includes('k-overlay-drawer'), '#diff-drawer in index.html must use k-overlay-drawer class');

  // Check walkthrough-hud has k-overlay-hud
  assert.ok(html.includes('k-overlay-hud'), '#walkthrough-hud in index.html must use k-overlay-hud class');

  // Check svg-preview uses k-overlay-card and lacks inline style
  assert.match(html, /<div\s+id="svg-preview"\s+class="k-overlay-card"><\/div>/, '#svg-preview must use k-overlay-card class without inline style');
});
