package com.homegen.ui

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

internal val onboardingTooltips = listOf(
    "Tap the scene to select objects",
    "Drag with one finger to move selected objects",
    "Pinch with two fingers to zoom in and out",
    "Use Wall or Room mode to draw walls",
    "Open the Catalog to browse furniture and materials",
    "Use Undo/Redo at the top right to fix mistakes",
)

const val HOMEGEN_PREFS_NAME = "homegen_prefs"
const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"

class OnboardingOverlayState(
    val tooltips: List<String> = onboardingTooltips,
    initialStep: Int = 0,
) {
    var currentStep by mutableIntStateOf(initialStep)
        private set

    val totalSteps: Int get() = tooltips.size
    val isFirstStep: Boolean get() = currentStep == 0
    val isLastStep: Boolean get() = currentStep == totalSteps - 1
    val currentTooltip: String get() = tooltips[currentStep]

    fun nextStep(): Boolean {
        if (currentStep < totalSteps - 1) {
            currentStep++
            return false
        }
        return true
    }

    fun previousStep(): Boolean {
        if (currentStep > 0) {
            currentStep--
            return true
        }
        return false
    }
}

@Composable
fun OnboardingOverlay(
    context: Context,
    onDismiss: () -> Unit,
) {
    val prefs = remember { context.getSharedPreferences(HOMEGEN_PREFS_NAME, Context.MODE_PRIVATE) }
    var isVisible by remember { mutableStateOf(!prefs.getBoolean(KEY_ONBOARDING_COMPLETE, false)) }

    if (!isVisible) return

    val state = remember { OnboardingOverlayState() }

    val dismissOnboarding = {
        prefs.edit().putBoolean(KEY_ONBOARDING_COMPLETE, true).apply()
        isVisible = false
        onDismiss()
    }

    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable {
                    // Taps outside the dialog card dismiss the onboarding cleanly
                    dismissOnboarding()
                },
            contentAlignment = Alignment.Center,
        ) {
            Card(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth(0.9f)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {}, // Intercept clicks inside card so backdrop isn't triggered
                    ),
                shape = MaterialTheme.shapes.large,
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    // Header row with step badge and Skip button
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Step ${state.currentStep + 1} of ${state.totalSteps}",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        TextButton(
                            onClick = dismissOnboarding,
                        ) {
                            Text(
                                text = "Skip",
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }

                    // Main step tooltip content
                    Text(
                        text = state.currentTooltip,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )

                    // Visual step progress indicators (dots)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        state.tooltips.indices.forEach { index ->
                            val isActive = index == state.currentStep
                            Box(
                                modifier = Modifier
                                    .padding(horizontal = 4.dp)
                                    .size(if (isActive) 10.dp else 6.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (isActive) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.outlineVariant
                                        },
                                    ),
                            )
                        }
                    }

                    // Navigation buttons row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedButton(
                            onClick = { state.previousStep() },
                            enabled = !state.isFirstStep,
                        ) {
                            Text("Previous")
                        }

                        Button(
                            onClick = {
                                if (state.nextStep()) {
                                    dismissOnboarding()
                                }
                            },
                        ) {
                            Text(
                                if (state.isLastStep) "Got It" else "Next",
                            )
                        }
                    }
                }
            }
        }
    }
}
