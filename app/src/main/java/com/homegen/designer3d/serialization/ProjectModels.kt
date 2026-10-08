package com.homegen.designer3d.serialization

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * JSON schema root for project save/load.
 */
@Serializable
data class ProjectFile(
    val schemaVersion: Int = 1,
    val scene: SceneData,
    val spatial: SpatialData? = null,
)

@Serializable
data class SpatialData(
    val crs: String = "EPSG:4326",
    val lotBoundary: List<Double> = emptyList(),
    val innerPoints: List<Double> = emptyList(),
    val segments: List<SetbackSegmentData> = emptyList(),
    val layers: List<SpatialLayerData> = emptyList(),
)

@Serializable
data class SetbackSegmentData(
    val id: String,
    val p1x: Double,
    val p1y: Double,
    val p2x: Double,
    val p2y: Double,
    val setback: Double = 36.0,
    val label: String = "",
)

@Serializable
data class SpatialLayerData(
    val id: String,
    val type: String,
    val name: String = "",
    val points: List<Double> = emptyList(),
)

@Serializable
data class SceneData(
    val objects: List<ObjectData> = emptyList(),
    val materialRefs: Map<String, MaterialRef> = emptyMap(),
)

@Serializable
data class ObjectData(
    val id: String,
    val type: String,
    val name: String,
    val transform: TransformData = TransformData(),
    val materialRef: String = "default",
    val floorLevel: Int = 0,
    val properties: Map<String, String> = emptyMap(),
)

@Serializable
data class TransformData(
    val position: Float3 = Float3(),
    val rotationEuler: Float3 = Float3(),
    val scale: Float3 = Float3(1f, 1f, 1f),
)

@Serializable
data class Float3(val x: Float = 0f, val y: Float = 0f, val z: Float = 0f)

@Serializable
data class MaterialRef(
    val id: String,
    @SerialName("albedo_tex") val albedoTexture: String? = null,
    @SerialName("normal_tex") val normalTexture: String? = null,
    val metallic: Float = 0f,
    val roughness: Float = 1f,
)
