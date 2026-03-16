package com.homegen.designer3d.rendering

import android.content.res.AssetManager
import com.google.android.filament.Engine
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.TextureSampler
import java.nio.ByteBuffer

/**
 * Manages Filament materials and material instances for scene objects.
 */
class MaterialFactory(private val engine: Engine) {

    private var defaultMaterial: Material? = null
    private val instanceCache = mutableMapOf<String, MaterialInstance>()

    /**
     * Creates a default lit material programmatically using Filament's built-in capabilities.
     */
    fun getDefaultMaterial(): Material {
        defaultMaterial?.let { return it }

        // Use Filament's default material (plain lit surface)
        val material = Material.Builder()
            .build(engine)
        defaultMaterial = material
        return material
    }

    /**
     * Creates a colored material instance.
     */
    fun createColorInstance(r: Float, g: Float, b: Float, a: Float = 1f): MaterialInstance {
        val key = "color_${r}_${g}_${b}_${a}"
        instanceCache[key]?.let { return it }

        val instance = getDefaultMaterial().createInstance()
        instance.setParameter("baseColor", r, g, b, a)
        instance.setParameter("roughness", 0.6f)
        instance.setParameter("metallic", 0.0f)
        instanceCache[key] = instance
        return instance
    }

    /**
     * Creates a grid material instance (light gray for the ground grid).
     */
    fun createGridInstance(): MaterialInstance {
        return createColorInstance(0.75f, 0.78f, 0.80f)
    }

    /**
     * Gets a color for a given object type.
     */
    fun colorForType(type: String): MaterialInstance = when (type) {
        "wall" -> createColorInstance(0.85f, 0.83f, 0.78f)   // warm beige
        "floor" -> createColorInstance(0.72f, 0.58f, 0.42f)   // wood brown
        "room" -> createColorInstance(0.90f, 0.90f, 0.85f)    // off-white
        "furniture" -> createColorInstance(0.55f, 0.55f, 0.65f) // blue-gray
        "door" -> createColorInstance(0.60f, 0.45f, 0.30f)     // dark wood
        "window" -> createColorInstance(0.75f, 0.85f, 0.95f, 0.6f) // translucent blue
        "staircase" -> createColorInstance(0.65f, 0.55f, 0.40f)  // medium wood
        else -> createColorInstance(0.7f, 0.7f, 0.7f)          // neutral gray
    }

    /**
     * Creates a transparent version of a material for ghost floor rendering.
     */
    fun createTransparentInstance(r: Float, g: Float, b: Float, alpha: Float): MaterialInstance {
        return createColorInstance(r, g, b, alpha)
    }

    fun destroy() {
        instanceCache.values.forEach { engine.destroyMaterialInstance(it) }
        instanceCache.clear()
        defaultMaterial?.let { engine.destroyMaterial(it) }
    }
}
