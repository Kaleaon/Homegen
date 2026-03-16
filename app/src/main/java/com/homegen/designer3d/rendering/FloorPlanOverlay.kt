package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.Scene
import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Floor
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.model.Wall

/**
 * In 2D floor plan mode, renders wall outlines and furniture footprints
 * using unlit flat-colored entities for clarity.
 */
class FloorPlanOverlay(
    private val engine: Engine,
    private val scene: Scene,
    private val materialFactory: MaterialFactory,
) {
    private val overlayEntities = mutableListOf<Int>()

    /**
     * Rebuilds overlay entities from the current set of objects on the active floor.
     */
    fun rebuild(objects: List<HomeObject>) {
        clear()
        for (obj in objects) {
            when (obj) {
                is Wall -> {
                    val mat = materialFactory.createColorInstance(0.2f, 0.2f, 0.2f)
                    val entity = MeshFactory.createBox(
                        engine,
                        Vector3(obj.lengthMeters / 2f, 0.01f, obj.thicknessMeters / 2f),
                        mat
                    )
                    scene.addEntity(entity)
                    overlayEntities.add(entity)
                }
                is Floor -> {
                    val mat = materialFactory.createColorInstance(0.9f, 0.88f, 0.82f, 0.5f)
                    val entity = MeshFactory.createPlane(engine, obj.widthMeters, obj.depthMeters, mat)
                    scene.addEntity(entity)
                    overlayEntities.add(entity)
                }
                else -> {
                    // Furniture footprint as small flat box
                    val mat = materialFactory.createColorInstance(0.4f, 0.5f, 0.7f, 0.6f)
                    val entity = MeshFactory.createBox(engine, Vector3(0.3f, 0.005f, 0.3f), mat)
                    scene.addEntity(entity)
                    overlayEntities.add(entity)
                }
            }
        }
    }

    fun clear() {
        for (entity in overlayEntities) {
            scene.removeEntity(entity)
            engine.destroyEntity(entity)
        }
        overlayEntities.clear()
    }
}
