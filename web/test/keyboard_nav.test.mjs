import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('canvas elements in index.html have correct focus and ARIA attributes', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // #plan canvas check
  assert.match(
    html,
    /<canvas\s+id="plan"\s+tabindex="0"\s+role="region"\s+aria-label="2D floor plan"(\s+aria-describedby="[^"]*")?>\s*<\/canvas>/,
    '#plan canvas must accept focus with tabindex="0", role="region", and aria-label'
  );

  // #view3d canvas check
  assert.match(
    html,
    /<canvas\s+id="view3d"\s+tabindex="0"\s+role="region"\s+aria-label="3D viewport"/,
    '#view3d canvas must accept focus with tabindex="0", role="region", and aria-label'
  );
});

test('style.css defines focus rings for canvas elements', () => {
  const cssPath = path.join(__dirname, '../css/style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(
    css.includes('#plan:focus') || css.includes('#plan:focus-visible'),
    'CSS must include focus state for #plan'
  );
  assert.ok(
    css.includes('#view3d:focus') || css.includes('#view3d:focus-visible'),
    'CSS must include focus state for #view3d'
  );
});
