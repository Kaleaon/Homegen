package com.homegen.designer3d.serialization

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Floor
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.model.Room
import com.homegen.designer3d.model.Transform
import com.homegen.designer3d.model.Wall
import kotlinx.serialization.json.Json

class ProjectSerializer(
    private val json: Json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
    },
) {
    fun encode(objects: List<HomeObject>): String {
        val file = ProjectFile(
            scene = SceneData(objects = objects.map { it.toData() }),
        )
        return json.encodeToString(ProjectFile.serializer(), file)
    }

    fun decode(rawJson: String): List<HomeObject> {
        val file = json.decodeFromString(ProjectFile.serializer(), rawJson)
        return file.scene.objects.map { it.toEntity() }
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
