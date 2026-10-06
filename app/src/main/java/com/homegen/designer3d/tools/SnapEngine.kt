package com.homegen.designer3d.tools

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Wall
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.round
import kotlin.math.sin

/**
 * Precomputed wall segment geometry and spatial bounds.
 */
data class WallSegment(
    val wallId: String,
    val start: Vector3,
    val end: Vector3,
    val minX: Float,
    val maxX: Float,
    val minY: Float,
    val maxY: Float,
    val minZ: Float,
    val maxZ: Float,
)

/**
 * Manages cached wall segment geometry to eliminate redundant trigonometric math.
 */
class WallSegmentCache {

    private data class WallSnapshot(
        val lengthMeters: Float,
        val posX: Float,
        val posY: Float,
        val posZ: Float,
        val rotX: Float,
        val rotY: Float,
        val rotZ: Float,
        val scaleX: Float,
        val scaleY: Float,
        val scaleZ: Float,
    )

    private data class CacheEntry(
        val snapshot: WallSnapshot,
        val segment: WallSegment,
    )

    private val cache = mutableMapOf<String, CacheEntry>()

    /**
     * Retrieves or recomputes precomputed segments for the given list of [walls].
     * Invalidates cached geometry when wall identity or transform properties change.
     */
    fun getSegments(walls: List<Wall>): List<WallSegment> {
        val currentWallIds = HashSet<String>(walls.size)
        val result = ArrayList<WallSegment>(walls.size)

        for (wall in walls) {
            val wallId = wall.id
            currentWallIds.add(wallId)

            val pos = wall.transform.position
            val rot = wall.transform.rotationEuler
            val scale = wall.transform.scale

            val currentSnapshot = WallSnapshot(
                lengthMeters = wall.lengthMeters,
                posX = pos.x,
                posY = pos.y,
                posZ = pos.z,
                rotX = rot.x,
                rotY = rot.y,
                rotZ = rot.z,
                scaleX = scale.x,
                scaleY = scale.y,
                scaleZ = scale.z,
            )

            val cached = cache[wallId]
            if (cached != null && cached.snapshot == currentSnapshot) {
                result.add(cached.segment)
            } else {
                val yaw = rot.y
                val halfLength = wall.lengthMeters / 2f
                val dx = halfLength * cos(yaw)
                val dz = halfLength * sin(yaw)
                val start = Vector3(pos.x - dx, pos.y, pos.z - dz)
                val end = Vector3(pos.x + dx, pos.y, pos.z + dz)

                val segment = WallSegment(
                    wallId = wallId,
                    start = start,
                    end = end,
                    minX = minOf(start.x, end.x),
                    maxX = maxOf(start.x, end.x),
                    minY = minOf(start.y, end.y),
                    maxY = maxOf(start.y, end.y),
                    minZ = minOf(start.z, end.z),
                    maxZ = maxOf(start.z, end.z),
                )
                cache[wallId] = CacheEntry(currentSnapshot, segment)
                result.add(segment)
            }
        }

        cache.keys.retainAll(currentWallIds)
        return result
    }

    /** Clears all cached wall segment entries. */
    fun clear() {
        cache.clear()
    }
}

/**
 * Grid and angle snapping utilities inspired by designer3d/tools/snapping.js.
 */
object SnapEngine {

    /** Quantize [value] to the nearest multiple of [step]. */
    fun quantize(value: Float, step: Float): Float {
        if (step <= 0f) return value
        return round(value / step) * step
    }

    /** Snap a world-space point's x/z to the nearest grid intersection. */
    fun snapToGrid(point: Vector3, unitSize: Float): Vector3 {
        return Vector3(
            x = quantize(point.x, unitSize),
            y = point.y,
            z = quantize(point.z, unitSize),
        )
    }

    /** Snap an angle (radians) to the nearest multiple of [stepDegrees]. */
    fun snapAngle(radians: Float, stepDegrees: Float = 15f): Float {
        val step = (stepDegrees * PI / 180.0).toFloat()
        return quantize(radians, step)
    }

    /**
     * Find the closest point on a line segment (a→b) to a given [point] in 3D space.
     * Returns the snapped point and the distance to [point].
     */
    fun closestPointOnSegment(point: Vector3, a: Vector3, b: Vector3): Pair<Vector3, Float> {
        val seg = b - a
        val lenSq = seg.dot(seg)
        if (lenSq < 1e-8f) return a to point.distanceTo(a)

        val t = ((point - a).dot(seg) / lenSq).coerceIn(0f, 1f)
        val closest = a + seg * t
        return closest to point.distanceTo(closest)
    }

    /**
     * Snap [point] to the nearest segment in [segments] within [threshold].
     * Uses bounding-box distance pre-filtering to skip distant segments.
     */
    fun snapToSegments(
        point: Vector3,
        segments: List<WallSegment>,
        threshold: Float = 0.5f,
    ): Vector3 {
        var bestDistance = Float.MAX_VALUE
        var bestPoint = point

        for (segment in segments) {
            val maxAllowedDist = minOf(bestDistance, threshold)

            val dx = when {
                point.x < segment.minX -> segment.minX - point.x
                point.x > segment.maxX -> point.x - segment.maxX
                else -> 0f
            }
            val dy = when {
                point.y < segment.minY -> segment.minY - point.y
                point.y > segment.maxY -> point.y - segment.maxY
                else -> 0f
            }
            val dz = when {
                point.z < segment.minZ -> segment.minZ - point.z
                point.z > segment.maxZ -> point.z - segment.maxZ
                else -> 0f
            }

            val boxDistSq = dx * dx + dy * dy + dz * dz
            if (boxDistSq > maxAllowedDist * maxAllowedDist) {
                continue
            }

            val (projected, dist) = closestPointOnSegment(point, segment.start, segment.end)
            if (dist < bestDistance && dist <= threshold) {
                bestDistance = dist
                bestPoint = projected
            }
        }

        return bestPoint
    }

    /**
     * Snap to the midpoint of the nearest wall edge if within [threshold].
     */
    fun snapToWallMidpoint(point: Vector3, wallEdges: List<Pair<Vector3, Vector3>>, threshold: Float): Vector3? {
        var bestDist = threshold
        var bestMid: Vector3? = null
        for ((start, end) in wallEdges) {
            val mid = Vector3((start.x + end.x) / 2f, point.y, (start.z + end.z) / 2f)
            val dist = point.distanceTo(mid)
            if (dist < bestDist) {
                bestDist = dist
                bestMid = mid
            }
        }
        return bestMid
    }
}
