package com.homegen.templates.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.homegen.templates.data.RoomTemplateRepository
import com.homegen.templates.model.RoomTemplate
import com.homegen.templates.model.RoomType

/**
 * Browsable panel for selecting pre-designed room templates.
 * Each template shows the room type, style, dimensions, and furniture count.
 */
@Composable
fun RoomTemplatePanel(
    onTemplateSelected: (RoomTemplate) -> Unit,
    onDismiss: () -> Unit,
) {
    var selectedType by remember { mutableStateOf<RoomType?>(null) }

    val templates = remember(selectedType) {
        if (selectedType != null) {
            RoomTemplateRepository.filterByType(selectedType!!)
        } else {
            RoomTemplateRepository.allTemplates()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Room Templates", style = MaterialTheme.typography.headlineSmall)
            Text(
                text = "Close",
                modifier = Modifier
                    .clickable { onDismiss() }
                    .padding(8.dp),
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
        }

        // Room type filter chips
        LazyRow(
            modifier = Modifier.padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                FilterChip(
                    selected = selectedType == null,
                    onClick = { selectedType = null },
                    label = { Text("All") },
                )
            }
            items(RoomType.entries.size) { index ->
                val type = RoomType.entries[index]
                FilterChip(
                    selected = selectedType == type,
                    onClick = { selectedType = type },
                    label = {
                        Text(
                            type.name.lowercase()
                                .replace('_', ' ')
                                .replaceFirstChar { it.uppercase() }
                        )
                    },
                )
            }
        }

        // Templates list
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(templates, key = { it.id }) { template ->
                RoomTemplateCard(template = template, onClick = { onTemplateSelected(template) })
            }
        }
    }
}

@Composable
private fun RoomTemplateCard(
    template: RoomTemplate,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(template.name, style = MaterialTheme.typography.titleMedium)

            Text(
                text = template.description,
                modifier = Modifier.padding(top = 4.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                // Room type badge
                Text(
                    text = template.roomType.name.lowercase()
                        .replace('_', ' ')
                        .replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )

                // Dimensions
                Text(
                    text = "${template.widthMeters}m x ${template.depthMeters}m",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                // Furniture count
                Text(
                    text = "${template.placements.size} items",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
