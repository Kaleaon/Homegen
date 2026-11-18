package com.homegen.ui

import android.content.Context
import android.view.SurfaceView
import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import com.homegen.assets.data.CatalogRepository
import com.homegen.assets.model.Catalog
import com.homegen.designer3d.SceneController
import com.homegen.designer3d.commands.CommandStack
import com.homegen.designer3d.input.InteractionController
import com.homegen.designer3d.rendering.FilamentSurfaceManager
import com.ktheme.android.KthemeComposeTheme
import com.ktheme.android.KthemeDefaultTheme
import com.ktheme.android.toMaterial3ColorScheme
import com.ktheme.models.Theme
import com.ktheme.models.ThemeMetadata
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.clearInvocations
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import com.ktheme.models.ColorScheme as KthemeColorScheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HomegenScreenThemeBridgeTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `HomegenScreen propagates KthemeComposeTheme colorScheme changes to FilamentSurfaceManager`() {
        val surfaceManager = mock<FilamentSurfaceManager>()
        val sceneController = mock<SceneController>()
        val catalogRepository = mock<CatalogRepository>()
        val commandStack = CommandStack()

        whenever(surfaceManager.sceneController).thenReturn(sceneController)
        whenever(surfaceManager.createSurfaceView(any())).thenAnswer { invocation ->
            val ctx = invocation.getArgument<Context>(0)
            SurfaceView(ctx)
        }
        runBlocking {
            whenever(catalogRepository.loadCatalog()).thenReturn(
                Catalog(version = 3, materials = emptyList(), placeableObjects = emptyList()),
            )
        }

        val interactionController = InteractionController(
            sceneController = sceneController,
            commandStack = commandStack,
            getCamera = { null },
            getViewport = { 800 to 600 },
        )

        val alternateTheme = Theme(
            metadata = ThemeMetadata(
                id = "solarpunk-civic",
                name = "Solarpunk Civic",
                description = "Warm sunlit civic palette",
                author = "Ktheme",
                version = "1.0.0",
                tags = listOf("light", "nature"),
                createdAt = "2026-01-01T00:00:00Z",
                updatedAt = "2026-01-01T00:00:00Z",
            ),
            darkMode = false,
            colorScheme = KthemeColorScheme(
                primary = "#2E7D32",
                onPrimary = "#FFFFFF",
                primaryContainer = "#A5D6A7",
                onPrimaryContainer = "#0B2E0E",
                secondary = "#558B2F",
                onSecondary = "#FFFFFF",
                secondaryContainer = "#DCEDC8",
                onSecondaryContainer = "#1B3309",
                tertiary = "#C68400",
                onTertiary = "#FFFFFF",
                tertiaryContainer = "#FFE082",
                onTertiaryContainer = "#3A2500",
                error = "#C62828",
                onError = "#FFFFFF",
                errorContainer = "#FFCDD2",
                onErrorContainer = "#4A0000",
                background = "#F4F7EE",
                onBackground = "#1B2418",
                surface = "#E9EFE0",
                onSurface = "#1B2418",
                surfaceVariant = "#D7E2C9",
                onSurfaceVariant = "#3E4A38",
                outline = "#6E7B67",
                outlineVariant = "#B8C5AF",
                scrim = "#66000000",
                inverseSurface = "#293326",
                inverseOnSurface = "#ECF3E6",
                inversePrimary = "#81C784",
            ),
        )

        var activeTheme by mutableStateOf(KthemeDefaultTheme)

        composeTestRule.setContent {
            KthemeComposeTheme(theme = activeTheme) {
                HomegenScreen(
                    surfaceManager = surfaceManager,
                    commandStack = commandStack,
                    interactionController = interactionController,
                    catalogRepository = catalogRepository,
                )
            }
        }

        composeTestRule.waitForIdle()

        val initialCaptor = argumentCaptor<ColorScheme>()
        verify(surfaceManager).updateTheme(initialCaptor.capture())
        assertEquals(KthemeDefaultTheme.toMaterial3ColorScheme().surfaceVariant, initialCaptor.lastValue.surfaceVariant)
        assertEquals(KthemeDefaultTheme.toMaterial3ColorScheme().background, initialCaptor.lastValue.background)

        clearInvocations(surfaceManager)

        // Switch active Ktheme theme dynamically
        activeTheme = alternateTheme
        composeTestRule.waitForIdle()

        val updatedCaptor = argumentCaptor<ColorScheme>()
        verify(surfaceManager).updateTheme(updatedCaptor.capture())
        assertEquals(alternateTheme.toMaterial3ColorScheme().surfaceVariant, updatedCaptor.lastValue.surfaceVariant)
        assertEquals(alternateTheme.toMaterial3ColorScheme().background, updatedCaptor.lastValue.background)
        assertEquals(
            alternateTheme.toMaterial3ColorScheme().secondaryContainer,
            updatedCaptor.lastValue.secondaryContainer,
        )
    }
}
