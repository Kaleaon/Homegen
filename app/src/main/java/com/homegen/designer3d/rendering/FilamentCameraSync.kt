package com.homegen.designer3d.rendering

import com.google.android.filament.Camera
import com.homegen.designer3d.camera.CameraController

/**
 * Synchronizes CameraController state to a Filament Camera each frame.
 */
object FilamentCameraSync {

    fun sync(cameraController: CameraController, camera: Camera) {
        val eye = cameraController.eyePosition()
        val target = cameraController.target

        camera.lookAt(
            eye.x.toDouble(), eye.y.toDouble(), eye.z.toDouble(),
            target.x.toDouble(), target.y.toDouble(), target.z.toDouble(),
            0.0, 1.0, 0.0 // up vector
        )
    }

    fun setOrthographic(camera: Camera, halfWidth: Float, aspect: Float, near: Float = 0.1f, far: Float = 200f) {
        val halfHeight = halfWidth / aspect
        camera.setProjection(
            Camera.Projection.ORTHO,
            (-halfWidth).toDouble(), halfWidth.toDouble(),
            (-halfHeight).toDouble(), halfHeight.toDouble(),
            near.toDouble(), far.toDouble()
        )
    }

    fun setPerspective(camera: Camera, fovDegrees: Double, aspect: Double, near: Double = 0.1, far: Double = 200.0) {
        camera.setProjection(fovDegrees, aspect, near, far, Camera.Fov.VERTICAL)
    }
}
