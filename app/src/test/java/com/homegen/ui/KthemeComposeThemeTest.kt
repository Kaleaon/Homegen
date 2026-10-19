package com.homegen.ui

import androidx.compose.material3.Typography
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp
import com.ktheme.android.KthemeDefaultTheme
import com.ktheme.android.parseFontFamily
import com.ktheme.android.semanticColors
import com.ktheme.android.toMaterial3ColorScheme
import com.ktheme.android.toMaterial3Typography
import com.ktheme.models.FontSize
import com.ktheme.models.FontWeight
import com.ktheme.utils.ColorUtils
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import androidx.compose.ui.text.font.FontWeight as ComposeFontWeight
import com.ktheme.models.Typography as KthemeTypography

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

    @Test
    fun `toMaterial3Typography returns default Material3 typography when typography is null`() {
        val themeWithNullTypography = KthemeDefaultTheme.copy(typography = null)
        val typography = themeWithNullTypography.toMaterial3Typography()

        assertNotNull(typography)
        assertEquals(Typography(), typography)
    }

    @Test
    fun `toMaterial3Typography maps custom typography tokens correctly`() {
        val customTypography = KthemeTypography(
            fontFamily = "serif",
            fontSize = FontSize(small = 12, medium = 16, large = 20, xlarge = 28),
            fontWeight = FontWeight(light = 300, regular = 400, medium = 500, bold = 700),
            lineHeight = 1.25f,
            letterSpacing = 0.5f,
        )
        val theme = KthemeDefaultTheme.copy(typography = customTypography)

        val materialTypography = theme.toMaterial3Typography()

        assertNotNull(materialTypography)
        assertEquals(FontFamily.Serif, materialTypography.bodyLarge.fontFamily)
        assertEquals(16.sp, materialTypography.bodyLarge.fontSize)
        assertEquals(ComposeFontWeight(400), materialTypography.bodyLarge.fontWeight)
        assertEquals((16 * 1.25f).sp, materialTypography.bodyLarge.lineHeight)
        assertEquals(0.5.sp, materialTypography.bodyLarge.letterSpacing)

        assertEquals(28.sp, materialTypography.displayLarge.fontSize)
        assertEquals(ComposeFontWeight(700), materialTypography.displayLarge.fontWeight)
        assertEquals(ComposeFontWeight(300), materialTypography.bodySmall.fontWeight)
        assertEquals(12.sp, materialTypography.titleSmall.fontSize)
    }

    @Test
    fun `parseFontFamily maps standard font strings to Compose FontFamily equivalents`() {
        assertEquals(FontFamily.SansSerif, parseFontFamily("sans-serif"))
        assertEquals(FontFamily.SansSerif, parseFontFamily("sans"))
        assertEquals(FontFamily.Serif, parseFontFamily("serif"))
        assertEquals(FontFamily.Monospace, parseFontFamily("monospace"))
        assertEquals(FontFamily.Monospace, parseFontFamily("mono"))
        assertEquals(FontFamily.Cursive, parseFontFamily("cursive"))
        assertEquals(FontFamily.Default, parseFontFamily("unknown-custom-font"))
        assertEquals(FontFamily.Default, parseFontFamily(null))
    }
}
