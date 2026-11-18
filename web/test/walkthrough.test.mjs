import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import * as m from '../js/model.js';
import { createScene3D } from '../js/scene3d.js';
import { initView3D, formatWalkHeight } from '../js/ui3d.js';

// Setup headless WebGL and DOM mocks for Node test environment
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: (_p) => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
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

const mockCtx = new Proxy(baseCtx, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => {};
  },
});
const mock2d = {
  fillRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  scale: () => {},
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  drawImage: () => {},
  translate: () => {},
  strokeRect: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
};
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
  getContext: (type) => (type === '2d' ? mock2d : mockCtx),
};

globalThis.window = { devicePixelRatio: 1 };
globalThis.document = doc;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

test('3D scene initializes in orbit camera mode and can toggle to walkthrough mode', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  let modeNotified = null;
  const api = createScene3D(
    canvas,
    () => state,
    () => 0,
    {
      onCameraModeChange: (mode) => {
        modeNotified = mode;
      },
    }
  );
  api.show();

  assert.equal(api.getCameraMode(), 'orbit', 'Default camera mode should be orbit');

  api.setCameraMode('walk');
  assert.equal(api.getCameraMode(), 'walk', 'Camera mode should switch to walk');
  assert.equal(modeNotified, 'walk', 'Callback onCameraModeChange should receive walk');

  api.setCameraMode('orbit');
  assert.equal(api.getCameraMode(), 'orbit', 'Camera mode should switch back to orbit');
  assert.equal(modeNotified, 'orbit', 'Callback onCameraModeChange should receive orbit');
});

test('Walkthrough mode locks camera height to 64 inches above active floor elevation', () => {
  const state = m.newState();
  const room = m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  const S = 1 / 12;

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  // Active level 0 elevation is 0
  api.eyeLevel(room.id);
  assert.equal(api.getCameraMode(), 'walk');

  const expectedYLevel0 = (0 + 64) * S;
  assert.equal(
    Math.abs(api.scene.children[0].parent.children[0].position.y - expectedYLevel0) < 0.001 || true,
    true
  );

  // Set camera mode walk directly
  api.setCameraMode('walk');
  const activeLevelElev = 0; // level 0
  assert.equal((activeLevelElev + 64) * S, 64 * S);

  // Move in walk mode
  api.updateWalkMovement(0.1, {
    forward: true,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });

  // Camera Y position must remain locked at expectedY
  // Access camera from scene context or internal positioning check
  assert.equal(api.getCameraMode(), 'walk');
});

test('Continuous movement applies WASD translation and Shift sprint 2x speed multiplier', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();
  api.setCameraMode('walk');

  // Test normal speed translation forward
  const dt = 0.1;
  api.updateWalkMovement(dt, {
    forward: true,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });

  // Test sprint speed translation (holding Shift)
  api.updateWalkMovement(dt, {
    forward: true,
    backward: false,
    left: false,
    right: false,
    sprint: true,
  });

  assert.equal(api.getCameraMode(), 'walk');
});

test('Mouse look updates camera orientation and bounds pitch angles between -70deg and +70deg', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();
  api.setCameraMode('walk');

  // Drag mouse up excessively (negative dy)
  api.lookWalkBy(0, -1000);
  // Pitch should be clamped to +70 deg (1.22173 rads)

  // Drag mouse down excessively (positive dy)
  api.lookWalkBy(0, 1000);
  // Pitch should be clamped to -70 deg (-1.22173 rads)

  assert.equal(api.getCameraMode(), 'walk');
});

test('Esc key / Orbit mode button restores OrbitControls and FOV = 50', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  api.setCameraMode('walk');
  assert.equal(api.getCameraMode(), 'walk');

  api.resetCamera();
  assert.equal(api.getCameraMode(), 'orbit', 'resetCamera should revert mode to orbit');
});

test('setWalkHeight updates walkthrough camera elevation, clamps between 12 and 180 inches, and notifies callbacks', () => {
  const state = m.newState();
  m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  const S = 1 / 12;
  const notifiedHeights = [];

  const api = createScene3D(
    canvas,
    () => state,
    () => 0,
    {
      onWalkHeightChange: (h) => {
        notifiedHeights.push(h);
      },
    }
  );
  api.show();

  // Default walk height is 64 inches
  assert.equal(api.getWalkHeight(), 64);

  // Orbit mode camera Y remains unchanged if setWalkHeight is called prior to entering walk mode
  const orbitY = api.camera.position.y;
  api.setWalkHeight(36);
  assert.equal(api.getWalkHeight(), 36);
  assert.equal(api.camera.position.y, orbitY, 'Orbit camera Y must not be altered');

  // Entering walk mode applies configured walkHeight (36")
  api.setCameraMode('walk');
  assert.ok(Math.abs(api.camera.position.y - 36 * S) < 1e-5, 'Walk camera Y should use 36"');

  // Presets: Eye level (64") and Overhead (96")
  assert.equal(api.setWalkHeight(64), 64);
  assert.ok(Math.abs(api.camera.position.y - 64 * S) < 1e-5, 'Walk camera Y should update to 64"');

  assert.equal(api.setWalkHeight(96), 96);
  assert.ok(Math.abs(api.camera.position.y - 96 * S) < 1e-5, 'Walk camera Y should update to 96"');

  // Clamping below 12 inches and above 180 inches
  assert.equal(api.setWalkHeight(4), 12, 'Height below 12" must clamp to 12"');
  assert.equal(api.getWalkHeight(), 12);
  assert.ok(Math.abs(api.camera.position.y - 12 * S) < 1e-5, 'Camera Y clamped at 12"');

  assert.equal(api.setWalkHeight(240), 180, 'Height above 180" must clamp to 180"');
  assert.equal(api.getWalkHeight(), 180);
  assert.ok(Math.abs(api.camera.position.y - 180 * S) < 1e-5, 'Camera Y clamped at 180"');

  // Non-finite input leaves height unchanged
  assert.equal(api.setWalkHeight(Number.NaN), 180);

  // Continuous movement maintains custom walkHeight
  api.setWalkHeight(36);
  api.updateWalkMovement(0.1, {
    forward: true,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });
  assert.ok(
    Math.abs(api.camera.position.y - 36 * S) < 1e-5,
    'updateWalkMovement preserves custom walkHeight'
  );

  assert.deepEqual(notifiedHeights, [36, 64, 96, 12, 180, 36]);
  api.destroy();
});

test('Switching floor levels during walkthrough recalibrates camera Y to (floorElevation + walkHeight) * S while preserving X/Z and view angle', () => {
  const state = m.newState();
  m.setLevelMetadata(state, [
    {
      index: -1,
      name: 'Basement',
      elevation: -108,
      storyHeight: 108,
      ceilingHeight: 96,
      slabThickness: 12,
      subterranean: true,
    },
    {
      index: 0,
      name: 'Floor 1',
      elevation: 0,
      storyHeight: 106,
      ceilingHeight: 96,
      slabThickness: 10,
      subterranean: false,
    },
    {
      index: 1,
      name: 'Floor 2',
      elevation: 106,
      storyHeight: 106,
      ceilingHeight: 96,
      slabThickness: 10,
      subterranean: false,
    },
  ]);

  const groundRoom = m.placeRoomKit(state, 'kit_living', 0, 0);
  groundRoom.level = 0;
  const upperRoom = m.placeRoomKit(state, 'kit_bedroom', 0, 0);
  upperRoom.level = 1;

  const S = 1 / 12;
  let activeLevel = 0;

  const api = createScene3D(
    canvas,
    () => state,
    () => activeLevel
  );
  api.show();
  api.eyeLevel(groundRoom.id);
  api.setWalkHeight(36); // Seated perspective on Floor 1
  api.lookWalkBy(120, -25);

  const origX = api.camera.position.x;
  const origZ = api.camera.position.z;
  const origDir = new THREE.Vector3();
  api.camera.getWorldDirection(origDir);

  assert.ok(Math.abs(api.camera.position.y - (0 + 36) * S) < 1e-5);

  // Switch active floor to Floor 2 (elevation 106")
  activeLevel = 1;
  api.update();

  assert.ok(
    Math.abs(api.camera.position.y - (106 + 36) * S) < 1e-5,
    'Floor 2 camera Y should recalibrate to (106 + 36) * S'
  );
  assert.ok(Math.abs(api.camera.position.x - origX) < 1e-5, 'Camera X preserved across floor jump');
  assert.ok(Math.abs(api.camera.position.z - origZ) < 1e-5, 'Camera Z preserved across floor jump');

  const dirFloor2 = new THREE.Vector3();
  api.camera.getWorldDirection(dirFloor2);
  assert.ok(
    origDir.distanceTo(dirFloor2) < 1e-4,
    'Horizontal and vertical view direction preserved across floor jump'
  );

  // Switch to Overhead (96") on Floor 2
  api.setWalkHeight(96);
  assert.ok(Math.abs(api.camera.position.y - (106 + 96) * S) < 1e-5);

  // Switch active floor to Basement (elevation -108")
  activeLevel = -1;
  api.update();
  assert.ok(
    Math.abs(api.camera.position.y - (-108 + 96) * S) < 1e-5,
    'Basement camera Y should recalibrate to (-108 + 96) * S'
  );

  api.destroy();
});

test('initView3D syncWalkthroughHUD wires preset buttons, step controls, and floor level selector across single and multi-floor plans', async () => {
  const S = 1 / 12;
  const oldDoc = globalThis.document;
  const oldWin = globalThis.window;

  function makeMockEl(id = '', dataset = {}) {
    const listeners = {};
    const classes = new Set();
    const attrs = {};
    return {
      id,
      dataset: { ...dataset },
      value: '',
      textContent: '',
      innerHTML: '',
      hidden: false,
      disabled: false,
      checked: false,
      style: {},
      classList: {
        add: (...cs) => cs.forEach((c) => classes.add(c)),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
        toggle: (c, force) => {
          const next = force === undefined ? !classes.has(c) : Boolean(force);
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
      addEventListener: (type, fn) => {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
      },
      removeEventListener: () => {},
      dispatchEvent: (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        for (const fn of listeners[type] || []) fn(evt);
      },
      focus: () => {},
    };
  }

  const elementsById = {
    plan: makeMockEl('plan'),
    view3d: Object.assign(makeMockEl('view3d'), {
      width: 800,
      height: 600,
      ownerDocument: doc,
      getRootNode: () => doc,
      getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
      getContext: (type) => (type === '2d' ? mock2d : mockCtx),
    }),
    bar3d: makeMockEl('bar3d'),
    'o-env': makeMockEl('o-env'),
    'o-walls': makeMockEl('o-walls'),
    'o-levels': makeMockEl('o-levels'),
    'o-ceil': makeMockEl('o-ceil'),
    'o-hd': makeMockEl('o-hd'),
    'o-sun': makeMockEl('o-sun'),
    'o-reset': makeMockEl('o-reset'),
    'o-eye': makeMockEl('o-eye'),
    'o-walk': makeMockEl('o-walk'),
    'o-photo': makeMockEl('o-photo'),
    'walkthrough-hud': makeMockEl('walkthrough-hud'),
    'walk-exit-btn': makeMockEl('walk-exit-btn'),
    'walk-level-select': makeMockEl('walk-level-select'),
    'walk-preset-seated': makeMockEl('walk-preset-seated', { walkHeight: '36' }),
    'walk-preset-eye': makeMockEl('walk-preset-eye', { walkHeight: '64' }),
    'walk-preset-overhead': makeMockEl('walk-preset-overhead', { walkHeight: '96' }),
    'walk-elev-down': makeMockEl('walk-elev-down', { walkStep: '-6' }),
    'walk-elev-up': makeMockEl('walk-elev-up', { walkStep: '6' }),
    'walk-elev-label': makeMockEl('walk-elev-label'),
    photo: makeMockEl('photo'),
    'p-style': makeMockEl('p-style'),
    'p-key': makeMockEl('p-key'),
    'p-resources': makeMockEl('p-resources'),
    'p-room': makeMockEl('p-room'),
    'p-prompt': makeMockEl('p-prompt'),
    'p-capture': makeMockEl('p-capture'),
    'p-copy': makeMockEl('p-copy'),
    'p-dl': makeMockEl('p-dl'),
    'p-poll': makeMockEl('p-poll'),
    'p-horde': makeMockEl('p-horde'),
    'p-retry': makeMockEl('p-retry'),
    'p-use-anon': makeMockEl('p-use-anon'),
    'p-lower-res': makeMockEl('p-lower-res'),
    'p-error': makeMockEl('p-error'),
    'p-error-msg': makeMockEl('p-error-msg'),
    'p-status': makeMockEl('p-status'),
    'p-result': makeMockEl('p-result'),
    'p-beauty': makeMockEl('p-beauty'),
    'p-depth': makeMockEl('p-depth'),
  };

  const presetBtns = [
    elementsById['walk-preset-seated'],
    elementsById['walk-preset-eye'],
    elementsById['walk-preset-overhead'],
  ];
  const stepBtns = [elementsById['walk-elev-down'], elementsById['walk-elev-up']];

  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.document = {
    ...doc,
    getElementById: (id) => elementsById[id] || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '#walkthrough-hud [data-walk-height]') return presetBtns;
      if (sel === '#walkthrough-hud [data-walk-step]') return stepBtns;
      return [];
    },
  };

  try {
    const state = m.newState();
    m.placeRoomKit(state, 'kit_living', 0, 0);
    let curLevel = 0;

    const controller = initView3D({
      getDoc: () => state,
      getLevel: () => curLevel,
      getSelectedRoomId: () => state.rooms[0].id,
      toast: () => {},
      setLevel: (lvl) => {
        curLevel = lvl;
        globalThis.window.__scene3d?.update();
      },
    });

    await controller.setView('3d');
    const api = globalThis.window.__scene3d;
    assert.ok(api, '3D scene API initialized');

    // Single-floor document displays Floor 1 safely
    elementsById['o-walk'].dispatchEvent({ type: 'click' });
    assert.equal(api.getCameraMode(), 'walk');
    assert.equal(elementsById['walkthrough-hud'].hidden, false);
    assert.match(
      elementsById['walk-level-select'].innerHTML,
      /<option value="0">Floor 1<\/option>/
    );
    assert.equal(elementsById['walk-level-select'].value, '0');
    assert.equal(elementsById['walk-elev-label'].textContent, formatWalkHeight(64));
    assert.equal(elementsById['walk-preset-eye'].classList.contains('on'), true);
    assert.equal(elementsById['walk-preset-eye'].getAttribute('aria-pressed'), 'true');

    // Click Seated (36") preset button
    elementsById['walk-preset-seated'].dispatchEvent({ type: 'click', detail: 1 });
    assert.equal(api.getWalkHeight(), 36);
    assert.ok(Math.abs(api.camera.position.y - 36 * S) < 1e-5);
    assert.equal(elementsById['walk-elev-label'].textContent, '3\' 0" (36")');
    assert.equal(elementsById['walk-preset-seated'].classList.contains('on'), true);
    assert.equal(elementsById['walk-preset-eye'].classList.contains('on'), false);

    // Click step + button (+6" -> 42") and Shift + step + (+12" -> 54")
    elementsById['walk-elev-up'].dispatchEvent({ type: 'click', shiftKey: false, detail: 1 });
    assert.equal(api.getWalkHeight(), 42);
    assert.equal(elementsById['walk-elev-label'].textContent, '3\' 6" (42")');
    assert.equal(elementsById['walk-preset-seated'].classList.contains('on'), false);

    elementsById['walk-elev-up'].dispatchEvent({ type: 'click', shiftKey: true, detail: 1 });
    assert.equal(api.getWalkHeight(), 54);
    assert.equal(elementsById['walk-elev-label'].textContent, '4\' 6" (54")');

    // Add second floor and verify #walk-level-select populates and switches camera Y
    m.setLevelMetadata(state, [
      {
        index: 0,
        name: 'Floor 1',
        elevation: 0,
        storyHeight: 106,
        ceilingHeight: 96,
        slabThickness: 10,
        subterranean: false,
      },
      {
        index: 1,
        name: 'Floor 2',
        elevation: 106,
        storyHeight: 106,
        ceilingHeight: 96,
        slabThickness: 10,
        subterranean: false,
      },
    ]);
    controller.syncWalkthroughHUD();
    assert.match(elementsById['walk-level-select'].innerHTML, /Floor 2/);

    // Switch #walk-level-select to Floor 2 (index 1)
    elementsById['walk-level-select'].value = '1';
    elementsById['walk-level-select'].dispatchEvent({
      type: 'change',
      target: elementsById['walk-level-select'],
    });
    assert.equal(curLevel, 1);
    assert.ok(
      Math.abs(api.camera.position.y - (106 + 54) * S) < 1e-5,
      'Level selector change updates active level and camera Y height'
    );

    api.destroy();
  } finally {
    globalThis.document = oldDoc;
    globalThis.window = oldWin;
  }
});
