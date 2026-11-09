package com.homegen.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.ktheme.android.ui.KthemeBadge
import com.ktheme.android.ui.KthemeBadgeVariant
import com.ktheme.android.ui.KthemeIconButton
import com.ktheme.android.ui.KthemeText
import com.ktheme.android.ui.KthemeTextVariant

@Composable
fun FloorSelector(
    currentFloor: Int,
    onFloorUp: () -> Unit,
    onFloorDown: () -> Unit,
    modifier: Modifier = Modifier,
    minFloor: Int = 0,
    maxFloor: Int = 5,
    elevationBadge: String? = null,
    onEditProperties: (() -> Unit)? = null,
) {
    val clampedFloor = currentFloor.coerceIn(minFloor, maxFloor)
    val floorLabel = if (clampedFloor < 0) "B${-clampedFloor}" else "F$clampedFloor"

    Column(
        modifier = modifier.padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        KthemeIconButton(
            onClick = onFloorUp,
            enabled = clampedFloor < maxFloor,
            modifier = Modifier.semantics {
                contentDescription = "Navigate to floor above"
            },
        ) {
            KthemeText("▲")
        }
        KthemeBadge(
            text = floorLabel,
            variant = KthemeBadgeVariant.Brand,
            shape = CircleShape,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(2.dp),
        )
        if (elevationBadge != null) {
            KthemeText(
                text = elevationBadge,
                style = MaterialTheme.typography.labelSmall,
                variant = KthemeTextVariant.Secondary,
            )
        }
        KthemeIconButton(
            onClick = onFloorDown,
            enabled = clampedFloor > minFloor,
            modifier = Modifier.semantics {
                contentDescription = "Navigate to floor below"
            },
        ) {
            KthemeText("▼")
        }
        if (onEditProperties != null) {
            KthemeIconButton(
                onClick = onEditProperties,
                modifier = Modifier.semantics {
                    contentDescription = "Edit floor properties"
                },
            ) {
                KthemeText("⚙")
            }
        }
    }
}
