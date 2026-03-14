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
