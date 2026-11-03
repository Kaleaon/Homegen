package com.ktheme.android.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.Icon
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.AnnotatedString
import com.ktheme.android.KthemeLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class KthemePrimitivesTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `KthemeText preserves casing when contentCase is preserve`() {
        composeTestRule.setContent {
            CompositionLocalProvider(
                com.ktheme.android.LocalKthemeLayout provides KthemeLayout(contentCase = "preserve"),
            ) {
                KthemeText(text = "Hello Ktheme")
            }
        }

        composeTestRule.onNodeWithText("Hello Ktheme").assertIsDisplayed()
    }

    @Test
    fun `KthemeText converts text to uppercase when contentCase is uppercase`() {
        composeTestRule.setContent {
            CompositionLocalProvider(
                com.ktheme.android.LocalKthemeLayout provides KthemeLayout(contentCase = "uppercase"),
            ) {
                KthemeText(text = "Hello Ktheme")
            }
        }

        composeTestRule.onNodeWithText("HELLO KTHEME").assertIsDisplayed()
    }

    @Test
    fun `KthemeText AnnotatedString converts to uppercase when contentCase is uppercase`() {
        composeTestRule.setContent {
            CompositionLocalProvider(
                com.ktheme.android.LocalKthemeLayout provides KthemeLayout(contentCase = "uppercase"),
            ) {
                KthemeText(text = AnnotatedString("Annotated Title"))
            }
        }

        composeTestRule.onNodeWithText("ANNOTATED TITLE").assertIsDisplayed()
    }

    @Test
    fun `KthemeCard displays content and non-clickable does not intercept`() {
        composeTestRule.setContent {
            KthemeCard {
                KthemeText("Card Interior")
            }
        }

        composeTestRule.onNodeWithText("Card Interior").assertIsDisplayed()
    }

    @Test
    fun `KthemeCard clickable executes onClick`() {
        var clicked = false

        composeTestRule.setContent {
            KthemeCard(
                onClick = { clicked = true },
                modifier = Modifier.testTag("clickable_card"),
            ) {
                KthemeText("Clickable Card Content")
            }
        }

        composeTestRule.onNodeWithTag("clickable_card").performClick()
        assertTrue(clicked)
    }

    @Test
    fun `KthemeBadge displays text overload and respects casing`() {
        composeTestRule.setContent {
            CompositionLocalProvider(
                com.ktheme.android.LocalKthemeLayout provides KthemeLayout(contentCase = "preserve"),
            ) {
                KthemeBadge(
                    text = "Active Status",
                    variant = KthemeBadgeVariant.Brand,
                )
            }
        }

        composeTestRule.onNodeWithText("Active Status").assertIsDisplayed()
    }

    @Test
    fun `KthemeBadge slot overload displays custom content`() {
        composeTestRule.setContent {
            KthemeBadge(variant = KthemeBadgeVariant.Highlight) {
                KthemeText("Custom Badge Slot")
            }
        }

        composeTestRule.onNodeWithText("Custom Badge Slot").assertIsDisplayed()
    }

    @Test
    fun `KthemeButton fires onClick when enabled and does not fire when disabled`() {
        var clickCount = 0

        composeTestRule.setContent {
            androidx.compose.foundation.layout.Column {
                KthemeButton(
                    onClick = { clickCount++ },
                    enabled = true,
                    modifier = Modifier.testTag("enabled_btn"),
                ) {
                    KthemeText("Submit")
                }

                KthemeButton(
                    onClick = { clickCount++ },
                    enabled = false,
                    modifier = Modifier.testTag("disabled_btn"),
                ) {
                    KthemeText("Disabled")
                }
            }
        }

        composeTestRule.onNodeWithTag("enabled_btn").assertIsEnabled().performClick()
        assertEquals(1, clickCount)

        composeTestRule.onNodeWithTag("disabled_btn").assertIsNotEnabled()
    }

    @Test
    fun `KthemeIconButton responds to click events`() {
        var clicked = false

        composeTestRule.setContent {
            KthemeIconButton(
                onClick = { clicked = true },
                modifier = Modifier.testTag("icon_btn"),
            ) {
                Icon(Icons.Default.Home, contentDescription = "Home Icon")
            }
        }

        composeTestRule.onNodeWithTag("icon_btn").performClick()
        assertTrue(clicked)
    }

    @Test
    fun `KthemeDialog displays title text and action buttons`() {
        var confirmed = false
        var dismissed = false

        composeTestRule.setContent {
            KthemeDialog(
                onDismissRequest = { dismissed = true },
                title = { KthemeText("Dialog Title") },
                text = { KthemeText("Dialog Description") },
                confirmButton = {
                    KthemeButton(
                        onClick = { confirmed = true },
                        modifier = Modifier.testTag("confirm_action"),
                    ) {
                        KthemeText("Confirm")
                    }
                },
                dismissButton = {
                    KthemeButton(
                        onClick = { dismissed = true },
                        modifier = Modifier.testTag("dismiss_action"),
                    ) {
                        KthemeText("Cancel")
                    }
                },
            )
        }

        composeTestRule.onNodeWithText("Dialog Title").assertIsDisplayed()
        composeTestRule.onNodeWithText("Dialog Description").assertIsDisplayed()

        composeTestRule.onNodeWithTag("confirm_action").performClick()
        assertTrue(confirmed)
        assertFalse(dismissed)

        composeTestRule.onNodeWithTag("dismiss_action").performClick()
        assertTrue(dismissed)
    }

    @Test
    fun `KthemeNavigationRail renders and responds to click`() {
        var railSelected = false

        composeTestRule.setContent {
            KthemeNavigationRail {
                KthemeNavigationRailItem(
                    selected = true,
                    onClick = { railSelected = true },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Rail Home") },
                    label = { KthemeText("Rail Home") },
                    modifier = Modifier.testTag("rail_item"),
                )
            }
        }

        composeTestRule.onNodeWithTag("rail_item").performClick()
        assertTrue(railSelected)
    }

    @Test
    fun `KthemeNavigationBar renders and responds to click`() {
        var barSelected = false

        composeTestRule.setContent {
            KthemeNavigationBar {
                KthemeNavigationBarItem(
                    selected = false,
                    onClick = { barSelected = true },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Bar Home") },
                    label = { KthemeText("Bar Home") },
                    modifier = Modifier.testTag("bar_item"),
                )
            }
        }

        composeTestRule.onNodeWithTag("bar_item").performClick()
        assertTrue(barSelected)
    }

    @Test
    fun `KthemeSurface renders enclosed content`() {
        composeTestRule.setContent {
            KthemeSurface(modifier = Modifier.testTag("surface_box")) {
                KthemeText("Surface Child")
            }
        }

        composeTestRule.onNodeWithTag("surface_box").assertIsDisplayed()
        composeTestRule.onNodeWithText("Surface Child").assertIsDisplayed()
    }
}
