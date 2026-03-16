package com.homegen.designer3d.commands

import com.homegen.designer3d.SceneController
import com.homegen.designer3d.math.Vector3

class RotateObjectCommand(
    private val scene: SceneController,
    private val objectId: String,
    private val fromRotation: Vector3,
    private val toRotation: Vector3,
) : Command {
    override val description = "Rotate object"

    override fun execute() {
        val obj = scene.findObjectById(objectId) ?: return
        obj.transform.rotationEuler = toRotation
        scene.updateObjectTransform(objectId)
    }

    override fun undo() {
        val obj = scene.findObjectById(objectId) ?: return
        obj.transform.rotationEuler = fromRotation
        scene.updateObjectTransform(objectId)
    }
}
