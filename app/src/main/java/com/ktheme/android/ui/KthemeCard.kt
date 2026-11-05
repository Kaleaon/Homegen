package com.ktheme.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardColors
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CardElevation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.ktheme.android.KthemeComposeTheme

/**
 * Card primitive configured with Ktheme layout corners, shadows, borders, and surface colors.
 */
@Composable
fun KthemeCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(KthemeComposeTheme.layout.cornerPanelDp.dp),
    colors: CardColors = CardDefaults.cardColors(
        containerColor = KthemeComposeTheme.colors.cardBackground,
        contentColor = KthemeComposeTheme.colors.onCardBackground,
    ),
    elevation: CardElevation = CardDefaults.cardElevation(
        defaultElevation = if (KthemeComposeTheme.layout.shadow == "none") 0.dp else 2.dp,
    ),
    border: BorderStroke? = if (KthemeComposeTheme.layout.surfaces == "box") {
        BorderStroke(1.dp, KthemeComposeTheme.colors.border)
    } else {
        null
    },
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier,
        shape = shape,
        colors = colors,
        elevation = elevation,
        border = border,
        content = content,
    )
}

/**
 * Clickable card primitive configured with Ktheme layout corners, shadows, borders, and surface colors.
 */
@Composable
fun KthemeCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    shape: Shape = RoundedCornerShape(KthemeComposeTheme.layout.cornerPanelDp.dp),
    colors: CardColors = CardDefaults.cardColors(
        containerColor = KthemeComposeTheme.colors.cardBackground,
        contentColor = KthemeComposeTheme.colors.onCardBackground,
    ),
    elevation: CardElevation = CardDefaults.cardElevation(
        defaultElevation = if (KthemeComposeTheme.layout.shadow == "none") 0.dp else 2.dp,
    ),
    border: BorderStroke? = if (KthemeComposeTheme.layout.surfaces == "box") {
        BorderStroke(1.dp, KthemeComposeTheme.colors.border)
    } else {
        null
    },
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        shape = shape,
        colors = colors,
        elevation = elevation,
        border = border,
        interactionSource = interactionSource,
        content = content,
    )
}
