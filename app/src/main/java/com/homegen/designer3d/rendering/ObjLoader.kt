package com.homegen.designer3d.rendering

import android.content.res.AssetManager
import com.google.android.filament.Box
import com.google.android.filament.Engine
import com.google.android.filament.EntityManager
import com.google.android.filament.IndexBuffer
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.VertexBuffer
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

/**
 * Loads Wavefront OBJ models (e.g. from sweethome3d.com/free-3d-models/)
 * and creates Filament renderable entities.
 *
 * Supports: v (positions), vn (normals), vt (UVs), f (faces with v/vt/vn indices).
 * Triangulates quads automatically. Caches parsed geometry by path.
 */
class ObjLoader(
    private val engine: Engine,
    private val assetManager: AssetManager,
) {
    private val cache = mutableMapOf<String, ParsedObj>()

    data class ParsedObj(
        val positions: FloatArray,
        val normals: FloatArray,
        val uvs: FloatArray,
        val indices: ShortArray,
        val vertexCount: Int,
        val indexCount: Int,
        val minBound: FloatArray, // [x, y, z]
        val maxBound: FloatArray, // [x, y, z]
    )

    /**
     * Loads an OBJ file from assets and creates a Filament renderable entity.
     * Returns the entity ID, or null if loading fails.
     */
    fun load(path: String, materialInstance: MaterialInstance): Int? {
        val parsed = loadAndParse(path) ?: return null
        return createEntity(parsed, materialInstance)
    }

    /**
     * Loads from an arbitrary InputStream (for files outside assets).
     */
    fun loadFromStream(stream: InputStream, materialInstance: MaterialInstance): Int? {
        val parsed = parse(stream) ?: return null
        return createEntity(parsed, materialInstance)
    }

    private fun loadAndParse(path: String): ParsedObj? {
        cache[path]?.let { return it }
        return try {
            val parsed = assetManager.open(path).use { parse(it) } ?: return null
            cache[path] = parsed
            parsed
        } catch (e: Exception) {
            null
        }
    }

    private fun parse(inputStream: InputStream): ParsedObj? {
        val rawPositions = mutableListOf<Float>()
        val rawNormals = mutableListOf<Float>()
        val rawUvs = mutableListOf<Float>()

        // Expanded (per-face-vertex) data
        val outPositions = mutableListOf<Float>()
        val outNormals = mutableListOf<Float>()
        val outUvs = mutableListOf<Float>()
        val outIndices = mutableListOf<Short>()

        // Dedup map: "vi/vti/vni" -> output vertex index
        val vertexMap = mutableMapOf<String, Short>()
        var nextIndex: Short = 0

        val reader = BufferedReader(InputStreamReader(inputStream))
        reader.forEachLine { rawLine ->
            val line = rawLine.trim()
            when {
                line.startsWith("v ") -> {
                    val parts = line.substring(2).trim().split("\\s+".toRegex())
                    if (parts.size >= 3) {
                        rawPositions.add(parts[0].toFloat())
                        rawPositions.add(parts[1].toFloat())
                        rawPositions.add(parts[2].toFloat())
                    }
                }

                line.startsWith("vn ") -> {
                    val parts = line.substring(3).trim().split("\\s+".toRegex())
                    if (parts.size >= 3) {
                        rawNormals.add(parts[0].toFloat())
                        rawNormals.add(parts[1].toFloat())
                        rawNormals.add(parts[2].toFloat())
                    }
                }

                line.startsWith("vt ") -> {
                    val parts = line.substring(3).trim().split("\\s+".toRegex())
                    if (parts.size >= 2) {
                        rawUvs.add(parts[0].toFloat())
                        rawUvs.add(parts[1].toFloat())
                    }
                }

                line.startsWith("f ") -> {
                    val verts = line.substring(2).trim().split("\\s+".toRegex())
                    val faceIndices = mutableListOf<Short>()

                    for (vert in verts) {
                        val cached = vertexMap[vert]
                        if (cached != null) {
                            faceIndices.add(cached)
                            continue
                        }

                        val parts = vert.split("/")
                        val vi = (parts[0].toInt() - 1) // OBJ is 1-indexed
                        val vti = if (parts.size > 1 && parts[1].isNotEmpty()) parts[1].toInt() - 1 else -1
                        val vni = if (parts.size > 2 && parts[2].isNotEmpty()) parts[2].toInt() - 1 else -1

                        // Position (required)
                        if (vi * 3 + 2 < rawPositions.size) {
                            outPositions.add(rawPositions[vi * 3])
                            outPositions.add(rawPositions[vi * 3 + 1])
                            outPositions.add(rawPositions[vi * 3 + 2])
                        } else {
                            outPositions.addAll(listOf(0f, 0f, 0f))
                        }

                        // Normal
                        if (vni >= 0 && vni * 3 + 2 < rawNormals.size) {
                            outNormals.add(rawNormals[vni * 3])
                            outNormals.add(rawNormals[vni * 3 + 1])
                            outNormals.add(rawNormals[vni * 3 + 2])
                        } else {
                            outNormals.addAll(listOf(0f, 1f, 0f)) // default up
                        }

                        // UV
                        if (vti >= 0 && vti * 2 + 1 < rawUvs.size) {
                            outUvs.add(rawUvs[vti * 2])
                            outUvs.add(rawUvs[vti * 2 + 1])
                        } else {
                            outUvs.addAll(listOf(0f, 0f))
                        }

                        val idx = nextIndex++
                        vertexMap[vert] = idx
                        faceIndices.add(idx)
                    }

                    // Triangulate: fan from first vertex (works for tris, quads, n-gons)
                    for (i in 1 until faceIndices.size - 1) {
                        outIndices.add(faceIndices[0])
                        outIndices.add(faceIndices[i])
                        outIndices.add(faceIndices[i + 1])
                    }
                }
            }
        }

        if (outPositions.isEmpty() || outIndices.isEmpty()) return null

        // Compute bounding box
        val minB = floatArrayOf(Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE)
        val maxB = floatArrayOf(-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE)
        for (i in outPositions.indices step 3) {
            for (j in 0..2) {
                minB[j] = min(minB[j], outPositions[i + j])
                maxB[j] = max(maxB[j], outPositions[i + j])
            }
        }

        return ParsedObj(
            positions = outPositions.toFloatArray(),
            normals = outNormals.toFloatArray(),
            uvs = outUvs.toFloatArray(),
            indices = outIndices.toShortArray(),
            vertexCount = nextIndex.toInt(),
            indexCount = outIndices.size,
            minBound = minB,
            maxBound = maxB,
        )
    }

    private fun createEntity(parsed: ParsedObj, materialInstance: MaterialInstance): Int {
        val vertexBuffer = VertexBuffer.Builder()
            .vertexCount(parsed.vertexCount)
            .bufferCount(3)
            .attribute(VertexBuffer.VertexAttribute.POSITION, 0, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.TANGENTS, 1, VertexBuffer.AttributeType.FLOAT3, 0, 12)
            .attribute(VertexBuffer.VertexAttribute.UV0, 2, VertexBuffer.AttributeType.FLOAT2, 0, 8)
            .build(engine)

        vertexBuffer.setBufferAt(engine, 0, toBuffer(parsed.positions))
        vertexBuffer.setBufferAt(engine, 1, toBuffer(parsed.normals))
        vertexBuffer.setBufferAt(engine, 2, toBuffer(parsed.uvs))

        val indexBuffer = IndexBuffer.Builder()
            .indexCount(parsed.indexCount)
            .bufferType(IndexBuffer.Builder.IndexType.USHORT)
            .build(engine)

        indexBuffer.setBuffer(engine, toShortBuffer(parsed.indices))

        // Bounding box
        val cx = (parsed.minBound[0] + parsed.maxBound[0]) / 2f
        val cy = (parsed.minBound[1] + parsed.maxBound[1]) / 2f
        val cz = (parsed.minBound[2] + parsed.maxBound[2]) / 2f
        val hx = (parsed.maxBound[0] - parsed.minBound[0]) / 2f
        val hy = (parsed.maxBound[1] - parsed.minBound[1]) / 2f
        val hz = (parsed.maxBound[2] - parsed.minBound[2]) / 2f

        val entity = EntityManager.get().create()
        RenderableManager.Builder(1)
            .boundingBox(Box(cx, cy, cz, hx, hy, hz))
            .geometry(
                0, RenderableManager.PrimitiveType.TRIANGLES,
                vertexBuffer, indexBuffer, 0, parsed.indexCount
            )
            .material(0, materialInstance)
            .castShadows(true)
            .receiveShadows(true)
            .build(engine, entity)

        return entity
    }

    fun clearCache() {
        cache.clear()
    }

    private fun toBuffer(data: FloatArray): ByteBuffer {
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
