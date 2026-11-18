import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as M from '../js/model.js';
import { commit } from '../js/codes.js';
import {
  computeOpeningOffsetHUD,
  drawOpeningOffsetHUD,
  hitTestOpeningHUD,
  draw,
} from '../js/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeMockCtx(width = 800, height = 600) {
  const calls = [];
  return {
    canvas: { width, height },
    calls,
    save() {
      calls.push(['save']);
    },
    restore() {
      calls.push(['restore']);
    },
    setTransform(...args) {
      calls.push(['setTransform', ...args]);
    },
    translate(...args) {
      calls.push(['translate', ...args]);
    },
    rotate(...args) {
      calls.push(['rotate', ...args]);
    },
    scale(...args) {
      calls.push(['scale', ...args]);
    },
    beginPath() {
      calls.push(['beginPath']);
    },
    closePath() {
      calls.push(['closePath']);
    },
    moveTo(...args) {
      calls.push(['moveTo', ...args]);
    },
    lineTo(...args) {
      calls.push(['lineTo', ...args]);
    },
    arc(...args) {
      calls.push(['arc', ...args]);
    },
    rect(...args) {
      calls.push(['rect', ...args]);
    },
    roundRect(...args) {
      calls.push(['roundRect', ...args]);
    },
    fill() {
      calls.push(['fill']);
    },
    stroke() {
      calls.push(['stroke']);
    },
    clip() {},
    fillRect(...args) {
      calls.push(['fillRect', ...args]);
    },
    strokeRect(...args) {
      calls.push(['strokeRect', ...args]);
    },
    clearRect() {},
    setLineDash(...args) {
      calls.push(['setLineDash', ...args]);
    },
    fillText(text, x, y) {
      calls.push(['fillText', text, x, y]);
    },
    strokeText(text, x, y) {
      calls.push(['strokeText', text, x, y]);
    },
    measureText(text) {
      return { width: String(text).length * 7 };
    },
    createPattern() {
      return {};
    },
  };
}

test('clampOpeningOffset and getOpeningCornerDistance enforce 0 <= offset <= wallLength - openingWidth', () => {
  const s = M.newState();
  const room = M.createRoom(s, 'living', 0, 0, 144, 120); // N wall = 144", E wall = 120"
  const door = M.addOpening(s, room, 'door_interior_32', 'N', 36); // width = 32"

  assert.equal(door.width, 32);
  assert.equal(M.clampOpeningOffset(room, 'N', 36, 32), 36);
  assert.equal(M.getOpeningCornerDistance(room, door), 144 - 32 - 36);

  // Negative values clamp cleanly to 0 without throwing
  assert.equal(M.clampOpeningOffset(room, 'N', -24, 32), 0);
  assert.equal(M.clampOpeningOffset(room, 'N', -0.01, 32), 0);

  // Values exceeding wallLength - openingWidth clamp to max valid offset (112")
  assert.equal(M.clampOpeningOffset(room, 'N', 130, 32), 112);
  assert.equal(M.clampOpeningOffset(room, 'N', 9999, 32), 112);

  // Non-standard wall lengths where openingWidth === wallLength or openingWidth > wallLength
  const tinyRoom = M.createRoom(s, 'closet', 200, 0, 48, 48); // 48" wall
  assert.equal(M.clampOpeningOffset(tinyRoom, 'N', 20, 48), 0);
  assert.equal(M.clampOpeningOffset(tinyRoom, 'N', -10, 48), 0);
  assert.equal(M.clampOpeningOffset(tinyRoom, 'N', 25, 72), 0); // 72" patio door on 48" wall -> 0

  const wideWin = M.addOpening(s, tinyRoom, 'win_slider_60x36', 'N', 30); // 60" window on 48" wall
  assert.equal(wideWin.offset, 0);
  assert.equal(M.getOpeningCornerDistance(tinyRoom, wideWin), 0);
});

test('setOpeningOffset and setOpeningCornerDistance clamp bounds, reject invalid numbers, and prevent overlaps', () => {
  const s = M.newState();
  const room = M.createRoom(s, 'living', 0, 0, 180, 120); // N wall = 180"
  const o1 = M.addOpening(s, room, 'door_interior_32', 'N', 18); // [18, 50], w=32
  const o2 = M.addOpening(s, room, 'win_hung_36x60', 'N', 100); // [100, 136], w=36

  // Direct numerical offset update within bounds
  const r1 = M.setOpeningOffset(s, o1.id, 24);
  assert.equal(r1.ok, true);
  assert.equal(r1.offset, 24);
  assert.equal(r1.cornerDistance, 180 - 32 - 24);

  // Negative offset clamps to 0
  const rNeg = M.setOpeningOffset(s, o1.id, -15);
  assert.equal(rNeg.ok, true);
  assert.equal(rNeg.offset, 0);

  // Corner distance update sets offset = wallLen - width - cornerDist
  const rCorner = M.setOpeningCornerDistance(s, o2.id, 12); // offset = 180 - 36 - 12 = 132
  assert.equal(rCorner.ok, true);
  assert.equal(rCorner.offset, 132);
  assert.equal(rCorner.cornerDistance, 12);
  assert.equal(M.findOwner(s, o2.id).obj.offset, 132);

  // Overlap prevention on same wall: moving o1 onto o2 ([132, 168]) is rejected and preserves state
  const rOverlap = M.setOpeningOffset(s, o1.id, 120); // [120, 152] overlaps [132, 168]
  assert.equal(rOverlap.ok, false);
  assert.equal(rOverlap.reason, 'overlap');
  assert.equal(M.findOwner(s, o1.id).obj.offset, 0);

  // Overlap prevention across shared neighbor wall
  const adjRoom = M.createRoom(s, 'bedroom', 0, -120, 180, 120); // S wall shares N wall of room
  assert.equal(M.hasOpeningOverlap(s, adjRoom, 'S', 132, 36), true);
  const blockedAdd = M.addOpening(s, adjRoom, 'win_hung_36x60', 'S', 132, { preventOverlap: true });
  assert.equal(blockedAdd, null);

  // Non-finite numbers rejected without corrupting state
  const rNaN = M.setOpeningOffset(s, o1.id, Number.NaN);
  assert.equal(rNaN.ok, false);
  assert.equal(rNaN.reason, 'invalid-number');
  assert.equal(M.findOwner(s, o1.id).obj.offset, 0);

  // Resizing room clamps existing opening offsets to shortened wall length
  M.resizeRoom(room, 0, 0, 120, 120, s); // N wall shrinks from 180" to 120"; o2 (w=36) clamps from 132 to 84
  assert.equal(M.findOwner(s, o2.id).obj.offset, 84);
});

test('formatOpeningOffset and parseOpeningOffset support inches and feet-inches unit conversion', () => {
  assert.equal(M.normalizeOpeningUnit('in'), 'in');
  assert.equal(M.normalizeOpeningUnit('inches'), 'in');
  assert.equal(M.normalizeOpeningUnit('ft-in'), 'ft-in');
  assert.equal(M.normalizeOpeningUnit(undefined), 'ft-in');

  // Formatting in both unit modes
  assert.equal(M.formatOpeningOffset(42, 'in'), '42"');
  assert.equal(M.formatOpeningOffset(42, 'ft-in'), '3\' 6"');
  assert.equal(M.formatOpeningOffset(36, 'ft-in'), '3\' 0"');
  assert.equal(M.formatOpeningOffset(0, 'ft-in'), '0\' 0"');
  assert.equal(M.formatOpeningOffset(0, 'in'), '0"');
  assert.equal(M.formatOpeningOffset(42.5, 'in'), '42.5"');
  assert.equal(M.formatOpeningOffset(42.5, 'ft-in'), '3\' 6.5"');

  // Parsing feet-inches, inches, plain numbers, and negative values
  assert.equal(M.parseOpeningOffset('3\' 6"', 'ft-in'), 42);
  assert.equal(M.parseOpeningOffset('3ft 6in', 'in'), 42);
  assert.equal(M.parseOpeningOffset("3.5'", 'in'), 42);
  assert.equal(M.parseOpeningOffset('42"', 'ft-in'), 42);
  assert.equal(M.parseOpeningOffset('42', 'in'), 42);
  assert.equal(M.parseOpeningOffset('42', 'ft-in'), 42);
  assert.equal(M.parseOpeningOffset('-12"', 'in'), -12);
  assert.equal(M.parseOpeningOffset('-2\' 6"', 'ft-in'), -30);
  assert.equal(M.parseOpeningOffset('', 'in'), null);
  assert.equal(M.parseOpeningOffset('abc', 'ft-in'), null);

  // Serialization preserves openingUnits setting
  const s = M.newState();
  s.settings.openingUnits = 'in';
  const roundTrip = M.deserialize(M.serialize(s));
  assert.equal(roundTrip.settings.openingUnits, 'in');
});

test('History undo/redo cycles maintain opening offset and corner distance integrity with commit()', () => {
  let doc = M.newState();
  const room = M.createRoom(doc, 'living', 0, 0, 180, 144);
  const win = M.addOpening(doc, room, 'win_hung_36x60', 'N', 24); // w=36, len=180
  const hist = new M.History(doc, 'Initial Plan');

  // Edit 1: set Wall Offset to 48"
  const c1 = commit(
    doc,
    (next) => {
      M.setOpeningOffset(next, win.id, 48);
    },
    { autoFix: false }
  );
  assert.equal(c1.ok, true);
  doc = c1.state;
  hist.push(doc, 'Update Opening Offset');
  assert.equal(M.findOwner(doc, win.id).obj.offset, 48);

  // Edit 2: set Corner Distance to 30" -> offset = 180 - 36 - 30 = 114"
  const c2 = commit(
    doc,
    (next) => {
      M.setOpeningCornerDistance(next, win.id, 30);
    },
    { autoFix: false }
  );
  assert.equal(c2.ok, true);
  doc = c2.state;
  hist.push(doc, 'Update Opening Corner Distance');
  assert.equal(M.findOwner(doc, win.id).obj.offset, 114);
  assert.equal(
    M.getOpeningCornerDistance(M.findOwner(doc, win.id).room, M.findOwner(doc, win.id).obj),
    30
  );

  // Undo -> back to 48"
  doc = hist.undo();
  assert.equal(M.findOwner(doc, win.id).obj.offset, 48);

  // Undo -> back to 24"
  doc = hist.undo();
  assert.equal(M.findOwner(doc, win.id).obj.offset, 24);

  // Redo -> 48", Redo -> 114"
  doc = hist.redo();
  assert.equal(M.findOwner(doc, win.id).obj.offset, 48);
  doc = hist.redo();
  assert.equal(M.findOwner(doc, win.id).obj.offset, 114);
});

test('computeOpeningOffsetHUD, drawOpeningOffsetHUD, and hitTestOpeningHUD render and hit-test labels accurately', () => {
  const s = M.newState();
  const room = M.createRoom(s, 'living', 40, 60, 180, 120); // N wall = 180"
  const win = M.addOpening(s, room, 'win_hung_36x60', 'N', 36); // offset=36, width=36, corner=108
  const view = { scale: 2, ox: 20, oy: 30 };

  // Null for non-opening or multi-selection
  assert.equal(computeOpeningOffsetHUD(s, null, view), null);
  assert.equal(computeOpeningOffsetHUD(s, room.id, view), null);
  assert.equal(computeOpeningOffsetHUD(s, new Set([room.id, win.id]), view), null);

  // Feet & inches HUD calculation
  const hudFt = computeOpeningOffsetHUD(s, win.id, view, { openingUnits: 'ft-in' });
  assert.ok(hudFt);
  assert.equal(hudFt.offset, 36);
  assert.equal(hudFt.cornerDistance, 108);
  assert.equal(hudFt.offsetLabel.text, '3\' 0"');
  assert.equal(hudFt.cornerLabel.text, '9\' 0"');

  // Minimum 24px target height in screen space (bounds.h * scale >= 24)
  assert.ok(hudFt.offsetLabel.bounds.h * view.scale >= 24 - 1e-6);
  assert.ok(hudFt.cornerLabel.bounds.h * view.scale >= 24 - 1e-6);

  // Inches HUD calculation
  const hudIn = computeOpeningOffsetHUD(s, win.id, view, { openingUnits: 'in' });
  assert.equal(hudIn.offsetLabel.text, '36"');
  assert.equal(hudIn.cornerLabel.text, '108"');

  // Hit-testing on both badges
  const hitLeft = hitTestOpeningHUD(s, win.id, hudFt.offsetLabel.center, view, {
    openingUnits: 'ft-in',
  });
  assert.ok(hitLeft);
  assert.equal(hitLeft.side, 'offset');
  assert.equal(hitLeft.openingId, win.id);
  assert.equal(hitLeft.value, 36);

  const hitRight = hitTestOpeningHUD(s, win.id, hudFt.cornerLabel.center, view, {
    openingUnits: 'ft-in',
  });
  assert.ok(hitRight);
  assert.equal(hitRight.side, 'corner');
  assert.equal(hitRight.openingId, win.id);
  assert.equal(hitRight.value, 108);

  // Miss outside HUD bounds
  assert.equal(hitTestOpeningHUD(s, win.id, { x: 100, y: 120 }, view), null);

  // Non-overlapping badges even on non-standard wall where openingWidth >= wallLength
  const narrowRoom = M.createRoom(s, 'closet', 300, 60, 36, 48);
  const fullWin = M.addOpening(s, narrowRoom, 'win_slider_60x36', 'N', 12); // 60" window on 36" wall -> offset=0, corner=0
  const hudNarrow = computeOpeningOffsetHUD(s, fullWin.id, view, { openingUnits: 'in' });
  assert.ok(hudNarrow);
  assert.equal(hudNarrow.offset, 0);
  assert.equal(hudNarrow.cornerDistance, 0);
  const b1 = hudNarrow.offsetLabel.bounds;
  const b2 = hudNarrow.cornerLabel.bounds;
  const overlapsX = b1.x < b2.x + b2.w && b1.x + b1.w > b2.x;
  assert.equal(overlapsX, false, 'HUD pill badges must not overlap when opening spans entire wall');

  // Full draw() pipeline renders HUD labels when opening is selected
  const ctx = makeMockCtx();
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 24,
      height: 24,
      getContext: () => makeMockCtx(24, 24),
    }),
  };
  try {
    draw(ctx, s, view, { selection: win.id, openingUnits: 'ft-in' });
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
  const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(texts.includes('3\' 0"'), 'draw() must render Wall Offset HUD label');
  assert.ok(texts.includes('9\' 0"'), 'draw() must render Corner Distance HUD label');

  // Direct drawOpeningOffsetHUD call returns HUD descriptor
  const directCtx = makeMockCtx();
  const drawn = drawOpeningOffsetHUD(directCtx, s, win.id, view, {
    openingUnits: 'in',
    hoveredOpeningHudSide: 'offset',
  });
  assert.equal(drawn.offsetLabel.text, '36"');
});

test('Inspector and HUD markup define accessible labeled controls for opening offsets', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

  assert.match(html, /id="opening-offset-hud"/);
  assert.match(html, /<label[^>]*for="opening-hud-input"[^>]*>Wall Offset<\/label>/);
  assert.match(html, /<input[^>]*id="opening-hud-input"/);
  assert.match(html, /id="opening-hud-unit-btn"/);

  assert.match(appJs, /formRow\(\s*'i-open-units',\s*'Offset Units'/);
  assert.match(appJs, /formRow\(\s*'i-open-offset',\s*'Wall Offset'/);
  assert.match(appJs, /formRow\(\s*'i-open-corner',\s*'Corner Distance'/);
});
