package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler

/**
 * Manages Filament materials and material instances for scene objects.
 */
class MaterialFactory(private val engine: Engine) {

    private var defaultMaterial: Material? = null
    private val instanceCache = mutableMapOf<String, MaterialInstance>()

    var isVertexTextureFetchSupported: Boolean = true

    /**
     * Creates a terrain material instance for GPU vertex heightmap displacement.
     * Falls back to flat ground rendering if vertex texture fetch is unsupported on legacy GPU.
     */
    fun createTerrainInstance(
        texture: Texture? = null,
        verticalScale: Float = 1.0f,
        minElevation: Float = 0f,
        maxElevation: Float = 10f,
        forceFlatFallback: Boolean = false,
    ): MaterialInstance {
        if (forceFlatFallback || !isVertexTextureFetchSupported) {
            // Fallback to flat ground rendering
            return createColorInstance(0.48f, 0.58f, 0.38f) // Terrain green
        }

        val instance = getDefaultMaterial().createInstance()
        instance.setParameter("baseColor", 0.48f, 0.58f, 0.38f, 1.0f)
        instance.setParameter("roughness", 0.8f)
        instance.setParameter("metallic", 0.0f)

        if (texture != null) {
            val sampler = TextureSampler(
                TextureSampler.MinFilter.LINEAR,
                TextureSampler.MagFilter.LINEAR,
                TextureSampler.WrapMode.CLAMP_TO_EDGE,
            )
            try {
                instance.setParameter("elevationTexture", texture, sampler)
                instance.setParameter("verticalScale", verticalScale)
                instance.setParameter("minElevation", minElevation)
                instance.setParameter("maxElevation", maxElevation)
            } catch (e: Exception) {
                // Ignore parameter missing errors on default material
            }
        }

        return instance
    }

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
        val key = "color_${r}_${g}_${b}_$a"
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
        "wall" -> createColorInstance(0.85f, 0.83f, 0.78f) // warm beige
        "floor" -> createColorInstance(0.72f, 0.58f, 0.42f) // wood brown
        "room" -> createColorInstance(0.90f, 0.90f, 0.85f) // off-white
        "furniture" -> createColorInstance(0.55f, 0.55f, 0.65f) // blue-gray
        "door" -> createColorInstance(0.60f, 0.45f, 0.30f) // dark wood
        "window" -> createColorInstance(0.75f, 0.85f, 0.95f, 0.6f) // translucent blue
        "staircase" -> createColorInstance(0.65f, 0.55f, 0.40f) // medium wood
        else -> createColorInstance(0.7f, 0.7f, 0.7f) // neutral gray
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
