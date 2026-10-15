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
    fun `project coordinates passes linear projected coordinates through directly`() {
        // State Plane CA III (EPSG:2227) in US Survey Feet
        val (x2227, y2227) = SpatialCoreJni.projectCoordinates("EPSG:2227", 6000000.0, 2000000.0)
        assertEquals(6000000.0, x2227, 0.0001)
        assertEquals(2000000.0, y2227, 0.0001)

        // State Plane NY Long Island (EPSG:2263) in US Survey Feet
        val (x2263, y2263) = SpatialCoreJni.projectCoordinates("EPSG:2263", 1000000.0, 200000.0)
        assertEquals(1000000.0, x2263, 0.0001)
        assertEquals(200000.0, y2263, 0.0001)

        // UTM Zone 10N (EPSG:26910) in meters
        val (x26910, y26910) = SpatialCoreJni.projectCoordinates("EPSG:26910", 550000.0, 4180000.0)
        assertEquals(550000.0, x26910, 0.0001)
        assertEquals(4180000.0, y26910, 0.0001)
    }

    @Test
    fun `extracts regional EPSG codes, URNs, and GeoJSON CRS objects`() {
        val regionalCodes = listOf("EPSG:2227", "EPSG:2263", "EPSG:26910", "EPSG:3857")

        for (code in regionalCodes) {
            val jni = SpatialCoreJni()
            try {
                val jsonStr = """{"crs": "$code"}"""
                val loaded = jni.loadJsonString(jsonStr)
                assertTrue(loaded)
                assertEquals(code, jni.crs)
            } finally {
                jni.close()
            }
        }

        // Test URN identifier
        val jniUrn = SpatialCoreJni()
        try {
            val jsonUrn = """{"crs": "urn:ogc:def:crs:EPSG::2227"}"""
            val loaded = jniUrn.loadJsonString(jsonUrn)
            assertTrue(loaded)
            assertEquals("EPSG:2227", jniUrn.crs)
        } finally {
            jniUrn.close()
        }

        // Test GeoJSON CRS object
        val jniGeoJson = SpatialCoreJni()
        try {
            val jsonGeoJson = """
                {
                    "crs": {
                        "type": "name",
                        "properties": {
                            "name": "urn:ogc:def:crs:EPSG::2263"
                        }
                    }
                }
            """.trimIndent()
            val loaded = jniGeoJson.loadJsonString(jsonGeoJson)
            assertTrue(loaded)
            assertEquals("EPSG:2263", jniGeoJson.crs)
        } finally {
            jniGeoJson.close()
        }
    }

    @Test
    fun `evaluates State Plane EPSG 2227 setback clearance accurately`() {
        val jni = SpatialCoreJni()
        try {
            val jsonStr = """
                {
                    "crs": "EPSG:2227",
                    "lotBoundary": [6000000.0, 2000000.0, 6001000.0, 2000000.0, 6001000.0, 2001000.0, 6000000.0, 2001000.0],
                    "innerPoints": [6000036.0, 2000036.0, 6000964.0, 2000036.0, 6000964.0, 2000964.0, 6000036.0, 2000964.0]
                }
            """.trimIndent()

            val bytes = jsonStr.toByteArray(Charsets.UTF_8)
            val buf = ByteBuffer.allocateDirect(bytes.size)
            buf.put(bytes)
            buf.rewind()

            val loaded = jni.loadJsonBuffer(buf, bytes.size)
            assertTrue(loaded)
            assertEquals("EPSG:2227", jni.crs)

            // Valid room inside State Plane buildable boundary
            val validRoom = doubleArrayOf(
                6000100.0,
                2000100.0,
                6000500.0,
                2000100.0,
                6000500.0,
                2000500.0,
                6000100.0,
                2000500.0,
            )
            val noViolations = jni.querySetbackViolations(validRoom)
            assertTrue(noViolations.isEmpty())

            // Room vertex inside setback buffer zone
            val setbackRoom = doubleArrayOf(
                6000010.0,
                2000010.0,
                6000500.0,
                2000010.0,
                6000500.0,
                2000500.0,
                6000010.0,
                2000500.0,
            )
            val setbackViolations = jni.querySetbackViolations(setbackRoom)
            assertTrue(setbackViolations.isNotEmpty())
            assertEquals("setback-clearance", setbackViolations[0].type)

            // Room vertex extending outside State Plane lot boundary
            val lotViolationRoom = doubleArrayOf(
                5999990.0,
                1999990.0,
                6000500.0,
                1999990.0,
                6000500.0,
                2000500.0,
                5999990.0,
                2000500.0,
            )
            val lotViolations = jni.querySetbackViolations(lotViolationRoom)
            assertTrue(lotViolations.isNotEmpty())
            assertTrue(lotViolations.any { it.type == "lot-boundary-exceeded" })
        } finally {
            jni.close()
        }
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
