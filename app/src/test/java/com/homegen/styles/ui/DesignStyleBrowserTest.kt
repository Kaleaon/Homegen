package com.homegen.styles.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.homegen.styles.model.ColorPalette
import com.homegen.styles.model.DesignStyle
import com.homegen.styles.model.DesignStyleCatalog
import com.homegen.styles.model.DesignStyleCategory
import com.ktheme.android.KthemeComposeTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DesignStyleBrowserTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val scandinavianPalette = ColorPalette(
        id = "pal_scandinavian",
        name = "Scandinavian",
        colors = listOf("#FFFFFF", "#F5F0EB", "#D4C5B2"),
        accent = "#6B8F71",
    )

    private val scandinavianStyle = DesignStyle(
        id = "scandinavian",
        name = "Scandinavian",
        description = "Light woods, clean lines, and muted tones.",
        era = "1950s–present",
        palette = scandinavianPalette,
        tags = listOf("modern", "clean", "minimal", "nordic", "natural"),
    )

    private val singleStyleCatalog = DesignStyleCatalog(
        version = 1,
        styles = listOf(scandinavianStyle),
        palettes = listOf(scandinavianPalette),
    )

    @Test
    fun `displays style cards by default and hides clear search button when search is empty`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = {},
                    onDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Scandinavian").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Clear search").assertDoesNotExist()
    }

    @Test
    fun `displays EmptyStyleState with query feedback when search returns zero styles`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = {},
                    onDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Search styles...").performTextInput("cyberpunk")

        composeTestRule.onNodeWithText("No Styles Found").assertIsDisplayed()
        composeTestRule.onNodeWithText("No styles matching \"cyberpunk\".").assertIsDisplayed()
        composeTestRule.onNodeWithText("Reset Filters").assertIsDisplayed()
    }

    @Test
    fun `clicking trailing clear icon clears search text and restores styles`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = {},
                    onDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Search styles...").performTextInput("cyberpunk")
        composeTestRule.onNodeWithText("No Styles Found").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Clear search").assertIsDisplayed()

        composeTestRule.onNodeWithContentDescription("Clear search").performClick()

        composeTestRule.onNodeWithContentDescription("Clear search").assertDoesNotExist()
        composeTestRule.onNodeWithText("Scandinavian").assertIsDisplayed()
    }

    @Test
    fun `clicking trailing clear icon preserves selectedCategory while clearing search`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = {},
                    onDismiss = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Minimalist").performClick()
        composeTestRule.onNodeWithText("Search styles...").performTextInput("cyberpunk")
        composeTestRule.onNodeWithText(
            "No styles matching \"cyberpunk\" in category \"Minimalist\".",
        ).assertIsDisplayed()

        composeTestRule.onNodeWithContentDescription("Clear search").performClick()

        composeTestRule.onNodeWithText("Minimalist").assertIsSelected()
        composeTestRule.onNodeWithText("Scandinavian").assertIsDisplayed()
    }

    @Test
    fun `clicking Reset Filters clears both search and selectedCategory`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = {},
                    onDismiss = {},
                    catalog = singleStyleCatalog,
                )
            }
        }

        composeTestRule.onNodeWithText("Eclectic").performClick()
        composeTestRule.onNodeWithText("Search styles...").performTextInput("victorian")

        composeTestRule.onNodeWithText("No Styles Found").assertIsDisplayed()
        composeTestRule.onNodeWithText(
            "No styles matching \"victorian\" in category \"Eclectic\".",
        ).assertIsDisplayed()

        composeTestRule.onNodeWithText("Reset Filters").performClick()

        composeTestRule.onNodeWithText("All").assertIsSelected()
        composeTestRule.onNodeWithContentDescription("Clear search").assertDoesNotExist()
        composeTestRule.onNodeWithText("Scandinavian").assertIsDisplayed()
    }

    @Test
    fun `displays category feedback when selected category has zero styles and resets on click`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = {},
                    onDismiss = {},
                    catalog = singleStyleCatalog,
                )
            }
        }

        composeTestRule.onNodeWithText("Eclectic").performClick()

        composeTestRule.onNodeWithText("No Styles Found").assertIsDisplayed()
        composeTestRule.onNodeWithText("No styles found in category \"Eclectic\".").assertIsDisplayed()

        composeTestRule.onNodeWithText("Reset Filters").performClick()

        composeTestRule.onNodeWithText("Scandinavian").assertIsDisplayed()
    }

    @Test
    fun `EmptyStyleState renders fallback message when catalog is empty with no filters`() {
        composeTestRule.setContent {
            KthemeComposeTheme {
                EmptyStyleState(
                    search = "   ",
                    selectedCategory = DesignStyleCategory.ALL,
                    onResetFilters = {},
                )
            }
        }

        composeTestRule.onNodeWithText("No Styles Found").assertIsDisplayed()
        composeTestRule.onNodeWithText("No design styles available.").assertIsDisplayed()
        composeTestRule.onNodeWithText("Reset Filters").assertIsDisplayed()
    }

    @Test
    fun `preserves style selection and dismiss callbacks`() {
        var selectedStyle: DesignStyle? = null
        var dismissed = false

        composeTestRule.setContent {
            KthemeComposeTheme {
                DesignStyleBrowser(
                    onStyleSelected = { selectedStyle = it },
                    onDismiss = { dismissed = true },
                    catalog = singleStyleCatalog,
                )
            }
        }

        composeTestRule.onNodeWithText("Scandinavian").performClick()
        assertEquals("scandinavian", selectedStyle?.id)

        composeTestRule.onNodeWithText("Close").performClick()
        assertTrue(dismissed)
    }
}
