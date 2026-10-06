package com.homegen.styles.data

import com.homegen.styles.model.ColorPalette
import com.homegen.styles.ui.parseHexToColor
import com.homegen.styles.ui.parsedAccent
import com.homegen.styles.ui.parsedColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class DesignStyleRepositoryTest {

    @Test
    fun `normalizeHexColor prepends missing hash prefix to 6 digit hex strings`() {
        assertEquals("#FFFFFF", DesignStyleRepository.normalizeHexColor("FFFFFF"))
        assertEquals("#2C2C2C", DesignStyleRepository.normalizeHexColor("2C2C2C"))
        assertEquals("#6b8f71", DesignStyleRepository.normalizeHexColor("6b8f71"))
    }

    @Test
    fun `normalizeHexColor prepends missing hash prefix to 8 digit hex strings`() {
        assertEquals("#FF2C2C2C", DesignStyleRepository.normalizeHexColor("FF2C2C2C"))
        assertEquals("#80FFFFFF", DesignStyleRepository.normalizeHexColor("80FFFFFF"))
    }

    @Test
    fun `normalizeHexColor preserves existing hash prefix`() {
        assertEquals("#FFFFFF", DesignStyleRepository.normalizeHexColor("#FFFFFF"))
        assertEquals("#FF2C2C2C", DesignStyleRepository.normalizeHexColor("#FF2C2C2C"))
    }

    @Test
    fun `normalizeHexColor handles whitespace and invalid format gracefully`() {
        assertEquals("#FFFFFF", DesignStyleRepository.normalizeHexColor("  FFFFFF  "))
        assertEquals("ZZZZZZ", DesignStyleRepository.normalizeHexColor("ZZZZZZ"))
        assertEquals("#123", DesignStyleRepository.normalizeHexColor("#123"))
    }

    @Test
    fun `isValidHexColor correctly identifies valid and invalid hex strings`() {
        assertTrue(DesignStyleRepository.isValidHexColor("#FFFFFF"))
        assertTrue(DesignStyleRepository.isValidHexColor("FFFFFF"))
        assertTrue(DesignStyleRepository.isValidHexColor("#FF2C2C2C"))
        assertTrue(DesignStyleRepository.isValidHexColor("FF2C2C2C"))

        assertFalse(DesignStyleRepository.isValidHexColor("ZZZZZZ"))
        assertFalse(DesignStyleRepository.isValidHexColor("#ZZZZZZ"))
        assertFalse(DesignStyleRepository.isValidHexColor("#123"))
        assertFalse(DesignStyleRepository.isValidHexColor(""))
    }

    @Test
    fun `loadCatalog normalizes palette colors across the catalog`() {
        val catalog = DesignStyleRepository.loadCatalog()

        assertTrue(catalog.palettes.isNotEmpty())
        for (palette in catalog.palettes) {
            for (color in palette.colors) {
                assertTrue("Color $color should start with '#'", color.startsWith("#"))
                assertTrue("Color $color should be valid", DesignStyleRepository.isValidHexColor(color))
            }
            if (palette.accent.isNotBlank()) {
                assertTrue("Accent ${palette.accent} should start with '#'", palette.accent.startsWith("#"))
                assertTrue("Accent ${palette.accent} should be valid", DesignStyleRepository.isValidHexColor(palette.accent))
            }
        }
    }

    @Test
    fun `normalizeAndValidatePalette logs warnings for malformed color entries`() {
        val malformedPalette = ColorPalette(
            id = "test_malformed",
            name = "Malformed Test",
            colors = listOf("FFFFFF", "INVALID_COLOR", "#2C2C2C"),
            accent = "BAD_ACCENT",
        )

        DesignStyleRepository.loadCatalog() // reset warnings
        val initialWarningCount = DesignStyleRepository.catalogWarnings.size

        val normalized = DesignStyleRepository.normalizeAndValidatePalette(malformedPalette)

        assertEquals("#FFFFFF", normalized.colors[0])
        assertEquals("INVALID_COLOR", normalized.colors[1])
        assertEquals("#2C2C2C", normalized.colors[2])
        assertEquals("BAD_ACCENT", normalized.accent)

        val warnings = DesignStyleRepository.catalogWarnings
        assertTrue(warnings.size >= initialWarningCount + 2)
        assertTrue(warnings.any { it.contains("INVALID_COLOR") })
        assertTrue(warnings.any { it.contains("BAD_ACCENT") })
    }

    @Test
    fun `ColorPalette parsedColors and parsedAccent extension properties parse colors correctly`() {
        val validPalette = ColorPalette(
            id = "p1",
            name = "P1",
            colors = listOf("FFFFFF", "#000000"),
            accent = "FF0000",
        )

        val parsedColors = validPalette.parsedColors
        assertEquals(2, parsedColors.size)
        assertNotNull(parsedColors[0])
        assertNotNull(parsedColors[1])
        assertNotNull(validPalette.parsedAccent)

        val invalidPalette = ColorPalette(
            id = "p2",
            name = "P2",
            colors = listOf("FFFFFF", "MALFORMED"),
            accent = "BAD_HEX",
        )

        val parsedInvalidColors = invalidPalette.parsedColors
        assertEquals(2, parsedInvalidColors.size)
        assertNotNull(parsedInvalidColors[0])
        assertNull(parsedInvalidColors[1])
        assertNull(invalidPalette.parsedAccent)
    }

    @Test
    fun `parseHexToColor and parsedColors cache parsed results consistently`() {
        val color1 = parseHexToColor("#336699")
        val color2 = parseHexToColor("#336699")
        assertEquals(color1, color2)

        val palette = ColorPalette(
            id = "cache_test",
            name = "Cache Test",
            colors = listOf("#112233", "#445566"),
            accent = "#778899",
        )

        val firstParsed = palette.parsedColors
        val secondParsed = palette.parsedColors
        assertSame(firstParsed, secondParsed)

        // Verify dynamic palette update with same ID but different colors updates cache
        val updatedPalette = ColorPalette(
            id = "cache_test",
            name = "Cache Test Updated",
            colors = listOf("#112233", "#998877"),
            accent = "#778899",
        )
        val updatedParsed = updatedPalette.parsedColors
        assertNotSame(firstParsed, updatedParsed)
        assertEquals(2, updatedParsed.size)
    }
}
