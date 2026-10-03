import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('index.html buttons have accessible names and aria-label / aria-hidden where appropriate', () => {
  assert.match(
    htmlContent,
    /<button id="undo" [^>]*aria-label="Undo"[^>]*><span aria-hidden="true">↶<\/span><\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="redo" [^>]*aria-label="Redo"[^>]*><span aria-hidden="true">↷<\/span><\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="zoom-out" [^>]*aria-label="Zoom out"[^>]*><span aria-hidden="true">−<\/span><\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="zoom-in" [^>]*aria-label="Zoom in"[^>]*><span aria-hidden="true">\+<\/span><\/button>/
  );
  assert.match(
    htmlContent,
    /<button value="close" [^>]*aria-label="Close photoreal render"[^>]*><span aria-hidden="true">✕<\/span><\/button>/
  );

  assert.match(
    htmlContent,
    /<button data-tool="select" [^>]*><span aria-hidden="true">⬚<\/span> Select<\/button>/
  );
  assert.match(
    htmlContent,
    /<button data-tool="erase" [^>]*><span aria-hidden="true">⌫<\/span> Erase<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="o-eye" [^>]*><span aria-hidden="true">👁<\/span> Eye level<\/button>/
  );
  assert.match(
    htmlContent,
    /<button id="o-photo" [^>]*><span aria-hidden="true">📷<\/span> Photoreal…<\/button>/
  );
});

test('renderLevels in app.js includes aria-label and aria-hidden for add-floor and del-floor', () => {
  assert.match(
    appJsContent,
    /id="add-floor" [^>]*aria-label="Add floor above"[^>]*><span aria-hidden="true">\+<\/span> Floor<\/button>/
  );
  assert.match(
    appJsContent,
    /id="del-floor" [^>]*aria-label="Remove top floor"[^>]*><span aria-hidden="true">−<\/span> Floor<\/button>/
  );
});
