package com.homegen.designer3d.input

import com.google.android.filament.Camera
import com.homegen.designer3d.SceneController
import com.homegen.designer3d.commands.AddObjectCommand
import com.homegen.designer3d.commands.ApplyMaterialCommand
import com.homegen.designer3d.commands.CommandStack
import com.homegen.designer3d.commands.MoveObjectCommand
import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.model.Wall
import com.homegen.designer3d.tools.SnapEngine
import com.homegen.designer3d.tools.WallDrawingTool
import kotlin.math.atan2

/**
 * Central gesture dispatcher that routes touch events based on the current InteractionMode.
 */
class InteractionController(
    private val sceneController: SceneController,
    private val commandStack: CommandStack,
    private val getCamera: () -> Camera?,
    private val getViewport: () -> Pair<Int, Int>,
) : GestureListener {

    var mode: InteractionMode = InteractionMode.Select
    private val wallTool = WallDrawingTool()
    private val roomCorners = mutableListOf<Vector3>()

    // Drag tracking
    private var dragStartPosition: Vector3? = null
    private var isDraggingObject = false

    override fun onTap(screenX: Float, screenY: Float) {
        val worldPos = screenToWorld(screenX, screenY) ?: return

        when (val m = mode) {
            is InteractionMode.Select -> {
                val camera = getCamera() ?: return
                val (viewport) = getViewport()
                val (origin, direction) = RayCaster.screenToRay(
                    screenX, screenY, viewport, getViewport().second, camera
                )
                sceneController.selectByRay(origin, direction)
            }

            is InteractionMode.WallDraw -> {
                val snapped = SnapEngine.snapToGrid(worldPos, 0.25f)
                val wall = wallTool.onTap(snapped)
                if (wall != null) {
                    commandStack.execute(AddObjectCommand(sceneController, wall))
                }
            }

            is InteractionMode.RoomDraw -> {
                val snapped = SnapEngine.snapToGrid(worldPos, 0.25f)
                roomCorners.add(snapped)
                if (roomCorners.size >= 3) {
                    val first = roomCorners.first()
                    val last = roomCorners.last()
                    if (first.distanceTo(last) < 0.5f && roomCorners.size > 3) {
                        // Close room: generate walls from polygon
                        val corners = roomCorners.dropLast(1) // remove duplicate close point
                        for (i in corners.indices) {
                            val start = corners[i]
                            val end = corners[(i + 1) % corners.size]
                            val wall = WallDrawingTool.createWallBetween(start, end)
                            commandStack.execute(AddObjectCommand(sceneController, wall))
                        }
                        roomCorners.clear()
                    }
                }
            }

            is InteractionMode.FurnitureDrag -> {
                val snapped = SnapEngine.snapToGrid(worldPos, 0.25f)
                val furniture = Furniture(
                    name = m.name,
                    catalogRef = m.catalogRef
                ).apply {
                    transform.position = snapped
                }
                commandStack.execute(AddObjectCommand(sceneController, furniture))
                mode = InteractionMode.Select
            }

            is InteractionMode.Paint -> {
                val camera = getCamera() ?: return
                val (vw, vh) = getViewport()
                val (origin, direction) = RayCaster.screenToRay(screenX, screenY, vw, vh, camera)
                val hit = sceneController.selectByRay(origin, direction)
                if (hit != null) {
                    commandStack.execute(
                        ApplyMaterialCommand(sceneController, hit.id, hit.materialRef, m.materialRef)
                    )
                }
            }
        }
    }

    override fun onLongPress(screenX: Float, screenY: Float) {
        when (val m = mode) {
            is InteractionMode.Paint -> {
                // Paint all objects on current floor with this material
                val objects = sceneController.objectsOnFloor(sceneController.currentFloorLevel)
                for (obj in objects) {
                    if (obj.type == "wall" || obj.type == "floor") {
                        commandStack.execute(
                            ApplyMaterialCommand(sceneController, obj.id, obj.materialRef, m.materialRef)
                        )
                    }
                }
            }
            else -> {}
        }
    }

    override fun onDragStart(screenX: Float, screenY: Float) {
        if (mode is InteractionMode.Select && sceneController.selectedObjectId != null) {
            val obj = sceneController.findObjectById(sceneController.selectedObjectId!!)
            if (obj != null) {
                dragStartPosition = Vector3(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z)
                isDraggingObject = true
            }
        }
    }

    override fun onDragMove(screenX: Float, screenY: Float, deltaX: Float, deltaY: Float) {
        if (isDraggingObject && mode is InteractionMode.Select) {
            val worldPos = screenToWorld(screenX, screenY) ?: return
            val snapped = SnapEngine.snapToGrid(worldPos, 0.25f)
            val objId = sceneController.selectedObjectId ?: return
            val obj = sceneController.findObjectById(objId) ?: return
            obj.transform.position = snapped
            sceneController.updateObjectTransform(objId)
        } else if (!isDraggingObject) {
            // No object selected, use drag for orbit
            sceneController.onOrbit(deltaX * 0.005f, deltaY * 0.005f)
        }
    }

    override fun onDragEnd() {
        if (isDraggingObject) {
            val objId = sceneController.selectedObjectId
            val startPos = dragStartPosition
            if (objId != null && startPos != null) {
                val obj = sceneController.findObjectById(objId)
                if (obj != null) {
                    val endPos = Vector3(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z)
                    if (startPos.distanceTo(endPos) > 0.01f) {
                        commandStack.execute(
                            MoveObjectCommand(sceneController, objId, startPos, endPos)
                        )
                    }
                }
            }
            isDraggingObject = false
            dragStartPosition = null
        }
    }

    override fun onOrbit(deltaYaw: Float, deltaPitch: Float) {
        sceneController.onOrbit(deltaYaw, deltaPitch)
    }

    override fun onPan(deltaX: Float, deltaY: Float) {
        sceneController.onPan(deltaX, deltaY)
    }

    override fun onZoom(scaleFactor: Float) {
        sceneController.onZoom(scaleFactor)
    }

    private fun screenToWorld(screenX: Float, screenY: Float): Vector3? {
        val camera = getCamera() ?: return null
        val (vw, vh) = getViewport()
        val (origin, direction) = RayCaster.screenToRay(screenX, screenY, vw, vh, camera)
        return RayCaster.rayPlaneIntersect(origin, direction, 0f)
    }
}
