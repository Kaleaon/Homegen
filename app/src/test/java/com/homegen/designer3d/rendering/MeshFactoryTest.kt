package com.homegen.designer3d.rendering

import org.junit.Assert.assertEquals
import org.junit.Test

class MeshFactoryTest {

    @Test
    fun testRecalculateNormalsForDisplacedMesh() {
        val positions = floatArrayOf(
            0f, 0f, 0f,
            0f, 0f, 10f,
            10f, 0f, 0f,
        )
        val indices = intArrayOf(0, 1, 2)
        val normals = FloatArray(9)

        MeshFactory.recalculateNormals(positions, indices, normals)

        // Flat horizontal triangle in X-Z plane with CCW winding should have upward normal (0, 1, 0)
        assertEquals(0f, normals[0], 0.001f)
        assertEquals(1f, normals[1], 0.001f)
        assertEquals(0f, normals[2], 0.001f)

        assertEquals(0f, normals[3], 0.001f)
        assertEquals(1f, normals[4], 0.001f)
        assertEquals(0f, normals[5], 0.001f)

        assertEquals(0f, normals[6], 0.001f)
        assertEquals(1f, normals[7], 0.001f)
        assertEquals(0f, normals[8], 0.001f)
    }

    @Test
    fun testRecalculateNormalsForSlopedMesh() {
        // Displaced vertex 2 up in Y
        val positions = floatArrayOf(
            0f, 0f, 0f,
            0f, 0f, 10f,
            10f, 10f, 0f,
        )
        val indices = intArrayOf(0, 1, 2)
        val normals = FloatArray(9)

        MeshFactory.recalculateNormals(positions, indices, normals)

        // Sloped surface should have non-zero X and Y normal components
        assertEquals(-0.7071f, normals[0], 0.01f)
        assertEquals(0.7071f, normals[1], 0.01f)
        assertEquals(0f, normals[2], 0.01f)
    }
}
