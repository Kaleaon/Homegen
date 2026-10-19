package com.ktheme.android

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import com.ktheme.models.Theme
import com.ktheme.models.ThemeMetadata
import com.ktheme.utils.ColorUtils
import com.ktheme.models.ColorScheme as KthemeColorScheme

/**
 * CompositionLocal providing [KthemeSemanticColors] to child views.
 */
val LocalKthemeSemanticColors = staticCompositionLocalOf<KthemeSemanticColors> {
    error("No KthemeSemanticColors provided. Wrap your UI in KthemeComposeTheme { ... }.")
}

data class KthemeLayout(
    val id: String = "compose",
    val name: String = "Compose",
    val navPhone: String = "bar",
    val navWide: String = "rail",
    val adaptiveWidthDp: Int = 720,
    val cornerLargeDp: Int = 18,
    val cornerPanelDp: Int = 14,
    val cornerTileDp: Int = 12,
    val cornerCoverDp: Int = 6,
    val cornerControlDp: Int = 999,
    val cornerIconDp: Int = 10,
    val cornerArtworkDp: Int = 20,
    val typographyBody: String = "Roboto",
    val minimumMetadataSp: Int = 10,
    val contentCase: String = "preserve",
    val navigationCase: String = "preserve",
    val surfaces: String = "compose",
    val actions: String = "theme-effect",
    val player: String = "docked",
    val shadow: String = "theme-effect",
)

val LocalKthemeLayout = staticCompositionLocalOf { KthemeLayout() }

fun Theme.toKthemeLayout(): KthemeLayout {
    val layoutId = metadata.id.lowercase()
    return when {
        layoutId.contains("sweep") || layoutId.contains("lcars") -> KthemeLayout(
            id = "sweep",
            name = "Sweep Console",
            navPhone = "sweep",
            navWide = "sweep",
            cornerLargeDp = 0,
            cornerPanelDp = 0,
            cornerTileDp = 0,
            cornerCoverDp = 0,
            cornerControlDp = 999,
            cornerIconDp = 999,
            cornerArtworkDp = 0,
            typographyBody = "Antonio + Nunito Sans",
            contentCase = "uppercase",
            navigationCase = "uppercase",
            surfaces = "lcars",
            actions = "filled-text",
            player = "docked-text",
            shadow = "none",
        )
        layoutId.contains("terminal") -> KthemeLayout(
            id = "terminal",
            name = "Ink Terminal",
            navPhone = "bar",
            navWide = "rail",
            cornerLargeDp = 4,
            cornerPanelDp = 4,
            cornerTileDp = 4,
            cornerCoverDp = 4,
            cornerControlDp = 4,
            cornerIconDp = 4,
            cornerArtworkDp = 4,
            typographyBody = "JetBrains Mono",
            minimumMetadataSp = 12,
            contentCase = "uppercase",
            navigationCase = "uppercase",
            surfaces = "box",
            shadow = "none",
        )
        layoutId.contains("tile") || layoutId.contains("metro") -> KthemeLayout(
            id = "tiles",
            name = "Metro Tiles",
            navPhone = "pivot-appbar",
            navWide = "pivot-appbar",
            cornerLargeDp = 0,
            cornerPanelDp = 0,
            cornerTileDp = 0,
            cornerCoverDp = 0,
            cornerControlDp = 0,
            cornerIconDp = 0,
            cornerArtworkDp = 0,
            typographyBody = "Open Sans",
            navigationCase = "lowercase",
            surfaces = "flat",
            actions = "accent-tile",
        )
        layoutId.contains("glass") || layoutId.contains("aero") || layoutId.contains("frutiger") -> KthemeLayout(
            id = "glass",
            name = "Aero Glass",
            navPhone = "bar",
            navWide = "rail",
            cornerLargeDp = 18,
            cornerPanelDp = 16,
            cornerTileDp = 12,
            cornerCoverDp = 8,
            cornerControlDp = 12,
            cornerIconDp = 12,
            cornerArtworkDp = 22,
            typographyBody = "Nunito Sans",
            surfaces = "soft",
        )
        layoutId.contains("rule") -> KthemeLayout(
            id = "rules",
            name = "Rule & Rail",
            navPhone = "rail",
            navWide = "rail",
            cornerLargeDp = 0,
            cornerPanelDp = 0,
            cornerTileDp = 0,
            cornerCoverDp = 0,
            cornerControlDp = 0,
            cornerIconDp = 0,
            cornerArtworkDp = 0,
            typographyBody = "Jost",
            contentCase = "uppercase",
            navigationCase = "uppercase",
            surfaces = "rule",
            shadow = "none",
        )
        layoutId.contains("press") || layoutId.contains("paper") -> KthemeLayout(
            id = "press",
            name = "Press",
            navPhone = "bar",
            navWide = "rail",
            cornerLargeDp = 6,
            cornerPanelDp = 3,
            cornerTileDp = 2,
            cornerCoverDp = 2,
            cornerControlDp = 2,
            cornerIconDp = 2,
            cornerArtworkDp = 4,
            typographyBody = "Source Serif 4 + Jost",
            surfaces = "quiet",
            actions = "quiet-solid",
            shadow = "none",
        )
        else -> KthemeLayout()
    }
}

/**
 * Default Ktheme theme instance used as fallback.
 */
val KthemeDefaultTheme = Theme(
    metadata = ThemeMetadata(
        id = "navy-gold",
        name = "Navy Gold",
        description = "Elegant navy background with gold metallic accents",
        author = "Ktheme",
        version = "1.0.0",
        tags = listOf("navy", "gold", "dark"),
        createdAt = "2026-01-01T00:00:00Z",
        updatedAt = "2026-01-01T00:00:00Z",
    ),
    darkMode = true,
    colorScheme = KthemeColorScheme(
        primary = "#D4AF37",
        onPrimary = "#0A1630",
        primaryContainer = "#1E2A4A",
        onPrimaryContainer = "#F0E6D2",
        secondary = "#8A9EA7",
        onSecondary = "#0A1630",
        secondaryContainer = "#23334A",
        onSecondaryContainer = "#DDE5ED",
        tertiary = "#C5A059",
        onTertiary = "#0A1630",
        tertiaryContainer = "#2E2818",
        onTertiaryContainer = "#F5E9D4",
        error = "#CF6679",
        onError = "#000000",
        errorContainer = "#B00020",
        onErrorContainer = "#FFFFFF",
        background = "#0A1630",
        onBackground = "#E0E6ED",
        surface = "#12203F",
        onSurface = "#E0E6ED",
        surfaceVariant = "#1E2D4A",
        onSurfaceVariant = "#B0BEC5",
        outline = "#4A5D78",
        outlineVariant = "#2A3A52",
        scrim = "#80000000",
        inverseSurface = "#E0E6ED",
        inverseOnSurface = "#0A1630",
        inversePrimary = "#6A5518",
    ),
)

object KthemeComposeTheme {
    val colors: KthemeSemanticColors
        @Composable
        get() = LocalKthemeSemanticColors.current

    val layout: KthemeLayout
        @Composable
        get() = LocalKthemeLayout.current
}

/**
 * Custom Ktheme theme provider composable wrapping [MaterialTheme] and setting [LocalKthemeSemanticColors] and [LocalKthemeLayout].
 */
@Composable
fun KthemeComposeTheme(
    theme: Theme = KthemeDefaultTheme,
    isDark: Boolean = theme.darkMode,
    layout: KthemeLayout = theme.toKthemeLayout(),
    content: @Composable () -> Unit,
) {
    val materialColorScheme = theme.toMaterial3ColorScheme(isDark = isDark)
    val semanticColors = theme.semanticColors()

    CompositionLocalProvider(
        LocalKthemeSemanticColors provides semanticColors,
        LocalKthemeLayout provides layout,
    ) {
        MaterialTheme(
            colorScheme = materialColorScheme,
            content = content,
        )
    }
}

/**
 * Convert a Ktheme [Theme] to a Material 3 [ColorScheme], using [Theme.darkMode].
 */
fun Theme.toMaterial3ColorScheme(): ColorScheme = toMaterial3ColorScheme(isDark = darkMode)

/**
 * Convert a Ktheme [Theme] to a Material 3 [ColorScheme].
 */
fun Theme.toMaterial3ColorScheme(isDark: Boolean = darkMode): ColorScheme {
    val source = colorScheme
    val primary = Color(ColorUtils.hexToColorInt(source.primary))
    val onPrimary = Color(ColorUtils.hexToColorInt(source.onPrimary))
    val primaryContainer = Color(ColorUtils.hexToColorInt(source.primaryContainer))
    val onPrimaryContainer = Color(ColorUtils.hexToColorInt(source.onPrimaryContainer))

    val secondary = Color(ColorUtils.hexToColorInt(source.secondary))
    val onSecondary = Color(ColorUtils.hexToColorInt(source.onSecondary))
    val secondaryContainer = Color(ColorUtils.hexToColorInt(source.secondaryContainer))
    val onSecondaryContainer = Color(ColorUtils.hexToColorInt(source.onSecondaryContainer))

    val tertiary = Color(ColorUtils.hexToColorInt(source.tertiary))
    val onTertiary = Color(ColorUtils.hexToColorInt(source.onTertiary))
    val tertiaryContainer = Color(ColorUtils.hexToColorInt(source.tertiaryContainer))
    val onTertiaryContainer = Color(ColorUtils.hexToColorInt(source.onTertiaryContainer))

    val error = Color(ColorUtils.hexToColorInt(source.error))
    val onError = Color(ColorUtils.hexToColorInt(source.onError))
    val errorContainer = Color(ColorUtils.hexToColorInt(source.errorContainer))
    val onErrorContainer = Color(ColorUtils.hexToColorInt(source.onErrorContainer))

    val background = Color(ColorUtils.hexToColorInt(source.background))
    val onBackground = Color(ColorUtils.hexToColorInt(source.onBackground))
    val surface = Color(ColorUtils.hexToColorInt(source.surface))
    val onSurface = Color(ColorUtils.hexToColorInt(source.onSurface))
    val surfaceVariant = Color(ColorUtils.hexToColorInt(source.surfaceVariant))
    val onSurfaceVariant = Color(ColorUtils.hexToColorInt(source.onSurfaceVariant))

    val outline = Color(ColorUtils.hexToColorInt(source.outline))
    val outlineVariant = Color(ColorUtils.hexToColorInt(source.outlineVariant))

    val scrim = Color(ColorUtils.hexToColorInt(source.scrim))
    val inverseSurface = Color(ColorUtils.hexToColorInt(source.inverseSurface))
    val inverseOnSurface = Color(ColorUtils.hexToColorInt(source.inverseOnSurface))
    val inversePrimary = Color(ColorUtils.hexToColorInt(source.inversePrimary))

    return if (isDark) {
        darkColorScheme(
            primary = primary,
            onPrimary = onPrimary,
            primaryContainer = primaryContainer,
            onPrimaryContainer = onPrimaryContainer,
            secondary = secondary,
            onSecondary = onSecondary,
            secondaryContainer = secondaryContainer,
            onSecondaryContainer = onSecondaryContainer,
            tertiary = tertiary,
            onTertiary = onTertiary,
            tertiaryContainer = tertiaryContainer,
            onTertiaryContainer = onTertiaryContainer,
            error = error,
            onError = onError,
            errorContainer = errorContainer,
            onErrorContainer = onErrorContainer,
            background = background,
            onBackground = onBackground,
            surface = surface,
            onSurface = onSurface,
            surfaceVariant = surfaceVariant,
            onSurfaceVariant = onSurfaceVariant,
            outline = outline,
            outlineVariant = outlineVariant,
            scrim = scrim,
            inverseSurface = inverseSurface,
            inverseOnSurface = inverseOnSurface,
            inversePrimary = inversePrimary,
        )
    } else {
        lightColorScheme(
            primary = primary,
            onPrimary = onPrimary,
            primaryContainer = primaryContainer,
            onPrimaryContainer = onPrimaryContainer,
            secondary = secondary,
            onSecondary = onSecondary,
            secondaryContainer = secondaryContainer,
            onSecondaryContainer = onSecondaryContainer,
            tertiary = tertiary,
            onTertiary = onTertiary,
            tertiaryContainer = tertiaryContainer,
            onTertiaryContainer = onTertiaryContainer,
            error = error,
            onError = onError,
            errorContainer = errorContainer,
            onErrorContainer = onErrorContainer,
            background = background,
            onBackground = onBackground,
            surface = surface,
            onSurface = onSurface,
            surfaceVariant = surfaceVariant,
            onSurfaceVariant = onSurfaceVariant,
            outline = outline,
            outlineVariant = outlineVariant,
            scrim = scrim,
            inverseSurface = inverseSurface,
            inverseOnSurface = inverseOnSurface,
            inversePrimary = inversePrimary,
        )
    }
}

/**
 * Semantic colors that are convenient to consume from app UI layers.
 */
data class KthemeSemanticColors(
    val brand: Color,
    val onBrand: Color,
    val accent: Color,
    val onAccent: Color,
    val highlight: Color,
    val onHighlight: Color,
    val appBackground: Color,
    val onAppBackground: Color,
    val cardBackground: Color,
    val onCardBackground: Color,
    val cardBackgroundAlt: Color,
    val onCardBackgroundAlt: Color,
    val border: Color,
    val borderSubtle: Color,
    val danger: Color,
    val onDanger: Color,
    val dangerContainer: Color,
    val onDangerContainer: Color,
    val scrim: Color,
    val inverseSurface: Color,
    val inverseOnSurface: Color,
    val inversePrimary: Color,
)

/**
 * Build semantic colors from a theme.
 */
fun Theme.semanticColors(): KthemeSemanticColors {
    val source = colorScheme
    return KthemeSemanticColors(
        brand = Color(ColorUtils.hexToColorInt(source.primary)),
        onBrand = Color(ColorUtils.hexToColorInt(source.onPrimary)),
        accent = Color(ColorUtils.hexToColorInt(source.secondary)),
        onAccent = Color(ColorUtils.hexToColorInt(source.onSecondary)),
        highlight = Color(ColorUtils.hexToColorInt(source.tertiary)),
        onHighlight = Color(ColorUtils.hexToColorInt(source.onTertiary)),
        appBackground = Color(ColorUtils.hexToColorInt(source.background)),
        onAppBackground = Color(ColorUtils.hexToColorInt(source.onBackground)),
        cardBackground = Color(ColorUtils.hexToColorInt(source.surface)),
        onCardBackground = Color(ColorUtils.hexToColorInt(source.onSurface)),
        cardBackgroundAlt = Color(ColorUtils.hexToColorInt(source.surfaceVariant)),
        onCardBackgroundAlt = Color(ColorUtils.hexToColorInt(source.onSurfaceVariant)),
        border = Color(ColorUtils.hexToColorInt(source.outline)),
        borderSubtle = Color(ColorUtils.hexToColorInt(source.outlineVariant)),
        danger = Color(ColorUtils.hexToColorInt(source.error)),
        onDanger = Color(ColorUtils.hexToColorInt(source.onError)),
        dangerContainer = Color(ColorUtils.hexToColorInt(source.errorContainer)),
        onDangerContainer = Color(ColorUtils.hexToColorInt(source.onErrorContainer)),
        scrim = Color(ColorUtils.hexToColorInt(source.scrim)).let { if (it.alpha == 1f) it.copy(alpha = 0.5f) else it },
        inverseSurface = Color(ColorUtils.hexToColorInt(source.inverseSurface)),
        inverseOnSurface = Color(ColorUtils.hexToColorInt(source.inverseOnSurface)),
        inversePrimary = Color(ColorUtils.hexToColorInt(source.inversePrimary)),
    )
}
