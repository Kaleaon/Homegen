package com.homegen.ui

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OnboardingOverlayStateTest {

    @Test
    fun `initial state is on step 0 and first step is true`() {
        val state = OnboardingOverlayState()
        assertEquals(0, state.currentStep)
        assertEquals(6, state.totalSteps)
        assertTrue(state.isFirstStep)
        assertFalse(state.isLastStep)
        assertEquals("Tap the scene to select objects", state.currentTooltip)
    }

    @Test
    fun `nextStep increments current step until last step and signals completion`() {
        val state = OnboardingOverlayState()

        // Steps 0 -> 4 should advance and return false (not finished)
        for (i in 0 until 5) {
            assertEquals(i, state.currentStep)
            val isFinished = state.nextStep()
            assertFalse(isFinished)
        }

        assertEquals(5, state.currentStep)
        assertTrue(state.isLastStep)
        assertFalse(state.isFirstStep)
        assertEquals("Use Undo/Redo at the top right to fix mistakes", state.currentTooltip)

        // Calling nextStep on last step returns true (finished)
        val isFinished = state.nextStep()
        assertTrue(isFinished)
    }

    @Test
    fun `previousStep decrements current step and clamps at step 0`() {
        val state = OnboardingOverlayState(initialStep = 2)
        assertEquals(2, state.currentStep)

        assertTrue(state.previousStep())
        assertEquals(1, state.currentStep)

        assertTrue(state.previousStep())
        assertEquals(0, state.currentStep)
        assertTrue(state.isFirstStep)

        // Calling previousStep on step 0 returns false and stays at step 0
        assertFalse(state.previousStep())
        assertEquals(0, state.currentStep)
    }

    @Test
    fun `custom tooltips list is supported`() {
        val customTooltips = listOf("Tip A", "Tip B")
        val state = OnboardingOverlayState(tooltips = customTooltips)

        assertEquals(2, state.totalSteps)
        assertEquals("Tip A", state.currentTooltip)
        assertFalse(state.isLastStep)

        val finishedOnStep0 = state.nextStep()
        assertFalse(finishedOnStep0)
        assertEquals("Tip B", state.currentTooltip)
        assertTrue(state.isLastStep)

        val finishedOnStep1 = state.nextStep()
        assertTrue(finishedOnStep1)
    }
}
