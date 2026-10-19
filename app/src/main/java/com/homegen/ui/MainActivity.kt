package com.homegen.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.homegen.assets.data.CatalogRepository
import com.homegen.designer3d.commands.CommandStack
import com.homegen.designer3d.input.InteractionController
import com.homegen.designer3d.rendering.FilamentSurfaceManager
import com.ktheme.android.KthemeComposeTheme
import com.ktheme.android.KthemeSystemBarAdapter

class MainActivity : ComponentActivity() {

    private lateinit var surfaceManager: FilamentSurfaceManager
    private val commandStack = CommandStack()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        surfaceManager = FilamentSurfaceManager(this)

        val interactionController = InteractionController(
            sceneController = surfaceManager.sceneController,
            commandStack = commandStack,
            getCamera = { surfaceManager.getCamera() },
            getViewport = { surfaceManager.getViewport() },
        )

        val catalogRepository = CatalogRepository(this)

        setContent {
            KthemeComposeTheme {
                KthemeSystemBarAdapter()
                HomegenScreen(
                    surfaceManager = surfaceManager,
                    commandStack = commandStack,
                    interactionController = interactionController,
                    catalogRepository = catalogRepository,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        surfaceManager.resume()
    }

    override fun onPause() {
        super.onPause()
        surfaceManager.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        surfaceManager.destroy()
    }
}
