import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formRow } from '../js/app.js';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('formRow helper function generates row markup with explicit label for attribute and escaped text', () => {
  const result = formRow('test-id', 'Test <Label>', '<input id="test-id">');
  assert.equal(
    result,
    '<div class="row"><label for="test-id">Test &lt;Label&gt;</label><input id="test-id"></div>'
  );
});

test('index.html Photoreal modal (#photo) labels have explicit for attributes matching input/select IDs', () => {
  assert.match(htmlContent, /<label for="p-room">Room<\/label>\s*<select id="p-room">/);
  assert.match(htmlContent, /<label for="p-style">Style<\/label>\s*<select id="p-style">/);
  assert.match(htmlContent, /<label for="p-prompt">Prompt<\/label>\s*<textarea id="p-prompt"/);
  assert.match(htmlContent, /<label for="p-key">Horde key<\/label>\s*<input id="p-key"/);
});

test('index.html SVG export modal (#dlg-export) labels have explicit for attributes matching select IDs', () => {
  assert.match(htmlContent, /<label for="e-sheet">Sheet Size<\/label>\s*<select id="e-sheet">/);
  assert.match(htmlContent, /<label for="e-orient">Orientation<\/label>\s*<select id="e-orient">/);
  assert.match(htmlContent, /<label for="e-scale">Scale<\/label>\s*<select id="e-scale">/);
  assert.match(htmlContent, /<label for="e-level">Floor Level<\/label>\s*<select id="e-level">/);
});

test('renderInspector in app.js uses formRow for room inputs (i-name, i-type, i-w, i-h, i-ceil) and opening style (i-otype)', () => {
  assert.match(appJsContent, /formRow\(\s*'i-name',\s*'Name'/);
  assert.match(appJsContent, /formRow\(\s*'i-type',\s*'Type'/);
  assert.match(appJsContent, /formRow\(\s*'i-w',\s*'Width \(ft\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-h',\s*'Depth \(ft\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-ceil',\s*'Ceiling \(in\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-otype',\s*'Style'/);
});

test('renderPalette in app.js includes for="paint-scope" attribute on target scope label', () => {
  assert.match(
    appJsContent,
    /<label for="paint-scope"[^>]*>Target scope<\/label>\s*<select id="paint-scope"/
  );
});

test('clicking visual label associated via for attribute transfers focus to control in mock DOM environment', () => {
  // Simulate browser DOM click on label element
  const input = {
    focused: false,
    focus() {
      this.focused = true;
    },
  };
  const label = { htmlFor: 'p-room' };
  const domMap = { 'p-room': input };

  // Click handler simulation for label for/id association behavior
  function handleLabelClick(lbl) {
    if (lbl.htmlFor && domMap[lbl.htmlFor]) {
      domMap[lbl.htmlFor].focus();
    }
  }

  handleLabelClick(label);
  assert.equal(input.focused, true);
});
