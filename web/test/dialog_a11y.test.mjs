import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('HTML dialogs and diff-drawer have accessible ARIA names and roles in index.html', () => {
  // dlg-export
  assert.match(
    htmlContent,
    /<dialog id="dlg-export" aria-labelledby="dlg-export-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="dlg-export-title">SVG Vector Export &amp; Print Sheet<\/h2>/);
  assert.match(
    htmlContent,
    /<button value="close" aria-label="Close SVG export modal"><span aria-hidden="true">✕<\/span><\/button>/
  );

  // pdf-export
  assert.match(
    htmlContent,
    /<dialog id="pdf-export" aria-labelledby="pdf-export-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="pdf-export-title">Export Scaled Vector PDF<\/h2>/);
  assert.match(
    htmlContent,
    /<button value="close" aria-label="Close PDF export modal"><span aria-hidden="true">✕<\/span><\/button>/
  );

  // calib-dlg
  assert.match(
    htmlContent,
    /<dialog id="calib-dlg" aria-labelledby="calib-dlg-title" class="k-overlay-dialog">/
  );
  assert.match(htmlContent, /<h2 id="calib-dlg-title">Calibrate Blueprint Scale<\/h2>/);
  assert.match(
    htmlContent,
    /<button type="button" id="calib-close" aria-label="Close scale calibration modal">✕<\/button>/
  );

  // diff-drawer
  assert.match(
    htmlContent,
    /<div id="diff-drawer" class="diff-drawer k-overlay-drawer" role="dialog" aria-modal="true" aria-labelledby="diff-drawer-title" hidden>/
  );
  assert.match(htmlContent, /<h2 id="diff-drawer-title">✨ Auto-Fix Summary<\/h2>/);
  assert.match(
    htmlContent,
    /<button id="diff-close" class="diff-close-btn" title="Dismiss highlights" aria-label="Dismiss highlights">✕<\/button>/
  );
});

test('app.js exports trapFocus and binds focus trapping to overlays', () => {
  assert.ok(appJsContent.includes('function trapFocus('), 'app.js must define trapFocus');
  assert.ok(appJsContent.includes('trapFocus(dlg,'), 'app.js must trap focus in dialogs');
  assert.ok(appJsContent.includes('trapFocus(drawer,'), 'app.js must trap focus in diff-drawer');
});
