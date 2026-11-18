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

  test('preview and closeRoom propagate context.getToken to placement feedback', () => {
    const tool = new RoomDrawingTool(settings, snapModes);
    tool.addCorner({ x: 0, y: 0 });
    tool.addCorner({ x: 10, y: 0 });
    tool.addCorner({ x: 10, y: 10 });

    const customGetToken = (name) => (name === '--ktheme-success' ? '#11aa22' : '#bb2233');
    const existingRooms = [
      [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
        { x: 15, y: 15 },
        { x: 5, y: 15 },
      ],
    ];

    const validPreview = tool.preview({ x: 0, y: 10 }, { getToken: customGetToken });
    expect(validPreview.invalid).toBe(false);
    expect(validPreview.style.color).toBe('#11aa22');
    expect(validPreview.style.outline).toBe('#11aa22');

    const invalidPreview = tool.preview(
      { x: 0, y: 10 },
      { existingRooms, getToken: customGetToken }
    );
    expect(invalidPreview.invalid).toBe(true);
    expect(invalidPreview.style.color).toBe('#bb2233');
    expect(invalidPreview.style.outline).toBe('#bb2233');

    tool.addCorner({ x: 0, y: 10 });
    const closeInvalid = tool.closeRoom({ existingRooms, getToken: customGetToken });
    expect(closeInvalid.ok).toBe(false);
    expect(closeInvalid.feedback.style.color).toBe('#bb2233');
    expect(closeInvalid.feedback.style.outline).toBe('#bb2233');
  });
});
