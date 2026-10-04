package com.homegen.styles.ui

import androidx.compose.ui.graphics.Color
import com.homegen.styles.data.DesignStyleRepository
import com.homegen.styles.model.ColorPalette

/**
 * Helper extension functions and properties on [ColorPalette] to get Compose [Color] instances.
 * Returns null for any malformed or invalid color string.
 */
val ColorPalette.parsedColors: List<Color?>
    get() = colors.map { parseHexToColor(it) }

val ColorPalette.parsedAccent: Color?
    get() = if (accent.isNotBlank()) parseHexToColor(accent) else null

fun ColorPalette.parsedColors(): List<Color?> = parsedColors

fun ColorPalette.parsedAccent(): Color? = parsedAccent

fun parseHexToColor(hex: String): Color? {
    val normalized = DesignStyleRepository.normalizeHexColor(hex)
    if (!DesignStyleRepository.isValidHexColor(normalized)) return null
    return try {
        val clean = normalized.substring(1)
        val colorInt = if (clean.length == 6) {
            (0xFF000000 or clean.toLong(16)).toInt()
        } else {
            clean.toLong(16).toInt()
        }
        Color(colorInt)
    } catch (_: Exception) {
        null
    }
}
