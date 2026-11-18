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
      const elListeners = {};
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
        contains: (node) => Boolean(node && (node === el || childElements.includes(node))),
        querySelector: (sel) => {
          if (sel === '#spotlight-title')
            return (el._title ||= createMockElement('spotlight-title'));
          if (sel === '#spotlight-desc') return (el._desc ||= createMockElement('spotlight-desc'));
          if (sel === '#spotlight-step-badge')
            return (el._badge ||= createMockElement('spotlight-step-badge'));
          if (sel === '.onboarding-svg') return (el._svg ||= createMockElement('onboarding-svg'));
          if (sel === '.onboarding-mask-path')
            return (el._path ||= createMockElement('onboarding-mask-path'));
          if (sel === '.onboarding-focus-ring')
            return (el._ring ||= createMockElement('onboarding-focus-ring'));
          if (sel === '#onboarding-popover')
            return (el._popover ||= createMockElement('onboarding-popover'));
          if (sel === '.spotlight-close')
            return (el._closeBtn ||= createMockElement('spotlight-close', el._popover));
          if (sel === '.spotlight-btn-skip')
            return (el._skipBtn ||= createMockElement('spotlight-btn-skip', el._popover));
          if (sel === '.spotlight-btn-back')
            return (el._backBtn ||= createMockElement('spotlight-btn-back', el._popover));
          if (sel === '.spotlight-btn-next')
            return (el._nextBtn ||= createMockElement('spotlight-btn-next', el._popover));
          return null;
        },
        querySelectorAll: () => [],
        addEventListener: (type, fn) => {
          if (!elListeners[type]) elListeners[type] = [];
          elListeners[type].push(fn);
        },
        removeEventListener: (type, fn) => {
          if (elListeners[type]) {
            elListeners[type] = elListeners[type].filter((f) => f !== fn);
          }
        },
        dispatchEvent: (type, event = {}) => {
          const evt = { target: el, ...event };
          if (elListeners[type]) {
            elListeners[type].forEach((fn) => fn(evt));
          }
          return evt;
        },
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

  function createMockElement(id, parent = null) {
    const attrs = new Map();
    const elListeners = {};
    const childElements = [];
    const el = {
      id,
      children: childElements,
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      remove: () => elements.delete(id),
      focus: () => {
        doc.activeElement = el;
      },
      contains: (node) => Boolean(node && (node === el || childElements.includes(node))),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: (type, fn) => {
        if (!elListeners[type]) elListeners[type] = [];
        elListeners[type].push(fn);
      },
      removeEventListener: (type, fn) => {
        if (elListeners[type]) {
          elListeners[type] = elListeners[type].filter((f) => f !== fn);
        }
      },
      dispatchEvent: (type, event = {}) => {
        const evt = { target: el, ...event };
        if (elListeners[type]) {
          elListeners[type].forEach((fn) => fn(evt));
        }
        return evt;
      },
      getBoundingClientRect: () => ({
        left: 20,
        top: 20,
        right: 120,
        bottom: 120,
        width: 100,
        height: 100,
      }),
    };
    if (parent && Array.isArray(parent.children)) {
      parent.children.push(el);
    }
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

test('OnboardingTour Backdrop Shield - Clicking #onboarding-overlay or .onboarding-svg does not dismiss tour', async () => {
  const win = createMockWindow();
  global.window = win;
  global.document = win.document;
  global.localStorage = win.localStorage;

  const { OnboardingTour, resetOnboardingStatus, getOnboardingStatus } =
    await import('../js/onboardingTour.js');

  resetOnboardingStatus();

  const tour = new OnboardingTour();
  tour.start();
  assert.equal(tour.active, true);

  const overlay = win.document.getElementById('onboarding-overlay');
  const svg = overlay.querySelector('.onboarding-svg');
  const closeBtn = overlay.querySelector('.spotlight-close');
  const skipBtn = overlay.querySelector('.spotlight-btn-skip');

  let overlayDefaultPrevented = false;
  let overlayPropagationStopped = false;
  overlay.dispatchEvent('click', {
    target: overlay,
    preventDefault: () => {
      overlayDefaultPrevented = true;
    },
    stopPropagation: () => {
      overlayPropagationStopped = true;
    },
  });

  assert.equal(overlayDefaultPrevented, true, '#onboarding-overlay click calls preventDefault');
  assert.equal(overlayPropagationStopped, true, '#onboarding-overlay click calls stopPropagation');
  assert.equal(tour.active, true, 'Tour remains active after clicking #onboarding-overlay');
  assert.equal(tour.currentIndex, 0, 'Current step remains unchanged');
  assert.equal(getOnboardingStatus(), null, 'Onboarding status is not persisted on backdrop click');

  let svgDefaultPrevented = false;
  let svgPropagationStopped = false;
  svg.dispatchEvent('click', {
    target: svg,
    preventDefault: () => {
      svgDefaultPrevented = true;
    },
    stopPropagation: () => {
      svgPropagationStopped = true;
    },
  });

  assert.equal(svgDefaultPrevented, true, '.onboarding-svg click calls preventDefault');
  assert.equal(svgPropagationStopped, true, '.onboarding-svg click calls stopPropagation');
  assert.equal(tour.active, true, 'Tour remains active after clicking .onboarding-svg');
  assert.equal(getOnboardingStatus(), null, 'Onboarding status remains unset');

  // Explicit Skip button click dismisses tour
  skipBtn.dispatchEvent('click', { target: skipBtn });
  assert.equal(tour.active, false, 'Tour ends when clicking explicit Skip button');
  assert.equal(getOnboardingStatus(), 'skipped');

  // Restart and verify explicit Close (✕) button click dismisses tour
  resetOnboardingStatus();
  tour.start();
  const restartedCloseBtn = win.document
    .getElementById('onboarding-overlay')
    .querySelector('.spotlight-close');
  assert.ok(closeBtn && restartedCloseBtn);
  restartedCloseBtn.dispatchEvent('click', { target: restartedCloseBtn });
  assert.equal(tour.active, false, 'Tour ends when clicking explicit Close button');
  assert.equal(getOnboardingStatus(), 'skipped');
});

test('overlays.css defines .onboarding-overlay backdrop shield rules', () => {
  const overlaysCssPath = path.resolve(webRoot, 'css/overlays.css');
  const cssContent = fs.readFileSync(overlaysCssPath, 'utf8');

  const overlayBlockMatch = cssContent.match(/\.onboarding-overlay\s*\{([^}]+)\}/);
  assert.ok(overlayBlockMatch, '.onboarding-overlay rule must exist in overlays.css');

  const rules = overlayBlockMatch[1];
  assert.match(rules, /position:\s*fixed;/, '.onboarding-overlay sets position: fixed');
  assert.match(rules, /inset:\s*0;/, '.onboarding-overlay sets inset: 0');
  assert.match(rules, /z-index:\s*1000;/, '.onboarding-overlay sets z-index: 1000');
  assert.match(rules, /pointer-events:\s*auto;/, '.onboarding-overlay sets pointer-events: auto');
});
