package com.homegen.assets.data

import android.content.Context
import android.content.res.AssetManager
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
}
