package com.homegen.designer3d.rendering

import android.content.res.AssetManager
import com.google.android.filament.Engine
import com.google.android.filament.gltfio.AssetLoader
import com.google.android.filament.gltfio.FilamentAsset
import com.google.android.filament.gltfio.MaterialProvider
import com.google.android.filament.gltfio.ResourceLoader
import java.nio.ByteBuffer

/**
 * Loads .glb models from Android assets using Filament's gltfio library.
 * Caches loaded assets by path.
 */
class ModelLoader(
    private val engine: Engine,
    private val assetManager: AssetManager,
) {
    private val cache = mutableMapOf<String, FilamentAsset>()
    private var assetLoader: AssetLoader? = null
    private var resourceLoader: ResourceLoader? = null

    private fun ensureLoader() {
        if (assetLoader == null) {
            val materialProvider = MaterialProvider(engine)
            assetLoader = AssetLoader(engine, materialProvider, engine.entityManager)
            resourceLoader = ResourceLoader(engine)
        }
    }

    /**
     * Loads a .glb file from assets. Returns null if the file doesn't exist.
     */
    fun loadGlb(path: String): FilamentAsset? {
        cache[path]?.let { return it }

        ensureLoader()
        val loader = assetLoader ?: return null

        return try {
            val buffer = assetManager.open(path).use { stream ->
                val bytes = stream.readBytes()
                ByteBuffer.allocateDirect(bytes.size).apply {
                    put(bytes)
                    flip()
                }
            }
            val asset = loader.createAsset(buffer) ?: return null
            resourceLoader?.loadResources(asset)
            asset.releaseSourceData()
            cache[path] = asset
            asset
        } catch (e: Exception) {
            null
        }
    }

    fun destroy() {
        cache.clear()
        resourceLoader?.destroy()
        assetLoader?.destroy()
    }
}
