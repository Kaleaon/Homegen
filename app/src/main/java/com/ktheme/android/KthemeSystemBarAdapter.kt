package com.ktheme.android

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Window
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.ktheme.models.Theme

/**
 * Controller for synchronizing Android window status bar and navigation bar colors
 * and light/dark icon flags dynamically with Ktheme tokens.
 */
object KthemeSystemBarAdapter {

    /**
     * Updates window system bar background colors and icon contrast flags.
     *
     * @param window Target Activity window.
     * @param statusBarColor Color for status bar background.
     * @param navigationBarColor Color for navigation bar background.
     * @param isDarkTheme Whether dark theme is active; if null, inferred from status bar luminance.
     */
    fun updateSystemBars(
        window: Window?,
        statusBarColor: Color,
        navigationBarColor: Color,
        isDarkTheme: Boolean? = null,
    ) {
        if (window == null) return
        try {
            window.statusBarColor = statusBarColor.toArgb()
            window.navigationBarColor = navigationBarColor.toArgb()

            val decorView = window.decorView ?: return
            val insetsController = WindowCompat.getInsetsController(window, decorView)

            val isDark = isDarkTheme ?: (statusBarColor.luminance() < 0.5f)
            insetsController.isAppearanceLightStatusBars = !isDark
            insetsController.isAppearanceLightNavigationBars = !isDark
        } catch (_: Exception) {
            // Guard against test environments or non-standard window contexts
        }
    }

    /**
     * Updates window system bars using [KthemeSemanticColors].
     */
    fun updateSystemBars(
        window: Window?,
        colors: KthemeSemanticColors,
        isDarkTheme: Boolean? = null,
    ) {
        updateSystemBars(
            window = window,
            statusBarColor = colors.appBackground,
            navigationBarColor = colors.appBackground,
            isDarkTheme = isDarkTheme,
        )
    }

    /**
     * Updates Activity system bars using [KthemeSemanticColors].
     */
    fun updateSystemBars(
        activity: Activity?,
        colors: KthemeSemanticColors,
        isDarkTheme: Boolean? = null,
    ) {
        updateSystemBars(
            window = activity?.window,
            colors = colors,
            isDarkTheme = isDarkTheme,
        )
    }

    /**
     * Updates window system bars using a Ktheme [Theme].
     */
    fun updateSystemBars(
        window: Window?,
        theme: Theme,
    ) {
        updateSystemBars(
            window = window,
            colors = theme.semanticColors(),
            isDarkTheme = theme.darkMode,
        )
    }

    /**
     * Updates Activity system bars using a Ktheme [Theme].
     */
    fun updateSystemBars(
        activity: Activity?,
        theme: Theme,
    ) {
        updateSystemBars(
            window = activity?.window,
            theme = theme,
        )
    }

    /**
     * Composable function that observes theme changes and synchronizes system bars.
     */
    @Composable
    operator fun invoke(
        window: Window? = findWindowFromContext(LocalView.current.context),
        colors: KthemeSemanticColors = LocalKthemeSemanticColors.current,
        isDarkTheme: Boolean? = null,
    ) {
        val view = LocalView.current
        if (!view.isInEditMode) {
            SideEffect {
                updateSystemBars(
                    window = window,
                    colors = colors,
                    isDarkTheme = isDarkTheme,
                )
            }
        }
    }

    /**
     * Composable method for explicit observation.
     */
    @Composable
    fun Observe(
        window: Window? = findWindowFromContext(LocalView.current.context),
        colors: KthemeSemanticColors = LocalKthemeSemanticColors.current,
        isDarkTheme: Boolean? = null,
    ) {
        invoke(window = window, colors = colors, isDarkTheme = isDarkTheme)
    }

    private fun findWindowFromContext(context: Context): Window? {
        var currentContext = context
        while (currentContext is ContextWrapper) {
            if (currentContext is Activity) {
                return currentContext.window
            }
            currentContext = currentContext.baseContext ?: break
        }
        return null
    }
}
