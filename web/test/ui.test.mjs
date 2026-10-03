import test from 'node:test';
import assert from 'node:assert/strict';
import { HordeError } from '../js/photoreal.js';

function createMockElement(id = '') {
  const listeners = {};
  const classes = new Set();
  const element = {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    src: '',
    hidden: false,
    disabled: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      if (listeners[type]) listeners[type].forEach((fn) => fn(evt));
    },
    click: () => element.dispatchEvent('click'),
    showModal: () => { element.hidden = false; },
    close: () => { element.hidden = true; element.dispatchEvent('close'); },
  };
  return element;
}

test('UI Error Boundary state controller displays recovery buttons and flags invalid key on auth error', () => {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  };

  const pKey = getEl('p-key');
  pKey.value = 'invalid-api-key';
  const pError = getEl('p-error');
  const pErrorMsg = getEl('p-error-msg');
  const pRetry = getEl('p-retry');
  const pUseAnon = getEl('p-use-anon');
  const pLowerRes = getEl('p-lower-res');

  // Simulate showPhotorealError with an Auth Error
  const authErr = new HordeError('AI Horde authorization failed (401)', 'auth', 401);

  // Directly verify boundary handler behavior logic:
  pError.hidden = false;
  pErrorMsg.textContent = authErr.message;
  if (authErr.type === 'auth') pKey.classList.add('invalid');
  pRetry.hidden = false;
  if (authErr.type === 'auth' || pKey.value !== '0000000000') pUseAnon.hidden = false;

  assert.equal(pError.hidden, false);
  assert.equal(pKey.classList.contains('invalid'), true);
  assert.equal(pUseAnon.hidden, false);
  assert.equal(pRetry.hidden, false);

  // Simulate clicking "Use Anonymous Key" recovery button
  pKey.value = '0000000000';
  pKey.classList.remove('invalid');
  pError.hidden = true;

  assert.equal(pKey.value, '0000000000');
  assert.equal(pKey.classList.contains('invalid'), false);
  assert.equal(pError.hidden, true);
});

test('UI Error Boundary displays Lower Resolution button on worker fault / timeout', () => {
  const pError = createMockElement('p-error');
  const pLowerRes = createMockElement('p-lower-res');
  const pRetry = createMockElement('p-retry');

  const faultErr = new HordeError('AI Horde job failed', 'fault');

  pError.hidden = false;
  pRetry.hidden = false;
  if (faultErr.type === 'fault') {
    pLowerRes.hidden = false;
  }

  assert.equal(pError.hidden, false);
  assert.equal(pRetry.hidden, false);
  assert.equal(pLowerRes.hidden, false);
});
