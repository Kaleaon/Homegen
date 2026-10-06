package com.homegen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

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
        IconButton(
            onClick = onFloorUp,
            enabled = clampedFloor < maxFloor,
            modifier = Modifier.semantics {
                contentDescription = "Navigate to floor above"
            },
        ) {
            Text("▲")
        }
        Text(
            text = "F$clampedFloor",
            modifier = Modifier
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer)
                .padding(8.dp),
            style = MaterialTheme.typography.labelMedium,
        )
        IconButton(
            onClick = onFloorDown,
            enabled = clampedFloor > minFloor,
            modifier = Modifier.semantics {
                contentDescription = "Navigate to floor below"
            },
        ) {
            Text("▼")
        }
    }
}
