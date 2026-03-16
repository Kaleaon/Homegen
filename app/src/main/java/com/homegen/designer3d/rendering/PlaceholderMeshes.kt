package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.MaterialInstance
import com.homegen.designer3d.math.Vector3

/**
 * Creates simple placeholder box meshes for catalog items that don't have GLB models.
 * Color-coded by category for easy visual identification.
 */
object PlaceholderMeshes {

    /**
     * Creates a colored box placeholder based on object category.
     */
    fun createPlaceholder(
        engine: Engine,
        category: String,
        footprint: Vector3,
        materialFactory: MaterialFactory,
    ): Pair<Int, MaterialInstance> {
        val material = materialForCategory(category, materialFactory)
        val halfExtents = Vector3(
            footprint.x.coerceAtLeast(0.1f) / 2f,
            footprint.y.coerceAtLeast(0.1f) / 2f,
            footprint.z.coerceAtLeast(0.1f) / 2f,
        )
        val entity = MeshFactory.createBox(engine, halfExtents, material)
        return entity to material
    }

    private fun materialForCategory(category: String, factory: MaterialFactory): MaterialInstance {
        return when (category.lowercase()) {
            "beds", "bedroom" -> factory.createColorInstance(0.55f, 0.45f, 0.65f) // purple
            "sofas", "living" -> factory.createColorInstance(0.45f, 0.55f, 0.70f) // blue
            "tables", "dining" -> factory.createColorInstance(0.65f, 0.55f, 0.40f) // wood
            "storage" -> factory.createColorInstance(0.60f, 0.60f, 0.55f) // gray-brown
            "appliances", "kitchen" -> factory.createColorInstance(0.80f, 0.80f, 0.82f) // silver
            "bathroom" -> factory.createColorInstance(0.85f, 0.90f, 0.95f) // light blue
            "outdoor" -> factory.createColorInstance(0.45f, 0.65f, 0.45f) // green
            "decorative" -> factory.createColorInstance(0.85f, 0.75f, 0.50f) // gold
            "doors" -> factory.createColorInstance(0.60f, 0.45f, 0.30f) // dark wood
            "windows" -> factory.createColorInstance(0.75f, 0.85f, 0.95f, 0.6f) // glass
            else -> factory.createColorInstance(0.7f, 0.7f, 0.7f) // neutral
        }
    }
}
