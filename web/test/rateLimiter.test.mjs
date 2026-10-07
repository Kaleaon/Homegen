import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, rateLimitedFetch, defaultRateLimiter } from '../js/rateLimiter.js';

test('RateLimiter initializes with default parameters', () => {
  const limiter = new RateLimiter();
  assert.equal(limiter.capacity, 10);
  assert.equal(limiter.refillRate, 5);
  assert.equal(limiter.maxConcurrency, 4);
  assert.equal(limiter.activeCount, 0);
  assert.equal(limiter.queue.length, 0);
  limiter.clear();
});

test('RateLimiter enforces maxConcurrency cap on simultaneous requests', async () => {
  let activeInFetch = 0;
  let maxObservedActive = 0;

  const mockFetch = async () => {
    activeInFetch++;
    maxObservedActive = Math.max(maxObservedActive, activeInFetch);
    await new Promise((r) => setTimeout(r, 20));
    activeInFetch--;
    return { ok: true, status: 200 };
  };

  const limiter = new RateLimiter({
    capacity: 10,
    refillRate: 10,
    maxConcurrency: 2,
    fetchImpl: mockFetch,
  });

  const promises = Array.from({ length: 6 }, (_, i) => limiter.fetch(`https://example.test/${i}`));
  await Promise.all(promises);

  assert.equal(maxObservedActive, 2, 'max concurrent active requests did not exceed cap of 2');
  limiter.clear();
});

test('RateLimiter processes queued requests in FIFO order', async () => {
  const executedOrder = [];

  const mockFetch = async (url) => {
    executedOrder.push(url);
    return { ok: true };
  };

  const limiter = new RateLimiter({
    capacity: 10,
    refillRate: 10,
    maxConcurrency: 1,
    fetchImpl: mockFetch,
  });

  const urls = ['/req1', '/req2', '/req3', '/req4'];
  const promises = urls.map((u) => limiter.fetch(u));
  await Promise.all(promises);

  assert.deepEqual(executedOrder, urls, 'requests executed in FIFO queue order');
  limiter.clear();
});

test('RateLimiter refills tokens over time when bucket is exhausted', async () => {
  let fetchCalls = 0;
  const mockFetch = async () => {
    fetchCalls++;
    return { ok: true };
  };

  const limiter = new RateLimiter({
    capacity: 2,
    refillRate: 20, // 20 tokens/sec = 1 token per 50ms
    maxConcurrency: 5,
    fetchImpl: mockFetch,
  });

  // Burst 2 tokens immediately
  const p1 = limiter.fetch('/1');
  const p2 = limiter.fetch('/2');
  assert.equal(limiter.tokens, 0, 'tokens should be exhausted after 2 requests');

  // 3rd request should wait for token refill
  const p3 = limiter.fetch('/3');

  await Promise.all([p1, p2, p3]);
  assert.equal(fetchCalls, 3);
  limiter.clear();
});

test('AbortSignal immediately removes queued requests from rate limiter queue', async () => {
  const mockFetch = async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { ok: true };
  };

  const limiter = new RateLimiter({
    capacity: 10,
    refillRate: 10,
    maxConcurrency: 1, // Only 1 active request at a time
    fetchImpl: mockFetch,
  });

  const ac = new AbortController();

  // Active request occupying the concurrency slot
  const pActive = limiter.fetch('/active');

  // Queued request with signal
  const pQueued = limiter.fetch('/queued', { signal: ac.signal });

  assert.equal(limiter.queue.length, 1, 'request is in queue before abort');

  // Abort while queued
  ac.abort();

  assert.equal(limiter.queue.length, 0, 'aborted request immediately removed from queue');

  await assert.rejects(pQueued, (err) => {
    assert.equal(err.name, 'AbortError');
    return true;
  });

  await pActive;
  limiter.clear();
});

test('Network error releases active concurrency slot and allows queued requests to proceed', async () => {
  let callCount = 0;
  const mockFetch = async (url) => {
    callCount++;
    if (url === '/fail') {
      throw new TypeError('Network connection reset');
    }
    return { ok: true };
  };

  const limiter = new RateLimiter({
    capacity: 10,
    refillRate: 10,
    maxConcurrency: 1,
    fetchImpl: mockFetch,
  });

  const pFail = limiter.fetch('/fail');
  const pSuccess = limiter.fetch('/success');

  await assert.rejects(pFail, (err) => {
    assert.equal(err.message, 'Network connection reset');
    return true;
  });

  const resSuccess = await pSuccess;
  assert.equal(resSuccess.ok, true);
  assert.equal(callCount, 2, 'both requests were attempted in sequence despite first failure');
  limiter.clear();
});

test('rateLimitedFetch wraps defaultRateLimiter fetch call', async () => {
  const origFetch = defaultRateLimiter.fetchImpl;
  try {
    let called = false;
    defaultRateLimiter.fetchImpl = async (url) => {
      called = true;
      return { ok: true, url };
    };

    const res = await rateLimitedFetch('https://example.test/api');
    assert.equal(called, true);
    assert.equal(res.url, 'https://example.test/api');
  } finally {
    defaultRateLimiter.fetchImpl = origFetch;
    defaultRateLimiter.clear();
  }
});
