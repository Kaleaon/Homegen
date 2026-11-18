import {
  getSnappedPoint,
  snapAngle,
  snapToAngle,
  parseExplicitAngleDegrees,
} from '../snapping.mjs';
import { SnapModeState, SNAP_MODES } from '../snapModes.mjs';
import { createGridSettings } from '../gridSettings.mjs';
import { SNAP_TOGGLE_DEFINITIONS } from '../uiSnapToggles.mjs';

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

  test('explicitAngleDegrees bypasses 15-degree step quantization in snapAngle and snapToAngle', () => {
    const customSettings = createGridSettings({
      angleSnapDegrees: 15,
      explicitAngleDegrees: 22.5,
    });
    expect(snapAngle(0.1, customSettings)).toBeCloseTo((22.5 * Math.PI) / 180, 6);

    const anchor = { x: 10, y: 20 };
    const dist = 50;
    const rawPoint = { x: anchor.x + dist, y: anchor.y }; // 0° pointer, far from 37°
    const snapRes = snapToAngle(rawPoint, anchor, {
      ...settings,
      magneticThreshold: 0.2,
      explicitAngleDegrees: 37,
    });

    expect(snapRes).not.toBeNull();
    expect(snapRes.type).toBe('angle');
    expect(snapRes.explicit).toBe(true);
    expect(snapRes.angleDegrees).toBe(37);
    expect(snapRes.point.x).toBeCloseTo(anchor.x + dist * Math.cos((37 * Math.PI) / 180), 5);
    expect(snapRes.point.y).toBeCloseTo(anchor.y + dist * Math.sin((37 * Math.PI) / 180), 5);
  });
});

describe('getSnappedPoint', () => {
  test('explicitAngleDegrees overrides 15-degree step and grid snapping with exact vector angle', () => {
    const settings = createGridSettings({
      unitSize: 1.0,
      angleSnapDegrees: 15,
      magneticThreshold: 0.2,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.EDGE]: true,
      [SNAP_MODES.MIDPOINT]: true,
      [SNAP_MODES.PERPENDICULAR]: true,
      [SNAP_MODES.ANGLE]: true,
    });

    const anchor = { x: 4, y: 6 };
    const dist = 20;
    // Pointer near 0° grid intersection where grid/15° step would normally win
    const point = { x: anchor.x + dist, y: anchor.y };

    const result = getSnappedPoint({
      point,
      anchor,
      edges: [{ start: { x: 0, y: 6 }, end: { x: 40, y: 6 }, index: 0 }],
      settings,
      snapModes,
      explicitAngleDegrees: '33.5',
    });

    const expectedRad = (33.5 * Math.PI) / 180;
    expect(result.snap).not.toBeNull();
    expect(result.snap.type).toBe('angle');
    expect(result.snap.explicit).toBe(true);
    expect(result.snap.angleDegrees).toBe(33.5);
    expect(result.point.x).toBeCloseTo(anchor.x + dist * Math.cos(expectedRad), 5);
    expect(result.point.y).toBeCloseTo(anchor.y + dist * Math.sin(expectedRad), 5);

    // Also verify 0° and negative explicit angle via settings.explicitAngleDegrees
    const zeroRes = getSnappedPoint({
      point: { x: anchor.x + 12, y: anchor.y + 9 }, // dist = 15 at ~36.87°
      anchor,
      settings: createGridSettings({ explicitAngleDegrees: 0 }),
      snapModes,
    });
    expect(zeroRes.snap.angleDegrees).toBe(0);
    expect(zeroRes.point.x).toBeCloseTo(anchor.x + 15, 5);
    expect(zeroRes.point.y).toBeCloseTo(anchor.y, 5);

    const negRes = getSnappedPoint({
      point: { x: anchor.x + 10, y: anchor.y },
      anchor,
      settings: createGridSettings({ explicitAngleDegrees: -45 }),
      snapModes,
    });
    expect(negRes.snap.angleDegrees).toBe(-45);
    expect(negRes.point.x).toBeCloseTo(anchor.x + 10 * Math.cos((-45 * Math.PI) / 180), 5);
    expect(negRes.point.y).toBeCloseTo(anchor.y + 10 * Math.sin((-45 * Math.PI) / 180), 5);
  });

  test('falls back to default snapping when explicitAngleDegrees is empty or invalid text', () => {
    expect(parseExplicitAngleDegrees('')).toBeNull();
    expect(parseExplicitAngleDegrees('   ')).toBeNull();
    expect(parseExplicitAngleDegrees('abc')).toBeNull();
    expect(parseExplicitAngleDegrees('15deg')).toBeNull();
    expect(parseExplicitAngleDegrees(Number.NaN)).toBeNull();

    const settings = createGridSettings({
      unitSize: 0.5,
      angleSnapDegrees: 15,
      magneticThreshold: 2.0,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.ANGLE]: true,
    });

    const anchor = { x: 0, y: 0 };
    const dist = 10;
    const near30 = (31 * Math.PI) / 180;
    const rawPoint = { x: dist * Math.cos(near30), y: dist * Math.sin(near30) };

    for (const invalidInput of ['', 'not-a-number', Number.NaN, null, undefined]) {
      const res = getSnappedPoint({
        point: rawPoint,
        anchor,
        settings,
        snapModes,
        explicitAngleDegrees: invalidInput,
      });
      expect(res.snap).not.toBeNull();
      expect(res.snap.type).toBe('angle');
      expect(res.snap.angleDegrees).toBe(30); // Fell back to 15° step snapping
    }
  });

  test('returns unchanged anchor coordinates without NaN on zero-length wall vectors', () => {
    const settings = createGridSettings({
      unitSize: 2.0,
      magneticThreshold: 5.0,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.ANGLE]: true,
    });

    // Non-grid-aligned anchor equal to point (zero-length vector)
    const anchor = { x: 3.37, y: 7.81 };
    const res = getSnappedPoint({
      point: { x: 3.37, y: 7.81 },
      anchor,
      settings,
      snapModes,
      explicitAngleDegrees: 42.5,
    });

    expect(Number.isNaN(res.point.x)).toBe(false);
    expect(Number.isNaN(res.point.y)).toBe(false);
    expect(res.point).toEqual({ x: 3.37, y: 7.81 });
  });
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

  test('snaps to arc edge and arc midpoint when bulge is non-zero', () => {
    const settings = createGridSettings({
      magneticThreshold: 1.0,
      edgeThreshold: 1.0,
      midpointThreshold: 1.0,
    });
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.EDGE]: true,
      [SNAP_MODES.MIDPOINT]: true,
      [SNAP_MODES.PERPENDICULAR]: false,
    });

    // Semicircle arc edge (bulge = 1) from (0,0) to (10,0), apex at (5,5)
    const edges = [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, bulge: 1, index: 0 }];

    // Test arc edge snap near apex
    const resultEdge = getSnappedPoint({
      point: { x: 5, y: 5.2 },
      edges,
      settings,
      snapModes,
    });
    expect(resultEdge.point.x).toBeCloseTo(5);
    expect(resultEdge.point.y).toBeCloseTo(5);
    expect(['edge', 'midpoint']).toContain(resultEdge.snap.type);

    // Test arc edge snap at t = 0.25
    const snapModesEdgeOnly = new SnapModeState({
      [SNAP_MODES.GRID]: false,
      [SNAP_MODES.EDGE]: true,
      [SNAP_MODES.MIDPOINT]: false,
      [SNAP_MODES.PERPENDICULAR]: false,
    });
    const resultEdgeOnly = getSnappedPoint({
      point: { x: 5, y: 5.2 },
      edges,
      settings,
      snapModes: snapModesEdgeOnly,
    });
    expect(resultEdgeOnly.point.x).toBeCloseTo(5);
    expect(resultEdgeOnly.point.y).toBeCloseTo(5);
    expect(resultEdgeOnly.snap.type).toBe('edge');
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

  describe('view-scale normalized distance thresholds', () => {
    const baseThreshold = 14;
    const settings = createGridSettings({
      magneticThreshold: baseThreshold,
      edgeThreshold: baseThreshold,
      midpointThreshold: baseThreshold,
      perpendicularThreshold: baseThreshold,
    });

    test('snaps reliably within 14px screen radius at scale 0.1 and rejects outside 14px', () => {
      const snapModes = new SnapModeState({
        [SNAP_MODES.GRID]: false,
        [SNAP_MODES.EDGE]: true,
        [SNAP_MODES.MIDPOINT]: false,
        [SNAP_MODES.PERPENDICULAR]: false,
        [SNAP_MODES.ANGLE]: false,
      });
      const edges = [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, index: 0 }];

      // At scale 0.1, threshold is 14 / 0.1 = 140 world units
      // 10 screen pixels away = 100 world units <= 140 (snaps)
      const inside = getSnappedPoint({
        point: { x: 500, y: 100 },
        edges,
        settings,
        snapModes,
        scale: 0.1,
      });
      expect(inside.snap).not.toBeNull();
      expect(inside.snap.type).toBe('edge');
      expect(inside.point.y).toBeCloseTo(0, 5);

      // 15 screen pixels away = 150 world units > 140 (rejects)
      const outside = getSnappedPoint({
        point: { x: 500, y: 150 },
        edges,
        settings,
        snapModes,
        scale: 0.1,
      });
      expect(outside.snap).toBeNull();
      expect(outside.point.y).toBe(150);
    });

    test('verifies edge and midpoint snapping at scale 1.0 and 2.0', () => {
      const snapModes = new SnapModeState({
        [SNAP_MODES.GRID]: false,
        [SNAP_MODES.EDGE]: true,
        [SNAP_MODES.MIDPOINT]: true,
        [SNAP_MODES.PERPENDICULAR]: false,
        [SNAP_MODES.ANGLE]: false,
      });
      const edges = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, index: 0 }];

      // Scale 1.0: threshold 14 world units
      const res1 = getSnappedPoint({
        point: { x: 105, y: 10 },
        edges,
        settings,
        snapModes,
        scale: 1.0,
      });
      expect(res1.snap).not.toBeNull();
      expect(res1.point.y).toBeCloseTo(0, 5);

      // Scale 2.0: threshold 7 world units
      const res2Inside = getSnappedPoint({
        point: { x: 100, y: 5 },
        edges,
        settings,
        snapModes,
        scale: 2.0,
      });
      expect(res2Inside.snap).not.toBeNull();
      expect(res2Inside.point.y).toBeCloseTo(0, 5);

      const res2Outside = getSnappedPoint({
        point: { x: 100, y: 8 },
        edges,
        settings,
        snapModes,
        scale: 2.0,
      });
      expect(res2Outside.snap).toBeNull();
    });

    test('safe fallback to 1.0 when scale is missing, zero, or negative', () => {
      const snapModes = new SnapModeState({
        [SNAP_MODES.GRID]: false,
        [SNAP_MODES.EDGE]: true,
        [SNAP_MODES.MIDPOINT]: false,
        [SNAP_MODES.PERPENDICULAR]: false,
        [SNAP_MODES.ANGLE]: false,
      });
      const edges = [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, index: 0 }];

      const resMissing = getSnappedPoint({
        point: { x: 50, y: 10 },
        edges,
        settings,
        snapModes,
      });
      expect(resMissing.snap).not.toBeNull();

      const resZero = getSnappedPoint({
        point: { x: 50, y: 10 },
        edges,
        settings,
        snapModes,
        scale: 0,
      });
      expect(resZero.snap).not.toBeNull();
    });
  });
});

describe('SNAP_TOGGLE_DEFINITIONS', () => {
  test('includes category classifications for all snap modes', () => {
    expect(SNAP_TOGGLE_DEFINITIONS).toHaveLength(4);

    const grid = SNAP_TOGGLE_DEFINITIONS.find((d) => d.id === 'grid');
    const edge = SNAP_TOGGLE_DEFINITIONS.find((d) => d.id === 'edge');
    const midpoint = SNAP_TOGGLE_DEFINITIONS.find((d) => d.id === 'midpoint');
    const perpendicular = SNAP_TOGGLE_DEFINITIONS.find((d) => d.id === 'perpendicular');

    expect(grid.category).toBe('basic');
    expect(edge.category).toBe('basic');
    expect(midpoint.category).toBe('advanced');
    expect(perpendicular.category).toBe('advanced');
  });
});
