package com.homegen.designer3d.camera

import com.homegen.designer3d.math.Vector3
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Orbit camera control model, independent from rendering backend.
 */
class CameraController(
    var target: Vector3 = Vector3(),
    var distance: Float = 8f,
    var yawRadians: Float = 0f,
    var pitchRadians: Float = 0.45f,
) {
    var viewMode: ViewMode = ViewMode.PERSPECTIVE_3D
    private val minDistance = 1.5f
    private val maxDistance = 80f
    private val minPitch = (-PI / 2.2).toFloat()
    private val maxPitch = (PI / 2.2).toFloat()

    fun orbit(deltaYaw: Float, deltaPitch: Float) {
        yawRadians += deltaYaw
        pitchRadians = (pitchRadians + deltaPitch).coerceIn(minPitch, maxPitch)
    }

    fun pan(deltaX: Float, deltaY: Float) {
        val right = Vector3(cos(yawRadians), 0f, -sin(yawRadians))
        val forward = Vector3(sin(yawRadians), 0f, cos(yawRadians))
        target += right * deltaX + forward * deltaY
    }

    fun zoom(delta: Float) {
        distance = (distance - delta).coerceIn(minDistance, maxDistance)
    }

    fun eyePosition(): Vector3 {
        val horizontal = distance * cos(pitchRadians)
        return Vector3(
            x = target.x + horizontal * sin(yawRadians),
            y = target.y + distance * sin(pitchRadians),
            z = target.z + horizontal * cos(yawRadians),
        )
    }
}
