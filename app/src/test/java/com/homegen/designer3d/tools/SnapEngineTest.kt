package com.homegen.designer3d.tools

import com.homegen.designer3d.math.Vector3
import org.junit.Test
import kotlin.test.assertEquals

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
}
