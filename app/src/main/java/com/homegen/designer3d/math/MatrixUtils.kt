package com.homegen.designer3d.math

import com.homegen.designer3d.model.Transform
import kotlin.math.cos
import kotlin.math.sin

/**
 * Converts Transform (position + euler angles + scale) to a 4x4 column-major matrix
 * suitable for Filament's TransformManager.
 */
fun Transform.toMatrix(): FloatArray {
    val m = FloatArray(16)

    val cx = cos(rotationEuler.x)
    val sx = sin(rotationEuler.x)
    val cy = cos(rotationEuler.y)
    val sy = sin(rotationEuler.y)
    val cz = cos(rotationEuler.z)
    val sz = sin(rotationEuler.z)

    // Column-major 4x4: rotation (ZYX order) * scale, then translation
    m[0] = (cy * cz) * scale.x
    m[1] = (cy * sz) * scale.x
    m[2] = (-sy) * scale.x
    m[3] = 0f

    m[4] = (sx * sy * cz - cx * sz) * scale.y
    m[5] = (sx * sy * sz + cx * cz) * scale.y
    m[6] = (sx * cy) * scale.y
    m[7] = 0f

    m[8] = (cx * sy * cz + sx * sz) * scale.z
    m[9] = (cx * sy * sz - sx * cz) * scale.z
    m[10] = (cx * cy) * scale.z
    m[11] = 0f

    m[12] = position.x
    m[13] = position.y
    m[14] = position.z
    m[15] = 1f

    return m
}
