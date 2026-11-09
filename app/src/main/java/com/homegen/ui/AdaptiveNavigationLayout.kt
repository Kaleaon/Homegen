package com.homegen.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import com.ktheme.android.KthemeComposeTheme
import com.ktheme.android.KthemeLayout
import com.ktheme.android.ui.KthemeNavigationBar
import com.ktheme.android.ui.KthemeNavigationBarItem
import com.ktheme.android.ui.KthemeNavigationRail
import com.ktheme.android.ui.KthemeNavigationRailItem
import com.ktheme.android.ui.KthemeText

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
            KthemeNavigationRail(
                modifier = Modifier
                    .defaultMinSize(minWidth = 72.dp)
                    .clip(controlShape),
            ) {
                items.forEach { item ->
                    KthemeNavigationRailItem(
                        selected = item.isActive,
                        onClick = item.onClick,
                        icon = { KthemeText(item.label.take(1)) },
                        label = { KthemeText(item.label) },
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
            KthemeNavigationBar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .defaultMinSize(minHeight = 56.dp),
            ) {
                items.forEach { item ->
                    KthemeNavigationBarItem(
                        selected = item.isActive,
                        onClick = item.onClick,
                        icon = { KthemeText(item.label.take(1)) },
                        label = { KthemeText(item.label) },
                        modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                    )
                }
            }
        }
    }
}
