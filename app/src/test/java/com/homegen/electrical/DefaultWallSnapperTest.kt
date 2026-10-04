package com.homegen.electrical

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Transform
import com.homegen.designer3d.model.Wall
import org.junit.Test
import kotlin.test.assertEquals

class DefaultWallSnapperTest {

    @Test
    fun `snaps point to nearest wall center line when within threshold`() {
        val wall = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 1f, 0f), rotationEuler = Vector3(0f, 0f, 0f)),
        )
        val snapper = DefaultWallSnapper(
            wallsProvider = { listOf(wall) },
            snapThreshold = 0.5f,
        )

        val query = Vector3(2f, 1f, 0.3f)
        val snapped = snapper.snapToNearestWall(query)

        assertEquals(2f, snapped.x, 0.001f)
        assertEquals(1f, snapped.y, 0.001f)
        assertEquals(0f, snapped.z, 0.001f)
    }

    @Test
    fun `returns original point when outside threshold`() {
        val wall = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 1f, 0f), rotationEuler = Vector3(0f, 0f, 0f)),
        )
        val snapper = DefaultWallSnapper(
            wallsProvider = { listOf(wall) },
            snapThreshold = 0.5f,
        )

        val query = Vector3(2f, 1f, 1f)
        val snapped = snapper.snapToNearestWall(query)

        assertEquals(2f, snapped.x, 0.001f)
        assertEquals(1f, snapped.y, 0.001f)
        assertEquals(1f, snapped.z, 0.001f)
    }

    @Test
    fun `snaps to nearest wall among multiple walls`() {
        val wall1 = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 0f, 0f)),
        )
        val wall2 = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 0f, 5f)),
        )
        val snapper = DefaultWallSnapper(
            wallsProvider = { listOf(wall1, wall2) },
            snapThreshold = 1.0f,
        )

        val query = Vector3(1f, 0f, 4.8f)
        val snapped = snapper.snapToNearestWall(query)

        assertEquals(1f, snapped.x, 0.001f)
        assertEquals(0f, snapped.y, 0.001f)
        assertEquals(5f, snapped.z, 0.001f)
    }

    @Test
    fun `handles zero-length wall without division by zero`() {
        val wall = Wall(
            lengthMeters = 0f,
            transform = Transform(position = Vector3(3f, 0f, 3f)),
        )
        val snapper = DefaultWallSnapper(
            wallsProvider = { listOf(wall) },
            snapThreshold = 1.0f,
        )

        val query = Vector3(3.2f, 0f, 3f)
        val snapped = snapper.snapToNearestWall(query)

        assertEquals(3f, snapped.x, 0.001f)
        assertEquals(0f, snapped.y, 0.001f)
        assertEquals(3f, snapped.z, 0.001f)
    }
}
