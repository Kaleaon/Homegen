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
import androidx.compose.ui.unit.dp

@Composable
fun FloorSelector(
    currentFloor: Int,
    onFloorUp: () -> Unit,
    onFloorDown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        IconButton(onClick = onFloorUp) {
            Text("▲")
        }
        Text(
            text = "F$currentFloor",
            modifier = Modifier
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer)
                .padding(8.dp),
            style = MaterialTheme.typography.labelMedium
        )
        IconButton(onClick = onFloorDown) {
            Text("▼")
        }
    }
}
