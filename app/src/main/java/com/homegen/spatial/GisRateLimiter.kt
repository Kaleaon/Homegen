package com.homegen.spatial

import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.ceil
import kotlin.math.min

data class GisHostRateLimit(
    val capacity: Int,
    val refillPerSecond: Double,
    val maxConcurrency: Int,
)

/**
 * Thread-safe per-host token bucket and concurrency limiter for upstream GIS APIs.
 */
class GisRateLimiter(
    val config: GisHostRateLimit,
    private val clockMs: () -> Long = { System.currentTimeMillis() },
    private val sleepMs: (Long) -> Unit = { ms ->
        if (ms > 0L) {
            Thread.sleep(ms)
        }
    },
) {
    private val lock = Object()
    private var tokens: Double = config.capacity.toDouble()
    private var lastRefillMs: Long = clockMs()
    private var activeCount: Int = 0

    private fun refillLocked(nowMs: Long) {
        val elapsedSeconds = ((nowMs - lastRefillMs).coerceAtLeast(0L)) / 1000.0
        if (elapsedSeconds > 0.0) {
            tokens = min(
                config.capacity.toDouble(),
                tokens + elapsedSeconds * config.refillPerSecond,
            )
            lastRefillMs = nowMs
        }
    }

    fun <T> execute(block: () -> T): T {
        acquire()
        return try {
            block()
        } finally {
            release()
        }
    }

    fun acquire() {
        while (true) {
            var waitMillis = 0L
            synchronized(lock) {
                val now = clockMs()
                refillLocked(now)
                if (activeCount < config.maxConcurrency && tokens >= 1.0) {
                    tokens -= 1.0
                    activeCount += 1
                    return
                }
                if (tokens < 1.0) {
                    val missing = 1.0 - tokens
                    waitMillis = ceil((missing / config.refillPerSecond) * 1000.0)
                        .toLong()
                        .coerceAtLeast(10L)
                } else {
                    waitMillis = 15L
                }
            }
            sleepMs(waitMillis)
        }
    }

    private fun release() {
        synchronized(lock) {
            if (activeCount > 0) {
                activeCount -= 1
            }
            lock.notifyAll()
        }
    }
}

/**
 * Dedicated GIS host rate-limiter registry isolating Nominatim and Overpass (capped at 1 req/s)
 * from basemap tile streams and 3D asset fetches.
 */
class GisRateLimiterRegistry(
    private val clockMs: () -> Long = { System.currentTimeMillis() },
    private val sleepMs: (Long) -> Unit = { ms ->
        if (ms > 0L) {
            Thread.sleep(ms)
        }
    },
) {
    private val limiters = ConcurrentHashMap<String, GisRateLimiter>()

    fun limiterForUrl(url: String): GisRateLimiter {
        val key = resolveHostKey(url)
        return limiters.computeIfAbsent(key) { hostKey ->
            GisRateLimiter(
                config = DEFAULT_LIMITS[hostKey] ?: DEFAULT_FALLBACK_LIMIT,
                clockMs = clockMs,
                sleepMs = sleepMs,
            )
        }
    }

    fun clear() {
        limiters.clear()
    }

    companion object {
        val STRICT_ONE_PER_SEC = GisHostRateLimit(
            capacity = 1,
            refillPerSecond = 1.0,
            maxConcurrency = 1,
        )

        private val DEFAULT_FALLBACK_LIMIT = GisHostRateLimit(
            capacity = 4,
            refillPerSecond = 2.0,
            maxConcurrency = 2,
        )

        val DEFAULT_LIMITS: Map<String, GisHostRateLimit> = mapOf(
            "nominatim.openstreetmap.org" to STRICT_ONE_PER_SEC,
            "overpass-api.de" to STRICT_ONE_PER_SEC,
            "api.open-meteo.com" to GisHostRateLimit(capacity = 4, refillPerSecond = 2.0, maxConcurrency = 2),
            "api.open-elevation.com" to GisHostRateLimit(capacity = 2, refillPerSecond = 1.0, maxConcurrency = 1),
            "tile.openstreetmap.org" to GisHostRateLimit(capacity = 4, refillPerSecond = 2.0, maxConcurrency = 2),
            "basemaps.cartocdn.com" to GisHostRateLimit(capacity = 6, refillPerSecond = 4.0, maxConcurrency = 4),
            "basemap.nationalmap.gov" to GisHostRateLimit(capacity = 6, refillPerSecond = 4.0, maxConcurrency = 4),
            "tiles.maps.eox.at" to GisHostRateLimit(capacity = 6, refillPerSecond = 4.0, maxConcurrency = 4),
            "maps.googleapis.com" to GisHostRateLimit(capacity = 10, refillPerSecond = 5.0, maxConcurrency = 4),
        )

        fun resolveHostKey(url: String): String {
            val host = try {
                URI(url).host?.lowercase()?.trim() ?: ""
            } catch (_: Exception) {
                ""
            }
            return when {
                host.isEmpty() -> "gis-default"
                host.contains("nominatim") -> "nominatim.openstreetmap.org"
                host.contains("overpass") -> "overpass-api.de"
                host.endsWith("tile.openstreetmap.org") -> "tile.openstreetmap.org"
                host.endsWith("cartocdn.com") -> "basemaps.cartocdn.com"
                host.endsWith("nationalmap.gov") -> "basemap.nationalmap.gov"
                host.endsWith("maps.eox.at") -> "tiles.maps.eox.at"
                host.endsWith("googleapis.com") -> "maps.googleapis.com"
                else -> host
            }
        }
    }
}
