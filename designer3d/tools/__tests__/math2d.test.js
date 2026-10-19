import {
  closestPointOnArc,
  arcPolygonEdges,
  getArcParameters,
  pointOnArc,
  tessellateArc,
} from '../math2d.mjs';

describe('math2d arc geometry functions', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 10, y: 0 };

  test('getArcParameters identifies linear segments when bulge is 0', () => {
    const params = getArcParameters(start, end, 0);
    expect(params.isLinear).toBe(true);
    expect(params.arcLength).toBe(10);
  });

  test('getArcParameters computes correct parameters for semicircle (bulge = 1)', () => {
    const params = getArcParameters(start, end, 1);
    expect(params.isLinear).toBe(false);
    expect(params.radius).toBeCloseTo(5);
    expect(params.center.x).toBeCloseTo(5);
    expect(params.center.y).toBeCloseTo(0);
    expect(params.sagitta).toBeCloseTo(5);
    expect(params.arcLength).toBeCloseTo(5 * Math.PI);
  });

  test('pointOnArc evaluates points along the arc', () => {
    const startPt = pointOnArc(start, end, 1, 0);
    const midPt = pointOnArc(start, end, 1, 0.5);
    const endPt = pointOnArc(start, end, 1, 1);

    expect(startPt.x).toBeCloseTo(0);
    expect(startPt.y).toBeCloseTo(0);
    expect(midPt.x).toBeCloseTo(5);
    expect(midPt.y).toBeCloseTo(5); // sagitta = 5 left/up in left-normal direction
    expect(endPt.x).toBeCloseTo(10);
    expect(endPt.y).toBeCloseTo(0);
  });

  test('closestPointOnArc projects point onto arc segment', () => {
    // Semicircle bulging to y > 0
    const query = { x: 5, y: 10 };
    const res = closestPointOnArc(query, start, end, 1);

    expect(res.point.x).toBeCloseTo(5);
    expect(res.point.y).toBeCloseTo(5);
    expect(res.t).toBeCloseTo(0.5);
    expect(res.distance).toBeCloseTo(5);
  });

  test('closestPointOnArc falls back to endpoint when projection falls outside arc', () => {
    const query = { x: -10, y: -10 };
    const res = closestPointOnArc(query, start, end, 1);

    expect(res.point.x).toBeCloseTo(0);
    expect(res.point.y).toBeCloseTo(0);
    expect(res.t).toBe(0);
  });

  test('closestPointOnArc behaves linearly when bulge is 0', () => {
    const query = { x: 5, y: 5 };
    const res = closestPointOnArc(query, start, end, 0);

    expect(res.point.x).toBeCloseTo(5);
    expect(res.point.y).toBeCloseTo(0);
    expect(res.t).toBeCloseTo(0.5);
    expect(res.distance).toBeCloseTo(5);
  });

  test('arcPolygonEdges generates edge array with bulge parameters', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const bulges = [0.5, 0, -0.2, 0];

    const edges = arcPolygonEdges(points, bulges);
    expect(edges).toHaveLength(4);
    expect(edges[0].bulge).toBe(0.5);
    expect(edges[1].bulge).toBe(0);
    expect(edges[2].bulge).toBe(-0.2);
    expect(edges[3].bulge).toBe(0);
  });

  test('tessellateArc produces discrete linear points', () => {
    const pts = tessellateArc(start, end, 1, 4);
    expect(pts).toHaveLength(5);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[2].x).toBeCloseTo(5);
    expect(pts[2].y).toBeCloseTo(5);
    expect(pts[4].x).toBeCloseTo(10);
  });
});
