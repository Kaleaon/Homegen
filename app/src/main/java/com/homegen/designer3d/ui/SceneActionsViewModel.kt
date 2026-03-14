package com.homegen.designer3d.ui

import androidx.lifecycle.ViewModel
import com.homegen.designer3d.SceneController
import com.homegen.designer3d.model.Floor
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.model.Wall

/**
 * Minimal UI actions entry point for add/remove primitive entities.
 */
class SceneActionsViewModel(
    private val sceneController: SceneController,
) : ViewModel() {

    fun addWall() {
        sceneController.addObject(Wall())
    }

    fun addFloor() {
        sceneController.addObject(Floor())
    }

    fun addFurniture() {
        sceneController.addObject(Furniture())
    }

    fun removeSelected(): Boolean {
        val selectedId = sceneController.selectedObjectId ?: return false
        return sceneController.removeObject(selectedId)
    }
}
