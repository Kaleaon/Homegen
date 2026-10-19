import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as M from '../js/model.js';
import { RoomDrawingTool } from '../../designer3d/tools/roomDrawingTool.mjs';
import { InteractionLayer } from '../../designer3d/tools/interactionLayer.mjs';
import { SnapModeState } from '../../designer3d/tools/snapModes.mjs';
import { createGridSettings } from '../../designer3d/tools/gridSettings.mjs';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');

test('index.html includes direct dimension input dialog and toolbar buttons', () => {
  assert.match(htmlContent, /<dialog id="dlg-add-room-dims"/);
  assert.match(htmlContent, /<select id="room-dims-type">/);
  assert.match(htmlContent, /<input id="room-dims-width"/);
  assert.match(htmlContent, /<input id="room-dims-depth"/);
  assert.match(htmlContent, /<input id="room-dims-x"/);
  assert.match(htmlContent, /<input id="room-dims-y"/);
  assert.match(htmlContent, /<button id="btn-add-room-dims-submit"/);
  assert.match(htmlContent, /<button id="btn-open-add-room-dims"/);
  assert.match(htmlContent, /<button id="btn-close-room"/);
});

test('M.addRoom creates a new room in state for both argument signatures', () => {
  const state1 = M.newState();
  const r1 = M.addRoom(state1, 24, 36, 120, 144, 'living');
  assert.equal(state1.rooms.length, 1);
  assert.equal(r1.type, 'living');
  assert.equal(r1.x, 24);
  assert.equal(r1.y, 36);
  assert.equal(r1.w, 120);
  assert.equal(r1.h, 144);

  const state2 = M.newState();
  const r2 = M.addRoom(state2, 'bedroom', 48, 60, 180, 200);
  assert.equal(state2.rooms.length, 1);
  assert.equal(r2.type, 'bedroom');
  assert.equal(r2.x, 48);
  assert.equal(r2.y, 60);
  assert.equal(r2.w, 180);
  assert.equal(r2.h, 200);
});

test('RoomDrawingTool and InteractionLayer support sequential corner placement and close validation', () => {
  const tool = new RoomDrawingTool(
    createGridSettings({ magneticThreshold: 12, unitSize: 1 }),
    new SnapModeState()
  );
  assert.equal(tool.getCornerCount(), 0);
  assert.equal(tool.canClose(), false);

  tool.addCorner({ x: 0, y: 0 });
  tool.addCorner({ x: 100, y: 0 });
  tool.addCorner({ x: 100, y: 100 });
  assert.equal(tool.getCornerCount(), 3);
  assert.equal(tool.canClose(), true);

  const res = tool.closeRoom();
  assert.equal(res.ok, true);
  assert.equal(res.room.closed, true);
  assert.equal(tool.getCornerCount(), 0);

  const layer = new InteractionLayer();
  assert.equal(layer.getCornerCount(), 0);
  layer.addRoomCorner({ x: 0, y: 0 });
  layer.addRoomCorner({ x: 200, y: 0 });
  layer.addRoomCorner({ x: 200, y: 200 });
  assert.equal(layer.getCornerCount(), 3);
  assert.equal(layer.canCloseRoom(), true);
  layer.resetRoomDrawing();
  assert.equal(layer.getCornerCount(), 0);
});

test('app.js defines step nudge controls, direct dimension modal wiring, and live region announcements', () => {
  assert.match(appJsContent, /announceToLiveRegion/);
  assert.match(appJsContent, /setupAddRoomDimsModal/);
  assert.match(appJsContent, /handleCloseRoom/);
  assert.match(appJsContent, /class="i-nudge-btn"/);
  assert.match(appJsContent, /class="i-item-nudge-btn"/);
  assert.match(appJsContent, /e\.altKey \? 1 : e\.shiftKey \? 12 : 6/);
  assert.match(appJsContent, /#plan-fallback-summary/);
});
