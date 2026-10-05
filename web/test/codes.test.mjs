import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import * as c from '../js/codes.js';
import { ROOM_KITS, FURNITURE_KITS } from '../js/catalog.js';

const rules = (s) => c.evaluate(s).violations.map((v) => v.rule);

function house() {
  let s = m.newState();
  // Kits sit edge to edge so doors/windows resolve against real neighbours.
  const layout = [
    ['kit_living', 0, 0],
    ['kit_hall', 192, 0],
    ['kit_bedroom', 240, 0],
    ['kit_bath', 240, 144],
    ['kit_kitchen', 0, 168],
  ];
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
    const roomLevel = r.report.violations.filter(
      (v) => v.roomId && v.severity === 'error' && v.rule !== 'stairs-link'
    );
    // a lone room cannot be reachable from an exit unless auto-comply added one, and it must have.
    assert.deepEqual(
      roomLevel.map((v) => `${v.rule}`),
      [],
      kit.id
    );
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
  const r = c.commit(s, (n) =>
    m.addItem(n, n.rooms[0], 'bed_queen', { x: bed.x + 10, y: bed.y, rot: 0 })
  );
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((v) => v.rule === 'item-overlap'));
  const door = room.openings.find((o) => o.kind === 'door');
  const r2 = c.commit(s, (n) => {
    const rr = n.rooms[0];
    const info = c.openingInfo(
      n,
      rr,
      rr.openings.find((o) => o.id === door.id)
    );
    const p = m.wallPoint(rr, door.wall, door.offset + 16, 14);
    m.addItem(n, rr, 'armchair', { x: p.x, y: p.y, rot: 0 });
  });
  assert.equal(r2.ok, false);
  assert.ok(r2.reasons.some((v) => v.rule === 'door-swing' || v.rule === 'item-overlap'));
});

test('toilet clearance (R307.1) is enforced', () => {
  const s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_bath', 0, 0)).state;
  const toilet = s.rooms[0].items.find((i) => i.type === 'toilet');
  const r = c.commit(s, (n) => {
    const t = n.rooms[0].items.find((i) => i.id === toilet.id);
    t.x = 14;
  }); // 14" from the west wall face -> <15" to centerline? vanity-free side but wall too close
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((v) => v.rule === 'fixture-clearance'));
});

test('bedroom without a window of egress size gets an egress window', () => {
  let s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_hall', 192, 0)).state;
  const r = c.commit(s, (n) => {
    const room = m.createRoom(n, 'bedroom', 48, 0, 144, 144); // west of hall? hall is at x=192: touches east side
    m.addOpening(n, room, 'win_picture_48x48', 'N', 48); // fixed pane: not an egress window
  });
  assert.ok(
    r.ok,
    r.reasons?.map((v) => v.msg)
  );
  assert.ok(!rules(r.state).includes('egress'));
  assert.ok(
    r.changes.some((x) => /egress/.test(x)),
    r.changes.join('; ')
  );
});

test('moisture-resistant finishes and GFCI are enforced in bathrooms', () => {
  const r = c.commit(m.newState(), (n) => {
    const room = m.createRoom(n, 'bathroom', 0, 0, 66, 120, {
      floor: 'floor_carpet_gray',
      wallFinish: 'wp_floral',
    });
    m.addItem(n, room, 'outlet', { wall: 'N', offset: 30 });
  });
  assert.ok(r.ok);
  const room = r.state.rooms[0];
  assert.equal(room.floor, 'floor_tile_gray');
  assert.ok(Object.values(room.walls).every((w) => w === 'wall_tile_white'));
  assert.ok(room.items.filter((i) => /outlet/.test(i.type)).every((i) => i.type === 'outlet_gfci'));
});

test('fuel appliance triggers CO alarms; ceiling below minimum is raised', () => {
  let s = house();
  const r = c.commit(s, (n) => {
    const k = n.rooms.find((x) => x.type === 'kitchen');
    k.ceiling = 70;
    const range = k.items.find((i) => i.type === 'range_electric');
    range.type = 'range_gas';
  });
  assert.ok(r.ok);
  assert.ok(r.state.rooms.find((x) => x.type === 'kitchen').ceiling >= 84);
  assert.equal(c.evaluate(r.state).errors, 0);
  assert.ok(
    r.state.rooms.some((x) =>
      x.items.some((i) => i.type === 'smoke_co_alarm' || i.type === 'co_alarm')
    )
  );
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
    const s = c.commit(m.newState(), (n) => {
      m.createRoom(n, type, 0, 0, 180, 180);
    }).state;
    const res = c.commitSequence(
      s,
      kit.items.map((spec) => (n) => {
        const room = n.rooms[0];
        const resolve = { longest: 'N', 'opposite-longest': 'S' };
        m.placeFromSpec(n, room, { ...spec, wall: resolve[spec.wall] || spec.wall });
      })
    );
    assert.ok(
      res.placed >= Math.ceil(kit.items.length / 2),
      `${kit.id}: placed ${res.placed}/${kit.items.length}; ${res.skipped}`
    );
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

function twoStorey() {
  let s = house();
  s = c.commit(s, (n) => {
    m.placeRoomKit(n, 'kit_stairs', 192, 120);
    n.levels = 2;
  }).state;
  for (const [k, x, y] of [
    ['kit_hall', 192, 0],
    ['kit_bedroom', 240, 0],
    ['kit_bedroom', 48, 0],
    ['kit_bath', 234, 144],
  ]) {
    const r = c.commit(s, (n) => m.placeRoomKit(n, k, x, y, 1));
    assert.ok(r.ok, `${k}: ${r.reasons?.map((v) => v.msg)}`);
    s = r.state;
  }
  return s;
}

test('multi-floor: stairs get a partner, upper rooms are reachable, plan reaches zero errors', () => {
  const s = twoStorey();
  assert.equal(s.rooms.filter((r) => r.type === 'stairs').length, 2);
  const rep = c.evaluate(s);
  assert.equal(rep.errors, 0, rep.violations.map((v) => v.msg).join('\n'));
});

test('multi-floor: rooms on different levels may overlap in plan, same level may not', () => {
  const s = c.commit(m.newState(), (n) => {
    n.levels = 2;
    m.placeRoomKit(n, 'kit_bedroom', 0, 0, 0);
  }).state;
  assert.ok(c.commit(s, (n) => m.placeRoomKit(n, 'kit_office', 0, 0, 1)).ok);
  assert.equal(c.commit(s, (n) => m.placeRoomKit(n, 'kit_office', 0, 0, 0)).ok, false);
});

test('multi-floor: upper room without a stair path is unreachable and flagged', () => {
  const s = c.commit(
    house(),
    (n) => {
      n.levels = 2;
      m.placeRoomKit(n, 'kit_bedroom', 0, 0, 1);
    },
    { autoFix: true }
  ).state;
  assert.ok(c.evaluate(s).violations.some((v) => v.rule === 'unreachable'));
});

test('spatial bounding produces identical compliance violation reports as full-scene scans', () => {
  const s = house();
  const baseRep = c.evaluate(s);

  // Trial mutation 1: Add item in bath
  const trial1 = m.clone(s);
  const bath = trial1.rooms.find((r) => r.type === 'bathroom');
  m.addItem(trial1, bath, 'plant', { x: bath.x + 20, y: bath.y + 20 });
  const box1 = c.computeAffectedBoundingBox(s, trial1);
  assert.ok(box1, 'affected bounding box computed for item mutation');
  const inc1 = c.evaluate(trial1, { affectedBox: box1, baseReport: baseRep });
  const full1 = c.evaluate(trial1);
  assert.deepEqual(
    inc1.violations.map((v) => v.id).sort(),
    full1.violations.map((v) => v.id).sort()
  );

  // Trial mutation 2: Add opening in bedroom
  const trial2 = m.clone(s);
  const bed = trial2.rooms.find((r) => r.type === 'bedroom');
  m.addOpening(trial2, bed, 'win_hung_30x48', 'E', 40);
  const box2 = c.computeAffectedBoundingBox(s, trial2);
  assert.ok(box2, 'affected bounding box computed for opening mutation');
  const inc2 = c.evaluate(trial2, { affectedBox: box2, baseReport: baseRep });
  const full2 = c.evaluate(trial2);
  assert.deepEqual(
    inc2.violations.map((v) => v.id).sort(),
    full2.violations.map((v) => v.id).sort()
  );
});

test('room overlap and item clearance checks evaluate only entities touching affected bounding box during trial attempts', () => {
  let s = m.newState();
  // Room A at 0, Room B at 200, Room C at 500
  s = c.commit(s, (n) => m.createRoom(n, 'bedroom', 0, 0, 120, 120)).state;
  s = c.commit(s, (n) => m.createRoom(n, 'living', 200, 0, 120, 120)).state;
  s = c.commit(s, (n) => m.createRoom(n, 'office', 500, 0, 120, 120)).state;

  const trial = m.clone(s);
  const bed = trial.rooms.find((r) => r.type === 'bedroom');
  m.addItem(trial, bed, 'armchair', { x: 30, y: 30, rot: 0 });

  const box = c.computeAffectedBoundingBox(s, trial);
  assert.ok(box, 'bounding box computed');
  // Box touches Room A (0,0 to 120,120) but not Room C at x=500
  assert.ok(box.x < 120 && box.x + box.w > 0);
  assert.ok(box.x + box.w < 500);

  const baseRep = c.evaluate(s);
  const rep = c.evaluate(trial, { affectedBox: box, baseReport: baseRep });
  assert.equal(rep.errors, c.evaluate(trial).errors);
});

test('auto-comply trial loops execute within 16ms for typical multi-room edits', () => {
  const s = house();
  // Move furniture in living room on a multi-room floor plan
  const trial = m.clone(s);
  const living = trial.rooms.find((r) => r.type === 'living');
  m.addItem(trial, living, 'coffee_table', { x: living.x + 40, y: living.y + 40 });

  const start = performance.now();
  c.autoComply(trial);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 16, `auto-comply trial loop took ${elapsed.toFixed(2)}ms (expected < 16ms)`);
});

test('fallback to full state evaluation when global plan structural changes occur', () => {
  let s = m.newState();
  s = c.commit(s, (n) => m.createRoom(n, 'bedroom', 0, 0, 120, 120)).state;
  const trial = m.clone(s);
  // Mass structural change: multiple rooms added at once
  m.createRoom(trial, 'living', 200, 0, 120, 120);
  m.createRoom(trial, 'kitchen', 400, 0, 120, 120);
  m.createRoom(trial, 'bathroom', 600, 0, 120, 120);

  const box = c.computeAffectedBoundingBox(s, trial);
  assert.equal(box, null, 'falls back to null affectedBox on mass structural changes');

  const rep = c.evaluate(trial, { affectedBox: box });
  assert.equal(rep.violations.length, c.evaluate(trial).violations.length);
});

import { buildPrompt, hordeRender, rawBase64 } from '../js/photoreal.js';
import {
  HD_MATERIALS,
  HDRI_ENVS,
  polyHavenTextureUrls,
  polyHavenHdriUrl,
} from '../js/resources.js';
import { FLOOR_BY_ID, WALL_BY_ID, WINDOW_FRAME_BY_ID } from '../js/catalog.js';

test('photoreal prompt describes the room as built', () => {
  const s = c.commit(m.newState(), (n) => m.placeRoomKit(n, 'kit_bedroom', 0, 0)).state;
  const p = buildPrompt(s.rooms[0], 'scandi');
  assert.match(p, /Scandinavian minimalist bedroom/);
  assert.match(p, /queen bed/);
  assert.match(p, /gray carpet/);
  assert.match(p, /blue stripes/);
  assert.match(p, /window/);
});

test('HD material map only references real finishes and well-formed texture urls', () => {
  for (const [id, hd] of Object.entries(HD_MATERIALS)) {
    assert.ok(FLOOR_BY_ID[id] || WALL_BY_ID[id] || WINDOW_FRAME_BY_ID[id], id);
    assert.match(
      polyHavenTextureUrls(hd.id).diff,
      /^https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Textures\/jpg\/1k\/.+_diff_1k\.jpg$/
    );
  }
});

test('HDRI environment list references well-formed Poly Haven HDRI urls', () => {
  for (const env of HDRI_ENVS) {
    if (env.id === 'studio') continue;
    assert.match(
      polyHavenHdriUrl(env.id),
      /^https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/HDRIs\/hdr\/1k\/.+_1k\.hdr$/
    );
  }
});

test('AI Horde client sends a depth-ControlNet img2img request and polls to completion', async () => {
  const calls = [];
  const fake = async (url, opts = {}) => {
    calls.push([url, opts.method || 'GET', opts.body && JSON.parse(opts.body)]);
    const ok = (o) => ({ ok: true, json: async () => o });
    if (url.endsWith('/generate/async')) return ok({ id: 'job12345' });
    if (url.includes('/generate/check/'))
      return ok({ done: true, queue_position: 0, wait_time: 0 });
    return ok({ generations: [{ img: 'https://example.test/out.webp', censored: false }] });
  };
  const out = await hordeRender({
    prompt: 'a room',
    depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
    fetchImpl: fake,
  });
  assert.equal(out.url, 'https://example.test/out.webp');
  const body = calls[0][2];
  assert.equal(body.params.control_type, 'depth');
  assert.equal(body.params.image_is_control, true);
  assert.equal(body.source_processing, 'img2img');
  assert.equal(body.source_image, 'QUJD');
  assert.ok(body.params.width * body.params.height <= 576 * 576, 'anonymous work budget');
  assert.equal(rawBase64('data:x/y;base64,ZZ'), 'ZZ');
});

test('autoComply returns structured change metadata with correct entity IDs and actions', () => {
  const r = c.commit(m.newState(), (n) => {
    const room = m.createRoom(n, 'bathroom', 0, 0, 72, 120, {
      floor: 'floor_carpet_gray',
      ceiling: 72,
    });
    m.addItem(n, room, 'outlet', { wall: 'N', offset: 30 });
  });
  assert.ok(r.ok);
  assert.ok(r.changes.length > 0);
  for (const change of r.changes) {
    assert.equal(typeof change, 'object');
    assert.ok(change.id, 'change must have an id');
    assert.ok(
      ['add', 'modify', 'upgrade', 'remove'].includes(change.action),
      `valid action: ${change.action}`
    );
    assert.ok(
      ['room', 'item', 'opening', 'wall', 'ceiling', 'floor'].includes(change.type),
      `valid type: ${change.type}`
    );
    assert.equal(typeof change.msg, 'string');
    assert.equal(String(change), change.msg);
  }

  // Verify specific changes
  const ceilingChange = r.changes.find((c) => c.type === 'ceiling');
  assert.ok(ceilingChange);
  assert.equal(ceilingChange.action, 'modify');

  const gfciChange = r.changes.find((c) => c.action === 'upgrade' && c.type === 'item');
  assert.ok(gfciChange);
  assert.match(gfciChange.msg, /GFCI/);
});

test('spatial material sampling accurately identifies wall and floor finishes', () => {
  const s = twoStorey();
  const room = s.rooms.find((r) => r.level === 0);
  room.walls.N = 'paint_navy';
  room.floor = 'floor_walnut';

  // Sample North wall point
  const wallHit = m.sampleFinishAt(s, { x: room.x + room.w / 2, y: room.y }, 0);
  assert.ok(wallHit);
  assert.equal(wallHit.kind, 'wall');
  assert.equal(wallHit.finishId, 'paint_navy');

  // Sample interior floor point
  const floorHit = m.sampleFinishAt(s, { x: room.x + room.w / 2, y: room.y + room.h / 2 }, 0);
  assert.ok(floorHit);
  assert.equal(floorHit.kind, 'floor');
  assert.equal(floorHit.finishId, 'floor_walnut');

  // Sample empty canvas point
  const emptyHit = m.sampleFinishAt(s, { x: -1000, y: -1000 }, 0);
  assert.equal(emptyHit, null);
});

test('bulk painting updates finishes across single, room, level, and plan scopes', () => {
  const s = twoStorey();
  const lvl0Rooms = s.rooms.filter((r) => (r.level || 0) === 0);
  const lvl1Rooms = s.rooms.filter((r) => (r.level || 0) === 1);
  const targetRoom = lvl0Rooms[0];

  // 1. Scope: single wall
  m.applyWallFinish(s, 'paint_sage', { scope: 'single', room: targetRoom, wall: 'N', level: 0 });
  assert.equal(targetRoom.walls.N, 'paint_sage');
  assert.notEqual(targetRoom.walls.S, 'paint_sage');

  // 2. Scope: room (all walls)
  m.applyWallFinish(s, 'paint_beige', { scope: 'room', room: targetRoom, level: 0 });
  assert.ok(Object.values(targetRoom.walls).every((w) => w === 'paint_beige'));
  assert.ok(
    !lvl0Rooms.slice(1).every((r) => Object.values(r.walls).every((w) => w === 'paint_beige'))
  );

  // 3. Scope: level (all walls on level 0)
  m.applyWallFinish(s, 'paint_navy', { scope: 'level', level: 0 });
  for (const r of lvl0Rooms) assert.ok(Object.values(r.walls).every((w) => w === 'paint_navy'));
  for (const r of lvl1Rooms) assert.ok(!Object.values(r.walls).every((w) => w === 'paint_navy'));

  // 4. Scope: plan (all walls across all levels)
  m.applyWallFinish(s, 'paint_charcoal', { scope: 'plan' });
  for (const r of s.rooms) assert.ok(Object.values(r.walls).every((w) => w === 'paint_charcoal'));

  // 5. Scope: level floor
  m.applyFloorFinish(s, 'floor_herringbone', { scope: 'level', level: 0 });
  for (const r of lvl0Rooms) assert.equal(r.floor, 'floor_herringbone');
  for (const r of lvl1Rooms) assert.notEqual(r.floor, 'floor_herringbone');

  // 6. Scope: plan floor
  m.applyFloorFinish(s, 'floor_marble', { scope: 'plan' });
  for (const r of s.rooms) assert.equal(r.floor, 'floor_marble');
});

test('bulk applying dry finishes triggers code compliance auto-fixes when auto-comply is active', () => {
  const s = twoStorey();
  const bath = s.rooms.find((r) => r.type === 'bathroom');
  assert.ok(bath);

  const res = c.commit(
    s,
    (n) => {
      const r = n.rooms.find((x) => x.id === bath.id);
      m.applyWallFinish(n, 'wp_floral', { scope: 'plan' });
    },
    { autoFix: true }
  );

  assert.ok(res.ok);
  const bathAfter = res.state.rooms.find((r) => r.id === bath.id);
  // Dry wallpaper in bathroom should be auto-fixed to moisture-rated wall tile/paint
  assert.ok(Object.values(bathAfter.walls).every((w) => w !== 'wp_floral'));
});

test('autoComply with targetId remediates only the targeted violation', () => {
  const s = m.newState();
  // Room 1 has low ceiling (72 in)
  const room1 = m.createRoom(s, 'living', 0, 0, 144, 144, { ceiling: 72 });
  // Room 2 (bathroom) has non-wet floor finish
  const room2 = m.createRoom(s, 'bathroom', 200, 0, 144, 144, { floor: 'wood_oak' });

  // Initial evaluation shows violations in both rooms
  const rep0 = c.evaluate(s);
  assert.ok(rep0.violations.some((v) => v.rule === 'ceiling' && v.roomId === room1.id));
  assert.ok(rep0.violations.some((v) => v.rule === 'wet-floor' && v.roomId === room2.id));

  // Auto-comply targeting room1 ceiling only
  const log = c.autoComply(s, { targetId: `ceiling:${room1.id}` });
  assert.ok(log.length > 0);
  assert.ok(log.some((d) => d.id === room1.id && d.type === 'ceiling'));

  // Room 1 ceiling is raised to 96
  assert.equal(s.rooms.find((r) => r.id === room1.id).ceiling, 96);
  // Room 2 floor finish was NOT remediated yet
  assert.equal(s.rooms.find((r) => r.id === room2.id).floor, 'wood_oak');

  // Now target room2 floor
  const log2 = c.autoComply(s, { targetId: room2.id });
  assert.ok(log2.some((d) => d.id === room2.id && d.type === 'floor'));
  assert.equal(s.rooms.find((r) => r.id === room2.id).floor, 'floor_tile_gray');
});
