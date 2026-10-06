import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getToken,
  getPalette,
  subscribe,
  invalidateCache,
  DEFAULT_TOKENS,
} from '../js/kthemeTokens.js';

test('kthemeTokens provides getToken and getPalette APIs with fallbacks in headless environment', () => {
  invalidateCache();

  // Test getToken with standard name
  const bgToken = getToken('--ktheme-bg');
  assert.equal(bgToken, DEFAULT_TOKENS['--ktheme-bg'], 'getToken returns default --ktheme-bg');

  // Test getToken without leading dashes
  const accentToken = getToken('ktheme-accent');
  assert.equal(accentToken, DEFAULT_TOKENS['--ktheme-accent'], 'getToken normalizes name without leading dashes');

  // Test getToken with explicit fallback
  const customFallback = getToken('--custom-unknown-token', '#123456');
  assert.equal(customFallback, '#123456', 'getToken returns explicit fallback for unknown tokens');

  // Test getPalette returns full dictionary map
  const palette = getPalette();
  assert.ok(typeof palette === 'object' && palette !== null, 'getPalette returns object');
  assert.equal(palette['--ktheme-bg'], bgToken, 'getPalette includes --ktheme-bg');
  assert.ok(palette['--ktheme-accent'], 'getPalette includes --ktheme-accent');
  assert.ok(palette['--font-family-sans'], 'getPalette includes --font-family-sans');
});

test('Token lookup during canvas draw loops returns in under 0.05ms via in-memory cache', () => {
  invalidateCache();

  // Warm up cache
  getToken('--ktheme-bg');

  const iterations = 1000;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    getToken('--ktheme-bg');
  }
  const totalMs = performance.now() - start;
  const avgMsPerCall = totalMs / iterations;

  assert.ok(
    avgMsPerCall < 0.05,
    `Cached token lookup took ${avgMsPerCall.toFixed(6)}ms, which is well below the 0.05ms constraint`
  );
});

test('subscribe manager registers callback and fires on cache invalidation', () => {
  invalidateCache();

  let callCount = 0;
  let receivedPalette = null;

  const unsubscribe = subscribe((palette) => {
    callCount++;
    receivedPalette = palette;
  });

  assert.equal(callCount, 0, 'Subscriber should not be called immediately on subscription');

  invalidateCache();

  assert.equal(callCount, 1, 'Subscriber should be called on invalidateCache()');
  assert.ok(receivedPalette, 'Subscriber receives current palette object');
  assert.equal(receivedPalette['--ktheme-bg'], DEFAULT_TOKENS['--ktheme-bg']);

  unsubscribe();
  invalidateCache();

  assert.equal(callCount, 1, 'Unsubscribed callback should not fire on subsequent invalidations');
});
