package com.homegen.electrical

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Wall
import com.homegen.designer3d.tools.SnapEngine
import kotlin.math.cos
import kotlin.math.sin

/**
 * Snaps points to the nearest wall center line within a configurable threshold.
 */
class DefaultWallSnapper(
    private val wallsProvider: () -> List<Wall>,
    private val snapThreshold: Float = 0.5f,
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

            val (projected, dist) = SnapEngine.closestPointOnSegment(point, start, end)

            if (dist < bestDistance && dist <= snapThreshold) {
                bestDistance = dist
                bestPoint = projected
            }
        }

        return bestPoint
    }
}
