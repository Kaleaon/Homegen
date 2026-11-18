import { RoomDrawingTool } from '../roomDrawingTool.mjs';
import { SnapModeState, SNAP_MODES } from '../snapModes.mjs';
import { createGridSettings } from '../gridSettings.mjs';

describe('RoomDrawingTool with curve bulge support', () => {
  const settings = {
    unitSize: 1,
    edgeThreshold: 2,
    midpointThreshold: 2,
    perpendicularThreshold: 2,
    magneticThreshold: 5,
  };
  const snapModes = {
    isEnabled: () => false,
  };

  test('adds corners and sets/adjusts edge bulges', () => {
    const tool = new RoomDrawingTool(settings, snapModes);
    tool.addCorner({ x: 0, y: 0 });
    tool.addCorner({ x: 10, y: 0 });
    tool.addCorner({ x: 10, y: 10 });

    expect(tool.getEdgeBulge(0)).toBe(0);
    tool.setEdgeBulge(0, 0.5);
    expect(tool.getEdgeBulge(0)).toBe(0.5);

    tool.adjustBulge(0, 0.2);
    expect(tool.getEdgeBulge(0)).toBeCloseTo(0.7);
  });

  test('closeRoom returns room with bulges array', () => {
    const tool = new RoomDrawingTool(settings, snapModes);
    tool.addCorner({ x: 0, y: 0 });
    tool.addCorner({ x: 10, y: 0 });
    tool.addCorner({ x: 10, y: 10 });
    tool.addCorner({ x: 0, y: 10 });
    tool.addCorner({ x: 0, y: 0 }); // click back on start corner to close

    tool.setEdgeBulge(0, 0.3);
    tool.setEdgeBulge(2, -0.2);

    const res = tool.closeRoom();
    expect(res.ok).toBe(true);
    expect(res.room.closed).toBe(true);
    expect(res.room.corners).toHaveLength(4);
    expect(res.room.bulges).toEqual([0.3, 0, -0.2, 0]);
  });

  test('passes explicitAngleDegrees through preview and addCorner to place exact angled walls', () => {
    const angleSettings = createGridSettings({
      unitSize: 1,
      angleSnapDegrees: 15,
      magneticThreshold: 2,
    });
    const activeModes = new SnapModeState({
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.ANGLE]: true,
    });
    const tool = new RoomDrawingTool(angleSettings, activeModes);

    tool.addCorner({ x: 0, y: 0 });

    // Preview with custom 27.5° angle override
    const pv = tool.preview({ x: 20, y: 0 }, { explicitAngleDegrees: 27.5 });
    const expectedRad = (27.5 * Math.PI) / 180;
    expect(pv).not.toBeNull();
    expect(pv.point.x).toBeCloseTo(20 * Math.cos(expectedRad), 5);
    expect(pv.point.y).toBeCloseTo(20 * Math.sin(expectedRad), 5);
    expect(pv.snap.angleDegrees).toBe(27.5);

    // Commit second corner with custom 27.5° angle override
    const added = tool.addCorner({ x: 20, y: 0 }, { explicitAngleDegrees: 27.5 });
    expect(added.corner.x).toBeCloseTo(20 * Math.cos(expectedRad), 5);
    expect(added.corner.y).toBeCloseTo(20 * Math.sin(expectedRad), 5);

    // Zero-length vector from last corner returns unchanged anchor without NaN
    const zeroLen = tool.addCorner(
      { x: added.corner.x, y: added.corner.y },
      { explicitAngleDegrees: 65 }
    );
    expect(Number.isNaN(zeroLen.corner.x)).toBe(false);
    expect(Number.isNaN(zeroLen.corner.y)).toBe(false);
    expect(zeroLen.corner).toEqual(added.corner);

    // Invalid explicitAngleDegrees falls back to standard snapping
    const fallbackTool = new RoomDrawingTool(angleSettings, activeModes);
    fallbackTool.addCorner({ x: 0, y: 0 });
    const fallbackCorner = fallbackTool.addCorner(
      { x: 10, y: 0.1 },
      { explicitAngleDegrees: 'invalid' }
    );
    expect(fallbackCorner.corner.x).toBeCloseTo(10, 4);
    expect(fallbackCorner.corner.y).toBeCloseTo(0, 4);
  });
});
