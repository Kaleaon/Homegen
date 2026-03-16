package com.homegen.designer3d.serialization

import kotlinx.serialization.json.Json
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProjectSerializerTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `empty scene round trips`() {
        val project = ProjectFile(scene = SceneData())
        val encoded = json.encodeToString(ProjectFile.serializer(), project)
        val decoded = json.decodeFromString(ProjectFile.serializer(), encoded)

        assertEquals(1, decoded.schemaVersion)
        assertTrue(decoded.scene.objects.isEmpty())
        assertTrue(decoded.scene.materialRefs.isEmpty())
    }

    @Test
    fun `scene with objects round trips`() {
        val obj = ObjectData(
            id = "obj-1",
            type = "wall",
            name = "Living room wall",
            transform = TransformData(
                position = Float3(1f, 0f, 2f),
                rotationEuler = Float3(0f, 1.57f, 0f),
                scale = Float3(1f, 1f, 1f)
            ),
            materialRef = "paint/white",
            properties = mapOf("lengthMeters" to "3.0")
        )
        val matRef = MaterialRef(
            id = "paint/white",
            albedoTexture = "textures/white.png",
            roughness = 0.8f
        )
        val project = ProjectFile(
            scene = SceneData(
                objects = listOf(obj),
                materialRefs = mapOf("paint/white" to matRef)
            )
        )

        val encoded = json.encodeToString(ProjectFile.serializer(), project)
        val decoded = json.decodeFromString(ProjectFile.serializer(), encoded)

        assertEquals(1, decoded.scene.objects.size)
        val restored = decoded.scene.objects[0]
        assertEquals("obj-1", restored.id)
        assertEquals("wall", restored.type)
        assertEquals(1f, restored.transform.position.x)
        assertEquals("paint/white", restored.materialRef)
        assertEquals("3.0", restored.properties["lengthMeters"])

        val restoredMat = decoded.scene.materialRefs["paint/white"]!!
        assertEquals("textures/white.png", restoredMat.albedoTexture)
        assertEquals(0.8f, restoredMat.roughness)
    }

    @Test
    fun `unknown keys are ignored`() {
        val jsonStr = """{"schemaVersion":1,"scene":{"objects":[],"materialRefs":{},"newField":"val"}}"""
        val decoded = json.decodeFromString(ProjectFile.serializer(), jsonStr)
        assertEquals(1, decoded.schemaVersion)
    }

    @Test
    fun `multiple object types round trip`() {
        val objects = listOf(
            ObjectData(id = "1", type = "wall", name = "Wall"),
            ObjectData(id = "2", type = "floor", name = "Floor"),
            ObjectData(id = "3", type = "room", name = "Room"),
            ObjectData(id = "4", type = "furniture", name = "Chair", materialRef = "fabric/gray")
        )
        val project = ProjectFile(scene = SceneData(objects = objects))

        val encoded = json.encodeToString(ProjectFile.serializer(), project)
        val decoded = json.decodeFromString(ProjectFile.serializer(), encoded)

        assertEquals(4, decoded.scene.objects.size)
        assertEquals("furniture", decoded.scene.objects[3].type)
        assertEquals("fabric/gray", decoded.scene.objects[3].materialRef)
    }
}
