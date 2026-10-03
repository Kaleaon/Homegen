import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/model.js';

test('newState initializes background as null', () => {
  const s = m.newState();
  assert.equal(s.background, null);
});

test('serialization round-trips document background state', () => {
  const s = m.newState();
  s.background = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    x: 12,
    y: 24,
    scale: 1.5,
    opacity: 0.7,
    visible: true,
    locked: true,
    width: 100,
    height: 100,
  };
  const json = m.serialize(s);
  const loaded = m.deserialize(json);
  assert.deepEqual(loaded.background, s.background);
});

test('parseDistanceInInches parses various measurement formats correctly', () => {
  assert.equal(m.parseDistanceInInches("10'"), 120);
  assert.equal(m.parseDistanceInInches('10 ft'), 120);
  assert.equal(m.parseDistanceInInches('10 feet'), 120);
  assert.equal(m.parseDistanceInInches('10\' 6"'), 126);
  assert.equal(m.parseDistanceInInches('10ft 6in'), 126);
  assert.equal(m.parseDistanceInInches('120"'), 120);
  assert.equal(m.parseDistanceInInches('120 in'), 120);
  assert.equal(m.parseDistanceInInches('120 inches'), 120);
  assert.equal(m.parseDistanceInInches('120'), 120);
  assert.equal(m.parseDistanceInInches('10'), 120);
  assert.ok(Math.abs(m.parseDistanceInInches('1 m') - 39.3701) < 0.01);
  assert.equal(m.parseDistanceInInches(''), null);
  assert.equal(m.parseDistanceInInches('abc'), null);
  assert.equal(m.parseDistanceInInches('-10'), null);
});

test('2-point scale calibration recalculates scale and anchor position', () => {
  const bg = {
    dataUrl: 'data:image/png;base64,dummy',
    x: 0,
    y: 0,
    scale: 1.0,
    opacity: 0.5,
    visible: true,
    locked: false,
    width: 500,
    height: 500,
  };

  const p1 = { x: 50, y: 50 };
  const p2 = { x: 150, y: 50 };
  const currentDistPx = Math.hypot(p2.x - p1.x, p2.y - p1.y); // 100
  const targetInches = 200; // Want 200 inches

  const factor = targetInches / currentDistPx; // 2.0
  bg.scale *= factor;
  bg.x = p1.x - (p1.x - bg.x) * factor;
  bg.y = p1.y - (p1.y - bg.y) * factor;

  assert.equal(bg.scale, 2.0);
  assert.equal(bg.x, -50);
  assert.equal(bg.y, -50);
});
