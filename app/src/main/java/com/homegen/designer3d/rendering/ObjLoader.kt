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
    private val engine: Engine? = null,
    private val assetManager: AssetManager? = null,
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
        val eng = engine ?: return null
        val parsed = loadAndParse(path) ?: return null
        return createEntity(parsed, materialInstance, eng)
    }

    /**
     * Loads from an arbitrary InputStream (for files outside assets).
     */
    fun loadFromStream(stream: InputStream, materialInstance: MaterialInstance): Int? {
        val eng = engine ?: return null
        val parsed = parse(stream) ?: return null
        return createEntity(parsed, materialInstance, eng)
    }

    private fun loadAndParse(path: String): ParsedObj? {
        cache[path]?.let { return it }
        val assets = assetManager ?: return null
        return try {
            val parsed = assets.open(path).use { parse(it) } ?: return null
            cache[path] = parsed
            parsed
        } catch (e: Exception) {
            null
        }
    }

    internal fun parse(inputStream: InputStream): ParsedObj? {
        val rawPositions = FloatArrayList()
        val rawNormals = FloatArrayList()
        val rawUvs = FloatArrayList()

        // Expanded (per-face-vertex) data
        val outPositions = FloatArrayList()
        val outNormals = FloatArrayList()
        val outUvs = FloatArrayList()
        val outIndices = ShortArrayList()

        // Dedup map: packed 64-bit key -> output vertex index
        val vertexMap = LongToShortMap()
        var nextIndex: Short = 0

        val faceIndices = ShortArrayList(16)

        val reader = BufferedReader(InputStreamReader(inputStream))
        var rawLine: String? = reader.readLine()
        while (rawLine != null) {
            val line = rawLine
            val len = line.length
            var pos = skipWhitespace(line, 0, len)

            if (pos < len && line[pos] != '#') {
                val c0 = line[pos]
                if (c0 == 'v') {
                    if (pos + 1 < len) {
                        val c1 = line[pos + 1]
                        if (isWhitespace(c1)) {
                            // "v " line
                            parseFloats(line, pos + 2, len, rawPositions, 3)
                        } else if (c1 == 'n' && (pos + 2 >= len || isWhitespace(line[pos + 2]))) {
                            // "vn " line
                            parseFloats(line, pos + 3, len, rawNormals, 3)
                        } else if (c1 == 't' && (pos + 2 >= len || isWhitespace(line[pos + 2]))) {
                            // "vt " line
                            parseFloats(line, pos + 3, len, rawUvs, 2)
                        }
                    }
                } else if (c0 == 'f' && (pos + 1 >= len || isWhitespace(line[pos + 1]))) {
                    // "f " line
                    faceIndices.clear()
                    var p = skipWhitespace(line, pos + 1, len)

                    val totalPositions = rawPositions.size / 3
                    val totalNormals = rawNormals.size / 3
                    val totalUvs = rawUvs.size / 2

                    while (p < len) {
                        if (line[p] == '#') break
                        val tokenEnd = findTokenEnd(line, p, len)

                        // Parse vertex indices from token [p, tokenEnd)
                        var i = p
                        val viEnd = findSlashOrEnd(line, i, tokenEnd)
                        val rawVi = parseInt(line, i, viEnd)
                        var rawVti = -1
                        var rawVni = -1

                        if (viEnd < tokenEnd && line[viEnd] == '/') {
                            i = viEnd + 1
                            if (i < tokenEnd && line[i] == '/') {
                                // Missing vti, e.g. "1//2"
                                i++
                                if (i < tokenEnd) {
                                    val vniEnd = findSlashOrEnd(line, i, tokenEnd)
                                    rawVni = parseInt(line, i, vniEnd)
                                }
                            } else if (i < tokenEnd) {
                                val vtiEnd = findSlashOrEnd(line, i, tokenEnd)
                                rawVti = parseInt(line, i, vtiEnd)
                                if (vtiEnd < tokenEnd && line[vtiEnd] == '/') {
                                    i = vtiEnd + 1
                                    if (i < tokenEnd) {
                                        val vniEnd = findSlashOrEnd(line, i, tokenEnd)
                                        rawVni = parseInt(line, i, vniEnd)
                                    }
                                }
                            }
                        }

                        // Resolve relative/negative indices
                        val vi = if (rawVi > 0) {
                            rawVi - 1
                        } else if (rawVi < 0) {
                            totalPositions + rawVi
                        } else {
                            -1
                        }
                        val vti = if (rawVti > 0) {
                            rawVti - 1
                        } else if (rawVti < 0) {
                            totalUvs + rawVti
                        } else {
                            -1
                        }
                        val vni = if (rawVni > 0) {
                            rawVni - 1
                        } else if (rawVni < 0) {
                            totalNormals + rawVni
                        } else {
                            -1
                        }

                        val packedKey = packKey(vi, vti, vni)
                        val cached = vertexMap.get(packedKey)

                        if (cached != (-1).toShort()) {
                            faceIndices.add(cached)
                        } else {
                            // Position (required)
                            if (vi >= 0 && vi * 3 + 2 < rawPositions.size) {
                                outPositions.add(rawPositions.get(vi * 3))
                                outPositions.add(rawPositions.get(vi * 3 + 1))
                                outPositions.add(rawPositions.get(vi * 3 + 2))
                            } else {
                                outPositions.add(0f)
                                outPositions.add(0f)
                                outPositions.add(0f)
                            }

                            // Normal
                            if (vni >= 0 && vni * 3 + 2 < rawNormals.size) {
                                outNormals.add(rawNormals.get(vni * 3))
                                outNormals.add(rawNormals.get(vni * 3 + 1))
                                outNormals.add(rawNormals.get(vni * 3 + 2))
                            } else {
                                outNormals.add(0f)
                                outNormals.add(1f) // default up
                                outNormals.add(0f)
                            }

                            // UV
                            if (vti >= 0 && vti * 2 + 1 < rawUvs.size) {
                                outUvs.add(rawUvs.get(vti * 2))
                                outUvs.add(rawUvs.get(vti * 2 + 1))
                            } else {
                                outUvs.add(0f)
                                outUvs.add(0f)
                            }

                            val idx = nextIndex++
                            vertexMap.put(packedKey, idx)
                            faceIndices.add(idx)
                        }

                        p = skipWhitespace(line, tokenEnd, len)
                    }

                    // Triangulate: fan from first vertex
                    for (i in 1 until faceIndices.size - 1) {
                        outIndices.add(faceIndices.get(0))
                        outIndices.add(faceIndices.get(i))
                        outIndices.add(faceIndices.get(i + 1))
                    }
                }
            }
            rawLine = reader.readLine()
        }

        if (outPositions.isEmpty() || outIndices.isEmpty()) return null

        // Compute bounding box
        val minB = floatArrayOf(Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE)
        val maxB = floatArrayOf(-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE)
        for (i in 0 until outPositions.size step 3) {
            for (j in 0..2) {
                val v = outPositions.get(i + j)
                minB[j] = min(minB[j], v)
                maxB[j] = max(maxB[j], v)
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

    private fun createEntity(parsed: ParsedObj, materialInstance: MaterialInstance, engine: Engine): Int {
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
                0,
                RenderableManager.PrimitiveType.TRIANGLES,
                vertexBuffer,
                indexBuffer,
                0,
                parsed.indexCount,
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

    companion object {
        private fun isWhitespace(c: Char): Boolean {
            return c == ' ' || c == '\t' || c == '\r' || c == '\n'
        }

        private fun skipWhitespace(s: String, start: Int, end: Int): Int {
            var p = start
            while (p < end && isWhitespace(s[p])) {
                p++
            }
            return p
        }

        private fun findTokenEnd(s: String, start: Int, end: Int): Int {
            var p = start
            while (p < end && !isWhitespace(s[p])) {
                p++
            }
            return p
        }

        private fun findSlashOrEnd(s: String, start: Int, end: Int): Int {
            var p = start
            while (p < end && s[p] != '/' && !isWhitespace(s[p])) {
                p++
            }
            return p
        }

        private fun parseInt(s: String, start: Int, end: Int): Int {
            var i = start
            if (i >= end) return 0
            var sign = 1
            if (s[i] == '-') {
                sign = -1
                i++
            } else if (s[i] == '+') {
                i++
            }
            var value = 0
            while (i < end) {
                val c = s[i]
                if (c in '0'..'9') {
                    value = value * 10 + (c - '0')
                    i++
                } else {
                    break
                }
            }
            return value * sign
        }

        private fun parseFloat(s: String, start: Int, end: Int): Float {
            var i = start
            if (i >= end) return 0f

            var sign = 1f
            val c = s[i]
            if (c == '-') {
                sign = -1f
                i++
            } else if (c == '+') {
                i++
            }

            var intPart = 0L
            var hasDigits = false
            while (i < end) {
                val ch = s[i]
                if (ch in '0'..'9') {
                    intPart = intPart * 10 + (ch - '0')
                    hasDigits = true
                    i++
                } else {
                    break
                }
            }

            var fracPart = 0L
            var fracDivisor = 1f
            if (i < end && s[i] == '.') {
                i++
                while (i < end) {
                    val ch = s[i]
                    if (ch in '0'..'9') {
                        fracPart = fracPart * 10 + (ch - '0')
                        fracDivisor *= 10f
                        hasDigits = true
                        i++
                    } else {
                        break
                    }
                }
            }

            if (!hasDigits) return 0f

            var value = sign * (intPart.toFloat() + (fracPart.toFloat() / fracDivisor))

            if (i < end && (s[i] == 'e' || s[i] == 'E')) {
                i++
                var expSign = 1
                if (i < end && s[i] == '-') {
                    expSign = -1
                    i++
                } else if (i < end && s[i] == '+') {
                    i++
                }
                var exp = 0
                while (i < end && s[i] in '0'..'9') {
                    exp = exp * 10 + (s[i] - '0')
                    i++
                }
                val pow = Math.pow(10.0, (exp * expSign).toDouble()).toFloat()
                value *= pow
            }

            return value
        }

        private fun parseFloats(s: String, start: Int, end: Int, out: FloatArrayList, countNeeded: Int) {
            var p = skipWhitespace(s, start, end)
            if (p >= end) return

            val tokenEnd0 = findTokenEnd(s, p, end)
            val v0 = parseFloat(s, p, tokenEnd0)
            p = skipWhitespace(s, tokenEnd0, end)

            if (p >= end || countNeeded < 2) {
                if (countNeeded <= 1) {
                    out.add(v0)
                }
                return
            }

            val tokenEnd1 = findTokenEnd(s, p, end)
            val v1 = parseFloat(s, p, tokenEnd1)
            p = skipWhitespace(s, tokenEnd1, end)

            if (countNeeded == 2) {
                out.add(v0)
                out.add(v1)
                return
            }

            if (p >= end) return

            val tokenEnd2 = findTokenEnd(s, p, end)
            val v2 = parseFloat(s, p, tokenEnd2)

            out.add(v0)
            out.add(v1)
            out.add(v2)
        }

        private fun packKey(vi: Int, vti: Int, vni: Int): Long {
            val vKey = (vi + 1).toLong() and 0x3FFFFFL
            val vtKey = (vti + 1).toLong() and 0x1FFFFFL
            val vnKey = (vni + 1).toLong() and 0x1FFFFFL
            return (vKey shl 42) or (vtKey shl 21) or vnKey
        }
    }
}

private class FloatArrayList(initialCapacity: Int = 256) {
    var data = FloatArray(initialCapacity)
    var size = 0

    fun add(element: Float) {
        if (size == data.size) {
            data = data.copyOf(data.size * 2)
        }
        data[size++] = element
    }

    fun get(index: Int): Float = data[index]

    fun clear() {
        size = 0
    }

    fun isEmpty(): Boolean = size == 0

    fun toFloatArray(): FloatArray = data.copyOf(size)
}

private class ShortArrayList(initialCapacity: Int = 256) {
    var data = ShortArray(initialCapacity)
    var size = 0

    fun add(element: Short) {
        if (size == data.size) {
            data = data.copyOf(data.size * 2)
        }
        data[size++] = element
    }

    fun get(index: Int): Short = data[index]

    fun clear() {
        size = 0
    }

    fun isEmpty(): Boolean = size == 0

    fun toShortArray(): ShortArray = data.copyOf(size)
}

private class LongToShortMap(initialCapacity: Int = 256) {
    private var capacity = initialCapacity
    private var mask = capacity - 1
    private var keys = LongArray(capacity)
    private var values = ShortArray(capacity)
    private var flags = BooleanArray(capacity)
    private var size = 0

    fun get(key: Long): Short {
        var idx = hash(key) and mask
        while (flags[idx]) {
            if (keys[idx] == key) {
                return values[idx]
            }
            idx = (idx + 1) and mask
        }
        return -1
    }

    fun put(key: Long, value: Short) {
        if (size >= capacity * 0.75) {
            resize()
        }
        var idx = hash(key) and mask
        while (flags[idx]) {
            if (keys[idx] == key) {
                values[idx] = value
                return
            }
            idx = (idx + 1) and mask
        }
        keys[idx] = key
        values[idx] = value
        flags[idx] = true
        size++
    }

    private fun resize() {
        val oldKeys = keys
        val oldValues = values
        val oldFlags = flags
        val oldCapacity = capacity

        capacity *= 2
        mask = capacity - 1
        keys = LongArray(capacity)
        values = ShortArray(capacity)
        flags = BooleanArray(capacity)
        size = 0

        for (i in 0 until oldCapacity) {
            if (oldFlags[i]) {
                put(oldKeys[i], oldValues[i])
            }
        }
    }

    private fun hash(key: Long): Int {
        var k = key
        k = k xor (k ushr 33)
        k *= -0xae52ec632b7a43bL
        k = k xor (k ushr 33)
        k *= -0x5338c2b329f6315L
        k = k xor (k ushr 33)
        return k.toInt()
    }
}
