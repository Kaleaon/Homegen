import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import * as M from '../js/model.js';
import { getRoomWallKeys, wallPoint, wallLength } from '../js/geometry.js';
import { autoComply, evaluate, wallOpenings } from '../js/codes.js';
import { exportSVG } from '../js/svg.js';
import { draw } from '../js/render.js';
import { createScene3D } from '../js/scene3d.js';

if (typeof HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = class {};
}
if (typeof DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class {
    scale() {
      return this;
    }
  };
}

globalThis.cancelAnimationFrame ||= () => {};
globalThis.requestAnimationFrame ||= () => 1;
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function createWebGLCanvasAndDoc() {
  const baseCtx = {
    canvas: { width: 800, height: 600 },
    getParameter: () => 'WebGL 2.0',
    getExtension: () => null,
    getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
    checkFramebufferStatus: () => 36053,
    createFramebuffer: () => ({ id: Math.random() }),
    createRenderbuffer: () => ({ id: Math.random() }),
    createTexture: () => ({ id: Math.random() }),
    createBuffer: () => ({ id: Math.random() }),
    createProgram: () => ({ id: Math.random() }),
    createShader: () => ({ id: Math.random() }),
    createVertexArray: () => ({ id: Math.random() }),
    TRIANGLES: 4,
  };
  const mockWebGL = new Proxy(baseCtx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
  });
  const fillStyles = [];
  const mock2d = new Proxy(
    {
      set fillStyle(val) {
        fillStyles.push(val);
      },
      get fillStyle() {
        return fillStyles[fillStyles.length - 1] || '#000';
      },
      measureText: (t) => ({ width: String(t || '').length * 6 }),
      createPattern: () => ({ setTransform: () => {} }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => {};
      },
    }
  );
  const doc = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ width: 256, height: 256, getContext: () => mock2d }),
  };
  const canvas = {
    width: 800,
    height: 600,
    ownerDocument: doc,
    getRootNode: () => doc,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
    getContext: (type) => (type === '2d' ? mock2d : mockWebGL),
  };
  return { canvas, doc, mock2d, fillStyles };
}

const L_ROOM_POINTS = [
  { x: 0, y: 0 }, // Edge 0: (0,0) -> (240,0)
  { x: 240, y: 0 }, // Edge 1: (240,0) -> (240,120)
  { x: 240, y: 120 }, // Edge 2: (240,120) -> (120,120)
  { x: 120, y: 120 }, // Edge 3: (120,120) -> (120,240)
  { x: 120, y: 240 }, // Edge 4: (120,240) -> (0,240)
  { x: 0, y: 240 }, // Edge 5: (0,240) -> (0,0)
];

function setupMockAppDOM() {
  const registry = new Map();
  const makeEl = (id = '', tagName = 'DIV') => {
    const listeners = {};
    const classes = new Set();
    const attrs = {};
    const dataset = {};
    let childWallInputs = [];
    const el = {
      id,
      tagName: tagName.toUpperCase(),
      value: '',
      checked: false,
      textContent: '',
      _innerHTML: '',
      hidden: false,
      disabled: false,
      open: false,
      files: [],
      style: {},
      dataset,
      classList: {
        add: (...cs) => cs.forEach((c) => classes.add(c)),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
        toggle: (c, v) => {
          const next = v !== undefined ? Boolean(v) : !classes.has(c);
          if (next) classes.add(c);
          else classes.delete(c);
          return next;
        },
        contains: (c) => classes.has(c),
      },
      setAttribute: (k, v) => {
        attrs[k] = String(v);
      },
      getAttribute: (k) => attrs[k] ?? null,
      removeAttribute: (k) => {
        delete attrs[k];
      },
      hasAttribute: (k) => k in attrs,
      addEventListener: (evt, fn) => {
        (listeners[evt] ||= []).push(fn);
      },
      removeEventListener: (evt, fn) => {
        if (listeners[evt]) listeners[evt] = listeners[evt].filter((f) => f !== fn);
      },
      dispatchEvent: async (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        const eventObj =
          typeof evt === 'string'
            ? {
                type,
                target: el,
                currentTarget: el,
                preventDefault: () => {},
                stopPropagation: () => {},
              }
            : {
                target: el,
                currentTarget: el,
                preventDefault: () => {},
                stopPropagation: () => {},
                ...evt,
              };
        for (const fn of listeners[type] || []) {
          await fn(eventObj);
        }
      },
      click: () => el.dispatchEvent('click'),
      focus: () => {},
      select: () => {},
      getContext: () =>
        new Proxy(
          {
            canvas: el,
            measureText: (t) => ({ width: String(t || '').length * 6 }),
            createPattern: () => ({ setTransform: () => {} }),
            createLinearGradient: () => ({ addColorStop: () => {} }),
          },
          {
            get(target, prop) {
              if (prop in target) return target[prop];
              return () => {};
            },
          }
        ),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      closest: () => null,
      querySelector: (sel) => (sel.startsWith('#') ? registry.get(sel.slice(1)) || null : null),
      querySelectorAll: (sel) => (sel === '.i-wall-len-input' ? childWallInputs : []),
    };

    Object.defineProperty(el, 'innerHTML', {
      get() {
        return el._innerHTML;
      },
      set(html) {
        el._innerHTML = String(html || '');
        if (id === 'inspector') {
          childWallInputs = [];
          for (const m of el._innerHTML.matchAll(/<select\s+([^>]*)>([\s\S]*?)<\/select>/g)) {
            const idMatch = m[1].match(/id="([^"]+)"/);
            if (!idMatch) continue;
            const selId = idMatch[1];
            const selEl = makeEl(selId, 'SELECT');
            const options = [];
            let selectedVal = '';
            for (const opt of m[2].matchAll(
              /<option\s+value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g
            )) {
              const val = opt[1];
              const isSel = /\bselected\b/.test(opt[2]);
              const label = opt[3].trim();
              options.push({ value: val, selected: isSel, textContent: label });
              if (isSel || selectedVal === '') selectedVal = val;
            }
            selEl.options = options;
            selEl.value = selectedVal;
            registry.set(selId, selEl);
          }
          for (const m of el._innerHTML.matchAll(/<input\s+([^>]*)>/g)) {
            const attrsStr = m[1];
            const idMatch = attrsStr.match(/id="([^"]+)"/);
            if (!idMatch) continue;
            const inpId = idMatch[1];
            const valMatch = attrsStr.match(/value="([^"]*)"/);
            const inpEl = makeEl(inpId, 'INPUT');
            inpEl.value = valMatch ? valMatch[1] : '';
            if (attrsStr.includes('class="i-wall-len-input"')) {
              const keyMatch = attrsStr.match(/data-wall-key="([^"]+)"/);
              const idxMatch = attrsStr.match(/data-wall-index="([^"]+)"/);
              inpEl.dataset.wallKey = keyMatch ? keyMatch[1] : '';
              inpEl.dataset.wallIndex = idxMatch ? idxMatch[1] : '0';
              childWallInputs.push(inpEl);
            }
            registry.set(inpId, inpEl);
          }
          for (const m of el._innerHTML.matchAll(
            /<(button|strong|div)\s+([^>]*id="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g
          )) {
            const subId = m[3];
            const subEl = makeEl(subId, m[1]);
            subEl.textContent = m[4];
            registry.set(subId, subEl);
          }
        }
      },
    });
    if (id) registry.set(id, el);
    return el;
  };

  [
    'plan',
    'inspector',
    'palette',
    'compliance',
    'levels',
    'snap-toggles',
    'bg-toolbar',
    'blueprint-dropzone',
    'history-list',
    'history-popover',
    'undo',
    'redo',
    'plan-name',
    'zoom-label',
    'auto',
    'toast',
    'a11y-announcer',
  ].forEach((id) => makeEl(id, id === 'plan' ? 'CANVAS' : 'DIV'));

  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  globalThis.document = {
    activeElement: null,
    body: makeEl('body', 'BODY'),
    documentElement: makeEl('html', 'HTML'),
    getElementById: (id) => registry.get(id) || makeEl(id),
    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return registry.get(id) || makeEl(id);
      }
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => makeEl('', tag),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  globalThis.window = {
    devicePixelRatio: 1,
    localStorage: globalThis.localStorage,
    location: { href: '' },
    navigator: { userAgent: 'node' },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: globalThis.window.navigator,
    configurable: true,
    writable: true,
  });

  return { registry };
}

test('AC1 & Req 4: nearestWallOnLevel and nearestWall hit-test all 6 edges and prefer interior via pointInPolygon', async () => {
  const state = M.newState();
  const lRoom = M.createRoom(state, 'living', 0, 0, 240, 240, { points: L_ROOM_POINTS });

  const keys = getRoomWallKeys(lRoom);
  assert.deepEqual(keys, [0, 1, 2, 3, 4, 5]);

  for (let edge = 0; edge < 6; edge++) {
    const mid = wallPoint(lRoom, edge, wallLength(lRoom, edge) / 2, 2);
    const hitModel = M.nearestWallOnLevel(state, mid, 0, 24);
    assert.ok(hitModel, `nearestWallOnLevel should match midpoint of edge ${edge}`);
    assert.strictEqual(hitModel.room.id, lRoom.id);
    assert.strictEqual(hitModel.wall, edge);
  }

  // Add a rectangular room inside the concave notch (120..240, 120..240) sharing edges 2 and 3
  const notchRoom = M.createRoom(state, 'office', 120, 120, 120, 120);
  // Point (180, 125) is inside notchRoom AND inside lRoom's bounding box, but NOT inside lRoom's polygon
  const pInsideNotch = { x: 180, y: 122 };
  const notchHit = M.nearestWallOnLevel(state, pInsideNotch, 0, 24);
  assert.strictEqual(
    notchHit.room.id,
    notchRoom.id,
    'pointInPolygon should prefer notchRoom over lRoom bounding box inside concave notch'
  );

  // Also test app.js nearestWall across all 6 edges
  const { registry } = setupMockAppDOM();
  await import('../js/app.js');
  const hg = globalThis.window.__homegen;
  hg.apply((n) => {
    n.rooms = [M.clone(lRoom)];
  }, 'Load 6-vertex Room');

  for (let edge = 0; edge < 6; edge++) {
    const mid = wallPoint(lRoom, edge, wallLength(lRoom, edge) / 2, 2);
    const hitApp = hg.nearestWall(mid, 14);
    assert.ok(hitApp, `app.js nearestWall should match midpoint of edge ${edge}`);
    assert.strictEqual(hitApp.room.id, lRoom.id);
    assert.strictEqual(hitApp.wall, edge);
  }

  // Keep registry referenced for Inspector test below
  globalThis.__testInspectorRegistry = registry;
});

test('AC2 & Req 1, Req 2: setWallUV/getWallUV accept index 0 without falsy rejection and fall back bidirectionally', () => {
  const state = M.newState();
  const polyRoom = M.createRoom(state, 'bedroom', 0, 0, 240, 240, {
    points: L_ROOM_POINTS,
    wallFinish: 'paint_sage',
  });

  // Req 1: createRoom initializes finishes and UV transforms across all 6 walls
  for (let i = 0; i < 6; i++) {
    assert.strictEqual(polyRoom.walls[i], 'paint_sage');
    assert.deepEqual(M.getWallUV(polyRoom, i), M.DEFAULT_UV_TRANSFORM);
  }

  // AC 2: setWallUV(room, 0, { scaleU: 2.5 }) -> getWallUV(room, 0).scaleU === 2.5
  M.setWallUV(polyRoom, 0, { scaleU: 2.5 });
  assert.strictEqual(M.getWallUV(polyRoom, 0).scaleU, 2.5);
  assert.strictEqual(
    M.getWallUV(polyRoom, 'N').scaleU,
    2.5,
    'Cardinal fallback reads index 0 on polygonal room'
  );

  // Bidirectional fallback on a 4-vertex room: set via index 0, read via 0 and N; set via E, read via 1
  const rectRoom = M.createRoom(state, 'living', 300, 0, 144, 144);
  M.setWallUV(rectRoom, 0, { scaleU: 2.5, rotation: 30 });
  assert.strictEqual(M.getWallUV(rectRoom, 0).scaleU, 2.5);
  assert.strictEqual(M.getWallUV(rectRoom, 'N').scaleU, 2.5);

  M.setWallUV(rectRoom, 'E', { scaleV: 3.25 });
  assert.strictEqual(M.getWallUV(rectRoom, 1).scaleV, 3.25);

  M.setWallAssemblyOverrides(polyRoom, 0, { studDepth: 7.25 });
  assert.strictEqual(M.getWallAssemblyOverrides(polyRoom, 0).studDepth, 7.25);
  assert.strictEqual(M.getWallAssemblyOverrides(polyRoom, 'N').studDepth, 7.25);
});

test('AC3 & Req 3, Req 7: Room, level, and plan styling/UV/assembly updates reach all N polygonal walls in 2D and 3D', () => {
  const { canvas, doc, mock2d } = createWebGLCanvasAndDoc();
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = { devicePixelRatio: 1 };

  try {
    const state = M.newState();
    const polyRoom = M.createRoom(state, 'living', 0, 0, 240, 240, {
      level: 0,
      points: L_ROOM_POINTS,
      cladding: 'cladding_siding_white',
    });
    const polyRoomLv1 = M.createRoom(state, 'bedroom', 0, 0, 240, 240, {
      level: 1,
      points: L_ROOM_POINTS,
    });

    // Room scope finish & UV
    M.applyWallFinish(state, 'wp_stripe_blue', { scope: 'room', room: polyRoom });
    M.applyWallUV(state, { scaleU: 2.0, rotation: 45 }, { scope: 'room', room: polyRoom });
    for (let w = 0; w < 6; w++) {
      assert.strictEqual(M.getWallFinish(polyRoom, w), 'wp_stripe_blue');
      assert.strictEqual(M.getWallUV(polyRoom, w).scaleU, 2.0);
      assert.strictEqual(M.getWallUV(polyRoom, w).rotation, 45);
    }

    // Level scope on level 0
    M.applyWallFinish(state, 'wall_brick', { scope: 'level', level: 0 });
    for (let w = 0; w < 6; w++) {
      assert.strictEqual(M.getWallFinish(polyRoom, w), 'wall_brick');
      assert.strictEqual(M.getWallFinish(polyRoomLv1, w), 'paint_white');
    }

    // Plan scope across all levels
    M.applyWallUV(state, { scaleV: 3.5 }, { scope: 'plan' });
    M.applyWallAssemblyOverrides(state, { studDepth: 9.25 }, { scope: 'plan' });
    for (let w = 0; w < 6; w++) {
      assert.strictEqual(M.getWallUV(polyRoomLv1, w).scaleV, 3.5);
      assert.strictEqual(M.getWallAssemblyOverrides(polyRoom, w).studDepth, 9.25);
    }

    // Single scope on wall 0 (falsy index check) and wall 5
    M.applyWallFinish(state, 'wp_stripe_blue', { scope: 'single', room: polyRoom, wall: 0 });
    M.applyWallUV(state, { scaleU: 4.0 }, { scope: 'single', room: polyRoom, wall: 0 });
    M.applyWallFinish(state, 'paint_navy', { scope: 'single', room: polyRoom, wall: 5 });
    assert.strictEqual(M.getWallFinish(polyRoom, 0), 'wp_stripe_blue');
    assert.strictEqual(M.getWallUV(polyRoom, 0).scaleU, 4.0);
    assert.strictEqual(M.getWallFinish(polyRoom, 5), 'paint_navy');

    // 2D draw runs cleanly across all 6 walls
    draw(mock2d, state, { ox: 0, oy: 0, scale: 1, w: 800, h: 600 }, { level: 0 });

    // 3D scene reconciliation & mesh materials on wall 0..5
    const api = createScene3D(
      canvas,
      () => state,
      () => 0
    );
    api.show();

    for (let w = 0; w < 6; w++) {
      const wg = api.entityMap.get(`${polyRoom.id}:wall:${w}`);
      assert.ok(wg, `3D wall group created for wall ${w}`);
      const sig = JSON.parse(wg.userData.sig);
      assert.strictEqual(sig.finish, M.getWallFinish(polyRoom, w));
      assert.strictEqual(sig.uv.scaleU, M.getWallUV(polyRoom, w).scaleU);
      assert.strictEqual(sig.uv.scaleV, 3.5);
      assert.strictEqual(sig.assembly.studDepth, 9.25);
    }

    const wall0Group = api.entityMap.get(`${polyRoom.id}:wall:0`);
    const wall0Tex = wall0Group.children[0].material.map;
    assert.ok(
      wall0Tex instanceof THREE.CanvasTexture,
      'Wall 0 patterned finish uses CanvasTexture'
    );
    assert.strictEqual(wall0Tex.matrixAutoUpdate, false, 'Wall 0 applies custom UV matrix');
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('AC4 & Req 5: Inspector #i-uv-wall lists Wall 1..Wall 6 and updates textures, UV, and assembly overrides on Wall 5 & Wall 6', async () => {
  const { registry } = setupMockAppDOM();
  await import(`../js/app.js?inspector=${Date.now()}`);
  const hg = globalThis.window.__homegen;

  let roomId = null;
  hg.apply((n) => {
    n.rooms = [];
    const r = M.createRoom(n, 'living', 0, 0, 240, 240, {
      points: L_ROOM_POINTS,
      cladding: 'cladding_siding_white',
    });
    roomId = r.id;
  }, 'Create L-Shaped Room');

  hg.select(roomId);
  hg.renderInspector();

  const uvWallSelect = registry.get('i-uv-wall');
  assert.ok(uvWallSelect, '#i-uv-wall select rendered');
  assert.deepEqual(
    uvWallSelect.options.map((o) => ({ value: o.value, label: o.textContent })),
    [
      { value: '0', label: 'Wall 1' },
      { value: '1', label: 'Wall 2' },
      { value: '2', label: 'Wall 3' },
      { value: '3', label: 'Wall 4' },
      { value: '4', label: 'Wall 5' },
      { value: '5', label: 'Wall 6' },
    ]
  );

  // Select Wall 5 (index 4) and update UV Scale U + Upload custom texture
  uvWallSelect.value = '4';
  await uvWallSelect.dispatchEvent('change');

  const scaleUNum = registry.get('i-uv-scale-u-num');
  scaleUNum.value = '2.75';
  await scaleUNum.dispatchEvent('change');

  const texFileInput = registry.get('i-custom-tex-file');
  const mockBlob = new Blob(['png-bytes'], { type: 'image/png' });
  mockBlob.name = 'accent.png';
  texFileInput.files = [mockBlob];
  await texFileInput.dispatchEvent('change');

  let updatedRoom = hg.doc.rooms.find((r) => r.id === roomId);
  assert.strictEqual(M.getWallUV(updatedRoom, 4).scaleU, 2.75);
  assert.match(M.getWallFinish(updatedRoom, 4), /^tex_/);
  assert.strictEqual(M.getWallFinish(updatedRoom, 0), 'paint_white');

  // Select Wall 6 (index 5) and update Wall Assembly stud depth
  const uvWallSelect2 = registry.get('i-uv-wall');
  uvWallSelect2.value = '5';
  await uvWallSelect2.dispatchEvent('change');

  const studInput = registry.get('i-wa-stud');
  studInput.value = '7.5';
  await studInput.dispatchEvent('change');

  updatedRoom = hg.doc.rooms.find((r) => r.id === roomId);
  assert.strictEqual(M.getWallAssemblyOverrides(updatedRoom, 5).studDepth, 7.5);
  // Ensure earlier Wall 5 UV transform survived commit()/cloneStateForTrial()
  assert.strictEqual(M.getWallUV(updatedRoom, 4).scaleU, 2.75);
});

test('AC5 & Req 6: autoComply places required doors, windows, and switches on edges 4..5 when edges 0..3 are blocked, and exportSVG renders all 6 walls', () => {
  const state = M.newState();
  // 6-vertex L-shaped living room where edges 0, 1, 2, 3 are completely blocked by abutting bedrooms,
  // leaving only edges 4 and 5 unobstructed!
  const mainPoly = M.createRoom(state, 'living', 0, 0, 240, 240, { points: L_ROOM_POINTS });
  // Block Edge 0: (0,-120) to (240,0)
  M.createRoom(state, 'bedroom', 0, -120, 240, 120);
  // Block Edge 1: (240,0) to (360,120)
  M.createRoom(state, 'bedroom', 240, 0, 120, 120);
  // Block Edge 2 & Edge 3: (120,120) to (240,240)
  M.createRoom(state, 'bedroom', 120, 120, 120, 120);

  autoComply(state);

  const updatedMain = state.rooms.find((r) => r.id === mainPoly.id);
  const mainWindows = updatedMain.openings.filter((o) => o.type.startsWith('win_'));
  assert.ok(
    mainWindows.length >= 1,
    'autoComply should place daylight/ventilation window on edges 4 or 5'
  );
  assert.ok(
    mainWindows.every((w) => w.wall === 4 || w.wall === 5),
    `Expected windows on unobstructed edges 4 or 5, got ${mainWindows.map((w) => w.wall)}`
  );

  const exitDoors = updatedMain.openings.filter((o) => o.type === 'door_entry_36');
  assert.ok(exitDoors.length >= 1, 'autoComply should place required entry door on edges 4 or 5');
  assert.ok(
    exitDoors.every((d) => d.wall === 4 || d.wall === 5),
    `Expected entry door on edge 4 or 5, got ${exitDoors.map((d) => d.wall)}`
  );

  // Also verify interior door connectivity, egress window, & switch placement when edges 0..3 are blocked and edge 4 touches an entry room
  const state2 = M.newState();
  const bed2 = M.createRoom(state2, 'bedroom', 0, 0, 240, 240, { points: L_ROOM_POINTS });
  const cN = M.createRoom(state2, 'closet', 0, -84, 240, 84);
  M.addOpening(state2, cN, 'door_entry_36', 'N', 36);
  const cE = M.createRoom(state2, 'closet', 240, 0, 84, 120);
  M.addOpening(state2, cE, 'door_entry_36', 'E', 36);
  const cSE = M.createRoom(state2, 'closet', 120, 120, 120, 120);
  M.addOpening(state2, cSE, 'door_entry_36', 'E', 36);
  const entryHall = M.createRoom(state2, 'entry', 0, 240, 120, 120);
  M.addOpening(state2, entryHall, 'door_entry_36', 'S', 36);

  autoComply(state2);
  const updatedBed2 = state2.rooms.find((r) => r.id === bed2.id);
  const bed2DoorsToEntry = updatedBed2.openings.filter(
    (o) => o.type.startsWith('door_') && o.wall === 4
  );
  assert.ok(bed2DoorsToEntry.length >= 1, 'autoComply connects bedroom to entry via edge 4');

  const bed2Windows = updatedBed2.openings.filter((o) => o.type.startsWith('win_'));
  assert.ok(bed2Windows.length >= 1, 'autoComply places bedroom egress window on edge 5');
  assert.ok(
    bed2Windows.every((w) => w.wall === 5),
    `Expected bedroom window on unobstructed exterior edge 5, got ${bed2Windows.map((w) => w.wall)}`
  );

  const bed2Switches = updatedBed2.items.filter((i) => i.type === 'switch');
  assert.ok(bed2Switches.length >= 1, 'autoComply places light switch in bedroom');
  assert.ok(
    bed2Switches.every((sw) => sw.wall === 4 || sw.wall === 5),
    `Expected light switch on edge 4 or 5 near door, got ${bed2Switches.map((s) => s.wall)}`
  );

  // Verify wallOpenings index matching across neighboring 4-vertex entryHall ('N') and 6-vertex bed2 (edge 4)
  const sharedOpsFromRect = wallOpenings(state2, entryHall, 'N');
  assert.ok(
    sharedOpsFromRect.some((entry) => entry.owner.id === updatedBed2.id),
    'wallOpenings on 4-vertex neighbor sees door placed on polygonal room edge 4'
  );

  // Verify SVG export renders all 6 wall segments for a single 6-vertex room
  const svgDoc = M.newState();
  M.createRoom(svgDoc, 'living', 0, 0, 240, 240, { points: L_ROOM_POINTS });
  const svg = exportSVG(svgDoc);
  const structMatches = svg.match(/class="wall-struct"/g) || [];
  const finishMatches = svg.match(/class="wall-finish"/g) || [];
  assert.strictEqual(structMatches.length, 6, 'SVG export renders 6 structural wall segments');
  assert.strictEqual(finishMatches.length, 6, 'SVG export renders 6 finish wall segments');
});

test('AC6 & Constraints: Saved polygonal plans with cardinal keys preserve finishes, UVs, and overrides in deserialize, History, and 3D', () => {
  const { canvas, doc } = createWebGLCanvasAndDoc();
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = { devicePixelRatio: 1 };

  try {
    const legacyPolygonalPlan = {
      version: 2,
      name: 'Saved Polygonal Plan',
      levels: 1,
      rooms: [
        {
          id: 'r1',
          type: 'living',
          name: 'L-Living',
          level: 0,
          x: 0,
          y: 0,
          w: 240,
          h: 240,
          points: L_ROOM_POINTS,
          ceiling: 96,
          floor: 'floor_oak',
          cladding: 'cladding_siding_white',
          walls: {
            N: 'wp_stripe_blue',
            E: 'wall_brick',
            S: 'paint_sage',
            W: 'paint_navy',
          },
          wallUV: {
            N: { scaleU: 2.5, scaleV: 1.5, rotation: 15, offsetU: 0.2, offsetV: -0.1 },
            E: { scaleU: 1.75, scaleV: 1.0, rotation: 0, offsetU: 0, offsetV: 0 },
          },
          wallAssemblyOverrides: {
            N: { studDepth: 7.25, gypsumThickness: 0.625 },
          },
          openings: [],
          items: [],
        },
      ],
    };

    // 1. Test raw (un-deserialized) legacy polygonal state directly in 3D scene
    const rawApi = createScene3D(
      canvas,
      () => legacyPolygonalPlan,
      () => 0
    );
    rawApi.show();
    const rawWall0Sig = JSON.parse(rawApi.entityMap.get('r1:wall:0').userData.sig);
    const rawWall1Sig = JSON.parse(rawApi.entityMap.get('r1:wall:1').userData.sig);
    assert.strictEqual(rawWall0Sig.finish, 'wp_stripe_blue');
    assert.strictEqual(rawWall0Sig.uv.scaleU, 2.5);
    assert.strictEqual(rawWall0Sig.assembly.studDepth, 7.25);
    assert.strictEqual(rawWall1Sig.finish, 'wall_brick');
    assert.strictEqual(rawWall1Sig.uv.scaleU, 1.75);

    // 2. Test deserialized plan + ModelHistory undo/redo snapshots
    const restored = M.deserialize(JSON.stringify(legacyPolygonalPlan));
    const room = restored.rooms[0];
    assert.strictEqual(M.getWallFinish(room, 0), 'wp_stripe_blue');
    assert.strictEqual(M.getWallFinish(room, 1), 'wall_brick');
    assert.strictEqual(M.getWallFinish(room, 2), 'paint_sage');
    assert.strictEqual(M.getWallFinish(room, 3), 'paint_navy');
    assert.strictEqual(M.getWallFinish(room, 4), 'paint_white');
    assert.strictEqual(M.getWallFinish(room, 5), 'paint_white');
    assert.strictEqual(M.getWallUV(room, 0).scaleU, 2.5);
    assert.strictEqual(M.getWallAssemblyOverrides(room, 0).studDepth, 7.25);

    const hist = new M.History(restored, 'Loaded');
    M.setWallFinish(room, 5, 'paint_sage');
    M.setWallUV(room, 5, { scaleU: 3.0 });
    hist.push(restored, 'Style Wall 6');

    const undone = hist.undo();
    assert.strictEqual(M.getWallFinish(undone.rooms[0], 5), 'paint_white');
    assert.strictEqual(M.getWallFinish(undone.rooms[0], 0), 'wp_stripe_blue');

    const redone = hist.redo();
    assert.strictEqual(M.getWallFinish(redone.rooms[0], 5), 'paint_sage');
    assert.strictEqual(M.getWallUV(redone.rooms[0], 5).scaleU, 3.0);

    const report = evaluate(redone);
    assert.ok(Array.isArray(report.violations));
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});
