package com.homegen.designer3d.commands

import com.homegen.designer3d.SceneController
import com.homegen.designer3d.model.HomeObject

class AddObjectCommand(
    private val scene: SceneController,
    private val obj: HomeObject,
) : Command {
    override val description = "Add ${obj.name}"
    override fun execute() { scene.addObject(obj) }
    override fun undo() { scene.removeObject(obj.id) }
}
