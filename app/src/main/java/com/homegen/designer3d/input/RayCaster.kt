package com.homegen.designer3d.input

import com.google.android.filament.Camera
import com.homegen.designer3d.math.Vector3

/**
 * Converts screen coordinates to world-space rays and performs plane intersections.
 */
object RayCaster {

    /**
     * Unprojects screen coordinates to a world-space ray.
     * Returns Pair(rayOrigin, rayDirection).
     */
    fun screenToRay(
        screenX: Float,
        screenY: Float,
        viewportWidth: Int,
        viewportHeight: Int,
        camera: Camera
    ): Pair<Vector3, Vector3> {
        // Normalized device coordinates
        val ndcX = (2f * screenX / viewportWidth) - 1f
        val ndcY = 1f - (2f * screenY / viewportHeight) // flip Y

        // Get inverse projection and view matrices
        val invProjection = DoubleArray(16)
        val invView = DoubleArray(16)
        camera.getProjectionMatrix(invProjection)
        camera.getModelMatrix(invView) // model matrix = inverse view

        // Invert projection matrix
        invertMatrix(camera, invProjection)

        // Near point in clip space
        val nearClip = doubleArrayOf(ndcX.toDouble(), ndcY.toDouble(), -1.0, 1.0)
        val farClip = doubleArrayOf(ndcX.toDouble(), ndcY.toDouble(), 1.0, 1.0)

        // Transform through inverse projection
        val nearView = multiplyMV(invProjection, nearClip)
        val farView = multiplyMV(invProjection, farClip)

        // Perspective divide
        for (i in 0..2) { nearView[i] /= nearView[3]; farView[i] /= farView[3] }

        // Transform through inverse view (camera model matrix)
        val nearWorld = multiplyMV(invView, nearView)
        val farWorld = multiplyMV(invView, farView)

        val origin = Vector3(nearWorld[0].toFloat(), nearWorld[1].toFloat(), nearWorld[2].toFloat())
        val far = Vector3(farWorld[0].toFloat(), farWorld[1].toFloat(), farWorld[2].toFloat())
        val direction = (far - origin).normalized()

        return origin to direction
    }

    /**
     * Intersects a ray with a horizontal plane at the given Y coordinate.
     */
    fun rayPlaneIntersect(origin: Vector3, direction: Vector3, planeY: Float = 0f): Vector3? {
        if (direction.y == 0f) return null // parallel to plane
        val t = (planeY - origin.y) / direction.y
        if (t < 0f) return null // behind ray origin
        return Vector3(
            origin.x + direction.x * t,
            planeY,
            origin.z + direction.z * t
        )
    }

    private fun invertMatrix(camera: Camera, outInverse: DoubleArray) {
        // Use camera's inverse projection directly
        camera.getProjectionMatrix(outInverse)
        // Simple 4x4 matrix inversion for projection matrices
        invert4x4(outInverse)
    }

    private fun invert4x4(m: DoubleArray) {
        val inv = DoubleArray(16)
        inv[0] = 1.0 / m[0]
        inv[5] = 1.0 / m[5]
        inv[10] = 0.0
        inv[11] = 1.0 / m[14]
        inv[14] = 1.0 / m[11]
        inv[15] = -m[10] / (m[11] * m[14])
        // Copy result back (simplified for typical projection matrices)
        System.arraycopy(inv, 0, m, 0, 16)
    }

    private fun multiplyMV(matrix: DoubleArray, vec: DoubleArray): DoubleArray {
        val result = DoubleArray(4)
        for (i in 0..3) {
            result[i] = matrix[i] * vec[0] + matrix[i + 4] * vec[1] +
                    matrix[i + 8] * vec[2] + matrix[i + 12] * vec[3]
        }
        return result
    }
}
