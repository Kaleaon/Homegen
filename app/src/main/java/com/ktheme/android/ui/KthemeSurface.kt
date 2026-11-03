package com.ktheme.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ktheme.android.KthemeComposeTheme

/**
 * Surface primitive adhering to Ktheme layout corner radius and semantic surface colors.
 */
@Composable
fun KthemeSurface(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(KthemeComposeTheme.layout.cornerPanelDp.dp),
    color: Color = KthemeComposeTheme.colors.cardBackground,
    contentColor: Color = KthemeComposeTheme.colors.onCardBackground,
    tonalElevation: Dp = 0.dp,
    shadowElevation: Dp = 0.dp,
    border: BorderStroke? = null,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = shape,
        color = color,
        contentColor = contentColor,
        tonalElevation = tonalElevation,
        shadowElevation = shadowElevation,
        border = border,
        content = content,
    )
}
