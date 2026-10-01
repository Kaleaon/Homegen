import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import * as c from '../js/codes.js';
import { ROOM_KITS, FURNITURE_KITS } from '../js/catalog.js';

const rules = (s) => c.evaluate(s).violations.map((v) => v.rule);

function house() {
  let s = m.newState();
  // Kits sit edge to edge so doors/windows resolve against real neighbours.
  const layout = [['kit_living', 0, 0], ['kit_hall', 192, 0], ['kit_bedroom', 240, 0], ['kit_bath', 240, 144], ['kit_kitchen', 0, 168]];
  for (const [k, x, y] of layout) {
    const r = c.commit(s, (n) => m.placeRoomKit(n, k, x, y));
    assert.ok(r.ok, `${k}: ${r.reasons?.map((v) => v.msg)}`);
    s = r.state;
  }
  return s;
}

test('every room kit placed alone is accepted and ends with no room-level errors', () => {
  for (const kit of ROOM_KITS) {
    const r = c.commit(m.newState(), (n) => m.placeRoomKit(n, kit.id, 0, 0));
    assert.ok(r.ok, `${kit.id}: ${r.reasons?.map((v) => v.msg)}`);
    const roomLevel = r.report.violations.filter((v) => v.roomId && v.severity === 'error');
    // a lone room cannot be reachable from an exit unless auto-comply added one, and it must have.
    assert.deepEqual(roomLevel.map((v) => `${v.rule}`), [], kit.id);
  }
});

test('a furnished multi-room house reaches zero errors automatically', () => {
  const rep = c.evaluate(house());
  assert.equal(rep.errors, 0, rep.violations.map((v) => v.msg).join('\n'));
  assert.ok(rep.compliant);
});

test('undersized habitable room is rejected', () => {
  const r = c.commit(m.newState(), (n) => m.createRoom(n, 'bedroom', 0, 0, 90, 96));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((v) => v.rule === 'min-area'));
});

test('overlapping rooms are rejected', () => {
  const s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_bedroom', 0, 0)).state;
  const r = c.commit(s, (n) => m.placeRoomKit(n, 'kit_office', 60, 60));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((v) => v.rule === 'overlap'));
});

test('furniture overlap and door swing blocking are rejected', () => {
  const s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_bedroom', 0, 0)).state;
  const room = s.rooms[0];
  const bed = room.items.find((i) => i.type === 'bed_queen');
  const r = c.commit(s, (n) => m.addItem(n, n.rooms[0], 'bed_queen', { x: bed.x + 10, y: bed.y, rot: 0 }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((v) => v.rule === 'item-overlap'));
  const door = room.openings.find((o) => o.kind === 'door');
  const r2 = c.commit(s, (n) => { const rr = n.rooms[0]; const info = c.openingInfo(n, rr, rr.openings.find((o) => o.id === door.id)); const p = m.wallPoint(rr, door.wall, door.offset + 16, 14); m.addItem(n, rr, 'armchair', { x: p.x, y: p.y, rot: 0 }); });
  assert.equal(r2.ok, false);
  assert.ok(r2.reasons.some((v) => v.rule === 'door-swing' || v.rule === 'item-overlap'));
});

test('toilet clearance (R307.1) is enforced', () => {
  const s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_bath', 0, 0)).state;
  const toilet = s.rooms[0].items.find((i) => i.type === 'toilet');
  const r = c.commit(s, (n) => { const t = n.rooms[0].items.find((i) => i.id === toilet.id); t.x = 14; }); // 14" from the west wall face -> <15" to centerline? vanity-free side but wall too close
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((v) => v.rule === 'fixture-clearance'));
});

test('bedroom without a window of egress size gets an egress window', () => {
  let s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_hall', 192, 0)).state;
  const r = c.commit(s, (n) => {
    const room = m.createRoom(n, 'bedroom', 48, 0, 144, 144); // west of hall? hall is at x=192: touches east side
    m.addOpening(n, room, 'win_picture_48x48', 'N', 48); // fixed pane: not an egress window
  });
  assert.ok(r.ok, r.reasons?.map((v) => v.msg));
  assert.ok(!rules(r.state).includes('egress'));
  assert.ok(r.changes.some((x) => /egress/.test(x)), r.changes.join('; '));
});

test('moisture-resistant finishes and GFCI are enforced in bathrooms', () => {
  const r = c.commit(m.newState(), (n) => { const room = m.createRoom(n, 'bathroom', 0, 0, 66, 120, { floor: 'floor_carpet_gray', wallFinish: 'wp_floral' }); m.addItem(n, room, 'outlet', { wall: 'N', offset: 30 }); });
  assert.ok(r.ok);
  const room = r.state.rooms[0];
  assert.equal(room.floor, 'floor_tile_gray');
  assert.ok(Object.values(room.walls).every((w) => w === 'wall_tile_white'));
  assert.ok(room.items.filter((i) => /outlet/.test(i.type)).every((i) => i.type === 'outlet_gfci'));
});

test('fuel appliance triggers CO alarms; ceiling below minimum is raised', () => {
  let s = house();
  const r = c.commit(s, (n) => { const k = n.rooms.find((x) => x.type === 'kitchen'); k.ceiling = 70; const range = k.items.find((i) => i.type === 'range_electric'); range.type = 'range_gas'; });
  assert.ok(r.ok);
  assert.ok(r.state.rooms.find((x) => x.type === 'kitchen').ceiling >= 84);
  assert.equal(c.evaluate(r.state).errors, 0);
  assert.ok(r.state.rooms.some((x) => x.items.some((i) => (i.type === 'smoke_co_alarm' || i.type === 'co_alarm'))));
});

test('stairs need enough run for 7.75" max riser / 10" tread', () => {
  const bad = c.commit(m.newState(), (n) => m.createRoom(n, 'stairs', 0, 0, 42, 96));
  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.some((v) => v.rule === 'stair-run'));
  const good = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_stairs', 0, 0));
  assert.ok(good.ok);
});

test('furniture kits place what fits and never produce a blocking violation', () => {
  for (const kit of FURNITURE_KITS) {
    const type = kit.id === 'fk_bedroom' ? 'bedroom' : kit.id === 'fk_living' ? 'living' : 'dining';
    const s = c.commit(m.newState(), (n) => { m.createRoom(n, type, 0, 0, 180, 180); }).state;
    const res = c.commitSequence(s, kit.items.map((spec) => (n) => {
      const room = n.rooms[0];
      const resolve = { longest: 'N', 'opposite-longest': 'S' };
      m.placeFromSpec(n, room, { ...spec, wall: resolve[spec.wall] || spec.wall });
    }));
    assert.ok(res.placed >= Math.ceil(kit.items.length / 2), `${kit.id}: placed ${res.placed}/${kit.items.length}; ${res.skipped}`);
    assert.equal(c.evaluate(res.state).violations.filter((v) => v.blocking).length, 0);
  }
});

test('serialization round-trips and history undoes', () => {
  const s = house();
  assert.deepEqual(m.deserialize(m.serialize(s)), s);
  const h = new m.History(m.newState());
  h.push(s);
  assert.equal(h.undo().rooms.length, 0);
  assert.equal(h.redo().rooms.length, s.rooms.length);
});
