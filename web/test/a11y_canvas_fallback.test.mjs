import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { updatePlanA11yTree } from '../js/app.js';
import { updateView3dA11yTree } from '../js/scene3d.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../index.html');
const cssPath = path.join(__dirname, '../css/style.css');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const cssContent = fs.readFileSync(cssPath, 'utf8');

test('index.html associates #plan and #view3d with offscreen ARIA live regions', () => {
  assert.match(
    htmlContent,
    /<canvas id="plan" [^>]*aria-describedby="plan-fallback-summary"[^>]*><\/canvas>/
  );
  assert.match(
    htmlContent,
    /<div id="plan-fallback-summary" class="sr-only" aria-live="polite"><\/div>/
  );
  assert.match(
    htmlContent,
    /<canvas id="view3d" [^>]*aria-describedby="view3d-fallback-summary"[^>]*><\/canvas>/
  );
  assert.match(
    htmlContent,
    /<div id="view3d-fallback-summary" class="sr-only" aria-live="polite"><\/div>/
  );
});

test('css/style.css defines standard .sr-only utility class for visually hidden text', () => {
  assert.match(cssContent, /\.sr-only\s*\{/);
  assert.match(cssContent, /position:\s*absolute\s*!important/);
  assert.match(cssContent, /clip:\s*rect\(0,\s*0,\s*0,\s*0\)\s*!important/);
});

test('updatePlanA11yTree updates fallback DOM for empty and non-empty levels', async () => {
  const mockElements = {};
  global.document = {
    getElementById(id) {
      if (!mockElements[id]) {
        mockElements[id] = { innerHTML: '', textContent: '' };
      }
      return mockElements[id];
    },
  };

  // Test empty state
  updatePlanA11yTree({ rooms: [] }, 0);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const container = document.getElementById('plan-fallback-summary');
  assert.equal(
    container.innerHTML,
    '<p>Level 1 is empty. Use drafting tools to add rooms or furniture.</p>'
  );

  // Test state with rooms, items, and openings
  const state = {
    rooms: [
      {
        id: 'r1',
        name: 'Living Room',
        level: 0,
        w: 144, // 12 ft
        h: 180, // 15 ft
        items: [{ type: 'sofa' }],
        openings: [{ type: 'door' }],
      },
    ],
  };

  updatePlanA11yTree(state, 0);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.match(container.innerHTML, /Level 1 floorplan contains 1 room\(s\):/);
  assert.match(container.innerHTML, /<strong>Living Room<\/strong>: 12 ft by 15 ft\./);
  assert.match(container.innerHTML, /Openings: door\./i);
  assert.match(container.innerHTML, /Items: Sofa\./i);
});

test('updateView3dA11yTree updates fallback description for orbit and walkthrough camera modes', () => {
  const mockElements = {};
  global.document = {
    getElementById(id) {
      if (!mockElements[id]) {
        mockElements[id] = { innerHTML: '', textContent: '' };
      }
      return mockElements[id];
    },
  };

  const state = {
    rooms: [
      { id: 'r1', name: 'Kitchen', level: 0 },
      { id: 'r2', name: 'Bedroom', level: 0 },
    ],
  };

  // Orbit view
  updateView3dA11yTree(state, 0, 'orbit');
  const container = document.getElementById('view3d-fallback-summary');
  assert.equal(
    container.textContent,
    '3D Viewport in Orbit View mode. Rendering Level 1 with 2 room(s) and standard scene lighting.'
  );

  // Walkthrough mode
  updateView3dA11yTree(state, 0, 'walkthrough');
  assert.equal(
    container.textContent,
    '3D Viewport in First-Person Walkthrough mode. Rendering Level 1 with 2 room(s) and standard scene lighting.'
  );

  // Walk mode
  updateView3dA11yTree(state, 0, 'walk');
  assert.equal(
    container.textContent,
    '3D Viewport in First-Person Walkthrough mode. Rendering Level 1 with 2 room(s) and standard scene lighting.'
  );
});
