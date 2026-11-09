package com.ktheme.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonColors
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.ktheme.android.KthemeComposeTheme

enum class KthemeButtonVariant {
    Brand,
    Tonal,
    Outline,
}

/**
 * Icon button primitive bound to Ktheme semantic colors.
 */
@Composable
fun KthemeIconButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    colors: IconButtonColors = IconButtonDefaults.iconButtonColors(
        contentColor = KthemeComposeTheme.colors.brand,
        disabledContentColor = KthemeComposeTheme.colors.borderSubtle,
    ),
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
    content: @Composable () -> Unit,
) {
    IconButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = colors,
        interactionSource = interactionSource,
        content = content,
    )
}

/**
 * Button primitive supporting brand, tonal, and outline variants adhering to Ktheme layout corners.
 */
@Composable
fun KthemeButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    variant: KthemeButtonVariant = KthemeButtonVariant.Brand,
    shape: Shape = RoundedCornerShape(KthemeComposeTheme.layout.cornerControlDp.dp),
    colors: ButtonColors? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val kthemeColors = KthemeComposeTheme.colors

    when (variant) {
        KthemeButtonVariant.Brand -> {
            val resolvedColors = colors ?: ButtonDefaults.buttonColors(
                containerColor = kthemeColors.brand,
                contentColor = kthemeColors.onBrand,
            )
            Button(
                onClick = onClick,
                modifier = modifier,
                enabled = enabled,
                shape = shape,
                colors = resolvedColors,
                content = content,
            )
        }
        KthemeButtonVariant.Tonal -> {
            val resolvedColors = colors ?: ButtonDefaults.filledTonalButtonColors(
                containerColor = kthemeColors.cardBackgroundAlt,
                contentColor = kthemeColors.onCardBackgroundAlt,
            )
            FilledTonalButton(
                onClick = onClick,
                modifier = modifier,
                enabled = enabled,
                shape = shape,
                colors = resolvedColors,
                content = content,
            )
        }
        KthemeButtonVariant.Outline -> {
            val resolvedColors = colors ?: ButtonDefaults.outlinedButtonColors(
                contentColor = kthemeColors.brand,
            )
            OutlinedButton(
                onClick = onClick,
                modifier = modifier,
                enabled = enabled,
                shape = shape,
                colors = resolvedColors,
                border = BorderStroke(1.dp, kthemeColors.border),
                content = content,
            )
        }
    }
}
