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
    private data class IndexedCatalogEntry(
        val entry: CatalogEntry,
        val normalizedName: String,
        val normalizedTags: List<String>,
    )

    private data class CatalogIndex(
        val entries: List<CatalogEntry>,
        val indexedEntries: List<IndexedCatalogEntry>,
        val tagIndex: Map<String, List<CatalogEntry>>,
    )

    private val catalogCache = ConcurrentHashMap<String, Catalog>()
    private val entryCache = ConcurrentHashMap<Catalog, CatalogIndex>()

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
        val index = getIndex(catalog)
        if (query.isBlank()) {
            if (category == CatalogCategory.ALL) {
                return index.entries
            }
            return index.entries.filter { entry -> matchesCategory(entry, category) }
        }

        val normalizedQuery = query.trim().lowercase()
        return buildList {
            for (indexed in index.indexedEntries) {
                if (
                    matchesCategory(indexed.entry, category) &&
                    (
                        indexed.normalizedName.contains(normalizedQuery) ||
                            indexed.normalizedTags.any { it.contains(normalizedQuery) }
                        )
                ) {
                    add(indexed.entry)
                }
            }
        }
    }

    /**
     * Filter entries by a design style tag (e.g. "scandinavian", "japandi").
     * Returns items whose tags contain the given style identifier.
     */
    fun filterByStyleTag(catalog: Catalog, styleTag: String): List<CatalogEntry> {
        if (styleTag.isBlank()) return emptyList()
        val tag = styleTag.trim().lowercase()
        return getIndex(catalog).tagIndex[tag] ?: emptyList()
    }

    private fun getIndex(catalog: Catalog): CatalogIndex {
        return entryCache.computeIfAbsent(catalog, ::buildCatalogIndex)
    }

    private fun buildCatalogIndex(catalog: Catalog): CatalogIndex {
        val totalSize = catalog.materials.size + catalog.placeableObjects.size
        val entries = ArrayList<CatalogEntry>(totalSize)
        val indexedEntries = ArrayList<IndexedCatalogEntry>(totalSize)
        val tagBuckets = LinkedHashMap<String, MutableList<CatalogEntry>>()

        fun addIndexedEntry(entry: CatalogEntry) {
            entries.add(entry)
            val normalizedName = entry.name.lowercase()
            val normalizedTags = buildList(entry.tags.size) {
                val seenTags = HashSet<String>(entry.tags.size)
                for (rawTag in entry.tags) {
                    val normalizedTag = rawTag.trim().lowercase()
                    if (normalizedTag.isNotEmpty() && seenTags.add(normalizedTag)) {
                        add(normalizedTag)
                        tagBuckets.getOrPut(normalizedTag) { mutableListOf() }.add(entry)
                    }
                }
            }
            indexedEntries.add(
                IndexedCatalogEntry(
                    entry = entry,
                    normalizedName = normalizedName,
                    normalizedTags = normalizedTags,
                ),
            )
        }

        for (material in catalog.materials) {
            addIndexedEntry(MaterialEntry(material))
        }
        for (placeable in catalog.placeableObjects) {
            addIndexedEntry(PlaceableEntry(placeable))
        }

        val tagIndex = buildMap(tagBuckets.size) {
            for ((tag, bucket) in tagBuckets) {
                put(tag, bucket.toList())
            }
        }

        return CatalogIndex(
            entries = entries.toList(),
            indexedEntries = indexedEntries,
            tagIndex = tagIndex,
        )
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
