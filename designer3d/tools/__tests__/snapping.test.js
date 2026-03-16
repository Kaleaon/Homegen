const { getSnappedPoint, snapAngle } = require('../snapping');
const { SnapModeState, SNAP_MODES } = require('../snapModes');
const { createGridSettings } = require('../gridSettings');

function makeContext(edges = []) {
  return { edges };
}

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

    const edges = [
      { start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, index: 0 },
    ];

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

    const edges = [
      { start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, index: 0 },
    ];

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

    const edges = [
      { start: { x: 0, y: 0.05 }, end: { x: 2, y: 0.05 }, index: 0 },
    ];

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
});
