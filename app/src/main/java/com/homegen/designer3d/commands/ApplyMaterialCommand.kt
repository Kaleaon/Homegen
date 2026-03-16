package com.homegen.designer3d.commands

import com.homegen.designer3d.SceneController

class ApplyMaterialCommand(
    private val scene: SceneController,
    private val objectId: String,
    private val oldMaterialRef: String,
    private val newMaterialRef: String,
) : Command {
    override val description = "Apply material"

    override fun execute() {
        val obj = scene.findObjectById(objectId) ?: return
        obj.materialRef = newMaterialRef
        scene.renderableRegistry?.applyMaterial(objectId, newMaterialRef)
    }

    override fun undo() {
        val obj = scene.findObjectById(objectId) ?: return
        obj.materialRef = oldMaterialRef
        scene.renderableRegistry?.applyMaterial(objectId, oldMaterialRef)
    }
}
