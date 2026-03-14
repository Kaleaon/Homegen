package com.homegen.designer3d.model

import java.util.UUID

/**
 * Base scene node for all home design entities.
 *
 * @property id stable identifier used for serialization and selection.
 * @property materialRef symbolic material key, resolved by renderer-specific catalogs.
 */
open class HomeObject(
    val id: String = UUID.randomUUID().toString(),
    val type: String,
    var name: String,
    var transform: Transform = Transform(),
    var materialRef: String = "default",
) {
    val children: MutableList<HomeObject> = mutableListOf()

    fun addChild(node: HomeObject) {
        children += node
    }

    fun removeChild(childId: String): Boolean = children.removeAll { it.id == childId }
}
