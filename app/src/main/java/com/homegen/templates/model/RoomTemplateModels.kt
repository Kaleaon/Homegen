package com.homegen.templates.model

import kotlinx.serialization.Serializable

/**
 * A pre-designed room layout that can be placed into a project.
 * Inspired by The People's Design Library architecture section.
 */
@Serializable
data class RoomTemplate(
    val id: String,
    val name: String,
    val roomType: RoomType,
    val description: String,
    val styleId: String = "",
    val widthMeters: Float,
    val depthMeters: Float,
    val heightMeters: Float = 2.7f,
    val placements: List<FurniturePlacement>,
    val wallMaterialId: String = "wall_white_plaster",
    val floorMaterialId: String = "floor_oak_honey",
    val ceilingMaterialId: String = "ceiling_smooth_white",
    val tags: List<String> = emptyList(),
)

@Serializable
data class FurniturePlacement(
    val catalogItemId: String,
    val positionX: Float,
    val positionZ: Float,
    val rotationY: Float = 0f,
)

@Serializable
enum class RoomType {
    LIVING_ROOM,
    BEDROOM,
    KITCHEN,
    BATHROOM,
    DINING_ROOM,
    HOME_OFFICE,
    ENTRYWAY,
    LAUNDRY,
    OUTDOOR_PATIO,
}
