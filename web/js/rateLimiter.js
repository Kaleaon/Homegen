/**
 * Token Bucket Rate Limiter with request queueing and concurrency controls.
 */
export class RateLimiter {
  /**
   * @param {Object} [options]
   * @param {number} [options.capacity=10] Maximum tokens the bucket can hold.
   * @param {number} [options.refillRate=5] Tokens added per second.
   * @param {number} [options.maxConcurrency=4] Maximum simultaneous active requests.
   * @param {Function} [options.fetchImpl] Fetch function implementation.
   */
  constructor(options = {}) {
    this.capacity = options.capacity ?? 10;
    this.refillRate = options.refillRate ?? 5; // tokens / second
    this.maxConcurrency = options.maxConcurrency ?? 4;
    this.fetchImpl = options.fetchImpl;

    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.activeCount = 0;
    this.queue = [];
    this.timer = null;
  }

  _refillTokens() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate);
      this.lastRefill = now;
    }
  }

  _scheduleRefill() {
    if (this.timer || this.queue.length === 0) return;
    if (this.tokens >= 1) {
      this._processQueue();
      return;
    }
    const missingTokens = 1 - this.tokens;
    const waitMs = Math.ceil((missingTokens / this.refillRate) * 1000);
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this._processQueue();
      },
      Math.max(0, waitMs)
    );
  }

  _processQueue() {
    this._refillTokens();

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrency && this.tokens >= 1) {
      const item = this.queue.shift();

      if (item.signal?.aborted) {
        if (item.abortHandler) {
          item.signal.removeEventListener('abort', item.abortHandler);
          item.abortHandler = null;
        }
        item.reject(item.signal.reason || new DOMException('Aborted', 'AbortError'));
        continue;
      }

      // Clean up queue abort listener once request is active
      if (item.signal && item.abortHandler) {
        item.signal.removeEventListener('abort', item.abortHandler);
        item.abortHandler = null;
      }

      this.tokens -= 1;
      this.activeCount += 1;

      const fetchFn = item.fetchImpl || this.fetchImpl || globalThis.fetch;
      const { fetchImpl: _ignored, ...requestOptions } = item.options || {};

      (async () => {
        try {
          const res = await fetchFn(item.url, requestOptions);
          item.resolve(res);
        } catch (err) {
          item.reject(err);
        } finally {
          this.activeCount -= 1;
          this._processQueue();
        }
      })();
    }

    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency && this.tokens < 1) {
      this._scheduleRefill();
    }
  }

  /**
   * Enqueues and executes a rate-limited fetch request.
   * @param {string|URL|Request} url
   * @param {Object} [options]
   * @returns {Promise<Response>}
   */
  fetch(url, options = {}) {
    const signal = options?.signal;
    const fetchImpl = options?.fetchImpl;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      }

      const item = {
        url,
        options,
        signal,
        fetchImpl,
        resolve,
        reject,
        abortHandler: null,
      };

      if (signal) {
        item.abortHandler = () => {
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(signal.reason || new DOMException('Aborted', 'AbortError'));
          }
        };
        signal.addEventListener('abort', item.abortHandler, { once: true });
      }

      this.queue.push(item);
      this._processQueue();
    });
  }

  /**
   * Resets/clears pending queue and timers (useful for teardown and tests).
   */
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const item of this.queue) {
      if (item.signal && item.abortHandler) {
        item.signal.removeEventListener('abort', item.abortHandler);
      }
      item.reject(new DOMException('Aborted', 'AbortError'));
    }
    this.queue = [];
    this.activeCount = 0;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

export const defaultRateLimiter = new RateLimiter({
  capacity: 30,
  refillRate: 30,
  maxConcurrency: 6,
});

export function rateLimitedFetch(url, options = {}) {
  return defaultRateLimiter.fetch(url, options);
}
