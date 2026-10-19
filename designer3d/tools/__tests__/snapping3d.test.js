import {
  distance3D,
  closestPointOnSegment3D,
  snap3DToGrid,
  snap3DToVertex,
  snap3DToEdge,
  snap3DToMidpoint,
  snap3DToPerpendicular,
  snap3DToAngle,
  computeSurfaceOrientation,
  getSnappedPoint3D,
} from '../snapping3d.mjs';
import { createGridSettings } from '../gridSettings.mjs';
import { SnapModeState, SNAP_MODES } from '../snapModes.mjs';
import { InteractionLayer } from '../interactionLayer.mjs';

describe('3D Vector Math & Distance Functions', () => {
  test('distance3D computes 3D Euclidean distance', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 12 };
    expect(distance3D(p1, p2)).toBe(13);
  });

  test('closestPointOnSegment3D projects points onto 3D line segment', () => {
    const start = { x: 0, y: 0, z: 0 };
    const end = { x: 10, y: 0, z: 0 };
    const point = { x: 5, y: 5, z: 0 };

    const res = closestPointOnSegment3D(point, start, end);
    expect(res.point).toEqual({ x: 5, y: 0, z: 0 });
    expect(res.t).toBe(0.5);
  });
});

describe('3D Snap Modes', () => {
  const settings = createGridSettings({ unitSize: 6, magneticThreshold: 12 });

  test('snap3DToGrid quantizes 3D vector coordinates', () => {
    const pt = { x: 13, y: 5.8, z: 23.9 };
    const snapped = snap3DToGrid(pt, settings);
    expect(snapped).toEqual({ x: 12, y: 6, z: 24 });
  });

  test('snap3DToVertex identifies nearest 3D vertex within threshold', () => {
    const vertices = [
      { x: 0, y: 0, z: 0, id: 'v1' },
      { x: 100, y: 96, z: 100, id: 'v2' },
    ];
    const pt = { x: 2, y: 3, z: 1 };
    const snap = snap3DToVertex(pt, vertices, 12);
    expect(snap).not.toBeNull();
    expect(snap.type).toBe('vertex');
    expect(snap.vertexId).toBe('v1');
  });

  test('snap3DToEdge calculates 3D edge snapping', () => {
    const edges = [{ start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, index: 0 }];
    const pt = { x: 50, y: 3, z: 2 };
    const snap = snap3DToEdge(pt, edges, 12);
    expect(snap).not.toBeNull();
    expect(snap.type).toBe('edge');
    expect(snap.point.x).toBe(50);
  });

  test('snap3DToMidpoint snaps to edge midpoints', () => {
    const edges = [{ start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, index: 0 }];
    const pt = { x: 48, y: 2, z: 1 };
    const snap = snap3DToMidpoint(pt, edges, 12);
    expect(snap).not.toBeNull();
    expect(snap.type).toBe('midpoint');
    expect(snap.point).toEqual({ x: 50, y: 0, z: 0 });
  });

  test('snap3DToPerpendicular calculates perpendicular 3D alignment', () => {
    const edges = [{ start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, index: 0 }];
    const anchor = { x: 20, y: 0, z: 0 };
    const pt = { x: 20, y: 0, z: 30 };

    const snap = snap3DToPerpendicular(pt, anchor, edges, 50);
    expect(snap).not.toBeNull();
    expect(snap.type).toBe('perpendicular');
  });

  test('snap3DToAngle calculates 3D angle snapping relative to anchor', () => {
    const anchor = { x: 0, y: 0, z: 0 };
    const pt = { x: 10, y: 0, z: 10 };
    const snap = snap3DToAngle(pt, anchor, settings);
    expect(snap).not.toBeNull();
    expect(snap.type).toBe('angle');
    expect(snap.angleDegrees).toBeDefined();
  });

  test('computeSurfaceOrientation converts normal vector to yaw and pitch degrees', () => {
    const wallNormal = { x: 1, y: 0, z: 0 };
    const orient = computeSurfaceOrientation(wallNormal);
    expect(orient.yaw).toBe(90);
    expect(orient.pitch).toBe(0);
  });
});

describe('getSnappedPoint3D Evaluator', () => {
  test('evaluates enabled snap modes and selects best match', () => {
    const snapModes = new SnapModeState({
      [SNAP_MODES.GRID]: true,
      [SNAP_MODES.EDGE]: true,
    });
    const settings = createGridSettings({ unitSize: 6, magneticThreshold: 12 });
    const vertices = [{ x: 50, y: 0, z: 50, id: 'corner' }];

    const result = getSnappedPoint3D({
      point: { x: 49, y: 1, z: 51 },
      vertices,
      settings,
      snapModes,
    });

    expect(result.snap).not.toBeNull();
    expect(result.snap.type).toBe('vertex');
    expect(result.point).toEqual({ x: 50, y: 0, z: 50 });
  });
});

describe('InteractionLayer 3D Transform Integration', () => {
  test('moveEntity3D applies 3D snapping and surface normal alignment', () => {
    const layer = new InteractionLayer();
    const entity = { id: 'cabinet', position: { x: 10, y: 0, z: 10 } };
    const pointerPoint3D = { x: 12.1, y: 48, z: 0.2 };
    const wallNormal = { x: 0, y: 0, z: 1 };

    const res = layer.moveEntity3D(entity, pointerPoint3D, { normal: wallNormal });
    expect(res.position).toBeDefined();
    expect(res.orientation).toBeDefined();
    expect(res.interaction.type).toBe('move3d');
  });
});
