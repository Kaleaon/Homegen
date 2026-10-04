import { InteractionLayer } from '../interactionLayer.mjs';
import {
  getConstraintHandles,
  resizeRoomWithConstraints,
  validateRoomDimensions,
  fmtDimensionText,
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
    expect(res.feedback.color).toBe('#f87171');
    expect(res.violations.some((v) => v.includes('70 sq ft'))).toBe(true);
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
  });
});
