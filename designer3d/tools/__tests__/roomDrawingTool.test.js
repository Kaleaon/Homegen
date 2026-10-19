import { RoomDrawingTool } from '../roomDrawingTool.mjs';

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
});
