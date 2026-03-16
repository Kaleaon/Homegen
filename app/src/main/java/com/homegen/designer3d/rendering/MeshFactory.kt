package com.homegen.designer3d.rendering

import com.google.android.filament.Box
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.VertexBuffer
import com.homegen.designer3d.math.Vector3
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.ShortBuffer

/**
 * Creates procedural Filament meshes for walls, floors, boxes, and grid planes.
 */
object MeshFactory {

    /**
     * Creates a box renderable entity centered at origin.
     */
    fun createBox(engine: Engine, halfExtents: Vector3, materialInstance: MaterialInstance): Int {
        val hx = halfExtents.x
        val hy = halfExtents.y
        val hz = halfExtents.z

        // 24 vertices (4 per face, unique normals)
        val positions = floatArrayOf(
            // Front face (z+)
            -hx, -hy, hz,  hx, -hy, hz,  hx, hy, hz,  -hx, hy, hz,
            // Back face (z-)
            hx, -hy, -hz,  -hx, -hy, -hz,  -hx, hy, -hz,  hx, hy, -hz,
            // Top face (y+)
            -hx, hy, hz,  hx, hy, hz,  hx, hy, -hz,  -hx, hy, -hz,
            // Bottom face (y-)
            -hx, -hy, -hz,  hx, -hy, -hz,  hx, -hy, hz,  -hx, -hy, hz,
            // Right face (x+)
            hx, -hy, hz,  hx, -hy, -hz,  hx, hy, -hz,  hx, hy, hz,
            // Left face (x-)
            -hx, -hy, -hz,  -hx, -hy, hz,  -hx, hy, hz,  -hx, hy, -hz,
        )

        val normals = floatArrayOf(
            0f, 0f, 1f,  0f, 0f, 1f,  0f, 0f, 1f,  0f, 0f, 1f,
            0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f,
            0f, 1f, 0f,  0f, 1f, 0f,  0f, 1f, 0f,  0f, 1f, 0f,
            0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f,
            1f, 0f, 0f,  1f, 0f, 0f,  1f, 0f, 0f,  1f, 0f, 0f,
            -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f,
        )

        val uvs = floatArrayOf(
            0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f,
            0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f,
            0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f,
            0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f,
            0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f,
            0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f,
        )

        val indices = shortArrayOf(
            0, 1, 2, 0, 2, 3,       // front
            4, 5, 6, 4, 6, 7,       // back
            8, 9, 10, 8, 10, 11,    // top
            12, 13, 14, 12, 14, 15, // bottom
            16, 17, 18, 16, 18, 19, // right
            20, 21, 22, 20, 22, 23, // left
        )

        val vertexBuffer = VertexBuffer.Builder()
            .vertexCount(24)
            .bufferCount(3)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.TANGENTS, 1, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.UV0, 2, VertexBuffer.AttributeType.FLOAT2, 0, 8)
            .build(engine)

        vertexBuffer.setBufferAt(engine, 0, toFloatBuffer(positions))
        vertexBuffer.setBufferAt(engine, 1, toFloatBuffer(normals))
        vertexBuffer.setBufferAt(engine, 2, toFloatBuffer(uvs))

        val indexBuffer = IndexBuffer.Builder()
            .indexCount(36)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)

        indexBuffer.setBuffer(engine, toShortBuffer(indices))

        val entity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, 0f, 0f, hx, hy, hz))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vertexBuffer, indexBuffer, 0, 36)
            .material(0, materialInstance)
            .castShadows(true)
            .receiveShadows(true)
            .build(engine, entity)

        return entity
    }

    /**
     * Creates a flat plane at y=0, useful for floors and the grid.
     */
    fun createPlane(engine: Engine, width: Float, depth: Float, materialInstance: MaterialInstance): Int {
        val hw = width / 2f
        val hd = depth / 2f

        val positions = floatArrayOf(
            -hw, 0f, -hd,
            hw, 0f, -hd,
            hw, 0f, hd,
            -hw, 0f, hd,
        )
        val normals = floatArrayOf(
            0f, 1f, 0f,
            0f, 1f, 0f,
            0f, 1f, 0f,
            0f, 1f, 0f,
        )
        val uvs = floatArrayOf(
            0f, 0f,
            width, 0f,
            width, depth,
            0f, depth,
        )
        val indices = shortArrayOf(0, 1, 2, 0, 2, 3)

        val vertexBuffer = VertexBuffer.Builder()
            .vertexCount(4)
            .bufferCount(3)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.TANGENTS, 1, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.UV0, 2, VertexBuffer.AttributeType.FLOAT2, 0, 8)
            .build(engine)

        vertexBuffer.setBufferAt(engine, 0, toFloatBuffer(positions))
        vertexBuffer.setBufferAt(engine, 1, toFloatBuffer(normals))
        vertexBuffer.setBufferAt(engine, 2, toFloatBuffer(uvs))

        val indexBuffer = IndexBuffer.Builder()
            .indexCount(6)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)

        indexBuffer.setBuffer(engine, toShortBuffer(indices))

        val entity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, 0f, 0f, hw, 0.01f, hd))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vertexBuffer, indexBuffer, 0, 6)
            .material(0, materialInstance)
            .castShadows(false)
            .receiveShadows(true)
            .build(engine, entity)

        return entity
    }

    private fun toFloatBuffer(data: FloatArray): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(data.size * 4).order(ByteOrder.nativeOrder())
        buf.asFloatBuffer().put(data)
        buf.rewind()
        return buf
    }

    private fun toShortBuffer(data: ShortArray): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(data.size * 2).order(ByteOrder.nativeOrder())
        buf.asShortBuffer().put(data)
        buf.rewind()
        return buf
    }
}
