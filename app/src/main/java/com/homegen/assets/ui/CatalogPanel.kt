package com.homegen.assets.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.CatalogCategory
import com.homegen.assets.model.MaterialEntry
import com.homegen.assets.model.PlaceableEntry

@Composable
fun CatalogPanel(
    catalog: Catalog,
    repository: CatalogRepository,
    onMaterialPicked: (MaterialEntry) -> Unit,
    onPlaceablePicked: (PlaceableEntry) -> Unit
) {
    var search by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf(CatalogCategory.ALL) }

    val entries = remember(search, selectedCategory, catalog) {
        repository.filterEntries(catalog, search, selectedCategory)
    }

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        OutlinedTextField(
            modifier = Modifier.fillMaxWidth(),
            value = search,
            onValueChange = { search = it },
            label = { Text("Search materials or objects") }
        )

        CategoryChips(
            selectedCategory = selectedCategory,
            onSelected = { selectedCategory = it }
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(entries, key = { it.id }) { entry ->
                var thumbnail by remember(entry.thumbnailPath) { mutableStateOf<android.graphics.Bitmap?>(null) }
                LaunchedEffect(entry.thumbnailPath) {
                    thumbnail = repository.loadThumbnail(entry.thumbnailPath)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            when (entry) {
                                is MaterialEntry -> onMaterialPicked(entry)
                                is PlaceableEntry -> onPlaceablePicked(entry)
                            }
                        }
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    thumbnail?.let {
                        Image(bitmap = it.asImageBitmap(), contentDescription = entry.name)
                    }
                    Column {
                        Text(entry.name, style = MaterialTheme.typography.titleSmall)
                        Text(entry.categoryPath, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryChips(
    selectedCategory: CatalogCategory,
    onSelected: (CatalogCategory) -> Unit
) {
    val categories = listOf(
        CatalogCategory.ALL,
        CatalogCategory.WALLS,
        CatalogCategory.FLOORS,
        CatalogCategory.CEILINGS,
        CatalogCategory.FURNITURE,
        CatalogCategory.DOORS,
        CatalogCategory.WINDOWS,
        CatalogCategory.BATHROOM,
        CatalogCategory.KITCHEN,
        CatalogCategory.OUTDOOR,
        CatalogCategory.DECORATIVE,
    )
    androidx.compose.foundation.lazy.LazyRow(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(categories.size) { index ->
            val category = categories[index]
            FilterChip(
                selected = selectedCategory == category,
                onClick = { onSelected(category) },
                label = { Text(category.name.lowercase().replaceFirstChar { it.uppercase() }) }
            )
        }
    }
}
