import test from 'node:test';
import assert from 'node:assert/strict';
import { toWebpDataUrl } from '../js/photoreal.js';

function setupEnvironment({ useOffscreen = true, offscreenFails = false } = {}) {
  const origImage = globalThis.Image;
  const origDocument = globalThis.document;
  const origOffscreenCanvas = globalThis.OffscreenCanvas;
  const origFileReader = globalThis.FileReader;
  const origURL = globalThis.URL;

  const revokedUrls = [];
  const createdUrls = [];

  class MockImage {
    constructor() {
      this.width = 100;
      this.height = 80;
    }
    set src(val) {
      this._src = val;
      queueMicrotask(() => {
        if (this.onload) this.onload();
      });
    }
    get src() {
      return this._src;
    }
  }

  let canvasToBlobCalled = false;
  let offscreenConvertToBlobCalled = false;

  class MockOffscreenCanvas {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return { drawImage: () => {} };
    }
    async convertToBlob({ type, quality }) {
      if (offscreenFails) {
        throw new Error('OffscreenCanvas unsupported format');
      }
      offscreenConvertToBlobCalled = true;
      return new Blob(['fake-webp-data'], { type: 'image/webp' });
    }
  }

  const mockDocument = {
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (cb, mimeType, quality) => {
            canvasToBlobCalled = true;
            queueMicrotask(() => {
              cb(new Blob(['fake-webp-data-from-toblob'], { type: mimeType }));
            });
          },
        };
      }
      return {};
    },
  };

  class MockFileReader {
    readAsDataURL(blob) {
      queueMicrotask(() => {
        this.result = 'data:image/webp;base64,ZmFrZS13ZWJwLWRhdGE=';
        if (this.onloadend) this.onloadend();
      });
    }
  }

  const mockURL = {
    createObjectURL(blob) {
      const url = `blob:http://localhost/${Math.random()}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
  };

  globalThis.Image = MockImage;
  globalThis.document = mockDocument;
  if (useOffscreen) {
    globalThis.OffscreenCanvas = MockOffscreenCanvas;
  } else {
    delete globalThis.OffscreenCanvas;
  }
  globalThis.FileReader = MockFileReader;
  globalThis.URL = mockURL;

  return {
    cleanup() {
      globalThis.Image = origImage;
      globalThis.document = origDocument;
      if (origOffscreenCanvas !== undefined) {
        globalThis.OffscreenCanvas = origOffscreenCanvas;
      } else {
        delete globalThis.OffscreenCanvas;
      }
      globalThis.FileReader = origFileReader;
      globalThis.URL = origURL;
    },
    wasCanvasToBlobCalled: () => canvasToBlobCalled,
    wasOffscreenCalled: () => offscreenConvertToBlobCalled,
    createdUrls,
    revokedUrls,
  };
}

test('toWebpDataUrl encodes depth guide asynchronously using OffscreenCanvas when available', async () => {
  const env = setupEnvironment({ useOffscreen: true });
  try {
    const result = await toWebpDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 512);
    assert.match(result, /^data:image\/webp;base64,/);
    assert.equal(env.wasOffscreenCalled(), true);
    assert.equal(env.wasCanvasToBlobCalled(), false);
  } finally {
    env.cleanup();
  }
});

test('toWebpDataUrl falls back to asynchronous canvas.toBlob() when OffscreenCanvas is unavailable', async () => {
  const env = setupEnvironment({ useOffscreen: false });
  try {
    const result = await toWebpDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 512);
    assert.match(result, /^data:image\/webp;base64,/);
    assert.equal(env.wasOffscreenCalled(), false);
    assert.equal(env.wasCanvasToBlobCalled(), true);
  } finally {
    env.cleanup();
  }
});

test('toWebpDataUrl falls back to canvas.toBlob() if OffscreenCanvas.convertToBlob fails', async () => {
  const env = setupEnvironment({ useOffscreen: true, offscreenFails: true });
  try {
    const result = await toWebpDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 512);
    assert.match(result, /^data:image\/webp;base64,/);
    assert.equal(env.wasCanvasToBlobCalled(), true);
  } finally {
    env.cleanup();
  }
});

test('toWebpDataUrl revokes temporary Blob URL when given a Blob input', async () => {
  const env = setupEnvironment({ useOffscreen: true });
  try {
    const blobInput = new Blob(['png-bytes'], { type: 'image/png' });
    const result = await toWebpDataUrl(blobInput, 512);
    assert.match(result, /^data:image\/webp;base64,/);
    assert.equal(env.createdUrls.length, 1);
    assert.deepEqual(env.revokedUrls, env.createdUrls);
  } finally {
    env.cleanup();
  }
});
