import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, createRoom, deserialize, updateMeshVertexZ } from '../js/model.js';
import { ElevationGrid } from '../js/elevationEngine.js';
import { SpatialBVH3D, triangleTriangleIntersect } from '../js/gisBridge.js';

test('Requirement 1: Room floor and ceiling models store 3D triangulated mesh graph structures with VertexZArray', () => {
  const state = newState();
  const room = createRoom(state, 'living', 0, 0, 120, 120, {
    floorZOffsets: [0, 12, 24, 6],
    ceilingZOffsets: [0, 12, 24, 6],
  });

  assert.ok(room.floorMesh, 'room.floorMesh must be created');
  assert.ok(room.ceilingMesh, 'room.ceilingMesh must be created');

  assert.ok(Array.isArray(room.floorMesh.VertexZArray), 'floorMesh must contain VertexZArray');
  assert.deepEqual(room.floorMesh.VertexZArray, [0, 12, 24, 6]);

  assert.ok(Array.isArray(room.ceilingMesh.VertexZArray), 'ceilingMesh must contain VertexZArray');
  assert.deepEqual(room.ceilingMesh.VertexZArray, [96, 108, 120, 102]);

  assert.equal(room.floorMesh.vertices.length, 4);
  assert.equal(room.floorMesh.vertices[1].z, 12);

  // Update distinct per-vertex elevation
  updateMeshVertexZ(room, 'floor', 2, 36);
  assert.equal(room.floorMesh.VertexZArray[2], 36);
  assert.equal(room.floorMesh.vertices[2].z, 36);
});

test('Requirement 1: Legacy flat plan models undergo automated migration to 3D triangulated mesh graphs', () => {
  const legacyPlanJSON = JSON.stringify({
    version: 2,
    name: 'Legacy Home',
    levels: 1,
    rooms: [
      {
        id: 'r_legacy',
        type: 'bedroom',
        name: 'Bedroom',
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
        ceiling: 96,
        floor: 'floor_oak',
        walls: { N: 'paint_white', E: 'paint_white', S: 'paint_white', W: 'paint_white' },
        openings: [],
        items: [],
      },
    ],
  });

  const state = deserialize(legacyPlanJSON);
  const room = state.rooms[0];

  assert.ok(room.floorMesh, 'Legacy plan migration must generate floorMesh');
  assert.ok(room.ceilingMesh, 'Legacy plan migration must generate ceilingMesh');
  assert.ok(Array.isArray(room.floorMesh.VertexZArray), 'Migrated room must store VertexZArray');
  assert.equal(room.floorMesh.VertexZArray.length, 4);
  assert.deepEqual(room.floorMesh.VertexZArray, [0, 0, 0, 0]);
  assert.deepEqual(room.ceilingMesh.VertexZArray, [96, 96, 96, 96]);
});

test('Requirement 3: ElevationGrid converts to volumetric 3D mesh and executes CSG boolean subtraction', () => {
  const grid = new ElevationGrid({
    width: 10,
    height: 10,
    data: new Float32Array(100).fill(20.0), // Uniform 20ft terrain
    bounds: { minX: -500, maxX: 500, minY: -500, maxY: 500 },
  });

  // Convert to volumetric 3D mesh
  const mesh = grid.toVolumetricMesh(-50);
  assert.ok(mesh.vertices.length >= 200, 'Volumetric mesh should contain top and bottom vertices');
  assert.ok(
    mesh.triangles.length >= 100,
    'Volumetric mesh should contain top and bottom triangles'
  );

  // CSG boolean foundation pad cut polygon
  const padPolygon = [
    { x: -100, y: -100 },
    { x: 100, y: -100 },
    { x: 100, y: 100 },
    { x: -100, y: 100 },
  ];

  const result = grid.executeFoundationCut(padPolygon, 0.0); // Cut pad down to 0 elevation

  assert.ok(
    result.executionTimeMs < 50,
    `CSG cut execution time (${result.executionTimeMs.toFixed(2)}ms) must be under 50ms`
  );
  assert.equal(grid.minElevation, 0.0, 'Min elevation should be updated to pad elevation 0.0');

  // Check center point elevation inside pad footprint
  const centerElevation = grid.getElevationAt(0.5, 0.5);
  assert.equal(centerElevation, 0.0, 'Terrain inside pad footprint should be cut to 0.0 elevation');

  // Check outside point elevation remains original height (20.0)
  const cornerElevation = grid.getElevationAt(0.0, 0.0);
  assert.equal(
    cornerElevation,
    20.0,
    'Terrain outside pad footprint should retain original elevation'
  );
});

test('Requirement 3: Terrain grid caps vertex density at 10,000 vertices', () => {
  // Request massive 200x200 grid = 40,000 vertices
  const oversizedGrid = new ElevationGrid({
    width: 200,
    height: 200,
    data: new Float32Array(40000),
  });

  assert.ok(
    oversizedGrid.width * oversizedGrid.height <= 10000,
    'Grid vertex density must be capped at 10,000 vertices'
  );
  assert.equal(oversizedGrid.maxVertexCap, 10000);
});

test('Requirement 5: SpatialBVH3D constructs 3D spatial trees and handles triangle-level collision detection', () => {
  const bvh = new SpatialBVH3D();

  const tri1 = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 0, y: 10, z: 0 },
  ];

  const tri2_intersecting = [
    { x: 2, y: 2, z: -5 },
    { x: 2, y: 2, z: 5 },
    { x: 5, y: 5, z: 0 },
  ];

  const tri3_separated = [
    { x: 100, y: 100, z: 100 },
    { x: 110, y: 100, z: 100 },
    { x: 100, y: 110, z: 100 },
  ];

  assert.ok(
    triangleTriangleIntersect(tri1, tri2_intersecting),
    'tri1 and tri2_intersecting must intersect'
  );
  assert.equal(
    triangleTriangleIntersect(tri1, tri3_separated),
    false,
    'tri1 and tri3_separated must not intersect'
  );

  bvh.insert({ id: 'terrain_t1', triangle: tri1 });

  const hits = bvh.queryTriangleIntersections(tri2_intersecting);
  assert.equal(hits.length, 1, 'BVH query should find intersecting terrain triangle');
  assert.equal(hits[0].item.id, 'terrain_t1');

  const emptyHits = bvh.queryTriangleIntersections(tri3_separated);
  assert.equal(emptyHits.length, 0, 'BVH query should return no hits for separated triangle');
});
