package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.RenderableManager
import com.google.android.filament.Scene
import com.google.android.filament.TransformManager
import com.homegen.designer3d.model.Wall
import com.ktheme.android.KthemeDefaultTheme
import com.ktheme.android.semanticColors
import com.ktheme.android.toMaterial3ColorScheme
import com.ktheme.models.Theme
import com.ktheme.models.ThemeMetadata
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.clearInvocations
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import com.ktheme.models.ColorScheme as KthemeColorScheme

class MaterialFactoryTest {

    private lateinit var engine: Engine
    private lateinit var defaultMaterial: Material
    private val createdInstances = mutableListOf<MaterialInstance>()

    private val darkScheme = KthemeColorScheme(
        primary = "#D4AF37",
        onPrimary = "#0A1630",
        primaryContainer = "#1E2A4A",
        onPrimaryContainer = "#F0E6D2",
        secondary = "#8A9EA7",
        onSecondary = "#0A1630",
        secondaryContainer = "#23334A",
        onSecondaryContainer = "#DDE5ED",
        tertiary = "#C5A059",
        onTertiary = "#0A1630",
        tertiaryContainer = "#2E2818",
        onTertiaryContainer = "#F5E9D4",
        error = "#CF6679",
        onError = "#000000",
        errorContainer = "#B00020",
        onErrorContainer = "#FFFFFF",
        background = "#0A1630",
        onBackground = "#E0E6ED",
        surface = "#12203F",
        onSurface = "#E0E6ED",
        surfaceVariant = "#1E2D4A",
        onSurfaceVariant = "#B0BEC5",
        outline = "#4A5D78",
        outlineVariant = "#2A3A52",
        scrim = "#80000000",
        inverseSurface = "#E0E6ED",
        inverseOnSurface = "#0A1630",
        inversePrimary = "#6A5518",
    )

    private val lightScheme = KthemeColorScheme(
        primary = "#8B5E3C",
        onPrimary = "#FFFFFF",
        primaryContainer = "#C8E0F4",
        onPrimaryContainer = "#102030",
        secondary = "#5A7268",
        onSecondary = "#FFFFFF",
        secondaryContainer = "#D7E6DF",
        onSecondaryContainer = "#182820",
        tertiary = "#A67C52",
        onTertiary = "#FFFFFF",
        tertiaryContainer = "#EFE5D8",
        onTertiaryContainer = "#2A2015",
        error = "#B00020",
        onError = "#FFFFFF",
        errorContainer = "#FCD8DF",
        onErrorContainer = "#370617",
        background = "#F5F2EB",
        onBackground = "#1C1B18",
        surface = "#EAE4D7",
        onSurface = "#1C1B18",
        surfaceVariant = "#DDD6C7",
        onSurfaceVariant = "#49454F",
        outline = "#79747E",
        outlineVariant = "#C4BFB6",
        scrim = "#66000000",
        inverseSurface = "#313033",
        inverseOnSurface = "#F4EFF4",
        inversePrimary = "#E5C185",
    )

    @Before
    fun setUp() {
        engine = mock()
        defaultMaterial = mock()
        createdInstances.clear()

        whenever(engine.isValid).thenReturn(true)
        whenever(defaultMaterial.createInstance()).thenAnswer {
            val inst = mock<MaterialInstance>()
            whenever(inst.nativeObject).thenReturn((createdInstances.size + 1).toLong())
            createdInstances += inst
            inst
        }
    }

    private fun createFactory(scheme: KthemeColorScheme = darkScheme): MaterialFactory {
        return MaterialFactory(
            engine = engine,
            colorScheme = scheme,
            materialBuilder = { defaultMaterial },
        )
    }

    @Test
    fun `hexToRgba converts 6-digit, 8-digit, and 3-digit hex strings to normalized floats`() {
        val opaque = MaterialFactory.hexToRgba("#D4AF37")
        assertEquals(0xD4 / 255f, opaque.r, 0.001f)
        assertEquals(0xAF / 255f, opaque.g, 0.001f)
        assertEquals(0x37 / 255f, opaque.b, 0.001f)
        assertEquals(1.0f, opaque.a, 0.001f)

        val translucent = MaterialFactory.hexToRgba("#801E2A4A")
        assertEquals(0x1E / 255f, translucent.r, 0.001f)
        assertEquals(0x2A / 255f, translucent.g, 0.001f)
        assertEquals(0x4A / 255f, translucent.b, 0.001f)
        assertEquals(0x80 / 255f, translucent.a, 0.001f)

        val shortHex = MaterialFactory.hexToRgba("#F0A")
        assertEquals(1.0f, shortHex.r, 0.001f)
        assertEquals(0.0f, shortHex.g, 0.001f)
        assertEquals(0xAA / 255f, shortHex.b, 0.001f)
        assertEquals(1.0f, shortHex.a, 0.001f)

        assertNull(MaterialFactory.parseHexRgbaOrNull("not-a-color"))
        val fallback = MaterialFactory.hexToRgba("invalid")
        assertEquals(MaterialFactory.FALLBACK_NEUTRAL, fallback)
    }

    @Test
    fun `colorForType and terrain and grid map 3D surface roles to Ktheme semantic tokens`() {
        val factory = createFactory(darkScheme)

        val wall = factory.colorForType("wall")
        assertBaseColorSet(wall, MaterialFactory.hexToRgba(darkScheme.surfaceVariant))
        verify(wall).setParameter("roughness", 0.6f)
        verify(wall).setParameter("metallic", 0.0f)

        val floor = factory.colorForType("floor")
        assertBaseColorSet(floor, MaterialFactory.hexToRgba(darkScheme.surface))

        val furniture = factory.colorForType("furniture")
        assertBaseColorSet(furniture, MaterialFactory.hexToRgba(darkScheme.secondaryContainer))

        val grid = factory.createGridInstance()
        assertBaseColorSet(grid, MaterialFactory.hexToRgba(darkScheme.outlineVariant))

        val terrainFallback = factory.createTerrainInstance(forceFlatFallback = true)
        assertBaseColorSet(terrainFallback, MaterialFactory.hexToRgba(darkScheme.background))
        verify(terrainFallback).setParameter("roughness", 0.8f)

        val terrainDisplaced = factory.createTerrainInstance(forceFlatFallback = false)
        assertBaseColorSet(terrainDisplaced, MaterialFactory.hexToRgba(darkScheme.background))
        verify(terrainDisplaced).setParameter("roughness", 0.8f)

        val door = factory.colorForType("door")
        assertBaseColorSet(door, MaterialFactory.hexToRgba(darkScheme.primary))

        val window = factory.colorForType("window")
        val expectedWindow = MaterialFactory.hexToRgba(darkScheme.primaryContainer)
            .copy(a = MaterialFactory.WINDOW_DEFAULT_ALPHA)
        assertBaseColorSet(window, expectedWindow)

        val staircase = factory.colorForType("staircase")
        assertBaseColorSet(staircase, MaterialFactory.hexToRgba(darkScheme.tertiary))

        val room = factory.colorForType("room")
        assertBaseColorSet(room, MaterialFactory.hexToRgba(darkScheme.tertiaryContainer))

        val fallbackRole = factory.colorForType("unknown_custom_type")
        assertBaseColorSet(fallbackRole, MaterialFactory.hexToRgba(darkScheme.outline))

        // Cached role lookup returns the exact same MaterialInstance without reallocating
        assertSame(wall, factory.colorForType("wall"))
        assertSame(grid, factory.createGridInstance())
        assertSame(terrainFallback, factory.createTerrainInstance(forceFlatFallback = true))
    }

    @Test
    fun `updateTheme mutates cached MaterialInstance PBR baseColor parameters in place`() {
        val factory = createFactory(darkScheme)

        val wall = factory.colorForType("wall")
        val floor = factory.colorForType("floor")
        val furniture = factory.colorForType("furniture")
        val grid = factory.createGridInstance()
        val terrainFallback = factory.createTerrainInstance(forceFlatFallback = true)
        val terrainDisplaced = factory.createTerrainInstance(forceFlatFallback = false)
        val window = factory.colorForType("window")
        val doorDefault = factory.createDoorInstance()

        createdInstances.forEach { clearInvocations(it) }

        // Mutate using Ktheme ColorScheme
        factory.updateTheme(lightScheme)

        assertBaseColorSet(wall, MaterialFactory.hexToRgba(lightScheme.surfaceVariant))
        assertBaseColorSet(floor, MaterialFactory.hexToRgba(lightScheme.surface))
        assertBaseColorSet(furniture, MaterialFactory.hexToRgba(lightScheme.secondaryContainer))
        assertBaseColorSet(grid, MaterialFactory.hexToRgba(lightScheme.outlineVariant))
        assertBaseColorSet(terrainFallback, MaterialFactory.hexToRgba(lightScheme.background))
        assertBaseColorSet(terrainDisplaced, MaterialFactory.hexToRgba(lightScheme.background))
        assertBaseColorSet(
            window,
            MaterialFactory.hexToRgba(lightScheme.primaryContainer)
                .copy(a = MaterialFactory.WINDOW_DEFAULT_ALPHA),
        )
        assertBaseColorSet(doorDefault, MaterialFactory.hexToRgba(lightScheme.primary))

        // Same GPU MaterialInstance references are preserved (no mesh re-allocation needed)
        assertSame(wall, factory.colorForType("wall"))
        assertSame(floor, factory.colorForType("floor"))
        assertSame(grid, factory.createGridInstance())

        createdInstances.forEach { clearInvocations(it) }

        // Mutate using Compose Material 3 ColorScheme (as bridged from HomegenScreen)
        val composeDark = KthemeDefaultTheme.copy(colorScheme = darkScheme).toMaterial3ColorScheme(isDark = true)
        factory.updateTheme(composeDark)

        assertBaseColorSet(wall, MaterialFactory.hexToRgba(darkScheme.surfaceVariant))
        assertBaseColorSet(floor, MaterialFactory.hexToRgba(darkScheme.surface))
        assertBaseColorSet(furniture, MaterialFactory.hexToRgba(darkScheme.secondaryContainer))
        assertBaseColorSet(grid, MaterialFactory.hexToRgba(darkScheme.outlineVariant))
        assertBaseColorSet(terrainFallback, MaterialFactory.hexToRgba(darkScheme.background))

        createdInstances.forEach { clearInvocations(it) }

        // Mutate using KthemeSemanticColors
        val lightTheme = Theme(
            metadata = ThemeMetadata(
                id = "paper-ink",
                name = "Paper & Ink",
                description = "Light editorial theme",
                author = "Ktheme",
                version = "1.0.0",
                tags = listOf("light"),
                createdAt = "2026-01-01T00:00:00Z",
                updatedAt = "2026-01-01T00:00:00Z",
            ),
            darkMode = false,
            colorScheme = lightScheme,
        )
        factory.updateTheme(lightTheme.semanticColors())
        assertBaseColorSet(wall, MaterialFactory.hexToRgba(lightScheme.surfaceVariant))
        assertBaseColorSet(floor, MaterialFactory.hexToRgba(lightScheme.surface))
        assertBaseColorSet(grid, MaterialFactory.hexToRgba(lightScheme.outlineVariant))
        assertBaseColorSet(terrainFallback, MaterialFactory.hexToRgba(lightScheme.background))
    }

    @Test
    fun `custom material overrides preserve custom parameters across theme updates until reset`() {
        val factory = createFactory(darkScheme)

        // Direct custom color & custom door instances must ignore theme updates
        val customColor = factory.createColorInstance(0.91f, 0.22f, 0.13f, 1.0f)
        val customDoor = factory.createDoorInstance(panelColorHex = "#AA3311")

        // RenderableRegistry painted vs unpainted walls
        val scene = mock<Scene>()
        val transformManager = mock<TransformManager>()
        val renderableManager = mock<RenderableManager>()
        whenever(engine.transformManager).thenReturn(transformManager)
        whenever(engine.renderableManager).thenReturn(renderableManager)
        whenever(transformManager.getInstance(any())).thenReturn(1)
        whenever(renderableManager.getInstance(any())).thenReturn(10)

        var nextEntityId = 100
        val registry = RenderableRegistry(
            engine = engine,
            scene = scene,
            materialFactory = factory,
            meshBuilder = { _, _ -> nextEntityId++ },
            entityDestroyer = {},
        )

        val unpaintedWall = Wall(name = "Unpainted Wall")
        val paintedWall = Wall(name = "Painted Wall")
        registry.createRenderable(unpaintedWall)
        registry.createRenderable(paintedWall)

        assertFalse(registry.hasCustomMaterialOverride(paintedWall.id))

        // Paint second wall with a user-selected catalog texture
        registry.applyMaterial(paintedWall.id, "textures/walls/terracotta.png")
        assertTrue(registry.hasCustomMaterialOverride(paintedWall.id))

        val instanceCaptor = argumentCaptor<MaterialInstance>()
        verify(renderableManager).setMaterialInstanceAt(eq(10), eq(0), instanceCaptor.capture())
        val paintedMaterialInstance = instanceCaptor.firstValue
        val themeWallMaterialInstance = factory.colorForType("wall")
        assertNotSame(themeWallMaterialInstance, paintedMaterialInstance)

        createdInstances.forEach { clearInvocations(it) }

        // Trigger theme update: unpainted wall mutates, painted wall & custom instances stay untouched
        factory.updateTheme(lightScheme)

        assertBaseColorSet(themeWallMaterialInstance, MaterialFactory.hexToRgba(lightScheme.surfaceVariant))
        verify(paintedMaterialInstance, never()).setParameter(eq("baseColor"), any<Float>(), any<Float>(), any<Float>(), any<Float>())
        verify(customColor, never()).setParameter(eq("baseColor"), any<Float>(), any<Float>(), any<Float>(), any<Float>())
        verify(customDoor, never()).setParameter(eq("baseColor"), any<Float>(), any<Float>(), any<Float>(), any<Float>())

        // Explicitly reset painted wall back to default material -> rebinds to active theme instance
        clearInvocations(renderableManager)
        registry.resetMaterial(paintedWall.id)
        assertFalse(registry.hasCustomMaterialOverride(paintedWall.id))
        verify(renderableManager).setMaterialInstanceAt(eq(10), eq(0), eq(themeWallMaterialInstance))
    }

    @Test
    fun `updateTheme safely guards against destroyed Engine and destroyed MaterialInstances`() {
        val factory = createFactory(darkScheme)
        val wall = factory.colorForType("wall")
        val floor = factory.colorForType("floor")

        createdInstances.forEach { clearInvocations(it) }

        // Case 1: Individual MaterialInstance was destroyed natively (throws IllegalStateException)
        whenever(wall.nativeObject).thenThrow(IllegalStateException("Calling method on destroyed MaterialInstance"))
        factory.updateTheme(lightScheme)

        verify(wall, never()).setParameter(eq("baseColor"), any<Float>(), any<Float>(), any<Float>(), any<Float>())
        assertBaseColorSet(floor, MaterialFactory.hexToRgba(lightScheme.surface))

        clearInvocations(floor)

        // Case 2: Engine becomes invalid before theme update runs
        whenever(engine.isValid).thenReturn(false)
        factory.updateTheme(darkScheme)
        verify(floor, never()).setParameter(eq("baseColor"), any<Float>(), any<Float>(), any<Float>(), any<Float>())

        // Case 3: MaterialFactory.destroy() called -> subsequent updateTheme is a safe no-op
        whenever(engine.isValid).thenReturn(true)
        factory.destroy()
        assertTrue(factory.isDestroyed)
        clearInvocations(floor)

        factory.updateTheme(darkScheme)
        verify(floor, never()).setParameter(eq("baseColor"), any<Float>(), any<Float>(), any<Float>(), any<Float>())
    }

    private fun assertBaseColorSet(instance: MaterialInstance, expected: RgbaColor) {
        val rCap = argumentCaptor<Float>()
        val gCap = argumentCaptor<Float>()
        val bCap = argumentCaptor<Float>()
        val aCap = argumentCaptor<Float>()
        verify(instance).setParameter(
            eq("baseColor"),
            rCap.capture(),
            gCap.capture(),
            bCap.capture(),
            aCap.capture(),
        )
        assertEquals(expected.r, rCap.lastValue, 0.002f)
        assertEquals(expected.g, gCap.lastValue, 0.002f)
        assertEquals(expected.b, bCap.lastValue, 0.002f)
        assertEquals(expected.a, aCap.lastValue, 0.002f)
    }
}
