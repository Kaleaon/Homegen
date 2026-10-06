package com.homegen.designer3d.tools

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Transform
import com.homegen.designer3d.model.Wall
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotSame
import kotlin.test.assertSame

class SnapEngineTest {

    @Test
    fun `closestPointOnSegment projects point onto midpoint of horizontal segment`() {
        val a = Vector3(0f, 0f, 0f)
        val b = Vector3(10f, 0f, 0f)
        val point = Vector3(5f, 3f, 0f)

        val (closest, dist) = SnapEngine.closestPointOnSegment(point, a, b)

        assertEquals(5f, closest.x, 0.001f)
        assertEquals(0f, closest.y, 0.001f)
        assertEquals(0f, closest.z, 0.001f)
        assertEquals(3f, dist, 0.001f)
    }

    @Test
    fun `closestPointOnSegment clamps to start point when point is before segment`() {
        val a = Vector3(0f, 0f, 0f)
        val b = Vector3(10f, 0f, 0f)
        val point = Vector3(-5f, 0f, 0f)

        val (closest, dist) = SnapEngine.closestPointOnSegment(point, a, b)

        assertEquals(0f, closest.x, 0.001f)
        assertEquals(0f, closest.y, 0.001f)
        assertEquals(0f, closest.z, 0.001f)
        assertEquals(5f, dist, 0.001f)
    }

    @Test
    fun `closestPointOnSegment clamps to end point when point is beyond segment`() {
        val a = Vector3(0f, 0f, 0f)
        val b = Vector3(10f, 0f, 0f)
        val point = Vector3(15f, 0f, 0f)

        val (closest, dist) = SnapEngine.closestPointOnSegment(point, a, b)

        assertEquals(10f, closest.x, 0.001f)
        assertEquals(0f, closest.y, 0.001f)
        assertEquals(0f, closest.z, 0.001f)
        assertEquals(5f, dist, 0.001f)
    }

    @Test
    fun `closestPointOnSegment handles 3D elevation correctly`() {
        val a = Vector3(0f, 1f, 0f)
        val b = Vector3(0f, 5f, 0f)
        val point = Vector3(2f, 3f, 0f)

        val (closest, dist) = SnapEngine.closestPointOnSegment(point, a, b)

        assertEquals(0f, closest.x, 0.001f)
        assertEquals(3f, closest.y, 0.001f)
        assertEquals(0f, closest.z, 0.001f)
        assertEquals(2f, dist, 0.001f)
    }

    @Test
    fun `closestPointOnSegment handles zero-length segment without division by zero`() {
        val a = Vector3(2f, 2f, 2f)
        val b = Vector3(2f, 2f, 2f)
        val point = Vector3(5f, 2f, 2f)

        val (closest, dist) = SnapEngine.closestPointOnSegment(point, a, b)

        assertEquals(2f, closest.x, 0.001f)
        assertEquals(2f, closest.y, 0.001f)
        assertEquals(2f, closest.z, 0.001f)
        assertEquals(3f, dist, 0.001f)
    }

    @Test
    fun `quantize rounds correctly`() {
        assertEquals(1.0f, SnapEngine.quantize(0.9f, 0.5f), 0.001f)
        assertEquals(0.0f, SnapEngine.quantize(0.2f, 0.5f), 0.001f)
        assertEquals(1.23f, SnapEngine.quantize(1.23f, 0f), 0.001f)
    }

    @Test
    fun `snapToGrid snaps x and z coordinates`() {
        val point = Vector3(0.4f, 1.5f, 0.9f)
        val snapped = SnapEngine.snapToGrid(point, 0.5f)

        assertEquals(0.5f, snapped.x, 0.001f)
        assertEquals(1.5f, snapped.y, 0.001f)
        assertEquals(1.0f, snapped.z, 0.001f)
    }

    @Test
    fun `WallSegmentCache computes endpoints and AABB correctly`() {
        val cache = WallSegmentCache()
        val wall = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 1f, 0f), rotationEuler = Vector3(0f, 0f, 0f)),
        )

        val segments = cache.getSegments(listOf(wall))
        assertEquals(1, segments.size)

        val segment = segments[0]
        assertEquals(wall.id, segment.wallId)
        assertEquals(-5f, segment.start.x, 0.001f)
        assertEquals(1f, segment.start.y, 0.001f)
        assertEquals(0f, segment.start.z, 0.001f)

        assertEquals(5f, segment.end.x, 0.001f)
        assertEquals(1f, segment.end.y, 0.001f)
        assertEquals(0f, segment.end.z, 0.001f)

        assertEquals(-5f, segment.minX, 0.001f)
        assertEquals(5f, segment.maxX, 0.001f)
        assertEquals(1f, segment.minY, 0.001f)
        assertEquals(1f, segment.maxY, 0.001f)
        assertEquals(0f, segment.minZ, 0.001f)
        assertEquals(0f, segment.maxZ, 0.001f)
    }

    @Test
    fun `WallSegmentCache reuses cached object when wall transform is unchanged`() {
        val cache = WallSegmentCache()
        val wall = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(2f, 0f, 3f)),
        )

        val segments1 = cache.getSegments(listOf(wall))
        val segments2 = cache.getSegments(listOf(wall))

        assertSame(segments1[0], segments2[0])
    }

    @Test
    fun `WallSegmentCache invalidates when wall position, rotation, or length changes`() {
        val cache = WallSegmentCache()
        val wall = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 0f, 0f)),
        )

        val segments1 = cache.getSegments(listOf(wall))

        // Change position
        wall.transform.position = Vector3(5f, 0f, 0f)
        val segments2 = cache.getSegments(listOf(wall))
        assertNotSame(segments1[0], segments2[0])
        assertEquals(0f, segments2[0].start.x, 0.001f)
        assertEquals(10f, segments2[0].end.x, 0.001f)

        // Change length
        wall.lengthMeters = 20f
        val segments3 = cache.getSegments(listOf(wall))
        assertNotSame(segments2[0], segments3[0])
        assertEquals(-5f, segments3[0].start.x, 0.001f)
        assertEquals(15f, segments3[0].end.x, 0.001f)
    }

    @Test
    fun `WallSegmentCache purges deleted walls`() {
        val cache = WallSegmentCache()
        val wall1 = Wall(lengthMeters = 5f)
        val wall2 = Wall(lengthMeters = 8f)

        val segmentsBoth = cache.getSegments(listOf(wall1, wall2))
        assertEquals(2, segmentsBoth.size)

        val segmentsOne = cache.getSegments(listOf(wall1))
        assertEquals(1, segmentsOne.size)
        assertEquals(wall1.id, segmentsOne[0].wallId)
    }

    @Test
    fun `snapToSegments snaps to nearest segment within threshold using bounding box filtering`() {
        val wall1 = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 0f, 0f)),
        )
        val wall2 = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 0f, 10f)),
        )
        val cache = WallSegmentCache()
        val segments = cache.getSegments(listOf(wall1, wall2))

        val queryNearWall2 = Vector3(1f, 0f, 9.8f)
        val snapped = SnapEngine.snapToSegments(queryNearWall2, segments, threshold = 0.5f)

        assertEquals(1f, snapped.x, 0.001f)
        assertEquals(0f, snapped.y, 0.001f)
        assertEquals(10f, snapped.z, 0.001f)
    }

    @Test
    fun `snapToSegments returns original point when outside threshold`() {
        val wall = Wall(
            lengthMeters = 10f,
            transform = Transform(position = Vector3(0f, 0f, 0f)),
        )
        val cache = WallSegmentCache()
        val segments = cache.getSegments(listOf(wall))

        val queryDistant = Vector3(1f, 0f, 5f)
        val snapped = SnapEngine.snapToSegments(queryDistant, segments, threshold = 0.5f)

        assertEquals(1f, snapped.x, 0.001f)
        assertEquals(0f, snapped.y, 0.001f)
        assertEquals(5f, snapped.z, 0.001f)
    }
}
