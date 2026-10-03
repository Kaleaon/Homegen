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

import { buildPrompt, hordeRender, rawBase64 } from '../js/photoreal.js';
import { HD_MATERIALS, polyHavenTextureUrls } from '../js/resources.js';
import { FLOOR_BY_ID, WALL_BY_ID } from '../js/catalog.js';

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
    assert.ok(FLOOR_BY_ID[id] || WALL_BY_ID[id], id);
    assert.match(
      polyHavenTextureUrls(hd.id).diff,
      /^https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Textures\/jpg\/1k\/.+_diff_1k\.jpg$/
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
