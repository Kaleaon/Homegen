package com.homegen.ui

import androidx.compose.ui.graphics.Color
import com.ktheme.android.KthemeDefaultTheme
import com.ktheme.android.semanticColors
import com.ktheme.android.toMaterial3ColorScheme
import com.ktheme.utils.ColorUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class KthemeComposeThemeTest {

    @Test
    fun `toMaterial3ColorScheme maps theme color scheme correctly`() {
        val colorScheme = KthemeDefaultTheme.toMaterial3ColorScheme()
        assertNotNull(colorScheme)

        val primaryInt = ColorUtils.hexToColorInt(KthemeDefaultTheme.colorScheme.primary)
        assertEquals(Color(primaryInt), colorScheme.primary)
    }

    @Test
    fun `semanticColors extracts semantic tokens correctly`() {
        val semantic = KthemeDefaultTheme.semanticColors()
        assertNotNull(semantic)

        val brandInt = ColorUtils.hexToColorInt(KthemeDefaultTheme.colorScheme.primary)
        assertEquals(Color(brandInt), semantic.brand)

        val errorContainerInt = ColorUtils.hexToColorInt(KthemeDefaultTheme.colorScheme.errorContainer)
        assertEquals(Color(errorContainerInt), semantic.dangerContainer)
    }

    @Test
    fun `hexToColorInt parses 6 and 8 digit hex colors correctly`() {
        assertEquals(0xFFFFFFFF.toInt(), ColorUtils.hexToColorInt("#FFFFFF"))
        assertEquals(0xFFFFFFFF.toInt(), ColorUtils.hexToColorInt("FFFFFF"))
        assertEquals(0x80FFFFFF.toInt(), ColorUtils.hexToColorInt("#80FFFFFF"))
    }
}
