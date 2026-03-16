package com.homegen.designer3d.rendering

/**
 * Temporarily applies a material to a renderable for preview purposes.
 * Restores the original material on leave/cancel.
 */
class MaterialPreview(
    private val registry: RenderableRegistry,
) {
    private var previewObjectId: String? = null
    private var originalMaterialRef: String? = null

    /**
     * Temporarily applies a material to show how it would look.
     */
    fun startPreview(objectId: String, currentMaterialRef: String, previewMaterialRef: String) {
        // Restore any previous preview first
        cancelPreview()

        previewObjectId = objectId
        originalMaterialRef = currentMaterialRef
        registry.applyMaterial(objectId, previewMaterialRef)
    }

    /**
     * Cancels the preview and restores the original material.
     */
    fun cancelPreview() {
        val id = previewObjectId ?: return
        val originalRef = originalMaterialRef ?: return
        registry.applyMaterial(id, originalRef)
        previewObjectId = null
        originalMaterialRef = null
    }

    /**
     * Commits the preview (the new material stays applied).
     */
    fun commitPreview() {
        previewObjectId = null
        originalMaterialRef = null
    }
}
