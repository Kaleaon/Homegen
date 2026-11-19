import { RoomDrawingTool } from '../roomDrawingTool.mjs';
import {
  InteractionLayer,
  parseExplicitLengthInches,
  computeVectorAngle,
  computeVertexFromAngle,
} from '../interactionLayer.mjs';
import { createGridSettings } from '../gridSettings.mjs';
import { SnapModeState } from '../snapModes.mjs';

describe('Explicit wall length calculations & RoomDrawingTool.addCornerWithLength', () => {
  const defaultSettings = createGridSettings({
    unitSize: 6,
    magneticThreshold: 8,
  });

  test('parseExplicitLengthInches parses numeric inches and architectural formats', () => {
    expect(parseExplicitLengthInches(174)).toBe(174);
    expect(parseExplicitLengthInches('174')).toBe(174);
    expect(parseExplicitLengthInches('174"')).toBe(174);
    expect(parseExplicitLengthInches('14\'6"')).toBe(174);
    expect(parseExplicitLengthInches('14\' 6"')).toBe(174);
    expect(parseExplicitLengthInches('14ft')).toBe(168);
    expect(parseExplicitLengthInches('14 ft 6 in')).toBe(174);
    expect(parseExplicitLengthInches("12'")).toBe(144);
  });

  test('parseExplicitLengthInches returns null for negative, zero, and malformed strings', () => {
    expect(parseExplicitLengthInches(-24)).toBeNull();
    expect(parseExplicitLengthInches('-144')).toBeNull();
    expect(parseExplicitLengthInches(0)).toBeNull();
    expect(parseExplicitLengthInches('0')).toBeNull();
    expect(parseExplicitLengthInches('abc')).toBeNull();
    expect(parseExplicitLengthInches('')).toBeNull();
    expect(parseExplicitLengthInches(null)).toBeNull();
    expect(parseExplicitLengthInches(Number.NaN)).toBeNull();
  });

  test('InteractionLayer angle and explicit length helpers compute exact vertex coordinates', () => {
    const layer = new InteractionLayer();

    expect(computeVectorAngle({ x: 10, y: 20 }, { x: 110, y: 20 })).toBeCloseTo(0);
    expect(layer.computeVectorAngle({ x: 10, y: 20 }, { x: 10, y: 120 })).toBeCloseTo(Math.PI / 2);

    // East (+X) 14'6" = 174 inches
    expect(layer.computeVertexFromAngle({ x: 24, y: 36 }, 0, '14\'6"')).toEqual({
      x: 198,
      y: 36,
    });

    // South (+Y) 10 ft = 120 inches
    expect(computeVertexFromAngle({ x: 198, y: 36 }, Math.PI / 2, 120)).toEqual({
      x: 198,
      y: 156,
    });

    // West (-X) 174 inches
    expect(layer.computeVertexFromAngle({ x: 198, y: 156 }, Math.PI, 174)).toEqual({
      x: 24,
      y: 156,
    });

    // 45-degree diagonal 100 inches
    const diag = layer.computeVertexFromAngle({ x: 0, y: 0 }, Math.PI / 4, 100);
    expect(diag.x).toBeCloseTo(70.710678, 4);
    expect(diag.y).toBeCloseTo(70.710678, 4);
  });

  test('addCornerWithLength places exact non-grid lengths along pointer vector', () => {
    const tool = new RoomDrawingTool(defaultSettings, new SnapModeState());

    const c1 = tool.addCornerWithLength({ x: 0, y: 0 }, null);
    expect(c1.ok).toBe(true);
    expect(c1.corner).toEqual({ x: 0, y: 0 });

    // Pointer aims East; explicit length 14'6" (174") overrides 6" grid snap (e.g. 150 -> 174)
    const c2 = tool.addCornerWithLength({ x: 151, y: 0 }, '14\'6"');
    expect(c2.ok).toBe(true);
    expect(c2.usedFallback).toBe(false);
    expect(c2.lengthInches).toBe(174);
    expect(c2.corner).toEqual({ x: 174, y: 0 });

    // Pointer aims South; explicit length 137" (off-grid)
    const c3 = tool.addCornerWithLength({ x: 174, y: 95 }, 137);
    expect(c3.ok).toBe(true);
    expect(c3.corner).toEqual({ x: 174, y: 137 });

    // Pointer aims West; explicit length 14' 6"
    const c4 = tool.addCornerWithLength({ x: 20, y: 137 }, '14\' 6"');
    expect(c4.ok).toBe(true);
    expect(c4.corner).toEqual({ x: 0, y: 137 });

    const closed = tool.closeRoom();
    expect(closed.ok).toBe(true);
    expect(closed.room.corners).toEqual([
      { x: 0, y: 0 },
      { x: 174, y: 0 },
      { x: 174, y: 137 },
      { x: 0, y: 137 },
    ]);
  });

  test('addCornerWithLength falls back safely to pointer-snapped value on invalid inputs', () => {
    const snapModes = new SnapModeState({ grid: true, angle: false });
    const tool = new RoomDrawingTool(defaultSettings, snapModes);
    tool.addCorner({ x: 0, y: 0 });

    // Invalid string 'abc' falls back to 6"-snapped pointer (143 -> 144)
    const rInvalidText = tool.addCornerWithLength({ x: 143, y: 0 }, 'abc');
    expect(rInvalidText.ok).toBe(true);
    expect(rInvalidText.usedFallback).toBe(true);
    expect(rInvalidText.corner).toEqual({ x: 144, y: 0 });

    // Negative number -50 falls back to 6"-snapped pointer (144, 119 -> 144, 120)
    const rNegative = tool.addCornerWithLength({ x: 144, y: 119 }, -50);
    expect(rNegative.ok).toBe(true);
    expect(rNegative.usedFallback).toBe(true);
    expect(rNegative.corner).toEqual({ x: 144, y: 120 });
  });

  test('addCornerWithLength rejects wall lengths violating 36-inch clear span', () => {
    const tool = new RoomDrawingTool(defaultSettings, new SnapModeState());
    tool.addCorner({ x: 0, y: 0 });

    const tooShort = tool.addCornerWithLength({ x: 120, y: 0 }, 24);
    expect(tooShort.ok).toBe(false);
    expect(tooShort.rejected).toBe(true);
    expect(tooShort.reasons.clearSpan).toBe(true);
    expect(tooShort.violations[0]).toMatch(/36 in/);
    expect(tool.getCornerCount()).toBe(1);

    // Narrow room clear span (< 36" depth even though wall chord >= 36")
    tool.addCornerWithLength({ x: 144, y: 0 }, 144);
    const sliver = tool.addCornerWithLength({ x: 72, y: 24 }, 80);
    expect(sliver.ok).toBe(false);
    expect(sliver.reasons.clearSpan).toBe(true);
    expect(tool.getCornerCount()).toBe(2);
  });

  test('addCornerWithLength rejects polygon self-intersection and room overlaps', () => {
    const layer = new InteractionLayer();
    layer.addRoomCorner({ x: 0, y: 0 });
    layer.addRoomCornerWithLength({ x: 144, y: 0 }, 144);
    layer.addRoomCornerWithLength({ x: 144, y: 120 }, 120);

    // 4th corner crosses north wall (0,0)->(144,0) toward (72, -80)
    const crossing = layer.addRoomCornerWithLength({ x: 72, y: -80 }, 210);
    expect(crossing.ok).toBe(false);
    expect(crossing.reasons.selfIntersecting).toBe(true);
    expect(crossing.violations.some((v) => /self-intersection/i.test(v))).toBe(true);
    expect(layer.getCornerCount()).toBe(3);

    // Overlap against an existing room object { x, y, w, h }
    const existingRooms = [{ id: 'r1', x: 200, y: 0, w: 120, h: 120 }];
    const layer2 = new InteractionLayer();
    layer2.addRoomCorner({ x: 100, y: 10 });
    const overlapRes = layer2.addRoomCornerWithLength({ x: 260, y: 10 }, 150, {
      existingRooms,
    });
    expect(overlapRes.ok).toBe(false);
    expect(overlapRes.reasons.overlaps.length).toBeGreaterThan(0);
    expect(layer2.getCornerCount()).toBe(1);
  });

  test('preview() accepts explicit numerical and architectural length overrides', () => {
    const layer = new InteractionLayer();
    layer.addRoomCorner({ x: 0, y: 0 });

    const pvValid = layer.previewRoom({ x: 90, y: 0 }, 174);
    expect(pvValid.valid).toBe(true);
    expect(pvValid.usedFallback).toBe(false);
    expect(pvValid.lengthInches).toBe(174);
    expect(pvValid.targetPoint).toEqual({ x: 174, y: 0 });
    expect(pvValid.ghostPreview).toEqual([
      { x: 0, y: 0 },
      { x: 174, y: 0 },
    ]);

    const pvInvalid = layer.previewRoom({ x: 90, y: 0 }, { explicitLength: 18 });
    expect(pvInvalid.valid).toBe(false);
    expect(pvInvalid.invalid).toBe(true);
    expect(pvInvalid.violations[0]).toMatch(/36 in/);
  });
});
