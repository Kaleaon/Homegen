package com.homegen.designer3d.rendering

import com.homegen.designer3d.model.Floor
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.model.Wall

/**
 * Computes dimension label data for walls and rooms, to be rendered
 * as a Compose Canvas overlay with screen-projected positions.
 */
object DimensionRenderer {

    data class DimensionLabel(
        val worldX: Float,
        val worldZ: Float,
        val text: String,
    )

    /**
     * Generate dimension labels for the given objects.
     */
    fun computeLabels(objects: List<HomeObject>): List<DimensionLabel> {
        val labels = mutableListOf<DimensionLabel>()

        for (obj in objects) {
            when (obj) {
                is Wall -> {
                    labels.add(
                        DimensionLabel(
                            worldX = obj.transform.position.x,
                            worldZ = obj.transform.position.z,
                            text = "%.1fm".format(obj.lengthMeters),
                        )
                    )
                }
                is Floor -> {
                    val area = obj.widthMeters * obj.depthMeters
                    labels.add(
                        DimensionLabel(
                            worldX = obj.transform.position.x,
                            worldZ = obj.transform.position.z,
                            text = "%.1fm²".format(area),
                        )
                    )
                }
                else -> {}
            }
        }

        return labels
    }
}
