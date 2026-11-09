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

@Composable
fun FloorSelector(
    currentFloor: Int,
    onFloorUp: () -> Unit,
    onFloorDown: () -> Unit,
    modifier: Modifier = Modifier,
    minFloor: Int = 0,
    maxFloor: Int = 5,
) {
    val clampedFloor = currentFloor.coerceIn(minFloor, maxFloor)

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
            text = "F$clampedFloor",
            variant = KthemeBadgeVariant.Brand,
            shape = CircleShape,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(2.dp),
        )
        KthemeIconButton(
            onClick = onFloorDown,
            enabled = clampedFloor > minFloor,
            modifier = Modifier.semantics {
                contentDescription = "Navigate to floor below"
            },
        ) {
            KthemeText("▼")
        }
    }
}
