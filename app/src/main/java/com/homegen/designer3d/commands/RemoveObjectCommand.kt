package com.homegen.designer3d.commands

import com.homegen.designer3d.SceneController
import com.homegen.designer3d.model.HomeObject

class RemoveObjectCommand(
    private val scene: SceneController,
    private val obj: HomeObject,
) : Command {
    override val description = "Remove ${obj.name}"
    override fun execute() { scene.removeObject(obj.id) }
    override fun undo() { scene.addObject(obj) }
}
