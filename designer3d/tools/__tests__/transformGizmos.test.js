import { TransformGizmo } from '../transformGizmos.mjs';

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
