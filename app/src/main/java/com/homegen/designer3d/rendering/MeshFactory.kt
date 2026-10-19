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
            -hx, -hy, hz, hx, -hy, hz, hx, hy, hz, -hx, hy, hz,
            // Back face (z-)
            hx, -hy, -hz, -hx, -hy, -hz, -hx, hy, -hz, hx, hy, -hz,
            // Top face (y+)
            -hx, hy, hz, hx, hy, hz, hx, hy, -hz, -hx, hy, -hz,
            // Bottom face (y-)
            -hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz,
            // Right face (x+)
            hx, -hy, hz, hx, -hy, -hz, hx, hy, -hz, hx, hy, hz,
            // Left face (x-)
            -hx, -hy, -hz, -hx, -hy, hz, -hx, hy, hz, -hx, hy, -hz,
        )

        val normals = floatArrayOf(
            0f, 0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f,
            0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f,
            0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f,
            0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f, 0f, -1f, 0f,
            1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 0f,
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
            0, 1, 2, 0, 2, 3, // front
            4, 5, 6, 4, 6, 7, // back
            8, 9, 10, 8, 10, 11, // top
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
        return createSubdividedPlane(engine, width, depth, 1, 1, materialInstance)
    }

    /**
     * Creates a subdivided plane grid mesh for GPU heightmap vertex displacement.
     */
    fun createSubdividedPlane(
        engine: Engine,
        width: Float,
        depth: Float,
        subdivisionsX: Int = 32,
        subdivisionsZ: Int = 32,
        materialInstance: MaterialInstance,
        heightmapData: FloatArray? = null,
        verticalScale: Float = 1.0f,
    ): Int {
        val subX = Math.max(1, subdivisionsX)
        val subZ = Math.max(1, subdivisionsZ)

        val vertexCount = (subX + 1) * (subZ + 1)
        val indexCount = subX * subZ * 6

        val positions = FloatArray(vertexCount * 3)
        val normals = FloatArray(vertexCount * 3)
        val uvs = FloatArray(vertexCount * 2)

        val hw = width / 2f
        val hd = depth / 2f

        var vIdx = 0
        var uvIdx = 0

        for (iz in 0..subZ) {
            val v = iz.toFloat() / subZ
            val z = -hd + v * depth
            for (ix in 0..subX) {
                val u = ix.toFloat() / subX
                val x = -hw + u * width

                var y = 0f
                if (heightmapData != null && heightmapData.isNotEmpty()) {
                    val hx = (u * (subX)).toInt().coerceIn(0, subX)
                    val hz = (v * (subZ)).toInt().coerceIn(0, subZ)
                    val dataIdx = (hz * (subX + 1) + hx).coerceIn(0, heightmapData.size - 1)
                    y = heightmapData[dataIdx] * verticalScale
                }

                positions[vIdx * 3] = x
                positions[vIdx * 3 + 1] = y
                positions[vIdx * 3 + 2] = z

                normals[vIdx * 3] = 0f
                normals[vIdx * 3 + 1] = 1f
                normals[vIdx * 3 + 2] = 0f

                uvs[uvIdx * 2] = u
                uvs[uvIdx * 2 + 1] = v

                vIdx++
                uvIdx++
            }
        }

        val indices = IntArray(indexCount)
        var iIdx = 0

        for (iz in 0 until subZ) {
            for (ix in 0 until subX) {
                val v0 = iz * (subX + 1) + ix
                val v1 = v0 + 1
                val v2 = (iz + 1) * (subX + 1) + ix
                val v3 = v2 + 1

                indices[iIdx++] = v0
                indices[iIdx++] = v2
                indices[iIdx++] = v1

                indices[iIdx++] = v1
                indices[iIdx++] = v2
                indices[iIdx++] = v3
            }
        }

        if (heightmapData != null && heightmapData.isNotEmpty()) {
            recalculateNormals(positions, indices, normals)
        }

        val useIntIndices = vertexCount > 65535
        val indexType = if (useIntIndices) {
            IndexBuffer.Builder.IndexType.UINT
        } else {
            IndexBuffer.Builder.IndexType.USHORT
        }

        val vertexBuffer = VertexBuffer.Builder()
            .vertexCount(vertexCount)
            .bufferCount(3)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.TANGENTS, 1, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.UV0, 2, VertexBuffer.AttributeType.FLOAT2, 0, 8)
            .build(engine)

        vertexBuffer.setBufferAt(engine, 0, toFloatBuffer(positions))
        vertexBuffer.setBufferAt(engine, 1, toFloatBuffer(normals))
        vertexBuffer.setBufferAt(engine, 2, toFloatBuffer(uvs))

        val indexBuffer = IndexBuffer.Builder()
            .indexCount(indexCount)
            .bufferType(indexType)
            .build(engine)

        if (useIntIndices) {
            val buf = ByteBuffer.allocateDirect(indices.size * 4).order(ByteOrder.nativeOrder())
            buf.asIntBuffer().put(indices)
            buf.rewind()
            indexBuffer.setBuffer(engine, buf)
        } else {
            val shortIndices = ShortArray(indexCount) { indices[it].toShort() }
            indexBuffer.setBuffer(engine, toShortBuffer(shortIndices))
        }

        val entity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, 0f, 0f, hw, 50f, hd))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vertexBuffer, indexBuffer, 0, indexCount)
            .material(0, materialInstance)
            .castShadows(false)
            .receiveShadows(true)
            .build(engine, entity)

        return entity
    }

    fun recalculateNormals(positions: FloatArray, indices: IntArray, normals: FloatArray) {
        normals.fill(0f)
        val triangleCount = indices.size / 3
        for (i in 0 until triangleCount) {
            val i0 = indices[i * 3]
            val i1 = indices[i * 3 + 1]
            val i2 = indices[i * 3 + 2]

            val ax = positions[i0 * 3]
            val ay = positions[i0 * 3 + 1]
            val az = positions[i0 * 3 + 2]

            val bx = positions[i1 * 3]
            val by = positions[i1 * 3 + 1]
            val bz = positions[i1 * 3 + 2]

            val cx = positions[i2 * 3]
            val cy = positions[i2 * 3 + 1]
            val cz = positions[i2 * 3 + 2]

            val abx = bx - ax
            val aby = by - ay
            val abz = bz - az

            val acx = cx - ax
            val acy = cy - ay
            val acz = cz - az

            var nx = aby * acz - abz * acy
            var ny = abz * acx - abx * acz
            var nz = abx * acy - aby * acx

            val len = Math.sqrt((nx * nx + ny * ny + nz * nz).toDouble()).toFloat()
            if (len > 1e-6f) {
                nx /= len
                ny /= len
                nz /= len
            }

            normals[i0 * 3] += nx
            normals[i0 * 3 + 1] += ny
            normals[i0 * 3 + 2] += nz

            normals[i1 * 3] += nx
            normals[i1 * 3 + 1] += ny
            normals[i1 * 3 + 2] += nz

            normals[i2 * 3] += nx
            normals[i2 * 3 + 1] += ny
            normals[i2 * 3 + 2] += nz
        }

        val vertexCount = positions.size / 3
        for (v in 0 until vertexCount) {
            val nx = normals[v * 3]
            val ny = normals[v * 3 + 1]
            val nz = normals[v * 3 + 2]
            val len = Math.sqrt((nx * nx + ny * ny + nz * nz).toDouble()).toFloat()
            if (len > 1e-6f) {
                normals[v * 3] = nx / len
                normals[v * 3 + 1] = ny / len
                normals[v * 3 + 2] = nz / len
            } else {
                normals[v * 3] = 0f
                normals[v * 3 + 1] = 1f
                normals[v * 3 + 2] = 0f
            }
        }
    }

    fun createDynamicIndexedMesh(
        engine: Engine,
        positions: FloatArray,
        indices: IntArray,
        uvs: FloatArray? = null,
        materialInstance: MaterialInstance,
    ): Int {
        val vertexCount = positions.size / 3
        val indexCount = indices.size
        val normals = FloatArray(positions.size)

        recalculateNormals(positions, indices, normals)

        val texCoords = uvs ?: FloatArray(vertexCount * 2)

        val useIntIndices = vertexCount > 65535
        val indexType = if (useIntIndices) {
            IndexBuffer.Builder.IndexType.UINT
        } else {
            IndexBuffer.Builder.IndexType.USHORT
        }

        val vertexBuffer = VertexBuffer.Builder()
            .vertexCount(vertexCount)
            .bufferCount(3)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.TANGENTS, 1, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.UV0, 2, VertexBuffer.AttributeType.FLOAT2, 0, 8)
            .build(engine)

        vertexBuffer.setBufferAt(engine, 0, toFloatBuffer(positions))
        vertexBuffer.setBufferAt(engine, 1, toFloatBuffer(normals))
        vertexBuffer.setBufferAt(engine, 2, toFloatBuffer(texCoords))

        val indexBuffer = IndexBuffer.Builder()
            .indexCount(indexCount)
            .bufferType(indexType)
            .build(engine)

        if (useIntIndices) {
            val buf = ByteBuffer.allocateDirect(indices.size * 4).order(ByteOrder.nativeOrder())
            buf.asIntBuffer().put(indices)
            buf.rewind()
            indexBuffer.setBuffer(engine, buf)
        } else {
            val shortIndices = ShortArray(indexCount) { indices[it].toShort() }
            indexBuffer.setBuffer(engine, toShortBuffer(shortIndices))
        }

        val entity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(0f, 0f, 0f, 100f, 100f, 100f))
            .geometry(0, RenderableManager.PrimitiveType.TRIANGLES, vertexBuffer, indexBuffer, 0, indexCount)
            .material(0, materialInstance)
            .castShadows(true)
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
