import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { generatePDF } from '../js/pdfEngine.js';

test('model initializes branding schema in newState', () => {
  const doc = M.newState();
  assert.ok(doc.settings, 'doc.settings must exist');
  assert.ok(doc.settings.branding, 'doc.settings.branding must exist');
  assert.equal(doc.settings.branding.logoDataUrl, null);
  assert.equal(doc.settings.branding.stamp.titleText, 'APPROVED');
  assert.equal(doc.settings.branding.stamp.shape, 'circle');
});

test('deserialize cleanly handles legacy plans without branding settings', () => {
  const legacyJson = JSON.stringify({
    version: 1,
    name: 'Legacy Home',
    rooms: [
      {
        id: 'r1',
        type: 'living',
        name: 'Living Room',
        x: 0,
        y: 0,
        w: 120,
        h: 120,
        level: 0,
        openings: [],
        items: [],
      },
    ],
  });

  const doc = M.deserialize(legacyJson);
  assert.ok(doc.settings, 'settings must be attached');
  assert.ok(doc.settings.branding, 'default branding must be attached');
  assert.equal(doc.settings.branding.stamp.titleText, 'APPROVED');
});

test('serialize and deserialize persist custom logo, stamp, and watermark settings', () => {
  const doc = M.newState();
  const sampleLogo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  doc.settings.branding = {
    logoDataUrl: sampleLogo,
    stamp: {
      shape: 'double-rectangle',
      titleText: 'PERMIT APPROVED',
      subtitleText: 'CITY PLANNING DEPT',
      licenseText: 'LIC #998877',
      dateText: '2026-10-05',
      borderColor: '#008000',
      borderStyle: 'double',
      textColor: '#008000',
      opacity: 0.85,
      enabled: true,
    },
    watermark: {
      text: 'FOR REVIEW ONLY',
      color: '#ff0000',
      opacity: 0.15,
      fontSize: 30,
      angle: -45,
      enabled: true,
    },
  };

  const serialized = M.serialize(doc);
  const reloaded = M.deserialize(serialized);

  assert.equal(reloaded.settings.branding.logoDataUrl, sampleLogo);
  assert.equal(reloaded.settings.branding.stamp.titleText, 'PERMIT APPROVED');
  assert.equal(reloaded.settings.branding.stamp.shape, 'double-rectangle');
  assert.equal(reloaded.settings.branding.watermark.text, 'FOR REVIEW ONLY');
});

test('validateLogoSize enforces 500KB asset size limit', () => {
  const smallLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
  assert.doesNotThrow(() => M.validateLogoSize(smallLogo, 500));

  // Construct fake large base64 string (> 500KB)
  const hugeData = 'A'.repeat(700000);
  const hugeLogo = `data:image/png;base64,${hugeData}`;

  assert.throws(() => M.validateLogoSize(hugeLogo, 500), /exceeds maximum allowed size of 500KB/);
});

test('generatePDF renders project branding assets without throwing', () => {
  const doc = M.newState();
  doc.rooms.push({
    id: 'r1',
    type: 'living',
    name: 'Great Room',
    x: 0,
    y: 0,
    w: 240,
    h: 180,
    ceiling: 96,
    floor: 'oak',
    walls: { N: 'drywall', E: 'drywall', S: 'drywall', W: 'drywall' },
    items: [],
    openings: [],
    level: 0,
  });

  const sampleLogo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  doc.settings.branding = {
    logoDataUrl: sampleLogo,
    stamp: {
      shape: 'circle',
      titleText: 'FINAL APPROVAL',
      subtitleText: 'BUILDING DIVISION',
      licenseText: 'REG #12345',
      borderColor: '#d32f2f',
      borderStyle: 'solid',
      textColor: '#d32f2f',
      opacity: 0.9,
      enabled: true,
    },
    watermark: {
      text: 'CONFIDENTIAL',
      color: '#888888',
      opacity: 0.25,
      fontSize: 28,
      angle: -40,
      enabled: true,
    },
  };

  const pdf = generatePDF(doc, {
    pageSize: 'Letter',
    orientation: 'landscape',
    brandingMode: 'project',
    includeLogo: true,
    includeStamp: true,
    includeWatermark: true,
  });

  assert.ok(pdf);
  const buf = pdf.output('arraybuffer');
  assert.ok(buf.byteLength > 1000);
});

test('generatePDF respects branding suppression mode (brandingMode = none)', () => {
  const doc = M.newState();
  doc.rooms.push({
    id: 'r1',
    type: 'living',
    name: 'Main Room',
    x: 0,
    y: 0,
    w: 120,
    h: 120,
    level: 0,
    openings: [],
    items: [],
  });

  const pdf = generatePDF(doc, {
    pageSize: 'Letter',
    brandingMode: 'none',
  });

  assert.ok(pdf);
  const buf = pdf.output('arraybuffer');
  assert.ok(buf.byteLength > 500);
});

test('generatePDF supports custom session branding overrides', () => {
  const doc = M.newState();
  doc.rooms.push({
    id: 'r1',
    type: 'office',
    name: 'Office',
    x: 0,
    y: 0,
    w: 140,
    h: 120,
    level: 0,
    openings: [],
    items: [],
  });

  const sessionBranding = {
    logoDataUrl: null,
    stamp: {
      shape: 'badge',
      titleText: 'TEMP STAMP',
      subtitleText: 'SESSION ONLY',
      borderColor: '#0000ff',
      textColor: '#0000ff',
      opacity: 0.8,
      enabled: true,
    },
    watermark: {
      text: 'SESSION WATERMARK',
      color: '#aaaaaa',
      opacity: 0.2,
      fontSize: 24,
      angle: -45,
      enabled: true,
    },
  };

  const pdf = generatePDF(doc, {
    pageSize: 'Letter',
    brandingMode: 'session',
    sessionBranding,
  });

  assert.ok(pdf);
  const buf = pdf.output('arraybuffer');
  assert.ok(buf.byteLength > 500);
});
