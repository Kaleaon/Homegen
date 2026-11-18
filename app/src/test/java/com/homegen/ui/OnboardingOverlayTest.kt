package com.homegen.ui

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.core.app.ApplicationProvider
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class OnboardingOverlayTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(HOMEGEN_PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun `tapping backdrop does not dismiss onboarding and shields background controls`() {
        var dismissed = false
        var backgroundClicked = false

        composeTestRule.setContent {
            Box(modifier = Modifier.fillMaxSize()) {
                Button(
                    onClick = { backgroundClicked = true },
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .testTag("background_button"),
                ) {
                    Text("Background Control")
                }

                OnboardingOverlay(
                    context = context,
                    onDismiss = { dismissed = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("onboarding_card").assertIsDisplayed()
        composeTestRule.onNodeWithText("Step 1 of 6").assertIsDisplayed()

        // Tap near the top-left corner of the backdrop outside the centered onboarding card
        composeTestRule.onNodeWithTag("onboarding_backdrop").performTouchInput {
            click(Offset(12f, 12f))
        }

        // Verify onboarding stays active, background button did not receive touch, and prefs remain unset
        assertFalse(dismissed)
        assertFalse(backgroundClicked)
        composeTestRule.onNodeWithTag("onboarding_card").assertIsDisplayed()
        composeTestRule.onNodeWithText("Step 1 of 6").assertIsDisplayed()

        val prefs = context.getSharedPreferences(HOMEGEN_PREFS_NAME, Context.MODE_PRIVATE)
        assertFalse(prefs.getBoolean(KEY_ONBOARDING_COMPLETE, false))
    }

    @Test
    fun `clicking Skip button dismisses onboarding and persists completion`() {
        var dismissed = false

        composeTestRule.setContent {
            OnboardingOverlay(
                context = context,
                onDismiss = { dismissed = true },
            )
        }

        composeTestRule.onNodeWithText("Skip").assertIsDisplayed().performClick()
        composeTestRule.waitForIdle()

        assertTrue(dismissed)
        assertEquals(0, composeTestRule.onAllNodesWithTag("onboarding_card").fetchSemanticsNodes().size)

        val prefs = context.getSharedPreferences(HOMEGEN_PREFS_NAME, Context.MODE_PRIVATE)
        assertTrue(prefs.getBoolean(KEY_ONBOARDING_COMPLETE, false))
    }

    @Test
    fun `stepping through tooltips and clicking Got It dismisses onboarding`() {
        var dismissed = false

        composeTestRule.setContent {
            OnboardingOverlay(
                context = context,
                onDismiss = { dismissed = true },
            )
        }

        repeat(5) { stepIndex ->
            composeTestRule.onNodeWithText("Step ${stepIndex + 1} of 6").assertIsDisplayed()
            composeTestRule.onNodeWithText("Next").performClick()
        }

        assertFalse(dismissed)
        composeTestRule.onNodeWithText("Step 6 of 6").assertIsDisplayed()
        composeTestRule.onNodeWithText("Got It").assertIsDisplayed().performClick()
        composeTestRule.waitForIdle()

        assertTrue(dismissed)
        assertEquals(0, composeTestRule.onAllNodesWithTag("onboarding_card").fetchSemanticsNodes().size)

        val prefs = context.getSharedPreferences(HOMEGEN_PREFS_NAME, Context.MODE_PRIVATE)
        assertTrue(prefs.getBoolean(KEY_ONBOARDING_COMPLETE, false))
    }
}
