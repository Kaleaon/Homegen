package com.homegen.spatial

import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.round
import kotlin.math.tan

data class ViolationResult(
    val type: String,
    val featureId: String,
    val msg: String,
)

data class Point2D(val x: Double, val y: Double)

class SpatialCoreJni : AutoCloseable {

    private var nativeHandle: Long = 0L

    // Fallback state if native is absent
    private var fallbackLotBoundary: List<Point2D> = emptyList()
    private var fallbackInnerBuildable: List<Point2D> = emptyList()

    init {
        if (isNativeLoaded) {
            nativeHandle = nativeCreateEngine()
        }
    }

    val handle: Long
        get() = nativeHandle

    fun loadJsonBuffer(buffer: ByteBuffer, length: Int): Boolean {
        if (isNativeLoaded && nativeHandle != 0L) {
            return nativeLoadJsonBuffer(nativeHandle, buffer, length)
        }
        val bytes = ByteArray(length)
        val dup = buffer.duplicate()
        dup.get(bytes, 0, length)
        val jsonStr = String(bytes, Charsets.UTF_8)
        return loadJsonStringFallback(jsonStr)
    }

    fun loadJsonString(jsonStr: String): Boolean {
        if (isNativeLoaded && nativeHandle != 0L) {
            return nativeLoadJsonString(nativeHandle, jsonStr)
        }
        return loadJsonStringFallback(jsonStr)
    }

    fun querySetbackViolations(roomCoords: DoubleArray): List<ViolationResult> {
        if (isNativeLoaded && nativeHandle != 0L) {
            val jsonStr = nativeQuerySetbackViolations(nativeHandle, roomCoords)
            return parseViolationJson(jsonStr)
        }
        return querySetbackViolationsFallback(roomCoords)
    }

    override fun close() {
        if (isNativeLoaded && nativeHandle != 0L) {
            nativeDestroyEngine(nativeHandle)
            nativeHandle = 0L
        }
    }

    private fun loadJsonStringFallback(jsonStr: String): Boolean {
        val lotPts = extractNumbersFallback(jsonStr, "lotBoundary")
        if (lotPts.size >= 6) {
            val pts = mutableListOf<Point2D>()
            for (i in 0 until lotPts.size - 1 step 2) {
                pts.add(Point2D(lotPts[i], lotPts[i + 1]))
            }
            fallbackLotBoundary = pts
        }

        val innerPts = extractNumbersFallback(jsonStr, "innerPoints")
        if (innerPts.size >= 6) {
            val pts = mutableListOf<Point2D>()
            for (i in 0 until innerPts.size - 1 step 2) {
                pts.add(Point2D(innerPts[i], innerPts[i + 1]))
            }
            fallbackInnerBuildable = pts
        }

        if (fallbackInnerBuildable.isEmpty() && fallbackLotBoundary.size >= 3) {
            val flatSegs = mutableListOf<Double>()
            val n = fallbackLotBoundary.size
            for (i in 0 until n) {
                val p1 = fallbackLotBoundary[i]
                val p2 = fallbackLotBoundary[(i + 1) % n]
                flatSegs.addAll(listOf(p1.x, p1.y, p2.x, p2.y, 36.0))
            }
            val flatInner = computeVariableBuffersFallback(flatSegs.toDoubleArray())
            val pts = mutableListOf<Point2D>()
            for (i in 0 until flatInner.size - 1 step 2) {
                pts.add(Point2D(flatInner[i], flatInner[i + 1]))
            }
            fallbackInnerBuildable = pts
        }

        return true
    }

    private fun querySetbackViolationsFallback(roomCoords: DoubleArray): List<ViolationResult> {
        val violations = mutableListOf<ViolationResult>()
        val pts = mutableListOf<Point2D>()
        for (i in 0 until roomCoords.size - 1 step 2) {
            pts.add(Point2D(roomCoords[i], roomCoords[i + 1]))
        }
        if (pts.isEmpty()) return violations

        if (fallbackInnerBuildable.size >= 3) {
            for (pt in pts) {
                if (!pointInPolygonFallback(pt, fallbackInnerBuildable)) {
                    violations.add(
                        ViolationResult(
                            type = "setback-clearance",
                            featureId = "setback-buffer",
                            msg = "Room vertex extends into setback buffer zone.",
                        ),
                    )
                    break
                }
            }
        }

        if (fallbackLotBoundary.size >= 3) {
            for (pt in pts) {
                if (!pointInPolygonFallback(pt, fallbackLotBoundary)) {
                    violations.add(
                        ViolationResult(
                            type = "lot-boundary-exceeded",
                            featureId = "lot-boundary",
                            msg = "Room extends outside property lot boundary.",
                        ),
                    )
                    break
                }
            }
        }

        return violations
    }

    companion object {
        var isNativeLoaded = false
            private set

        init {
            try {
                System.loadLibrary("spatial_core")
                isNativeLoaded = true
            } catch (e: UnsatisfiedLinkError) {
                isNativeLoaded = false
            }
        }

        fun projectCoordinates(crs: String, lon: Double, lat: Double): Pair<Double, Double> {
            if (isNativeLoaded) {
                val res = nativeProjectCoordinates(crs, lon, lat)
                if (res.size >= 2) return res[0] to res[1]
            }
            return projectCoordinatesFallback(crs, lon, lat)
        }

        fun computeVariableBuffers(flatSegmentData: DoubleArray): DoubleArray {
            if (isNativeLoaded) {
                return nativeComputeVariableBuffers(flatSegmentData)
            }
            return computeVariableBuffersFallback(flatSegmentData)
        }

        @JvmStatic private external fun nativeCreateEngine(): Long

        @JvmStatic private external fun nativeDestroyEngine(handle: Long)

        @JvmStatic private external fun nativeLoadJsonBuffer(handle: Long, directBuffer: ByteBuffer, length: Int): Boolean

        @JvmStatic private external fun nativeLoadJsonString(handle: Long, jsonStr: String): Boolean

        @JvmStatic private external fun nativeQuerySetbackViolations(handle: Long, flatRoomCoords: DoubleArray): String

        @JvmStatic private external fun nativeProjectCoordinates(crs: String, lon: Double, lat: Double): DoubleArray

        @JvmStatic private external fun nativeComputeVariableBuffers(flatSegmentData: DoubleArray): DoubleArray

        private fun projectCoordinatesFallback(crs: String, lon: Double, lat: Double): Pair<Double, Double> {
            if (crs == "EPSG:3857") {
                return lon to lat
            }
            val rad = lat * PI / 180.0
            val px = lon * 111319.49
            val py = ln(tan(PI / 4.0 + rad / 2.0)) * 6378137.0
            return px to py
        }

        private fun computeVariableBuffersFallback(flatSegmentData: DoubleArray): DoubleArray {
            if (flatSegmentData.size < 5) return DoubleArray(0)
            val outerPoints = mutableListOf<Point2D>()
            val setbacks = mutableListOf<Double>()

            for (i in 0 until flatSegmentData.size - 4 step 5) {
                outerPoints.add(Point2D(flatSegmentData[i], flatSegmentData[i + 1]))
                setbacks.add(flatSegmentData[i + 4])
            }

            if (outerPoints.size < 3) return DoubleArray(0)

            val isCCW = polygonAreaFallback(outerPoints) > 0.0
            val n = outerPoints.size

            data class OffLine(val p1: Point2D, val p2: Point2D)
            val offLines = mutableListOf<OffLine>()

            for (i in 0 until n) {
                val p1 = outerPoints[i]
                val p2 = outerPoints[(i + 1) % n]
                val sb = if (setbacks[i] > 0.0) setbacks[i] else 36.0

                val dx = p2.x - p1.x
                val dy = p2.y - p1.y
                val len = if (hypot(dx, dy) < 1e-6) 1.0 else hypot(dx, dy)

                val nx = if (isCCW) -dy / len else dy / len
                val ny = if (isCCW) dx / len else dx / len

                val off1 = Point2D(p1.x + nx * sb, p1.y + ny * sb)
                val off2 = Point2D(p2.x + nx * sb, p2.y + ny * sb)
                offLines.add(OffLine(off1, off2))
            }

            val innerPoints = mutableListOf<Point2D>()
            for (i in 0 until n) {
                val prev = offLines[(i + n - 1) % n]
                val curr = offLines[i]
                val inter = lineIntersectionFallback(prev.p1, prev.p2, curr.p1, curr.p2)
                if (inter != null) {
                    innerPoints.add(Point2D(round(inter.x * 100.0) / 100.0, round(inter.y * 100.0) / 100.0))
                } else {
                    innerPoints.add(curr.p1)
                }
            }

            val res = DoubleArray(innerPoints.size * 2)
            var idx = 0
            for (pt in innerPoints) {
                res[idx++] = pt.x
                res[idx++] = pt.y
            }
            return res
        }

        private fun polygonAreaFallback(poly: List<Point2D>): Double {
            var area = 0.0
            val n = poly.size
            for (i in 0 until n) {
                val j = (i + 1) % n
                area += poly[i].x * poly[j].y - poly[j].x * poly[i].y
            }
            return area / 2.0
        }

        private fun lineIntersectionFallback(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): Point2D? {
            val dx1 = a2.x - a1.x
            val dy1 = a2.y - a1.y
            val dx2 = b2.x - b1.x
            val dy2 = b2.y - b1.y

            val denom = dx1 * dy2 - dy1 * dx2
            if (abs(denom) < 1e-9) return null

            val t1 = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom
            return Point2D(a1.x + t1 * dx1, a1.y + t1 * dy1)
        }

        private fun pointInPolygonFallback(p: Point2D, poly: List<Point2D>): Boolean {
            var inside = false
            val n = poly.size
            var j = n - 1
            for (i in 0 until n) {
                val xi = poly[i].x
                val yi = poly[i].y
                val xj = poly[j].x
                val yj = poly[j].y

                val intersect = ((yi > p.y) != (yj > p.y)) &&
                    (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)
                if (intersect) inside = !inside
                j = i
            }
            return inside
        }

        private fun extractNumbersFallback(str: String, key: String): List<Double> {
            val idx = str.indexOf("\"$key\"")
            if (idx == -1) return emptyList()
            val start = str.indexOf('[', idx)
            if (start == -1) return emptyList()
            val end = str.indexOf(']', start)
            if (end == -1) return emptyList()

            val arrStr = str.substring(start + 1, end)
            return arrStr.split(",")
                .map { it.replace("\"", "").replace("[", "").replace("]", "").trim() }
                .mapNotNull { it.toDoubleOrNull() }
        }

        private fun parseViolationJson(jsonStr: String): List<ViolationResult> {
            val list = mutableListOf<ViolationResult>()
            if (jsonStr.contains("setback-clearance")) {
                list.add(
                    ViolationResult(
                        type = "setback-clearance",
                        featureId = "setback-buffer",
                        msg = "Room vertex extends into setback buffer zone.",
                    ),
                )
            }
            if (jsonStr.contains("lot-boundary-exceeded")) {
                list.add(
                    ViolationResult(
                        type = "lot-boundary-exceeded",
                        featureId = "lot-boundary",
                        msg = "Room extends outside property lot boundary.",
                    ),
                )
            }
            return list
        }
    }
}
