const { validatePlacement, createPlacementFeedback } = require('../collision');

describe('validatePlacement', () => {
  test('non-overlapping rectangles are valid', () => {
    const candidate = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const existing = [
      [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
      ],
    ];

    const result = validatePlacement(candidate, existing);
    expect(result.valid).toBe(true);
    expect(result.reasons.overlaps).toHaveLength(0);
    expect(result.reasons.selfIntersecting).toBe(false);
  });

  test('overlapping rectangles are invalid', () => {
    const candidate = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const existing = [
      [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
      ],
    ];

    const result = validatePlacement(candidate, existing);
    expect(result.valid).toBe(false);
    expect(result.reasons.overlaps).toContain(0);
  });

  test('self-intersecting polygon is invalid', () => {
    // Bowtie shape
    const candidate = [
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ];

    const result = validatePlacement(candidate, []);
    expect(result.valid).toBe(false);
    expect(result.reasons.selfIntersecting).toBe(true);
  });

  test('identical polygons overlap', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    const result = validatePlacement(points, [points]);
    expect(result.valid).toBe(false);
    expect(result.reasons.overlaps).toContain(0);
  });

  test('no existing polygons is always valid', () => {
    const candidate = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    const result = validatePlacement(candidate);
    expect(result.valid).toBe(true);
  });
});

describe('createPlacementFeedback', () => {
  test('valid placement returns green style', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const validation = { valid: true, reasons: { overlaps: [], selfIntersecting: false } };
    const feedback = createPlacementFeedback(polygon, validation);

    expect(feedback.invalid).toBe(false);
    expect(feedback.style.color).toBe('#4ade80');
    expect(feedback.ghostPreview).toEqual(polygon);
  });

  test('invalid placement returns red style', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const validation = { valid: false, reasons: { overlaps: [0], selfIntersecting: false } };
    const feedback = createPlacementFeedback(polygon, validation);

    expect(feedback.invalid).toBe(true);
    expect(feedback.style.color).toBe('#f87171');
  });
});
