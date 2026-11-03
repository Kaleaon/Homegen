package com.ktheme.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.ktheme.android.KthemeComposeTheme

enum class KthemeBadgeVariant {
    Brand,
    Highlight,
    Accent,
    Danger,
    Neutral,
}

/**
 * Badge primitive providing styled indicators and pill tags bound to Ktheme tokens.
 */
@Composable
fun KthemeBadge(
    modifier: Modifier = Modifier,
    variant: KthemeBadgeVariant = KthemeBadgeVariant.Brand,
    containerColor: Color = Color.Unspecified,
    contentColor: Color = Color.Unspecified,
    shape: Shape = RoundedCornerShape(KthemeComposeTheme.layout.cornerControlDp.dp),
    content: @Composable RowScope.() -> Unit,
) {
    val colors = KthemeComposeTheme.colors

    val resolvedContainerColor = if (containerColor != Color.Unspecified) {
        containerColor
    } else {
        when (variant) {
            KthemeBadgeVariant.Brand -> colors.brand
            KthemeBadgeVariant.Highlight -> colors.highlight
            KthemeBadgeVariant.Accent -> colors.accent
            KthemeBadgeVariant.Danger -> colors.dangerContainer
            KthemeBadgeVariant.Neutral -> colors.cardBackgroundAlt
        }
    }

    val resolvedContentColor = if (contentColor != Color.Unspecified) {
        contentColor
    } else {
        when (variant) {
            KthemeBadgeVariant.Brand -> colors.onBrand
            KthemeBadgeVariant.Highlight -> colors.onHighlight
            KthemeBadgeVariant.Accent -> colors.onAccent
            KthemeBadgeVariant.Danger -> colors.onDangerContainer
            KthemeBadgeVariant.Neutral -> colors.onCardBackgroundAlt
        }
    }

    Surface(
        modifier = modifier,
        shape = shape,
        color = resolvedContainerColor,
        contentColor = resolvedContentColor,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

/**
 * Convenience text badge overload.
 */
@Composable
fun KthemeBadge(
    text: String,
    modifier: Modifier = Modifier,
    variant: KthemeBadgeVariant = KthemeBadgeVariant.Brand,
    containerColor: Color = Color.Unspecified,
    contentColor: Color = Color.Unspecified,
    shape: Shape = RoundedCornerShape(KthemeComposeTheme.layout.cornerControlDp.dp),
    style: TextStyle = MaterialTheme.typography.labelMedium,
) {
    val colors = KthemeComposeTheme.colors

    val resolvedContentColor = if (contentColor != Color.Unspecified) {
        contentColor
    } else {
        when (variant) {
            KthemeBadgeVariant.Brand -> colors.onBrand
            KthemeBadgeVariant.Highlight -> colors.onHighlight
            KthemeBadgeVariant.Accent -> colors.onAccent
            KthemeBadgeVariant.Danger -> colors.onDangerContainer
            KthemeBadgeVariant.Neutral -> colors.onCardBackgroundAlt
        }
    }

    KthemeBadge(
        modifier = modifier,
        variant = variant,
        containerColor = containerColor,
        contentColor = resolvedContentColor,
        shape = shape,
    ) {
        KthemeText(
            text = text,
            style = style,
            color = resolvedContentColor,
        )
    }
}
