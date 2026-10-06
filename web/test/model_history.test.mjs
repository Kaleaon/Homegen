import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';

test('cloneWithSharing creates standalone snapshot when prevState is omitted', () => {
  const state = M.newState();
  const r1 = M.createRoom(state, 'living', 0, 0, 120, 120);
  const r2 = M.createRoom(state, 'bedroom', 140, 0, 120, 120);

  const snapshot = M.cloneWithSharing(state);
  assert.notEqual(snapshot, state);
  assert.equal(snapshot.rooms.length, 2);
  assert.notEqual(snapshot.rooms[0], r1);
  assert.notEqual(snapshot.rooms[1], r2);
  assert.deepEqual(snapshot.rooms[0], M.clone(r1));
  assert.deepEqual(snapshot.rooms[1], M.clone(r2));
});

test('cloneWithSharing reuses room references for unmodified rooms across states', () => {
  const state1 = M.newState();
  M.createRoom(state1, 'living', 0, 0, 120, 120);
  M.createRoom(state1, 'bedroom', 140, 0, 120, 120);

  const snap1 = M.cloneWithSharing(state1);

  // Create state2 where only r1 is modified
  const state2 = M.clone(snap1);
  state2.rooms[0].name = 'Renovated Living Room';

  const snap2 = M.cloneWithSharing(state2, snap1);

  // r1 changed -> new reference
  assert.notEqual(snap2.rooms[0], snap1.rooms[0]);
  assert.equal(snap2.rooms[0].name, 'Renovated Living Room');

  // r2 unchanged -> shared reference
  assert.equal(snap2.rooms[1], snap1.rooms[1]);
});

test('History.push preserves reference equality for unchanged rooms', () => {
  const state = M.newState();
  M.createRoom(state, 'living', 0, 0, 120, 120);
  M.createRoom(state, 'bedroom', 140, 0, 120, 120);
  M.createRoom(state, 'kitchen', 0, 140, 120, 120);

  const hist = new M.History(state);
  assert.equal(hist.stack.length, 1);

  // First edit: modify room 1 (living)
  const state2 = M.clone(hist.stack[0].state);
  state2.rooms[0].x = 10;
  hist.push(state2, 'Move Room');

  assert.equal(hist.stack.length, 2);

  // Room 0 was changed
  assert.notEqual(hist.stack[1].state.rooms[0], hist.stack[0].state.rooms[0]);

  // Rooms 1 and 2 were unchanged and share references
  assert.equal(hist.stack[1].state.rooms[1], hist.stack[0].state.rooms[1]);
  assert.equal(hist.stack[1].state.rooms[2], hist.stack[0].state.rooms[2]);
});

test('History reference isolation: mutating active state does not alter historical stack entries', () => {
  const state = M.newState();
  const r1 = M.createRoom(state, 'living', 0, 0, 120, 120);
  M.createRoom(state, 'bedroom', 140, 0, 120, 120);

  const hist = new M.History(state);

  // Active state edit
  r1.x = 240;
  hist.push(state, 'Move Wall');

  // Historical snapshot 0 should retain initial x = 0
  assert.equal(hist.stack[0].state.rooms[0].x, 0);
  // Snapshot 1 has x = 240
  assert.equal(hist.stack[1].state.rooms[0].x, 240);

  // Unchanged room 2 shares reference
  assert.equal(hist.stack[0].state.rooms[1], hist.stack[1].state.rooms[1]);
});

test('History handles room addition cleanly while sharing existing room references', () => {
  const state1 = M.newState();
  M.createRoom(state1, 'living', 0, 0, 120, 120);

  const hist = new M.History(state1);

  const state2 = M.clone(hist.stack[0].state);
  M.createRoom(state2, 'bedroom', 140, 0, 120, 120);
  hist.push(state2, 'Add Room');

  assert.equal(hist.stack.length, 2);
  assert.equal(hist.stack[1].state.rooms.length, 2);

  // Room 0 (living) shares reference
  assert.equal(hist.stack[1].state.rooms[0], hist.stack[0].state.rooms[0]);
  // Room 1 (bedroom) is new
  assert.equal(hist.stack[1].state.rooms[1].type, 'bedroom');
});

test('History handles room deletion cleanly without stale references', () => {
  const state1 = M.newState();
  M.createRoom(state1, 'living', 0, 0, 120, 120);
  M.createRoom(state1, 'bedroom', 140, 0, 120, 120);

  const hist = new M.History(state1);

  const state2 = M.clone(hist.stack[0].state);
  state2.rooms = [state2.rooms[1]]; // Delete room 0 (living)
  hist.push(state2, 'Delete Room');

  assert.equal(hist.stack[1].state.rooms.length, 1);
  assert.equal(hist.stack[1].state.rooms[0].type, 'bedroom');

  // Remaining room (bedroom) shares reference
  assert.equal(hist.stack[1].state.rooms[0], hist.stack[0].state.rooms[1]);
});

test('History handles room reordering while preserving structural sharing by room ID', () => {
  const state1 = M.newState();
  const r1 = M.createRoom(state1, 'living', 0, 0, 120, 120);
  const r2 = M.createRoom(state1, 'bedroom', 140, 0, 120, 120);

  const hist = new M.History(state1);

  const state2 = M.clone(hist.stack[0].state);
  state2.rooms = [state2.rooms[1], state2.rooms[0]]; // Reorder [r2, r1]
  hist.push(state2, 'Reorder Rooms');

  assert.equal(hist.stack[1].state.rooms[0].id, r2.id);
  assert.equal(hist.stack[1].state.rooms[1].id, r1.id);

  // Shared references match by ID
  assert.equal(hist.stack[1].state.rooms[0], hist.stack[0].state.rooms[1]);
  assert.equal(hist.stack[1].state.rooms[1], hist.stack[0].state.rooms[0]);
});

test('History undo and redo navigate stack correctly', () => {
  const state = M.newState();
  M.createRoom(state, 'living', 0, 0, 120, 120);
  const hist = new M.History(state);

  const s1 = M.clone(hist.stack[0].state);
  s1.name = 'Edited Home';
  hist.push(s1, 'Change Name');

  assert.equal(hist.canUndo(), true);
  assert.equal(hist.canRedo(), false);

  const undone = hist.undo();
  assert.equal(undone.name, 'My home');
  assert.equal(hist.canUndo(), false);
  assert.equal(hist.canRedo(), true);

  const redone = hist.redo();
  assert.equal(redone.name, 'Edited Home');
  assert.equal(hist.canUndo(), true);
  assert.equal(hist.canRedo(), false);
});

test('History action labels and timestamps are recorded and peeked correctly', () => {
  const state = M.newState();
  const t0 = Date.now();
  const hist = new M.History(state, 'Initial Plan');

  assert.equal(hist.stack[0].label, 'Initial Plan');
  assert.ok(hist.stack[0].timestamp >= t0);
  assert.equal(hist.peekUndoLabel(), null);
  assert.equal(hist.peekRedoLabel(), null);

  const s1 = M.clone(state);
  s1.name = 'Plan Step 1';
  hist.push(s1, 'Add Room');

  assert.equal(hist.peekUndoLabel(), 'Add Room');
  assert.equal(hist.peekRedoLabel(), null);

  const s2 = M.clone(s1);
  s2.name = 'Plan Step 2';
  hist.push(s2, 'Move Wall');

  assert.equal(hist.peekUndoLabel(), 'Move Wall');

  hist.undo();
  assert.equal(hist.peekUndoLabel(), 'Add Room');
  assert.equal(hist.peekRedoLabel(), 'Move Wall');

  hist.undo();
  assert.equal(hist.peekUndoLabel(), null);
  assert.equal(hist.peekRedoLabel(), 'Add Room');
});

test('History.jumpTo allows jumping directly to any timeline checkpoint', () => {
  const state = M.newState();
  const hist = new M.History(state, 'Step 0');

  const s1 = M.clone(state); s1.name = 'S1'; hist.push(s1, 'Step 1');
  const s2 = M.clone(state); s2.name = 'S2'; hist.push(s2, 'Step 2');
  const s3 = M.clone(state); s3.name = 'S3'; hist.push(s3, 'Step 3');

  assert.equal(hist.stack.length, 4);

  // Jump to Step 1 (index 1)
  const jumped = hist.jumpTo(1);
  assert.equal(jumped.name, 'S1');
  assert.equal(hist.i, 1);
  assert.equal(hist.peekUndoLabel(), 'Step 1');
  assert.equal(hist.peekRedoLabel(), 'Step 2');

  // Out of bounds jump returns null and leaves index unchanged
  assert.equal(hist.jumpTo(-1), null);
  assert.equal(hist.jumpTo(10), null);
  assert.equal(hist.i, 1);
});

test('History.getTimeline returns accurate timeline array with active indicator', () => {
  const state = M.newState();
  const hist = new M.History(state, 'Initial State');

  const s1 = M.clone(state); hist.push(s1, 'Add Room');

  let timeline = hist.getTimeline();
  assert.equal(timeline.length, 2);
  assert.deepEqual(timeline[0], {
    index: 0,
    label: 'Initial State',
    timestamp: hist.stack[0].timestamp,
    active: false,
  });
  assert.deepEqual(timeline[1], {
    index: 1,
    label: 'Add Room',
    timestamp: hist.stack[1].timestamp,
    active: true,
  });

  hist.undo();
  timeline = hist.getTimeline();
  assert.equal(timeline[0].active, true);
  assert.equal(timeline[1].active, false);
});

test('History truncates redone entries when push occurs after undoing', () => {
  const state = M.newState();
  const hist = new M.History(state, 'Initial');

  hist.push(M.clone(state), 'Action 1');
  hist.push(M.clone(state), 'Action 2');
  assert.equal(hist.stack.length, 3);

  hist.undo(); // back to index 1 ("Action 1")
  hist.push(M.clone(state), 'Action 2-B');

  assert.equal(hist.stack.length, 3);
  assert.equal(hist.stack[2].label, 'Action 2-B');
});

test('History limits stack size to 100 entries', () => {
  const state = M.newState();
  const hist = new M.History(state, 'Entry 0');

  for (let i = 1; i <= 105; i++) {
    hist.push(M.clone(state), `Entry ${i}`);
  }

  assert.equal(hist.stack.length, 100);
  assert.equal(hist.stack[0].label, 'Entry 6');
  assert.equal(hist.stack[99].label, 'Entry 105');
  assert.equal(hist.i, 99);
});

test('ModelHistory is exported as an alias for History', () => {
  assert.equal(M.ModelHistory, M.History);
});
