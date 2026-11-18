import {
  TransformGizmo,
  parseCoordinateInput,
  normalizeRotationDegrees,
  clampPositionToBounds,
} from '../transformGizmos.mjs';

describe('TransformGizmo Step Operations', () => {
  const settings = { unitSize: 6, angleSnapDegrees: 15, edgeThreshold: 6 };
  const snapModes = { isEnabled: () => false };
  const gizmo = new TransformGizmo(settings, snapModes);

  test('stepMove shifts position by delta inches', () => {
    const item = { id: 'sofa_1', position: { x: 60, y: 48 } };
    const moved = gizmo.stepMove(item, 12, 6);
    expect(moved.position).toEqual({ x: 72, y: 54 });
    expect(moved.interaction.type).toBe('move');
  });

  test('stepMove throws error if entity missing', () => {
    expect(() => gizmo.stepMove(null, 6, 6)).toThrow('TransformGizmo.stepMove: entity required');
  });

  test('stepRotate updates rotation by degrees in radians', () => {
    const item = { id: 'sofa_1', rotation: 0 };
    const rotated = gizmo.stepRotate(item, 15);
    expect(rotated.rotation).toBeCloseTo((15 * Math.PI) / 180);
    expect(rotated.interaction.type).toBe('rotate');
  });

  test('stepRotate throws error if entity missing', () => {
    expect(() => gizmo.stepRotate(null, 15)).toThrow('TransformGizmo.stepRotate: entity required');
  });

  test('stepScale updates scale by factor', () => {
    const item = { id: 'sofa_1', scale: { x: 1, y: 1, z: 1 } };
    const scaled = gizmo.stepScale(item, 1.1);
    expect(scaled.scale.x).toBeCloseTo(1.1);
    expect(scaled.interaction.type).toBe('scale');
  });

  test('stepScale throws error if entity missing', () => {
    expect(() => gizmo.stepScale(null, 1.1)).toThrow('TransformGizmo.stepScale: entity required');
  });
});

describe('TransformGizmo Direct Coordinate and Rotation Updates', () => {
  const settings = { unitSize: 6, angleSnapDegrees: 15, edgeThreshold: 6 };
  const snapModes = { isEnabled: () => true };
  const gizmo = new TransformGizmo(settings, snapModes);

  test('setPosition assigns explicit X, Y, Z coordinates without forcing grid snap', () => {
    const item = { id: 'table_1', x: 60, y: 48, z: 0, position: { x: 60, y: 48, z: 0 } };
    const updated = gizmo.setPosition(item, { x: 73.5, y: 51.25, z: 14 });
    expect(updated.position).toEqual({ x: 73.5, y: 51.25, z: 14 });
    expect(updated.x).toBe(73.5);
    expect(updated.y).toBe(51.25);
    expect(updated.z).toBe(14);
    expect(updated.interaction.type).toBe('setPosition');
    expect(updated.interaction.clamped).toBe(false);
  });

  test('setPosition3D assigns 3D coordinates and preserves unedited axes', () => {
    const item = { id: 'lamp_1', position: { x: 30, y: 40, z: 18 } };
    const updated = gizmo.setPosition3D(item, { x: 42.5, z: 24 });
    expect(updated.position).toEqual({ x: 42.5, y: 40, z: 24 });
    expect(updated.interaction.type).toBe('setPosition3d');
  });

  test('setPosition reverts empty or invalid input values to current coordinates', () => {
    const item = { id: 'chair_1', x: 60, y: 48, z: 6, position: { x: 60, y: 48, z: 6 } };
    const revertedEmpty = gizmo.setPosition(item, { x: '', y: '   ', z: null });
    expect(revertedEmpty.position).toEqual({ x: 60, y: 48, z: 6 });

    const revertedInvalid = gizmo.setPosition(item, { x: 'abc', y: NaN, z: Infinity });
    expect(revertedInvalid.position).toEqual({ x: 60, y: 48, z: 6 });
  });

  test('setPosition clamps out-of-bounds coordinates to room interior and ceiling bounds', () => {
    const room = { id: 'r1', x: 0, y: 0, w: 144, h: 120, ceiling: 96 };
    const item = { id: 'sofa_1', x: 72, y: 60, z: 0, position: { x: 72, y: 60, z: 0 } };
    // Wall thickness = 4.5 -> inset 2.25; sofa width=84 (half=42), depth=36 (half=18), height=34
    // minX = 44.25, maxX = 99.75; minY = 20.25, maxY = 99.75; minZ = 0, maxZ = 62
    const clamped = gizmo.setPosition(
      item,
      { x: 500, y: -40, z: 120 },
      { bounds: { room, width: 84, depth: 36, height: 34 } }
    );
    expect(clamped.position.x).toBeCloseTo(99.75);
    expect(clamped.position.y).toBeCloseTo(20.25);
    expect(clamped.position.z).toBe(62);
    expect(clamped.interaction.clamped).toBe(true);
  });

  test('setRotation normalizes explicit angles into [0, 360) and updates radians', () => {
    const item = { id: 'sofa_1', rot: 0, rotation: 0 };

    const rot37 = gizmo.setRotation(item, 37.5);
    expect(rot37.rot).toBeCloseTo(37.5);
    expect(rot37.rotation).toBeCloseTo((37.5 * Math.PI) / 180);

    const rotNeg = gizmo.setRotation(item, -45);
    expect(rotNeg.rot).toBe(315);
    expect(rotNeg.rotation).toBeCloseTo((315 * Math.PI) / 180);

    const rotWrap = gizmo.setRotation(item, 725);
    expect(rotWrap.rot).toBe(5);
    expect(rotWrap.rotation).toBeCloseTo((5 * Math.PI) / 180);

    const rot360 = gizmo.setRotation(item, 360);
    expect(rot360.rot).toBe(0);
  });

  test('setRotation reverts empty or invalid angles to current rotation', () => {
    const item = { id: 'sofa_1', rot: 90, rotation: Math.PI / 2 };
    expect(gizmo.setRotation(item, '').rot).toBe(90);
    expect(gizmo.setRotation(item, 'not-a-number').rot).toBe(90);
    expect(gizmo.setRotation(item, undefined).rot).toBe(90);
  });

  test('setRotation3D updates orientation yaw alongside normalized rotation', () => {
    const item = { id: 'wall_art', rot: 0 };
    const rotated = gizmo.setRotation3D(item, 30, { normal: { x: 0, y: 0, z: 1 } });
    expect(rotated.rot).toBe(30);
    expect(rotated.orientation.yaw).toBe(30);
    expect(rotated.interaction.type).toBe('setRotation3d');
  });

  test('setTransform updates both position and rotation in one call', () => {
    const item = { id: 'chair_2', x: 50, y: 50, z: 0, rot: 0 };
    const updated = gizmo.setTransform(item, { x: 80, y: 64, z: 4, rot: -90 });
    expect(updated.position).toEqual({ x: 80, y: 64, z: 4 });
    expect(updated.rot).toBe(270);
  });

  test('direct transform methods throw when entity is missing', () => {
    expect(() => gizmo.setPosition(null, { x: 10 })).toThrow(
      'TransformGizmo.setPosition: entity is required'
    );
    expect(() => gizmo.setPosition3D(null, { x: 10 })).toThrow(
      'TransformGizmo.setPosition3D: entity is required'
    );
    expect(() => gizmo.setRotation(null, 45)).toThrow(
      'TransformGizmo.setRotation: entity is required'
    );
    expect(() => gizmo.setRotation3D(null, 45)).toThrow(
      'TransformGizmo.setRotation3D: entity is required'
    );
    expect(() => gizmo.setTransform(null, { x: 10, rot: 45 })).toThrow(
      'TransformGizmo.setTransform: entity is required'
    );
  });

  test('helper functions parse, normalize, and clamp edge cases accurately', () => {
    expect(parseCoordinateInput('42.5', 10)).toBe(42.5);
    expect(parseCoordinateInput('', 10)).toBe(10);
    expect(normalizeRotationDegrees('-180', 0)).toBe(180);
    expect(
      clampPositionToBounds({ x: -5, y: 200, z: -3 }, { minX: 0, maxY: 100, minZ: 0 })
    ).toEqual({ x: 0, y: 100, z: 0 });
  });
});
