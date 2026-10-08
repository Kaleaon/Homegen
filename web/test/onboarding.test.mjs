import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function createMockWindow() {
  const listeners = {};
  const elements = new Map();

  const doc = {
    body: {
      appendChild: (child) => {
        if (child.id) elements.set(child.id, child);
        return child;
      },
      removeChild: (child) => {
        if (child.id) elements.delete(child.id);
      },
    },
    createElement: (tag) => {
      const attrs = new Map();
      const childElements = [];
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        children: childElements,
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => attrs.get(k) ?? null,
        removeAttribute: (k) => attrs.delete(k),
        remove: () => {
          if (el.id) elements.delete(el.id);
        },
        querySelector: (sel) => {
          if (sel === '#spotlight-title') return el._title || createMockElement('spotlight-title');
          if (sel === '#spotlight-desc') return el._desc || createMockElement('spotlight-desc');
          if (sel === '#spotlight-step-badge')
            return el._badge || createMockElement('spotlight-step-badge');
          if (sel === '.onboarding-mask-path')
            return el._path || createMockElement('onboarding-mask-path');
          if (sel === '.onboarding-focus-ring')
            return el._ring || createMockElement('onboarding-focus-ring');
          if (sel === '#onboarding-popover')
            return el._popover || createMockElement('onboarding-popover');
          return null;
        },
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({
          left: 10,
          top: 10,
          right: 100,
          bottom: 100,
          width: 90,
          height: 90,
        }),
      };
      return el;
    },
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return elements.get(id) || createMockElement(id);
      }
      return createMockElement('mock-el');
    },
    querySelectorAll: () => [],
    activeElement: null,
  };

  function createMockElement(id) {
    const attrs = new Map();
    const el = {
      id,
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      remove: () => elements.delete(id),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({
        left: 20,
        top: 20,
        right: 120,
        bottom: 120,
        width: 100,
        height: 100,
      }),
    };
    elements.set(id, el);
    return el;
  }

  const win = {
    innerWidth: 1024,
    innerHeight: 768,
    document: doc,
    localStorage: createMockStorage(),
    addEventListener: (type, fn) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (type, event) => {
      if (listeners[type]) {
        listeners[type].forEach((fn) => fn(event));
      }
    },
  };

  return win;
}

test('Onboarding Tour - LocalStorage status persistence and checkOnboardingOnStartup', async () => {
  const win = createMockWindow();
  global.window = win;
  global.document = win.document;
  global.localStorage = win.localStorage;

  const onboardingModule = await import('../js/onboardingTour.js');
  const {
    STORAGE_KEY,
    getOnboardingStatus,
    setOnboardingStatus,
    resetOnboardingStatus,
    checkOnboardingOnStartup,
  } = onboardingModule;

  assert.equal(STORAGE_KEY, 'homegen_onboarding_status');

  resetOnboardingStatus();
  assert.equal(getOnboardingStatus(), null);

  let shown = false;
  checkOnboardingOnStartup(() => {
    shown = true;
  });
  assert.equal(shown, true, 'Welcome wizard callback should fire when onboarding status is unset');

  setOnboardingStatus('completed');
  assert.equal(getOnboardingStatus(), 'completed');

  shown = false;
  checkOnboardingOnStartup(() => {
    shown = true;
  });
  assert.equal(
    shown,
    false,
    'Welcome wizard should not fire when onboarding status is "completed"'
  );

  setOnboardingStatus('skipped');
  assert.equal(getOnboardingStatus(), 'skipped');

  shown = false;
  checkOnboardingOnStartup(() => {
    shown = true;
  });
  assert.equal(shown, false, 'Welcome wizard should not fire when onboarding status is "skipped"');
});

test('OnboardingTour Engine - Spotlight DOM creation, step progression, and keyboard navigation', async () => {
  const win = createMockWindow();
  global.window = win;
  global.document = win.document;
  global.localStorage = win.localStorage;

  const { OnboardingTour, resetOnboardingStatus, getOnboardingStatus } =
    await import('../js/onboardingTour.js');

  resetOnboardingStatus();

  const tour = new OnboardingTour();
  assert.equal(tour.active, false);

  tour.start();
  assert.equal(tour.active, true);

  const overlay = win.document.getElementById('onboarding-overlay');
  assert.ok(overlay, 'onboarding-overlay should be mounted in document.body');

  // Next step
  tour.nextStep();
  assert.equal(tour.currentIndex, 1);

  // Prev step
  tour.prevStep();
  assert.equal(tour.currentIndex, 0);

  // Keyboard navigation - ArrowRight
  win.dispatchEvent('keydown', {
    key: 'ArrowRight',
    preventDefault: () => {},
    stopPropagation: () => {},
  });
  assert.equal(tour.currentIndex, 1);

  // Keyboard navigation - ArrowLeft
  win.dispatchEvent('keydown', {
    key: 'ArrowLeft',
    preventDefault: () => {},
    stopPropagation: () => {},
  });
  assert.equal(tour.currentIndex, 0);

  // Keyboard navigation - Escape skips tour
  win.dispatchEvent('keydown', {
    key: 'Escape',
    preventDefault: () => {},
    stopPropagation: () => {},
  });
  assert.equal(tour.active, false);
  assert.equal(getOnboardingStatus(), 'skipped');
  assert.equal(win.document.getElementById('onboarding-overlay'), null);
});

test('OnboardingTour Engine - Full completion writes "completed" to LocalStorage', async () => {
  const win = createMockWindow();
  global.window = win;
  global.document = win.document;
  global.localStorage = win.localStorage;

  const { OnboardingTour, resetOnboardingStatus, getOnboardingStatus } =
    await import('../js/onboardingTour.js');

  resetOnboardingStatus();

  const tour = new OnboardingTour();
  tour.start();

  // Step 0 -> 1 -> 2 -> 3 -> 4 -> end
  for (let i = 0; i < 5; i++) {
    tour.nextStep();
  }

  assert.equal(tour.active, false);
  assert.equal(getOnboardingStatus(), 'completed');
});

test('Welcome Wizard Dialog Markup - ARIA accessibility and choice buttons', () => {
  const htmlPath = path.resolve(webRoot, 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.match(
    htmlContent,
    /<dialog\s+id="dlg-welcome"\s+aria-labelledby="dlg-welcome-title"\s+class="k-overlay-dialog welcome-wizard-dialog">/,
    '#dlg-welcome dialog must exist in index.html with aria-labelledby'
  );

  assert.match(htmlContent, /id="welcome-btn-tour"/, '#welcome-btn-tour button must exist');
  assert.match(
    htmlContent,
    /id="welcome-btn-templates"/,
    '#welcome-btn-templates button must exist'
  );
  assert.match(htmlContent, /id="welcome-btn-blank"/, '#welcome-btn-blank button must exist');
});

test('OnboardingTour Popover - Renders buttons using <k-button> custom elements with primary variant', () => {
  const tourJsPath = path.resolve(webRoot, 'js/onboardingTour.js');
  const tourJsContent = fs.readFileSync(tourJsPath, 'utf8');

  assert.match(
    tourJsContent,
    /<k-button [^>]*class="spotlight-close"[^>]*>✕<\/k-button>/,
    'Close button uses <k-button>'
  );
  assert.match(
    tourJsContent,
    /<k-button [^>]*class="spotlight-btn spotlight-btn-skip"[^>]*>Skip<\/k-button>/,
    'Skip button uses <k-button>'
  );
  assert.match(
    tourJsContent,
    /<k-button [^>]*class="spotlight-btn spotlight-btn-back"[^>]*>Back<\/k-button>/,
    'Back button uses <k-button>'
  );
  assert.match(
    tourJsContent,
    /<k-button [^>]*class="spotlight-btn spotlight-btn-next"[^>]*primary[^>]*>Next<\/k-button>/,
    'Next button uses <k-button> with primary attribute'
  );
});
