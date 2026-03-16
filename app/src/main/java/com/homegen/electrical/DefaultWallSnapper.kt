package com.homegen.electrical

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Wall
import kotlin.math.cos
import kotlin.math.sin

/**
 * Snaps points to the nearest wall center line within a configurable threshold.
 */
class DefaultWallSnapper(
    private val wallsProvider: () -> List<Wall>,
    private val snapThreshold: Float = 0.5f
) : WallSnapper {

    override fun snapToNearestWall(point: Vector3): Vector3 {
        val walls = wallsProvider()
        var bestDistance = Float.MAX_VALUE
        var bestPoint = point

        for (wall in walls) {
            val pos = wall.transform.position
            val yaw = wall.transform.rotationEuler.y
            val halfLength = wall.lengthMeters / 2f

            val dx = halfLength * cos(yaw)
            val dz = halfLength * sin(yaw)
            val start = Vector3(pos.x - dx, pos.y, pos.z - dz)
            val end = Vector3(pos.x + dx, pos.y, pos.z + dz)

            val projected = closestPointOnLine(point, start, end)
            val dist = projected.distanceTo(point)

            if (dist < bestDistance && dist <= snapThreshold) {
                bestDistance = dist
                bestPoint = projected
            }
        }

        return bestPoint
    }

    private fun closestPointOnLine(point: Vector3, start: Vector3, end: Vector3): Vector3 {
        val seg = end - start
        val lenSq = seg.dot(seg)
        if (lenSq == 0f) return start

        val t = ((point - start).dot(seg) / lenSq).coerceIn(0f, 1f)
        return start + seg * t
    }
}
