import test from 'node:test';
import assert from 'node:assert/strict';
import { toWebpDataUrl } from '../js/photoreal.js';
import { hordeRender, HordeError } from '../js/photoreal.js';

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
    const result = await toWebpDataUrl(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      512
    );
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
    const result = await toWebpDataUrl(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      512
    );
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
    const result = await toWebpDataUrl(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      512
    );
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

test('hordeRender retries network drops during polling up to 3 times and succeeds when network recovers', async () => {
  let checkAttempts = 0;
  const fakeFetch = async (url) => {
    const ok = (o, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => o,
    });
    if (url.endsWith('/generate/async')) {
      return ok({ id: 'job-net-retry' });
    }
    if (url.includes('/generate/check/')) {
      checkAttempts++;
      if (checkAttempts === 1 || checkAttempts === 2) {
        throw new TypeError('Failed to fetch (network drop)');
      }
      return ok({ done: true, queue_position: 0, wait_time: 0 });
    }
    if (url.includes('/generate/status/')) {
      return ok({ generations: [{ img: 'https://example.test/recovered.webp', censored: false }] });
    }
    return ok({});
  };

  const statuses = [];
  const out = await hordeRender({
    prompt: 'living room',
    depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
    fetchImpl: fakeFetch,
    pollIntervalMs: 1,
    retryDelays: [1, 2, 4],
    onStatus: (st) => statuses.push(st),
  });

  assert.equal(out.url, 'https://example.test/recovered.webp');
  assert.equal(checkAttempts, 3, 'first 2 network drops were retried, 3rd check succeeded');
  assert.ok(statuses.includes('Finishing…'));
});

test('hordeRender throws Network Error after 3 failed retries on network drop', async () => {
  let attempts = 0;
  const fakeFetch = async (url) => {
    if (url.endsWith('/generate/async')) {
      return { ok: true, status: 200, json: async () => ({ id: 'job-net-fail' }) };
    }
    if (url.includes('/generate/check/')) {
      attempts++;
      throw new TypeError('Failed to fetch (persistent network loss)');
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await assert.rejects(
    async () => {
      await hordeRender({
        prompt: 'living room',
        depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
        fetchImpl: fakeFetch,
        pollIntervalMs: 1,
        retryDelays: [1, 2, 4],
      });
    },
    (err) => {
      assert.ok(err instanceof HordeError, 'should be HordeError');
      assert.equal(err.type, 'network');
      return true;
    }
  );
  assert.equal(attempts, 4, '1 initial attempt + 3 retries = 4 total attempts');
});

test('hordeRender classifies HTTP 401/403 as Auth Error', async () => {
  const fakeFetch = async (url) => {
    if (url.endsWith('/generate/async')) {
      return { ok: false, status: 401, json: async () => ({ message: 'Invalid API Key' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await assert.rejects(
    async () => {
      await hordeRender({
        prompt: 'living room',
        depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
        apikey: 'bad-key',
        fetchImpl: fakeFetch,
      });
    },
    (err) => {
      assert.ok(err instanceof HordeError);
      assert.equal(err.type, 'auth');
      assert.equal(err.status, 401);
      assert.match(err.message, /Invalid API Key/);
      return true;
    }
  );
});

test('hordeRender classifies HTTP 429 as Rate Limit Error', async () => {
  const fakeFetch = async (url) => {
    if (url.endsWith('/generate/async')) {
      return { ok: false, status: 429, json: async () => ({ message: 'Too many requests' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await assert.rejects(
    async () => {
      await hordeRender({
        prompt: 'living room',
        depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
        fetchImpl: fakeFetch,
      });
    },
    (err) => {
      assert.ok(err instanceof HordeError);
      assert.equal(err.type, 'rate_limit');
      assert.equal(err.status, 429);
      return true;
    }
  );
});

test('hordeRender detects worker faults (c.faulted === true) and classifies as Worker Fault', async () => {
  const fakeFetch = async (url) => {
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.endsWith('/generate/async')) return ok({ id: 'job-fault' });
    if (url.includes('/generate/check/')) return ok({ done: false, faulted: true });
    return ok({});
  };

  await assert.rejects(
    async () => {
      await hordeRender({
        prompt: 'living room',
        depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
        fetchImpl: fakeFetch,
        pollIntervalMs: 1,
        retryDelays: [1, 2, 4],
      });
    },
    (err) => {
      assert.ok(err instanceof HordeError);
      assert.equal(err.type, 'fault');
      assert.match(err.message, /AI Horde job failed/);
      return true;
    }
  );
});

test('hordeRender enforces maximum duration timeout guardrail', async () => {
  const fakeFetch = async (url) => {
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.endsWith('/generate/async')) return ok({ id: 'job-timeout' });
    if (url.includes('/generate/check/')) return ok({ done: false, wait_time: 120 });
    return ok({});
  };

  await assert.rejects(
    async () => {
      await hordeRender({
        prompt: 'living room',
        depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
        fetchImpl: fakeFetch,
        pollIntervalMs: 1,
        retryDelays: [1, 2, 4],
        maxDurationMs: 10, // 10ms for fast unit test
      });
    },
    (err) => {
      assert.ok(err instanceof HordeError);
      assert.equal(err.type, 'timeout');
      assert.match(err.message, /timed out/);
      return true;
    }
  );
});

test('hordeRender abort signal cancels polling cleanly and sends delete request', async () => {
  const deletedJobs = [];
  const fakeFetch = async (url, opts = {}) => {
    if (opts.method === 'DELETE') {
      deletedJobs.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.endsWith('/generate/async')) return ok({ id: 'job-abort' });
    if (url.includes('/generate/check/')) return ok({ done: false });
    return ok({});
  };

  const ac = new AbortController();
  const renderPromise = hordeRender({
    prompt: 'living room',
    depthWebp: { url: 'data:image/webp;base64,QUJD', size: [576, 448] },
    signal: ac.signal,
    fetchImpl: fakeFetch,
    pollIntervalMs: 50,
  });

  // Abort after 10ms
  setTimeout(() => ac.abort(), 10);

  await assert.rejects(renderPromise, (err) => {
    assert.equal(err.name, 'AbortError');
    return true;
  });

  assert.ok(
    deletedJobs.some((u) => u.includes('/generate/status/job-abort')),
    'sent DELETE request to cancel job on Horde'
  );
});
