package com.homegen.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.homegen.assets.data.AssetSources

/**
 * Browsable list of free asset sources from "The People's Design Library".
 * Tapping a source opens its website in the browser.
 */
@Composable
fun AssetSourceBrowser(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var selectedCategory by remember { mutableStateOf<AssetSources.SourceCategory?>(null) }

    val sources = remember(selectedCategory) {
        val all = AssetSources.allSources
        if (selectedCategory == null) all
        else all.filter { it.category == selectedCategory }
    }.sortedByDescending { it.topRated }

    Column(modifier = modifier.padding(12.dp)) {
        Text(
            "Free Asset Sources",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        // Category filter chips
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            FilterChip(
                selected = selectedCategory == null,
                onClick = { selectedCategory = null },
                label = { Text("All") },
            )
            FilterChip(
                selected = selectedCategory == AssetSources.SourceCategory.MODELS_3D,
                onClick = { selectedCategory = AssetSources.SourceCategory.MODELS_3D },
                label = { Text("3D Models") },
            )
            FilterChip(
                selected = selectedCategory == AssetSources.SourceCategory.TEXTURES_PBR,
                onClick = { selectedCategory = AssetSources.SourceCategory.TEXTURES_PBR },
                label = { Text("Textures") },
            )
            FilterChip(
                selected = selectedCategory == AssetSources.SourceCategory.HDRI,
                onClick = { selectedCategory = AssetSources.SourceCategory.HDRI },
                label = { Text("HDRI") },
            )
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(sources, key = { it.name }) { source ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse(source.url))
                            )
                        }
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = source.name + if (source.topRated) " *" else "",
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text(
                                text = source.formats.joinToString(", "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            text = source.description,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            }
        }
    }
}
