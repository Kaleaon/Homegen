import { InteractionLayer } from '../interactionLayer.mjs';
import {
  getConstraintHandles,
  resizeRoomWithConstraints,
  stepResize,
  validateRoomDimensions,
  fmtDimensionText,
  fmtLenInches,
  fmtAngleDegrees,
} from '../constraintHandles.mjs';

describe('Constraint Handles & Dynamic Dimension Resizing', () => {
  const room = {
    id: 'room_1',
    name: 'Living Room',
    type: 'living',
    x: 0,
    y: 0,
    w: 144, // 12 ft
    h: 120, // 10 ft
  };

  test('getConstraintHandles returns 4 corner handles', () => {
    const handles = getConstraintHandles(room);
    expect(handles).toHaveLength(4);
    expect(handles[0]).toEqual({
      id: 'nw',
      index: 0,
      x: 0,
      y: 0,
      cursor: 'nwse-resize',
      name: 'Top-Left',
    });
    expect(handles[1]).toEqual({
      id: 'ne',
      index: 1,
      x: 144,
      y: 0,
      cursor: 'nesw-resize',
      name: 'Top-Right',
    });
    expect(handles[2]).toEqual({
      id: 'sw',
      index: 2,
      x: 0,
      y: 120,
      cursor: 'nesw-resize',
      name: 'Bottom-Left',
    });
    expect(handles[3]).toEqual({
      id: 'se',
      index: 3,
      x: 144,
      y: 120,
      cursor: 'nwse-resize',
      name: 'Bottom-Right',
    });
  });

  test('InteractionLayer getConstraintHandles matches utility', () => {
    const layer = new InteractionLayer();
    const handles = layer.getConstraintHandles(room);
    expect(handles).toHaveLength(4);
    expect(handles[3].x).toBe(144);
    expect(handles[3].y).toBe(120);
  });

  test('resizeRoomWithConstraints resizes room validly when above code requirements', () => {
    const layer = new InteractionLayer();
    const res = layer.resizeRoomWithConstraints(room, 'se', { x: 180, y: 144 });

    expect(res.isValid).toBe(true);
    expect(res.rect.w).toBe(180); // 15 ft
    expect(res.rect.h).toBe(144); // 12 ft
    expect(res.dimensionText).toBe('15\' 0" × 12\' 0"');
    expect(res.areaSqFt).toBe(180);
    expect(res.feedback.color).toBe('#2a7fff');
  });

  test('resizeRoomWithConstraints flags violation (red feedback) when room area is under 70 sq ft for habitable room', () => {
    const res = resizeRoomWithConstraints(room, 'se', { x: 72, y: 72 }); // 6ft x 6ft = 36 sq ft < 70 sq ft

    expect(res.isValid).toBe(false);
    expect(res.rect.w).toBe(72);
    expect(res.rect.h).toBe(72);
    expect(res.areaSqFt).toBe(36);
    expect(res.feedback.color).toBe('#e84040'); // resolved --ktheme-critical token
    expect(res.feedback.handleColor).toBe('#e84040');
    expect(res.violations.some((v) => v.includes('70 sq ft'))).toBe(true);
  });

  test('resizeRoomWithConstraints falls back to aligned Ktheme tokens when getToken throws or returns empty', () => {
    const throwingGetToken = () => {
      throw new Error('token resolution error');
    };
    const emptyGetToken = () => '';

    const validThrowRes = resizeRoomWithConstraints(
      room,
      'se',
      { x: 180, y: 144 },
      { getToken: throwingGetToken }
    );
    expect(validThrowRes.feedback.color).toBe('#2a7fff');
    expect(validThrowRes.feedback.handleColor).toBe('#ffffff');

    const invalidThrowRes = resizeRoomWithConstraints(
      room,
      'se',
      { x: 72, y: 72 },
      { getToken: throwingGetToken }
    );
    expect(invalidThrowRes.feedback.color).toBe('#e84040');
    expect(invalidThrowRes.feedback.handleColor).toBe('#e84040');

    const invalidEmptyRes = resizeRoomWithConstraints(
      room,
      'se',
      { x: 72, y: 72 },
      { getToken: emptyGetToken }
    );
    expect(invalidEmptyRes.feedback.color).toBe('#e84040');
    expect(invalidEmptyRes.feedback.handleColor).toBe('#e84040');
  });

  test('resizeRoomWithConstraints respects custom options.getToken resolver', () => {
    const customGetToken = (name, fallback) => {
      if (name === '--ktheme-info') return '#0000ff';
      if (name === '--ktheme-critical') return '#ff0000';
      if (name === '--ktheme-on-primary') return '#ffff00';
      return fallback;
    };

    const validRes = resizeRoomWithConstraints(
      room,
      'se',
      { x: 180, y: 144 },
      { getToken: customGetToken }
    );
    expect(validRes.feedback.color).toBe('#0000ff');
    expect(validRes.feedback.handleColor).toBe('#ffff00');

    const invalidRes = resizeRoomWithConstraints(
      room,
      'se',
      { x: 72, y: 72 },
      { getToken: customGetToken }
    );
    expect(invalidRes.feedback.color).toBe('#ff0000');
    expect(invalidRes.feedback.handleColor).toBe('#ff0000');
  });

  test('validateRoomDimensions checks kitchen minimum dimension requirement', () => {
    const validKit = validateRoomDimensions('kitchen', 120, 72);
    expect(validKit.isValid).toBe(true);

    const invalidKit = validateRoomDimensions('kitchen', 120, 48); // 48 in < 60 in
    expect(invalidKit.isValid).toBe(false);
    expect(invalidKit.violations.some((v) => v.includes('5 ft'))).toBe(true);
  });

  test('fmtDimensionText formats inches into feet and inches', () => {
    expect(fmtDimensionText(144, 126)).toBe('12\' 0" × 10\' 6"');
    expect(fmtDimensionText(150.5, 126.375)).toBe('12\' 6 1/2" × 10\' 6 3/8"');
    expect(fmtLenInches(11.99)).toBe('1\' 0"');
  });

  test('getConstraintHandles creates handle nodes for all N vertices of non-rectangular polygon room', () => {
    const polygonRoom = {
      id: 'poly_room',
      name: 'L-Room',
      type: 'living',
      points: [
        { x: 0, y: 0 },
        { x: 240, y: 0 },
        { x: 240, y: 120 },
        { x: 120, y: 120 },
        { x: 120, y: 240 },
        { x: 0, y: 240 },
      ],
    };

    const handles = getConstraintHandles(polygonRoom);
    expect(handles).toHaveLength(6);
    expect(handles[0]).toEqual({
      id: 'v_0',
      index: 0,
      x: 0,
      y: 0,
      cursor: 'crosshair',
      name: 'Vertex 1',
    });
    expect(handles[3]).toEqual({
      id: 'v_3',
      index: 3,
      x: 120,
      y: 120,
      cursor: 'crosshair',
      name: 'Vertex 4',
    });
  });

  test('stepResize adjusts room dimensions in step increments', () => {
    const res = stepResize(room, 'se', 0, 12);
    expect(res.rect.w).toBe(144);
    expect(res.rect.h).toBe(132); // 120 + 12 = 132 (11 ft)
    expect(res.areaSqFt).toBe(132);
    expect(res.isValid).toBe(true);
    expect(res.dimensionText).toBe('12\' 0" × 11\' 0"');
  });

  test('fmtAngleDegrees formats numeric angles cleanly and handles non-finite inputs', () => {
    expect(fmtAngleDegrees(90)).toBe('90°');
    expect(fmtAngleDegrees(22.5)).toBe('22.5°');
    expect(fmtAngleDegrees(-0)).toBe('0°');
    expect(fmtAngleDegrees(33.336)).toBe('33.34°');
    expect(fmtAngleDegrees(Number.NaN)).toBe('0°');
  });

  test('resizeRoomWithConstraints exposes wall angles in feedback and supports explicitAngleDegrees', () => {
    const baseRes = resizeRoomWithConstraints(room, 'se', { x: 180, y: 144 });
    expect(baseRes.angleDegrees).toBe(90);
    expect(baseRes.angleText).toBe('90°');
    expect(baseRes.feedback.angleDegrees).toBe(90);
    expect(baseRes.feedback.angleText).toBe('90°');
    expect(baseRes.feedback.wallAngles).toHaveLength(4);

    // Explicit angle override on top-right ('ne') handle from top-left anchor (0, 0)
    const angledRes = resizeRoomWithConstraints(
      room,
      'ne',
      { x: 144, y: 0 },
      { explicitAngleDegrees: 25 }
    );
    const rad = (25 * Math.PI) / 180;
    expect(angledRes.angleDegrees).toBe(25);
    expect(angledRes.feedback.angleText).toBe('25°');
    expect(angledRes.points[1].x).toBeCloseTo(144 * Math.cos(rad), 5);
    expect(angledRes.points[1].y).toBeCloseTo(144 * Math.sin(rad), 5);

    // Zero-length vector returns unchanged anchor without NaN
    const zeroLenRes = resizeRoomWithConstraints(
      room,
      'ne',
      { x: 0, y: 0 },
      { explicitAngleDegrees: 25 }
    );
    expect(Number.isNaN(zeroLenRes.points[1].x)).toBe(false);
    expect(Number.isNaN(zeroLenRes.points[1].y)).toBe(false);
    expect(zeroLenRes.points[1]).toEqual({ x: 0, y: 0 });
  });
});
