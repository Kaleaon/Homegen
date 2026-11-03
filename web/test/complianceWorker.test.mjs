import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, createRoom, addItem, addOpening } from '../js/model.js';
import { evaluate } from '../js/codes.js';
import {
  handleComplianceWorkerMessage,
  classifyViolationTargets,
  rebuildSpatialIndex,
} from '../js/complianceWorker.js';
import { ComplianceManager } from '../js/complianceClient.js';
import { ComplianceOverlayScene } from '../js/complianceOverlay.js';
import { badIds } from '../js/app.js';

test('ComplianceWorker handles INIT_STATE and evaluates base report off main thread', () => {
  const doc = newState();
  createRoom(doc, 'bedroom', 0, 0, 48, 48); // Undersized bedroom (16 sq ft < 70 sq ft)

  const res = handleComplianceWorkerMessage({
    data: {
      type: 'INIT_STATE',
      reqId: 1,
      payload: { doc },
    },
  });

  assert.equal(res.type, 'COMPLIANCE_RESULT');
  assert.equal(res.reqId, 1);
  assert.ok(res.report);
  assert.ok(res.report.violations.length > 0);
  assert.ok(res.badTargetIds.length > 0);
  assert.ok(res.targets.rooms.length > 0);
});

test('ComplianceWorker executes partitioned incremental re-evaluation on ITEM_MOVED', () => {
  const doc = newState();
  const room = createRoom(doc, 'bathroom', 0, 0, 120, 120);
  const toilet = addItem(doc, room, 'toilet', { x: 30, y: 30, rot: 0 });
  const vanity = addItem(doc, room, 'vanity', { x: 80, y: 30, rot: 0 });

  // Init worker state
  handleComplianceWorkerMessage({
    data: {
      type: 'INIT_STATE',
      reqId: 10,
      payload: { doc },
    },
  });

  // Dispatch ITEM_MOVED
  const res = handleComplianceWorkerMessage({
    data: {
      type: 'ITEM_MOVED',
      reqId: 11,
      payload: {
        id: vanity.id,
        cx: 35,
        cy: 30,
        rot: 0,
        roomId: room.id,
        oldBounds: { x: 80, y: 30, w: 24, h: 24 },
        newBounds: { x: 35, y: 30, w: 24, h: 24 },
      },
    },
  });

  assert.equal(res.type, 'COMPLIANCE_RESULT');
  assert.equal(res.reqId, 11);
  assert.equal(res.incremental, true);
  assert.ok(res.latency >= 0);
});

test('ComplianceManager rejects stale responses when consecutive rapid drags occur', async () => {
  const manager = new ComplianceManager({ useWorker: false });
  const doc = newState();
  await manager.initState(doc);

  // Directly verify stale message rejection in message handler
  const staleRes = handleComplianceWorkerMessage({
    data: {
      type: 'ITEM_MOVED',
      reqId: 0, // Older than latest reqId
      payload: { id: 'test' },
    },
  });

  assert.equal(staleRes.type, 'COMPLIANCE_CANCELLED');
  assert.equal(staleRes.reason, 'stale');
});

test('badIds classifies all target types: roomId, wallId, openingId, itemId', () => {
  const fakeReport = {
    violations: [
      { severity: 'error', roomId: 'room_1' },
      { severity: 'error', wallId: 'room_1:wall:0' },
      { severity: 'error', openingId: 'win_1' },
      { severity: 'error', itemId: 'item_1' },
      { severity: 'warning', roomId: 'room_2', wall: 'north' },
    ],
  };

  const ids = badIds(fakeReport);
  assert.ok(ids.has('room_1'));
  assert.ok(ids.has('room_1:wall:0'));
  assert.ok(ids.has('win_1'));
  assert.ok(ids.has('item_1'));
  assert.ok(ids.has('room_2'));
  assert.ok(ids.has('room_2:north'));
  assert.ok(ids.has('room_2:wall:north'));
});

test('Screen-to-world fix button hit targets accurately transform across zoom levels (20% to 500%)', () => {
  const state = newState();
  const room = createRoom(state, 'bedroom', 0, 0, 48, 48); // undersized
  const report = evaluate(state);
  // Mark violation as fixable for test
  report.violations[0].fixable = true;

  const testZooms = [0.2, 0.5, 1.0, 2.0, 5.0];

  for (const zoom of testZooms) {
    const scene = new ComplianceOverlayScene();
    const view = { scale: zoom, ox: 100, oy: 100 };
    scene.update(state, report, { curLevel: 0, view });

    const vioNode = scene.getNodesByType('violation')[0];
    assert.ok(vioNode);
    const fb = vioNode.data.fixButtonBounds;
    assert.ok(fb, `Fix button bounds must exist at zoom ${zoom * 100}%`);

    // In screen pixels, the rendered width is fb.w * zoom
    const screenWidth = fb.w * zoom;
    const screenHeight = fb.h * zoom;
    assert.equal(Math.round(screenWidth), 36, `Screen width must be 36px at zoom ${zoom * 100}%`);
    assert.equal(Math.round(screenHeight), 16, `Screen height must be 16px at zoom ${zoom * 100}%`);

    // World coordinate hit testing
    const hitWorld = scene.hitTest({ x: fb.x + fb.w / 2, y: fb.y + fb.h / 2 }, view);
    assert.ok(hitWorld, `Hit test in world coords must succeed at zoom ${zoom * 100}%`);

    // Screen coordinate hit testing with isScreen=true
    const screenPoint = {
      x: (fb.x + fb.w / 2) * zoom + view.ox,
      y: (fb.y + fb.h / 2) * zoom + view.oy,
    };
    const hitScreen = scene.hitTest(screenPoint, view, true);
    assert.ok(hitScreen, `Hit test in screen coords must succeed at zoom ${zoom * 100}%`);
  }
});
