package com.homegen.designer3d.serialization

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Floor
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.model.Room
import com.homegen.designer3d.model.Transform
import com.homegen.designer3d.model.Wall
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class ProjectSerializer(
    private val json: Json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
    },
) {
    companion object {
        const val CURRENT_SCHEMA_VERSION = 1

        /**
         * Schema migration functions keyed by source version.
         * Each transforms a raw JsonObject from version N to N+1.
         */
        private val migrations: Map<Int, (JsonObject) -> JsonObject> = mapOf(
            // Future migrations go here, e.g.:
            // 1 to { obj -> migrateV1ToV2(obj) }
        )
    }

    fun encode(objects: List<HomeObject>): String {
        val file = ProjectFile(
            scene = SceneData(objects = objects.map { it.toData() }),
        )
        return json.encodeToString(ProjectFile.serializer(), file)
    }

    fun decode(rawJson: String): List<HomeObject> {
        val raw = json.parseToJsonElement(rawJson).jsonObject
        val version = raw["schemaVersion"]?.jsonPrimitive?.int ?: 1
        val migrated = applyMigrations(raw, version)
        val file = json.decodeFromJsonElement(ProjectFile.serializer(), migrated)
        return file.scene.objects.map { it.toEntity() }
    }

    private fun applyMigrations(data: JsonObject, fromVersion: Int): JsonObject {
        var current = data
        var version = fromVersion
        while (version < CURRENT_SCHEMA_VERSION) {
            val migration = migrations[version]
                ?: throw IllegalStateException(
                    "No migration from schema version $version to ${version + 1}"
                )
            current = migration(current)
            version++
        }
        return current
    }
}

private fun HomeObject.toData(): ObjectData = ObjectData(
    id = id,
    type = type,
    name = name,
    transform = TransformData(
        position = transform.position.toFloat3(),
        rotationEuler = transform.rotationEuler.toFloat3(),
        scale = transform.scale.toFloat3(),
    ),
    materialRef = materialRef,
)

private fun ObjectData.toEntity(): HomeObject {
    val transform = Transform(
        position = transform.position.toVector3(),
        rotationEuler = transform.rotationEuler.toVector3(),
        scale = transform.scale.toVector3(),
    )

    return when (type) {
        "wall" -> Wall(name = name, transform = transform, materialRef = materialRef)
        "floor" -> Floor(name = name, transform = transform, materialRef = materialRef)
        "room" -> Room(name = name, transform = transform, materialRef = materialRef)
        "furniture" -> Furniture(name = name, transform = transform, materialRef = materialRef)
        else -> HomeObject(type = type, name = name, transform = transform, materialRef = materialRef)
    }
}

private fun Vector3.toFloat3() = Float3(x, y, z)
private fun Float3.toVector3() = Vector3(x, y, z)
