package com.homegen.assets.model

import kotlinx.serialization.Serializable

@Serializable
data class Catalog(
    val version: Int,
    val materials: List<MaterialAsset>,
    val placeableObjects: List<PlaceableAsset>
)

@Serializable
data class MaterialAsset(
    val id: String,
    val name: String,
    val category: MaterialCategory,
    val tags: List<String>,
    val texturePath: String,
    val thumbnailPath: String
)

@Serializable
data class PlaceableAsset(
    val id: String,
    val name: String,
    val category: String,
    val tags: List<String>,
    val modelPath: String,
    val thumbnailPath: String,
    val footprintMeters: Dimensions3
)

@Serializable
data class Dimensions3(
    val x: Float,
    val y: Float,
    val z: Float
)

@Serializable
enum class MaterialCategory {
    walls,
    floors,
    ceilings
}

enum class CatalogCategory(val label: String) {
    ALL("All"),
    WALLS("Walls"),
    FLOORS("Floors"),
    CEILINGS("Ceilings"),
    FURNITURE("Furniture"),
    CHAIRS("Chairs"),
    TABLES("Tables"),
    SOFAS("Sofas"),
    BEDS("Beds"),
    STORAGE("Storage"),
    DOORS("Doors"),
    WINDOWS("Windows"),
    LIGHTING("Lighting"),
    DECORATIVE("Decorative"),
    BATHROOM("Bathroom"),
    KITCHEN("Kitchen"),
    OUTDOOR("Outdoor"),
    OFFICE("Office"),
    LAUNDRY("Laundry"),
    STAIRS("Stairs"),
}

sealed interface CatalogEntry {
    val id: String
    val name: String
    val categoryPath: String
    val tags: List<String>
    val thumbnailPath: String
}

data class MaterialEntry(val material: MaterialAsset) : CatalogEntry {
    override val id: String = material.id
    override val name: String = material.name
    override val categoryPath: String = material.category.name
    override val tags: List<String> = material.tags
    override val thumbnailPath: String = material.thumbnailPath
}

data class PlaceableEntry(val placeable: PlaceableAsset) : CatalogEntry {
    override val id: String = placeable.id
    override val name: String = placeable.name
    override val categoryPath: String = placeable.category
    override val tags: List<String> = placeable.tags
    override val thumbnailPath: String = placeable.thumbnailPath
}
