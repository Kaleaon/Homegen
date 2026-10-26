import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '#three';
import { buildDoor3DMesh } from '../js/doorBuilder.js';
import { wallSeg } from '../js/geometry.js';

const shapes = [
  { name: 'rectangle', room: { x: 10, y: 20, w: 180, h: 180 }, walls: ['N', 'E', 'S', 'W'] },
  {
    name: 'angled polygon',
    room: {
      points: [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
        { x: 240, y: 120 },
        { x: 120, y: 240 },
        { x: 0, y: 180 },
      ],
    },
    walls: [0, 1, 2, 3, 4],
  },
];

for (const { name, room, walls } of shapes) {
  for (const wall of walls) {
    for (const swing of ['in', 'out']) {
      for (const doubleDoor of [false, true]) {
        test(`${name} wall ${wall}: ${swing} swing, ${doubleDoor ? 'double' : 'single'} door`, () => {
          const opening = { id: 'door', offset: 24, width: doubleDoor ? 60 : 32, swing };
          const material = new THREE.MeshStandardMaterial();
          const group = buildDoor3DMesh({
            room,
            wall,
            opening,
            elevation: 12,
            definition: { id: 'door_interior_32', h: 80, doubleDoor },
            getFrameMaterial: () => material,
            getHardwareMaterial: () => material,
            glassMaterial: material,
            wallAlignedBox: () => new THREE.Group(),
            placeInWall: (_room, _wall, _t, _y, _depth, _elev, mesh) => mesh,
          });
          const segment = wallSeg(room, wall);
          const pivots = group.children.filter((child) => child.userData.role === 'doorPivot');
          assert.equal(pivots.length, doubleDoor ? 2 : 1);
          for (const pivot of pivots) {
            const right = pivot.userData.hand === 'right';
            const along = right ? opening.offset + opening.width - 1.2 : opening.offset + 1.2;
            assert.ok(Math.abs(pivot.position.x * 12 - (segment.ax + segment.dx * along)) < 1e-6);
            assert.ok(Math.abs(pivot.position.z * 12 - (segment.ay + segment.dy * along)) < 1e-6);
            assert.equal(pivot.position.y, 1);
            const leafDirection = new THREE.Vector3(right ? -1 : 1, 0, 0).applyAxisAngle(
              new THREE.Vector3(0, 1, 0),
              pivot.rotation.y
            );
            const inwardDot = leafDirection.x * segment.nx + leafDirection.z * segment.ny;
            assert.ok(
              swing === 'in' ? inwardDot > 0.9 : inwardDot < -0.9,
              'leaf must open toward the requested side of the actual wall'
            );
          }
          material.dispose();
        });
      }
    }
  }
}
