import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formRow } from '../js/app.js';
import { KInput } from '../js/k-components.js';

const htmlPath = resolve('index.html');
const appJsPath = resolve('js/app.js');
const kCompPath = resolve('js/k-components.js');
const htmlContent = readFileSync(htmlPath, 'utf8');
const appJsContent = readFileSync(appJsPath, 'utf8');
const kCompContent = readFileSync(kCompPath, 'utf8');

test('formRow helper function generates row markup with explicit label for attribute and escaped text', () => {
  const result = formRow('test-id', 'Test <Label>', '<input id="test-id">');
  assert.equal(
    result,
    '<div class="row"><label for="test-id">Test &lt;Label&gt;</label><input id="test-id"></div>'
  );
});

test('index.html Photoreal modal (#photo) labels have explicit for attributes matching input/select IDs', () => {
  assert.match(htmlContent, /<label for="p-room">Room<\/label>\s*<k-select id="p-room">/);
  assert.match(htmlContent, /<label for="p-style">Style<\/label>\s*<k-select id="p-style">/);
  assert.match(htmlContent, /<label for="p-prompt">Prompt<\/label>\s*<textarea id="p-prompt"/);
  assert.match(htmlContent, /<label for="p-key">Horde key<\/label>\s*<input id="p-key"/);
});

test('index.html SVG export modal (#dlg-export) labels have explicit for attributes matching select IDs', () => {
  assert.match(htmlContent, /<label for="e-sheet">Sheet Size<\/label>\s*<select id="e-sheet">/);
  assert.match(htmlContent, /<label for="e-orient">Orientation<\/label>\s*<select id="e-orient">/);
  assert.match(htmlContent, /<label for="e-scale">Scale<\/label>\s*<select id="e-scale">/);
  assert.match(htmlContent, /<label for="e-level">Floor Level<\/label>\s*<select id="e-level">/);
});

test('index.html PDF export modal (#pdf-export) labels have explicit for attributes matching control IDs', () => {
  assert.match(htmlContent, /<label for="pdf-size">Sheet size<\/label>/);
  assert.match(htmlContent, /<label for="pdf-orientation">Orientation<\/label>/);
  assert.match(htmlContent, /<label for="pdf-scale">Architectural scale<\/label>/);
  assert.match(htmlContent, /<label for="pdf-level">Level \/ Floor<\/label>/);
  assert.match(htmlContent, /<label for="pdf-title">Project title<\/label>/);
  assert.match(htmlContent, /<label for="pdf-designer">Designer name<\/label>/);
  assert.match(htmlContent, /<label for="pdf-date">Date<\/label>/);
  assert.match(htmlContent, /<label for="pdf-subtitle">Sheet title<\/label>/);
  assert.match(htmlContent, /<label for="pdf-notes">Notes \/ Remarks<\/label>/);
  assert.match(
    htmlContent,
    /<label class="toggle" for="pdf-tb"><input type="checkbox" id="pdf-tb"/
  );
  assert.match(
    htmlContent,
    /<label class="toggle" for="pdf-scalebar"><input type="checkbox" id="pdf-scalebar"/
  );
  assert.match(
    htmlContent,
    /<label class="toggle" for="pdf-schedule"><input type="checkbox" id="pdf-schedule"/
  );
  assert.match(htmlContent, /<label for="pdf-branding-mode">Branding Source<\/label>/);
  assert.match(htmlContent, /<label for="pdf-session-stamp-title">Session Stamp Title<\/label>/);
  assert.match(htmlContent, /<label for="pdf-session-watermark">Session Watermark<\/label>/);
  assert.match(
    htmlContent,
    /<label class="toggle" for="pdf-inc-logo"><input type="checkbox" id="pdf-inc-logo"/
  );
  assert.match(
    htmlContent,
    /<label class="toggle" for="pdf-inc-stamp"><input type="checkbox" id="pdf-inc-stamp"/
  );
  assert.match(
    htmlContent,
    /<label class="toggle" for="pdf-inc-watermark"><input type="checkbox" id="pdf-inc-watermark"/
  );
});

test('index.html Custom Material modal (#dlg-custom-material) labels have explicit for attributes', () => {
  assert.match(
    htmlContent,
    /<label for="custom-mat-name">Material Name<\/label>\s*<input id="custom-mat-name"/
  );
  assert.match(
    htmlContent,
    /<label for="custom-mat-file">Texture Image<\/label>\s*<input id="custom-mat-file"/
  );
  assert.match(
    htmlContent,
    /<label for="custom-mat-density">Tile Density Preset<\/label>\s*<select id="custom-mat-density"/
  );
});

test('index.html Project Branding modal (#dlg-branding) labels have explicit for attributes', () => {
  assert.match(
    htmlContent,
    /<label class="toggle" for="stamp-enabled"><input type="checkbox" id="stamp-enabled"/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-shape">Frame shape<\/label>\s*<select id="stamp-shape">/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-title">Primary title<\/label>\s*<input id="stamp-title"/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-subtitle">Subtitle line<\/label>\s*<input id="stamp-subtitle"/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-license">License \/ ID<\/label>\s*<input id="stamp-license"/
  );
  assert.match(htmlContent, /<label for="stamp-date">Date text<\/label>\s*<input id="stamp-date"/);
  assert.match(
    htmlContent,
    /<label for="stamp-border-style">Border style<\/label>\s*<select id="stamp-border-style">/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-border-color">Border color<\/label>\s*<input id="stamp-border-color"/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-text-color">Text color<\/label>\s*<input id="stamp-text-color"/
  );
  assert.match(
    htmlContent,
    /<label for="stamp-opacity">Opacity<\/label>\s*<input id="stamp-opacity"/
  );
  assert.match(
    htmlContent,
    /<label for="logo-file">Upload Logo Image<\/label>\s*<input type="file" id="logo-file"/
  );
  assert.match(
    htmlContent,
    /<label class="toggle" for="wm-enabled"><input type="checkbox" id="wm-enabled"/
  );
  assert.match(htmlContent, /<label for="wm-text">Watermark text<\/label>\s*<input id="wm-text"/);
  assert.match(htmlContent, /<label for="wm-color">Text color<\/label>\s*<input id="wm-color"/);
  assert.match(htmlContent, /<label for="wm-opacity">Opacity<\/label>\s*<input id="wm-opacity"/);
});

test('index.html Scale Calibration modal (#calib-dlg) labels have explicit for attributes', () => {
  assert.match(
    htmlContent,
    /<label for="calib-distance">Distance<\/label>\s*<input id="calib-distance"/
  );
});

test('renderInspector in app.js uses formRow for room inputs (i-name, i-type, i-w, i-h, i-ceil) and opening style (i-otype)', () => {
  assert.match(appJsContent, /formRow\(\s*'i-name',\s*'Name'/);
  assert.match(appJsContent, /formRow\(\s*'i-type',\s*'Type'/);
  assert.match(appJsContent, /formRow\(\s*'i-w',\s*'Width \(ft\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-h',\s*'Depth \(ft\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-ceil',\s*'Ceiling \(in\)'/);
  assert.match(appJsContent, /formRow\(\s*'i-otype',\s*'Style'/);
});

test('inspector UV transform sliders and scope select in app.js use explicit ARIA labels', () => {
  assert.match(appJsContent, /<input id="i-uv-scale-u-range"[^>]*aria-label="Scale U range"/);
  assert.match(appJsContent, /<input id="i-uv-scale-u-num"[^>]*aria-label="Scale U numeric"/);
  assert.match(appJsContent, /<input id="i-uv-scale-v-range"[^>]*aria-label="Scale V range"/);
  assert.match(appJsContent, /<input id="i-uv-scale-v-num"[^>]*aria-label="Scale V numeric"/);
  assert.match(appJsContent, /<input id="i-uv-rot-range"[^>]*aria-label="Rotation range"/);
  assert.match(appJsContent, /<input id="i-uv-rot-num"[^>]*aria-label="Rotation numeric"/);
  assert.match(appJsContent, /<input id="i-uv-off-u-range"[^>]*aria-label="Offset U range"/);
  assert.match(appJsContent, /<input id="i-uv-off-u-num"[^>]*aria-label="Offset U numeric"/);
  assert.match(appJsContent, /<input id="i-uv-off-v-range"[^>]*aria-label="Offset V range"/);
  assert.match(appJsContent, /<input id="i-uv-off-v-num"[^>]*aria-label="Offset V numeric"/);
  assert.match(appJsContent, /<select id="i-uv-scope"[^>]*aria-label="UV transform scope"/);
});

test('custom texture density selects in app.js specify unique id attributes linked to matching label for tags', () => {
  assert.match(appJsContent, /const densityId = `custom-density-\${esc\(f\.id\)}`;/);
  assert.match(
    appJsContent,
    /<label for="\${densityId}"[^>]*>Tile Density:<\/label><select id="\${densityId}" class="custom-density-select"/
  );
});

test('renderPalette in app.js includes for="paint-scope" attribute on target scope label', () => {
  assert.match(
    appJsContent,
    /<label for="paint-scope"[^>]*>Target scope<\/label>\s*<select id="paint-scope"/
  );
});

test('k-input component forwards aria-label and aria-labelledby attributes to inner input element', () => {
  assert.ok(KInput.observedAttributes.includes('aria-label'));
  assert.ok(KInput.observedAttributes.includes('aria-labelledby'));
  assert.match(kCompContent, /'aria-label',\s*'aria-labelledby'/);

  const innerAttrs = new Map();
  const hostAttrs = new Map([['aria-label', 'Municipal Parcel Lot 14A setback (inches)']]);
  const instance = Object.create(KInput.prototype);
  instance._input = {
    value: '',
    disabled: false,
    readOnly: false,
    setAttribute(name, val) {
      innerAttrs.set(name, val);
    },
    removeAttribute(name) {
      innerAttrs.delete(name);
    },
  };
  instance.hasAttribute = (name) => hostAttrs.has(name);
  instance.getAttribute = (name) => hostAttrs.get(name) ?? null;

  instance.connectedCallback();
  assert.equal(innerAttrs.get('aria-label'), 'Municipal Parcel Lot 14A setback (inches)');

  hostAttrs.set('aria-label', 'seg-1 setback (inches)');
  instance.attributeChangedCallback(
    'aria-label',
    'Municipal Parcel Lot 14A setback (inches)',
    'seg-1 setback (inches)'
  );
  assert.equal(innerAttrs.get('aria-label'), 'seg-1 setback (inches)');

  hostAttrs.delete('aria-label');
  instance.attributeChangedCallback('aria-label', 'seg-1 setback (inches)', null);
  assert.equal(innerAttrs.has('aria-label'), false);
});

test('renderGISSegments generates accessible aria-label attributes with segment name or id fallback and inches unit', async () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevStorage = global.localStorage;
  const prevNavigator = global.navigator;

  const elements = {};
  const makeEl = (id = '') => {
    const attrs = new Map();
    const listeners = {};
    const el = {
      id,
      value: '',
      open: false,
      innerHTML: '',
      focused: false,
      dataset: {},
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      removeAttribute: (k) => attrs.delete(k),
      hasAttribute: (k) => attrs.has(k),
      addEventListener: (evt, fn) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(fn);
      },
      dispatchEvent: (evt) => {
        const type = typeof evt === 'string' ? evt : evt.type;
        if (listeners[type]) listeners[type].forEach((fn) => fn(evt));
      },
      focus: () => {
        el.focused = true;
      },
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      getContext: () =>
        new Proxy(
          {
            canvas: { width: 800, height: 600 },
            measureText: () => ({ width: 20 }),
          },
          {
            get(target, prop) {
              if (prop in target) return target[prop];
              return () => {};
            },
          }
        ),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return el;
  };

  const getEl = (id) => {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  };

  const storeData = new Map();
  global.localStorage = {
    getItem: (key) => storeData.get(key) ?? null,
    setItem: (key, val) => storeData.set(key, String(val)),
  };

  try {
    global.document = {
      activeElement: makeEl('body'),
      getElementById: (id) => getEl(id),
      querySelector: (s) => getEl(s.replace(/^#/, '')),
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    global.window = {
      devicePixelRatio: 1,
      addEventListener: () => {},
      location: { href: '' },
      navigator: { userAgent: 'node' },
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    };
    Object.defineProperty(global, 'navigator', {
      value: global.window.navigator,
      configurable: true,
      writable: true,
    });

    await import('../js/app.js?gis-aria-label-test=1');
    const homegen = global.window.__homegen;
    assert.ok(homegen, '__homegen test hook must be initialized');

    const container = getEl('gis-segment-list');
    homegen.loadGISSubsystem(homegen.SAMPLE_MUNICIPAL_GIS);
    // Include a segment without a label to verify fallback to seg.id
    homegen.doc.site.segments.push({
      id: 'seg-custom-5',
      p1: { x: 50, y: 50 },
      p2: { x: 150, y: 50 },
      setback: 48,
      label: '',
    });

    container.innerHTML = '';
    homegen.openGISDialog();

    const expectedLabels = homegen.doc.site.segments.map(
      (seg) => `${seg.label || seg.id} setback (inches)`
    );
    const labelMatches = [...container.innerHTML.matchAll(/<k-input\b[^>]*aria-label="([^"]+)"/g)];
    assert.equal(labelMatches.length, homegen.doc.site.segments.length);
    assert.deepEqual(
      labelMatches.map((m) => m[1]),
      expectedLabels
    );
    assert.equal(
      labelMatches[labelMatches.length - 1][1],
      'seg-custom-5 setback (inches)',
      'Segment missing label must fall back to seg.id'
    );

    // Verify re-rendering via openGISDialog retains valid aria-label attributes
    container.innerHTML = '';
    homegen.openGISDialog();
    const rerenderedMatches = [
      ...container.innerHTML.matchAll(/<k-input\b[^>]*aria-label="([^"]+)"/g),
    ];
    assert.deepEqual(
      rerenderedMatches.map((m) => m[1]),
      expectedLabels
    );

    await new Promise((resolve) => setTimeout(resolve, 250));
  } finally {
    Object.defineProperty(global, 'navigator', {
      value: prevNavigator,
      configurable: true,
      writable: true,
    });
    if (typeof prevWindow === 'undefined') {
      delete global.window;
    } else {
      global.window = prevWindow;
    }
    if (typeof prevDocument === 'undefined') {
      delete global.document;
    } else {
      global.document = prevDocument;
    }
    if (typeof prevStorage === 'undefined') {
      delete global.localStorage;
    } else {
      global.localStorage = prevStorage;
    }
  }
});

test('clicking visual label associated via for attribute transfers focus to control in mock DOM environment', () => {
  // Simulate browser DOM click on label element
  const input = {
    focused: false,
    focus() {
      this.focused = true;
    },
  };
  const label = { htmlFor: 'p-room' };
  const domMap = { 'p-room': input };

  // Click handler simulation for label for/id association behavior
  function handleLabelClick(lbl) {
    if (lbl.htmlFor && domMap[lbl.htmlFor]) {
      domMap[lbl.htmlFor].focus();
    }
  }

  handleLabelClick(label);
  assert.equal(input.focused, true);
});
