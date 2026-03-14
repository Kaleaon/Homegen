package com.homegen.designer3d.model

import com.homegen.designer3d.math.Vector3

/** Spatial transform used by all HomeObject entities. */
data class Transform(
    var position: Vector3 = Vector3(),
    var rotationEuler: Vector3 = Vector3(),
    var scale: Vector3 = Vector3(1f, 1f, 1f),
)
