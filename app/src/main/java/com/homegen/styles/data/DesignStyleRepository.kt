package com.homegen.styles.data

import com.homegen.styles.model.ColorPalette
import com.homegen.styles.model.DesignStyle
import com.homegen.styles.model.DesignStyleCatalog
import com.homegen.styles.model.DesignStyleCategory

/**
 * Provides built-in design styles inspired by The People's Design Library
 * architecture/interior design categories. Styles are defined in-memory
 * for fast access; no file I/O needed.
 */
object DesignStyleRepository {

    fun loadCatalog(): DesignStyleCatalog = DesignStyleCatalog(
        version = 1,
        styles = allStyles,
        palettes = allPalettes,
    )

    fun filterStyles(
        catalog: DesignStyleCatalog,
        query: String = "",
        category: DesignStyleCategory = DesignStyleCategory.ALL,
    ): List<DesignStyle> {
        val q = query.trim().lowercase()
        return catalog.styles.filter { style ->
            matchesCategory(style, category) &&
                (q.isBlank() ||
                    style.name.lowercase().contains(q) ||
                    style.tags.any { it.lowercase().contains(q) } ||
                    style.description.lowercase().contains(q))
        }
    }

    private fun matchesCategory(style: DesignStyle, category: DesignStyleCategory): Boolean =
        when (category) {
            DesignStyleCategory.ALL -> true
            DesignStyleCategory.MODERN -> style.tags.any { it in setOf("modern", "contemporary", "futurist") }
            DesignStyleCategory.TRADITIONAL -> style.tags.any { it in setOf("traditional", "classic", "historical") }
            DesignStyleCategory.ECLECTIC -> style.tags.any { it in setOf("eclectic", "maximalist", "bold") }
            DesignStyleCategory.MINIMALIST -> style.tags.any { it in setOf("minimal", "clean", "simple") }
            DesignStyleCategory.ORGANIC -> style.tags.any { it in setOf("organic", "natural", "biophilic") }
            DesignStyleCategory.REGIONAL -> style.tags.any { it in setOf("regional", "cultural", "vernacular") }
        }

    // ── Palettes ────────────────────────────────────────────────────────────

    private val palettes = mapOf(
        "scandinavian" to ColorPalette("pal_scandinavian", "Scandinavian", listOf("#FFFFFF", "#F5F0EB", "#D4C5B2", "#8B7355", "#2C2C2C"), accent = "#6B8F71"),
        "japandi" to ColorPalette("pal_japandi", "Japandi", listOf("#F7F3EE", "#DDD0C0", "#A69279", "#5C4033", "#2B2B2B"), accent = "#7D8C6C"),
        "mid_century" to ColorPalette("pal_mid_century", "Mid-Century Modern", listOf("#F5E6CC", "#D4763C", "#2D5F2D", "#1A3C5B", "#3D2B1F"), accent = "#D4763C"),
        "art_deco" to ColorPalette("pal_art_deco", "Art Deco", listOf("#0D0D0D", "#1C3144", "#D4AF37", "#FFFFFF", "#8B0000"), accent = "#D4AF37"),
        "brutalist" to ColorPalette("pal_brutalist", "Brutalist", listOf("#808080", "#A9A9A9", "#C0C0C0", "#3C3C3C", "#1A1A1A"), accent = "#CC5500"),
        "boho" to ColorPalette("pal_boho", "Bohemian", listOf("#F5E6D3", "#C97B4A", "#8B4513", "#556B2F", "#8B008B"), accent = "#DAA520"),
        "industrial" to ColorPalette("pal_industrial", "Industrial", listOf("#2C2C2C", "#4A4A4A", "#808080", "#B87333", "#C8C8C8"), accent = "#B87333"),
        "mediterranean" to ColorPalette("pal_mediterranean", "Mediterranean", listOf("#FAEBD7", "#C19A6B", "#E07B39", "#1E4D6B", "#FFFFFF"), accent = "#E07B39"),
        "hollywood_regency" to ColorPalette("pal_hollywood_regency", "Hollywood Regency", listOf("#000000", "#FFD700", "#4B0082", "#FF1493", "#FFFFFF"), accent = "#FFD700"),
        "dark_academia" to ColorPalette("pal_dark_academia", "Dark Academia", listOf("#2C1810", "#4A3728", "#8B7355", "#C4A882", "#1C3144"), accent = "#8B0000"),
        "wabi_sabi" to ColorPalette("pal_wabi_sabi", "Wabi-Sabi", listOf("#E8DFD1", "#C4B5A0", "#9E8E7E", "#6B5B4B", "#3C3228"), accent = "#7D8C6C"),
        "tropical" to ColorPalette("pal_tropical", "Tropical", listOf("#FFFFFF", "#00694E", "#FFB300", "#E55B3C", "#1B4332"), accent = "#FF6B35"),
        "art_nouveau" to ColorPalette("pal_art_nouveau", "Art Nouveau", listOf("#F5F0E1", "#6B8E4E", "#8B4513", "#D4A574", "#2C3E2C"), accent = "#9B59B6"),
        "memphis" to ColorPalette("pal_memphis", "Memphis", listOf("#FF6B6B", "#4ECDC4", "#FFE66D", "#2C3E50", "#FF69B4"), accent = "#00D2FF"),
        "coastal" to ColorPalette("pal_coastal", "Coastal", listOf("#FFFFFF", "#D4E6F1", "#5DADE2", "#2C3E50", "#F0E6D3"), accent = "#E74C3C"),
        "hygge" to ColorPalette("pal_hygge", "Hygge", listOf("#FFF8F0", "#E8DFD1", "#C4A882", "#6B5B4B", "#3C3228"), accent = "#CC8844"),
        "tuscan" to ColorPalette("pal_tuscan", "Tuscan", listOf("#FFF5E1", "#D4A574", "#8B4513", "#556B2F", "#6B3A2E"), accent = "#B8860B"),
        "desert_modern" to ColorPalette("pal_desert_modern", "Desert Modernism", listOf("#FAF0E6", "#D2B48C", "#C19A6B", "#8B7355", "#A0522D"), accent = "#E07040"),
        "asian_zen" to ColorPalette("pal_asian_zen", "Asian Zen", listOf("#F5F0E8", "#C4B5A0", "#6B7B5B", "#3C3C2C", "#1A1A14"), accent = "#8B0000"),
        "retro_futurist" to ColorPalette("pal_retro_futurist", "Retro Futurism", listOf("#1A1A2E", "#16213E", "#0F3460", "#E94560", "#FFFFFF"), accent = "#E94560"),
    )

    private val allPalettes: List<ColorPalette> = palettes.values.toList()

    // ── Styles ──────────────────────────────────────────────────────────────

    private val allStyles: List<DesignStyle> = listOf(
        DesignStyle(
            id = "scandinavian",
            name = "Scandinavian",
            description = "Light woods, clean lines, and muted tones. Functional beauty with cozy warmth.",
            era = "1950s–present",
            palette = palettes.getValue("scandinavian"),
            recommendedMaterialIds = listOf("wall_white_plaster", "floor_oak_honey", "floor_herringbone_oak", "ceiling_wood_plank"),
            recommendedFurnitureIds = listOf("chair_scandi_01", "chair_wishbone", "sofa_modern_01", "lamp_floor_01", "pendant_light", "plant_indoor_01"),
            tags = listOf("modern", "clean", "minimal", "nordic", "natural"),
        ),
        DesignStyle(
            id = "japandi",
            name = "Japandi",
            description = "The serene merger of Japanese minimalism and Scandinavian functionality. Natural materials, neutral tones, intentional simplicity.",
            era = "2010s–present",
            palette = palettes.getValue("japandi"),
            recommendedMaterialIds = listOf("wall_warm_beige", "floor_bamboo", "floor_tatami", "wall_limewash_white"),
            recommendedFurnitureIds = listOf("bed_platform", "chair_wishbone", "sofa_daybed", "paper_lantern", "vase_ceramic"),
            tags = listOf("modern", "minimal", "organic", "natural", "simple", "clean"),
        ),
        DesignStyle(
            id = "mid_century_modern",
            name = "Mid-Century Modern",
            description = "Iconic 1950s/60s design with organic forms, bold color pops, and timeless furniture silhouettes.",
            era = "1945–1969",
            palette = palettes.getValue("mid_century"),
            recommendedMaterialIds = listOf("floor_walnut_dark", "wall_olive_green", "floor_terrazzo"),
            recommendedFurnitureIds = listOf("chair_eames_lounge", "chair_egg", "sofa_daybed", "sideboard_01", "lamp_arc", "side_table_round"),
            tags = listOf("modern", "contemporary", "iconic"),
        ),
        DesignStyle(
            id = "art_deco",
            name = "Art Deco",
            description = "Opulent glamour with geometric patterns, rich materials, and metallic accents. Jazz age luxury.",
            era = "1920s–1930s",
            palette = palettes.getValue("art_deco"),
            recommendedMaterialIds = listOf("floor_marble_black", "wall_navy_blue", "wall_wallpaper_geometric", "ceiling_coffered"),
            recommendedFurnitureIds = listOf("sofa_velvet_curve", "chandelier_modern", "mirror_wall_01", "cabinet_display", "window_arched"),
            tags = listOf("traditional", "classic", "bold", "maximalist", "historical"),
        ),
        DesignStyle(
            id = "brutalist",
            name = "Brutalist",
            description = "Raw concrete, exposed structure, and monumental forms. Honest materials celebrating construction.",
            era = "1950s–1970s",
            palette = palettes.getValue("brutalist"),
            recommendedMaterialIds = listOf("wall_concrete_raw", "floor_concrete_polished", "ceiling_concrete"),
            recommendedFurnitureIds = listOf("staircase_floating", "window_floor_to_ceiling", "lamp_floor_01"),
            tags = listOf("modern", "bold"),
        ),
        DesignStyle(
            id = "bohemian",
            name = "Bohemian",
            description = "Eclectic layering of textiles, patterns, and global finds. Free-spirited, colorful warmth.",
            era = "1960s–present",
            palette = palettes.getValue("boho"),
            recommendedMaterialIds = listOf("wall_terracotta", "floor_reclaimed_wood", "floor_encaustic_tile"),
            recommendedFurnitureIds = listOf("chair_papasan", "rug_moroccan", "plant_monstera", "hammock", "curtains_sheer"),
            tags = listOf("eclectic", "maximalist", "bold", "organic", "natural"),
        ),
        DesignStyle(
            id = "industrial",
            name = "Industrial",
            description = "Exposed brick, metal accents, and open spaces. Factory-inspired urban aesthetic.",
            era = "1990s–present",
            palette = palettes.getValue("industrial"),
            recommendedMaterialIds = listOf("wall_exposed_brick", "floor_concrete_polished", "wall_concrete_raw", "ceiling_concrete"),
            recommendedFurnitureIds = listOf("bookshelf_01", "track_lighting", "door_barn", "staircase_floating"),
            tags = listOf("modern", "urban"),
        ),
        DesignStyle(
            id = "mediterranean",
            name = "Mediterranean",
            description = "Sun-drenched warmth with terracotta, wrought iron, and natural stone. Coastal European charm.",
            era = "Traditional",
            palette = palettes.getValue("mediterranean"),
            recommendedMaterialIds = listOf("wall_terracotta", "floor_travertine", "wall_stone_natural", "floor_encaustic_tile", "wall_venetian_plaster"),
            recommendedFurnitureIds = listOf("window_arched", "fireplace_traditional", "patio_table_01", "planter_box", "pergola"),
            tags = listOf("regional", "cultural", "traditional", "vernacular"),
        ),
        DesignStyle(
            id = "hollywood_regency",
            name = "Hollywood Regency",
            description = "Glamorous maximalism with high contrast, metallic finishes, and dramatic silhouettes.",
            era = "1930s–present",
            palette = palettes.getValue("hollywood_regency"),
            recommendedMaterialIds = listOf("floor_marble_white", "wall_blush_pink", "wall_navy_blue", "ceiling_coffered"),
            recommendedFurnitureIds = listOf("sofa_velvet_curve", "chair_wingback", "chandelier_classic", "mirror_full_length", "bed_four_poster"),
            tags = listOf("traditional", "classic", "maximalist", "bold"),
        ),
        DesignStyle(
            id = "dark_academia",
            name = "Dark Academia",
            description = "Rich, moody tones with leather, dark wood, and scholarly charm. Library meets lounge.",
            era = "2010s–present",
            palette = palettes.getValue("dark_academia"),
            recommendedMaterialIds = listOf("wall_charcoal", "floor_walnut_dark", "wall_wood_paneling"),
            recommendedFurnitureIds = listOf("sofa_chesterfield", "bookshelf_01", "chair_wingback", "lamp_table", "fireplace_traditional"),
            tags = listOf("traditional", "historical"),
        ),
        DesignStyle(
            id = "wabi_sabi",
            name = "Wabi-Sabi",
            description = "Beauty in imperfection. Organic textures, muted earth tones, and handcrafted objects.",
            era = "Ancient–present",
            palette = palettes.getValue("wabi_sabi"),
            recommendedMaterialIds = listOf("wall_limewash_white", "floor_reclaimed_wood", "wall_microcement"),
            recommendedFurnitureIds = listOf("vase_ceramic", "bed_platform", "paper_lantern", "plant_indoor_01"),
            tags = listOf("organic", "natural", "minimal", "simple"),
        ),
        DesignStyle(
            id = "tropical",
            name = "Tropical",
            description = "Lush greenery, natural materials, and bold patterns inspired by tropical environments.",
            era = "Traditional–present",
            palette = palettes.getValue("tropical"),
            recommendedMaterialIds = listOf("floor_bamboo", "wall_warm_beige"),
            recommendedFurnitureIds = listOf("plant_monstera", "chair_acapulco", "hammock", "ceiling_fan", "pergola"),
            tags = listOf("regional", "natural", "biophilic", "organic"),
        ),
        DesignStyle(
            id = "art_nouveau",
            name = "Art Nouveau",
            description = "Flowing organic forms, botanical motifs, and intricate craftsmanship. Nature as muse.",
            era = "1890–1910",
            palette = palettes.getValue("art_nouveau"),
            recommendedMaterialIds = listOf("wall_wallpaper_botanical", "floor_herringbone_oak", "ceiling_coffered"),
            recommendedFurnitureIds = listOf("window_arched", "chandelier_classic", "mirror_wall_01"),
            tags = listOf("traditional", "historical", "organic", "natural"),
        ),
        DesignStyle(
            id = "memphis",
            name = "Memphis",
            description = "Playful postmodern rebellion. Bold geometry, clashing colors, and anti-minimalism.",
            era = "1981–1988",
            palette = palettes.getValue("memphis"),
            recommendedMaterialIds = listOf("floor_terrazzo", "wall_wallpaper_geometric"),
            recommendedFurnitureIds = listOf("rug_round", "lamp_arc"),
            tags = listOf("eclectic", "bold", "maximalist"),
        ),
        DesignStyle(
            id = "coastal",
            name = "Coastal",
            description = "Breezy, light-filled spaces with ocean-inspired blues, natural textures, and driftwood tones.",
            era = "Traditional–present",
            palette = palettes.getValue("coastal"),
            recommendedMaterialIds = listOf("wall_white_plaster", "floor_oak_honey", "wall_slate_blue"),
            recommendedFurnitureIds = listOf("sofa_modern_01", "outdoor_sofa", "curtains_sheer", "rug_rectangular_01"),
            tags = listOf("organic", "natural"),
        ),
        DesignStyle(
            id = "hygge",
            name = "Hygge",
            description = "Danish coziness. Warm textiles, soft lighting, and intimate gathering spaces.",
            era = "Cultural tradition",
            palette = palettes.getValue("hygge"),
            recommendedMaterialIds = listOf("wall_cream", "floor_oak_honey", "floor_carpet_gray", "ceiling_wood_plank"),
            recommendedFurnitureIds = listOf("candle_group", "rug_rectangular_01", "sofa_modern_01", "lamp_table", "fireplace_modern", "curtains_blackout"),
            tags = listOf("organic", "natural", "cultural", "regional"),
        ),
        DesignStyle(
            id = "tuscan",
            name = "Tuscan",
            description = "Rustic Italian warmth with stone, aged wood, and sun-faded terracotta. Old-world charm.",
            era = "Traditional",
            palette = palettes.getValue("tuscan"),
            recommendedMaterialIds = listOf("wall_terracotta", "wall_stone_natural", "floor_travertine", "ceiling_exposed_beams"),
            recommendedFurnitureIds = listOf("fireplace_traditional", "table_dining_01", "patio_table_01", "planter_box"),
            tags = listOf("traditional", "regional", "cultural", "vernacular"),
        ),
        DesignStyle(
            id = "desert_modernism",
            name = "Desert Modernism",
            description = "Clean modern lines harmonizing with arid landscapes. Warm neutrals, stone, and indoor-outdoor flow.",
            era = "1940s–present",
            palette = palettes.getValue("desert_modern"),
            recommendedMaterialIds = listOf("wall_warm_beige", "floor_travertine", "wall_microcement"),
            recommendedFurnitureIds = listOf("plant_cactus_group", "window_floor_to_ceiling", "door_sliding_01", "pool_lounger", "fire_pit"),
            tags = listOf("modern", "regional"),
        ),
        DesignStyle(
            id = "asian_zen",
            name = "Asian Zen",
            description = "Balanced simplicity inspired by East Asian philosophies. Natural materials, open space, and tranquility.",
            era = "Traditional–present",
            palette = palettes.getValue("asian_zen"),
            recommendedMaterialIds = listOf("floor_bamboo", "floor_tatami", "wall_limewash_white"),
            recommendedFurnitureIds = listOf("bed_platform", "paper_lantern", "vase_ceramic", "plant_indoor_01"),
            tags = listOf("minimal", "organic", "natural", "simple", "regional", "cultural"),
        ),
        DesignStyle(
            id = "retro_futurism",
            name = "Retro Futurism",
            description = "Space-age optimism meets vintage nostalgia. Bold curves, neon accents, and metallic surfaces.",
            era = "1950s–1970s aesthetic",
            palette = palettes.getValue("retro_futurist"),
            recommendedMaterialIds = listOf("wall_charcoal", "floor_marble_white"),
            recommendedFurnitureIds = listOf("chair_egg", "sofa_modular", "lamp_arc", "staircase_spiral"),
            tags = listOf("modern", "futurist", "bold"),
        ),
    )
}
