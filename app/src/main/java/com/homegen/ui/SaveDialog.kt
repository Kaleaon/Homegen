package com.homegen.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ktheme.android.ui.KthemeDialog
import com.ktheme.android.ui.KthemeText

@Composable
fun SaveDialog(
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var projectName by remember { mutableStateOf("") }

    KthemeDialog(
        onDismissRequest = onDismiss,
        title = { KthemeText("Save Project") },
        text = {
            Column {
                KthemeText("Enter a name for your project:")
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = projectName,
                    onValueChange = { projectName = it },
                    label = { KthemeText("Project name") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (projectName.isNotBlank()) onSave(projectName.trim()) },
                enabled = projectName.isNotBlank(),
            ) {
                KthemeText("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                KthemeText("Cancel")
            }
        },
    )
}
