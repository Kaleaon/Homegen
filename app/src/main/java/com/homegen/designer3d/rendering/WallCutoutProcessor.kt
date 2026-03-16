package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.MaterialInstance
import com.homegen.designer3d.math.Vector3
import com.homegen.designer3d.model.Door
import com.homegen.designer3d.model.Wall
import com.homegen.designer3d.model.Window

/**
 * Generates wall meshes with rectangular holes for doors and windows.
 * Uses a simplified approach: splits the wall into sections around cutouts.
 */
object WallCutoutProcessor {

    data class Cutout(
        val offsetAlongWall: Float, // distance from wall start
        val width: Float,
        val bottomY: Float,
        val topY: Float,
    )

    /**
     * Creates a wall renderable with door/window cutouts represented as
     * separate box sections (above, left, right of each opening).
     */
    fun createWallWithCutouts(
        engine: Engine,
        wall: Wall,
        cutouts: List<Cutout>,
        material: MaterialInstance,
    ): List<Int> {
        if (cutouts.isEmpty()) {
            // No cutouts — just create a regular wall box
            return listOf(
                MeshFactory.createBox(
                    engine,
                    Vector3(wall.lengthMeters / 2f, wall.heightMeters / 2f, wall.thicknessMeters / 2f),
                    material,
                )
            )
        }

        val entities = mutableListOf<Int>()
        val sorted = cutouts.sortedBy { it.offsetAlongWall }
        val halfThick = wall.thicknessMeters / 2f
        var cursor = 0f

        for (cutout in sorted) {
            val cutStart = cutout.offsetAlongWall - cutout.width / 2f
            val cutEnd = cutout.offsetAlongWall + cutout.width / 2f

            // Section before the cutout
            if (cutStart > cursor) {
                val sectionLen = cutStart - cursor
                entities.add(
                    MeshFactory.createBox(
                        engine,
                        Vector3(sectionLen / 2f, wall.heightMeters / 2f, halfThick),
                        material,
                    )
                )
            }

            // Section above the cutout
            val aboveHeight = wall.heightMeters - cutout.topY
            if (aboveHeight > 0.01f) {
                entities.add(
                    MeshFactory.createBox(
                        engine,
                        Vector3(cutout.width / 2f, aboveHeight / 2f, halfThick),
                        material,
                    )
                )
            }

            // Section below the cutout (for windows with sill)
            if (cutout.bottomY > 0.01f) {
                entities.add(
                    MeshFactory.createBox(
                        engine,
                        Vector3(cutout.width / 2f, cutout.bottomY / 2f, halfThick),
                        material,
                    )
                )
            }

            cursor = cutEnd
        }

        // Remaining section after all cutouts
        if (cursor < wall.lengthMeters) {
            val sectionLen = wall.lengthMeters - cursor
            entities.add(
                MeshFactory.createBox(
                    engine,
                    Vector3(sectionLen / 2f, wall.heightMeters / 2f, halfThick),
                    material,
                )
            )
        }

        return entities
    }

    fun doorToCutout(door: Door, offsetAlongWall: Float): Cutout {
        return Cutout(
            offsetAlongWall = offsetAlongWall,
            width = door.widthMeters,
            bottomY = 0f,
            topY = door.heightMeters,
        )
    }

    fun windowToCutout(window: Window, offsetAlongWall: Float): Cutout {
        return Cutout(
            offsetAlongWall = offsetAlongWall,
            width = window.widthMeters,
            bottomY = window.sillHeight,
            topY = window.sillHeight + window.heightMeters,
        )
    }
}
