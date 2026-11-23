package com.homegen.spatial

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.core.app.ApplicationProvider
import com.homegen.designer3d.model.Room
import com.homegen.designer3d.serialization.ProjectSerializer
import com.homegen.designer3d.serialization.SpatialData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicLong

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GisIngestionClientTest {

    private fun makeTinyPngBytes(): ByteArray {
        val bmp = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.rgb(210, 225, 240))
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        return out.toByteArray()
    }

    @Test
    fun `AndroidManifest declares android permission INTERNET`() {
        val candidates = listOf(
            File("src/main/AndroidManifest.xml"),
            File("app/src/main/AndroidManifest.xml"),
        )
        val manifestFile = candidates.firstOrNull { it.exists() }
        assertNotNull("AndroidManifest.xml must exist", manifestFile)
        val xml = manifestFile!!.readText()
        assertTrue(
            "AndroidManifest.xml must declare android.permission.INTERNET",
            xml.contains("android.permission.INTERNET"),
        )
    }

    @Test
    fun `GisApiKeyStore stores Google Maps key in SharedPreferences only and never leaks into ProjectSerializer`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val keyStore = GisApiKeyStore(context)
        val secretKey = "AIzaAndroidPersonalKey_DO_NOT_SERIALIZE"
        keyStore.setGoogleMapsApiKey(secretKey)

        assertEquals(secretKey, keyStore.getGoogleMapsApiKey())

        val reloadedStore = GisApiKeyStore(context)
        assertEquals(secretKey, reloadedStore.getGoogleMapsApiKey())

        val serializer = ProjectSerializer()
        val encodedJson = serializer.encode(
            objects = listOf(Room(name = "Living Room")),
            spatialData = SpatialData(
                crs = "EPSG:4326",
                lotBoundary = listOf(0.0, 0.0, 1200.0, 0.0, 1200.0, 900.0, 0.0, 900.0),
            ),
        )
        assertFalse(
            "Encoded ProjectFile JSON must never include Google Maps API key",
            encodedJson.contains(secretKey),
        )

        keyStore.clearGoogleMapsApiKey()
        assertEquals("", keyStore.getGoogleMapsApiKey())
    }

    @Test
    fun `GisRateLimiterRegistry caps Nominatim and Overpass at 1 request per second independently of tile hosts`() {
        val fakeClockMs = AtomicLong(1_000L)
        val sleptDurations = mutableListOf<Long>()
        val registry = GisRateLimiterRegistry(
            clockMs = { fakeClockMs.get() },
            sleepMs = { ms ->
                sleptDurations.add(ms)
                fakeClockMs.addAndGet(ms)
            },
        )

        val nominatimLimiter = registry.limiterForUrl("https://nominatim.openstreetmap.org/search?q=sf")
        val overpassLimiter = registry.limiterForUrl("https://overpass-api.de/api/interpreter")
        val tileLimiter = registry.limiterForUrl("https://tile.openstreetmap.org/18/41935/101311.png")

        assertEquals(1, nominatimLimiter.config.capacity)
        assertEquals(1.0, nominatimLimiter.config.refillPerSecond, 0.001)
        assertEquals(1, nominatimLimiter.config.maxConcurrency)
        assertEquals(1, overpassLimiter.config.capacity)

        // First Nominatim call executes immediately without sleeping
        nominatimLimiter.execute { "first" }
        assertTrue(sleptDurations.isEmpty())

        // Overpass bucket is independent from Nominatim, so first Overpass call also executes immediately
        overpassLimiter.execute { "overpass-first" }
        assertTrue(sleptDurations.isEmpty())

        // Tile host has higher capacity and does not sleep
        tileLimiter.execute { "tile-1" }
        tileLimiter.execute { "tile-2" }
        assertTrue(sleptDurations.isEmpty())

        // Immediate second Nominatim call within same millisecond sleeps ~1000ms to honor 1 req/s cap
        nominatimLimiter.execute { "second" }
        assertTrue(sleptDurations.sum() >= 1000L)
    }

    @Test
    fun `ingestSite geocodes, imports Overpass GeoJSON into SpatialCoreJni, generates contours, and stitches basemap`() {
        val keyStore = GisApiKeyStore.inMemoryForTesting()
        val pngBytes = makeTinyPngBytes()

        val transport = GisHttpTransport { req ->
            when {
                req.url.contains("nominatim.openstreetmap.org") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "application/json",
                    body = """
                        [
                          {
                            "lat": "37.7749",
                            "lon": "-122.4194",
                            "display_name": "Civic Center Parcel, San Francisco, CA",
                            "boundingbox": ["37.7744", "37.7754", "-122.4200", "-122.4188"]
                          }
                        ]
                    """.trimIndent().toByteArray(Charsets.UTF_8),
                )
                req.url.contains("overpass-api.de") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "application/json",
                    body = """
                        {
                          "elements": [
                            {
                              "type": "way",
                              "id": 7001,
                              "tags": { "boundary": "parcel", "name": "Lot 7001" },
                              "geometry": [
                                { "lon": -122.4199, "lat": 37.7745 },
                                { "lon": -122.4189, "lat": 37.7745 },
                                { "lon": -122.4189, "lat": 37.7753 },
                                { "lon": -122.4199, "lat": 37.7753 },
                                { "lon": -122.4199, "lat": 37.7745 }
                              ]
                            }
                          ]
                        }
                    """.trimIndent().toByteArray(Charsets.UTF_8),
                )
                req.url.contains("api.open-meteo.com") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "application/json",
                    body = """
                        {
                          "elevation": [
                            10,11,12,13,14,15,16,17,18,19,
                            11,12,13,14,15,16,17,18,19,20,
                            12,13,14,15,16,17,18,19,20,21,
                            13,14,15,16,17,18,19,20,21,22,
                            14,15,16,17,18,19,20,21,22,23,
                            15,16,17,18,19,20,21,22,23,24,
                            16,17,18,19,20,21,22,23,24,25,
                            17,18,19,20,21,22,23,24,25,26,
                            18,19,20,21,22,23,24,25,26,27,
                            19,20,21,22,23,24,25,26,27,28
                          ]
                        }
                    """.trimIndent().toByteArray(Charsets.UTF_8),
                )
                req.url.contains("basemap.nationalmap.gov") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "image/png",
                    body = pngBytes,
                )
                else -> GisHttpResponse(statusCode = 404, body = ByteArray(0))
            }
        }

        val fakeClock = AtomicLong(1_000L)
        val registry = GisRateLimiterRegistry(
            clockMs = { fakeClock.get() },
            sleepMs = { ms -> fakeClock.addAndGet(ms) },
        )
        val client = GisIngestionClient(
            keyStore = keyStore,
            rateLimiterRegistry = registry,
            transport = transport,
        )

        SpatialCoreJni().use { spatialCore ->
            val bundle = client.ingestSite(
                query = "Civic Center, San Francisco",
                spatialCore = spatialCore,
                includeElevation = true,
                basemapPreset = BasemapPreset.USGS_TOPO,
                crs = "EPSG:4326",
            )

            assertEquals("OpenStreetMap Nominatim", bundle.geocodeMatch.provider)
            assertTrue(bundle.parcelResult.featureCount >= 1)
            assertTrue(bundle.parcelResult.lotBoundaryInches.size >= 8)

            // Verify SpatialCoreJni loaded the fetched GeoJSON and evaluates room setbacks accurately
            val lot = bundle.parcelResult.lotBoundaryInches
            val minX = lot.filterIndexed { idx, _ -> idx % 2 == 0 }.minOrNull()!!
            val maxX = lot.filterIndexed { idx, _ -> idx % 2 == 0 }.maxOrNull()!!
            val minY = lot.filterIndexed { idx, _ -> idx % 2 == 1 }.minOrNull()!!
            val maxY = lot.filterIndexed { idx, _ -> idx % 2 == 1 }.maxOrNull()!!
            val cx = (minX + maxX) / 2.0
            val cy = (minY + maxY) / 2.0

            // Centered 10ft x 10ft room well inside lot setbacks has 0 violations
            val validRoom = doubleArrayOf(
                cx - 60.0,
                cy - 60.0,
                cx + 60.0,
                cy - 60.0,
                cx + 60.0,
                cy + 60.0,
                cx - 60.0,
                cy + 60.0,
            )
            assertTrue(spatialCore.querySetbackViolations(validRoom).isEmpty())

            // Room placed 6 inches inside outer parcel edge triggers setback-clearance violation
            val encroachingRoom = doubleArrayOf(
                minX + 6.0,
                minY + 6.0,
                minX + 126.0,
                minY + 6.0,
                minX + 126.0,
                minY + 126.0,
                minX + 6.0,
                minY + 126.0,
            )
            val violations = spatialCore.querySetbackViolations(encroachingRoom)
            assertTrue(violations.any { it.type == "setback-clearance" })

            // Verify elevation contours & stitched basemap Bitmap + aggregated attributions
            val elev = bundle.elevationResult
            assertNotNull(elev)
            assertTrue(elev!!.contours.isNotEmpty())
            assertEquals(10.0, elev.minElevation, 0.01)
            assertEquals(28.0, elev.maxElevation, 0.01)

            val basemap = bundle.basemapResult
            assertNotNull(basemap)
            assertNotNull(basemap!!.bitmap)
            assertEquals(512, basemap.width)
            assertEquals(512, basemap.height)
            assertEquals(4, basemap.tileCount)

            assertTrue(bundle.aggregatedAttribution.contains("U.S. Geological Survey"))
            assertTrue(bundle.aggregatedAttribution.contains("© OpenStreetMap contributors"))
            assertTrue(bundle.aggregatedAttribution.contains("Copernicus DEM / Open-Meteo"))
            assertTrue(bundle.aggregatedLicenses.contains("https://www.openstreetmap.org/copyright"))
        }
    }

    @Test
    fun `Google API key enables Google Geocoding, Google Elevation, and Google Satellite basemap`() {
        val keyStore = GisApiKeyStore.inMemoryForTesting("AIzaGoogleAndroidKey")
        val pngBytes = makeTinyPngBytes()
        val transport = GisHttpTransport { req ->
            when {
                req.url.contains("maps.googleapis.com/maps/api/geocode/json") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "application/json",
                    body = """
                        {
                          "status": "OK",
                          "results": [
                            {
                              "formatted_address": "1600 Amphitheatre Pkwy, Mountain View, CA",
                              "geometry": { "location": { "lat": 37.422, "lng": -122.0841 } }
                            }
                          ]
                        }
                    """.trimIndent().toByteArray(Charsets.UTF_8),
                )
                req.url.contains("maps.googleapis.com/maps/api/elevation/json") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "application/json",
                    body = """
                        {
                          "status": "OK",
                          "results": [
                            { "elevation": 12.0 },
                            { "elevation": 14.0 },
                            { "elevation": 16.0 },
                            { "elevation": 18.0 }
                          ]
                        }
                    """.trimIndent().toByteArray(Charsets.UTF_8),
                )
                req.url.contains("maps.googleapis.com/maps/api/staticmap") -> GisHttpResponse(
                    statusCode = 200,
                    contentType = "image/png",
                    body = pngBytes,
                )
                else -> GisHttpResponse(statusCode = 404, body = ByteArray(0))
            }
        }

        val client = GisIngestionClient(
            keyStore = keyStore,
            rateLimiterRegistry = GisRateLimiterRegistry(),
            transport = transport,
        )

        val match = client.geocode("1600 Amphitheatre Pkwy")
        assertEquals("Google Maps", match.provider)
        assertEquals(37.422, match.lat, 0.001)

        val elev = client.fetchElevationAndContours(
            geoBounds = match.boundingBox,
            rows = 2,
            cols = 2,
            contourIntervalMeters = 2.0,
        )
        assertEquals("Google Maps", elev.provider)
        assertEquals(18.0, elev.maxElevation, 0.01)
        assertTrue(elev.contours.isNotEmpty())

        val sat = client.stitchBasemapTiles(
            preset = BasemapPreset.GOOGLE_SATELLITE,
            lat = match.lat,
            lon = match.lon,
        )
        assertEquals("Imagery © Google", sat.attributionText)
        assertTrue(sat.pngBytes.isNotEmpty())
    }
}
