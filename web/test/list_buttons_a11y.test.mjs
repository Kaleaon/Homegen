import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderViolationItem } from '../js/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsPath = path.join(__dirname, '../js/app.js');
const overlaysCssPath = path.join(__dirname, '../css/overlays.css');
const styleCssPath = path.join(__dirname, '../css/style.css');

test('renderViolationItem wraps violation markup in a native <button> with aria-label', () => {
  const violation = {
    id: 'test-v-1',
    rule: 'min-area',
    ref: 'IRC R304.1',
    title: 'Minimum Room Area',
    severity: 'error',
    msg: 'Habitable room size violation',
    fixable: true,
  };

  const html = renderViolationItem(violation);
  assert.match(html, /<li class="v-item">/);
  assert.match(
    html,
    /<button type="button" class="v-item-btn error" data-id="test-v-1" aria-label="Minimum Room Area: Habitable room size violation \(IRC R304\.1\)">/
  );
  assert.match(html, /<b>Minimum Room Area<\/b>/);
  assert.match(html, /<div class="msg">Habitable room size violation<\/div>/);
  assert.match(html, /<\/button>/);
});

test('app.js renderDiffDrawer renders button controls inside list items with aria-label and event bindings', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Verify renderDiffDrawer uses .diff-item-btn buttons
  assert.ok(
    appJs.includes('<button type="button" class="diff-item-btn'),
    'renderDiffDrawer must render <button type="button" class="diff-item-btn">'
  );
  assert.ok(
    appJs.includes('aria-label="Fix ${i + 1}:'),
    'renderDiffDrawer must set descriptive aria-label on button'
  );

  // Verify focus and blur listeners are attached to .diff-item-btn
  assert.ok(
    appJs.includes(".addEventListener('focus', handleHighlight)"),
    'diff-item-btn must bind focus event to handleHighlight'
  );
  assert.ok(
    appJs.includes(".addEventListener('blur', handleClearHighlight)"),
    'diff-item-btn must bind blur event to handleClearHighlight'
  );
  assert.ok(
    appJs.includes(".addEventListener('mouseenter', handleHighlight)"),
    'diff-item-btn must bind mouseenter event to handleHighlight'
  );
  assert.ok(
    appJs.includes(".addEventListener('mouseleave', handleClearHighlight)"),
    'diff-item-btn must bind mouseleave event to handleClearHighlight'
  );
  assert.ok(
    appJs.includes(".addEventListener('click', handleActivate)"),
    'diff-item-btn must bind click event to handleActivate'
  );
});

test('app.js renderCompliance attaches click handler to .v-item-btn elements', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  assert.ok(
    appJs.includes("el.querySelectorAll('.v-item-btn[data-id]')"),
    'renderCompliance must query .v-item-btn[data-id] elements'
  );
});

test('style.css and overlays.css define focus-visible ring rules for list item buttons', () => {
  const overlaysCss = fs.readFileSync(overlaysCssPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');

  assert.ok(
    overlaysCss.includes('.diff-item-btn:focus-visible') &&
      overlaysCss.includes('.v-item-btn:focus-visible'),
    'overlays.css must define :focus-visible rules for list buttons'
  );

  assert.ok(
    styleCss.includes('.diff-item-btn:focus-visible') &&
      styleCss.includes('.v-item-btn:focus-visible'),
    'style.css must define :focus-visible rules for list buttons'
  );
});
