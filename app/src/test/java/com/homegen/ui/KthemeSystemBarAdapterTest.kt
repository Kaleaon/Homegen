package com.homegen.ui

import android.app.Activity
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.ktheme.android.KthemeDefaultTheme
import com.ktheme.android.KthemeSystemBarAdapter
import com.ktheme.android.semanticColors
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class KthemeSystemBarAdapterTest {

    @Test
    fun `updateSystemBars updates status and navigation bar colors on Activity window`() {
        val controller = Robolectric.buildActivity(Activity::class.java)
        val activity = controller.setup().get()
        val window = activity.window

        val testStatusBarColor = Color(0xFF0A1630)
        val testNavBarColor = Color(0xFF12203F)

        KthemeSystemBarAdapter.updateSystemBars(
            window = window,
            statusBarColor = testStatusBarColor,
            navigationBarColor = testNavBarColor,
            isDarkTheme = true,
        )

        assertEquals(testStatusBarColor.toArgb(), window.statusBarColor)
        assertEquals(testNavBarColor.toArgb(), window.navigationBarColor)
    }

    @Test
    fun `updateSystemBars with KthemeSemanticColors aligns colors correctly`() {
        val controller = Robolectric.buildActivity(Activity::class.java)
        val activity = controller.setup().get()
        val window = activity.window

        val semantic = KthemeDefaultTheme.semanticColors()

        KthemeSystemBarAdapter.updateSystemBars(
            window = window,
            colors = semantic,
            isDarkTheme = true,
        )

        assertEquals(semantic.appBackground.toArgb(), window.statusBarColor)
        assertEquals(semantic.appBackground.toArgb(), window.navigationBarColor)
    }

    @Test
    fun `updateSystemBars handles null window gracefully without throwing`() {
        KthemeSystemBarAdapter.updateSystemBars(
            window = null,
            statusBarColor = Color.Black,
            navigationBarColor = Color.Black,
            isDarkTheme = true,
        )
    }
}
