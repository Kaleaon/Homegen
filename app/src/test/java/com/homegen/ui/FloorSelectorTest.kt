package com.homegen.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class FloorSelectorTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `displays current floor and enables up button while disabling down button at minFloor`() {
        var upClicked = false

        composeTestRule.setContent {
            FloorSelector(
                currentFloor = 0,
                onFloorUp = { upClicked = true },
                onFloorDown = {},
                minFloor = 0,
                maxFloor = 5,
            )
        }

        composeTestRule.onNodeWithText("F0").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Navigate to floor below").assertIsNotEnabled()
        composeTestRule.onNodeWithContentDescription("Navigate to floor above").assertIsEnabled()

        composeTestRule.onNodeWithContentDescription("Navigate to floor above").performClick()
        assertTrue(upClicked)
    }

    @Test
    fun `disables up button at maxFloor`() {
        var downClicked = false

        composeTestRule.setContent {
            FloorSelector(
                currentFloor = 5,
                onFloorUp = {},
                onFloorDown = { downClicked = true },
                minFloor = 0,
                maxFloor = 5,
            )
        }

        composeTestRule.onNodeWithText("F5").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Navigate to floor above").assertIsNotEnabled()
        composeTestRule.onNodeWithContentDescription("Navigate to floor below").assertIsEnabled()

        composeTestRule.onNodeWithContentDescription("Navigate to floor below").performClick()
        assertTrue(downClicked)
    }

    @Test
    fun `clamps currentFloor when below minFloor`() {
        composeTestRule.setContent {
            FloorSelector(
                currentFloor = -5,
                onFloorUp = {},
                onFloorDown = {},
                minFloor = 0,
                maxFloor = 5,
            )
        }

        composeTestRule.onNodeWithText("F0").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Navigate to floor below").assertIsNotEnabled()
        composeTestRule.onNodeWithContentDescription("Navigate to floor above").assertIsEnabled()
    }

    @Test
    fun `clamps currentFloor when above maxFloor`() {
        composeTestRule.setContent {
            FloorSelector(
                currentFloor = 10,
                onFloorUp = {},
                onFloorDown = {},
                minFloor = 0,
                maxFloor = 5,
            )
        }

        composeTestRule.onNodeWithText("F5").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Navigate to floor above").assertIsNotEnabled()
        composeTestRule.onNodeWithContentDescription("Navigate to floor below").assertIsEnabled()
    }

    @Test
    fun `respects custom minFloor and maxFloor bounds`() {
        composeTestRule.setContent {
            FloorSelector(
                currentFloor = 2,
                onFloorUp = {},
                onFloorDown = {},
                minFloor = 1,
                maxFloor = 3,
            )
        }

        composeTestRule.onNodeWithText("F2").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Navigate to floor above").assertIsEnabled()
        composeTestRule.onNodeWithContentDescription("Navigate to floor below").assertIsEnabled()
    }
}
