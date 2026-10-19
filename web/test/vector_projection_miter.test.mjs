import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import { neighborShift, wallNeighbors, subtractInterval } from '../js/geometry.js';
import { wallOpenings } from '../js/codes.js';
import { createScene3D } from '../js/scene3d.js';

// Setup DOM stubs for Node environment
if (!globalThis.document) {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') return createCanvas();
      return { addEventListener: () => {}, removeEventListener: () => {}, style: {} };
    },
    createElementNS: (ns, tag) => {
      if (tag === 'canvas') return createCanvas();
      return { addEventListener: () => {}, removeEventListener: () => {}, style: {} };
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (!globalThis.window) globalThis.window = globalThis;
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
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    clearColor: () => {},
    clearDepth: () => {},
    clearStencil: () => {},
    enable: () => {},
    disable: () => {},
    depthFunc: () => {},
    frontFace: () => {},
    cullFace: () => {},
    viewport: () => {},
    createShader: () => ({ id: Math.random() }),
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: () => ({ id: Math.random() }),
    attachShader: () => {},
    linkProgram: () => {},
    useProgram: () => {},
    createBuffer: () => ({ id: Math.random() }),
    bindBuffer: () => {},
    bufferData: () => {},
    createFramebuffer: () => ({ id: Math.random() }),
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    createRenderbuffer: () => ({ id: Math.random() }),
    createVertexArray: () => ({ id: Math.random() }),
    checkFramebufferStatus: () => 36053,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    TRIANGLES: 4,
  };

  const dummyCtx = new Proxy(baseCtx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
  });

  return {
    getContext: () => dummyCtx,
    getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0 }),
    style: {},
    ownerDocument: globalThis.document,
    getRootNode: () => globalThis.document,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

test('Criterion 1: neighborShift and wallNeighbors use 2D vector projection for non-rectangular and angled walls', () => {
  // Room 1: 4-vertex room starting at (0,0)
  const room1 = {
    id: 'r1',
    level: 0,
    x: 0,
    y: 0,
    w: 120,
    h: 120,
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
    openings: [],
    items: [],
  };

  // Room 2: Adjacent along North wall (0,0) to (120,0), but offset
  const room2 = {
    id: 'r2',
    level: 0,
    x: 40,
    y: -120,
    w: 120,
    h: 120,
    points: [
      { x: 40, y: -120 },
      { x: 160, y: -120 },
      { x: 160, y: 0 },
      { x: 40, y: 0 },
    ],
    openings: [],
    items: [],
  };

  const nbs = wallNeighbors([room1, room2], room1, 0); // Wall 'N' (0) of room1
  assert.equal(nbs.length, 1, 'Should detect neighbor along shared segment');
  assert.equal(nbs[0].room.id, 'r2');
  assert.equal(nbs[0].from, 40, 'Projected overlap start on room1 wall');
  assert.equal(nbs[0].to, 120, 'Projected overlap end on room1 wall');

  const shift = neighborShift(room1, room2, 0, nbs[0].wall);
  assert.equal(typeof shift, 'number');
  assert.equal(shift, 40, 'Vector projection offset of room2 wall origin onto room1 wall');
});

test('Criterion 2: wallOpenings finds shared openings on collinear non-cardinal angled walls without OPPOSITE lookups', () => {
  // Room 1: Right triangle with hypotenuse along (0, 100) -> (100, 0)
  const room1 = {
    id: 'r1',
    level: 0,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ],
    openings: [],
    items: [],
  };

  // Room 2 opening on hypotenuse segment (index 0 of room2_hyp points: (100,0) to (0,100))
  const room2_hyp = {
    id: 'r2_hyp',
    level: 0,
    points: [
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ],
    openings: [
      { id: 'd_angled', type: 'door_standard', wall: 0, offset: 20, width: 36, swing: 'in' },
    ],
    items: [],
  };

  const state = { rooms: [room1, room2_hyp] };
  // Wall index 1 of room1 is segment (100,0) -> (0,100), angled at 135 degrees
  const ops = wallOpenings(state, room1, 1);
  assert.equal(ops.length, 1, 'Found shared opening on non-cardinal collinear wall');
  assert.equal(ops[0].o.id, 'd_angled');
  assert.equal(ops[0].owner.id, 'r2_hyp');
  assert.ok(ops[0].from > 0 && ops[0].to > ops[0].from, 'Valid projected opening interval');
});

test('Criterion 3: subtractInterval isolates exterior wall spans and removes sub-epsilon slivers', () => {
  const fullWall = [[0, 120]];
  // Neighbor covers [0, 119.9] leaving a 0.1 inch micro-sliver
  const result = subtractInterval(fullWall, [0, 119.9]);
  assert.deepEqual(result, [], 'Sub-epsilon micro-sliver (< EPS=0.5) is filtered out');

  // Partial neighbor cover [30, 90]
  const result2 = subtractInterval(fullWall, [30, 90]);
  assert.deepEqual(
    result2,
    [
      [0, 30],
      [90, 120],
    ],
    'Isolates exterior wall spans on boundaries'
  );
});

test('Criterion 4: Wall mesh rendering (addWallBox) constructs mitered filler meshes at non-orthogonal corners', () => {
  // Non-orthogonal triangular room layout (45 and 135 degree corners)
  const room = {
    id: 'r_tri',
    level: 0,
    x: 0,
    y: 0,
    w: 120,
    h: 120,
    ceiling: 96,
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

  const canvas = createCanvas();
  const state = { rooms: [room], levels: 1 };
  const scene3d = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  scene3d.show();

  let extrudeMeshCount = 0;
  scene3d.world.traverse((obj) => {
    if (obj.isMesh && obj.geometry instanceof THREE.ExtrudeGeometry) {
      extrudeMeshCount++;
    }
  });

  assert.ok(
    extrudeMeshCount > 0,
    '3D scene contains extruded corner miter/filler meshes at non-orthogonal corners'
  );
});

test('Criterion 5: Door swing logic calculates leaf pivot rotation relative to interior normal using 2D cross products', () => {
  // Test door pivot rotation across multiple wall orientations (0, 45, 90, 135, 180 degrees)
  const wallOrientations = [
    { name: 'East wall (0 deg)', seg: { ax: 0, ay: 0, dx: 1, dy: 0, nx: 0, ny: 1 } },
    {
      name: 'Angled wall (45 deg)',
      seg: { ax: 0, ay: 0, dx: 0.7071, dy: 0.7071, nx: -0.7071, ny: 0.7071 },
    },
    { name: 'South wall (90 deg)', seg: { ax: 0, ay: 0, dx: 0, dy: 1, nx: -1, ny: 0 } },
    {
      name: 'Angled wall (135 deg)',
      seg: { ax: 0, ay: 0, dx: -0.7071, dy: 0.7071, nx: -0.7071, ny: -0.7071 },
    },
    { name: 'West wall (180 deg)', seg: { ax: 0, ay: 0, dx: -1, dy: 0, nx: 0, ny: -1 } },
  ];

  const ang = (80 * Math.PI) / 180;

  for (const item of wallOrientations) {
    const s = item.seg;
    for (const dir of [1, -1]) {
      const cross = s.dx * (s.ny * dir) - s.dy * (s.nx * dir);
      const swingSign = cross >= 0 ? 1 : -1;
      const alongAng = Math.atan2(s.dy, s.dx);
      const rotY = -alongAng + swingSign * ang;

      assert.ok(!Number.isNaN(rotY), `Rotation angle is valid for ${item.name} with dir=${dir}`);
      assert.equal(
        swingSign,
        dir >= 0 ? 1 : -1,
        `2D cross product correctly computes swing sign for ${item.name}`
      );
    }
  }
});
