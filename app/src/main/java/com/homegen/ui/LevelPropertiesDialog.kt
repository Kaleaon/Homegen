package com.homegen.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

data class LevelProperties(
    val name: String,
    val elevationInches: Double,
    val storyHeightInches: Double,
    val slabThicknessInches: Double = 10.0,
    val ceilingHeightInches: Double = 96.0,
    val isSubterranean: Boolean = false,
)

@Composable
fun LevelPropertiesDialog(
    initialProperties: LevelProperties,
    onConfirm: (LevelProperties) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var name by remember { mutableStateOf(initialProperties.name) }
    var elevationText by remember { mutableStateOf(initialProperties.elevationInches.toString()) }
    var storyHeightText by remember { mutableStateOf(initialProperties.storyHeightInches.toString()) }
    var slabThicknessText by remember { mutableStateOf(initialProperties.slabThicknessInches.toString()) }
    var ceilingHeightText by remember { mutableStateOf(initialProperties.ceilingHeightInches.toString()) }
    var isSubterranean by remember { mutableStateOf(initialProperties.isSubterranean) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Level Properties") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Level Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = elevationText,
                    onValueChange = { elevationText = it },
                    label = { Text("Elevation Offset (in)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = storyHeightText,
                    onValueChange = { storyHeightText = it },
                    label = { Text("Story Height (in)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = slabThicknessText,
                    onValueChange = { slabThicknessText = it },
                    label = { Text("Slab Thickness (in)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Checkbox(
                        checked = isSubterranean,
                        onCheckedChange = { isSubterranean = it },
                    )
                    Text(
                        text = "Subterranean (Basement)",
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val elev = elevationText.toDoubleOrNull() ?: initialProperties.elevationInches
                    val storyH = storyHeightText.toDoubleOrNull() ?: initialProperties.storyHeightInches
                    val slabT = slabThicknessText.toDoubleOrNull() ?: initialProperties.slabThicknessInches
                    val ceilH = ceilingHeightText.toDoubleOrNull() ?: initialProperties.ceilingHeightInches
                    onConfirm(
                        LevelProperties(
                            name = name,
                            elevationInches = elev,
                            storyHeightInches = storyH,
                            slabThicknessInches = slabT,
                            ceilingHeightInches = ceilH,
                            isSubterranean = isSubterranean,
                        ),
                    )
                },
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
        modifier = modifier,
    )
}
