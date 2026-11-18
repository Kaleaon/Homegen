package com.homegen.designer3d.serialization

import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.model.Room
import com.homegen.designer3d.model.Transform
import com.homegen.designer3d.model.Wall
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import org.junit.Test
import java.nio.BufferUnderflowException
import java.nio.ByteBuffer
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
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
                scale = Float3(1f, 1f, 1f),
            ),
            materialRef = "paint/white",
            properties = mapOf("lengthMeters" to "3.0"),
        )
        val matRef = MaterialRef(
            id = "paint/white",
            albedoTexture = "textures/white.png",
            roughness = 0.8f,
        )
        val project = ProjectFile(
            scene = SceneData(
                objects = listOf(obj),
                materialRefs = mapOf("paint/white" to matRef),
            ),
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
            ObjectData(id = "4", type = "furniture", name = "Chair", materialRef = "fabric/gray"),
        )
        val project = ProjectFile(scene = SceneData(objects = objects))

        val encoded = json.encodeToString(ProjectFile.serializer(), project)
        val decoded = json.decodeFromString(ProjectFile.serializer(), encoded)

        assertEquals(4, decoded.scene.objects.size)
        assertEquals("furniture", decoded.scene.objects[3].type)
        assertEquals("fabric/gray", decoded.scene.objects[3].materialRef)
    }

    @Test
    fun `project serializer maps raw json buffer to spatial jni native pointer without dropping properties`() {
        val serializer = ProjectSerializer()
        val spatialData = SpatialData(
            crs = "EPSG:4326",
            lotBoundary = listOf(0.0, 0.0, 1000.0, 0.0, 1000.0, 800.0, 0.0, 800.0),
            innerPoints = listOf(36.0, 36.0, 964.0, 36.0, 964.0, 764.0, 36.0, 764.0),
        )
        val buffer = serializer.encodeToBuffer(emptyList(), spatialData)

        val (objects, spatialJni) = serializer.decodeBufferWithSpatial(buffer, buffer.capacity())
        try {
            assertTrue(objects.isEmpty())
            val violations = spatialJni.querySetbackViolations(
                doubleArrayOf(-10.0, -10.0, 10.0, -10.0, 10.0, 10.0, -10.0, 10.0),
            )
            assertTrue(violations.isNotEmpty())
            assertEquals("setback-clearance", violations[0].type)
        } finally {
            spatialJni.close()
        }
    }

    @Test
    fun `decodeWithSpatial decodes raw json string directly and binds spatial jni cleanly`() {
        val serializer = ProjectSerializer()
        val wall = Wall(
            name = "North Wall — 北墙",
            transform = Transform(position = Vector3(2f, 0f, 5f)),
            materialRef = "paint/eggshell",
        ).apply { floorLevel = 1 }
        val chair = Furniture(
            name = "Accent Chair",
            transform = Transform(position = Vector3(3f, 0f, 4f)),
            materialRef = "fabric/navy",
        )
        val spatialData = SpatialData(
            crs = "EPSG:2227",
            lotBoundary = listOf(0.0, 0.0, 1000.0, 0.0, 1000.0, 800.0, 0.0, 800.0),
            innerPoints = listOf(36.0, 36.0, 964.0, 36.0, 964.0, 764.0, 36.0, 764.0),
        )

        val rawJson = serializer.encode(listOf(wall, chair), spatialData)
        val (decodedObjects, spatialJni) = serializer.decodeWithSpatial(rawJson)
        try {
            assertEquals(2, decodedObjects.size)
            val decodedWall = assertIs<Wall>(decodedObjects[0])
            assertEquals("North Wall — 北墙", decodedWall.name)
            assertEquals(2f, decodedWall.transform.position.x)
            assertEquals("paint/eggshell", decodedWall.materialRef)
            assertEquals(1, decodedWall.floorLevel)

            val decodedChair = assertIs<Furniture>(decodedObjects[1])
            assertEquals("Accent Chair", decodedChair.name)
            assertEquals("fabric/navy", decodedChair.materialRef)

            assertEquals("EPSG:2227", spatialJni.crs)
            val validViolations = spatialJni.querySetbackViolations(
                doubleArrayOf(100.0, 100.0, 300.0, 100.0, 300.0, 300.0, 100.0, 300.0),
            )
            assertTrue(validViolations.isEmpty())

            val setbackViolations = spatialJni.querySetbackViolations(
                doubleArrayOf(10.0, 10.0, 300.0, 10.0, 300.0, 300.0, 10.0, 300.0),
            )
            assertTrue(setbackViolations.any { it.type == "setback-clearance" })
        } finally {
            spatialJni.close()
        }
        assertEquals(0L, spatialJni.handle)
    }

    @Test
    fun `decodeBufferWithSpatial preserves direct buffer position limit and capacity`() {
        val serializer = ProjectSerializer()
        val room = Room(
            name = "Primary Suite",
            transform = Transform(position = Vector3(4f, 0f, 6f)),
            materialRef = "room/master",
        )
        val spatialData = SpatialData(
            crs = "EPSG:4326",
            lotBoundary = listOf(0.0, 0.0, 500.0, 0.0, 500.0, 500.0, 0.0, 500.0),
            innerPoints = listOf(25.0, 25.0, 475.0, 25.0, 475.0, 475.0, 25.0, 475.0),
        )
        val jsonBytes = serializer.encode(listOf(room), spatialData).toByteArray(Charsets.UTF_8)

        // Direct buffer with non-zero position and extra trailing capacity
        val headerPadding = 16
        val trailingPadding = 64
        val totalCapacity = headerPadding + jsonBytes.size + trailingPadding
        val directBuffer = ByteBuffer.allocateDirect(totalCapacity)
        directBuffer.position(headerPadding)
        directBuffer.put(jsonBytes)
        directBuffer.position(headerPadding)
        directBuffer.limit(headerPadding + jsonBytes.size + 32)

        val (decodedObjects, spatialJni) = serializer.decodeBufferWithSpatial(directBuffer, jsonBytes.size)
        try {
            assertEquals(headerPadding, directBuffer.position())
            assertEquals(headerPadding + jsonBytes.size + 32, directBuffer.limit())
            assertEquals(totalCapacity, directBuffer.capacity())

            assertEquals(1, decodedObjects.size)
            val decodedRoom = assertIs<Room>(decodedObjects[0])
            assertEquals("Primary Suite", decodedRoom.name)

            assertEquals("EPSG:4326", spatialJni.crs)
            val violations = spatialJni.querySetbackViolations(
                doubleArrayOf(5.0, 5.0, 100.0, 5.0, 100.0, 100.0, 5.0, 100.0),
            )
            assertTrue(violations.any { it.type == "setback-clearance" })
        } finally {
            spatialJni.close()
        }
        assertEquals(0L, spatialJni.handle)
    }

    @Test
    fun `decodeBufferWithSpatial handles non-direct and read-only buffers safely`() {
        val serializer = ProjectSerializer()
        val wall = Wall(name = "Exterior Wall")
        val spatialData = SpatialData(
            crs = "EPSG:26910",
            lotBoundary = listOf(0.0, 0.0, 200.0, 0.0, 200.0, 200.0, 0.0, 200.0),
            innerPoints = listOf(20.0, 20.0, 180.0, 20.0, 180.0, 180.0, 20.0, 180.0),
        )
        val rawBytes = serializer.encode(listOf(wall), spatialData).toByteArray(Charsets.UTF_8)

        // 1. Non-direct heap ByteBuffer with offset
        val paddedHeapArray = ByteArray(8 + rawBytes.size + 8)
        rawBytes.copyInto(paddedHeapArray, destinationOffset = 8)
        val heapBuffer = ByteBuffer.wrap(paddedHeapArray, 8, rawBytes.size)

        val (heapObjects, heapJni) = serializer.decodeBufferWithSpatial(heapBuffer, rawBytes.size)
        try {
            assertEquals(8, heapBuffer.position())
            assertEquals(8 + rawBytes.size, heapBuffer.limit())
            assertEquals(1, heapObjects.size)
            assertEquals("Exterior Wall", heapObjects[0].name)
            assertEquals("EPSG:26910", heapJni.crs)
        } finally {
            heapJni.close()
        }
        assertEquals(0L, heapJni.handle)

        // 2. Read-only heap ByteBuffer and read-only direct ByteBuffer
        val readOnlyHeap = heapBuffer.asReadOnlyBuffer()
        val (roHeapObjects, roHeapJni) = serializer.decodeBufferWithSpatial(readOnlyHeap, rawBytes.size)
        try {
            assertEquals(8, readOnlyHeap.position())
            assertEquals(1, roHeapObjects.size)
            assertEquals("EPSG:26910", roHeapJni.crs)
        } finally {
            roHeapJni.close()
        }
        assertEquals(0L, roHeapJni.handle)

        val readOnlyDirect = serializer.encodeToBuffer(listOf(wall), spatialData).asReadOnlyBuffer()
        val (roDirectObjects, roDirectJni) = serializer.decodeBufferWithSpatial(readOnlyDirect, readOnlyDirect.remaining())
        try {
            assertEquals(0, readOnlyDirect.position())
            assertEquals(1, roDirectObjects.size)
            assertEquals("EPSG:26910", roDirectJni.crs)
        } finally {
            roDirectJni.close()
        }
        assertEquals(0L, roDirectJni.handle)
    }

    @Test
    fun `spatial decoding closes handles across repeated cycles and rejects invalid inputs`() {
        val serializer = ProjectSerializer()
        val spatialData = SpatialData(
            crs = "EPSG:4326",
            lotBoundary = listOf(0.0, 0.0, 100.0, 0.0, 100.0, 100.0, 0.0, 100.0),
            innerPoints = listOf(10.0, 10.0, 90.0, 10.0, 90.0, 90.0, 10.0, 90.0),
        )
        val rawJson = serializer.encode(listOf(Wall(name = "Cycle Wall")), spatialData)
        val directBuffer = serializer.encodeToBuffer(listOf(Wall(name = "Cycle Wall")), spatialData)

        repeat(25) {
            val (strObjs, strJni) = serializer.decodeWithSpatial(rawJson)
            strJni.use { jni ->
                assertEquals(1, strObjs.size)
                assertEquals("EPSG:4326", jni.crs)
            }
            assertEquals(0L, strJni.handle)

            val (bufObjs, bufJni) = serializer.decodeBufferWithSpatial(directBuffer, directBuffer.capacity())
            bufJni.use { jni ->
                assertEquals(1, bufObjs.size)
                assertEquals("EPSG:4326", jni.crs)
            }
            assertEquals(0L, bufJni.handle)
            assertEquals(0, directBuffer.position())
        }

        assertFailsWith<SerializationException> {
            serializer.decodeWithSpatial("{not-valid-json")
        }
        assertFailsWith<BufferUnderflowException> {
            serializer.decodeBufferWithSpatial(directBuffer, directBuffer.capacity() + 1)
        }
        assertFailsWith<IllegalArgumentException> {
            serializer.decodeBufferWithSpatial(directBuffer, -1)
        }
    }
}
