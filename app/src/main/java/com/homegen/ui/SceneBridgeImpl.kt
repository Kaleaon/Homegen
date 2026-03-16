package com.homegen.ui

import android.graphics.Bitmap
import com.homegen.assets.editor.SceneMaterialBridge
import com.homegen.assets.editor.SurfaceSelectionProvider
import com.homegen.designer3d.SceneController

/**
 * Bridges catalog material application with the SceneController.
 */
class SceneBridgeImpl(
    private val sceneController: SceneController
) : SurfaceSelectionProvider, SceneMaterialBridge {

    override fun selectedSurfaceIds(): List<String> {
        val selectedId = sceneController.selectedObjectId ?: return emptyList()
        return listOf(selectedId)
    }

    override fun applyMaterialTexture(surfaceId: String, texture: Bitmap) {
        val obj = sceneController.listObjects().find { it.id == surfaceId } ?: return
        // In a full implementation this would upload the texture to Filament
        // and update the renderable's material instance.
        obj.materialRef = "applied/${surfaceId}"
    }
}
