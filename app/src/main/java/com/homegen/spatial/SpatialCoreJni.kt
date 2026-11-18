package com.homegen.spatial

import android.annotation.SuppressLint
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.lang.ref.Cleaner
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicLong
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

@SuppressLint("NewApi")
class SpatialCoreJni internal constructor(
    createHandle: () -> Long,
    destroyHandle: (Long) -> Unit,
) : AutoCloseable {

    constructor() : this(
        createHandle = defaultCreateHandle,
        destroyHandle = defaultDestroyHandle,
    )

    private class NativeCleanupState(
        initialHandle: Long,
        private val destroyFn: (Long) -> Unit,
    ) : Runnable {
        private val handleRef = AtomicLong(initialHandle)

        var nativeHandle: Long
            get() = handleRef.get()
            set(value) {
                handleRef.set(value)
            }

        override fun run() {
            val handleToDestroy = handleRef.getAndSet(0L)
            if (handleToDestroy != 0L) {
                destroyFn(handleToDestroy)
            }
        }
    }

    private val cleanupState: NativeCleanupState
    private val cleanable: Cleaner.Cleanable?

    private var nativeHandle: Long
        get() = cleanupState.nativeHandle
        set(value) {
            cleanupState.nativeHandle = value
        }

    // Fallback state if native is absent
    private var fallbackLotBoundary: List<Point2D> = emptyList()
    private var fallbackInnerBuildable: List<Point2D> = emptyList()
    private var fallbackCrs: String = DEFAULT_CRS

    val crs: String
        get() {
            val currentHandle = nativeHandle
            if (isNativeLoaded && currentHandle != 0L) {
                return nativeGetCrs(currentHandle)
            }
            return fallbackCrs
        }

    init {
        val createdHandle = createHandle()
        cleanupState = NativeCleanupState(createdHandle, destroyHandle)
        cleanable = if (createdHandle != 0L) {
            cleaner?.register(this, cleanupState)
        } else {
            null
        }
    }

    val handle: Long
        get() = nativeHandle

    fun loadJsonBuffer(buffer: ByteBuffer, length: Int): Boolean {
        val currentHandle = nativeHandle
        if (isNativeLoaded && currentHandle != 0L) {
            return nativeLoadJsonBuffer(currentHandle, buffer, length)
        }
        if (length <= 0) {
            loadJsonStringFallback("")
            return false
        }
        val dup = buffer.duplicate()
        val safeLength = length.coerceAtMost(dup.remaining())
        val bytes = ByteArray(safeLength)
        dup.get(bytes, 0, safeLength)
        val jsonStr = String(bytes, Charsets.UTF_8)
        return loadJsonStringFallback(jsonStr)
    }

    fun loadJsonString(jsonStr: String): Boolean {
        val currentHandle = nativeHandle
        if (isNativeLoaded && currentHandle != 0L) {
            return nativeLoadJsonString(currentHandle, jsonStr)
        }
        return loadJsonStringFallback(jsonStr)
    }

    fun querySetbackViolations(roomCoords: DoubleArray): List<ViolationResult> {
        val currentHandle = nativeHandle
        if (isNativeLoaded && currentHandle != 0L) {
            val jsonStr = nativeQuerySetbackViolations(currentHandle, roomCoords)
            return parseViolationJson(jsonStr)
        }
        return querySetbackViolationsFallback(roomCoords)
    }

    override fun close() {
        val registeredCleanable = cleanable
        if (registeredCleanable != null) {
            registeredCleanable.clean()
        } else {
            cleanupState.run()
        }
    }

    private fun loadJsonStringFallback(jsonStr: String): Boolean {
        fallbackLotBoundary = emptyList()
        fallbackInnerBuildable = emptyList()
        fallbackCrs = extractCrsFallback(jsonStr)

        val lotPts = extractNumbersFallback(jsonStr, "lotBoundary")
        if (lotPts.size >= 6) {
            val pts = toPolygonPoints(lotPts)
            if (pts.size >= 3) {
                fallbackLotBoundary = pts
            }
        }

        val innerPts = extractNumbersFallback(jsonStr, "innerPoints")
        if (innerPts.size >= 6) {
            val pts = toPolygonPoints(innerPts)
            if (pts.size >= 3) {
                fallbackInnerBuildable = pts
            }
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
        private const val DEFAULT_CRS = "EPSG:4326"

        @SuppressLint("NewApi")
        private val cleaner: Cleaner? = try {
            Cleaner.create()
        } catch (_: LinkageError) {
            null
        }

        private val defaultCreateHandle: () -> Long = {
            if (isNativeLoaded) nativeCreateEngine() else 0L
        }

        private val defaultDestroyHandle: (Long) -> Unit = { handle ->
            if (isNativeLoaded && handle != 0L) {
                nativeDestroyEngine(handle)
            }
        }

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

        @JvmStatic private external fun nativeGetCrs(handle: Long): String

        @JvmStatic private external fun nativeLoadJsonBuffer(handle: Long, directBuffer: ByteBuffer, length: Int): Boolean

        @JvmStatic private external fun nativeLoadJsonString(handle: Long, jsonStr: String): Boolean

        @JvmStatic private external fun nativeQuerySetbackViolations(handle: Long, flatRoomCoords: DoubleArray): String

        @JvmStatic private external fun nativeProjectCoordinates(crs: String, lon: Double, lat: Double): DoubleArray

        @JvmStatic private external fun nativeComputeVariableBuffers(flatSegmentData: DoubleArray): DoubleArray

        private fun isGeographicCrs(crs: String): Boolean {
            val upper = crs.uppercase()
            return upper == "EPSG:4326" || upper == "4326" || upper.contains("EPSG::4326") || upper.contains("EPSG:4326")
        }

        private fun projectCoordinatesFallback(crs: String, lon: Double, lat: Double): Pair<Double, Double> {
            if (!isGeographicCrs(crs)) {
                return lon to lat
            }
            val rad = lat * PI / 180.0
            val px = lon * 111319.49
            val py = ln(tan(PI / 4.0 + rad / 2.0)) * 6378137.0
            return px to py
        }

        private fun toPolygonPoints(coords: List<Double>): List<Point2D> {
            val pts = mutableListOf<Point2D>()
            for (i in 0 until coords.size - 1 step 2) {
                pts.add(Point2D(coords[i], coords[i + 1]))
            }
            if (pts.size > 3 && pts.first() == pts.last()) {
                pts.removeAt(pts.lastIndex)
            }
            return pts
        }

        private fun parseJsonRoot(raw: String): Any? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            return if (trimmed.startsWith("[")) {
                JSONArray(trimmed)
            } else {
                JSONObject(trimmed)
            }
        }

        internal fun extractCrsFallback(content: String): String {
            return try {
                val root = parseJsonRoot(content) ?: return DEFAULT_CRS
                extractCrsFromJsonNode(root) ?: DEFAULT_CRS
            } catch (_: JSONException) {
                DEFAULT_CRS
            }
        }

        private fun extractCrsFromJsonNode(node: Any?): String? {
            when (node) {
                is JSONObject -> {
                    if (node.has("crs") && !node.isNull("crs")) {
                        parseCrsElement(node.opt("crs"))?.let { return it }
                    }
                    node.optJSONObject("spatial")?.let { spatialObj ->
                        extractCrsFromJsonNode(spatialObj)?.let { return it }
                    }
                    val keys = node.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        if (k == "crs" || k == "spatial") continue
                        val child = node.opt(k)
                        if (child is JSONObject || child is JSONArray) {
                            extractCrsFromJsonNode(child)?.let { return it }
                        }
                    }
                }
                is JSONArray -> {
                    for (i in 0 until node.length()) {
                        val item = node.opt(i)
                        if (item is JSONObject || item is JSONArray) {
                            extractCrsFromJsonNode(item)?.let { return it }
                        }
                    }
                }
            }
            return null
        }

        private fun parseCrsElement(crsValue: Any?): String? {
            return when (crsValue) {
                null, JSONObject.NULL -> null
                is Number -> normalizeEpsgString(crsValue.toLong().toString(), allowBareDigits = true)
                is String -> normalizeEpsgString(crsValue, allowBareDigits = true)
                is JSONObject -> {
                    val props = crsValue.optJSONObject("properties")
                    if (props != null) {
                        for (propKey in listOf("name", "code", "epsg", "srid", "href")) {
                            if (props.has(propKey) && !props.isNull(propKey)) {
                                parseCrsElement(props.opt(propKey))?.let { return it }
                            }
                        }
                    }
                    for (directKey in listOf("name", "code", "epsg", "srid")) {
                        if (crsValue.has(directKey) && !crsValue.isNull(directKey)) {
                            parseCrsElement(crsValue.opt(directKey))?.let { return it }
                        }
                    }
                    null
                }
                else -> null
            }
        }

        private fun normalizeEpsgString(raw: String, allowBareDigits: Boolean): String? {
            val trimmed = raw.trim()
            if (trimmed.isEmpty()) return null
            val lower = trimmed.lowercase()

            if (lower.contains("crs84")) {
                return DEFAULT_CRS
            }

            val urnPrefix = "urn:ogc:def:crs:epsg:"
            val urnPos = lower.indexOf(urnPrefix)
            if (urnPos != -1) {
                val tail = trimmed.substring(urnPos + urnPrefix.length)
                val codeCandidate = tail.substringAfterLast(':').trim()
                if (codeCandidate.isNotEmpty() && codeCandidate.all { it.isDigit() }) {
                    return "EPSG:$codeCandidate"
                }
            }

            val epsgIdx = lower.indexOf("epsg")
            if (epsgIdx != -1) {
                var idx = epsgIdx + "epsg".length
                while (idx < trimmed.length && (trimmed[idx] == ':' || trimmed[idx] == '/' || trimmed[idx] == '#' || trimmed[idx].isWhitespace())) {
                    idx++
                }
                val sb = StringBuilder()
                while (idx < trimmed.length && trimmed[idx].isDigit()) {
                    sb.append(trimmed[idx++])
                }
                if (sb.isNotEmpty()) {
                    return "EPSG:$sb"
                }
            }

            if (allowBareDigits && trimmed.all { it.isDigit() }) {
                return "EPSG:$trimmed"
            }

            return null
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

        internal fun extractNumbersFallback(str: String, key: String): List<Double> {
            return try {
                val root = parseJsonRoot(str) ?: return emptyList()
                findKeyCoordinates(root, key)
                    ?: extractGeoJsonCoordinatesForKey(root, key)
                    ?: emptyList()
            } catch (_: JSONException) {
                emptyList()
            }
        }

        private fun findKeyCoordinates(node: Any?, key: String): List<Double>? {
            when (node) {
                is JSONObject -> {
                    if (node.has(key) && !node.isNull(key)) {
                        val extracted = extractCoordinatesFromValue(node.opt(key))
                        if (extracted.isNotEmpty()) {
                            return extracted
                        }
                    }
                    node.optJSONObject("spatial")?.let { spatialObj ->
                        findKeyCoordinates(spatialObj, key)?.let { return it }
                    }
                    val keys = node.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        if (k == key || k == "spatial") continue
                        val child = node.opt(k)
                        if (child is JSONObject || child is JSONArray) {
                            findKeyCoordinates(child, key)?.let { return it }
                        }
                    }
                }
                is JSONArray -> {
                    for (i in 0 until node.length()) {
                        val item = node.opt(i)
                        if (item is JSONObject || item is JSONArray) {
                            findKeyCoordinates(item, key)?.let { return it }
                        }
                    }
                }
            }
            return null
        }

        private fun extractGeoJsonCoordinatesForKey(node: Any?, key: String): List<Double>? {
            if (node !is JSONObject) return null

            node.optJSONObject("spatial")?.let { spatialObj ->
                extractGeoJsonCoordinatesForKey(spatialObj, key)?.let { return it }
            }

            node.optJSONArray("layers")?.let { layers ->
                for (i in 0 until layers.length()) {
                    val layer = layers.optJSONObject(i) ?: continue
                    val layerType = layer.optString("type", "")
                    if (key == "lotBoundary" && (layerType == "gisLotLine" || layerType == "lotLine")) {
                        val pts = extractCoordinatesFromValue(layer.opt("points") ?: layer.opt("polygon"))
                        if (pts.isNotEmpty()) return pts
                    } else if (key == "innerPoints" && (layerType == "gisSetbackBuffer" || layerType == "setback")) {
                        val pts = extractCoordinatesFromValue(layer.opt("innerPoints") ?: layer.opt("innerPolygon"))
                        if (pts.isNotEmpty()) return pts
                    }
                }
            }

            return when (node.optString("type", "")) {
                "FeatureCollection" -> {
                    val features = node.optJSONArray("features") ?: return null
                    extractFromFeatureArray(features, key)
                }
                "Feature" -> {
                    if (key == "innerPoints" && !isInnerSetbackFeature(node)) {
                        return null
                    }
                    extractGeometryCoordinates(node.optJSONObject("geometry"))
                }
                "Polygon", "MultiPolygon", "LineString", "MultiLineString", "MultiPoint", "Point" -> {
                    if (key == "lotBoundary") {
                        extractGeometryCoordinates(node)
                    } else {
                        null
                    }
                }
                else -> null
            }
        }

        private fun extractFromFeatureArray(features: JSONArray, key: String): List<Double>? {
            if (key == "innerPoints") {
                for (i in 0 until features.length()) {
                    val feat = features.optJSONObject(i) ?: continue
                    if (isInnerSetbackFeature(feat)) {
                        val coords = extractGeometryCoordinates(feat.optJSONObject("geometry"))
                        if (!coords.isNullOrEmpty()) return coords
                    }
                }
                return null
            }

            if (key == "lotBoundary") {
                for (i in 0 until features.length()) {
                    val feat = features.optJSONObject(i) ?: continue
                    if (isLotFeature(feat)) {
                        val coords = extractGeometryCoordinates(feat.optJSONObject("geometry"))
                        if (!coords.isNullOrEmpty()) return coords
                    }
                }
                for (i in 0 until features.length()) {
                    val feat = features.optJSONObject(i) ?: continue
                    if (!isInnerSetbackFeature(feat)) {
                        val coords = extractGeometryCoordinates(feat.optJSONObject("geometry"))
                        if (!coords.isNullOrEmpty()) return coords
                    }
                }
            }
            return null
        }

        private fun featureTagTokens(feature: JSONObject): List<String> {
            val tokens = mutableListOf<String>()
            val idStr = feature.optString("id", "")
            if (idStr.isNotEmpty()) tokens.add(idStr.lowercase())
            val props = feature.optJSONObject("properties")
            if (props != null) {
                for (field in listOf("layer", "type", "role", "kind", "name", "id")) {
                    val v = props.optString(field, "")
                    if (v.isNotEmpty()) tokens.add(v.lowercase())
                }
            }
            return tokens
        }

        private fun isLotFeature(feature: JSONObject): Boolean {
            val lotMarkers = setOf("lot", "lotboundary", "lot-boundary", "lot_boundary", "lotline", "gislotline", "parcel", "property")
            return featureTagTokens(feature).any { token -> token in lotMarkers }
        }

        private fun isInnerSetbackFeature(feature: JSONObject): Boolean {
            val innerMarkers = setOf(
                "innerpoints",
                "inner-points",
                "inner_points",
                "innerbuildable",
                "inner-buildable",
                "buildable",
                "setback",
                "setback-buffer",
                "gissetbackbuffer",
            )
            return featureTagTokens(feature).any { token -> token in innerMarkers }
        }

        private fun extractGeometryCoordinates(geometry: JSONObject?): List<Double>? {
            if (geometry == null) return null
            val geomType = geometry.optString("type", "")
            val coords = geometry.optJSONArray("coordinates") ?: return null
            return when (geomType) {
                "Polygon" -> {
                    val exteriorRing = coords.optJSONArray(0) ?: coords
                    extractCoordinatesFromArray(exteriorRing)
                }
                "MultiPolygon" -> {
                    val firstPolygon = coords.optJSONArray(0)
                    val exteriorRing = firstPolygon?.optJSONArray(0) ?: firstPolygon ?: coords
                    extractCoordinatesFromArray(exteriorRing)
                }
                else -> extractCoordinatesFromArray(coords)
            }
        }

        private fun extractCoordinatesFromValue(value: Any?): List<Double> {
            return when (value) {
                null, JSONObject.NULL -> emptyList()
                is JSONArray -> extractCoordinatesFromArray(value)
                is JSONObject -> {
                    if (value.has("geometry")) {
                        extractGeometryCoordinates(value.optJSONObject("geometry")) ?: emptyList()
                    } else if (value.has("coordinates")) {
                        extractGeometryCoordinates(value) ?: extractCoordinatesFromValue(value.opt("coordinates"))
                    } else if (value.has("points")) {
                        extractCoordinatesFromValue(value.opt("points"))
                    } else {
                        extractPointObjectCoords(value) ?: emptyList()
                    }
                }
                else -> emptyList()
            }
        }

        private fun extractCoordinatesFromArray(arr: JSONArray): List<Double> {
            val len = arr.length()
            if (len == 0) return emptyList()

            val first = arr.opt(0)
            if (first is JSONArray) {
                if (first.length() > 0 && first.opt(0) is JSONArray) {
                    return extractCoordinatesFromArray(first)
                }
                val result = mutableListOf<Double>()
                for (i in 0 until len) {
                    val sub = arr.optJSONArray(i) ?: continue
                    val scalars = extractScalarNumbers(sub)
                    if (scalars.size == 2 || scalars.size == 3) {
                        result.add(scalars[0])
                        result.add(scalars[1])
                    } else {
                        result.addAll(scalars)
                    }
                }
                return result
            }

            if (first is JSONObject) {
                val result = mutableListOf<Double>()
                for (i in 0 until len) {
                    val ptObj = arr.optJSONObject(i) ?: continue
                    val pair = extractPointObjectCoords(ptObj)
                    if (pair != null) {
                        result.addAll(pair)
                    }
                }
                return result
            }

            return extractScalarNumbers(arr)
        }

        private fun extractPointObjectCoords(obj: JSONObject): List<Double>? {
            val x = toFiniteDouble(obj.opt("x") ?: obj.opt("lon") ?: obj.opt("lng"))
            val y = toFiniteDouble(obj.opt("y") ?: obj.opt("lat"))
            return if (x != null && y != null) listOf(x, y) else null
        }

        private fun extractScalarNumbers(arr: JSONArray): List<Double> {
            val nums = mutableListOf<Double>()
            for (i in 0 until arr.length()) {
                toFiniteDouble(arr.opt(i))?.let { nums.add(it) }
            }
            return nums
        }

        private fun toFiniteDouble(value: Any?): Double? {
            return when (value) {
                is Number -> value.toDouble().takeIf { it.isFinite() }
                is String -> value.trim().toDoubleOrNull()?.takeIf { it.isFinite() }
                else -> null
            }
        }

        private fun parseViolationJson(jsonStr: String): List<ViolationResult> {
            val list = mutableListOf<ViolationResult>()
            try {
                val arr = JSONArray(jsonStr.trim())
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val type = obj.optString("type", "")
                    if (type.isNotEmpty()) {
                        list.add(
                            ViolationResult(
                                type = type,
                                featureId = obj.optString("featureId", ""),
                                msg = obj.optString("msg", ""),
                            ),
                        )
                    }
                }
            } catch (_: JSONException) {
                // Return empty list on invalid violation JSON
            }
            return list
        }
    }
}
