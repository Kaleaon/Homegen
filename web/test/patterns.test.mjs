import test from 'node:test';
import assert from 'node:assert/strict';
import { tileCanvasFor, patternFor, clearPatternCache } from '../js/patterns.js';

function createMockCanvasEnv() {
  let createdCount = 0;
  const createdCanvases = [];

  const create2DContext = () => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    ellipse: () => {},
    bezierCurveTo: () => {},
    fill: () => {},
    stroke: () => {},
    drawImage: () => {},
  });

  const mockDocument = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      createdCount += 1;
      const ctx2d = create2DContext();
      const canvas = {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return ctx2d;
        },
      };
      createdCanvases.push(canvas);
      return canvas;
    },
  };

  class MockDOMMatrix {
    constructor() {
      this.scaleFactor = 1;
    }
    scale(s) {
      this.scaleFactor = s;
      return this;
    }
  }

  return {
    mockDocument,
    MockDOMMatrix,
    getCreatedCount: () => createdCount,
    createdCanvases,
  };
}

test('patternFor delegates tile canvas retrieval and caching to tileCanvasFor', (t) => {
  const prevDoc = globalThis.document;
  const prevMatrix = globalThis.DOMMatrix;
  const env = createMockCanvasEnv();
  globalThis.document = env.mockDocument;
  globalThis.DOMMatrix = env.MockDOMMatrix;
  clearPatternCache();

  t.after(() => {
    clearPatternCache();
    globalThis.document = prevDoc;
    globalThis.DOMMatrix = prevMatrix;
  });

  const finish = { id: 'wall_stripes_test', c1: '#ffffff', c2: '#cccccc', pattern: 'stripes' };
  const tile = tileCanvasFor(finish);
  assert.equal(tile.width, 96);
  assert.equal(tile.height, 96);
  assert.equal(env.getCreatedCount(), 1);

  let patternArgs = null;
  let transformArg = null;
  const mockCtx = {
    createPattern(img, repetition) {
      patternArgs = [img, repetition];
      return {
        setTransform(matrix) {
          transformArg = matrix;
        },
      };
    },
  };

  const pat = patternFor(mockCtx, finish);
  assert.equal(
    env.getCreatedCount(),
    1,
    'patternFor should reuse cached tile canvas from tileCanvasFor'
  );
  assert.deepEqual(patternArgs, [tile, 'repeat']);
  assert.ok(transformArg instanceof env.MockDOMMatrix);
  assert.equal(transformArg.scaleFactor, 24 / 96);
  assert.equal(typeof pat.setTransform, 'function');
});

test('tileCanvasFor reuses canvas created via patternFor and respects clearPatternCache', (t) => {
  const prevDoc = globalThis.document;
  const prevMatrix = globalThis.DOMMatrix;
  const env = createMockCanvasEnv();
  globalThis.document = env.mockDocument;
  globalThis.DOMMatrix = env.MockDOMMatrix;
  clearPatternCache();

  t.after(() => {
    clearPatternCache();
    globalThis.document = prevDoc;
    globalThis.DOMMatrix = prevMatrix;
  });

  const finishA = { id: 'floor_checker_test', c1: '#eeeeee', c2: '#333333', pattern: 'checker' };
  const finishB = { id: 'floor_tile_test', c1: '#fafafa', c2: '#bbbbbb', pattern: 'tile' };

  const patternCtx = {
    createPattern: (img, repetition) => ({ img, repetition }),
  };

  const patA = patternFor(patternCtx, finishA);
  assert.equal(env.getCreatedCount(), 1);
  const tileA = tileCanvasFor(finishA);
  assert.equal(env.getCreatedCount(), 1);
  assert.equal(patA.img, tileA);
  assert.equal(patA.repetition, 'repeat');

  const tileB = tileCanvasFor(finishB);
  assert.equal(env.getCreatedCount(), 2);

  clearPatternCache(finishA.id);
  const tileA2 = tileCanvasFor(finishA);
  assert.notEqual(tileA2, tileA);
  assert.equal(env.getCreatedCount(), 3);
  assert.equal(tileCanvasFor(finishB), tileB, 'Unrelated finish remains cached');

  clearPatternCache();
  assert.notEqual(tileCanvasFor(finishB), tileB);
  assert.equal(env.getCreatedCount(), 4);
});
