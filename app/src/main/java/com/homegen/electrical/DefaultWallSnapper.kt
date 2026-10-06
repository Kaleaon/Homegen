package com.homegen.electrical

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Wall
import com.homegen.designer3d.tools.SnapEngine
import com.homegen.designer3d.tools.WallSegmentCache

/**
 * Snaps points to the nearest wall center line within a configurable threshold.
 */
class DefaultWallSnapper(
    private val wallsProvider: () -> List<Wall>,
    private val snapThreshold: Float = 0.5f,
    private val wallSegmentCache: WallSegmentCache = WallSegmentCache(),
) : WallSnapper {

    override fun snapToNearestWall(point: Vector3): Vector3 {
        val walls = wallsProvider()
        val segments = wallSegmentCache.getSegments(walls)
        return SnapEngine.snapToSegments(point, segments, snapThreshold)
    }
}
