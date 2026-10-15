import { getSnappedPoint, snapAngle } from '../snapping.mjs';
import { SnapModeState, SNAP_MODES } from '../snapModes.mjs';
import { createGridSettings } from '../gridSettings.mjs';

describe('snapAngle', () => {
  const settings = createGridSettings({ angleSnapDegrees: 15 });

  test('snaps to nearest 15-degree increment', () => {
    const step = (15 * Math.PI) / 180;
    const input = 0.27; // ~15.5 degrees
    const result = snapAngle(input, settings);
    expect(result).toBeCloseTo(Math.round(input / step) * step, 5);
  });

  test('zero angle stays zero', () => {
    expect(snapAngle(0, settings)).toBe(0);
  });

  test('operates continuously across the 180-degree branch cut without sign flip anomalies', () => {
    const posNear180 = (179.9 * Math.PI) / 180;
    const negNear180 = (-179.9 * Math.PI) / 180;

    const snappedPos = snapAngle(posNear180, settings);
    const snappedNeg = snapAngle(negNear180, settings);

    // Both should quantize to Math.PI / -Math.PI radians (which point to identical direction vector)
    expect(Math.abs(snappedPos)).toBeCloseTo(Math.PI, 5);
    expect(Math.abs(snappedNeg)).toBeCloseTo(Math.PI, 5);

    // Corresponding direction vectors should be identical
    expect(Math.cos(snappedPos)).toBeCloseTo(Math.cos(snappedNeg), 5);
    expect(Math.sin(snappedPos)).toBeCloseTo(Math.sin(snappedNeg), 5);
  });
});

describe('getSnappedPoint', () => {
  test('snaps to grid when grid mode enabled', () => {
    const settings = createGridSettings({ unitSize: 0.5, magneticThreshold: 0.5 });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.EDGE]: false,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
    });

    const result = getSnappedPoint({
      point: { x: 0.3, y: 0.7 },
      edges: [],
      settings,
      snapModes,
    });

    expect(result.point.x).toBeCloseTo(0.5, 5);
    expect(result.point.y).toBeCloseTo(0.5, 5);
  });

  test('returns original point when no modes enabled', () => {
    const settings = createGridSettings();
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.EDGE]: false,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
    });

    const point = { x: 0.37, y: 0.82 };
    const result = getSnappedPoint({
      point,
      edges: [],
      settings,
      snapModes,
    });

    expect(result.point.x).toBe(0.37);
    expect(result.point.y).toBe(0.82);
    expect(result.snap).toBeNull();
  });

  test('snaps to edge when edge mode enabled and close enough', () => {
    const settings = createGridSettings({
      magneticThreshold: 0.3,
      edgeThreshold: 0.3,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.EDGE]: true,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
    });

    const edges = [{ start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, index: 0 }];

    const result = getSnappedPoint({
      point: { x: 1, y: 0.1 },
      edges,
      settings,
      snapModes,
    });

    expect(result.point.y).toBeCloseTo(0, 5);
    expect(result.snap.type).toBe('edge');
  });

  test('snaps to midpoint when midpoint mode enabled', () => {
    const settings = createGridSettings({
      magneticThreshold: 0.3,
      midpointThreshold: 0.3,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.EDGE]: false,
      [SNAP_MODES.MIDPOINT]: true,
      [SNAP_MODES.PERPENDICULAR]: false,
    });

    const edges = [{ start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, index: 0 }];

    const result = getSnappedPoint({
      point: { x: 1.05, y: 0.05 },
      edges,
      settings,
      snapModes,
    });

    expect(result.point.x).toBeCloseTo(1, 5);
    expect(result.point.y).toBeCloseTo(0, 5);
    expect(result.snap.type).toBe('midpoint');
  });

  test('picks closest snap when multiple candidates exist', () => {
    const settings = createGridSettings({
      unitSize: 1.0,
      magneticThreshold: 0.5,
      edgeThreshold: 0.5,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.EDGE]: true,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
    });

    const edges = [{ start: { x: 0, y: 0.05 }, end: { x: 2, y: 0.05 }, index: 0 }];

    // Point at (0.9, 0.1) — grid snap would go to (1, 0), edge snap to (0.9, 0.05)
    const result = getSnappedPoint({
      point: { x: 0.9, y: 0.1 },
      edges,
      settings,
      snapModes,
    });

    // Edge snap should win (distance ~0.05) vs grid (distance ~0.14)
    expect(result.snap.type).toBe('edge');
  });

  test('snaps relative to non-cardinal angled wall edges (0°, 90°, step increment)', () => {
    const settings = createGridSettings({
      angleSnapDegrees: 15,
      magneticThreshold: 2.0,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.EDGE]: false,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
      [SNAP_MODES.ANGLE]: true,
    });

    const wallAngle = 23.5 * (Math.PI / 180); // 23.5° wall
    const wallLength = 10;
    const edge = {
      start: { x: 0, y: 0 },
      end: { x: wallLength * Math.cos(wallAngle), y: wallLength * Math.sin(wallAngle) },
      index: 42,
    };

    const anchor = { x: 5, y: 5 };
    const dist = 10;

    // 1. Parallel (0° offset relative to 23.5° wall)
    const rawPointParallel = {
      x: anchor.x + dist * Math.cos(wallAngle + 0.01),
      y: anchor.y + dist * Math.sin(wallAngle + 0.01),
    };
    const resParallel = getSnappedPoint({
      point: rawPointParallel,
      anchor,
      edges: [edge],
      settings,
      snapModes,
    });

    expect(resParallel.snap).not.toBeNull();
    expect(resParallel.snap.type).toBe('angle');
    expect(resParallel.snap.edgeIndex).toBe(42);
    expect(resParallel.snap.angleDegrees).toBe(24); // Math.round(23.5) = 24
    expect(resParallel.point.x).toBeCloseTo(anchor.x + dist * Math.cos(wallAngle), 4);
    expect(resParallel.point.y).toBeCloseTo(anchor.y + dist * Math.sin(wallAngle), 4);

    // 2. Perpendicular (90° offset relative to 23.5° wall => 113.5°)
    const perpAngle = wallAngle + (90 * Math.PI) / 180;
    const rawPointPerp = {
      x: anchor.x + dist * Math.cos(perpAngle - 0.01),
      y: anchor.y + dist * Math.sin(perpAngle - 0.01),
    };
    const resPerp = getSnappedPoint({
      point: rawPointPerp,
      anchor,
      edges: [edge],
      settings,
      snapModes,
    });

    expect(resPerp.snap).not.toBeNull();
    expect(resPerp.snap.type).toBe('angle');
    expect(resPerp.snap.edgeIndex).toBe(42);
    expect(resPerp.snap.angleDegrees).toBe(114); // Math.round(113.5) = 114
    expect(resPerp.point.x).toBeCloseTo(anchor.x + dist * Math.cos(perpAngle), 4);
    expect(resPerp.point.y).toBeCloseTo(anchor.y + dist * Math.sin(perpAngle), 4);

    // 3. Step Increment (15° offset relative to 23.5° wall => 38.5°)
    const stepAngle = wallAngle + (15 * Math.PI) / 180;
    const rawPointStep = {
      x: anchor.x + dist * Math.cos(stepAngle + 0.005),
      y: anchor.y + dist * Math.sin(stepAngle + 0.005),
    };
    const resStep = getSnappedPoint({
      point: rawPointStep,
      anchor,
      edges: [edge],
      settings,
      snapModes,
    });

    expect(resStep.snap).not.toBeNull();
    expect(resStep.snap.type).toBe('angle');
    expect(resStep.snap.edgeIndex).toBe(42);
    expect(resStep.snap.angleDegrees).toBe(39); // Math.round(38.5) = 39
    expect(resStep.point.x).toBeCloseTo(anchor.x + dist * Math.cos(stepAngle), 4);
    expect(resStep.point.y).toBeCloseTo(anchor.y + dist * Math.sin(stepAngle), 4);
  });

  test('ignores degenerate zero-length edge segments when evaluating relative angles', () => {
    const settings = createGridSettings({ angleSnapDegrees: 15, magneticThreshold: 2.0 });
    const snapModes = new SnapModeState({ [SNAP_MODES.GRID]: false, [SNAP_MODES.ANGLE]: true });

    const degenerateEdge = { start: { x: 5, y: 5 }, end: { x: 5, y: 5 }, index: 99 };
    const anchor = { x: 0, y: 0 };
    const point = { x: 10, y: 0.1 }; // Near 0° global

    const res = getSnappedPoint({
      point,
      anchor,
      edges: [degenerateEdge],
      settings,
      snapModes,
    });

    expect(res.snap).not.toBeNull();
    expect(res.snap.type).toBe('angle');
    expect(res.snap.edgeIndex).toBeUndefined(); // Snapped to global 0° reference, degenerate edge ignored
  });
});
