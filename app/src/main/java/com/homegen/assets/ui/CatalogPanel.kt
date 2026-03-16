package com.homegen.assets.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.CatalogCategory
import com.homegen.assets.model.CatalogEntry
import com.homegen.assets.model.MaterialEntry
import com.homegen.assets.model.PlaceableEntry

@Composable
fun CatalogPanel(
    catalog: Catalog,
    repository: CatalogRepository,
    activeStyleTag: String? = null,
    onMaterialPicked: (MaterialEntry) -> Unit,
    onPlaceablePicked: (PlaceableEntry) -> Unit
) {
    var search by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf(CatalogCategory.ALL) }
    var viewMode by remember { mutableIntStateOf(0) } // 0 = list, 1 = grid
    var filterByStyle by remember(activeStyleTag) { mutableStateOf(activeStyleTag != null) }

    val entries = remember(search, selectedCategory, catalog, filterByStyle, activeStyleTag) {
        val baseEntries = repository.filterEntries(catalog, search, selectedCategory)
        if (filterByStyle && activeStyleTag != null) {
            baseEntries.filter { entry ->
                entry.tags.any { it.lowercase() == activeStyleTag.lowercase() }
            }
        } else {
            baseEntries
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        // Search + view mode toggle
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                modifier = Modifier.weight(1f),
                value = search,
                onValueChange = { search = it },
                label = { Text("Search catalog") },
                singleLine = true,
            )
        }

        // Active style filter toggle
        if (activeStyleTag != null) {
            Row(
                modifier = Modifier.padding(top = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilterChip(
                    selected = filterByStyle,
                    onClick = { filterByStyle = !filterByStyle },
                    label = {
                        Text("Style: ${activeStyleTag.replaceFirstChar { it.uppercase() }}")
                    },
                )
                Text(
                    text = "${entries.size} items",
                    modifier = Modifier.padding(start = 8.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Category chips — grouped for easier browsing
        CategoryChips(
            selectedCategory = selectedCategory,
            onSelected = { selectedCategory = it }
        )

        // Items grid
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 150.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(entries, key = { it.id }) { entry ->
                CatalogGridItem(
                    entry = entry,
                    repository = repository,
                    onMaterialPicked = onMaterialPicked,
                    onPlaceablePicked = onPlaceablePicked,
                )
            }
        }
    }
}

@Composable
private fun CatalogGridItem(
    entry: CatalogEntry,
    repository: CatalogRepository,
    onMaterialPicked: (MaterialEntry) -> Unit,
    onPlaceablePicked: (PlaceableEntry) -> Unit,
) {
    var thumbnail by remember(entry.thumbnailPath) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(entry.thumbnailPath) {
        thumbnail = repository.loadThumbnail(entry.thumbnailPath)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                when (entry) {
                    is MaterialEntry -> onMaterialPicked(entry)
                    is PlaceableEntry -> onPlaceablePicked(entry)
                }
            },
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(8.dp),
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            thumbnail?.let {
                Image(
                    bitmap = it.asImageBitmap(),
                    contentDescription = entry.name,
                    modifier = Modifier.size(80.dp),
                )
            }
            Text(
                text = entry.name,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                text = entry.categoryPath,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun CategoryChips(
    selectedCategory: CatalogCategory,
    onSelected: (CatalogCategory) -> Unit
) {
    // Group categories logically
    val materialCategories = listOf(
        CatalogCategory.WALLS,
        CatalogCategory.FLOORS,
        CatalogCategory.CEILINGS,
    )
    val furnitureCategories = listOf(
        CatalogCategory.CHAIRS,
        CatalogCategory.TABLES,
        CatalogCategory.SOFAS,
        CatalogCategory.BEDS,
        CatalogCategory.STORAGE,
    )
    val roomCategories = listOf(
        CatalogCategory.KITCHEN,
        CatalogCategory.BATHROOM,
        CatalogCategory.OFFICE,
        CatalogCategory.LAUNDRY,
    )
    val otherCategories = listOf(
        CatalogCategory.DOORS,
        CatalogCategory.WINDOWS,
        CatalogCategory.LIGHTING,
        CatalogCategory.DECORATIVE,
        CatalogCategory.OUTDOOR,
        CatalogCategory.STAIRS,
    )

    val allCategories = listOf(CatalogCategory.ALL, CatalogCategory.FURNITURE) +
        materialCategories + furnitureCategories + roomCategories + otherCategories

    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(allCategories.size) { index ->
            val category = allCategories[index]
            FilterChip(
                selected = selectedCategory == category,
                onClick = { onSelected(category) },
                label = { Text(category.label) }
            )
        }
    }
}
