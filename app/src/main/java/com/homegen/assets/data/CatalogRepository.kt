package com.homegen.assets.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.CatalogCategory
import com.homegen.assets.model.CatalogEntry
import com.homegen.assets.model.MaterialEntry
import com.homegen.assets.model.PlaceableEntry
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

class CatalogRepository(
    private val context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val json: Json = Json { ignoreUnknownKeys = true }
) {
    private val thumbnailCache = object : LruCache<String, Bitmap>((8 * 1024 * 1024)) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    suspend fun loadCatalog(assetPath: String = "catalog.json"): Catalog = withContext(ioDispatcher) {
        val payload = context.assets.open(assetPath).bufferedReader().use { it.readText() }
        json.decodeFromString(payload)
    }

    fun filterEntries(catalog: Catalog, query: String, category: CatalogCategory): List<CatalogEntry> {
        val normalizedQuery = query.trim().lowercase()
        val entries = buildList {
            addAll(catalog.materials.map(::MaterialEntry))
            addAll(catalog.placeableObjects.map(::PlaceableEntry))
        }

        return entries.filter { entry ->
            matchesCategory(entry, category) &&
                (normalizedQuery.isBlank() ||
                    entry.name.lowercase().contains(normalizedQuery) ||
                    entry.tags.any { it.lowercase().contains(normalizedQuery) })
        }
    }

    suspend fun loadThumbnail(path: String): Bitmap? {
        thumbnailCache.get(path)?.let { return it }
        return withContext(ioDispatcher) {
            runCatching {
                context.assets.open(path).use { stream ->
                    BitmapFactory.decodeStream(stream)
                }
            }.getOrNull()?.also { bitmap -> thumbnailCache.put(path, bitmap) }
        }
    }

    suspend fun loadTexture(path: String): Bitmap? = withContext(ioDispatcher) {
        runCatching {
            context.assets.open(path).use(BitmapFactory::decodeStream)
        }.getOrNull()
    }

    private fun matchesCategory(entry: CatalogEntry, category: CatalogCategory): Boolean = when (category) {
        CatalogCategory.ALL -> true
        CatalogCategory.WALLS -> entry.categoryPath == "walls"
        CatalogCategory.FLOORS -> entry.categoryPath == "floors"
        CatalogCategory.CEILINGS -> entry.categoryPath == "ceilings"
        CatalogCategory.FURNITURE -> entry.categoryPath.startsWith("furniture/")
    }
}
