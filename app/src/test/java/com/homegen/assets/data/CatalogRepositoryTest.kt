package com.homegen.assets.data

import android.content.Context
import android.content.res.AssetManager
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.CatalogCategory
import com.homegen.assets.model.Dimensions3
import com.homegen.assets.model.MaterialAsset
import com.homegen.assets.model.MaterialCategory
import com.homegen.assets.model.PlaceableAsset
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.io.ByteArrayInputStream
import kotlin.test.assertEquals
import kotlin.test.assertNotSame
import kotlin.test.assertSame

class CatalogRepositoryTest {

    private lateinit var context: Context
    private lateinit var assetManager: AssetManager
    private lateinit var repository: CatalogRepository

    private val sampleJson = """
        {
            "version": 1,
            "materials": [],
            "placeableObjects": []
        }
    """.trimIndent()

    private val sampleCatalog = Catalog(
        version = 1,
        materials = listOf(
            MaterialAsset(
                id = "mat_oak",
                name = "Oak Wood",
                category = MaterialCategory.floors,
                tags = listOf("scandinavian", "wood"),
                texturePath = "textures/oak.png",
                thumbnailPath = "thumbs/oak.png",
            ),
        ),
        placeableObjects = listOf(
            PlaceableAsset(
                id = "chair_nordic",
                name = "Nordic Chair",
                category = "furniture/chairs",
                tags = listOf("scandinavian", "modern"),
                modelPath = "models/chair.glb",
                thumbnailPath = "thumbs/chair.png",
                footprintMeters = Dimensions3(0.5f, 0.5f, 0.8f),
            ),
        ),
    )

    @Before
    fun setUp() {
        context = mock()
        assetManager = mock()
        whenever(context.assets).thenReturn(assetManager)
        repository = CatalogRepository(context)
    }

    @Test
    fun `loadCatalog caches parsed catalog on first load`() = runTest {
        whenever(assetManager.open("catalog.json")).doAnswer {
            ByteArrayInputStream(sampleJson.toByteArray())
        }

        val firstCall = repository.loadCatalog("catalog.json")
        val secondCall = repository.loadCatalog("catalog.json")

        verify(assetManager, times(1)).open("catalog.json")
        assertSame(firstCall, secondCall)
        assertEquals(1, secondCall.version)
    }

    @Test
    fun `loadCatalog forceReload bypasses cache and opens asset again`() = runTest {
        whenever(assetManager.open("catalog.json")).doAnswer {
            ByteArrayInputStream(sampleJson.toByteArray())
        }

        val firstCall = repository.loadCatalog("catalog.json")
        val secondCall = repository.loadCatalog("catalog.json", forceReload = true)

        verify(assetManager, times(2)).open("catalog.json")
        assertEquals(firstCall.version, secondCall.version)
    }

    @Test
    fun `clearCache invalidates cached catalog`() = runTest {
        whenever(assetManager.open("catalog.json")).doAnswer {
            ByteArrayInputStream(sampleJson.toByteArray())
        }

        val firstCall = repository.loadCatalog("catalog.json")
        repository.clearCache()
        val secondCall = repository.loadCatalog("catalog.json")

        verify(assetManager, times(2)).open("catalog.json")
        assertEquals(firstCall.version, secondCall.version)
    }

    @Test
    fun `clearCache with specific path invalidates only specified path`() = runTest {
        whenever(assetManager.open(any())).doAnswer {
            ByteArrayInputStream(sampleJson.toByteArray())
        }

        val cat1 = repository.loadCatalog("catalog1.json")
        val cat2 = repository.loadCatalog("catalog2.json")

        repository.clearCache("catalog1.json")

        repository.loadCatalog("catalog1.json")
        repository.loadCatalog("catalog2.json")

        verify(assetManager, times(2)).open("catalog1.json")
        verify(assetManager, times(1)).open("catalog2.json")
    }

    @Test
    fun `filterEntries reuses identical entry wrapper instances across multiple calls`() {
        val firstCall = repository.filterEntries(sampleCatalog, "", CatalogCategory.ALL)
        val secondCall = repository.filterEntries(sampleCatalog, "oak", CatalogCategory.ALL)

        assertEquals(2, firstCall.size)
        assertEquals(1, secondCall.size)
        assertSame(firstCall[0], secondCall[0])
    }

    @Test
    fun `filterByStyleTag reuses identical entry wrapper instances across multiple calls`() {
        val styleCall1 = repository.filterByStyleTag(sampleCatalog, "scandinavian")
        val styleCall2 = repository.filterByStyleTag(sampleCatalog, "scandinavian")
        val filterCall = repository.filterEntries(sampleCatalog, "", CatalogCategory.ALL)

        assertEquals(2, styleCall1.size)
        assertEquals(2, styleCall2.size)
        assertSame(styleCall1[0], styleCall2[0])
        assertSame(styleCall1[1], styleCall2[1])
        assertSame(filterCall[0], styleCall1[0])
    }

    @Test
    fun `clearCache invalidates entry wrapper cache`() {
        val firstCall = repository.filterEntries(sampleCatalog, "", CatalogCategory.ALL)
        repository.clearCache()
        val secondCall = repository.filterEntries(sampleCatalog, "", CatalogCategory.ALL)

        assertEquals(2, firstCall.size)
        assertEquals(2, secondCall.size)
        assertNotSame(firstCall[0], secondCall[0])
        assertEquals(firstCall[0], secondCall[0])
    }

    @Test
    fun `clearCache with specific path invalidates wrapper cache for loaded catalog`() = runTest {
        whenever(assetManager.open("catalog1.json")).doAnswer {
            ByteArrayInputStream(
                """
                {
                    "version": 1,
                    "materials": [
                        {
                            "id": "mat_1",
                            "name": "Mat 1",
                            "category": "walls",
                            "tags": ["tag1"],
                            "texturePath": "tex1",
                            "thumbnailPath": "thumb1"
                        }
                    ],
                    "placeableObjects": []
                }
                """.trimIndent().toByteArray(),
            )
        }
        whenever(assetManager.open("catalog2.json")).doAnswer {
            ByteArrayInputStream(
                """
                {
                    "version": 1,
                    "materials": [
                        {
                            "id": "mat_2",
                            "name": "Mat 2",
                            "category": "walls",
                            "tags": ["tag2"],
                            "texturePath": "tex2",
                            "thumbnailPath": "thumb2"
                        }
                    ],
                    "placeableObjects": []
                }
                """.trimIndent().toByteArray(),
            )
        }

        val cat1 = repository.loadCatalog("catalog1.json")
        val cat2 = repository.loadCatalog("catalog2.json")

        val entry1Old = repository.filterEntries(cat1, "", CatalogCategory.ALL)[0]
        val entry2Old = repository.filterEntries(cat2, "", CatalogCategory.ALL)[0]

        repository.clearCache("catalog1.json")

        val entry1New = repository.filterEntries(cat1, "", CatalogCategory.ALL)[0]
        val entry2New = repository.filterEntries(cat2, "", CatalogCategory.ALL)[0]

        assertNotSame(entry1Old, entry1New)
        assertSame(entry2Old, entry2New)
    }

    @Test
    fun `filterEntries matches entry names and tags case-insensitively and preserves order`() {
        val mixedCaseNameMatch = repository.filterEntries(sampleCatalog, "  nOrDiC  ", CatalogCategory.ALL)
        assertEquals(listOf("chair_nordic"), mixedCaseNameMatch.map { it.id })

        val mixedCaseTagMatch = repository.filterEntries(sampleCatalog, "SCANDI", CatalogCategory.ALL)
        assertEquals(listOf("mat_oak", "chair_nordic"), mixedCaseTagMatch.map { it.id })

        val categoryAndTagMatch = repository.filterEntries(sampleCatalog, "SCANDI", CatalogCategory.CHAIRS)
        assertEquals(listOf("chair_nordic"), categoryAndTagMatch.map { it.id })
    }

    @Test
    fun `filterEntries handles blank and whitespace-only queries with category filtering`() {
        val allEntries = repository.filterEntries(sampleCatalog, "   \t\n  ", CatalogCategory.ALL)
        assertEquals(listOf("mat_oak", "chair_nordic"), allEntries.map { it.id })

        val floorEntries = repository.filterEntries(sampleCatalog, "   ", CatalogCategory.FLOORS)
        assertEquals(listOf("mat_oak"), floorEntries.map { it.id })
    }

    @Test
    fun `filterByStyleTag returns precomputed list instance across case and whitespace variations`() {
        val lower = repository.filterByStyleTag(sampleCatalog, "scandinavian")
        val upper = repository.filterByStyleTag(sampleCatalog, "SCANDINAVIAN")
        val padded = repository.filterByStyleTag(sampleCatalog, "  Scandinavian  ")

        assertEquals(listOf("mat_oak", "chair_nordic"), lower.map { it.id })
        assertSame(lower, upper)
        assertSame(lower, padded)
        assertEquals(emptyList(), repository.filterByStyleTag(sampleCatalog, ""))
        assertEquals(emptyList(), repository.filterByStyleTag(sampleCatalog, "   "))
        assertEquals(emptyList(), repository.filterByStyleTag(sampleCatalog, "brutalist"))
    }

    @Test
    fun `duplicate tags in different cases are deduplicated in inverted tag index`() {
        val duplicateTagCatalog = Catalog(
            version = 1,
            materials = listOf(
                MaterialAsset(
                    id = "mat_japandi_lime",
                    name = "Limewash Plaster",
                    category = MaterialCategory.walls,
                    tags = listOf("Japandi", "japandi", "JAPANDI", " Minimal "),
                    texturePath = "textures/lime.png",
                    thumbnailPath = "thumbs/lime.png",
                ),
            ),
            placeableObjects = emptyList(),
        )

        val styleMatches = repository.filterByStyleTag(duplicateTagCatalog, "japandi")
        assertEquals(1, styleMatches.size)
        assertEquals("mat_japandi_lime", styleMatches[0].id)

        val trimmedStyleMatches = repository.filterByStyleTag(duplicateTagCatalog, "minimal")
        assertEquals(1, trimmedStyleMatches.size)
        assertEquals("mat_japandi_lime", trimmedStyleMatches[0].id)

        val queryMatches = repository.filterEntries(duplicateTagCatalog, "JAPANDI", CatalogCategory.ALL)
        assertEquals(1, queryMatches.size)
    }

    @Test
    fun `clearCache invalidates inverted tag index globally and per assetPath`() = runTest {
        whenever(assetManager.open("catalog1.json")).doAnswer {
            ByteArrayInputStream(
                """
                {
                    "version": 1,
                    "materials": [
                        {
                            "id": "mat_1",
                            "name": "Mat 1",
                            "category": "walls",
                            "tags": ["Japandi"],
                            "texturePath": "tex1",
                            "thumbnailPath": "thumb1"
                        }
                    ],
                    "placeableObjects": []
                }
                """.trimIndent().toByteArray(),
            )
        }
        whenever(assetManager.open("catalog2.json")).doAnswer {
            ByteArrayInputStream(
                """
                {
                    "version": 1,
                    "materials": [
                        {
                            "id": "mat_2",
                            "name": "Mat 2",
                            "category": "walls",
                            "tags": ["Scandinavian"],
                            "texturePath": "tex2",
                            "thumbnailPath": "thumb2"
                        }
                    ],
                    "placeableObjects": []
                }
                """.trimIndent().toByteArray(),
            )
        }

        val cat1 = repository.loadCatalog("catalog1.json")
        val cat2 = repository.loadCatalog("catalog2.json")

        val tagList1Before = repository.filterByStyleTag(cat1, "japandi")
        val tagList2Before = repository.filterByStyleTag(cat2, "scandinavian")

        repository.clearCache("catalog1.json")

        val tagList1AfterPathClear = repository.filterByStyleTag(cat1, "japandi")
        val tagList2AfterPathClear = repository.filterByStyleTag(cat2, "scandinavian")

        assertNotSame(tagList1Before, tagList1AfterPathClear)
        assertNotSame(tagList1Before[0], tagList1AfterPathClear[0])
        assertEquals(tagList1Before, tagList1AfterPathClear)
        assertSame(tagList2Before, tagList2AfterPathClear)

        repository.clearCache()

        val tagList2AfterFullClear = repository.filterByStyleTag(cat2, "scandinavian")
        assertNotSame(tagList2Before, tagList2AfterFullClear)
        assertEquals(tagList2Before, tagList2AfterFullClear)
    }
}
