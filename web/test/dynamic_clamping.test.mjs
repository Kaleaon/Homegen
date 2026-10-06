import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';
import * as c from '../js/codes.js';

test('getRoomMinBounds returns correct thresholds per room category', () => {
  // Habitable rooms (non-kitchen)
  for (const type of ['living', 'bedroom', 'dining', 'office']) {
    const bounds = c.getRoomMinBounds(type);
    assert.equal(bounds.minIntDim, 84, `${type} interior min dimension should be 84"`);
    assert.equal(bounds.minOuterDim, 88.5, `${type} outer min dimension should be 88.5"`);
    assert.equal(bounds.minAreaSqFt, 70, `${type} min area should be 70 sq ft`);
  }

  // Kitchen
  const kitchenBounds = c.getRoomMinBounds('kitchen');
  assert.equal(kitchenBounds.minIntDim, 60, 'kitchen interior min dimension should be 60"');
  assert.equal(kitchenBounds.minOuterDim, 64.5, 'kitchen outer min dimension should be 64.5"');
  assert.equal(kitchenBounds.minAreaSqFt, 0, 'kitchen has no min area requirement beyond 60" clear dim');

  // Circulation & Stairs
  for (const type of ['hallway', 'entry', 'stairs']) {
    const bounds = c.getRoomMinBounds(type);
    assert.equal(bounds.minIntDim, 36, `${type} interior min dimension should be 36"`);
    assert.equal(bounds.minOuterDim, 40.5, `${type} outer min dimension should be 40.5"`);
    assert.equal(bounds.minAreaSqFt, 0);
  }

  // Non-habitable (closet, bathroom, laundry)
  for (const type of ['closet', 'bathroom', 'laundry']) {
    const bounds = c.getRoomMinBounds(type);
    assert.equal(bounds.minOuterDim, 36, `${type} outer min dimension should be 36"`);
    assert.equal(bounds.minAreaSqFt, 0);
  }
});

test('clampRoomWidth enforces bounds and floor area for single-axis edits', () => {
  // Habitable room with deep depth (H = 120" -> H_int = 115.5")
  // 10,080 / 115.5 = 87.2727" interior -> 91.7727" outer min
  const bedroomDeep = { type: 'bedroom', w: 120, h: 120 };
  const clampedW1 = c.clampRoomWidth(bedroomDeep, 60, 120);
  assert.ok(clampedW1 >= 91.77, `Expected clamped width >= 91.77", got ${clampedW1}`);

  // Habitable room with minimum depth (H = 88.5" -> H_int = 84")
  // 10,080 / 84 = 120" interior -> 124.5" outer min
  const bedroomShallow = { type: 'bedroom', w: 120, h: 88.5 };
  const clampedW2 = c.clampRoomWidth(bedroomShallow, 60, 88.5);
  assert.ok(Math.abs(clampedW2 - 124.5) < 1e-3, `Expected ~124.5", got ${clampedW2}`);

  // Kitchen clamps to 64.5" outer (60" interior)
  const kitchen = { type: 'kitchen', w: 120, h: 120 };
  assert.equal(c.clampRoomWidth(kitchen, 36, 120), 64.5);

  // Hallway clamps to 40.5" outer (36" interior)
  const hallway = { type: 'hallway', w: 120, h: 120 };
  assert.equal(c.clampRoomWidth(hallway, 24, 120), 40.5);

  // Closet clamps to 36" outer
  const closet = { type: 'closet', w: 48, h: 48 };
  assert.equal(c.clampRoomWidth(closet, 24, 48), 36);
});

test('clampRoomDepth enforces bounds and floor area for single-axis edits', () => {
  const bedroomDeep = { type: 'bedroom', w: 120, h: 120 };
  const clampedH1 = c.clampRoomDepth(bedroomDeep, 60, 120);
  assert.ok(clampedH1 >= 91.77, `Expected clamped depth >= 91.77", got ${clampedH1}`);

  const kitchen = { type: 'kitchen', w: 120, h: 120 };
  assert.equal(c.clampRoomDepth(kitchen, 36, 120), 64.5);

  const stairs = { type: 'stairs', w: 120, h: 120 };
  assert.equal(c.clampRoomDepth(stairs, 20, 120), 40.5);

  const bathroom = { type: 'bathroom', w: 60, h: 60 };
  assert.equal(c.clampRoomDepth(bathroom, 20, 60), 36);
});

test('clampRoomDimensions enforces dual-axis bounds and area scaling', () => {
  // Habitable room requested 60" x 60" (5 ft x 5 ft)
  // Base outer min is 88.5" x 88.5" (interior 84" x 84" = 7056 sq in).
  // Scaling by sqrt(10080 / 7056) ~ 1.1952286 yields interior 100.3992" x 100.3992" -> outer 104.8992" x 104.8992"
  const bedroom = { type: 'bedroom', w: 120, h: 120 };
  const clampedBed = c.clampRoomDimensions(bedroom, 60, 60);
  assert.ok(clampedBed.w >= 104.89, `Expected w >= 104.89, got ${clampedBed.w}`);
  assert.ok(clampedBed.h >= 104.89, `Expected h >= 104.89, got ${clampedBed.h}`);

  // Interior area of resulting clamped dimensions must be at least 70 sq ft (10080 sq in)
  const intArea = (clampedBed.w - 4.5) * (clampedBed.h - 4.5);
  assert.ok(intArea >= 10080, `Expected interior area >= 10080 sq in, got ${intArea}`);

  // Kitchen requested 36" x 36" -> clamps to 64.5" x 64.5"
  const kitchen = { type: 'kitchen', w: 120, h: 120 };
  const clampedKit = c.clampRoomDimensions(kitchen, 36, 36);
  assert.equal(clampedKit.w, 64.5);
  assert.equal(clampedKit.h, 64.5);

  // Hallway requested 24" x 24" -> clamps to 40.5" x 40.5"
  const hallway = { type: 'hallway', w: 120, h: 120 };
  assert.deepEqual(c.clampRoomDimensions(hallway, 24, 24), { w: 40.5, h: 40.5 });
});

test('State mutation with clamped dimensions evaluates with zero building code errors', () => {
  let state = m.newState();

  // Create bedroom and apply undersized input clamped with clampRoomDimensions
  const rawW = 60; // 5 ft
  const rawH = 60; // 5 ft
  const clampedBed = c.clampRoomDimensions('bedroom', rawW, rawH);

  const resBed = c.commit(state, (n) => {
    m.createRoom(n, 'bedroom', 0, 0, clampedBed.w, clampedBed.h);
  });

  assert.equal(resBed.ok, true, `Commit failed with reasons: ${resBed.reasons?.map((r) => r.msg).join(', ')}`);
  assert.equal(resBed.report.violations.filter((v) => v.blocking).length, 0);

  // Create kitchen with clamped dimensions
  const clampedKit = c.clampRoomDimensions('kitchen', 36, 36);
  const resKit = c.commit(state, (n) => {
    m.createRoom(n, 'kitchen', 200, 0, clampedKit.w, clampedKit.h);
  });
  assert.equal(resKit.ok, true, `Kitchen commit failed: ${resKit.reasons?.map((r) => r.msg).join(', ')}`);

  // Create hallway with clamped dimensions
  const clampedHall = c.clampRoomDimensions('hallway', 24, 120);
  const resHall = c.commit(state, (n) => {
    m.createRoom(n, 'hallway', 400, 0, clampedHall.w, clampedHall.h);
  });
  assert.equal(resHall.ok, true, `Hallway commit failed: ${resHall.reasons?.map((r) => r.msg).join(', ')}`);
});
