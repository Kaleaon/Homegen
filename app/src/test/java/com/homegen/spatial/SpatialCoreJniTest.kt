package com.homegen.spatial

import org.junit.Test
import java.nio.ByteBuffer
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SpatialCoreJniTest {

    @Test
    fun `project coordinates delivers identical projections`() {
        val (x3857, y3857) = SpatialCoreJni.projectCoordinates("EPSG:3857", -122.4194, 37.7749)
        assertEquals(-122.4194, x3857, 0.0001)
        assertEquals(37.7749, y3857, 0.0001)

        val (x4326, y4326) = SpatialCoreJni.projectCoordinates("EPSG:4326", -122.4194, 37.7749)
        assertTrue(x4326 < 0)
        assertTrue(y4326 > 0)
    }

    @Test
    fun `compute variable buffers offsets inner buildable polygon inward`() {
        // Square lot 100x100 with 10 unit setback on all edges
        val segmentData = doubleArrayOf(
            0.0, 0.0, 100.0, 0.0, 10.0,
            100.0, 0.0, 100.0, 100.0, 10.0,
            100.0, 100.0, 0.0, 100.0, 10.0,
            0.0, 100.0, 0.0, 0.0, 10.0,
        )

        val innerPoints = SpatialCoreJni.computeVariableBuffers(segmentData)
        assertTrue(innerPoints.size >= 8)
        // Corner 1 should be around (10, 10)
        assertEquals(10.0, innerPoints[0], 0.5)
        assertEquals(10.0, innerPoints[1], 0.5)
    }

    @Test
    fun `evaluates room polygon setback clearance and lot boundary violations`() {
        val jni = SpatialCoreJni()
        try {
            val jsonStr = """
                {
                    "crs": "EPSG:4326",
                    "lotBoundary": [0.0, 0.0, 100.0, 0.0, 100.0, 100.0, 0.0, 100.0],
                    "innerPoints": [10.0, 10.0, 90.0, 10.0, 90.0, 90.0, 10.0, 90.0]
                }
            """.trimIndent()

            val bytes = jsonStr.toByteArray(Charsets.UTF_8)
            val buf = ByteBuffer.allocateDirect(bytes.size)
            buf.put(bytes)
            buf.rewind()

            val loaded = jni.loadJsonBuffer(buf, bytes.size)
            assertTrue(loaded)

            // Valid room inside (20,20) to (80,80)
            val validRoom = doubleArrayOf(20.0, 20.0, 80.0, 20.0, 80.0, 80.0, 20.0, 80.0)
            val noViolations = jni.querySetbackViolations(validRoom)
            assertTrue(noViolations.isEmpty())

            // Room inside setback buffer zone (5, 5)
            val setbackViolationRoom = doubleArrayOf(5.0, 5.0, 50.0, 5.0, 50.0, 50.0, 5.0, 50.0)
            val setbackViolations = jni.querySetbackViolations(setbackViolationRoom)
            assertTrue(setbackViolations.isNotEmpty())
            assertEquals("setback-clearance", setbackViolations[0].type)

            // Room outside lot boundary (-10, -10)
            val lotViolationRoom = doubleArrayOf(-10.0, -10.0, 50.0, -10.0, 50.0, 50.0, -10.0, 50.0)
            val lotViolations = jni.querySetbackViolations(lotViolationRoom)
            assertTrue(lotViolations.isNotEmpty())
            assertTrue(lotViolations.any { it.type == "lot-boundary-exceeded" })
        } finally {
            jni.close()
        }
    }
}
