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

describe('TransformGizmo Exact Numerical Operations', () => {
  const settings = { unitSize: 6, angleSnapDegrees: 15, edgeThreshold: 6, magneticThreshold: 12 };
  const snapModes = { isEnabled: () => true };
  const gizmo = new TransformGizmo(settings, snapModes);

  test('setExactPosition sets exact floating-point coordinates without grid snapping', () => {
    const item = { id: 'sofa_1', position: { x: 60, y: 48 } };
    const movedObj = gizmo.setExactPosition(item, { x: 43.25, y: 89.75 });
    expect(movedObj.position).toEqual({ x: 43.25, y: 89.75 });
    expect(movedObj.interaction).toEqual({ type: 'move', exact: true, snap: null });

    const movedArgs = gizmo.setExactPosition(item, '37.5', -12.125, 8);
    expect(movedArgs.position).toEqual({ x: 37.5, y: -12.125, z: 8 });
  });

  test('setExactPosition sanitizes NaN and invalid string coordinates safely', () => {
    const item = { id: 'sofa_1', position: { x: 60, y: 48 } };
    const sanitized = gizmo.setExactPosition(item, { x: Number.NaN, y: 'invalid' });
    expect(sanitized.position).toEqual({ x: 60, y: 48 });

    const noPosItem = { id: 'chair_1' };
    const fallbackZero = gizmo.setExactPosition(noPosItem, Number.NaN, '');
    expect(fallbackZero.position).toEqual({ x: 0, y: 0 });
  });

  test('setExactPosition avoids sub-pixel floating-point drift', () => {
    const item = { id: 'sofa_1', position: { x: 0, y: 0 } };
    const moved = gizmo.setExactPosition(item, 0.1 + 0.2, 12.1 + 0.2);
    expect(moved.position).toEqual({ x: 0.3, y: 12.3 });
  });

  test('setExactPosition throws error if entity is missing', () => {
    expect(() => gizmo.setExactPosition(null, 10, 20)).toThrow(
      'TransformGizmo.setExactPosition: entity is required'
    );
  });

  test('setExactRotation sets exact angle without snapping and normalizes degrees', () => {
    const item = { id: 'sofa_1', rotation: 0 };
    const rotated = gizmo.setExactRotation(item, 33);
    expect(rotated.rotationDegrees).toBe(33);
    expect(rotated.rotation).toBeCloseTo((33 * Math.PI) / 180, 6);
    expect(rotated.interaction).toEqual({
      type: 'rotate',
      exact: true,
      degrees: 33,
      snap: null,
    });

    const negRotated = gizmo.setExactRotation(item, -45);
    expect(negRotated.rotationDegrees).toBe(315);
    expect(negRotated.rotation).toBeCloseTo((315 * Math.PI) / 180, 6);

    const wrappedRotated = gizmo.setExactRotation(item, '382.5');
    expect(wrappedRotated.rotationDegrees).toBe(22.5);
  });

  test('setExactRotation sanitizes NaN and invalid inputs safely', () => {
    const item = { id: 'sofa_1', rot: 90 };
    const sanitized = gizmo.setExactRotation(item, 'not-a-number');
    expect(sanitized.rotationDegrees).toBe(90);
    expect(sanitized.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  test('setExactRotation throws error if entity is missing', () => {
    expect(() => gizmo.setExactRotation(null, 45)).toThrow(
      'TransformGizmo.setExactRotation: entity is required'
    );
  });

  test('setExactScale sets exact uniform and per-axis scale and clamps to 0.05 minimum', () => {
    const item = { id: 'sofa_1', scale: { x: 1, y: 1, z: 1 } };
    const scaled = gizmo.setExactScale(item, 1.35);
    expect(scaled.scale).toEqual({ x: 1.35, y: 1.35, z: 1.35 });
    expect(scaled.interaction).toEqual({ type: 'scale', exact: true, snap: null });

    const clampedLow = gizmo.setExactScale(item, 0.01);
    expect(clampedLow.scale).toEqual({ x: 0.05, y: 0.05, z: 0.05 });

    const clampedNeg = gizmo.setExactScale(item, -2.5);
    expect(clampedNeg.scale).toEqual({ x: 0.05, y: 0.05, z: 0.05 });

    const perAxis = gizmo.setExactScale(item, { x: 0.02, y: 1.5, z: 'invalid' });
    expect(perAxis.scale).toEqual({ x: 0.05, y: 1.5, z: 1 });
  });

  test('setExactScale throws error if entity is missing', () => {
    expect(() => gizmo.setExactScale(null, 1.5)).toThrow(
      'TransformGizmo.setExactScale: entity is required'
    );
  });
});

describe('InteractionLayer Exact Entity Setters', () => {
  let InteractionLayer;

  beforeAll(async () => {
    ({ InteractionLayer } = await import('../interactionLayer.mjs'));
  });

  const rectPoly = (cx, cy, w, h) => [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];

  test('setEntityPosition validates placement against existing polygons', () => {
    const layer = new InteractionLayer();
    const obstacle = rectPoly(150, 50, 40, 40);
    const entity = {
      id: 'table_1',
      position: { x: 50, y: 50 },
      polygon: rectPoly(50, 50, 30, 30),
    };

    const validMove = layer.setEntityPosition(
      entity,
      { x: 80, y: 50 },
      { existingPolygons: [obstacle] }
    );
    expect(validMove.position).toEqual({ x: 80, y: 50 });
    expect(validMove.placementFeedback.invalid).toBe(false);

    const collidingMove = layer.setEntityPosition(entity, 145, 50, {
      existingPolygons: [obstacle],
    });
    expect(collidingMove.position).toEqual({ x: 145, y: 50 });
    expect(collidingMove.placementFeedback.invalid).toBe(true);
  });

  test('setEntityRotation rotates polygon and validates placement', () => {
    const layer = new InteractionLayer();
    const obstacle = rectPoly(85, 50, 20, 20);
    // Narrow vertical bar at (50, 50): width 10 (x: 45..55), height 80 (y: 10..90)
    const entity = {
      id: 'bench_1',
      position: { x: 50, y: 50 },
      rotation: 0,
      polygon: rectPoly(50, 50, 10, 80),
    };

    const clearRot = layer.setEntityRotation(entity, 0, { existingPolygons: [obstacle] });
    expect(clearRot.placementFeedback.invalid).toBe(false);

    // Rotating 90 deg makes x span 10..90, overlapping obstacle at x: 75..95
    const collidingRot = layer.setEntityRotation(entity, 90, { existingPolygons: [obstacle] });
    expect(collidingRot.rotationDegrees).toBe(90);
    expect(collidingRot.placementFeedback.invalid).toBe(true);
  });

  test('setEntityScale clamps minimum scale and validates scaled polygon placement', () => {
    const layer = new InteractionLayer();
    const obstacle = rectPoly(100, 50, 20, 20);
    const entity = {
      id: 'rug_1',
      position: { x: 50, y: 50 },
      scale: { x: 1, y: 1, z: 1 },
      polygon: rectPoly(50, 50, 30, 30),
    };

    const smallScale = layer.setEntityScale(entity, 0.001, { existingPolygons: [obstacle] });
    expect(smallScale.scale).toEqual({ x: 0.05, y: 0.05, z: 0.05 });
    expect(smallScale.placementFeedback.invalid).toBe(false);

    // Scaling by 3x makes x span 5..95, overlapping obstacle at x: 90..110
    const collidingScale = layer.setEntityScale(entity, 3, { existingPolygons: [obstacle] });
    expect(collidingScale.scale).toEqual({ x: 3, y: 3, z: 3 });
    expect(collidingScale.placementFeedback.invalid).toBe(true);
  });
});
