package com.homegen.assets.editor

import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.MaterialAsset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

interface SurfaceSelectionProvider {
    fun selectedSurfaceIds(): List<String>
}

interface SceneMaterialBridge {
    fun applyMaterialTexture(surfaceId: String, texture: android.graphics.Bitmap)
}

class MaterialApplicationController(
    private val repository: CatalogRepository,
    private val selectionProvider: SurfaceSelectionProvider,
    private val sceneBridge: SceneMaterialBridge,
    private val scope: CoroutineScope
) {
    /**
     * Tap-to-apply workflow: apply selected material to all selected surfaces.
     */
    fun applyMaterial(material: MaterialAsset) {
        scope.launch {
            val texture = repository.loadTexture(material.texturePath) ?: return@launch
            selectionProvider.selectedSurfaceIds().forEach { surfaceId ->
                sceneBridge.applyMaterialTexture(surfaceId, texture)
            }
        }
    }

    /**
     * Drag/drop workflow: call this from a drop target when a material card is dropped.
     */
    fun onMaterialDropped(material: MaterialAsset, targetSurfaceId: String) {
        scope.launch {
            val texture = repository.loadTexture(material.texturePath) ?: return@launch
            sceneBridge.applyMaterialTexture(targetSurfaceId, texture)
        }
    }
}
