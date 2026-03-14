package com.homegen.designer3d.math

import kotlin.math.sqrt

/** Basic mutable vector used by scene entities and camera controls. */
data class Vector3(
    var x: Float = 0f,
    var y: Float = 0f,
    var z: Float = 0f,
) {
    operator fun plus(other: Vector3) = Vector3(x + other.x, y + other.y, z + other.z)

    operator fun minus(other: Vector3) = Vector3(x - other.x, y - other.y, z - other.z)

    operator fun times(scale: Float) = Vector3(x * scale, y * scale, z * scale)

    fun dot(other: Vector3): Float = x * other.x + y * other.y + z * other.z

    fun length(): Float = sqrt(dot(this))

    fun normalized(): Vector3 {
        val size = length().takeIf { it > 0f } ?: return Vector3()
        return Vector3(x / size, y / size, z / size)
    }

    fun distanceTo(other: Vector3): Float = (this - other).length()
}
