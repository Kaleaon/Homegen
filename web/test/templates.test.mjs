import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate } from '../js/codes.js';
import { TEMPLATES, TEMPLATE_BY_ID, renderTemplatePreviewSVG } from '../js/templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('TEMPLATES gallery offers at least 4 distinct starter layout presets', () => {
  assert.ok(Array.isArray(TEMPLATES));
  assert.ok(TEMPLATES.length >= 4, `Expected at least 4 templates, got ${TEMPLATES.length}`);

  const requiredIds = ['blank', 'studio', 'family_2br', 'multilevel'];
  for (const id of requiredIds) {
    const found = TEMPLATE_BY_ID(id);
    assert.ok(found, `Missing required template id: ${id}`);
    assert.ok(typeof found.title === 'string' && found.title.length > 0);
    assert.ok(typeof found.dimensions === 'string' && found.dimensions.length > 0);
    assert.ok(typeof found.summary === 'string' && found.summary.length > 0);
    assert.ok(typeof found.createState === 'function');
  }
});

test('All starter templates evaluate with zero building code errors', () => {
  for (const template of TEMPLATES) {
    const state = template.createState();
    const report = evaluate(state);
    assert.equal(
      report.errors,
      0,
      `Template "${template.title}" produced ${report.errors} blocking violations: ${JSON.stringify(report.violations.filter((v) => v.severity === 'error'))}`
    );
  }
});

test('renderTemplatePreviewSVG generates valid SVG markup for all template states', () => {
  for (const template of TEMPLATES) {
    const state = template.createState();
    const svg = renderTemplatePreviewSVG(state);
    assert.ok(typeof svg === 'string');
    assert.ok(svg.includes('<svg'), `Template "${template.title}" preview missing <svg tag`);
    assert.ok(svg.includes('</svg>'), `Template "${template.title}" preview missing </svg> tag`);
  }
});

test('index.html contains dlg-templates with correct ARIA accessibility attributes', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /<dialog\s+id="dlg-templates"\s+aria-labelledby="dlg-templates-title"(\s+class="[^"]*")?>/);
  assert.match(html, /<h2\s+id="dlg-templates-title">Choose a Starter Template<\/h2>/);
  assert.match(
    html,
    /<button\s+value="close"\s+aria-label="Close template picker"><span\s+aria-hidden="true">✕<\/span><\/button>/
  );
  assert.match(html, /<div\s+id="template-gallery"\s+class="template-gallery"\s+role="radiogroup"/);
});
