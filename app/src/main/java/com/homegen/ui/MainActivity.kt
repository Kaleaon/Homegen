package com.homegen.ui

import android.os.Bundle
import android.view.Choreographer
import android.view.SurfaceView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.filament.Engine
import com.google.android.filament.Renderer
import com.google.android.filament.Scene
import com.google.android.filament.View
import com.google.android.filament.android.DisplayHelper
import com.google.android.filament.android.UiHelper
import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.Catalog
import com.homegen.assets.model.MaterialEntry
import com.homegen.assets.model.PlaceableEntry
import com.homegen.assets.ui.CatalogPanel
import com.homegen.designer3d.SceneController
import com.homegen.designer3d.model.Furniture
import com.homegen.designer3d.ui.SceneActionsViewModel
import com.homegen.electrical.ElectricalLayer
import com.homegen.electrical.ElectricalOverlayController
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var engine: Engine
    private lateinit var renderer: Renderer
    private lateinit var filamentScene: Scene
    private lateinit var filamentView: View
    private lateinit var sceneController: SceneController
    private lateinit var uiHelper: UiHelper
    private lateinit var displayHelper: DisplayHelper

    private val choreographer = Choreographer.getInstance()
    private val frameCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            choreographer.postFrameCallback(this)
            if (renderer.beginFrame(uiHelper.swapChain!!, frameTimeNanos)) {
                renderer.render(filamentView)
                renderer.endFrame()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        engine = Engine.create()
        renderer = engine.createRenderer()
        filamentScene = engine.createScene()
        filamentView = engine.createView().apply {
            scene = filamentScene
        }
        sceneController = SceneController(engine, filamentView, filamentScene)

        uiHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK)
        displayHelper = DisplayHelper(this)

        setContent {
            MaterialTheme {
                HomegenApp(sceneController)
            }
        }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun HomegenApp(sceneController: SceneController) {
        val scope = rememberCoroutineScope()
        val repository = remember { CatalogRepository(this@MainActivity) }
        var catalog by remember { mutableStateOf<Catalog?>(null) }
        var electricalMode by remember { mutableStateOf(false) }
        var overlayLegend by remember { mutableStateOf<String?>(null) }

        val editingContext = remember {
            AndroidEditingContext(
                onShowOverlay = { overlayLegend = "" },
                onHideOverlay = { overlayLegend = null },
                onSetLegend = { _, text -> overlayLegend = text }
            )
        }
        val electricalLayer = remember { ElectricalLayer() }
        val overlayController = remember { ElectricalOverlayController(editingContext) }
        val actionsViewModel = remember { SceneActionsViewModel(sceneController) }

        val scaffoldState = rememberBottomSheetScaffoldState(
            bottomSheetState = rememberStandardBottomSheetState(initialValue = SheetValue.Hidden, skipHiddenState = false)
        )

        // Load catalog on first composition
        androidx.compose.runtime.LaunchedEffect(Unit) {
            catalog = repository.loadCatalog()
        }

        BottomSheetScaffold(
            scaffoldState = scaffoldState,
            sheetContent = {
                catalog?.let { cat ->
                    CatalogPanel(
                        catalog = cat,
                        repository = repository,
                        onMaterialPicked = { entry: MaterialEntry ->
                            scope.launch { scaffoldState.bottomSheetState.hide() }
                        },
                        onPlaceablePicked = { entry: PlaceableEntry ->
                            sceneController.addObject(
                                Furniture(
                                    name = entry.name,
                                    catalogRef = entry.placeable.modelPath
                                )
                            )
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
                // Filament SurfaceView
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        SurfaceView(ctx).also { sv ->
                            uiHelper.renderCallback = object : UiHelper.RendererCallback {
                                override fun onNativeWindowChanged(surface: android.view.Surface) {
                                    val swapChain = engine.createSwapChain(surface)
                                    uiHelper.swapChain = swapChain
                                }
                                override fun onDetachedFromSurface() {
                                    uiHelper.swapChain?.let { engine.destroySwapChain(it) }
                                }
                                override fun onResized(width: Int, height: Int) {
                                    filamentView.viewport = com.google.android.filament.Viewport(0, 0, width, height)
                                    val aspect = width.toDouble() / height.toDouble()
                                    val camera = engine.createCamera(engine.entityManager.create())
                                    camera.setProjection(45.0, aspect, 0.1, 100.0, com.google.android.filament.Camera.Fov.VERTICAL)
                                    filamentView.camera = camera
                                }
                            }
                            uiHelper.attachTo(sv)
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

                // Bottom toolbar
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceEvenly
                    ) {
                        FilledTonalButton(onClick = { actionsViewModel.addWall() }) {
                            Text("Wall")
                        }
                        FilledTonalButton(onClick = { actionsViewModel.addFloor() }) {
                            Text("Floor")
                        }
                        FilledTonalButton(onClick = { actionsViewModel.addFurniture() }) {
                            Text("Furniture")
                        }
                        FilledTonalButton(onClick = {
                            scope.launch {
                                scaffoldState.bottomSheetState.expand()
                            }
                        }) {
                            Text("Catalog")
                        }
                        FilledTonalButton(onClick = {
                            electricalMode = !electricalMode
                            if (electricalMode) {
                                overlayController.enable(electricalLayer)
                            } else {
                                overlayController.disable()
                            }
                        }) {
                            Text(if (electricalMode) "Exit Elec" else "Electrical")
                        }
                    }

                    // Delete selected
                    FilledTonalButton(
                        onClick = { actionsViewModel.removeSelected() },
                        modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp)
                    ) {
                        Text("Delete Selected")
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        choreographer.postFrameCallback(frameCallback)
    }

    override fun onPause() {
        super.onPause()
        choreographer.removeFrameCallback(frameCallback)
    }

    override fun onDestroy() {
        super.onDestroy()
        choreographer.removeFrameCallback(frameCallback)
        uiHelper.detach()
        engine.destroyRenderer(renderer)
        engine.destroyView(filamentView)
        engine.destroyScene(filamentScene)
        engine.destroy()
    }
}
