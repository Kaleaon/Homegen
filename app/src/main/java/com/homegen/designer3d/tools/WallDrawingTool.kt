package com.homegen.designer3d.tools

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Transform
import com.homegen.designer3d.model.Wall
import kotlin.math.atan2

/**
 * Stateful tool for wall-drawing mode. Maintains a pending start point; the second
 * tap completes the wall by computing length, rotation and midpoint position.
 */
class WallDrawingTool {

    private var pendingStart: Vector3? = null

    /**
     * Called on each tap in WallDraw mode.
     * First tap sets the start point and returns null.
     * Second tap creates a [Wall] between start and the tapped point and returns it.
     */
    fun onTap(worldPoint: Vector3): Wall? {
        val start = pendingStart
        if (start == null) {
            pendingStart = worldPoint
            return null
        }

        val wall = createWallBetween(start, worldPoint)
        pendingStart = worldPoint // chain walls: last end becomes next start
        return wall
    }

    /** Cancel the current wall-drawing operation. */
    fun reset() {
        pendingStart = null
    }

    /** The current pending start point, if any (for preview rendering). */
    fun pendingStart(): Vector3? = pendingStart

    companion object {
        /**
         * Create a [Wall] spanning from [start] to [end].
         * The wall is positioned at the midpoint, rotated to face the correct direction,
         * and its length equals the distance between the two points.
         */
        fun createWallBetween(start: Vector3, end: Vector3): Wall {
            val dx = end.x - start.x
            val dz = end.z - start.z
            val length = start.distanceTo(end).coerceAtLeast(0.1f)
            val angle = atan2(dz, dx)
            val midpoint = Vector3(
                (start.x + end.x) / 2f,
                0f,
                (start.z + end.z) / 2f,
            )
            return Wall(
                name = "Wall",
                lengthMeters = length,
                transform = Transform(
                    position = midpoint,
                    rotationEuler = Vector3(0f, angle, 0f),
                ),
            )
        }
    }
}
