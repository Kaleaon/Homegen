import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import { createScene3D } from '../js/scene3d.js';

const S = 1 / 12;

// Setup headless WebGL and DOM stubs for Node test environment
if (!globalThis.document) {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') return createCanvas();
      return { addEventListener: () => {}, removeEventListener: () => {}, style: {} };
    },
    createElementNS: (_ns, tag) => {
      if (tag === 'canvas') return createCanvas();
      return { addEventListener: () => {}, removeEventListener: () => {}, style: {} };
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (!globalThis.window) globalThis.window = { devicePixelRatio: 1 };
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = () => 1;
if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = () => {};

function createCanvas() {
  const mock2d = {
    fillRect: () => {},
    strokeRect: () => {},
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
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };

  const baseCtx = {
    canvas: { width: 800, height: 600 },
    getParameter: (p) => (typeof p === 'number' && p === 35661 ? 4 : 'WebGL 2.0'),
    getShaderPrecisionFormat: () => ({ rangeMin: 1, rangeMax: 1, precision: 23 }),
    getShaderParameter: () => true,
    getProgramParameter: () => 0,
    getShaderInfoLog: () => '',
    getProgramInfoLog: () => '',
    getExtension: () => null,
    createTexture: () => ({ id: Math.random() }),
    createShader: () => ({ id: Math.random() }),
    createProgram: () => ({ id: Math.random() }),
    createBuffer: () => ({ id: Math.random() }),
    createFramebuffer: () => ({ id: Math.random() }),
    createRenderbuffer: () => ({ id: Math.random() }),
    createVertexArray: () => ({ id: Math.random() }),
    checkFramebufferStatus: () => 36053,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    TRIANGLES: 4,
  };

  const dummyWebGL = new Proxy(baseCtx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
  });

  return {
    width: 800,
    height: 600,
    getContext: (type) => (type === '2d' ? mock2d : dummyWebGL),
    getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0 }),
    style: {},
    ownerDocument: globalThis.document,
    getRootNode: () => globalThis.document,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

function collectCornerMiterMeshes(scene3d, roomId) {
  const miterMeshes = [];
  for (const [key, node] of scene3d.entityMap.entries()) {
    if (!key.startsWith(`${roomId}:wall:`)) continue;
    node.updateMatrixWorld(true);
    node.traverse((child) => {
      // Wall segment extrusions set matrixAutoUpdate = false; corner miter fillers use matrixAutoUpdate = true
      if (
        child.isMesh &&
        child.matrixAutoUpdate === true &&
        child.geometry instanceof THREE.ExtrudeGeometry
      ) {
        miterMeshes.push(child);
      }
    });
  }
  return miterMeshes;
}

test('corner miter filler extrudes upward along +Y from 0 to ceiling height at ground elevation', () => {
  const ceiling = 96; // 8 ft
  const room = {
    id: 'room_ground_tri',
    level: 0,
    x: 24,
    y: 36,
    w: 120,
    h: 120,
    ceiling,
    floor: 'floor_oak',
    walls: { 0: 'paint_white', 1: 'paint_white', 2: 'paint_white' },
    points: [
      { x: 24, y: 36 },
      { x: 144, y: 36 },
      { x: 24, y: 156 },
    ],
    openings: [],
    items: [],
  };

  const state = { rooms: [room], levels: 1 };
  const scene3d = createScene3D(
    createCanvas(),
    () => state,
    () => 0
  );
  scene3d.show();

  const miterMeshes = collectCornerMiterMeshes(scene3d, room.id);
  assert.ok(miterMeshes.length > 0, 'Expected corner miter filler meshes at angled corners');

  for (const mesh of miterMeshes) {
    mesh.geometry.computeBoundingBox();
    const localBox = mesh.geometry.boundingBox;
    assert.ok(
      Math.abs(localBox.min.y - 0) < 1e-5,
      `Expected local geometry min.y to be 0, got ${localBox.min.y}`
    );
    assert.ok(
      Math.abs(localBox.max.y - ceiling * S) < 1e-5,
      `Expected local geometry max.y to be ${ceiling * S}, got ${localBox.max.y}`
    );

    const worldBox = new THREE.Box3().setFromObject(mesh);
    assert.ok(
      Math.abs(worldBox.min.y - 0) < 1e-5,
      `Expected world Box3 min.y to be 0, got ${worldBox.min.y}`
    );
    assert.ok(
      Math.abs(worldBox.max.y - ceiling * S) < 1e-5,
      `Expected world Box3 max.y to be ${ceiling * S}, got ${worldBox.max.y}`
    );
    // Plan Y coordinates are positive [36, 156] inches ([3, 13] ft), so world Z must also be positive
    assert.ok(
      worldBox.min.z > 2.0 && worldBox.max.z < 14.0,
      `Expected world Z bounds within positive plan range [2, 14], got [${worldBox.min.z}, ${worldBox.max.z}]`
    );
  }
});

test('corner miter filler aligns with non-zero base elevation (elev > 0) and cutaway height', () => {
  const baseElev = 120; // 10 ft upper level elevation
  const ceiling = 108; // 9 ft ceiling
  const room = {
    id: 'room_upper_tri',
    level: 1,
    x: 0,
    y: 0,
    w: 120,
    h: 120,
    ceiling,
    floor: 'floor_oak',
    walls: { 0: 'paint_white', 1: 'paint_white', 2: 'paint_white' },
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 0, y: 120 },
    ],
    openings: [],
    items: [],
  };

  const state = {
    rooms: [room],
    levels: 2,
    levelMetadata: [
      { index: 0, name: 'Level 1', elevation: 0 },
      { index: 1, name: 'Level 2', elevation: baseElev },
    ],
  };

  const scene3d = createScene3D(
    createCanvas(),
    () => state,
    () => 1
  );
  scene3d.show();

  const miterMeshes = collectCornerMiterMeshes(scene3d, room.id);
  assert.ok(miterMeshes.length > 0, 'Expected corner miter filler meshes on upper floor');

  for (const mesh of miterMeshes) {
    assert.ok(
      Math.abs(mesh.position.y - baseElev * S) < 1e-5,
      `Expected mesh.position.y to equal ${baseElev * S}, got ${mesh.position.y}`
    );
    const worldBox = new THREE.Box3().setFromObject(mesh);
    assert.ok(
      Math.abs(worldBox.min.y - baseElev * S) < 1e-5,
      `Expected world min.y at base elevation ${baseElev * S}, got ${worldBox.min.y}`
    );
    assert.ok(
      Math.abs(worldBox.max.y - (baseElev + ceiling) * S) < 1e-5,
      `Expected world max.y at top wall height ${(baseElev + ceiling) * S}, got ${worldBox.max.y}`
    );
  }

  // Also verify partial-height walls (y0 > 0) via addWallBox sloped-wall opening header path
  room.floorMesh = { VertexZArray: [0, 4, 0] };
  room.bulges = { 0: 1e-7 }; // linear arc routes through addWallBox
  room.openings = [{ id: 'win_sloped', type: 'win_hung_36x60', wall: 0, offset: 12, width: 36 }];
  scene3d.update();

  const slopedMiters = collectCornerMiterMeshes(scene3d, room.id);
  assert.ok(slopedMiters.length > 0, 'Expected miter fillers on sloped wall path (addWallBox)');
  for (const mesh of slopedMiters) {
    const worldBox = new THREE.Box3().setFromObject(mesh);
    assert.ok(
      worldBox.min.y >= baseElev * S - 1e-5,
      `Sloped wall miter min.y (${worldBox.min.y}) should not extend below base elevation (${baseElev * S})`
    );
    assert.ok(
      worldBox.max.y <= (baseElev + ceiling) * S + 1e-5,
      `Sloped wall miter max.y (${worldBox.max.y}) should not exceed top wall elevation (${(baseElev + ceiling) * S})`
    );
    assert.ok(worldBox.max.y > worldBox.min.y, 'Miter filler should have positive vertical height');
  }
});

test('corner miter filler skips zero-height walls cleanly without throwing errors', () => {
  const room = {
    id: 'room_zero_height',
    level: 0,
    x: 0,
    y: 0,
    w: 120,
    h: 120,
    ceiling: 0,
    floor: 'floor_oak',
    walls: { 0: 'paint_white', 1: 'paint_white', 2: 'paint_white' },
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 0, y: 120 },
    ],
    openings: [],
    items: [],
  };

  const state = { rooms: [room], levels: 1 };
  const scene3d = createScene3D(
    createCanvas(),
    () => state,
    () => 0
  );

  assert.doesNotThrow(() => {
    scene3d.show();
  });

  const miterMeshes = collectCornerMiterMeshes(scene3d, room.id);
  assert.strictEqual(miterMeshes.length, 0, 'Zero-height wall should not generate miter meshes');
});
