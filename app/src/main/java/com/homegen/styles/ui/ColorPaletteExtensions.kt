package com.homegen.styles.ui

import androidx.compose.ui.graphics.Color
import com.homegen.styles.data.DesignStyleRepository
import com.homegen.styles.model.ColorPalette
import com.ktheme.utils.ColorUtils
import java.util.concurrent.ConcurrentHashMap

private object NullColorSentinel

private val colorCache = ConcurrentHashMap<String, Any>()

private data class PaletteCacheKey(
    val id: String,
    val colors: List<String>,
)

private val paletteCache = ConcurrentHashMap<PaletteCacheKey, List<Color?>>()

/**
 * Helper extension functions and properties on [ColorPalette] to get Compose [Color] instances.
 * Returns null for any malformed or invalid color string.
 */
val ColorPalette.parsedColors: List<Color?>
    get() = paletteCache.computeIfAbsent(PaletteCacheKey(id, colors)) {
        colors.map { parseHexToColor(it) }
    }

val ColorPalette.parsedAccent: Color?
    get() = if (accent.isNotBlank()) parseHexToColor(accent) else null

fun ColorPalette.parsedColors(): List<Color?> = parsedColors

fun ColorPalette.parsedAccent(): Color? = parsedAccent

fun parseHexToColor(hex: String): Color? {
    val cached = colorCache.computeIfAbsent(hex) { rawHex ->
        val normalized = DesignStyleRepository.normalizeHexColor(rawHex)
        if (!DesignStyleRepository.isValidHexColor(normalized)) {
            NullColorSentinel
        } else {
            try {
                Color(ColorUtils.hexToColorInt(normalized))
            } catch (_: Exception) {
                NullColorSentinel
            }
        }
    }
    return if (cached === NullColorSentinel) null else cached as Color
}
