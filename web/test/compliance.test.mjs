import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as m from '../js/model.js';
import { evaluate, CODE_MAP, getRuleCategory } from '../js/codes.js';
import { renderViolationItem } from '../js/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('CODE_MAP maps regulatory codes and rules to plain-language categories', () => {
  assert.equal(CODE_MAP['IRC R304.1'], 'Minimum Room Area');
  assert.equal(CODE_MAP['IRC R304.2'], 'Minimum Room Dimension');
  assert.equal(CODE_MAP['IRC R305.1'], 'Ceiling Height');
  assert.equal(CODE_MAP['IRC R310.1'], 'Emergency Egress');
  assert.equal(CODE_MAP['IRC R314.3'], 'Smoke Alarms');
  assert.equal(CODE_MAP['NEC 210.52'], 'Outlet Spacing');
  assert.equal(CODE_MAP['NEC 210.8'], 'GFCI Protection');
  assert.equal(CODE_MAP['Geometry'], 'Spatial Layout');
  assert.equal(CODE_MAP['Practice'], 'Design Guidance');
});

test('getRuleCategory falls back to Design Guidance for unmapped rules/citations', () => {
  assert.equal(getRuleCategory('IRC R304.1', 'min-area'), 'Minimum Room Area');
  assert.equal(getRuleCategory('UNKNOWN_REF_999', 'unknown_rule'), 'Design Guidance');
  assert.equal(getRuleCategory(undefined, undefined), 'Design Guidance');
});

test('evaluate() attaches human-centered metadata to violation records', () => {
  let s = m.newState();
  // Create an undersized habitable room (bedroom) to trigger min-area violation
  m.createRoom(s, 'bedroom', 0, 0, 72, 72); // 36 sq ft < 70 sq ft
  const rep = evaluate(s);
  assert.ok(rep.violations.length > 0);

  const minAreaViolation = rep.violations.find((v) => v.rule === 'min-area');
  assert.ok(minAreaViolation, 'Should have min-area violation');
  assert.equal(minAreaViolation.title, 'Minimum Room Area');
  assert.equal(minAreaViolation.category, 'Minimum Room Area');
  assert.equal(minAreaViolation.label, 'Minimum Room Area');
  assert.equal(minAreaViolation.ref, 'IRC R304.1');
});

test('renderViolationItem displays plain-language titles and technical citations as secondary references with tooltips', () => {
  const violation = {
    id: 'min-area:1',
    rule: 'min-area',
    ref: 'IRC R304.1',
    title: 'Minimum Room Area',
    category: 'Minimum Room Area',
    severity: 'error',
    blocking: true,
    msg: 'Bedroom: habitable rooms need at least 70 sq ft (this is 36).',
    fixable: true,
  };

  const html = renderViolationItem(violation);
  assert.match(html, /<b>Minimum Room Area<\/b>/, 'Header should be plain-language title');
  assert.match(
    html,
    /<div class="msg">Bedroom: habitable rooms need at least 70 sq ft \(this is 36\)\.<\/div>/,
    'Message body should be in .msg container'
  );
  assert.match(
    html,
    /<span class="ref" title="IRC R304\.1">IRC R304\.1 · auto-fixable<\/span>/,
    'Citation should be formatted as secondary reference with tooltip'
  );
});

test('renderViolationItem defaults gracefully to Design Guidance for unmapped or custom violations', () => {
  const customViolation = {
    id: 'custom:1',
    rule: 'custom-check',
    ref: 'CUSTOM 100',
    severity: 'warn',
    blocking: false,
    msg: 'Custom rule warning.',
  };

  const html = renderViolationItem(customViolation);
  assert.match(
    html,
    /<b>Design Guidance<\/b>/,
    'Unmapped violation should default title to Design Guidance'
  );
  assert.match(
    html,
    /<span class="ref" title="CUSTOM 100">CUSTOM 100<\/span>/,
    'Secondary citation should render with tooltip'
  );
});

test('compliance drawer markup and stylesheet rules bind directly to Ktheme status tokens', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const srcCss = fs.readFileSync(path.join(__dirname, '../css/src/style.css'), 'utf8');

  assert.ok(
    appJs.includes('border-color:var(--ktheme-success)'),
    'Compliant empty-violation list item binds to --ktheme-success'
  );
  assert.ok(
    appJs.includes('border-color:var(--ktheme-text-muted)'),
    'Empty plan compliance list item binds to --ktheme-text-muted'
  );
  assert.ok(
    !appJs.includes('border-color:var(--ok)') && !appJs.includes('border-color:var(--muted)'),
    'renderCompliance does not use legacy --ok or --muted inline variables'
  );

  assert.match(srcCss, /\.chip\s*\{[^}]*background:\s*var\(--ktheme-critical\)/);
  assert.match(srcCss, /\.chip\.ok\s*\{[^}]*background:\s*var\(--ktheme-success\)/);
  assert.match(srcCss, /\.chip\.mid\s*\{[^}]*background:\s*var\(--ktheme-warning\)/);
  assert.match(srcCss, /\.v-item-btn\s*\{[^}]*border-left:\s*3px solid var\(--ktheme-critical\)/);
  assert.match(srcCss, /\.v-item-btn\.warn\s*\{[^}]*border-left-color:\s*var\(--ktheme-warning\)/);
});
