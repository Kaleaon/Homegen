import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import {
  outerPolygon,
  interiorPolygon,
  csgExteriorCladdingIntervals,
  wallSeg,
  WT,
} from '../js/geometry.js';
import { createScene3D } from '../js/scene3d.js';

// Setup headless WebGL and DOM mocks for Node test environment
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;

const baseCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
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

test('2D polygon CSG difference operations isolate interior partition walls from exterior cladding boundaries', () => {
  const state = m.newState();
  // Room 1: (0,0) to (120,120)
  const room1 = m.createRoom(state, 'bedroom', 0, 0, 120, 120);
  // Room 2: adjacent along East wall of Room 1, from (120,0) to (240,60)
  const room2 = m.createRoom(state, 'office', 120, 0, 120, 60);

  // Evaluate exterior cladding CSG intervals for East wall (wall index 1 / 'E') of Room 1
  const { intervals, neighbors } = csgExteriorCladdingIntervals(state.rooms, room1, 'E', WT);

  assert.ok(neighbors.length > 0, 'Neighbor room detected along shared East wall');
  assert.strictEqual(neighbors[0].room.id, room2.id);

  // Overlap from room 2 is from t=0 to t=60 on East wall (length 120)
  // CSG difference subtracts [0, 60] from [-2.25, 122.25], leaving [60, 122.25]
  assert.ok(
    intervals.length > 0,
    'Exterior cladding intervals generated for non-overlapped region'
  );
  const sharedOverlapCovered = intervals.some(([a, b]) => a < 30 && b > 30);
  assert.strictEqual(
    sharedOverlapCovered,
    false,
    'Interior partition wall section [0, 60] is isolated and subtracted from exterior cladding'
  );

  // Check outer and inner boundary polygon offsetting for N-gon rooms
  const pts = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 60 },
    { x: 60, y: 60 },
    { x: 60, y: 120 },
    { x: 0, y: 120 },
  ]; // L-shaped non-rectangular room
  const nonRectRoom = { points: pts };
  const outerPoly = outerPolygon(nonRectRoom, WT);
  const innerPoly = interiorPolygon(nonRectRoom, WT);

  assert.strictEqual(outerPoly.length, 6, 'Outer boundary polygon maintains vertex count');
  assert.strictEqual(innerPoly.length, 6, 'Inner boundary polygon maintains vertex count');
});

test('Wall openings are rendered as 2D shape holes embedded within extruded wall geometry', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'bedroom', 0, 0, 120, 120);
  // Add window on North wall ('N')
  m.addOpening(state, room, 'win_hung_36x60', 'N', 36);

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const wallGroup = api.entityMap.get(`${room.id}:wall:N`);
  assert.ok(wallGroup, 'Wall N group created in 3D scene');

  // Find extruded wall mesh in group
  let extrudeMesh = null;
  wallGroup.traverse((child) => {
    if (child.isMesh && child.geometry && child.geometry.type === 'ExtrudeGeometry') {
      extrudeMesh = child;
    }
  });

  assert.ok(extrudeMesh, 'Wall geometry is created using ExtrudeGeometry');
  const shapes = extrudeMesh.geometry.parameters.shapes;
  assert.ok(shapes, 'ExtrudeGeometry shape parameter present');
  const shape = Array.isArray(shapes) ? shapes[0] : shapes;
  assert.ok(shape.holes.length > 0, '2D shape contains embedded hole path for window opening');
});

test('3D wall generation uses continuous THREE.ExtrudeGeometry contours to prevent corner gaps', () => {
  const state = m.newState();
  // Complex non-rectangular room (L-shape)
  const lRoom = m.createRoom(state, 'living', 0, 0, 144, 144);
  lRoom.points = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 72 },
    { x: 72, y: 72 },
    { x: 72, y: 144 },
    { x: 0, y: 144 },
  ];

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  for (let i = 0; i < lRoom.points.length; i++) {
    const wallKey = `${lRoom.id}:wall:${i}`;
    const wallGroup = api.entityMap.get(wallKey);
    assert.ok(wallGroup, `Wall ${i} entity present for complex polygon room`);

    let extrudeMesh = null;
    wallGroup.traverse((child) => {
      if (child.isMesh && child.geometry && child.geometry.type === 'ExtrudeGeometry') {
        extrudeMesh = child;
      }
    });
    assert.ok(extrudeMesh, `Wall ${i} rendered using continuous ExtrudeGeometry contour`);
  }
});

test('Door hinge positioning uses 2D contour tangent math to guarantee inward door swing direction', () => {
  const state = m.newState();
  const room = m.createRoom(state, 'entry', 0, 0, 120, 120);
  const room2 = m.createRoom(state, 'hallway', 0, 120, 120, 120); // Adjacent on South wall
  assert.ok(room2);
  // Add interior door on shared South wall ('S') with inward swing
  const doorIn = m.addOpening(state, room, 'door_interior_32', 'S', 36, { swing: 'in' });

  const api = createScene3D(
    canvas,
    () => state,
    () => 0
  );
  api.show();

  const doorInGroup = api.entityMap.get(doorIn.id);
  assert.ok(doorInGroup, 'Inward door entity present');

  let pivotIn = null;
  doorInGroup.traverse((child) => {
    if (child.type === 'Group' && child.children.length > 0) {
      pivotIn = child;
    }
  });

  assert.ok(pivotIn, 'Door hinge pivot group present');

  // Verify inward swing rotation derived from contour tangent math
  const s2 = wallSeg(room, 'S');
  const alongAng2 = Math.atan2(s2.dy, s2.dx);
  const cross2 = s2.dx * s2.ny - s2.dy * s2.nx;
  const swingSign2 = Math.sign(cross2) || 1;
  const expectedRotationY = -(alongAng2 + swingSign2 * ((80 * Math.PI) / 180));

  assert.ok(
    Math.abs(pivotIn.rotation.y - expectedRotationY) < 1e-4,
    'Door hinge rotation aligns with 2D contour tangent and inward normal'
  );
});
