package com.homegen.designer3d.commands

import com.homegen.designer3d.SceneController
import com.homegen.designer3d.math.Vector3

class MoveObjectCommand(
    private val scene: SceneController,
    private val objectId: String,
    private val from: Vector3,
    private val to: Vector3,
) : Command {
    override val description = "Move object"

    override fun execute() {
        val obj = scene.findObjectById(objectId) ?: return
        obj.transform.position = to
        scene.updateObjectTransform(objectId)
    }

    override fun undo() {
        val obj = scene.findObjectById(objectId) ?: return
        obj.transform.position = from
        scene.updateObjectTransform(objectId)
    }
}
