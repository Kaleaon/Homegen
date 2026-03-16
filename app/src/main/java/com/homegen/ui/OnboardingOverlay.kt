package com.homegen.ui

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val tooltips = listOf(
    "Tap the scene to select objects",
    "Drag with one finger to move selected objects",
    "Pinch with two fingers to zoom in and out",
    "Use Wall or Room mode to draw walls",
    "Open the Catalog to browse furniture and materials",
    "Use Undo/Redo at the top right to fix mistakes",
)

@Composable
fun OnboardingOverlay(
    context: Context,
    onDismiss: () -> Unit,
) {
    val prefs = remember { context.getSharedPreferences("homegen_prefs", Context.MODE_PRIVATE) }
    val hasSeenOnboarding = remember { prefs.getBoolean("onboarding_complete", false) }

    if (hasSeenOnboarding) return

    var currentStep by remember { mutableIntStateOf(0) }

    AnimatedVisibility(
        visible = currentStep < tooltips.size,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f))
                .clickable {
                    currentStep++
                    if (currentStep >= tooltips.size) {
                        prefs.edit().putBoolean("onboarding_complete", true).apply()
                        onDismiss()
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .padding(32.dp)
                    .background(
                        MaterialTheme.colorScheme.surface,
                        shape = MaterialTheme.shapes.large,
                    )
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = tooltips[currentStep],
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = "Tap anywhere to continue (${currentStep + 1}/${tooltips.size})",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
