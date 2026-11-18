import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';

test('getBounds returns correct bounding boxes for rooms, items, and openings', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 120, 120);
  const sofa = M.addItem(state, room, 'sofa', { x: 60, y: 60, rot: 0 });
  const door = M.addOpening(state, room, 'door_entry_36', 'N', 30);

  const roomBounds = M.getBounds(state, room.id);
  assert.ok(roomBounds);
  assert.equal(roomBounds.x, 0);
  assert.equal(roomBounds.y, 0);
  assert.equal(roomBounds.w, 120);
  assert.equal(roomBounds.h, 120);
  assert.equal(roomBounds.cx, 60);
  assert.equal(roomBounds.cy, 60);

  const sofaBounds = M.getBounds(state, sofa.id);
  assert.ok(sofaBounds);
  assert.equal(sofaBounds.cx, 60);
  assert.equal(sofaBounds.cy, 60);
  assert.ok(sofaBounds.w > 0);
  assert.ok(sofaBounds.h > 0);

  const doorBounds = M.getBounds(state, door.id);
  assert.ok(doorBounds);
  assert.ok(doorBounds.w >= 4);
});

test('alignItems aligns items to left, center, right, top, middle, and bottom', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 300, 300);
  const item1 = M.addItem(state, room, 'armchair', { x: 50, y: 50 });
  const item2 = M.addItem(state, room, 'armchair', { x: 150, y: 120 });
  const item3 = M.addItem(state, room, 'armchair', { x: 250, y: 200 });

  // Align Left
  let stateCopy = M.clone(state);
  M.alignItems(stateCopy, [item1.id, item2.id, item3.id], 'left');
  const ab1 = M.getBounds(stateCopy, item1.id);
  const ab2 = M.getBounds(stateCopy, item2.id);
  const ab3 = M.getBounds(stateCopy, item3.id);
  assert.equal(ab1.x, ab2.x);
  assert.equal(ab2.x, ab3.x);

  // Align Center
  stateCopy = M.clone(state);
  M.alignItems(stateCopy, [item1.id, item2.id, item3.id], 'center');
  const cb1 = M.getBounds(stateCopy, item1.id);
  const cb2 = M.getBounds(stateCopy, item2.id);
  const cb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(cb1.cx, cb2.cx);
  assert.equal(cb2.cx, cb3.cx);

  // Align Right
  stateCopy = M.clone(state);
  M.alignItems(stateCopy, [item1.id, item2.id, item3.id], 'right');
  const rb1 = M.getBounds(stateCopy, item1.id);
  const rb2 = M.getBounds(stateCopy, item2.id);
  const rb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(rb1.x + rb1.w, rb2.x + rb2.w);
  assert.equal(rb2.x + rb2.w, rb3.x + rb3.w);

  // Align Top
  stateCopy = M.clone(state);
  M.alignItems(stateCopy, [item1.id, item2.id, item3.id], 'top');
  const tb1 = M.getBounds(stateCopy, item1.id);
  const tb2 = M.getBounds(stateCopy, item2.id);
  const tb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(tb1.y, tb2.y);
  assert.equal(tb2.y, tb3.y);

  // Align Middle
  stateCopy = M.clone(state);
  M.alignItems(stateCopy, [item1.id, item2.id, item3.id], 'middle');
  const mb1 = M.getBounds(stateCopy, item1.id);
  const mb2 = M.getBounds(stateCopy, item2.id);
  const mb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(mb1.cy, mb2.cy);
  assert.equal(mb2.cy, mb3.cy);

  // Align Bottom
  stateCopy = M.clone(state);
  M.alignItems(stateCopy, [item1.id, item2.id, item3.id], 'bottom');
  const bb1 = M.getBounds(stateCopy, item1.id);
  const bb2 = M.getBounds(stateCopy, item2.id);
  const bb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(bb1.y + bb1.h, bb2.y + bb2.h);
  assert.equal(bb2.y + bb2.h, bb3.y + bb3.h);
});

test('distributeItems distributes items evenly horizontally and vertically', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 400, 400);
  const item1 = M.addItem(state, room, 'armchair', { x: 40, y: 40 });
  const item2 = M.addItem(state, room, 'armchair', { x: 100, y: 150 });
  const item3 = M.addItem(state, room, 'armchair', { x: 240, y: 260 });

  // Distribute Horizontal
  let stateCopy = M.clone(state);
  const resH = M.distributeItems(stateCopy, [item1.id, item2.id, item3.id], 'horizontal');
  assert.equal(resH, true);
  const db1 = M.getBounds(stateCopy, item1.id);
  const db2 = M.getBounds(stateCopy, item2.id);
  const db3 = M.getBounds(stateCopy, item3.id);
  const dist12 = db2.cx - db1.cx;
  const dist23 = db3.cx - db2.cx;
  assert.ok(Math.abs(dist12 - dist23) < 0.01);

  // Distribute Vertical
  stateCopy = M.clone(state);
  const resV = M.distributeItems(stateCopy, [item1.id, item2.id, item3.id], 'vertical');
  assert.equal(resV, true);
  const vb1 = M.getBounds(stateCopy, item1.id);
  const vb2 = M.getBounds(stateCopy, item2.id);
  const vb3 = M.getBounds(stateCopy, item3.id);
  const vdist12 = vb2.cy - vb1.cy;
  const vdist23 = vb3.cy - vb2.cy;
  assert.ok(Math.abs(vdist12 - vdist23) < 0.01);
});

test('distributeItems creates equal edge-to-edge gaps for non-uniform dimensions horizontally and vertically', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 500, 500);
  // Non-uniform widths/depths: sofa (84x36), coffee_table (48x24), armchair (32x34), plant (18x18)
  const sofa = M.addItem(state, room, 'sofa', { x: 60, y: 50, rot: 0 });
  const table = M.addItem(state, room, 'coffee_table', { x: 160, y: 140, rot: 90 }); // rotated: 24x48
  const chair = M.addItem(state, room, 'armchair', { x: 230, y: 240, rot: 0 });
  const plant = M.addItem(state, room, 'plant', { x: 420, y: 400, rot: 0 });

  // Horizontal distribution (pass ids out of order to verify left-edge sorting)
  const stateH = M.clone(state);
  const initialFirstH = M.getBounds(stateH, sofa.id);
  const initialLastH = M.getBounds(stateH, plant.id);
  const resH = M.distributeItems(stateH, [chair.id, plant.id, sofa.id, table.id], 'horizontal');
  assert.equal(resH, true);

  const hbSofa = M.getBounds(stateH, sofa.id);
  const hbTable = M.getBounds(stateH, table.id);
  const hbChair = M.getBounds(stateH, chair.id);
  const hbPlant = M.getBounds(stateH, plant.id);

  // Outermost items remain fixed
  assert.equal(hbSofa.x, initialFirstH.x);
  assert.equal(hbPlant.x, initialLastH.x);

  // Adjacent edge-to-edge horizontal gaps are equal
  const hGap1 = hbTable.x - (hbSofa.x + hbSofa.w);
  const hGap2 = hbChair.x - (hbTable.x + hbTable.w);
  const hGap3 = hbPlant.x - (hbChair.x + hbChair.w);
  assert.ok(Math.abs(hGap1 - hGap2) < 1e-6);
  assert.ok(Math.abs(hGap2 - hGap3) < 1e-6);

  // Vertical distribution (pass ids out of order to verify top-edge sorting)
  const stateV = M.clone(state);
  const initialFirstV = M.getBounds(stateV, sofa.id);
  const initialLastV = M.getBounds(stateV, plant.id);
  const resV = M.distributeItems(stateV, [plant.id, table.id, sofa.id, chair.id], 'vertical');
  assert.equal(resV, true);

  const vbSofa = M.getBounds(stateV, sofa.id);
  const vbTable = M.getBounds(stateV, table.id);
  const vbChair = M.getBounds(stateV, chair.id);
  const vbPlant = M.getBounds(stateV, plant.id);

  // Outermost items remain fixed
  assert.equal(vbSofa.y, initialFirstV.y);
  assert.equal(vbPlant.y, initialLastV.y);

  // Adjacent edge-to-edge vertical gaps are equal
  const vGap1 = vbTable.y - (vbSofa.y + vbSofa.h);
  const vGap2 = vbChair.y - (vbTable.y + vbTable.h);
  const vGap3 = vbPlant.y - (vbChair.y + vbChair.h);
  assert.ok(Math.abs(vGap1 - vGap2) < 1e-6);
  assert.ok(Math.abs(vGap2 - vGap3) < 1e-6);
});

test('distributeItems handles negative gaps when items exceed outer span and rejects < 3 items', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 400, 400);
  // Three sofas (each w=84, total width=252) inside an outer span < 252
  const s1 = M.addItem(state, room, 'sofa', { x: 60, y: 60, rot: 0 }); // x=18..102
  const s2 = M.addItem(state, room, 'sofa', { x: 80, y: 60, rot: 0 }); // x=38..122
  const s3 = M.addItem(state, room, 'sofa', { x: 140, y: 60, rot: 0 }); // x=98..182 (outerSpan = 164 < 252)

  assert.equal(M.distributeItems(state, [s1.id, s2.id], 'horizontal'), false);

  const ok = M.distributeItems(state, [s1.id, s2.id, s3.id], 'horizontal');
  assert.equal(ok, true);

  const b1 = M.getBounds(state, s1.id);
  const b2 = M.getBounds(state, s2.id);
  const b3 = M.getBounds(state, s3.id);
  const gap12 = b2.x - (b1.x + b1.w);
  const gap23 = b3.x - (b2.x + b2.w);
  assert.ok(gap12 < 0);
  assert.ok(Math.abs(gap12 - gap23) < 1e-6);
});

test('distributeItems supports explicit center-to-center spacing horizontally and vertically', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 500, 500);
  const item1 = M.addItem(state, room, 'armchair', { x: 60, y: 50 });
  const item2 = M.addItem(state, room, 'armchair', { x: 180, y: 190 });
  const item3 = M.addItem(state, room, 'armchair', { x: 350, y: 380 });

  // Horizontal center-to-center at 48"
  let stateCopy = M.clone(state);
  const spacingH = M.parseDistanceInInches("4'");
  assert.equal(spacingH, 48);
  const resH = M.distributeItems(
    stateCopy,
    [item1.id, item2.id, item3.id],
    'horizontal',
    spacingH,
    'center'
  );
  assert.equal(resH, true);
  const hb1 = M.getBounds(stateCopy, item1.id);
  const hb2 = M.getBounds(stateCopy, item2.id);
  const hb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(hb1.cx, 60);
  assert.ok(Math.abs(hb2.cx - 108) < 0.01);
  assert.ok(Math.abs(hb3.cx - 156) < 0.01);

  // Vertical center-to-center at 2' 6" (30")
  stateCopy = M.clone(state);
  const spacingV = M.parseDistanceInInches('2\' 6"');
  assert.equal(spacingV, 30);
  const resV = M.distributeItems(
    stateCopy,
    [item1.id, item2.id, item3.id],
    'vertical',
    spacingV,
    'center'
  );
  assert.equal(resV, true);
  const vb1 = M.getBounds(stateCopy, item1.id);
  const vb2 = M.getBounds(stateCopy, item2.id);
  const vb3 = M.getBounds(stateCopy, item3.id);
  assert.equal(vb1.cy, 50);
  assert.ok(Math.abs(vb2.cy - 80) < 0.01);
  assert.ok(Math.abs(vb3.cy - 110) < 0.01);
});

test('distributeItems supports explicit edge-to-edge gap spacing for items with unequal dimensions', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 600, 600);
  // Unequal dimensions: sofa (84x36), wardrobe (48x24), nightstand (18x16)
  const sofa = M.addItem(state, room, 'sofa', { x: 70, y: 60, rot: 0 });
  const wardrobe = M.addItem(state, room, 'wardrobe', { x: 220, y: 200, rot: 0 });
  const nightstand = M.addItem(state, room, 'nightstand', { x: 400, y: 360, rot: 0 });

  // Horizontal edge-to-edge gap of 16"
  let stateCopy = M.clone(state);
  const gapH = M.parseDistanceInInches('16"');
  assert.equal(gapH, 16);
  const resH = M.distributeItems(
    stateCopy,
    [sofa.id, wardrobe.id, nightstand.id],
    'horizontal',
    gapH,
    'gap'
  );
  assert.equal(resH, true);
  const hb1 = M.getBounds(stateCopy, sofa.id);
  const hb2 = M.getBounds(stateCopy, wardrobe.id);
  const hb3 = M.getBounds(stateCopy, nightstand.id);
  assert.notEqual(hb1.w, hb2.w);
  assert.notEqual(hb2.w, hb3.w);
  assert.ok(Math.abs(hb2.x - (hb1.x + hb1.w) - 16) < 0.01);
  assert.ok(Math.abs(hb3.x - (hb2.x + hb2.w) - 16) < 0.01);

  // Vertical edge-to-edge gap of 16 1/2" (fractional inches)
  stateCopy = M.clone(state);
  const gapV = M.parseDistanceInInches('16 1/2"');
  assert.equal(gapV, 16.5);
  const resV = M.distributeItems(
    stateCopy,
    [sofa.id, wardrobe.id, nightstand.id],
    'vertical',
    gapV,
    'gap'
  );
  assert.equal(resV, true);
  const vb1 = M.getBounds(stateCopy, sofa.id);
  const vb2 = M.getBounds(stateCopy, wardrobe.id);
  const vb3 = M.getBounds(stateCopy, nightstand.id);
  assert.notEqual(vb1.h, vb2.h);
  assert.notEqual(vb2.h, vb3.h);
  assert.ok(Math.abs(vb2.y - (vb1.y + vb1.h) - 16.5) < 0.01);
  assert.ok(Math.abs(vb3.y - (vb2.y + vb2.h) - 16.5) < 0.01);
});

test('distributeItems falls back to auto-span when spacing is null, non-numeric, zero, or negative', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 400, 400);
  const item1 = M.addItem(state, room, 'armchair', { x: 40, y: 40 });
  const item2 = M.addItem(state, room, 'armchair', { x: 90, y: 110 });
  const item3 = M.addItem(state, room, 'armchair', { x: 240, y: 260 });

  for (const invalidInput of [
    null,
    undefined,
    '',
    'abc',
    0,
    -24,
    M.parseDistanceInInches('abc'),
    M.parseDistanceInInches('-16"'),
    M.parseDistanceInInches("-2'"),
  ]) {
    const stateCopy = M.clone(state);
    const res = M.distributeItems(
      stateCopy,
      [item1.id, item2.id, item3.id],
      'horizontal',
      invalidInput,
      'gap'
    );
    assert.equal(res, true);
    const b1 = M.getBounds(stateCopy, item1.id);
    const b2 = M.getBounds(stateCopy, item2.id);
    const b3 = M.getBounds(stateCopy, item3.id);
    // Auto-span keeps endpoints fixed at 40 and 240 and places middle item at 140
    assert.equal(b1.cx, 40);
    assert.ok(Math.abs(b2.cx - 140) < 0.01);
    assert.equal(b3.cx, 240);
  }
});

test('removeSet deletes multiple selected items atomically', () => {
  const state = M.newState();
  const room = M.createRoom(state, 'living', 0, 0, 200, 200);
  const item1 = M.addItem(state, room, 'armchair', { x: 50, y: 50 });
  const item2 = M.addItem(state, room, 'armchair', { x: 100, y: 50 });

  assert.equal(room.items.length, 2);
  const removed = M.removeSet(state, [item1.id, item2.id]);
  assert.equal(removed, true);
  assert.equal(room.items.length, 0);
});
