package com.homegen.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.homegen.designer3d.storage.ProjectStorage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ProjectGallery(
    projects: List<ProjectStorage.ProjectSummary>,
    onProjectSelected: (String) -> Unit,
    onProjectDeleted: (String) -> Unit,
) {
    val dateFormat = SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault())

    LazyColumn(
        modifier = Modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(projects, key = { it.name }) { project ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onProjectSelected(project.name) }
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(project.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            dateFormat.format(Date(project.lastModified)),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TextButton(onClick = { onProjectDeleted(project.name) }) {
                        Text("Delete")
                    }
                }
            }
        }
    }
}
