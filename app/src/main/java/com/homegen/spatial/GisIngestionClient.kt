package com.homegen.spatial

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sinh
import kotlin.math.tan

data class GisHttpRequest(
    val url: String,
    val method: String = "GET",
    val headers: Map<String, String> = emptyMap(),
    val body: ByteArray? = null,
)

data class GisHttpResponse(
    val statusCode: Int,
    val body: ByteArray,
    val contentType: String = "",
) {
    val isSuccessful: Boolean
        get() = statusCode in 200..299

    fun bodyAsUtf8(): String = String(body, Charsets.UTF_8)
}

fun interface GisHttpTransport {
    fun execute(request: GisHttpRequest): GisHttpResponse
}

class UrlConnectionGisTransport(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) : GisHttpTransport {
    override fun execute(request: GisHttpRequest): GisHttpResponse {
        val conn = (URL(request.url).openConnection() as HttpURLConnection).apply {
            requestMethod = request.method
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            setRequestProperty("User-Agent", "Homegen-Android-GIS-Client/1.0")
            for ((k, v) in request.headers) {
                setRequestProperty(k, v)
            }
            if (request.body != null) {
                doOutput = true
            }
        }
        return try {
            request.body?.let { payload ->
                conn.outputStream.use { out ->
                    out.write(payload)
                }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
            val contentType = conn.contentType ?: ""
            GisHttpResponse(statusCode = code, body = bytes, contentType = contentType)
        } finally {
            conn.disconnect()
        }
    }
}

data class GeoBoundingBox(
    val south: Double,
    val west: Double,
    val north: Double,
    val east: Double,
) {
    val centerLat: Double
        get() = (south + north) / 2.0

    val centerLon: Double
        get() = (west + east) / 2.0

    companion object {
        fun around(lat: Double, lon: Double, spanMeters: Double = 120.0): GeoBoundingBox {
            val halfSpan = max(10.0, spanMeters) / 2.0
            val latDelta = halfSpan / 111_320.0
            val cosLat = max(0.05, cos(lat * PI / 180.0))
            val lonDelta = halfSpan / (111_320.0 * cosLat)
            return GeoBoundingBox(
                south = max(-89.99, lat - latDelta),
                west = max(-180.0, lon - lonDelta),
                north = min(89.99, lat + latDelta),
                east = min(180.0, lon + lonDelta),
            )
        }
    }
}

data class GeocodeMatch(
    val lat: Double,
    val lon: Double,
    val displayName: String,
    val boundingBox: GeoBoundingBox,
    val provider: String,
    val attributionText: String? = null,
    val licenseUrl: String? = null,
)

data class ContourSegment2D(
    val x1: Double,
    val y1: Double,
    val x2: Double,
    val y2: Double,
)

data class ContourLevel(
    val elevation: Double,
    val isMajor: Boolean,
    val segments: List<ContourSegment2D>,
)

data class ElevationIngestionResult(
    val width: Int,
    val height: Int,
    val elevationsMeters: FloatArray,
    val minElevation: Double,
    val maxElevation: Double,
    val contours: List<ContourLevel>,
    val geoBounds: GeoBoundingBox,
    val provider: String,
    val attributionText: String,
    val licenseUrl: String,
)

data class ParcelIngestionResult(
    val geoJson: String,
    val featureCount: Int,
    val lotBoundaryInches: List<Double>,
    val geoBounds: GeoBoundingBox,
    val geocodeMatch: GeocodeMatch?,
    val provider: String,
    val attributionText: String,
    val licenseUrl: String,
)

enum class BasemapPreset(
    val id: String,
    val displayName: String,
    val provider: String,
    val attributionText: String,
    val licenseUrl: String,
    val tileUrlTemplate: String?,
    val defaultZoom: Int,
    val maxZoom: Int,
) {
    OPENSTREETMAP(
        id = "openstreetmap",
        displayName = "OpenStreetMap",
        provider = "OpenStreetMap",
        attributionText = "© OpenStreetMap contributors",
        licenseUrl = "https://www.openstreetmap.org/copyright",
        tileUrlTemplate = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        defaultZoom = 18,
        maxZoom = 19,
    ),
    CARTO_POSITRON(
        id = "carto-positron",
        displayName = "CARTO Positron",
        provider = "CARTO",
        attributionText = "© OpenStreetMap contributors © CARTO",
        licenseUrl = "https://carto.com/attributions",
        tileUrlTemplate = "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        defaultZoom = 18,
        maxZoom = 19,
    ),
    USGS_TOPO(
        id = "usgs-topo",
        displayName = "USGS Topo",
        provider = "USGS",
        attributionText = "Map services and data available from U.S. Geological Survey, National Geospatial Program.",
        licenseUrl = "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits",
        tileUrlTemplate = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
        defaultZoom = 16,
        maxZoom = 16,
    ),
    COPERNICUS_SENTINEL(
        id = "copernicus-sentinel",
        displayName = "Copernicus Sentinel",
        provider = "Copernicus",
        attributionText = "Contains modified Copernicus Sentinel data [2026]",
        licenseUrl = "https://sentinels.copernicus.eu/documents/247904/685211/Sentinel_Data_Legal_Notice.pdf",
        tileUrlTemplate = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
        defaultZoom = 14,
        maxZoom = 15,
    ),
    GOOGLE_SATELLITE(
        id = "google-satellite",
        displayName = "Google Satellite",
        provider = "Google Maps",
        attributionText = "Imagery © Google",
        licenseUrl = "https://cloud.google.com/maps-platform/terms",
        tileUrlTemplate = null,
        defaultZoom = 19,
        maxZoom = 20,
    ),
}

data class StitchedBasemapResult(
    val bitmap: Bitmap?,
    val pngBytes: ByteArray,
    val width: Int,
    val height: Int,
    val tileCount: Int,
    val geoBounds: GeoBoundingBox,
    val preset: BasemapPreset,
    val attributionText: String,
    val licenseUrl: String,
)

data class IngestedSiteBundle(
    val geocodeMatch: GeocodeMatch,
    val parcelResult: ParcelIngestionResult,
    val elevationResult: ElevationIngestionResult?,
    val basemapResult: StitchedBasemapResult?,
    val aggregatedAttribution: String,
    val aggregatedLicenses: List<String>,
)

/**
 * Serverless Android GIS ingestion client for Nominatim / Google geocoding, Overpass cadastral
 * & building footprint vectors, Open-Meteo / Google elevation grids & Marching Squares contours,
 * and slippy raster tile stitching.
 */
class GisIngestionClient(
    private val keyStore: GisApiKeyStore,
    private val rateLimiterRegistry: GisRateLimiterRegistry = GisRateLimiterRegistry(),
    private val transport: GisHttpTransport = UrlConnectionGisTransport(),
) {
    private fun executeRateLimited(request: GisHttpRequest): GisHttpResponse {
        val limiter = rateLimiterRegistry.limiterForUrl(request.url)
        return limiter.execute {
            transport.execute(request)
        }
    }

    fun geocode(query: String, spanMeters: Double = 120.0): GeocodeMatch {
        parseCoordinates(query, spanMeters)?.let { return it }
        val trimmed = query.trim()
        require(trimmed.isNotEmpty()) { "Enter a street address or latitude, longitude coordinates." }

        val apiKey = keyStore.getGoogleMapsApiKey()
        if (apiKey.isNotEmpty()) {
            try {
                val encodedAddr = URLEncoder.encode(trimmed, "UTF-8")
                val encodedKey = URLEncoder.encode(apiKey, "UTF-8")
                val url = "$GOOGLE_GEOCODE_URL?address=$encodedAddr&key=$encodedKey"
                val res = executeRateLimited(GisHttpRequest(url = url))
                if (res.isSuccessful) {
                    val json = JSONObject(res.bodyAsUtf8())
                    if (json.optString("status") == "OK") {
                        val results = json.optJSONArray("results")
                        val top = results?.optJSONObject(0)
                        val loc = top?.optJSONObject("geometry")?.optJSONObject("location")
                        if (loc != null) {
                            val lat = loc.optDouble("lat")
                            val lon = loc.optDouble("lng")
                            if (lat.isFinite() && lon.isFinite()) {
                                return GeocodeMatch(
                                    lat = lat,
                                    lon = lon,
                                    displayName = top.optString("formatted_address", trimmed),
                                    boundingBox = GeoBoundingBox.around(lat, lon, spanMeters),
                                    provider = "Google Maps",
                                    attributionText = "Geocoding © Google",
                                    licenseUrl = "https://cloud.google.com/maps-platform/terms",
                                )
                            }
                        }
                    }
                }
            } catch (_: Exception) {
                // Fall back to OpenStreetMap Nominatim if Google Geocoding is unavailable
            }
        }

        val encoded = URLEncoder.encode(trimmed, "UTF-8")
        val url = "$NOMINATIM_SEARCH_URL?format=jsonv2&limit=1&addressdetails=1&q=$encoded"
        val res = executeRateLimited(
            GisHttpRequest(
                url = url,
                headers = mapOf("Accept" to "application/json"),
            ),
        )
        if (!res.isSuccessful) {
            throw IOException("Nominatim geocoding failed with HTTP ${res.statusCode}")
        }
        val items = JSONArray(res.bodyAsUtf8())
        if (items.length() == 0) {
            throw IOException("No location found for \"$trimmed\"")
        }
        val best = items.getJSONObject(0)
        val lat = best.getString("lat").toDouble()
        val lon = best.getString("lon").toDouble()
        val bboxArr = best.optJSONArray("boundingbox")
        val bbox = if (bboxArr != null && bboxArr.length() >= 4) {
            val s = bboxArr.optString(0).toDoubleOrNull()
            val n = bboxArr.optString(1).toDoubleOrNull()
            val w = bboxArr.optString(2).toDoubleOrNull()
            val e = bboxArr.optString(3).toDoubleOrNull()
            if (s != null && n != null && w != null && e != null &&
                (n - s) * 111_320.0 in 15.0..200.0
            ) {
                GeoBoundingBox(south = s, west = w, north = n, east = e)
            } else {
                GeoBoundingBox.around(lat, lon, spanMeters)
            }
        } else {
            GeoBoundingBox.around(lat, lon, spanMeters)
        }

        return GeocodeMatch(
            lat = lat,
            lon = lon,
            displayName = best.optString("display_name", trimmed),
            boundingBox = bbox,
            provider = "OpenStreetMap Nominatim",
            attributionText = "© OpenStreetMap contributors",
            licenseUrl = "https://www.openstreetmap.org/copyright",
        )
    }

    fun fetchParcelVectors(
        query: String,
        crs: String = "EPSG:4326",
        spanMeters: Double = 120.0,
    ): ParcelIngestionResult {
        val match = geocode(query, spanMeters)
        return fetchParcelVectorsForBounds(
            geoBounds = match.boundingBox,
            crs = crs,
            geocodeMatch = match,
        )
    }

    fun fetchParcelVectorsForBounds(
        geoBounds: GeoBoundingBox,
        crs: String = "EPSG:4326",
        geocodeMatch: GeocodeMatch? = null,
    ): ParcelIngestionResult {
        val bboxStr = String.format(
            Locale.US,
            "%.6f,%.6f,%.6f,%.6f",
            geoBounds.south,
            geoBounds.west,
            geoBounds.north,
            geoBounds.east,
        )
        val ql = "[out:json][timeout:15];(" +
            "way[\"boundary\"~\"parcel|lot|cadastre|property\"]($bboxStr);" +
            "way[\"parcel\"]($bboxStr);" +
            "way[\"landuse\"~\"residential|commercial|retail|industrial|allotments\"]($bboxStr);" +
            "way[\"building\"]($bboxStr);" +
            "relation[\"boundary\"~\"parcel|lot|cadastre\"]($bboxStr);" +
            "relation[\"building\"]($bboxStr);" +
            ");out body geom;"

        val encodedBody = "data=" + URLEncoder.encode(ql, "UTF-8")
        val res = executeRateLimited(
            GisHttpRequest(
                url = OVERPASS_INTERPRETER_URL,
                method = "POST",
                headers = mapOf("Content-Type" to "application/x-www-form-urlencoded;charset=UTF-8"),
                body = encodedBody.toByteArray(Charsets.UTF_8),
            ),
        )
        if (!res.isSuccessful) {
            throw IOException("Overpass vector query failed with HTTP ${res.statusCode}")
        }

        val payload = JSONObject(res.bodyAsUtf8())
        return convertOverpassToSpatialGeoJson(payload, geoBounds, crs, geocodeMatch)
    }

    fun importParcelsIntoSpatialCore(
        query: String,
        spatialCore: SpatialCoreJni,
        crs: String = "EPSG:4326",
        spanMeters: Double = 120.0,
    ): ParcelIngestionResult {
        val parcelResult = fetchParcelVectors(query = query, crs = crs, spanMeters = spanMeters)
        val loaded = spatialCore.loadJsonString(parcelResult.geoJson)
        if (!loaded) {
            throw IOException("SpatialCoreJni rejected fetched GeoJSON payload")
        }
        return parcelResult
    }

    fun fetchElevationAndContours(
        geoBounds: GeoBoundingBox,
        rows: Int = 10,
        cols: Int = 10,
        contourIntervalMeters: Double = 1.0,
        preferGoogle: Boolean = true,
        planWidthInches: Double = 1200.0,
        planHeightInches: Double = 900.0,
    ): ElevationIngestionResult {
        val safeRows = rows.coerceIn(2, 64)
        val safeCols = cols.coerceIn(2, 64)
        val lats = DoubleArray(safeRows * safeCols)
        val lons = DoubleArray(safeRows * safeCols)
        var idx = 0
        for (r in 0 until safeRows) {
            val v = r.toDouble() / max(1, safeRows - 1)
            val lat = geoBounds.north - v * (geoBounds.north - geoBounds.south)
            for (c in 0 until safeCols) {
                val u = c.toDouble() / max(1, safeCols - 1)
                val lon = geoBounds.west + u * (geoBounds.east - geoBounds.west)
                lats[idx] = lat
                lons[idx] = lon
                idx++
            }
        }

        val apiKey = keyStore.getGoogleMapsApiKey()
        var provider = "Copernicus DEM / Open-Meteo"
        var attributionText = "Elevation Data © Copernicus DEM / Open-Meteo"
        var licenseUrl = "https://sentinels.copernicus.eu/documents/247904/685211/Sentinel_Data_Legal_Notice.pdf"
        var values: FloatArray? = null

        if (preferGoogle && apiKey.isNotEmpty()) {
            values = tryFetchGoogleElevations(lats, lons, apiKey)
            if (values != null) {
                provider = "Google Maps"
                attributionText = "Elevation Data © Google"
                licenseUrl = "https://cloud.google.com/maps-platform/terms"
            }
        }

        if (values == null) {
            values = fetchOpenMeteoElevations(lats, lons)
        }

        var minElev = Double.POSITIVE_INFINITY
        var maxElev = Double.NEGATIVE_INFINITY
        for (v in values) {
            val d = v.toDouble()
            if (d < minElev) minElev = d
            if (d > maxElev) maxElev = d
        }
        if (!minElev.isFinite()) {
            minElev = 0.0
            maxElev = 0.0
        }

        val contours = computeMarchingSquaresContours(
            elevations = values,
            width = safeCols,
            height = safeRows,
            interval = max(0.1, contourIntervalMeters),
            planWidthInches = planWidthInches,
            planHeightInches = planHeightInches,
        )

        return ElevationIngestionResult(
            width = safeCols,
            height = safeRows,
            elevationsMeters = values,
            minElevation = minElev,
            maxElevation = maxElev,
            contours = contours,
            geoBounds = geoBounds,
            provider = provider,
            attributionText = attributionText,
            licenseUrl = licenseUrl,
        )
    }

    fun stitchBasemapTiles(
        preset: BasemapPreset,
        lat: Double,
        lon: Double,
        zoom: Int = preset.defaultZoom,
        tileCols: Int = 2,
        tileRows: Int = 2,
    ): StitchedBasemapResult {
        if (preset == BasemapPreset.GOOGLE_SATELLITE) {
            return fetchGoogleStaticSatellite(lat = lat, lon = lon, zoom = zoom)
        }
        val template = preset.tileUrlTemplate
            ?: throw IllegalArgumentException("Preset ${preset.id} has no tile template")

        val clampedZoom = zoom.coerceIn(1, preset.maxZoom)
        val cols = tileCols.coerceIn(1, 4)
        val rows = tileRows.coerceIn(1, 4)
        val tileSize = 256
        val width = cols * tileSize
        val height = rows * tileSize

        val (xFloat, yFloat) = lonLatToTileXY(lon, lat, clampedZoom)
        val maxIdx = max(0, (1 shl clampedZoom) - 1)
        val startX = (xFloat - cols / 2.0).roundToInt().coerceIn(0, max(0, maxIdx - cols + 1))
        val startY = (yFloat - rows / 2.0).roundToInt().coerceIn(0, max(0, maxIdx - rows + 1))

        val (west, north) = tileXYToLonLat(startX, startY, clampedZoom)
        val (east, south) = tileXYToLonLat(startX + cols, startY + rows, clampedZoom)
        val geoBounds = GeoBoundingBox(south = south, west = west, north = north, east = east)

        val tileBitmaps = mutableListOf<Triple<Int, Int, ByteArray>>()
        for (row in 0 until rows) {
            for (col in 0 until cols) {
                val tx = startX + col
                val ty = startY + row
                val url = template
                    .replace("{z}", clampedZoom.toString())
                    .replace("{x}", tx.toString())
                    .replace("{y}", ty.toString())
                val res = executeRateLimited(GisHttpRequest(url = url))
                if (res.isSuccessful && res.body.isNotEmpty()) {
                    tileBitmaps.add(Triple(col, row, res.body))
                }
            }
        }

        if (tileBitmaps.isEmpty()) {
            throw IOException("Failed to fetch raster tiles for preset ${preset.displayName}")
        }

        var stitchedBitmap: Bitmap? = null
        var pngBytes: ByteArray = tileBitmaps.first().third
        try {
            val canvasBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            if (canvasBitmap != null) {
                val canvas = Canvas(canvasBitmap)
                var drawn = 0
                for ((col, row, rawBytes) in tileBitmaps) {
                    val decoded = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size)
                    if (decoded != null) {
                        canvas.drawBitmap(
                            decoded,
                            (col * tileSize).toFloat(),
                            (row * tileSize).toFloat(),
                            null,
                        )
                        drawn++
                    }
                }
                stitchedBitmap = canvasBitmap
                if (drawn > 0) {
                    val out = ByteArrayOutputStream()
                    canvasBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                    val compressed = out.toByteArray()
                    if (compressed.isNotEmpty()) {
                        pngBytes = compressed
                    }
                }
            }
        } catch (_: Throwable) {
            // Non-Robolectric JVM fallback retains raw tile bytes when android.graphics is stubbed
        }

        return StitchedBasemapResult(
            bitmap = stitchedBitmap,
            pngBytes = pngBytes,
            width = width,
            height = height,
            tileCount = tileBitmaps.size,
            geoBounds = geoBounds,
            preset = preset,
            attributionText = preset.attributionText,
            licenseUrl = preset.licenseUrl,
        )
    }

    private fun fetchGoogleStaticSatellite(
        lat: Double,
        lon: Double,
        zoom: Int,
    ): StitchedBasemapResult {
        val apiKey = keyStore.getGoogleMapsApiKey()
        require(apiKey.isNotEmpty()) {
            "Enter a Google Maps API key to fetch Google Satellite imagery."
        }
        val clampedZoom = zoom.coerceIn(15, 20)
        val encodedKey = URLEncoder.encode(apiKey, "UTF-8")
        val centerStr = String.format(Locale.US, "%.6f,%.6f", lat, lon)
        val url = "$GOOGLE_STATIC_MAP_URL?center=$centerStr&zoom=$clampedZoom&size=640x640&scale=2&maptype=satellite&key=$encodedKey"
        val res = executeRateLimited(GisHttpRequest(url = url))
        if (!res.isSuccessful || res.body.isEmpty()) {
            throw IOException("Google Static Maps failed with HTTP ${res.statusCode}")
        }
        val decoded = try {
            BitmapFactory.decodeByteArray(res.body, 0, res.body.size)
        } catch (_: Throwable) {
            null
        }
        return StitchedBasemapResult(
            bitmap = decoded,
            pngBytes = res.body,
            width = decoded?.width ?: 1280,
            height = decoded?.height ?: 1280,
            tileCount = 1,
            geoBounds = GeoBoundingBox.around(lat, lon, 120.0),
            preset = BasemapPreset.GOOGLE_SATELLITE,
            attributionText = BasemapPreset.GOOGLE_SATELLITE.attributionText,
            licenseUrl = BasemapPreset.GOOGLE_SATELLITE.licenseUrl,
        )
    }

    fun ingestSite(
        query: String,
        spatialCore: SpatialCoreJni,
        includeElevation: Boolean = true,
        basemapPreset: BasemapPreset? = null,
        crs: String = "EPSG:4326",
    ): IngestedSiteBundle {
        val match = geocode(query)
        val parcelResult = fetchParcelVectorsForBounds(
            geoBounds = match.boundingBox,
            crs = crs,
            geocodeMatch = match,
        )
        val loaded = spatialCore.loadJsonString(parcelResult.geoJson)
        if (!loaded) {
            throw IOException("SpatialCoreJni rejected fetched GeoJSON payload")
        }

        val elevationResult = if (includeElevation) {
            fetchElevationAndContours(geoBounds = match.boundingBox)
        } else {
            null
        }

        val basemapResult = basemapPreset?.let { preset ->
            stitchBasemapTiles(preset = preset, lat = match.lat, lon = match.lon)
        }

        val (attribution, licenses) = aggregateAttributions(
            parcelResult = parcelResult,
            elevationResult = elevationResult,
            basemapResult = basemapResult,
        )

        return IngestedSiteBundle(
            geocodeMatch = match,
            parcelResult = parcelResult,
            elevationResult = elevationResult,
            basemapResult = basemapResult,
            aggregatedAttribution = attribution,
            aggregatedLicenses = licenses,
        )
    }

    private fun tryFetchGoogleElevations(
        lats: DoubleArray,
        lons: DoubleArray,
        apiKey: String,
    ): FloatArray? {
        return try {
            val out = FloatArray(lats.size)
            val chunkSize = 128
            var offset = 0
            val encodedKey = URLEncoder.encode(apiKey, "UTF-8")
            while (offset < lats.size) {
                val end = min(lats.size, offset + chunkSize)
                val locs = (offset until end).joinToString("|") { idx ->
                    String.format(Locale.US, "%.6f,%.6f", lats[idx], lons[idx])
                }
                val encodedLocs = URLEncoder.encode(locs, "UTF-8")
                val url = "$GOOGLE_ELEVATION_URL?locations=$encodedLocs&key=$encodedKey"
                val res = executeRateLimited(GisHttpRequest(url = url))
                if (!res.isSuccessful) return null
                val json = JSONObject(res.bodyAsUtf8())
                if (json.optString("status") != "OK") return null
                val arr = json.optJSONArray("results") ?: return null
                for (i in 0 until (end - offset)) {
                    val item = arr.optJSONObject(i) ?: return null
                    out[offset + i] = item.optDouble("elevation", 0.0).toFloat()
                }
                offset = end
            }
            out
        } catch (_: Exception) {
            null
        }
    }

    private fun fetchOpenMeteoElevations(
        lats: DoubleArray,
        lons: DoubleArray,
    ): FloatArray {
        val out = FloatArray(lats.size)
        val batchSize = 100
        var offset = 0
        while (offset < lats.size) {
            val end = min(lats.size, offset + batchSize)
            val latParam = (offset until end).joinToString(",") {
                String.format(Locale.US, "%.6f", lats[it])
            }
            val lonParam = (offset until end).joinToString(",") {
                String.format(Locale.US, "%.6f", lons[it])
            }
            val url = "$OPEN_METEO_ELEVATION_URL?latitude=$latParam&longitude=$lonParam"
            val res = executeRateLimited(GisHttpRequest(url = url))
            if (!res.isSuccessful) {
                throw IOException("Open-Meteo elevation query failed with HTTP ${res.statusCode}")
            }
            val json = JSONObject(res.bodyAsUtf8())
            val arr = json.optJSONArray("elevation")
                ?: throw IOException("Missing elevation array in Open-Meteo response")
            for (i in 0 until (end - offset)) {
                out[offset + i] = arr.optDouble(i, 0.0).toFloat()
            }
            offset = end
        }
        return out
    }

    private fun convertOverpassToSpatialGeoJson(
        payload: JSONObject,
        geoBounds: GeoBoundingBox,
        crs: String,
        geocodeMatch: GeocodeMatch?,
    ): ParcelIngestionResult {
        val elements = payload.optJSONArray("elements") ?: JSONArray()
        val cosLat = max(0.05, cos(geoBounds.centerLat * PI / 180.0))
        val inchesPerDegLon = 111_320.0 * cosLat * INCHES_PER_METER
        val inchesPerDegLat = 111_320.0 * INCHES_PER_METER

        fun projectPointToInches(lon: Double, lat: Double): Point2D {
            val x = (lon - geoBounds.west) * inchesPerDegLon
            val y = (lat - geoBounds.south) * inchesPerDegLat
            return Point2D(x = x, y = y)
        }

        val featuresJson = JSONArray()
        var primaryLotInches: List<Point2D>? = null

        for (i in 0 until elements.length()) {
            val el = elements.optJSONObject(i) ?: continue
            val geomArr = extractElementGeometry(el) ?: continue
            val pts = mutableListOf<Point2D>()
            for (j in 0 until geomArr.length()) {
                val g = geomArr.optJSONObject(j) ?: continue
                val lon = g.optDouble("lon", Double.NaN)
                val lat = g.optDouble("lat", Double.NaN)
                if (lon.isFinite() && lat.isFinite()) {
                    pts.add(projectPointToInches(lon, lat))
                }
            }
            if (pts.size > 3 && pts.first() == pts.last()) {
                pts.removeAt(pts.lastIndex)
            }
            if (pts.size < 3) continue
            val ccwPts = ensureCounterClockwise(pts)
            val tags = el.optJSONObject("tags")
            val isBuilding = tags?.has("building") == true
            val layerRole = if (isBuilding) "building" else "lot"
            if (layerRole == "lot" && (
                    primaryLotInches == null ||
                        abs(signedPolygonArea(ccwPts)) > abs(signedPolygonArea(primaryLotInches))
                    )
            ) {
                primaryLotInches = ccwPts
            }
            featuresJson.put(
                buildPolygonFeatureJson(
                    id = "osm-${el.optString("type", "way")}-${el.optLong("id", i.toLong())}",
                    name = tags?.optString("name")?.takeIf { it.isNotEmpty() }
                        ?: if (isBuilding) "Existing Building Footprint" else "Cadastral Parcel",
                    layer = layerRole,
                    points = ccwPts,
                ),
            )
        }

        if (primaryLotInches == null) {
            val insetLon = (geoBounds.east - geoBounds.west) * 0.1
            val insetLat = (geoBounds.north - geoBounds.south) * 0.1
            val fallbackLot = ensureCounterClockwise(
                listOf(
                    projectPointToInches(geoBounds.west + insetLon, geoBounds.south + insetLat),
                    projectPointToInches(geoBounds.east - insetLon, geoBounds.south + insetLat),
                    projectPointToInches(geoBounds.east - insetLon, geoBounds.north - insetLat),
                    projectPointToInches(geoBounds.west + insetLon, geoBounds.north - insetLat),
                ),
            )
            primaryLotInches = fallbackLot
            val fallbackArray = JSONArray()
            fallbackArray.put(
                buildPolygonFeatureJson(
                    id = "site-parcel-lot",
                    name = geocodeMatch?.displayName?.substringBefore(",")?.let { "Site Parcel ($it)" }
                        ?: "Site Parcel Boundary",
                    layer = "lot",
                    points = fallbackLot,
                ),
            )
            for (k in 0 until featuresJson.length()) {
                fallbackArray.put(featuresJson.get(k))
            }
            while (featuresJson.length() > 0) {
                featuresJson.remove(featuresJson.length() - 1)
            }
            for (k in 0 until fallbackArray.length()) {
                featuresJson.put(fallbackArray.get(k))
            }
        }

        val flatLot = mutableListOf<Double>()
        val lotPoly = primaryLotInches
        for (pt in lotPoly) {
            flatLot.add(pt.x)
            flatLot.add(pt.y)
        }

        val flatLotJson = JSONArray()
        for (v in flatLot) {
            flatLotJson.put(v)
        }

        val root = JSONObject().apply {
            put("type", "FeatureCollection")
            put(
                "crs",
                JSONObject().apply {
                    put("type", "name")
                    put("properties", JSONObject().put("name", crs))
                },
            )
            put("lotBoundary", flatLotJson)
            put("features", featuresJson)
            put(
                "metadata",
                JSONObject().apply {
                    put("provider", "OpenStreetMap / Overpass API")
                    put("attributionText", "© OpenStreetMap contributors")
                    put("licenseUrl", "https://www.openstreetmap.org/copyright")
                    put("originLat", geoBounds.centerLat)
                    put("originLon", geoBounds.centerLon)
                },
            )
        }

        return ParcelIngestionResult(
            geoJson = root.toString(),
            featureCount = featuresJson.length(),
            lotBoundaryInches = flatLot,
            geoBounds = geoBounds,
            geocodeMatch = geocodeMatch,
            provider = "OpenStreetMap / Overpass API",
            attributionText = "© OpenStreetMap contributors",
            licenseUrl = "https://www.openstreetmap.org/copyright",
        )
    }

    private fun extractElementGeometry(el: JSONObject): JSONArray? {
        el.optJSONArray("geometry")?.let { if (it.length() >= 3) return it }
        val members = el.optJSONArray("members") ?: return null
        for (i in 0 until members.length()) {
            val member = members.optJSONObject(i) ?: continue
            val role = member.optString("role", "")
            if (role.isEmpty() || role == "outer") {
                val geom = member.optJSONArray("geometry")
                if (geom != null && geom.length() >= 3) return geom
            }
        }
        return null
    }

    private fun buildPolygonFeatureJson(
        id: String,
        name: String,
        layer: String,
        points: List<Point2D>,
    ): JSONObject {
        val ring = JSONArray()
        for (pt in points) {
            ring.put(JSONArray().put(pt.x).put(pt.y))
        }
        if (points.isNotEmpty()) {
            ring.put(JSONArray().put(points.first().x).put(points.first().y))
        }
        return JSONObject().apply {
            put("type", "Feature")
            put("id", id)
            put(
                "properties",
                JSONObject().apply {
                    put("name", name)
                    put("layer", layer)
                    put("setback", 36.0)
                },
            )
            put(
                "geometry",
                JSONObject().apply {
                    put("type", "Polygon")
                    put("coordinates", JSONArray().put(ring))
                },
            )
        }
    }

    companion object {
        const val NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
        const val OVERPASS_INTERPRETER_URL = "https://overpass-api.de/api/interpreter"
        const val OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
        const val GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
        const val GOOGLE_ELEVATION_URL = "https://maps.googleapis.com/maps/api/elevation/json"
        const val GOOGLE_STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap"
        private const val INCHES_PER_METER = 39.37007874

        private val COORD_REGEX = Regex(
            "^([+-]?\\d+(?:\\.\\d+)?)\\s*°?\\s*([NSns])?\\s*[,;\\s]+\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*°?\\s*([EWew])?$",
        )

        fun parseCoordinates(query: String, spanMeters: Double = 120.0): GeocodeMatch? {
            val match = COORD_REGEX.matchEntire(query.trim()) ?: return null
            var first = match.groupValues[1].toDoubleOrNull() ?: return null
            val dir1 = match.groupValues[2].uppercase(Locale.US)
            var second = match.groupValues[3].toDoubleOrNull() ?: return null
            val dir2 = match.groupValues[4].uppercase(Locale.US)

            if (dir1 == "S") {
                first = -abs(first)
            } else if (dir1 == "N") {
                first = abs(first)
            }
            if (dir2 == "W") {
                second = -abs(second)
            } else if (dir2 == "E") {
                second = abs(second)
            }

            var lat = first
            var lon = second
            if (abs(first) > 90.0 && abs(first) <= 180.0 && abs(second) <= 90.0) {
                lon = first
                lat = second
            }
            if (abs(lat) > 90.0 || abs(lon) > 180.0) return null

            return GeocodeMatch(
                lat = lat,
                lon = lon,
                displayName = String.format(Locale.US, "%.5f, %.5f", lat, lon),
                boundingBox = GeoBoundingBox.around(lat, lon, spanMeters),
                provider = "Coordinates",
            )
        }

        fun aggregateAttributions(
            parcelResult: ParcelIngestionResult? = null,
            elevationResult: ElevationIngestionResult? = null,
            basemapResult: StitchedBasemapResult? = null,
        ): Pair<String, List<String>> {
            val attrs = LinkedHashSet<String>()
            val licenses = LinkedHashSet<String>()

            basemapResult?.let {
                if (it.attributionText.isNotBlank()) attrs.add(it.attributionText.trim())
                if (it.licenseUrl.isNotBlank()) licenses.add(it.licenseUrl.trim())
            }
            parcelResult?.let {
                if (it.attributionText.isNotBlank()) attrs.add(it.attributionText.trim())
                if (it.licenseUrl.isNotBlank()) licenses.add(it.licenseUrl.trim())
            }
            elevationResult?.let {
                if (it.attributionText.isNotBlank()) attrs.add(it.attributionText.trim())
                if (it.licenseUrl.isNotBlank()) licenses.add(it.licenseUrl.trim())
            }

            return attrs.joinToString(" · ") to licenses.toList()
        }

        fun lonLatToTileXY(lon: Double, lat: Double, zoom: Int): Pair<Double, Double> {
            val n = 2.0.pow(zoom.toDouble())
            val clampedLat = lat.coerceIn(-85.05112878, 85.05112878)
            val latRad = clampedLat * PI / 180.0
            val x = ((lon + 180.0) / 360.0) * n
            val y = ((1.0 - ln(tan(latRad) + 1.0 / cos(latRad)) / PI) / 2.0) * n
            return x to y
        }

        fun tileXYToLonLat(x: Int, y: Int, zoom: Int): Pair<Double, Double> {
            val n = 2.0.pow(zoom.toDouble())
            val lon = (x.toDouble() / n) * 360.0 - 180.0
            val latRad = atan(sinh(PI * (1.0 - (2.0 * y.toDouble()) / n)))
            val lat = (latRad * 180.0) / PI
            return lon to lat
        }

        internal fun computeMarchingSquaresContours(
            elevations: FloatArray,
            width: Int,
            height: Int,
            interval: Double,
            planWidthInches: Double = 1200.0,
            planHeightInches: Double = 900.0,
        ): List<ContourLevel> {
            if (width < 2 || height < 2 || elevations.size < width * height) return emptyList()
            var minVal = Double.POSITIVE_INFINITY
            var maxVal = Double.NEGATIVE_INFINITY
            for (v in elevations) {
                val d = v.toDouble()
                if (d < minVal) minVal = d
                if (d > maxVal) maxVal = d
            }
            if (!minVal.isFinite() || maxVal <= minVal) return emptyList()

            val startIdx = ceil(minVal / interval).toInt()
            val endIdx = floor(maxVal / interval).toInt()
            if (endIdx < startIdx) return emptyList()

            val cellW = planWidthInches / (width - 1).toDouble()
            val cellH = planHeightInches / (height - 1).toDouble()
            val levels = mutableListOf<ContourLevel>()

            for (lvlIdx in startIdx..endIdx) {
                val iso = lvlIdx * interval
                val segs = mutableListOf<ContourSegment2D>()
                for (r in 0 until height - 1) {
                    for (c in 0 until width - 1) {
                        val v0 = elevations[r * width + c].toDouble()
                        val v1 = elevations[r * width + c + 1].toDouble()
                        val v2 = elevations[(r + 1) * width + c + 1].toDouble()
                        val v3 = elevations[(r + 1) * width + c].toDouble()

                        var mask = 0
                        if (v3 >= iso) mask = mask or 1
                        if (v2 >= iso) mask = mask or 2
                        if (v1 >= iso) mask = mask or 4
                        if (v0 >= iso) mask = mask or 8
                        if (mask == 0 || mask == 15) continue

                        fun interpEdge(edge: Int): Point2D {
                            val x0 = c * cellW
                            val x1 = (c + 1) * cellW
                            val y0 = r * cellH
                            val y1 = (r + 1) * cellH
                            return when (edge) {
                                0 -> {
                                    val t = if (abs(v1 - v0) < 1e-9) 0.5 else ((iso - v0) / (v1 - v0)).coerceIn(0.0, 1.0)
                                    Point2D(x0 + t * cellW, y0)
                                }
                                1 -> {
                                    val t = if (abs(v2 - v1) < 1e-9) 0.5 else ((iso - v1) / (v2 - v1)).coerceIn(0.0, 1.0)
                                    Point2D(x1, y0 + t * cellH)
                                }
                                2 -> {
                                    val t = if (abs(v2 - v3) < 1e-9) 0.5 else ((iso - v3) / (v2 - v3)).coerceIn(0.0, 1.0)
                                    Point2D(x0 + t * cellW, y1)
                                }
                                else -> {
                                    val t = if (abs(v3 - v0) < 1e-9) 0.5 else ((iso - v0) / (v3 - v0)).coerceIn(0.0, 1.0)
                                    Point2D(x0, y0 + t * cellH)
                                }
                            }
                        }

                        val pairs = MARCHING_SQUARES_EDGES[mask]
                        for (pair in pairs) {
                            val pA = interpEdge(pair.first)
                            val pB = interpEdge(pair.second)
                            segs.add(ContourSegment2D(pA.x, pA.y, pB.x, pB.y))
                        }
                    }
                }
                if (segs.isNotEmpty()) {
                    levels.add(
                        ContourLevel(
                            elevation = iso,
                            isMajor = lvlIdx % 5 == 0,
                            segments = segs,
                        ),
                    )
                }
            }
            return levels
        }

        private val MARCHING_SQUARES_EDGES: Array<List<Pair<Int, Int>>> = arrayOf(
            emptyList(),
            listOf(3 to 2),
            listOf(2 to 1),
            listOf(3 to 1),
            listOf(1 to 0),
            listOf(3 to 0, 1 to 2),
            listOf(2 to 0),
            listOf(3 to 0),
            listOf(0 to 3),
            listOf(0 to 2),
            listOf(0 to 1, 2 to 3),
            listOf(0 to 1),
            listOf(1 to 3),
            listOf(1 to 2),
            listOf(2 to 3),
            emptyList(),
        )

        private fun signedPolygonArea(pts: List<Point2D>): Double {
            if (pts.size < 3) return 0.0
            var area = 0.0
            for (i in pts.indices) {
                val j = (i + 1) % pts.size
                area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
            }
            return area / 2.0
        }

        private fun ensureCounterClockwise(pts: List<Point2D>): List<Point2D> {
            return if (signedPolygonArea(pts) < 0.0) pts.reversed() else pts
        }
    }
}
