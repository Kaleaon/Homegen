import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { commit } from '../js/codes.js';
import { draw } from '../js/render.js';
import { resolvePDFAttributionAndLicensing, generatePDF } from '../js/pdfEngine.js';

// Setup headless WebGL, ResizeObserver, and DOM mocks for Node test environment
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = () => 1;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const baseGlCtx = {
  canvas: { width: 800, height: 600 },
  getParameter: () => 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
  getExtension: () => null,
  getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
  checkFramebufferStatus: () => 36053,
  createFramebuffer: () => ({ id: Math.random() }),
  createRenderbuffer: () => ({ id: Math.random() }),
  createTexture: () => ({ id: Math.random() }),
  createBuffer: () => ({ id: Math.random() }),
  createProgram: () => ({ id: Math.random() }),
  createShader: () => ({ id: Math.random() }),
  createVertexArray: () => ({ id: Math.random() }),
  TRIANGLES: 4,
};

const mockGlCtx = new Proxy(baseGlCtx, {
  get(target, prop) {
    if (prop in target) return target[prop];
    return () => {};
  },
});

const mock2d = {
  fillRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  arc: () => {},
  fill: () => {},
  scale: () => {},
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  drawImage: () => {},
  translate: () => {},
  rotate: () => {},
  clip: () => {},
  strokeRect: () => {},
  measureText: (txt) => ({ width: txt.length * 7 }),
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createPattern: () => ({}),
  setLineDash: () => {},
};

const mockDoc = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({
    width: 256,
    height: 256,
    getContext: () => mock2d,
    style: {},
  }),
};

global.document = mockDoc;

test('Background metadata structures support attributionText, provider, licenseUrl, logoUrl, and isGeospatial', () => {
  const state = M.newState();
  state.rooms = [
    {
      id: 1,
      name: 'Room 1',
      type: 'living',
      x: 0,
      y: 0,
      w: 120,
      h: 120,
      level: 0,
      items: [],
      openings: [],
      walls: {},
    },
  ];
  state.background = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 0,
    y: 0,
    scale: 1,
    opacity: 0.5,
    visible: true,
    locked: false,
    width: 100,
    height: 100,
    attributionText: '© OpenStreetMap contributors',
    provider: 'OpenStreetMap',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    logoUrl: 'https://example.com/logo.png',
    isGeospatial: true,
  };

  const serialized = M.serialize(state);
  const deserialized = M.deserialize(serialized);

  assert.ok(deserialized.background, 'Background object should exist after deserialization');
  assert.equal(deserialized.background.attributionText, '© OpenStreetMap contributors');
  assert.equal(deserialized.background.provider, 'OpenStreetMap');
  assert.equal(deserialized.background.licenseUrl, 'https://www.openstreetmap.org/copyright');
  assert.equal(deserialized.background.logoUrl, 'https://example.com/logo.png');
  assert.equal(deserialized.background.isGeospatial, true);
});

test('2D Canvas drawBackground renders attribution badge when background metadata is active', () => {
  const mockCanvas = {
    width: 800,
    height: 600,
    style: {},
  };

  const drawCalls = [];
  const textCalls = [];

  const baseCtx = {
    canvas: mockCanvas,
    globalAlpha: 1.0,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic',
    fillText: (txt, x, y) => {
      textCalls.push({ txt, x, y });
    },
    drawImage: (...args) => {
      drawCalls.push(args);
    },
    measureText: (txt) => ({ width: txt.length * 7 }),
    createPattern: () => ({}),
  };

  const mockCtx = new Proxy(baseCtx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return () => {};
    },
  });

  let state = M.newState();
  const res = commit(state, (n) => M.placeRoomKit(n, 'kit_living', 0, 0, 0));
  if (res.ok) state = res.state;

  state.background = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 0,
    y: 0,
    scale: 1,
    opacity: 0.5,
    visible: true,
    locked: false,
    width: 200,
    height: 200,
    attributionText: 'Map Data © USGS Topo',
    provider: 'USGS',
    licenseUrl: 'https://usgs.gov',
    isGeospatial: true,
  };

  global.Image = class {
    constructor() {
      this.complete = true;
      this.naturalWidth = 200;
      this.naturalHeight = 200;
    }
  };

  draw(mockCtx, state, { scale: 1, ox: 0, oy: 0 });

  assert.ok(drawCalls.length > 0, 'Background image drawImage should be called');
  const badgeTextCall = textCalls.find((t) => t.txt.includes('USGS'));
  assert.ok(badgeTextCall, 'Attribution text containing USGS should be rendered on 2D canvas');
  assert.ok(
    badgeTextCall.txt.includes('Map Data © USGS Topo'),
    'Badge text should match attributionText'
  );
});

test('3D Viewport HUD attribution overlay string resolves geospatial ground plane and HDRI envs', async () => {
  const { createScene3D } = await import('../js/scene3d.js');

  const canvas = {
    width: 800,
    height: 600,
    style: {},
    ownerDocument: mockDoc,
    getRootNode: () => mockDoc,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: (type) => {
      if (type === 'webgl' || type === 'webgl2') return mockGlCtx;
      return mock2d;
    },
    parentElement: {
      querySelector: () => null,
      appendChild: () => {},
      style: {},
    },
  };

  const testState = {
    rooms: [],
    background: {
      visible: true,
      attributionText: 'Imagery © Sentinel-2 Geospatial',
      provider: 'Copernicus',
      isGeospatial: true,
    },
  };

  const api = createScene3D(
    canvas,
    () => testState,
    () => 0
  );

  const attr1 = api.getAttributionText();
  assert.ok(
    attr1.includes('Imagery © Sentinel-2 Geospatial'),
    '3D attribution should include ground map metadata'
  );

  api.opts.env = 'kloofendal_48d_partly_cloudy_puresky';
  const attr2 = api.getAttributionText();
  assert.ok(attr2.includes('Poly Haven'), '3D attribution should include HDRI Sky attribution');

  api.opts.hd = true;
  const attr3 = api.getAttributionText();
  assert.ok(
    attr3.includes('HD Textures © Poly Haven'),
    '3D attribution should include HD Textures attribution'
  );
});

test('Vector PDF export resolves dataset attribution text and licensing notices in title block and footer', () => {
  let docState = M.newState();
  docState.name = 'Licensed Residence';

  const res = commit(docState, (n) => M.placeRoomKit(n, 'kit_living', 0, 0, 0));
  if (res.ok) docState = res.state;

  docState.background = {
    visible: true,
    attributionText: 'GIS Topo Data © City Planning Dept',
    provider: 'City Planning',
    licenseUrl: 'https://city.gov/license',
    isGeospatial: true,
  };

  const resolved = resolvePDFAttributionAndLicensing(docState, {
    licenseNotice: 'Approved for Permitting Use Only',
  });

  assert.ok(
    resolved.attribution.includes('GIS Topo Data © City Planning Dept'),
    'Resolved attribution should contain background attributionText'
  );
  assert.ok(
    resolved.licenseNotice.includes('Approved for Permitting Use Only'),
    'Resolved licenseNotice should contain custom notice'
  );
  assert.ok(
    resolved.fullNotice.includes('License: https://city.gov/license'),
    'Full notice should include license URL'
  );

  const pdfDoc = generatePDF(docState, {
    attributionText: 'Custom GIS Survey 2026',
    licenseNotice: 'Confidential License',
  });

  assert.ok(pdfDoc, 'PDF generator should return a valid jsPDF document instance');
  const pdfOutput = pdfDoc.output('arraybuffer');
  assert.ok(pdfOutput.byteLength > 500, 'Generated PDF should contain binary output');
});
