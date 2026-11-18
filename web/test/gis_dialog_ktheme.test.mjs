import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../index.html');
const appJsPath = path.join(__dirname, '../js/app.js');

if (typeof customElements === 'undefined') {
  const registry = new Map();
  globalThis.customElements = {
    define: (name, constructor) => registry.set(name, constructor),
    get: (name) => registry.get(name),
  };
}

const kComponents = await import('../js/k-components.js');
const KButton = kComponents.KButton ?? customElements.get('k-button');
const KSelect = kComponents.KSelect ?? customElements.get('k-select');

function extractDialogMarkup(html, id) {
  const re = new RegExp(`<dialog\\s+id="${id}"[^>]*>[\\s\\S]*?<\\/dialog>`);
  const match = html.match(re);
  assert.ok(match, `<dialog id="${id}"> must exist in index.html`);
  return match[0];
}

test('#dlg-gis replaces raw HTML <select> and <button> controls with <k-select> and <k-button>', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dlgGis = extractDialogMarkup(html, 'dlg-gis');

  // Must contain zero raw <select> or <button> tags inside #dlg-gis
  assert.ok(!/<select[\s>]/.test(dlgGis), '#dlg-gis must not contain raw <select> elements');
  assert.ok(!/<button[\s>]/.test(dlgGis), '#dlg-gis must not contain raw <button> elements');

  // Verify <k-select> elements and labels
  assert.match(
    dlgGis,
    /<label for="gis-crs">Coordinate Reference System<\/label>\s*<k-select id="gis-crs">/,
    '#gis-crs must be a <k-select> paired with its label'
  );
  assert.match(dlgGis, /<option value="EPSG:4326">/, '#gis-crs retains EPSG:4326 option');
  assert.match(dlgGis, /<option value="EPSG:3857">/, '#gis-crs retains EPSG:3857 option');
  assert.match(dlgGis, /<option value="EPSG:32610">/, '#gis-crs retains EPSG:32610 option');

  assert.match(
    dlgGis,
    /<label for="gis-map-preset">Geospatial Map Preset<\/label>\s*<k-select id="gis-map-preset">/,
    '#gis-map-preset must be a <k-select> paired with its label'
  );
  assert.match(
    dlgGis,
    /<option value="openstreetmap">OpenStreetMap<\/option>/,
    '#gis-map-preset retains OpenStreetMap option'
  );
  assert.match(
    dlgGis,
    /<option value="carto-positron">CARTO Positron<\/option>/,
    '#gis-map-preset retains CARTO Positron option'
  );
  assert.match(
    dlgGis,
    /<option value="usgs-topo">USGS Topo<\/option>/,
    '#gis-map-preset retains USGS Topo option'
  );
  assert.match(
    dlgGis,
    /<option value="copernicus-sentinel">Copernicus Sentinel<\/option>/,
    '#gis-map-preset retains Copernicus Sentinel option'
  );

  // Verify <k-button> elements and primary attributes
  assert.match(
    dlgGis,
    /<k-button[^>]*\bid="gis-close"[^>]*\baria-label="Close GIS modal"[^>]*>✕<\/k-button>/,
    '#gis-close uses <k-button> with accessible label'
  );
  assert.match(
    dlgGis,
    /<k-button[^>]*\bid="gis-load-sample"[^>]*\bprimary\b[^>]*>Load Sample Municipal Lot<\/k-button>/,
    '#gis-load-sample uses <k-button primary>'
  );
  assert.match(
    dlgGis,
    /<k-button[^>]*\bid="gis-import-file"[^>]*>Upload GeoJSON File<\/k-button>/,
    '#gis-import-file uses <k-button>'
  );
  assert.ok(
    !/<k-button[^>]*\bid="gis-import-file"[^>]*\bprimary\b/.test(dlgGis),
    '#gis-import-file should not have primary attribute'
  );
  assert.match(
    dlgGis,
    /<k-button[^>]*\bid="gis-done"[^>]*\bprimary\b[^>]*>Done<\/k-button>/,
    '#gis-done uses <k-button primary>'
  );
});

test('KSelect clones light DOM <option> children on connect, syncs value property/attribute, and emits composed change events', () => {
  const attrs = new Map();
  const dispatchedEvents = [];
  const innerListeners = new Map();

  const innerSelect = {
    value: 'EPSG:4326',
    disabled: false,
    options: [],
    innerHTML: '',
    appendChild(opt) {
      this.options.push(opt);
      if (this.options.length === 1) {
        this.value = opt.value;
      }
    },
    setAttribute() {},
    removeAttribute() {},
    addEventListener(type, fn) {
      innerListeners.set(type, fn);
    },
    focus() {
      this.focused = true;
    },
  };

  Object.defineProperty(innerSelect, 'innerHTML', {
    get() {
      return '';
    },
    set(val) {
      if (val === '') {
        this.options = [];
      }
    },
  });

  const lightOptions = [
    { value: 'EPSG:4326', cloneNode: () => ({ value: 'EPSG:4326' }) },
    { value: 'EPSG:3857', cloneNode: () => ({ value: 'EPSG:3857' }) },
    { value: 'EPSG:32610', cloneNode: () => ({ value: 'EPSG:32610' }) },
  ];

  const origAttachShadow = KSelect.prototype.attachShadow;
  const origSetAttr = KSelect.prototype.setAttribute;
  const origGetAttr = KSelect.prototype.getAttribute;
  const origHasAttr = KSelect.prototype.hasAttribute;
  const origRemoveAttr = KSelect.prototype.removeAttribute;
  const origQueryAll = KSelect.prototype.querySelectorAll;
  const origDispatch = KSelect.prototype.dispatchEvent;

  try {
    KSelect.prototype.attachShadow = function () {
      this.shadowRoot = {
        innerHTML: '',
        querySelector: (sel) => (sel === 'select' ? innerSelect : { addEventListener() {} }),
      };
      return this.shadowRoot;
    };
    KSelect.prototype.setAttribute = function (k, v) {
      const oldVal = attrs.get(k) ?? null;
      attrs.set(k, String(v));
      this.attributeChangedCallback(k, oldVal, String(v));
    };
    KSelect.prototype.getAttribute = function (k) {
      return attrs.has(k) ? attrs.get(k) : null;
    };
    KSelect.prototype.hasAttribute = function (k) {
      return attrs.has(k);
    };
    KSelect.prototype.removeAttribute = function (k) {
      attrs.delete(k);
    };
    KSelect.prototype.querySelectorAll = function (sel) {
      return sel === 'option' ? lightOptions : [];
    };
    KSelect.prototype.dispatchEvent = function (evt) {
      Object.defineProperty(evt, 'target', { value: this, configurable: true });
      dispatchedEvents.push(evt);
      return true;
    };

    const kSelect = new KSelect();
    kSelect.connectedCallback();

    // Options cloned into shadow select
    assert.equal(innerSelect.options.length, 3, 'All 3 light DOM options cloned to shadow select');
    assert.equal(kSelect.value, 'EPSG:4326', 'Default value matches first option');

    // Programmatic property setter syncs attribute and inner select
    kSelect.value = 'EPSG:3857';
    assert.equal(attrs.get('value'), 'EPSG:3857', 'value attribute updated via setter');
    assert.equal(innerSelect.value, 'EPSG:3857', 'Shadow select value updated via setter');
    assert.equal(kSelect.value, 'EPSG:3857', 'Getter returns updated value');

    // User change on shadow select emits composed CustomEvent with updated target.value and detail.value
    innerSelect.value = 'EPSG:32610';
    innerListeners.get('change')();
    assert.equal(dispatchedEvents.length, 1);
    const changeEvt = dispatchedEvents[0];
    assert.equal(changeEvt.type, 'change');
    assert.equal(changeEvt.bubbles, true);
    assert.equal(changeEvt.composed, true);
    assert.equal(changeEvt.detail.value, 'EPSG:32610');
    assert.equal(changeEvt.target.value, 'EPSG:32610');
  } finally {
    KSelect.prototype.attachShadow = origAttachShadow;
    KSelect.prototype.setAttribute = origSetAttr;
    KSelect.prototype.getAttribute = origGetAttr;
    KSelect.prototype.hasAttribute = origHasAttr;
    KSelect.prototype.removeAttribute = origRemoveAttr;
    KSelect.prototype.querySelectorAll = origQueryAll;
    KSelect.prototype.dispatchEvent = origDispatch;
  }
});

test('KButton reflects primary attribute and delegates click() to shadow button', () => {
  const attrs = new Map([['primary', '']]);
  let innerClicked = 0;
  const toggledClasses = new Map();
  const innerBtn = {
    disabled: false,
    classList: {
      toggle(cls, force) {
        toggledClasses.set(cls, Boolean(force));
      },
    },
    removeAttribute() {},
    click() {
      innerClicked++;
    },
  };

  const origAttachShadow = KButton.prototype.attachShadow;
  const origHasAttr = KButton.prototype.hasAttribute;
  const origGetAttr = KButton.prototype.getAttribute;
  const origClassList = Object.getOwnPropertyDescriptor(KButton.prototype, 'classList');

  try {
    KButton.prototype.attachShadow = function () {
      this.shadowRoot = {
        innerHTML: '',
        querySelector: () => innerBtn,
      };
      return this.shadowRoot;
    };
    KButton.prototype.hasAttribute = function (k) {
      return attrs.has(k);
    };
    KButton.prototype.getAttribute = function (k) {
      return attrs.get(k) ?? null;
    };
    Object.defineProperty(KButton.prototype, 'classList', {
      configurable: true,
      get: () => ({ contains: () => false }),
    });

    const btn = new KButton();
    btn.connectedCallback();

    assert.equal(btn.primary, true, 'KButton reflects primary attribute');
    assert.equal(toggledClasses.get('primary'), true, 'Inner button receives .primary class');

    btn.click();
    assert.equal(innerClicked, 1, 'KButton.click() delegates to shadow button');
  } finally {
    KButton.prototype.attachShadow = origAttachShadow;
    KButton.prototype.hasAttribute = origHasAttr;
    KButton.prototype.getAttribute = origGetAttr;
    if (origClassList) Object.defineProperty(KButton.prototype, 'classList', origClassList);
    else delete KButton.prototype.classList;
  }
});

test('app.js synchronizes #gis-map-preset and #gis-crs <k-select> values and handles change events', () => {
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Verify openGISDialog syncs #gis-map-preset with doc.background?.presetKey || ''
  const openFnMatch = appJs.match(/^(?:export\s+)?function openGISDialog\(\)\s*\{([\s\S]*?)\n\}/m);
  assert.ok(openFnMatch, 'openGISDialog found in app.js');
  assert.match(
    openFnMatch[1],
    /gisMapSelect\.value\s*=\s*doc\.background\?\.presetKey\s*\|\|\s*''/,
    'openGISDialog sets #gis-map-preset value from doc.background.presetKey'
  );
  assert.match(
    openFnMatch[1],
    /gisCrsSelect\.value\s*=\s*doc\.site\.crs/,
    'openGISDialog syncs #gis-crs value when doc.site.crs is set'
  );

  // Verify renderBgToolbar syncs #gis-map-preset value setter
  const bgFnMatch = appJs.match(/function renderBgToolbar\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(bgFnMatch, 'renderBgToolbar found in app.js');
  assert.match(
    bgFnMatch[1],
    /gisMapSelect\.value\s*=\s*bg\.presetKey\s*\|\|\s*''/,
    'renderBgToolbar syncs active presetKey to #gis-map-preset'
  );
  assert.match(
    bgFnMatch[1],
    /gisMapSelect\.value\s*=\s*''/,
    'renderBgToolbar clears #gis-map-preset when background is absent'
  );

  // Verify #gis-crs and #gis-map-preset change handlers support CustomEvent detail and target.value
  assert.match(
    appJs,
    /\$\('#gis-crs'\)\?\.addEventListener\('change',\s*\(e\)\s*=>\s*\{[\s\S]*?e\.detail\?\.value\s*\?\?\s*e\.target\?\.value/,
    '#gis-crs change handler reads CustomEvent detail.value or target.value'
  );
  assert.match(
    appJs,
    /\$\('#gis-map-preset'\)\?\.addEventListener\('change',\s*\(e\)\s*=>\s*\{[\s\S]*?e\.detail\?\.value\s*\?\?\s*e\.target\?\.value/,
    '#gis-map-preset change handler reads CustomEvent detail.value or target.value'
  );
});
