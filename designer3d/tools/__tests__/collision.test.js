import {
  boundingBox,
  invalidateBoundingBox,
  validatePlacement,
  createPlacementFeedback,
} from '../collision.mjs';
import { InteractionLayer } from '../interactionLayer.mjs';

describe('boundingBox', () => {
  test('computes min/max bounds in a single pass including negative coordinates', () => {
    const poly = [
      { x: -10, y: 4 },
      { x: 15, y: -3 },
      { x: 8, y: 22 },
      { x: -2, y: 0 },
    ];
    expect(boundingBox(poly)).toEqual({
      minX: -10,
      minY: -3,
      maxX: 15,
      maxY: 22,
    });
  });

  test('returns valid fallback bounds for zero-point and invalid inputs without throwing', () => {
    expect(boundingBox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(boundingBox(null)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(boundingBox(undefined)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  test('returns valid bounds for a single-point polygon without throwing', () => {
    expect(boundingBox([{ x: 7.5, y: -4.25 }])).toEqual({
      minX: 7.5,
      minY: -4.25,
      maxX: 7.5,
      maxY: -4.25,
    });
  });
});

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

  test('handles zero-point and single-point polygons without throwing or false overlaps', () => {
    const originCandidate = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];

    expect(validatePlacement([], [originCandidate])).toEqual({
      valid: true,
      reasons: { overlaps: [], selfIntersecting: false },
    });

    expect(validatePlacement(originCandidate, [[]])).toEqual({
      valid: true,
      reasons: { overlaps: [], selfIntersecting: false },
    });

    expect(validatePlacement([{ x: 1, y: 1 }], [originCandidate])).toEqual({
      valid: false,
      reasons: { overlaps: [0], selfIntersecting: false },
    });

    expect(validatePlacement([{ x: 10, y: 10 }], [originCandidate])).toEqual({
      valid: true,
      reasons: { overlaps: [], selfIntersecting: false },
    });
  });

  test('returns identical validation results when given cached boundingBox properties or pre-computed boxes', () => {
    const rawExisting = [
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
      [
        { x: 10, y: 10 },
        { x: 14, y: 10 },
        { x: 14, y: 14 },
        { x: 10, y: 14 },
      ],
    ];

    const propCachedExisting = rawExisting.map((poly) =>
      Object.assign([...poly], { boundingBox: boundingBox(poly) })
    );
    const wrappedCachedExisting = rawExisting.map((poly) => ({
      points: poly,
      boundingBox: boundingBox(poly),
    }));
    const precomputedBoxes = rawExisting.map((poly) => boundingBox(poly));

    const candidates = [
      [
        { x: 5, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 8 },
        { x: 5, y: 8 },
      ],
      [
        { x: 2, y: 2 },
        { x: 11, y: 2 },
        { x: 11, y: 11 },
        { x: 2, y: 11 },
      ],
      [
        { x: 20, y: 20 },
        { x: 24, y: 24 },
        { x: 24, y: 20 },
        { x: 20, y: 24 },
      ],
    ];

    for (const candidate of candidates) {
      const expected = validatePlacement(candidate, rawExisting);
      expect(validatePlacement(candidate, propCachedExisting)).toEqual(expected);
      expect(validatePlacement(candidate, wrappedCachedExisting)).toEqual(expected);
      expect(validatePlacement(candidate, precomputedBoxes)).toEqual(expected);
      expect(
        validatePlacement(candidate, rawExisting, { existingBoundingBoxes: precomputedBoxes })
      ).toEqual(expected);
    }
  });

  test('reuses cached bounding boxes without re-scanning static polygon coordinates', () => {
    let coordReads = 0;
    const trackedPoint = (x, y) => {
      const pt = {};
      Object.defineProperty(pt, 'x', {
        get() {
          coordReads += 1;
          return x;
        },
        enumerable: true,
      });
      Object.defineProperty(pt, 'y', {
        get() {
          coordReads += 1;
          return y;
        },
        enumerable: true,
      });
      return pt;
    };

    const trackedPoly = [
      trackedPoint(5, 5),
      trackedPoint(8, 5),
      trackedPoint(8, 8),
      trackedPoint(5, 8),
    ];
    const cache = new WeakMap();
    const candidateA = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const candidateB = [
      { x: 6, y: 6 },
      { x: 9, y: 6 },
      { x: 9, y: 9 },
      { x: 6, y: 9 },
    ];

    expect(validatePlacement(candidateA, [trackedPoly], { boundingBoxCache: cache }).valid).toBe(
      true
    );
    const readsAfterFirstCall = coordReads;
    expect(readsAfterFirstCall).toBeGreaterThan(0);

    expect(validatePlacement(candidateB, [trackedPoly], { boundingBoxCache: cache }).valid).toBe(
      false
    );
    expect(coordReads).toBe(readsAfterFirstCall);
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

describe('InteractionLayer bounding box caching', () => {
  test('caches static scene polygon bounding boxes across continuous moveEntity and scaleEntity calls', () => {
    const layer = new InteractionLayer({
      gridSettings: { unitSize: 1 },
      snapModes: { grid: false, edge: false, midpoint: false, perpendicular: false },
    });

    let staticPointReads = 0;
    const makeTrackedStaticPolygon = (x, y, size) =>
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
      ].map(([px, py]) => {
        const pt = {};
        Object.defineProperty(pt, 'x', {
          get() {
            staticPointReads += 1;
            return px;
          },
          enumerable: true,
        });
        Object.defineProperty(pt, 'y', {
          get() {
            staticPointReads += 1;
            return py;
          },
          enumerable: true,
        });
        return pt;
      });

    const existingPolygons = [
      makeTrackedStaticPolygon(20, 20, 10),
      makeTrackedStaticPolygon(50, 50, 10),
    ];
    const entity = {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      polygon: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 },
      ],
    };
    const context = { existingPolygons };

    const move1 = layer.moveEntity(entity, { x: 2, y: 2 }, context);
    expect(move1.placementFeedback.invalid).toBe(false);
    const readsAfterFirstMove = staticPointReads;
    expect(readsAfterFirstMove).toBeGreaterThan(0);

    const move2 = layer.moveEntity(entity, { x: 18, y: 18 }, context);
    expect(move2.placementFeedback.invalid).toBe(true);
    expect(move2.placementFeedback.reasons.overlaps).toEqual([0]);
    expect(staticPointReads).toBe(readsAfterFirstMove);

    const scaled = layer.scaleEntity(entity, { x: 25, y: 25 }, context);
    expect(scaled.placementFeedback.invalid).toBe(true);
    expect(staticPointReads).toBe(readsAfterFirstMove);
  });

  test('invalidates cached bounding boxes when dynamic scene polygons change', () => {
    const layer = new InteractionLayer({
      gridSettings: { unitSize: 1 },
      snapModes: { grid: false, edge: false, midpoint: false, perpendicular: false },
    });

    const dynamicPoly = [
      { x: 30, y: 30 },
      { x: 40, y: 30 },
      { x: 40, y: 40 },
      { x: 30, y: 40 },
    ];
    const existingPolygons = [dynamicPoly];
    const entity = {
      position: { x: 0, y: 0 },
      polygon: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 6 },
        { x: 0, y: 6 },
      ],
    };

    // Initial drag move does not collide with dynamicPoly at [30..40]
    const initialMove = layer.moveEntity(entity, { x: 5, y: 5 }, { existingPolygons });
    expect(initialMove.placementFeedback.invalid).toBe(false);

    // Mutate dynamicPoly in place to [4..14] and invalidate cache
    dynamicPoly[0].x = 4;
    dynamicPoly[0].y = 4;
    dynamicPoly[1].x = 14;
    dynamicPoly[1].y = 4;
    dynamicPoly[2].x = 14;
    dynamicPoly[2].y = 14;
    dynamicPoly[3].x = 4;
    dynamicPoly[3].y = 14;
    layer.invalidatePolygonCache(dynamicPoly);

    const afterInvalidate = layer.moveEntity(entity, { x: 5, y: 5 }, { existingPolygons });
    expect(afterInvalidate.placementFeedback.invalid).toBe(true);
    expect(afterInvalidate.placementFeedback.reasons.overlaps).toEqual([0]);

    // Also verify dynamic flag and invalidateBoundingBox on property-cached polygons
    dynamicPoly.boundingBox = boundingBox(dynamicPoly);
    for (const pt of dynamicPoly) {
      pt.x += 100;
      pt.y += 100;
    }
    invalidateBoundingBox(dynamicPoly);
    layer.invalidatePolygonCache();

    const afterMoveAway = layer.moveEntity(entity, { x: 5, y: 5 }, { existingPolygons });
    expect(afterMoveAway.placementFeedback.invalid).toBe(false);

    // Verify dynamicPolygons context bypasses stale cache automatically
    for (const pt of dynamicPoly) {
      pt.x -= 100;
      pt.y -= 100;
    }
    const withDynamicSet = layer.moveEntity(
      entity,
      { x: 5, y: 5 },
      { existingPolygons, dynamicPolygons: new Set([dynamicPoly]) }
    );
    expect(withDynamicSet.placementFeedback.invalid).toBe(true);

    // Verify replacing a polygon entry in existingPolygons uses new bounds while preserving static peers
    existingPolygons[0] = [
      { x: 60, y: 60 },
      { x: 70, y: 60 },
      { x: 70, y: 70 },
      { x: 60, y: 70 },
    ];
    const afterReplace = layer.moveEntity(entity, { x: 5, y: 5 }, { existingPolygons });
    expect(afterReplace.placementFeedback.invalid).toBe(false);
  });
});

describe('Open-interior polygon, polyline, and curved-arc collision checks', () => {
  test('accepts flush vertical, horizontal, angled, and T-junction shared walls while rejecting interior overlaps', () => {
    const baseRoom = [
      { x: 0, y: 0 },
      { x: 192, y: 0 },
      { x: 192, y: 168 },
      { x: 0, y: 168 },
    ];

    // Flush vertical shared wall at x = 192
    const flushEast = [
      { x: 192, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 120 },
      { x: 192, y: 120 },
    ];
    expect(validatePlacement(flushEast, [baseRoom]).valid).toBe(true);

    // Flush horizontal shared wall at y = 168 (T-junction at x = 120)
    const flushSouth = [
      { x: 0, y: 168 },
      { x: 120, y: 168 },
      { x: 120, y: 312 },
      { x: 0, y: 312 },
    ];
    expect(validatePlacement(flushSouth, [baseRoom]).valid).toBe(true);

    // Flush angled shared wall along (100, 0) -> (60, 100)
    const angledLeft = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 60, y: 100 },
      { x: 0, y: 100 },
    ];
    const angledRightFlush = [
      { x: 100, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 100 },
      { x: 60, y: 100 },
    ];
    expect(validatePlacement(angledRightFlush, [angledLeft]).valid).toBe(true);

    // Angled interior intrusion across shared angled wall
    const angledIntruding = [
      { x: 90, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 100 },
      { x: 50, y: 100 },
    ];
    const angledInvalid = validatePlacement(angledIntruding, [angledLeft]);
    expect(angledInvalid.valid).toBe(false);
    expect(angledInvalid.reasons.overlaps).toEqual([0]);
  });

  test('detects boundary-inscribed rooms via inward normal and edge midpoint probes', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Diamond whose vertices all sit on outer edges without any vertex inside outer
    const inscribedDiamond = [
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ];
    expect(validatePlacement(inscribedDiamond, [outer]).valid).toBe(false);

    // Sub-rectangle sharing 3 walls of outer
    const threeWallInscribed = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 60 },
      { x: 0, y: 60 },
    ];
    expect(validatePlacement(threeWallInscribed, [outer]).valid).toBe(false);
  });

  test('handles concave 6-vertex L-shaped room notches for detached, flush, and intruding rooms', () => {
    const lRoom = [
      { x: 0, y: 0 },
      { x: 240, y: 0 },
      { x: 240, y: 120 },
      { x: 120, y: 120 },
      { x: 120, y: 240 },
      { x: 0, y: 240 },
    ];

    const detachedInNotch = [
      { x: 132, y: 132 },
      { x: 228, y: 132 },
      { x: 228, y: 228 },
      { x: 132, y: 228 },
    ];
    expect(validatePlacement(detachedInNotch, [lRoom]).valid).toBe(true);

    const flushInNotch = [
      { x: 120, y: 120 },
      { x: 240, y: 120 },
      { x: 240, y: 240 },
      { x: 120, y: 240 },
    ];
    expect(validatePlacement(flushInNotch, [lRoom]).valid).toBe(true);

    const intrudingNotch = [
      { x: 108, y: 108 },
      { x: 240, y: 108 },
      { x: 240, y: 240 },
      { x: 108, y: 240 },
    ];
    expect(validatePlacement(intrudingNotch, [lRoom]).valid).toBe(false);
  });

  test('allows boundary-snapped 1-point and collinear 2-point polylines while rejecting interior cuts', () => {
    const lRoom = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    // 1-point corner snapped on edge and vertex
    expect(validatePlacement([{ x: 100, y: 100 }], [lRoom]).valid).toBe(true);
    expect(validatePlacement([{ x: 50, y: 100 }], [lRoom]).valid).toBe(true);
    expect(validatePlacement([{ x: 150, y: 50 }], [lRoom]).valid).toBe(false);

    // 2-point collinear trace along inner notch wall
    expect(
      validatePlacement(
        [
          { x: 0, y: 100 },
          { x: 100, y: 100 },
        ],
        [lRoom]
      ).valid
    ).toBe(true);

    // 2-point diagonal across open notch space
    expect(
      validatePlacement(
        [
          { x: 0, y: 100 },
          { x: 100, y: 200 },
        ],
        [lRoom]
      ).valid
    ).toBe(true);

    // 2-point segment tracing collinearly then plunging into L-room interior
    expect(
      validatePlacement(
        [
          { x: 0, y: 100 },
          { x: 200, y: 100 },
        ],
        [lRoom]
      ).valid
    ).toBe(false);
  });

  test('tessellates curved bulge walls before narrow-phase collision checks', () => {
    // North wall (0, 0) -> (120, 0) with bulge = -0.6 bows outward into y < 0 (up to y = -36)
    const curvedOutwardRoom = {
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ],
      bulges: { N: -0.6, E: 0, S: 0, W: 0 },
    };

    const neighborAboveChord = [
      { x: 20, y: -30 },
      { x: 100, y: -30 },
      { x: 100, y: -6 },
      { x: 20, y: -6 },
    ];
    expect(validatePlacement(neighborAboveChord, [curvedOutwardRoom]).valid).toBe(false);

    // North wall with bulge = 0.8 bows inward into y > 0 (sagitta = +48"), leaving a recessed pocket near y = 12..30
    const curvedInwardRoom = {
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ],
      bulges: [0.8, 0, 0, 0],
    };
    const pocketRoom = [
      { x: 45, y: 4 },
      { x: 75, y: 4 },
      { x: 75, y: 28 },
      { x: 45, y: 28 },
    ];
    expect(validatePlacement(pocketRoom, [curvedInwardRoom]).valid).toBe(true);
  });
});
