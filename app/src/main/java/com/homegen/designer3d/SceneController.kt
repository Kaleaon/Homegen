package com.homegen.designer3d

import com.google.android.filament.Engine
import com.google.android.filament.Scene
import com.google.android.filament.View
import com.homegen.designer3d.camera.CameraController
import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.model.Room
import com.homegen.designer3d.rendering.RenderableRegistry
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Core coordinator for the 3D designer feature package.
 *
 * Rendering strategy: Filament handles low-level rendering while this controller
 * keeps a lightweight scene graph (`HomeObject`) for editor-centric operations.
 */
class SceneController(
    val engine: Engine,
    val view: View,
    val filamentScene: Scene,
) {
    private val objects = CopyOnWriteArrayList<HomeObject>()

    val cameraController: CameraController = CameraController()
    var selectedObjectId: String? = null
        private set

    var renderableRegistry: RenderableRegistry? = null

    var currentFloorLevel: Int = 0
        private set

    init {
        objects += Room(name = "Default room")
    }

    fun addObject(object3d: HomeObject) {
        object3d.floorLevel = currentFloorLevel
        objects += object3d
        renderableRegistry?.createRenderable(object3d)
    }

    fun removeObject(objectId: String): Boolean {
        val obj = objects.find { it.id == objectId }
        val removed = objects.removeAll { it.id == objectId }
        if (removed) {
            renderableRegistry?.removeRenderable(objectId)
        }
        if (selectedObjectId == objectId) {
            selectedObjectId = null
        }
        return removed
    }

    fun listObjects(): List<HomeObject> = objects.toList()

    fun objectsOnFloor(level: Int): List<HomeObject> = objects.filter { it.floorLevel == level }

    fun setFloorLevel(level: Int) {
        currentFloorLevel = level
        renderableRegistry?.setFloorVisibility(level, objects.toList())
    }

    fun onOrbit(deltaYaw: Float, deltaPitch: Float) {
        cameraController.orbit(deltaYaw, deltaPitch)
    }

    fun onPan(deltaX: Float, deltaY: Float) {
        cameraController.pan(deltaX, deltaY)
    }

    fun onZoom(delta: Float) {
        cameraController.zoom(delta)
    }

    fun updateObjectTransform(objectId: String) {
        val obj = objects.find { it.id == objectId } ?: return
        renderableRegistry?.updateTransform(obj)
    }

    /**
     * Selects the nearest object by ray hit-testing against object centers + radius proxy.
     */
    fun selectByRay(rayOrigin: Vector3, rayDirection: Vector3): HomeObject? {
        val dir = rayDirection.normalized()
        val hit = objects
            .filter { it.floorLevel == currentFloorLevel }
            .map { obj -> obj to raySphereDistance(rayOrigin, dir, obj.transform.position, radius = 0.75f) }
            .filter { (_, distance) -> distance != null }
            .minByOrNull { (_, distance) -> distance ?: Float.MAX_VALUE }

        selectedObjectId = hit?.first?.id
        return hit?.first
    }

    fun findObjectById(id: String): HomeObject? = objects.find { it.id == id }

    private fun raySphereDistance(
        origin: Vector3,
        direction: Vector3,
        center: Vector3,
        radius: Float,
    ): Float? {
        val oc = origin - center
        val a = direction.dot(direction)
        val b = 2f * oc.dot(direction)
        val c = oc.dot(oc) - radius * radius
        val discriminant = b * b - 4f * a * c
        if (discriminant < 0f) return null

        val t = (-b - kotlin.math.sqrt(discriminant)) / (2f * a)
        return if (t >= 0f) t else null
    }
}
