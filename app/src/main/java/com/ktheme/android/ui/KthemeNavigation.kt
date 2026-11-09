package com.ktheme.android.ui

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemColors
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailDefaults
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemColors
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import com.ktheme.android.KthemeComposeTheme

/**
 * NavigationRail primitive adhering to Ktheme surface colors.
 */
@Composable
fun KthemeNavigationRail(
    modifier: Modifier = Modifier,
    containerColor: Color = KthemeComposeTheme.colors.cardBackground,
    contentColor: Color = KthemeComposeTheme.colors.onCardBackground,
    header: (@Composable ColumnScope.() -> Unit)? = null,
    windowInsets: WindowInsets = NavigationRailDefaults.windowInsets,
    content: @Composable ColumnScope.() -> Unit,
) {
    NavigationRail(
        modifier = modifier,
        containerColor = containerColor,
        contentColor = contentColor,
        header = header,
        windowInsets = windowInsets,
        content = content,
    )
}

/**
 * NavigationRail item primitive pre-wired to Ktheme brand and semantic accent colors.
 */
@Composable
fun KthemeNavigationRailItem(
    selected: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    label: (@Composable () -> Unit)? = null,
    alwaysShowLabel: Boolean = true,
    colors: NavigationRailItemColors = NavigationRailItemDefaults.colors(
        selectedIconColor = KthemeComposeTheme.colors.onBrand,
        selectedTextColor = KthemeComposeTheme.colors.brand,
        indicatorColor = KthemeComposeTheme.colors.brand,
        unselectedIconColor = KthemeComposeTheme.colors.onCardBackgroundAlt,
        unselectedTextColor = KthemeComposeTheme.colors.onCardBackgroundAlt,
    ),
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
) {
    NavigationRailItem(
        selected = selected,
        onClick = onClick,
        icon = icon,
        modifier = modifier,
        enabled = enabled,
        label = label,
        alwaysShowLabel = alwaysShowLabel,
        colors = colors,
        interactionSource = interactionSource,
    )
}

/**
 * NavigationBar primitive adhering to Ktheme surface colors.
 */
@Composable
fun KthemeNavigationBar(
    modifier: Modifier = Modifier,
    containerColor: Color = KthemeComposeTheme.colors.cardBackground,
    contentColor: Color = KthemeComposeTheme.colors.onCardBackground,
    tonalElevation: Dp = NavigationBarDefaults.Elevation,
    windowInsets: WindowInsets = NavigationBarDefaults.windowInsets,
    content: @Composable RowScope.() -> Unit,
) {
    NavigationBar(
        modifier = modifier,
        containerColor = containerColor,
        contentColor = contentColor,
        tonalElevation = tonalElevation,
        windowInsets = windowInsets,
        content = content,
    )
}

/**
 * NavigationBar item primitive pre-wired to Ktheme brand and semantic accent colors.
 */
@Composable
fun RowScope.KthemeNavigationBarItem(
    selected: Boolean,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    label: (@Composable () -> Unit)? = null,
    alwaysShowLabel: Boolean = true,
    colors: NavigationBarItemColors = NavigationBarItemDefaults.colors(
        selectedIconColor = KthemeComposeTheme.colors.onBrand,
        selectedTextColor = KthemeComposeTheme.colors.brand,
        indicatorColor = KthemeComposeTheme.colors.brand,
        unselectedIconColor = KthemeComposeTheme.colors.onCardBackgroundAlt,
        unselectedTextColor = KthemeComposeTheme.colors.onCardBackgroundAlt,
    ),
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
) {
    NavigationBarItem(
        selected = selected,
        onClick = onClick,
        icon = icon,
        modifier = modifier,
        enabled = enabled,
        label = label,
        alwaysShowLabel = alwaysShowLabel,
        colors = colors,
        interactionSource = interactionSource,
    )
}
