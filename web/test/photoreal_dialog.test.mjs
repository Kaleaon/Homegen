import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('web/index.html includes required ARIA attributes on photoreal dialog and close button', () => {
  const htmlPath = path.join(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify <dialog id="photo"> has aria-labelledby="photo-title"
  assert.match(html, /<dialog\s+id="photo"\s+aria-labelledby="photo-title">/);

  // Verify <h2 id="photo-title">Photoreal render</h2> exists inside dialog
  assert.match(html, /<h2\s+id="photo-title">Photoreal render<\/h2>/);

  // Verify header close button has aria-label="Close photoreal render"
  assert.match(html, /<button\s+value="close"\s+aria-label="Close photoreal render"><span\s+aria-hidden="true">✕<\/span><\/button>/);
});

test('web/js/ui3d.js manages focus when opening and closing photoreal dialog', async () => {
  const jsPath = path.join(__dirname, '../js/ui3d.js');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Verify openPhoto captures trigger element and sets focus to #p-room
  assert.match(js, /triggerEl\s*=\s*\(e\s*&&\s*e\.currentTarget\)\s*\|\|\s*\$\('#o-photo'\);/);
  assert.match(js, /\$\('#p-room'\)/);
  assert.match(js, /pRoom\.focus\(\)/);

  // Verify close listener restores focus to trigger element
  assert.match(js, /dlg\.addEventListener\('close'/);
  assert.match(js, /trigger\.focus\(\)/);
});
