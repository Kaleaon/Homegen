import { validatePlacement, createPlacementFeedback } from '../collision.mjs';
import { InteractionLayer } from '../interactionLayer.mjs';

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
  test('valid placement returns green style from theme token', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const validation = { valid: true, reasons: { overlaps: [], selfIntersecting: false } };
    const feedback = createPlacementFeedback(polygon, validation);

    expect(feedback.invalid).toBe(false);
    expect(feedback.style.color).toBe('#2f8f5b');
    expect(feedback.style.outline).toBe('#2f8f5b');
    expect(feedback.ghostPreview).toEqual(polygon);
  });

  test('invalid placement returns red style from theme token', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const validation = { valid: false, reasons: { overlaps: [0], selfIntersecting: false } };
    const feedback = createPlacementFeedback(polygon, validation);

    expect(feedback.invalid).toBe(true);
    expect(feedback.style.color).toBe('#e84040');
    expect(feedback.style.outline).toBe('#e84040');
  });

  test('createPlacementFeedback falls back to aligned DEFAULT_TOKENS when getToken throws or returns empty', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const throwingGetToken = () => {
      throw new Error('token resolver failed');
    };
    const emptyGetToken = () => '';

    const validFallback = createPlacementFeedback(
      polygon,
      { valid: true, reasons: {} },
      { getToken: throwingGetToken }
    );
    expect(validFallback.style.color).toBe('#2f8f5b');
    expect(validFallback.style.outline).toBe('#2f8f5b');

    const invalidFallback = createPlacementFeedback(
      polygon,
      { valid: false, reasons: {} },
      { getToken: emptyGetToken }
    );
    expect(invalidFallback.style.color).toBe('#e84040');
    expect(invalidFallback.style.outline).toBe('#e84040');
  });

  test('createPlacementFeedback respects custom options.getToken', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    const customGetToken = (name) => (name === '--ktheme-success' ? '#00ff00' : '#ff0000');

    const validFeedback = createPlacementFeedback(
      polygon,
      { valid: true, reasons: {} },
      { getToken: customGetToken }
    );
    expect(validFeedback.style.color).toBe('#00ff00');
    expect(validFeedback.style.outline).toBe('#00ff00');

    const invalidFeedback = createPlacementFeedback(
      polygon,
      { valid: false, reasons: {} },
      { getToken: customGetToken }
    );
    expect(invalidFeedback.style.color).toBe('#ff0000');
    expect(invalidFeedback.style.outline).toBe('#ff0000');
  });

  test('InteractionLayer moveEntity and scaleEntity propagate context.getToken to placement feedback', () => {
    const layer = new InteractionLayer({
      gridSettings: { unitSize: 1 },
      snapModes: { grid: false, edge: false, midpoint: false, perpendicular: false },
    });
    const entity = {
      id: 'item_1',
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1, z: 1 },
      polygon: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
    };
    const existingPolygons = [
      [
        { x: 10, y: 10 },
        { x: 12, y: 10 },
        { x: 12, y: 12 },
        { x: 10, y: 12 },
      ],
    ];
    const customGetToken = (name) => (name === '--ktheme-success' ? '#12ab34' : '#cd5678');

    const movedValid = layer.moveEntity(
      entity,
      { x: 2, y: 2 },
      { existingPolygons, getToken: customGetToken }
    );
    expect(movedValid.placementFeedback.style.color).toBe('#12ab34');
    expect(movedValid.placementFeedback.style.outline).toBe('#12ab34');

    const movedInvalid = layer.moveEntity(
      entity,
      { x: 10, y: 10 },
      { existingPolygons, getToken: customGetToken }
    );
    expect(movedInvalid.placementFeedback.style.color).toBe('#cd5678');
    expect(movedInvalid.placementFeedback.style.outline).toBe('#cd5678');

    const scaledValid = layer.scaleEntity(
      entity,
      { x: 2, y: 0 },
      { existingPolygons, getToken: customGetToken }
    );
    expect(scaledValid.placementFeedback.style.color).toBe('#12ab34');

    const scaledInvalid = layer.scaleEntity(
      entity,
      { x: 15, y: 0 },
      { existingPolygons, getToken: customGetToken }
    );
    expect(scaledInvalid.placementFeedback.style.color).toBe('#cd5678');
  });
});
