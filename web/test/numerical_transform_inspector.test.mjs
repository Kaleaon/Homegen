import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { renderInspector, select, setDoc, getDoc, formatNumericInput } from '../js/app.js';

function parseControlsFromHtml(html) {
  const controls = new Map();
  const labels = new Map();

  const labelRegex = /<label[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi;
  let lMatch;
  while ((lMatch = labelRegex.exec(html)) !== null) {
    labels.set(lMatch[1], lMatch[2].replace(/<[^>]+>/g, '').trim());
  }

  const tagRegex = /<(input|select|button)\b([^>]*)>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toUpperCase();
    const attrs = match[2];
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const valMatch = attrs.match(/\bvalue="([^"]*)"/);
    const typeMatch = attrs.match(/\btype="([^"]*)"/);
    const minMatch = attrs.match(/\bmin="([^"]*)"/);
    const stepMatch = attrs.match(/\bstep="([^"]*)"/);

    const listeners = {};
    const el = {
      id,
      tagName,
      type: typeMatch ? typeMatch[1] : '',
      min: minMatch ? minMatch[1] : '',
      step: stepMatch ? stepMatch[1] : '',
      value: valMatch ? valMatch[1] : '',
      checked: /\bchecked\b/.test(attrs),
      disabled: /\bdisabled\b/.test(attrs),
      dataset: {},
      style: {},
      addEventListener(evt, fn) {
        listeners[evt] ||= [];
        listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : evt.type;
        const eventObj = typeof evt === 'string' ? { type, target: el, currentTarget: el } : evt;
        if (!eventObj.target) eventObj.target = el;
        if (!eventObj.currentTarget) eventObj.currentTarget = el;
        for (const fn of listeners[type] || []) {
          fn(eventObj);
        }
      },
      click() {
        el.dispatchEvent('click');
      },
    };
    controls.set(id, el);
  }

  return { controls, labels };
}

function createInspectorDomHarness() {
  let parsed = { controls: new Map(), labels: new Map() };
  let inspectorHtml = '';

  const inspectorEl = {
    id: 'inspector',
    get innerHTML() {
      return inspectorHtml;
    },
    set innerHTML(html) {
      inspectorHtml = html;
      parsed = parseControlsFromHtml(html);
    },
    querySelectorAll() {
      return [];
    },
  };

  const liveRegionEl = {
    id: 'plan-fallback-summary',
    textContent: '',
    innerHTML: '',
  };

  const autoCheckEl = {
    id: 'auto',
    checked: false,
  };

  const toastEl = {
    id: 'toast',
    textContent: '',
    className: '',
    style: { display: 'none' },
  };

  const staticElements = new Map([
    ['inspector', inspectorEl],
    ['plan-fallback-summary', liveRegionEl],
    ['auto', autoCheckEl],
    ['toast', toastEl],
  ]);

  const docMock = {
    getElementById(id) {
      return staticElements.get(id) || parsed.controls.get(id) || null;
    },
    querySelector(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return staticElements.get(id) || parsed.controls.get(id) || null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return {
        width: 256,
        height: 256,
        style: {},
        getContext: () => null,
      };
    },
  };

  return {
    docMock,
    inspectorEl,
    liveRegionEl,
    getControl: (id) => parsed.controls.get(id) || null,
    getLabel: (id) => parsed.labels.get(id) || null,
  };
}

const waitForLiveAnnouncement = () => new Promise((resolve) => setTimeout(resolve, 140));

test('formatNumericInput formats inch, angle, and scale floats without rounding drift', () => {
  assert.equal(formatNumericInput(60), '60');
  assert.equal(formatNumericInput(48.375), '48.375');
  assert.equal(formatNumericInput(0.1 + 0.2), '0.3');
  assert.equal(formatNumericInput(-0), '0');
  assert.equal(formatNumericInput(Number.NaN), '0');
});

test('Inspector room numerical position inputs update room state via apply() and announce live changes', async () => {
  const prevDoc = globalThis.document;
  const harness = createInspectorDomHarness();
  globalThis.document = harness.docMock;

  try {
    const state = M.newState();
    const room = M.createRoom(state, 'living', 12, 24, 180, 144, { name: 'Living Room' });
    const sofa = M.addItem(state, room, 'sofa', { x: 90, y: 84, rot: 0 });
    setDoc(state);

    select(room.id);

    const posXInput = harness.getControl('i-pos-x');
    const posYInput = harness.getControl('i-pos-y');
    assert.ok(posXInput, 'Expected #i-pos-x numeric input in room inspector');
    assert.ok(posYInput, 'Expected #i-pos-y numeric input in room inspector');
    assert.equal(posXInput.type, 'number');
    assert.equal(posYInput.type, 'number');
    assert.equal(harness.getLabel('i-pos-x'), 'Position X (in)');
    assert.equal(harness.getLabel('i-pos-y'), 'Position Y (in)');
    assert.equal(posXInput.value, '12');
    assert.equal(posYInput.value, '24');

    // Update Position X to exact decimal inches (non-grid-aligned) without sub-pixel drift
    posXInput.value = '27.25';
    posXInput.dispatchEvent('change');

    let updatedRoom = getDoc().rooms.find((r) => r.id === room.id);
    assert.equal(updatedRoom.x, 27.25);
    assert.equal(updatedRoom.y, 24);
    const movedSofa = updatedRoom.items.find((i) => i.id === sofa.id);
    assert.equal(movedSofa.x, 105.25);

    await waitForLiveAnnouncement();
    assert.equal(harness.liveRegionEl.textContent, 'Living Room position set to X 27.25", Y 24".');

    // Update Position Y and verify NaN sanitization on invalid text
    const refreshedPosY = harness.getControl('i-pos-y');
    refreshedPosY.value = '18.5';
    refreshedPosY.dispatchEvent('change');

    updatedRoom = getDoc().rooms.find((r) => r.id === room.id);
    assert.equal(updatedRoom.x, 27.25);
    assert.equal(updatedRoom.y, 18.5);

    const invalidPosX = harness.getControl('i-pos-x');
    invalidPosX.value = 'not-a-number';
    invalidPosX.dispatchEvent('change');

    updatedRoom = getDoc().rooms.find((r) => r.id === room.id);
    assert.equal(updatedRoom.x, 27.25);
    assert.equal(invalidPosX.value, '27.25');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('Inspector item numerical position, angle, and scale inputs update model state, clamp scale, and announce changes', async () => {
  const prevDoc = globalThis.document;
  const harness = createInspectorDomHarness();
  globalThis.document = harness.docMock;

  try {
    const state = M.newState();
    const room = M.createRoom(state, 'living', 0, 0, 240, 240, { name: 'Studio' });
    const sofa = M.addItem(state, room, 'sofa', { x: 100, y: 100, rot: 0 });
    const door = M.addOpening(state, room, 'door_entry_36', 'N', 48);
    setDoc(state);

    select(sofa.id);

    const itemX = harness.getControl('i-item-pos-x');
    const itemY = harness.getControl('i-item-pos-y');
    const itemRot = harness.getControl('i-item-rot');
    const itemScale = harness.getControl('i-item-scale');

    assert.ok(itemX && itemY && itemRot && itemScale, 'Expected position, angle, and scale inputs');
    assert.equal(harness.getLabel('i-item-pos-x'), 'Position X (in)');
    assert.equal(harness.getLabel('i-item-pos-y'), 'Position Y (in)');
    assert.equal(harness.getLabel('i-item-rot'), 'Angle (°)');
    assert.equal(harness.getLabel('i-item-scale'), 'Scale');
    assert.equal(itemX.value, '100');
    assert.equal(itemY.value, '100');
    assert.equal(itemRot.value, '0');
    assert.equal(itemScale.value, '1');

    // 1. Exact position update
    itemX.value = '112.375';
    itemX.dispatchEvent('change');
    let curSofa = M.findOwner(getDoc(), sofa.id).obj;
    assert.equal(curSofa.x, 112.375);
    assert.equal(curSofa.y, 100);

    await waitForLiveAnnouncement();
    assert.equal(harness.liveRegionEl.textContent, 'Sofa position set to X 112.375", Y 100".');

    // 2. Exact rotation update (arbitrary angle + negative angle normalization)
    const rotInput1 = harness.getControl('i-item-rot');
    rotInput1.value = '35';
    rotInput1.dispatchEvent('change');
    curSofa = M.findOwner(getDoc(), sofa.id).obj;
    assert.equal(curSofa.rot, 35);

    await waitForLiveAnnouncement();
    assert.equal(harness.liveRegionEl.textContent, 'Sofa rotated to 35 degrees.');

    const rotInput2 = harness.getControl('i-item-rot');
    rotInput2.value = '-30';
    rotInput2.dispatchEvent('change');
    curSofa = M.findOwner(getDoc(), sofa.id).obj;
    assert.equal(curSofa.rot, 330);

    // 3. Exact scale update + minimum 0.05 clamping + NaN safety
    const scaleInput1 = harness.getControl('i-item-scale');
    scaleInput1.value = '1.25';
    scaleInput1.dispatchEvent('change');
    curSofa = M.findOwner(getDoc(), sofa.id).obj;
    assert.equal(curSofa.scale, 1.25);

    await waitForLiveAnnouncement();
    assert.equal(harness.liveRegionEl.textContent, 'Sofa scaled to 1.25x.');

    const scaleInputLow = harness.getControl('i-item-scale');
    scaleInputLow.value = '-5';
    scaleInputLow.dispatchEvent('change');
    curSofa = M.findOwner(getDoc(), sofa.id).obj;
    assert.equal(curSofa.scale, 0.05);
    assert.equal(harness.getControl('i-item-scale').value, '0.05');

    const scaleInputNaN = harness.getControl('i-item-scale');
    scaleInputNaN.value = 'abc';
    scaleInputNaN.dispatchEvent('change');
    curSofa = M.findOwner(getDoc(), sofa.id).obj;
    assert.equal(curSofa.scale, 0.05);
    assert.equal(scaleInputNaN.value, '0.05');

    // 4. Opening exact position update along wall
    select(door.id);
    renderInspector();
    const doorX = harness.getControl('i-item-pos-x');
    assert.ok(doorX, 'Expected #i-item-pos-x for selected wall opening');
    assert.equal(
      harness.getControl('i-item-rot'),
      null,
      'Openings should not render item angle input'
    );
    assert.equal(
      harness.getControl('i-item-scale'),
      null,
      'Openings should not render item scale input'
    );

    // Door width is 36; setting center X to 90 on room starting at x=0 sets offset = 90 - 18 = 72
    doorX.value = '90';
    doorX.dispatchEvent('change');
    const curDoor = M.findOwner(getDoc(), door.id).obj;
    assert.equal(curDoor.offset, 72);

    await waitForLiveAnnouncement();
    assert.match(harness.liveRegionEl.textContent, /position set to X 90"/);
  } finally {
    globalThis.document = prevDoc;
  }
});
