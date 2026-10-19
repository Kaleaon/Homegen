import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interiorPolygonData,
  polygonContainsRect,
  polygonContainsZone,
  WT,
} from '../js/geometry.js';
import { evaluate } from '../js/codes.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';
import { newState, addItem } from '../js/model.js';

test('geometry.js interiorPolygonData exports polygon data, centroid, and min clearance width', () => {
  const room = {
    x: 0,
    y: 0,
    w: 120,
    h: 120,
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 0, y: 120 },
    ],
  };

  const data = interiorPolygonData(room);
  assert.ok(Array.isArray(data.points), 'Data should include points array');
  assert.equal(data.points.length, 4);

  assert.ok(data.centroid, 'Data should include centroid');
  assert.equal(Math.round(data.centroid.x), 60);
  assert.equal(Math.round(data.centroid.y), 60);

  // Interior clearance width for 120" room with WT = 4.5 is 115.5
  assert.equal(data.minWidth, 120 - WT);
  assert.equal(data.minClearanceWidth, data.minWidth);
  assert.equal(data.minEdgeClearanceWidth, data.minWidth);
});

test('interiorPolygonData accurately computes narrow section clearance for L-shaped multi-vertex room', () => {
  // L-shaped room: main body 120x120, narrow entry corridor 30" wide extending down to y=180
  const lRoom = {
    id: 'l_room_1',
    name: 'L-Shaped Living',
    type: 'living',
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 30, y: 120 },
      { x: 30, y: 180 },
      { x: 0, y: 180 },
    ],
  };

  const data = interiorPolygonData(lRoom);
  assert.equal(data.points.length, 6, 'L-shaped interior polygon should have 6 points');

  // Polygon centroid should be inside the L-shape region
  assert.ok(data.centroid.x > 0 && data.centroid.x < 120);
  assert.ok(data.centroid.y > 0 && data.centroid.y < 180);

  // Minimum edge clearance width corresponds to the narrow 30" corridor minus wall thickness
  assert.ok(data.minWidth < 30, `Expected min width < 30, got ${data.minWidth}`);
});

test('polygonContainsRect and polygonContainsZone accurately validate rect containment and notch rejection', () => {
  // L-shaped interior polygon
  const poly = [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 120 },
    { x: 60, y: 120 },
    { x: 60, y: 240 },
    { x: 0, y: 240 },
  ];

  // Item inside main area (0-120, 0-120)
  const itemInMain = { x: 10, y: 10, w: 40, h: 40 };
  assert.equal(polygonContainsRect(poly, itemInMain), true);

  // Item inside corridor (0-60, 120-240)
  const itemInCorridor = { x: 10, y: 130, w: 40, h: 40 };
  assert.equal(polygonContainsRect(poly, itemInCorridor), true);

  // Item in empty notch space (60-120, 120-240) - inside bounding box, but outside polygon
  const itemInNotch = { x: 70, y: 130, w: 40, h: 40 };
  assert.equal(
    polygonContainsRect(poly, itemInNotch),
    false,
    'Item in cutout notch outside room polygon must return false'
  );

  // Item straddling inner corner boundary
  const itemStraddling = { x: 50, y: 110, w: 40, h: 40 };
  assert.equal(
    polygonContainsRect(poly, itemStraddling),
    false,
    'Item straddling inner corner boundary must return false'
  );

  // polygonContainsZone delegates to polygonContainsRect
  assert.equal(polygonContainsZone(poly, itemInMain), true);
  assert.equal(polygonContainsZone(poly, itemInNotch), false);
});

test('codes.js triggers item-bounds violation for item in bounding box space outside room polygon', () => {
  const state = newState();
  // Create L-shaped room
  const room = {
    id: 'l_room_code',
    name: 'L-Room',
    type: 'living',
    level: 0,
    ceiling: 96,
    floor: 'wood_oak',
    walls: { N: 'paint_white', E: 'paint_white', S: 'paint_white', W: 'paint_white' },
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 60, y: 120 },
      { x: 60, y: 240 },
      { x: 0, y: 240 },
    ],
    items: [],
    openings: [],
  };
  state.rooms.push(room);

  // Add item in the empty cutout notch (x=80, y=160, size 30x30)
  addItem(state, room, 'armchair', { x: 80, y: 160, rot: 0 });

  const report = evaluate(state);
  const boundsViolation = report.violations.find(
    (v) => v.rule === 'item-bounds' && v.roomId === room.id
  );

  assert.ok(
    boundsViolation,
    'Item placed in empty notch space outside room polygon must trigger item-bounds violation'
  );
});

test('codes.js triggers min-dim violation for room with narrow section below code minimums', () => {
  const state = newState();
  // Habitable room (bedroom) with 120x120 main area and narrow 30" corridor extension
  // Bounding box is 120x180 (min bbox dim = 120 >= 84), but narrow section is 30" < 84"
  const room = {
    id: 'narrow_room',
    name: 'Habitable Narrow Corridor',
    type: 'bedroom',
    level: 0,
    ceiling: 96,
    floor: 'wood_oak',
    walls: { N: 'paint_white', E: 'paint_white', S: 'paint_white', W: 'paint_white' },
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 30, y: 120 },
      { x: 30, y: 180 },
      { x: 0, y: 180 },
    ],
    items: [],
    openings: [],
  };
  state.rooms.push(room);

  const report = evaluate(state);
  const minDimViolation = report.violations.find(
    (v) => v.rule === 'min-dim' && v.roomId === room.id
  );

  assert.ok(
    minDimViolation,
    'Room with narrow corridor section below 84" min dimension must trigger min-dim violation'
  );
});

test('complianceOverlay.js renders vertex handles at every polygon vertex for multi-vertex rooms', () => {
  const state = newState();
  const room = {
    id: 'hex_room',
    name: '6-Vertex Room',
    type: 'living',
    level: 0,
    ceiling: 96,
    points: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
      { x: 60, y: 120 },
      { x: 60, y: 240 },
      { x: 0, y: 240 },
    ],
    items: [],
    openings: [],
  };
  state.rooms.push(room);

  const report = evaluate(state);
  const scene = new ComplianceOverlayScene();
  scene.update(state, report, { curLevel: 0, selection: room.id });

  const handles = scene.getNodesByType('constraintHandle');
  assert.equal(
    handles.length,
    6,
    'Overlay must render 6 constraint handles for a 6-vertex room layout'
  );

  // Dimension label should anchor at polygon centroid
  const dimLabel = scene.getNodesByType('dimensionLabel')[0];
  assert.ok(dimLabel, 'Dimension label node should exist');

  const polyData = interiorPolygonData(room);
  assert.equal(dimLabel.bounds.x, polyData.centroid.x);
  assert.equal(dimLabel.bounds.y, polyData.centroid.y);
  assert.ok(
    dimLabel.data.dimensionText.includes('min clear'),
    'Multi-vertex dimension label text should display calculated minimum clearance'
  );
});
