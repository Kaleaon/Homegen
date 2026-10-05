package com.homegen.designer3d.rendering

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayInputStream

class ObjLoaderTest {

    private val loader = ObjLoader()

    @Test
    fun testBasicObjParsing() {
        val objContent = """
            v 0.0 1.0 2.0
            v 3.0 4.0 5.0
            v 6.0 7.0 8.0
            vt 0.1 0.2
            vt 0.3 0.4
            vt 0.5 0.6
            vn 0.0 1.0 0.0
            vn 1.0 0.0 0.0
            vn 0.0 0.0 1.0
            f 1/1/1 2/2/2 3/3/3
        """.trimIndent()

        val parsed = loader.parse(ByteArrayInputStream(objContent.toByteArray()))
        assertNotNull(parsed)
        parsed!!

        assertEquals(3, parsed.vertexCount)
        assertEquals(3, parsed.indexCount)

        assertArrayEquals(floatArrayOf(0.0f, 1.0f, 2.0f, 3.0f, 4.0f, 5.0f, 6.0f, 7.0f, 8.0f), parsed.positions, 0.001f)
        assertArrayEquals(floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f, 0.5f, 0.6f), parsed.uvs, 0.001f)
        assertArrayEquals(floatArrayOf(0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f), parsed.normals, 0.001f)
        assertArrayEquals(shortArrayOf(0, 1, 2), parsed.indices)

        assertArrayEquals(floatArrayOf(0.0f, 1.0f, 2.0f), parsed.minBound, 0.001f)
        assertArrayEquals(floatArrayOf(6.0f, 7.0f, 8.0f), parsed.maxBound, 0.001f)
    }

    @Test
    fun testQuadTriangulation() {
        val objContent = """
            v 0.0 0.0 0.0
            v 1.0 0.0 0.0
            v 1.0 1.0 0.0
            v 0.0 1.0 0.0
            f 1 2 3 4
        """.trimIndent()

        val parsed = loader.parse(ByteArrayInputStream(objContent.toByteArray()))
        assertNotNull(parsed)
        parsed!!

        assertEquals(4, parsed.vertexCount)
        assertEquals(6, parsed.indexCount) // 2 triangles
        assertArrayEquals(shortArrayOf(0, 1, 2, 0, 2, 3), parsed.indices)
    }

    @Test
    fun testMissingFaceAttributesAndDefaults() {
        // Position only (f 1 2 3)
        val posOnlyObj = """
            v 0 0 0
            v 1 0 0
            v 0 1 0
            f 1 2 3
        """.trimIndent()

        val parsed1 = loader.parse(ByteArrayInputStream(posOnlyObj.toByteArray()))
        assertNotNull(parsed1)
        parsed1!!

        // Default normals should be 0, 1, 0 (up)
        assertArrayEquals(floatArrayOf(0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f), parsed1.normals, 0.001f)
        // Default uvs should be 0, 0
        assertArrayEquals(floatArrayOf(0f, 0f, 0f, 0f, 0f, 0f), parsed1.uvs, 0.001f)

        // Missing texture coordinate (f 1//1 2//2 3//3)
        val posAndNormalObj = """
            v 0 0 0
            v 1 0 0
            v 0 1 0
            vn 0 0 1
            vn 0 0 1
            vn 0 0 1
            f 1//1 2//2 3//3
        """.trimIndent()

        val parsed2 = loader.parse(ByteArrayInputStream(posAndNormalObj.toByteArray()))
        assertNotNull(parsed2)
        parsed2!!

        assertArrayEquals(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f), parsed2.normals, 0.001f)
        assertArrayEquals(floatArrayOf(0f, 0f, 0f, 0f, 0f, 0f), parsed2.uvs, 0.001f)

        // Missing normal (f 1/1 2/2 3/3)
        val posAndUvObj = """
            v 0 0 0
            v 1 0 0
            v 0 1 0
            vt 0.5 0.5
            vt 0.5 0.5
            vt 0.5 0.5
            f 1/1 2/2 3/3
        """.trimIndent()

        val parsed3 = loader.parse(ByteArrayInputStream(posAndUvObj.toByteArray()))
        assertNotNull(parsed3)
        parsed3!!

        assertArrayEquals(floatArrayOf(0f, 1f, 0f, 0f, 1f, 0f, 0f, 1f, 0f), parsed3.normals, 0.001f)
        assertArrayEquals(floatArrayOf(0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f), parsed3.uvs, 0.001f)
    }

    @Test
    fun testRelativeAndNegativeIndices() {
        val objContent = """
            v 0 0 0
            v 1 1 1
            v 2 2 2
            vt 0.1 0.1
            vt 0.2 0.2
            vt 0.3 0.3
            vn 0 1 0
            vn 0 1 0
            vn 0 1 0
            f -1/-1/-1 -2/-2/-2 -3/-3/-3
        """.trimIndent()

        val parsed = loader.parse(ByteArrayInputStream(objContent.toByteArray()))
        assertNotNull(parsed)
        parsed!!

        assertEquals(3, parsed.vertexCount)
        // -1 should map to the 3rd vertex (2, 2, 2)
        // -2 should map to the 2nd vertex (1, 1, 1)
        // -3 should map to the 1st vertex (0, 0, 0)
        assertArrayEquals(
            floatArrayOf(2f, 2f, 2f, 1f, 1f, 1f, 0f, 0f, 0f),
            parsed.positions,
            0.001f,
        )
    }

    @Test
    fun testWhitespaceAndFormattingEdgeCases() {
        val objContent = """
            # Header Comment
            
            v   1.0   2.0   3.0   
            v	4.0	5.0	6.0  
            v 7.0 8.0 9.0  
            
            # Face comment
            f   1   2   3   # Trailing comment
        """.trimIndent()

        val parsed = loader.parse(ByteArrayInputStream(objContent.toByteArray()))
        assertNotNull(parsed)
        parsed!!

        assertEquals(3, parsed.vertexCount)
        assertEquals(3, parsed.indexCount)
        assertArrayEquals(floatArrayOf(1.0f, 2.0f, 3.0f, 4.0f, 5.0f, 6.0f, 7.0f, 8.0f, 9.0f), parsed.positions, 0.001f)
    }

    @Test
    fun testVertexDeduplication() {
        val objContent = """
            v 0 0 0
            v 1 0 0
            v 0 1 0
            vt 0 0
            vt 1 0
            vt 0 1
            vn 0 0 1
            vn 0 0 1
            vn 0 0 1
            f 1/1/1 2/2/1 3/3/1
            f 1/1/1 3/3/1 2/2/1
        """.trimIndent()

        val parsed = loader.parse(ByteArrayInputStream(objContent.toByteArray()))
        assertNotNull(parsed)
        parsed!!

        // Total distinct vertices should be 3
        assertEquals(3, parsed.vertexCount)
        // Indices should be 6 (2 triangles)
        assertEquals(6, parsed.indexCount)
        assertArrayEquals(shortArrayOf(0, 1, 2, 0, 2, 1), parsed.indices)
    }

    @Test
    fun testInvalidOrEmptyObj() {
        val emptyObj = ""
        assertNull(loader.parse(ByteArrayInputStream(emptyObj.toByteArray())))

        val noFacesObj = """
            v 1 2 3
            v 4 5 6
        """.trimIndent()
        assertNull(loader.parse(ByteArrayInputStream(noFacesObj.toByteArray())))
    }
}
