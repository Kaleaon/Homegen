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
import java.util.concurrent.ConcurrentHashMap

class CatalogRepository(
    private val context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private val catalogCache = ConcurrentHashMap<String, Catalog>()
    private val entryCache = ConcurrentHashMap<Catalog, List<CatalogEntry>>()

    private val thumbnailCache = object : LruCache<String, Bitmap>((8 * 1024 * 1024)) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    suspend fun loadCatalog(
        assetPath: String = "catalog.json",
        forceReload: Boolean = false,
    ): Catalog {
        if (!forceReload) {
            catalogCache[assetPath]?.let { return it }
        }
        return withContext(ioDispatcher) {
            if (!forceReload) {
                catalogCache[assetPath]?.let { return@withContext it }
            }
            val payload = context.assets.open(assetPath).bufferedReader().use { it.readText() }
            val parsedCatalog = json.decodeFromString<Catalog>(payload)
            catalogCache.put(assetPath, parsedCatalog)?.let { oldCatalog ->
                entryCache.remove(oldCatalog)
            }
            parsedCatalog
        }
    }

    fun clearCache(assetPath: String? = null) {
        if (assetPath != null) {
            catalogCache.remove(assetPath)?.let { catalog ->
                entryCache.remove(catalog)
            }
        } else {
            catalogCache.clear()
            entryCache.clear()
        }
    }

    fun filterEntries(catalog: Catalog, query: String, category: CatalogCategory): List<CatalogEntry> {
        val normalizedQuery = query.trim().lowercase()
        val entries = getEntries(catalog)

        return entries.filter { entry ->
            matchesCategory(entry, category) &&
                (
                    normalizedQuery.isBlank() ||
                        entry.name.lowercase().contains(normalizedQuery) ||
                        entry.tags.any { it.lowercase().contains(normalizedQuery) }
                    )
        }
    }

    /**
     * Filter entries by a design style tag (e.g. "scandinavian", "japandi").
     * Returns items whose tags contain the given style identifier.
     */
    fun filterByStyleTag(catalog: Catalog, styleTag: String): List<CatalogEntry> {
        val tag = styleTag.trim().lowercase()
        if (tag.isBlank()) return emptyList()
        val entries = getEntries(catalog)
        return entries.filter { entry ->
            entry.tags.any { it.lowercase() == tag }
        }
    }

    private fun getEntries(catalog: Catalog): List<CatalogEntry> {
        return entryCache.computeIfAbsent(catalog) { cat ->
            buildList {
                addAll(cat.materials.map(::MaterialEntry))
                addAll(cat.placeableObjects.map(::PlaceableEntry))
            }
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
        CatalogCategory.CHAIRS -> entry.categoryPath == "furniture/chairs"
        CatalogCategory.TABLES -> entry.categoryPath == "furniture/tables"
        CatalogCategory.SOFAS -> entry.categoryPath == "furniture/sofas"
        CatalogCategory.BEDS -> entry.categoryPath == "furniture/beds"
        CatalogCategory.STORAGE -> entry.categoryPath == "furniture/storage"
        CatalogCategory.DOORS -> entry.categoryPath == "doors"
        CatalogCategory.WINDOWS -> entry.categoryPath == "windows"
        CatalogCategory.LIGHTING -> entry.categoryPath == "lighting"
        CatalogCategory.DECORATIVE -> entry.categoryPath == "decorative"
        CatalogCategory.BATHROOM -> entry.categoryPath == "bathroom"
        CatalogCategory.KITCHEN -> entry.categoryPath == "kitchen"
        CatalogCategory.OUTDOOR -> entry.categoryPath == "outdoor"
        CatalogCategory.OFFICE -> entry.categoryPath == "office"
        CatalogCategory.LAUNDRY -> entry.categoryPath == "laundry"
        CatalogCategory.STAIRS -> entry.categoryPath == "furniture/stairs"
    }
}
