package com.homegen.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SaveDialog(
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var projectName by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Save Project") },
        text = {
            Column {
                Text("Enter a name for your project:")
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = projectName,
                    onValueChange = { projectName = it },
                    label = { Text("Project name") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (projectName.isNotBlank()) onSave(projectName.trim()) },
                enabled = projectName.isNotBlank()
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
