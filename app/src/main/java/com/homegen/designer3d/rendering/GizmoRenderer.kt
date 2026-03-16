package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.Scene
import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.HomeObject

/**
 * Renders move/rotate gizmo arrows around the selected object.
 * Red arrow = X axis, Blue arrow = Z axis.
 */
class GizmoRenderer(
    private val engine: Engine,
    private val scene: Scene,
    private val materialFactory: MaterialFactory,
) {
    private val gizmoEntities = mutableListOf<Int>()
    private var isVisible = false

    /**
     * Shows gizmo arrows at the position of the selected object.
     */
    fun show(obj: HomeObject) {
        hide()
        val pos = obj.transform.position
        val arrowLength = 0.6f
        val arrowThickness = 0.03f

        // X axis arrow (red)
        val xMat = materialFactory.createColorInstance(0.9f, 0.2f, 0.2f)
        val xArrow = MeshFactory.createBox(engine, Vector3(arrowLength / 2f, arrowThickness, arrowThickness), xMat)
        scene.addEntity(xArrow)
        gizmoEntities.add(xArrow)

        // Z axis arrow (blue)
        val zMat = materialFactory.createColorInstance(0.2f, 0.2f, 0.9f)
        val zArrow = MeshFactory.createBox(engine, Vector3(arrowThickness, arrowThickness, arrowLength / 2f), zMat)
        scene.addEntity(zArrow)
        gizmoEntities.add(zArrow)

        // Y axis arrow (green)
        val yMat = materialFactory.createColorInstance(0.2f, 0.9f, 0.2f)
        val yArrow = MeshFactory.createBox(engine, Vector3(arrowThickness, arrowLength / 2f, arrowThickness), yMat)
        scene.addEntity(yArrow)
        gizmoEntities.add(yArrow)

        isVisible = true
    }

    fun hide() {
        for (entity in gizmoEntities) {
            scene.removeEntity(entity)
            engine.destroyEntity(entity)
            EntityManager.get().destroy(entity)
        }
        gizmoEntities.clear()
        isVisible = false
    }

    fun isVisible(): Boolean = isVisible
}
