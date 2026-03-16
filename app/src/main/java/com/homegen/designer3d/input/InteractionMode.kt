package com.homegen.designer3d.input

import com.homegen.assets.model.MaterialAsset

/**
 * Represents the current tool mode in the design editor.
 */
sealed class InteractionMode {
    /** Default mode: tap to select, drag to move selected object. */
    object Select : InteractionMode()

    /** Wall drawing: tap-tap to define wall start/end points. */
    object WallDraw : InteractionMode()

    /** Room drawing: tap corners to define room polygon. */
    object RoomDraw : InteractionMode()

    /** Dragging a new furniture piece from catalog onto the scene. */
    data class FurnitureDrag(val catalogRef: String, val name: String) : InteractionMode()

    /** Paint mode: tap surfaces to apply a material. */
    data class Paint(val materialRef: String, val materialAsset: MaterialAsset? = null) : InteractionMode()
}
