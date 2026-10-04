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
