package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.Scene
import com.google.android.filament.TransformManager
import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.math.toMatrix
import com.homegen.designer3d.model.Floor
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.model.Wall

/**
 * Bridges the HomeObject scene graph to Filament renderables.
 * Manages creation, transform updates, and cleanup of Filament entities.
 */
class RenderableRegistry(
    private val engine: Engine,
    private val scene: Scene,
    private val materialFactory: MaterialFactory,
) {
    private val entityMap = mutableMapOf<String, Int>()
    private val transformManager: TransformManager = engine.transformManager

    /** Optional OBJ loader for Sweet Home 3D / Wavefront models. */
    var objLoader: ObjLoader? = null

    /** Optional GLB loader for glTF models. */
    var modelLoader: ModelLoader? = null

    fun createRenderable(obj: HomeObject): Int {
        val materialInstance = materialFactory.colorForType(obj.type)

        val entity = when (obj) {
            is Wall -> MeshFactory.createBox(
                engine,
                Vector3(obj.lengthMeters / 2f, obj.heightMeters / 2f, obj.thicknessMeters / 2f),
                materialInstance
            )
            is Floor -> MeshFactory.createPlane(
                engine,
                obj.widthMeters,
                obj.depthMeters,
                materialInstance
            )
            is Furniture -> loadFurnitureModel(obj, materialInstance)
            else -> MeshFactory.createBox(
                engine,
                Vector3(0.4f, 0.4f, 0.4f),
                materialInstance
            )
        }

        // Create a transform component and set the initial transform
        val ti = transformManager.getInstance(entity)
        if (ti == 0) {
            transformManager.create(entity)
        }
        updateTransformInternal(entity, obj)

        scene.addEntity(entity)
        entityMap[obj.id] = entity
        return entity
    }

    fun updateTransform(obj: HomeObject) {
        val entity = entityMap[obj.id] ?: return
        updateTransformInternal(entity, obj)
    }

    private fun updateTransformInternal(entity: Int, obj: HomeObject) {
        val ti = transformManager.getInstance(entity)
        if (ti != 0) {
            val matrix = obj.transform.toMatrix()
            // Filament expects a double array for setTransform
            val doubleMatrix = DoubleArray(16) { matrix[it].toDouble() }
            transformManager.setTransform(ti, doubleMatrix)
        }
    }

    fun removeRenderable(objectId: String) {
        val entity = entityMap.remove(objectId) ?: return
        scene.removeEntity(entity)
        engine.destroyEntity(entity)
        EntityManager.get().destroy(entity)
    }

    fun getEntity(objectId: String): Int? = entityMap[objectId]

    /**
     * Applies a material by ref to a renderable's first primitive.
     */
    fun applyMaterial(objectId: String, materialRef: String) {
        val entity = entityMap[objectId] ?: return
        val rm = engine.renderableManager
        val ri = rm.getInstance(entity)
        if (ri == 0) return
        // Use the materialRef prefix to determine color; fall back to type-based color
        val instance = materialFactory.colorForType(materialRef.substringBefore("/"))
        rm.setMaterialInstanceAt(ri, 0, instance)
    }

    fun syncAll(objects: List<HomeObject>) {
        val currentIds = objects.map { it.id }.toSet()

        // Remove entities no longer in the scene graph
        val toRemove = entityMap.keys - currentIds
        toRemove.forEach { removeRenderable(it) }

        // Add new entities and update existing transforms
        for (obj in objects) {
            if (obj.id !in entityMap) {
                createRenderable(obj)
            } else {
                updateTransform(obj)
            }
        }
    }

    /**
     * Sets visibility based on floor level for multi-floor support.
     */
    fun setFloorVisibility(currentFloor: Int, objects: List<HomeObject>) {
        for (obj in objects) {
            val entity = entityMap[obj.id] ?: continue
            when (obj.floorLevel) {
                currentFloor -> {
                    scene.addEntity(entity) // ensure visible
                }
                currentFloor - 1 -> {
                    scene.addEntity(entity) // visible but transparent (handled by material)
                }
                else -> {
                    scene.removeEntity(entity) // hidden
                }
            }
        }
    }

    /**
     * Attempts to load a furniture model in order: OBJ → GLB → placeholder box.
     * Supports Sweet Home 3D OBJ models and standard GLB/glTF models.
     */
    private fun loadFurnitureModel(furniture: Furniture, fallbackMaterial: com.google.android.filament.MaterialInstance): Int {
        val modelPath = furniture.catalogRef

        // Try OBJ first (Sweet Home 3D models)
        if (modelPath.endsWith(".obj", ignoreCase = true)) {
            objLoader?.load(modelPath, fallbackMaterial)?.let { return it }
        }

        // Try GLB (glTF binary)
        if (modelPath.endsWith(".glb", ignoreCase = true)) {
            modelLoader?.loadGlb(modelPath)?.let { asset ->
                val root = asset.root
                scene.addEntities(asset.entities)
                return root
            }
        }

        // Try OBJ variant of a GLB path
        val objPath = modelPath.replaceAfterLast('.', "obj")
        if (objPath != modelPath) {
            objLoader?.load(objPath, fallbackMaterial)?.let { return it }
        }

        // Fallback: colored placeholder box
        return MeshFactory.createBox(
            engine,
            Vector3(0.4f, 0.4f, 0.4f),
            fallbackMaterial
        )
    }

    fun destroy() {
        entityMap.values.forEach { entity ->
            scene.removeEntity(entity)
            engine.destroyEntity(entity)
            EntityManager.get().destroy(entity)
        }
        entityMap.clear()
    }
}
