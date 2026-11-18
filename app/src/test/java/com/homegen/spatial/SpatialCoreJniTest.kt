package com.homegen.spatial

import org.junit.Test
import java.nio.ByteBuffer
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
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

    @Test
    fun `close destroys native handle once and resets handle on repeated calls`() {
        val destroyedHandles = CopyOnWriteArrayList<Long>()
        var jni: SpatialCoreJni? = SpatialCoreJni(
            createHandle = { 424242L },
            destroyHandle = { handle -> destroyedHandles.add(handle) },
        )

        assertEquals(424242L, jni!!.handle)

        jni.close()
        assertEquals(0L, jni.handle)
        assertEquals(listOf(424242L), destroyedHandles.toList())

        // Repeated close calls must be idempotent no-ops
        jni.close()
        jni.close()
        assertEquals(0L, jni.handle)
        assertEquals(listOf(424242L), destroyedHandles.toList())

        // Dropping reference after close must not trigger a second destroy via Cleaner
        jni = null
        System.gc()
        System.runFinalization()
        Thread.sleep(50)
        assertEquals(listOf(424242L), destroyedHandles.toList())
    }

    @Test
    fun `cleaner automatically destroys native handle when unclosed instance is garbage collected`() {
        val latch = CountDownLatch(1)
        val destroyedHandles = CopyOnWriteArrayList<Long>()

        allocateUnclosedInstance(987654321L) { handle ->
            destroyedHandles.add(handle)
            latch.countDown()
        }

        var cleaned = false
        for (attempt in 1..25) {
            System.gc()
            System.runFinalization()
            if (latch.await(100, TimeUnit.MILLISECONDS)) {
                cleaned = true
                break
            }
            val transientAllocation = ByteArray(64 * 1024)
            assertEquals(64 * 1024, transientAllocation.size)
        }

        assertTrue(cleaned, "Expected Cleaner safety net to destroy native handle after GC")
        assertEquals(listOf(987654321L), destroyedHandles.toList())
    }

    private fun allocateUnclosedInstance(
        handleValue: Long,
        onDestroy: (Long) -> Unit,
    ) {
        val unclosed = SpatialCoreJni(
            createHandle = { handleValue },
            destroyHandle = onDestroy,
        )
        assertEquals(handleValue, unclosed.handle)
    }

    @Test
    fun `parses formatted multi-line and nested spatial JSON with 2D coordinate arrays`() {
        val formattedNestedJson = """
            {
                "schemaVersion": 2,
                "scene": {
                    "note": "Decoy text mentioning epsg:9999 and lotBoundary [1, 2, 3]"
                },
                "spatial": {
                    "crs": {
                        "type": "EPSG",
                        "properties": {
                            "description": "California Zone III in US Survey Feet",
                            "code": 2227
                        }
                    },
                    "lotBoundary": [
                        [ 0.0 , 0.0 ],
                        [ 200.0 , 0.0 ],
                        [ 200.0 , 200.0 ],
                        [ 0.0 , 200.0 ]
                    ],
                    "innerPoints": [
                        [ 25.0, 25.0 ],
                        [ 175.0, 25.0 ],
                        [ 175.0, 175.0 ],
                        [ 25.0, 175.0 ]
                    ]
                }
            }
        """.trimIndent()

        SpatialCoreJni().use { jni ->
            assertTrue(jni.loadJsonString(formattedNestedJson))
            assertEquals("EPSG:2227", jni.crs)

            val validRoom = doubleArrayOf(40.0, 40.0, 150.0, 40.0, 150.0, 150.0, 40.0, 150.0)
            assertTrue(jni.querySetbackViolations(validRoom).isEmpty())

            val setbackViolationRoom = doubleArrayOf(10.0, 10.0, 100.0, 10.0, 100.0, 100.0, 10.0, 100.0)
            val setbackViolations = jni.querySetbackViolations(setbackViolationRoom)
            assertEquals(1, setbackViolations.size)
            assertEquals("setback-clearance", setbackViolations[0].type)

            val outsideLotRoom = doubleArrayOf(-5.0, -5.0, 100.0, -5.0, 100.0, 100.0, -5.0, 100.0)
            val lotViolations = jni.querySetbackViolations(outsideLotRoom)
            assertTrue(lotViolations.any { it.type == "lot-boundary-exceeded" })
        }
    }

    @Test
    fun `parses nested GeoJSON FeatureCollection with closed rings and 3D coordinates`() {
        val nestedGeoJson = """
            {
                "type": "FeatureCollection",
                "crs": {
                    "type": "name",
                    "properties": {
                        "name": "urn:ogc:def:crs:EPSG:8.9:26910"
                    }
                },
                "features": [
                    {
                        "type": "Feature",
                        "id": "parcel-1",
                        "properties": {
                            "layer": "lot",
                            "name": "Primary Parcel"
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [0.0, 0.0, 12.5],
                                    [300.0, 0.0, 12.5],
                                    [300.0, 300.0, 12.5],
                                    [0.0, 300.0, 12.5],
                                    [0.0, 0.0, 12.5]
                                ],
                                [
                                    [120.0, 120.0, 12.5],
                                    [140.0, 120.0, 12.5],
                                    [140.0, 140.0, 12.5],
                                    [120.0, 140.0, 12.5],
                                    [120.0, 120.0, 12.5]
                                ]
                            ]
                        }
                    },
                    {
                        "type": "Feature",
                        "id": "setback-1",
                        "properties": {
                            "layer": "setback-buffer"
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [30.0, 30.0],
                                    [270.0, 30.0],
                                    [270.0, 270.0],
                                    [30.0, 270.0],
                                    [30.0, 30.0]
                                ]
                            ]
                        }
                    }
                ]
            }
        """.trimIndent()

        SpatialCoreJni().use { jni ->
            assertTrue(jni.loadJsonString(nestedGeoJson))
            assertEquals("EPSG:26910", jni.crs)

            // Valid room inside (30,30)-(270,270)
            val validRoom = doubleArrayOf(50.0, 50.0, 200.0, 50.0, 200.0, 200.0, 50.0, 200.0)
            assertTrue(jni.querySetbackViolations(validRoom).isEmpty())

            // Room encroaching into setback buffer (15,15)
            val setbackRoom = doubleArrayOf(15.0, 15.0, 200.0, 15.0, 200.0, 200.0, 15.0, 200.0)
            val setbackViolations = jni.querySetbackViolations(setbackRoom)
            assertTrue(setbackViolations.any { it.type == "setback-clearance" })

            // Room outside parcel (-20,-20)
            val outsideRoom = doubleArrayOf(-20.0, -20.0, 200.0, -20.0, 200.0, 200.0, -20.0, 200.0)
            val outsideViolations = jni.querySetbackViolations(outsideRoom)
            assertTrue(outsideViolations.any { it.type == "lot-boundary-exceeded" })
        }
    }

    @Test
    fun `handles malformed JSON syntax gracefully with default CRS and empty point lists`() {
        val malformedInputs = listOf(
            "{ invalid json",
            "",
            "   ",
            "[\"unterminated",
            "not-json-at-all",
            """{"crs": null, "lotBoundary": "not-an-array", "innerPoints": {}}""",
        )

        for (badInput in malformedInputs) {
            assertEquals("EPSG:4326", SpatialCoreJni.extractCrsFallback(badInput))
            assertTrue(SpatialCoreJni.extractNumbersFallback(badInput, "lotBoundary").isEmpty())
            assertTrue(SpatialCoreJni.extractNumbersFallback(badInput, "innerPoints").isEmpty())

            SpatialCoreJni().use { jni ->
                jni.loadJsonString(badInput)
                assertEquals("EPSG:4326", jni.crs)
                val room = doubleArrayOf(10.0, 10.0, 50.0, 10.0, 50.0, 50.0, 10.0, 50.0)
                assertTrue(jni.querySetbackViolations(room).isEmpty())
            }
        }
    }
}
