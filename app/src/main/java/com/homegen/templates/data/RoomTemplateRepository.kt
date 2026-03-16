package com.homegen.templates.data

import com.homegen.templates.model.FurniturePlacement
import com.homegen.templates.model.RoomTemplate
import com.homegen.templates.model.RoomType

/**
 * Built-in room templates providing quick-start layouts for common room types.
 * Each template specifies dimensions, furniture placements, and material defaults.
 */
object RoomTemplateRepository {

    fun allTemplates(): List<RoomTemplate> = templates

    fun filterByType(type: RoomType): List<RoomTemplate> =
        templates.filter { it.roomType == type }

    fun filterByStyle(styleId: String): List<RoomTemplate> =
        templates.filter { it.styleId == styleId }

    fun findById(id: String): RoomTemplate? =
        templates.firstOrNull { it.id == id }

    private val templates = listOf(
        // ── Living Rooms ────────────────────────────────────────────────
        RoomTemplate(
            id = "living_scandi_compact",
            name = "Compact Scandinavian Living",
            roomType = RoomType.LIVING_ROOM,
            description = "A cozy 4x3.5m living room with clean Scandinavian lines.",
            styleId = "scandinavian",
            widthMeters = 4f,
            depthMeters = 3.5f,
            wallMaterialId = "wall_white_plaster",
            floorMaterialId = "floor_oak_honey",
            placements = listOf(
                FurniturePlacement("sofa_modern_01", 2.0f, 0.5f, 0f),
                FurniturePlacement("coffee_table_01", 2.0f, 1.5f, 0f),
                FurniturePlacement("chair_scandi_01", 0.5f, 1.5f, 45f),
                FurniturePlacement("lamp_floor_01", 0.3f, 0.3f, 0f),
                FurniturePlacement("rug_rectangular_01", 2.0f, 1.5f, 0f),
                FurniturePlacement("plant_indoor_01", 3.7f, 0.3f, 0f),
            ),
            tags = listOf("scandinavian", "compact", "cozy"),
        ),
        RoomTemplate(
            id = "living_mid_century",
            name = "Mid-Century Living Room",
            roomType = RoomType.LIVING_ROOM,
            description = "A spacious 5x4m living room with iconic mid-century furniture.",
            styleId = "mid_century_modern",
            widthMeters = 5f,
            depthMeters = 4f,
            wallMaterialId = "wall_olive_green",
            floorMaterialId = "floor_walnut_dark",
            placements = listOf(
                FurniturePlacement("sofa_modern_01", 2.5f, 0.5f, 0f),
                FurniturePlacement("chair_eames_lounge", 0.7f, 1.5f, 30f),
                FurniturePlacement("coffee_table_glass", 2.5f, 1.8f, 0f),
                FurniturePlacement("sideboard_01", 2.5f, 3.7f, 180f),
                FurniturePlacement("lamp_arc", 4.5f, 0.5f, 0f),
                FurniturePlacement("rug_rectangular_01", 2.5f, 1.8f, 0f),
            ),
            tags = listOf("mid-century", "spacious", "iconic"),
        ),
        RoomTemplate(
            id = "living_japandi",
            name = "Japandi Living Room",
            roomType = RoomType.LIVING_ROOM,
            description = "A 4.5x4m serene living space blending Japanese and Scandinavian design.",
            styleId = "japandi",
            widthMeters = 4.5f,
            depthMeters = 4f,
            wallMaterialId = "wall_limewash_white",
            floorMaterialId = "floor_bamboo",
            placements = listOf(
                FurniturePlacement("sofa_daybed", 2.25f, 0.5f, 0f),
                FurniturePlacement("coffee_table_01", 2.25f, 1.6f, 0f),
                FurniturePlacement("vase_ceramic", 2.25f, 1.6f, 0f),
                FurniturePlacement("paper_lantern", 1.0f, 1.0f, 0f),
                FurniturePlacement("plant_indoor_01", 4.2f, 3.8f, 0f),
            ),
            tags = listOf("japandi", "serene", "minimal"),
        ),
        RoomTemplate(
            id = "living_industrial",
            name = "Industrial Loft Living",
            roomType = RoomType.LIVING_ROOM,
            description = "A 6x5m open loft living room with raw industrial character.",
            styleId = "industrial",
            widthMeters = 6f,
            depthMeters = 5f,
            wallMaterialId = "wall_exposed_brick",
            floorMaterialId = "floor_concrete_polished",
            ceilingMaterialId = "ceiling_concrete",
            placements = listOf(
                FurniturePlacement("sofa_sectional_01", 3f, 1.2f, 0f),
                FurniturePlacement("coffee_table_01", 3f, 2.5f, 0f),
                FurniturePlacement("bookshelf_01", 0.5f, 4.5f, 0f),
                FurniturePlacement("track_lighting", 3f, 2.5f, 0f),
                FurniturePlacement("rug_rectangular_01", 3f, 2.5f, 0f),
            ),
            tags = listOf("industrial", "loft", "open"),
        ),

        // ── Bedrooms ───────────────────────────────────────────────────
        RoomTemplate(
            id = "bedroom_scandi_master",
            name = "Scandinavian Master Bedroom",
            roomType = RoomType.BEDROOM,
            description = "A calm 4x4m master bedroom with Scandinavian warmth.",
            styleId = "scandinavian",
            widthMeters = 4f,
            depthMeters = 4f,
            wallMaterialId = "wall_soft_gray",
            floorMaterialId = "floor_oak_honey",
            placements = listOf(
                FurniturePlacement("bed_queen_01", 2f, 3.2f, 0f),
                FurniturePlacement("nightstand_01", 0.5f, 3.2f, 0f),
                FurniturePlacement("nightstand_01", 3.5f, 3.2f, 0f),
                FurniturePlacement("lamp_table", 0.5f, 3.2f, 0f),
                FurniturePlacement("lamp_table", 3.5f, 3.2f, 0f),
                FurniturePlacement("wardrobe_01", 2f, 0.4f, 0f),
                FurniturePlacement("rug_rectangular_01", 2f, 2.5f, 0f),
            ),
            tags = listOf("scandinavian", "master", "calm"),
        ),
        RoomTemplate(
            id = "bedroom_japandi_minimal",
            name = "Japandi Minimal Bedroom",
            roomType = RoomType.BEDROOM,
            description = "A 3.5x4m serene bedroom with a low platform bed.",
            styleId = "japandi",
            widthMeters = 3.5f,
            depthMeters = 4f,
            wallMaterialId = "wall_warm_beige",
            floorMaterialId = "floor_bamboo",
            placements = listOf(
                FurniturePlacement("bed_platform", 1.75f, 3.0f, 0f),
                FurniturePlacement("nightstand_01", 0.3f, 3.0f, 0f),
                FurniturePlacement("paper_lantern", 0.3f, 3.0f, 0f),
                FurniturePlacement("plant_indoor_01", 3.2f, 0.3f, 0f),
            ),
            tags = listOf("japandi", "minimal", "serene"),
        ),
        RoomTemplate(
            id = "bedroom_dark_academia",
            name = "Dark Academia Study Bedroom",
            roomType = RoomType.BEDROOM,
            description = "A 4x4.5m moody bedroom with scholarly charm.",
            styleId = "dark_academia",
            widthMeters = 4f,
            depthMeters = 4.5f,
            wallMaterialId = "wall_charcoal",
            floorMaterialId = "floor_walnut_dark",
            placements = listOf(
                FurniturePlacement("bed_queen_01", 2f, 3.8f, 0f),
                FurniturePlacement("bookshelf_01", 0.4f, 2f, 0f),
                FurniturePlacement("desk_office_01", 3.2f, 1.5f, 90f),
                FurniturePlacement("chair_wingback", 3.2f, 1.5f, 90f),
                FurniturePlacement("lamp_table", 3.2f, 1.5f, 0f),
                FurniturePlacement("curtains_blackout", 2f, 0.1f, 0f),
            ),
            tags = listOf("dark-academia", "moody", "study"),
        ),

        // ── Kitchens ───────────────────────────────────────────────────
        RoomTemplate(
            id = "kitchen_modern_galley",
            name = "Modern Galley Kitchen",
            roomType = RoomType.KITCHEN,
            description = "A compact 3x2.5m galley kitchen with modern essentials.",
            styleId = "scandinavian",
            widthMeters = 3f,
            depthMeters = 2.5f,
            wallMaterialId = "wall_white_plaster",
            floorMaterialId = "floor_tile_ceramic",
            placements = listOf(
                FurniturePlacement("fridge_01", 0.4f, 0.4f, 0f),
                FurniturePlacement("kitchen_counter_01", 1.3f, 0.3f, 0f),
                FurniturePlacement("sink_kitchen_01", 2.0f, 0.3f, 0f),
                FurniturePlacement("stove_01", 2.6f, 0.3f, 0f),
                FurniturePlacement("kitchen_hood", 2.6f, 0.3f, 0f),
            ),
            tags = listOf("modern", "compact", "galley"),
        ),
        RoomTemplate(
            id = "kitchen_island_open",
            name = "Open Kitchen with Island",
            roomType = RoomType.KITCHEN,
            description = "A generous 5x4m open kitchen centered around a large island.",
            styleId = "mid_century_modern",
            widthMeters = 5f,
            depthMeters = 4f,
            wallMaterialId = "wall_white_plaster",
            floorMaterialId = "floor_herringbone_oak",
            placements = listOf(
                FurniturePlacement("kitchen_island", 2.5f, 2f, 0f),
                FurniturePlacement("fridge_double", 0.5f, 0.4f, 0f),
                FurniturePlacement("stove_01", 2f, 0.3f, 0f),
                FurniturePlacement("kitchen_hood", 2f, 0.3f, 0f),
                FurniturePlacement("sink_kitchen_01", 3.5f, 0.3f, 0f),
                FurniturePlacement("dishwasher", 4.2f, 0.3f, 0f),
                FurniturePlacement("pendant_light", 2.5f, 2f, 0f),
            ),
            tags = listOf("open", "island", "spacious"),
        ),

        // ── Bathrooms ──────────────────────────────────────────────────
        RoomTemplate(
            id = "bathroom_spa",
            name = "Spa-Style Bathroom",
            roomType = RoomType.BATHROOM,
            description = "A 3x3m bathroom designed for relaxation with freestanding tub.",
            styleId = "japandi",
            widthMeters = 3f,
            depthMeters = 3f,
            wallMaterialId = "wall_microcement",
            floorMaterialId = "floor_slate_tile",
            placements = listOf(
                FurniturePlacement("bathtub_freestanding", 1.5f, 0.8f, 0f),
                FurniturePlacement("sink_bathroom_01", 0.4f, 2.6f, 0f),
                FurniturePlacement("toilet_01", 2.6f, 2.6f, 0f),
                FurniturePlacement("plant_indoor_01", 0.3f, 0.3f, 0f),
            ),
            tags = listOf("spa", "relaxation", "luxury"),
        ),
        RoomTemplate(
            id = "bathroom_modern_compact",
            name = "Compact Modern Bathroom",
            roomType = RoomType.BATHROOM,
            description = "A functional 2.5x2m bathroom with walk-in shower.",
            styleId = "scandinavian",
            widthMeters = 2.5f,
            depthMeters = 2f,
            wallMaterialId = "wall_white_plaster",
            floorMaterialId = "floor_tile_ceramic",
            placements = listOf(
                FurniturePlacement("shower_walk_in", 1.9f, 0.6f, 0f),
                FurniturePlacement("sink_bathroom_01", 0.4f, 0.3f, 0f),
                FurniturePlacement("toilet_01", 0.4f, 1.7f, 0f),
                FurniturePlacement("bathroom_cabinet", 0.4f, 0.3f, 0f),
            ),
            tags = listOf("modern", "compact"),
        ),

        // ── Dining Rooms ───────────────────────────────────────────────
        RoomTemplate(
            id = "dining_mediterranean",
            name = "Mediterranean Dining Room",
            roomType = RoomType.DINING_ROOM,
            description = "A warm 4x3.5m dining room with rustic Mediterranean character.",
            styleId = "mediterranean",
            widthMeters = 4f,
            depthMeters = 3.5f,
            wallMaterialId = "wall_venetian_plaster",
            floorMaterialId = "floor_travertine",
            ceilingMaterialId = "ceiling_exposed_beams",
            placements = listOf(
                FurniturePlacement("table_dining_01", 2f, 1.75f, 0f),
                FurniturePlacement("chair_dining_modern", 1.2f, 1.0f, 0f),
                FurniturePlacement("chair_dining_modern", 2.8f, 1.0f, 0f),
                FurniturePlacement("chair_dining_modern", 1.2f, 2.5f, 180f),
                FurniturePlacement("chair_dining_modern", 2.8f, 2.5f, 180f),
                FurniturePlacement("chandelier_classic", 2f, 1.75f, 0f),
                FurniturePlacement("sideboard_01", 2f, 3.2f, 180f),
            ),
            tags = listOf("mediterranean", "warm", "rustic"),
        ),

        // ── Home Office ────────────────────────────────────────────────
        RoomTemplate(
            id = "office_minimal",
            name = "Minimal Home Office",
            roomType = RoomType.HOME_OFFICE,
            description = "A focused 3x3m workspace with clean lines.",
            styleId = "scandinavian",
            widthMeters = 3f,
            depthMeters = 3f,
            wallMaterialId = "wall_white_plaster",
            floorMaterialId = "floor_oak_honey",
            placements = listOf(
                FurniturePlacement("desk_standing", 1.5f, 2.6f, 0f),
                FurniturePlacement("office_chair", 1.5f, 2.0f, 0f),
                FurniturePlacement("bookshelf_01", 0.4f, 1.5f, 0f),
                FurniturePlacement("plant_fiddle_leaf", 2.7f, 0.4f, 0f),
                FurniturePlacement("lamp_table", 2.6f, 2.6f, 0f),
            ),
            tags = listOf("minimal", "focused", "productive"),
        ),

        // ── Outdoor ────────────────────────────────────────────────────
        RoomTemplate(
            id = "patio_tropical",
            name = "Tropical Patio",
            roomType = RoomType.OUTDOOR_PATIO,
            description = "A 5x4m outdoor patio designed for tropical living.",
            styleId = "tropical",
            widthMeters = 5f,
            depthMeters = 4f,
            wallMaterialId = "wall_stone_natural",
            floorMaterialId = "floor_slate_tile",
            placements = listOf(
                FurniturePlacement("outdoor_sofa", 2.5f, 0.5f, 0f),
                FurniturePlacement("patio_table_01", 2.5f, 2f, 0f),
                FurniturePlacement("patio_chair_01", 1.5f, 2f, 0f),
                FurniturePlacement("patio_chair_01", 3.5f, 2f, 0f),
                FurniturePlacement("planter_box", 0.3f, 3.7f, 0f),
                FurniturePlacement("planter_box", 4.7f, 3.7f, 0f),
                FurniturePlacement("pergola", 2.5f, 2f, 0f),
            ),
            tags = listOf("tropical", "outdoor", "relaxation"),
        ),
    )
}
