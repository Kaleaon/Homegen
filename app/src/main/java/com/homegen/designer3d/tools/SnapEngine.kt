package com.homegen.designer3d.tools

import com.homegen.designer3d.math.Vector3
import kotlin.math.PI
import kotlin.math.round

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
