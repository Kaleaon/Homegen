package com.homegen.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import com.ktheme.android.KthemeComposeTheme
import com.ktheme.android.KthemeLayout

data class NavigationToolItem(
    val id: String,
    val label: String,
    val isActive: Boolean = false,
    val onClick: () -> Unit,
)

/**
 * Adaptive navigation scaffold that dynamically switches between NavigationRail and NavigationBar
 * based on the Ktheme 720dp logical unit adaptive breakpoint contract.
 */
@Composable
fun AdaptiveNavigationLayout(
    items: List<NavigationToolItem>,
    modifier: Modifier = Modifier,
    layout: KthemeLayout = KthemeComposeTheme.layout,
    content: @Composable () -> Unit,
) {
    val configuration = LocalConfiguration.current
    val isWide = configuration.screenWidthDp >= layout.adaptiveWidthDp
    val controlShape = RoundedCornerShape(layout.cornerControlDp.dp)

    if (isWide) {
        Row(modifier = modifier.fillMaxSize()) {
            NavigationRail(
                modifier = Modifier
                    .defaultMinSize(minWidth = 72.dp)
                    .clip(controlShape),
            ) {
                items.forEach { item ->
                    NavigationRailItem(
                        selected = item.isActive,
                        onClick = item.onClick,
                        icon = { Text(item.label.take(1)) },
                        label = { Text(item.label) },
                        modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                    )
                }
            }
            Box(modifier = Modifier.weight(1f)) {
                content()
            }
        }
    } else {
        Box(modifier = modifier.fillMaxSize()) {
            Box(modifier = Modifier.fillMaxSize()) {
                content()
            }
            NavigationBar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .defaultMinSize(minHeight = 56.dp),
            ) {
                items.forEach { item ->
                    NavigationBarItem(
                        selected = item.isActive,
                        onClick = item.onClick,
                        icon = { Text(item.label.take(1)) },
                        label = { Text(item.label) },
                        modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                    )
                }
            }
        }
    }
}
