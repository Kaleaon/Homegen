package com.homegen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.MaterialEntry
import com.homegen.assets.model.PlaceableEntry
import com.homegen.assets.ui.CatalogPanel
import com.homegen.designer3d.commands.CommandStack
import com.homegen.designer3d.input.GestureHandler
import com.homegen.designer3d.input.InteractionController
import com.homegen.designer3d.input.InteractionMode
import com.homegen.designer3d.rendering.FilamentSurfaceManager
import com.homegen.electrical.ElectricalLayer
import com.homegen.electrical.ElectricalOverlayController
import com.homegen.styles.model.DesignStyle
import com.homegen.styles.ui.DesignStyleBrowser
import com.homegen.templates.model.RoomTemplate
import com.homegen.templates.ui.RoomTemplatePanel
import kotlinx.coroutines.launch

/**
 * Represents which full-screen overlay is currently shown.
 */
private enum class OverlayScreen {
    NONE,
    STYLE_BROWSER,
    ROOM_TEMPLATES,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomegenScreen(
    surfaceManager: FilamentSurfaceManager,
    commandStack: CommandStack,
    interactionController: InteractionController,
    catalogRepository: CatalogRepository,
) {
    val scope = rememberCoroutineScope()
    var catalog by remember { mutableStateOf<Catalog?>(null) }
    var electricalMode by remember { mutableStateOf(false) }
    var overlayLegend by remember { mutableStateOf<String?>(null) }
    var currentMode by remember { mutableStateOf<InteractionMode>(InteractionMode.Select) }
    var currentFloor by remember { mutableIntStateOf(0) }
    var overlayScreen by remember { mutableStateOf(OverlayScreen.NONE) }
    var activeStyle by remember { mutableStateOf<DesignStyle?>(null) }

    val canUndo by commandStack.canUndo.collectAsState()
    val canRedo by commandStack.canRedo.collectAsState()

    val editingContext = remember {
        AndroidEditingContext(
            onShowOverlay = { overlayLegend = "" },
            onHideOverlay = { overlayLegend = null },
            onSetLegend = { _, text -> overlayLegend = text }
        )
    }
    val electricalLayer = remember { ElectricalLayer() }
    val overlayController = remember { ElectricalOverlayController(editingContext) }

    val scaffoldState = rememberBottomSheetScaffoldState(
        bottomSheetState = rememberStandardBottomSheetState(
            initialValue = SheetValue.Hidden,
            skipHiddenState = false
        )
    )

    LaunchedEffect(Unit) {
        catalog = catalogRepository.loadCatalog()
    }

    // Full-screen overlays (Design Styles, Room Templates)
    when (overlayScreen) {
        OverlayScreen.STYLE_BROWSER -> {
            DesignStyleBrowser(
                onStyleSelected = { style ->
                    activeStyle = style
                    overlayScreen = OverlayScreen.NONE
                },
                onDismiss = { overlayScreen = OverlayScreen.NONE },
            )
            return
        }
        OverlayScreen.ROOM_TEMPLATES -> {
            RoomTemplatePanel(
                onTemplateSelected = { template ->
                    // Template selected - would create room with placements
                    overlayScreen = OverlayScreen.NONE
                },
                onDismiss = { overlayScreen = OverlayScreen.NONE },
            )
            return
        }
        OverlayScreen.NONE -> { /* Show main editor below */ }
    }

    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetContent = {
            catalog?.let { cat ->
                CatalogPanel(
                    catalog = cat,
                    repository = catalogRepository,
                    activeStyleTag = activeStyle?.id,
                    onMaterialPicked = { entry: MaterialEntry ->
                        interactionController.mode = InteractionMode.Paint(
                            materialRef = entry.material.texturePath
                        )
                        currentMode = interactionController.mode
                        scope.launch { scaffoldState.bottomSheetState.hide() }
                    },
                    onPlaceablePicked = { entry: PlaceableEntry ->
                        interactionController.mode = InteractionMode.FurnitureDrag(
                            catalogRef = entry.placeable.modelPath,
                            name = entry.name
                        )
                        currentMode = interactionController.mode
                        scope.launch { scaffoldState.bottomSheetState.hide() }
                    }
                )
            } ?: Text("Loading catalog...", modifier = Modifier.padding(16.dp))
        },
        sheetPeekHeight = 0.dp
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Filament SurfaceView with gesture handler
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    surfaceManager.createSurfaceView(ctx).also { sv ->
                        sv.setOnTouchListener(GestureHandler(interactionController))
                    }
                }
            )

            // Overlay legend
            overlayLegend?.let { legend ->
                if (legend.isNotEmpty()) {
                    Text(
                        text = legend,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }

            // Active mode indicator
            if (currentMode !is InteractionMode.Select) {
                val modeName = when (currentMode) {
                    is InteractionMode.WallDraw -> "Wall Draw"
                    is InteractionMode.RoomDraw -> "Room Draw"
                    is InteractionMode.FurnitureDrag -> "Place Furniture"
                    is InteractionMode.Paint -> "Paint"
                    else -> ""
                }
                Text(
                    text = modeName,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 12.dp)
                        .background(
                            MaterialTheme.colorScheme.primaryContainer,
                            shape = MaterialTheme.shapes.small
                        )
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    style = MaterialTheme.typography.labelMedium
                )
            }

            // Active style indicator
            activeStyle?.let { style ->
                Text(
                    text = "Style: ${style.name}",
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 12.dp, top = 40.dp)
                        .background(
                            MaterialTheme.colorScheme.tertiaryContainer,
                            shape = MaterialTheme.shapes.small
                        )
                        .padding(horizontal = 10.dp, vertical = 3.dp),
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    style = MaterialTheme.typography.labelSmall,
                )
            }

            // Top-right: Undo/Redo
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                IconButton(
                    onClick = { commandStack.undo() },
                    enabled = canUndo
                ) {
                    Text("↩", style = MaterialTheme.typography.titleLarge)
                }
                IconButton(
                    onClick = { commandStack.redo() },
                    enabled = canRedo
                ) {
                    Text("↪", style = MaterialTheme.typography.titleLarge)
                }
            }

            // Right side: Floor selector
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                IconButton(onClick = {
                    currentFloor++
                    surfaceManager.sceneController.setFloorLevel(currentFloor)
                }) {
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
                IconButton(onClick = {
                    if (currentFloor > 0) {
                        currentFloor--
                        surfaceManager.sceneController.setFloorLevel(currentFloor)
                    }
                }) {
                    Text("▼")
                }
            }

            // Bottom toolbar
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(8.dp)
            ) {
                // Primary tools row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    ToolButton("Select", currentMode is InteractionMode.Select) {
                        interactionController.mode = InteractionMode.Select
                        currentMode = InteractionMode.Select
                    }
                    ToolButton("Wall", currentMode is InteractionMode.WallDraw) {
                        interactionController.mode = InteractionMode.WallDraw
                        currentMode = InteractionMode.WallDraw
                    }
                    ToolButton("Room", currentMode is InteractionMode.RoomDraw) {
                        interactionController.mode = InteractionMode.RoomDraw
                        currentMode = InteractionMode.RoomDraw
                    }
                    ToolButton("Catalog") {
                        scope.launch { scaffoldState.bottomSheetState.expand() }
                    }
                    ToolButton("Electrical", electricalMode) {
                        electricalMode = !electricalMode
                        if (electricalMode) {
                            overlayController.enable(electricalLayer)
                        } else {
                            overlayController.disable()
                        }
                    }
                }

                // Secondary tools row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    ToolButton("Styles") {
                        overlayScreen = OverlayScreen.STYLE_BROWSER
                    }
                    ToolButton("Templates") {
                        overlayScreen = OverlayScreen.ROOM_TEMPLATES
                    }
                    FilledTonalButton(onClick = {
                        val selectedId = surfaceManager.sceneController.selectedObjectId
                        if (selectedId != null) {
                            surfaceManager.sceneController.removeObject(selectedId)
                        }
                    }) {
                        Text("Delete")
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolButton(
    label: String,
    isActive: Boolean = false,
    onClick: () -> Unit,
) {
    FilledTonalButton(
        onClick = onClick,
        colors = if (isActive) {
            androidx.compose.material3.ButtonDefaults.filledTonalButtonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            androidx.compose.material3.ButtonDefaults.filledTonalButtonColors()
        }
    ) {
        Text(label)
    }
}
