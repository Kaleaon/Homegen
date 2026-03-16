package com.homegen.styles.model

import kotlinx.serialization.Serializable

/**
 * A curated interior design style with recommended materials, colors, and furniture.
 * Inspired by The People's Design Library architecture/interior design style taxonomy.
 */
@Serializable
data class DesignStyle(
    val id: String,
    val name: String,
    val description: String,
    val era: String = "",
    val palette: ColorPalette,
    val recommendedMaterialIds: List<String> = emptyList(),
    val recommendedFurnitureIds: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val thumbnailPath: String = "",
)

@Serializable
data class ColorPalette(
    val id: String,
    val name: String,
    val colors: List<String>,
    val accent: String = "",
)

@Serializable
data class DesignStyleCatalog(
    val version: Int = 1,
    val styles: List<DesignStyle>,
    val palettes: List<ColorPalette>,
)

enum class DesignStyleCategory {
    ALL,
    MODERN,
    TRADITIONAL,
    ECLECTIC,
    MINIMALIST,
    ORGANIC,
    REGIONAL,
}
