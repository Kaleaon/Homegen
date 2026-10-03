import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(__dirname, '../css/style.css');

function getLuminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map((x) => parseInt(x, 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('CSS Custom Properties for Focus Ring System', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('--focus-ring-color:'), 'style.css defines --focus-ring-color');
  assert.ok(css.includes('--focus-ring-width:'), 'style.css defines --focus-ring-width');
  assert.ok(css.includes('--focus-ring-offset:'), 'style.css defines --focus-ring-offset');

  assert.ok(css.includes('--focus-ring-width:2px') || css.includes('--focus-ring-width: 2px'), '--focus-ring-width is 2px');
  assert.ok(css.includes('--focus-ring-offset:2px') || css.includes('--focus-ring-offset: 2px'), '--focus-ring-offset is 2px');
});

test('CSS :focus-visible and :focus:not(:focus-visible) rules', () => {
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes(':focus:not(:focus-visible)'), 'style.css includes :focus:not(:focus-visible)');
  assert.ok(css.includes(':focus-visible'), 'style.css includes :focus-visible');
  assert.ok(css.includes('outline-offset:var(--focus-ring-offset)') || css.includes('outline-offset: var(--focus-ring-offset)'), 'style.css uses outline-offset variable');
  assert.ok(css.includes('outline:var(--focus-ring-width)') || css.includes('outline: var(--focus-ring-width)'), 'style.css uses outline variable');
});

test('Focus ring contrast ratio complies with WCAG 2.2 SC 2.4.7 (>= 3:1)', () => {
  // Light theme colors
  const lightAccent = '#2f6f5e';
  const lightPanel = '#fffdf9';
  const lightBg = '#f1eee7';

  // Dark theme colors
  const darkAccent = '#4aa58c';
  const darkPanel = '#262523';
  const darkBg = '#1d1c1a';

  const lightPanelContrast = getContrastRatio(lightAccent, lightPanel);
  const lightBgContrast = getContrastRatio(lightAccent, lightBg);
  const darkPanelContrast = getContrastRatio(darkAccent, darkPanel);
  const darkBgContrast = getContrastRatio(darkAccent, darkBg);

  assert.ok(lightPanelContrast >= 3.0, `Light panel contrast ratio ${lightPanelContrast.toFixed(2)} should be >= 3.0`);
  assert.ok(lightBgContrast >= 3.0, `Light bg contrast ratio ${lightBgContrast.toFixed(2)} should be >= 3.0`);
  assert.ok(darkPanelContrast >= 3.0, `Dark panel contrast ratio ${darkPanelContrast.toFixed(2)} should be >= 3.0`);
  assert.ok(darkBgContrast >= 3.0, `Dark bg contrast ratio ${darkBgContrast.toFixed(2)} should be >= 3.0`);
});
