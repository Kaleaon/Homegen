const BaseEventTarget =
  typeof EventTarget !== 'undefined'
    ? EventTarget
    : class {
        constructor() {
          this._listeners = new Map();
        }
        addEventListener(type, fn) {
          if (!this._listeners.has(type)) this._listeners.set(type, new Set());
          this._listeners.get(type).add(fn);
        }
        removeEventListener(type, fn) {
          this._listeners.get(type)?.delete(fn);
        }
        dispatchEvent(evt) {
          const set = this._listeners.get(evt.type);
          if (set) {
            for (const fn of [...set]) fn(evt);
          }
          return true;
        }
      };

/**
 * Token Bucket Rate Limiter with request queueing, concurrency controls, and quota events.
 */
export class RateLimiter extends BaseEventTarget {
  /**
   * @param {Object} [options]
   * @param {number} [options.capacity=10] Maximum tokens the bucket can hold.
   * @param {number} [options.refillRate=5] Tokens added per second.
   * @param {number} [options.maxConcurrency=4] Maximum simultaneous active requests.
   * @param {Function} [options.fetchImpl] Fetch function implementation.
   */
  constructor(options = {}) {
    super();
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

  /**
   * Returns a snapshot of the current token bucket and request queue quota state.
   * @param {string} [reason='snapshot']
   */
  getQuotaState(reason = 'snapshot') {
    const capacity = Math.max(0, this.capacity);
    const remaining = Math.max(0, Math.min(capacity, Math.floor(this.tokens)));
    const queuedCount = this.queue.length;
    const activeCount = this.activeCount;
    const lowThreshold = capacity > 1 ? Math.max(1, Math.ceil(capacity * 0.2)) : 0;
    const exhausted = remaining <= 0;
    const low = !exhausted && remaining < capacity && remaining <= lowThreshold;
    const status = exhausted
      ? 'exhausted'
      : low
        ? 'low'
        : remaining >= capacity
          ? 'full'
          : 'available';

    return {
      tokens: remaining,
      remaining,
      capacity,
      activeCount,
      queuedCount,
      queueLength: queuedCount,
      refillRate: this.refillRate,
      exhausted,
      low,
      status,
      reason,
    };
  }

  /**
   * Subscribes a listener to `quota-change` events and returns an unsubscribe function.
   * @param {(detail: Object, event: Event) => void} listener
   * @returns {() => void}
   */
  onQuotaChange(listener) {
    if (typeof listener !== 'function') return () => {};
    const handler = (event) => listener(event.detail, event);
    this.addEventListener('quota-change', handler);
    return () => this.removeEventListener('quota-change', handler);
  }

  _emitQuotaChange(reason = 'update') {
    const detail = this.getQuotaState(reason);
    let evt;
    if (typeof CustomEvent === 'function') {
      evt = new CustomEvent('quota-change', { detail });
    } else if (typeof Event === 'function') {
      evt = Object.assign(new Event('quota-change'), { detail });
    } else {
      evt = { type: 'quota-change', detail };
    }
    this.dispatchEvent(evt);
  }

  _refillTokens() {
    const now = Date.now();
    if (this.tokens >= this.capacity) {
      this.tokens = this.capacity;
      this.lastRefill = now;
      return false;
    }
    const prevTokens = this.tokens;
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    const tokensToAdd = Math.floor(elapsedSeconds * this.refillRate);
    if (tokensToAdd > 0) {
      if (this.tokens + tokensToAdd >= this.capacity) {
        this.tokens = this.capacity;
        this.lastRefill = now;
      } else {
        this.tokens += tokensToAdd;
        this.lastRefill += (tokensToAdd * 1000) / this.refillRate;
      }
    }
    if (this.tokens !== prevTokens) {
      this._emitQuotaChange('refill');
      return true;
    }
    return false;
  }

  _scheduleRefill() {
    const needsQueueRefill =
      this.queue.length > 0 && this.activeCount < this.maxConcurrency && this.tokens < 1;
    const needsBucketRecovery = this.tokens < this.capacity;
    if (!needsQueueRefill && !needsBucketRecovery) return;

    if (this.timer) {
      if (needsQueueRefill && typeof this.timer.ref === 'function') {
        this.timer.ref();
      } else if (!needsQueueRefill && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
      return;
    }

    if (this.queue.length > 0 && this.activeCount < this.maxConcurrency && this.tokens >= 1) {
      this._processQueue();
      return;
    }
    const elapsedMs = Math.max(0, Date.now() - this.lastRefill);
    const msPerToken = 1000 / this.refillRate;
    const waitMs = Math.ceil(msPerToken - (elapsedMs % msPerToken));
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this._processQueue();
      },
      Math.max(1, waitMs)
    );
    if (!needsQueueRefill && typeof this.timer?.unref === 'function') {
      this.timer.unref();
    }
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
        this._emitQuotaChange('abort');
        continue;
      }

      // Clean up queue abort listener once request is active
      if (item.signal && item.abortHandler) {
        item.signal.removeEventListener('abort', item.abortHandler);
        item.abortHandler = null;
      }

      item.started = true;
      this.tokens -= 1;
      this.activeCount += 1;
      this._emitQuotaChange('consume');

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
          this._emitQuotaChange('complete');
          this._processQueue();
        }
      })();
    }

    if (
      (this.queue.length > 0 && this.activeCount < this.maxConcurrency && this.tokens < 1) ||
      this.tokens < this.capacity
    ) {
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
        started: false,
      };

      if (signal) {
        item.abortHandler = () => {
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(signal.reason || new DOMException('Aborted', 'AbortError'));
            this._emitQuotaChange('dequeue');
          }
        };
        signal.addEventListener('abort', item.abortHandler, { once: true });
      }

      this.queue.push(item);
      this._processQueue();
      if (!item.started && this.queue.includes(item)) {
        this._emitQuotaChange('enqueue');
      }
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
    const hadPendingOrConsumed =
      this.queue.length > 0 || this.activeCount > 0 || this.tokens !== this.capacity;
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
    if (hadPendingOrConsumed) {
      this._emitQuotaChange('clear');
    }
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

/**
 * Per-host rate limit profiles for geospatial providers.
 * Nominatim and Overpass are strictly capped to 1 request/second with maxConcurrency=1.
 * All geospatial token buckets are isolated from `defaultRateLimiter` so 3D asset
 * downloads (e.g. Poly Haven) cannot starve GIS queries.
 */
export const GIS_HOST_RATE_LIMITS = {
  'nominatim.openstreetmap.org': { capacity: 1, refillRate: 1, maxConcurrency: 1 },
  'overpass-api.de': { capacity: 1, refillRate: 1, maxConcurrency: 1 },
  'overpass.kumi.systems': { capacity: 1, refillRate: 1, maxConcurrency: 1 },
  'lz4.overpass-api.de': { capacity: 1, refillRate: 1, maxConcurrency: 1 },
  'z.overpass-api.de': { capacity: 1, refillRate: 1, maxConcurrency: 1 },
  'tile.openstreetmap.org': { capacity: 8, refillRate: 4, maxConcurrency: 2 },
  'basemaps.cartocdn.com': { capacity: 12, refillRate: 6, maxConcurrency: 4 },
  'a.basemaps.cartocdn.com': { capacity: 12, refillRate: 6, maxConcurrency: 4 },
  'b.basemaps.cartocdn.com': { capacity: 12, refillRate: 6, maxConcurrency: 4 },
  'c.basemaps.cartocdn.com': { capacity: 12, refillRate: 6, maxConcurrency: 4 },
  'basemap.nationalmap.gov': { capacity: 8, refillRate: 4, maxConcurrency: 4 },
  'epqs.nationalmap.gov': { capacity: 4, refillRate: 2, maxConcurrency: 2 },
  'tiles.maps.eox.at': { capacity: 8, refillRate: 4, maxConcurrency: 4 },
  'api.open-meteo.com': { capacity: 4, refillRate: 2, maxConcurrency: 2 },
  'api.open-elevation.com': { capacity: 2, refillRate: 1, maxConcurrency: 1 },
  'maps.googleapis.com': { capacity: 10, refillRate: 5, maxConcurrency: 4 },
};

const DEFAULT_GIS_HOST_LIMIT = { capacity: 4, refillRate: 2, maxConcurrency: 2 };
const gisRateLimiters = new Map();

export function resolveGisHostKey(urlOrHost) {
  if (!urlOrHost) return 'gis-default';
  if (typeof urlOrHost === 'string') {
    const trimmed = urlOrHost.trim().toLowerCase();
    if (!trimmed) return 'gis-default';
    if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
      const hostOnly = trimmed.split('/')[0].split(':')[0];
      if (hostOnly.includes('nominatim')) return 'nominatim.openstreetmap.org';
      if (hostOnly.includes('overpass')) return 'overpass-api.de';
      return hostOnly || 'gis-default';
    }
    try {
      const parsed = new URL(trimmed, 'https://localhost');
      const host = parsed.hostname.toLowerCase();
      if (host.includes('nominatim')) return 'nominatim.openstreetmap.org';
      if (host.includes('overpass')) return 'overpass-api.de';
      return host || 'gis-default';
    } catch {
      return 'gis-default';
    }
  }
  if (typeof URL !== 'undefined' && urlOrHost instanceof URL) {
    const host = urlOrHost.hostname.toLowerCase();
    if (host.includes('nominatim')) return 'nominatim.openstreetmap.org';
    if (host.includes('overpass')) return 'overpass-api.de';
    return host || 'gis-default';
  }
  if (typeof urlOrHost === 'object' && typeof urlOrHost.url === 'string') {
    return resolveGisHostKey(urlOrHost.url);
  }
  return 'gis-default';
}

export function getGisRateLimiter(urlOrHost) {
  const hostKey = resolveGisHostKey(urlOrHost);
  let limiter = gisRateLimiters.get(hostKey);
  if (!limiter) {
    const profile = GIS_HOST_RATE_LIMITS[hostKey] || DEFAULT_GIS_HOST_LIMIT;
    limiter = new RateLimiter(profile);
    gisRateLimiters.set(hostKey, limiter);
  }
  return limiter;
}

export function gisRateLimitedFetch(url, options = {}) {
  const limiter = getGisRateLimiter(url);
  return limiter.fetch(url, options);
}

export function clearGisRateLimiters() {
  for (const limiter of gisRateLimiters.values()) {
    limiter.clear();
  }
}
