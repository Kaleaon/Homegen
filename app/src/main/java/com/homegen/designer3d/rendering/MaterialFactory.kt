package com.homegen.designer3d.rendering

import com.google.android.filament.Engine
import com.google.android.filament.Material
import com.google.android.filament.MaterialInstance
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import com.ktheme.android.KthemeDefaultTheme
import com.ktheme.android.KthemeSemanticColors
import com.ktheme.utils.ColorUtils
import kotlin.math.abs
import androidx.compose.material3.ColorScheme as ComposeColorScheme
import androidx.compose.ui.graphics.Color as ComposeColor
import com.ktheme.models.ColorScheme as KthemeColorScheme

/**
 * Normalized RGBA color vector with float components in [0f, 1f].
 */
data class RgbaColor(
    val r: Float,
    val g: Float,
    val b: Float,
    val a: Float = 1.0f,
)

/**
 * Semantic 3D surface color palette derived from Ktheme tokens.
 */
data class SurfaceThemePalette(
    val terrain: RgbaColor,
    val grid: RgbaColor,
    val wall: RgbaColor,
    val floor: RgbaColor,
    val room: RgbaColor,
    val furniture: RgbaColor,
    val door: RgbaColor,
    val window: RgbaColor,
    val staircase: RgbaColor,
    val defaultSurface: RgbaColor,
) {
    companion object {
        fun fromKthemeColorScheme(scheme: KthemeColorScheme): SurfaceThemePalette {
            val windowBase = MaterialFactory.hexToRgba(scheme.primaryContainer)
            return SurfaceThemePalette(
                terrain = MaterialFactory.hexToRgba(scheme.background),
                grid = MaterialFactory.hexToRgba(scheme.outlineVariant),
                wall = MaterialFactory.hexToRgba(scheme.surfaceVariant),
                floor = MaterialFactory.hexToRgba(scheme.surface),
                room = MaterialFactory.hexToRgba(scheme.tertiaryContainer),
                furniture = MaterialFactory.hexToRgba(scheme.secondaryContainer),
                door = MaterialFactory.hexToRgba(scheme.primary),
                window = windowBase.copy(
                    a = if (windowBase.a < 1.0f) windowBase.a else MaterialFactory.WINDOW_DEFAULT_ALPHA,
                ),
                staircase = MaterialFactory.hexToRgba(scheme.tertiary),
                defaultSurface = MaterialFactory.hexToRgba(scheme.outline),
            )
        }

        fun fromComposeColorScheme(scheme: ComposeColorScheme): SurfaceThemePalette {
            val windowBase = scheme.primaryContainer.toRgbaColor()
            return SurfaceThemePalette(
                terrain = scheme.background.toRgbaColor(),
                grid = scheme.outlineVariant.toRgbaColor(),
                wall = scheme.surfaceVariant.toRgbaColor(),
                floor = scheme.surface.toRgbaColor(),
                room = scheme.tertiaryContainer.toRgbaColor(),
                furniture = scheme.secondaryContainer.toRgbaColor(),
                door = scheme.primary.toRgbaColor(),
                window = windowBase.copy(
                    a = if (windowBase.a < 1.0f) windowBase.a else MaterialFactory.WINDOW_DEFAULT_ALPHA,
                ),
                staircase = scheme.tertiary.toRgbaColor(),
                defaultSurface = scheme.outline.toRgbaColor(),
            )
        }

        fun fromSemanticColors(colors: KthemeSemanticColors): SurfaceThemePalette {
            val windowBase = colors.accent.toRgbaColor()
            return SurfaceThemePalette(
                terrain = colors.appBackground.toRgbaColor(),
                grid = colors.borderSubtle.toRgbaColor(),
                wall = colors.cardBackgroundAlt.toRgbaColor(),
                floor = colors.cardBackground.toRgbaColor(),
                room = colors.inverseSurface.toRgbaColor(),
                furniture = colors.accent.toRgbaColor(),
                door = colors.brand.toRgbaColor(),
                window = windowBase.copy(
                    a = if (windowBase.a < 1.0f) windowBase.a else MaterialFactory.WINDOW_DEFAULT_ALPHA,
                ),
                staircase = colors.highlight.toRgbaColor(),
                defaultSurface = colors.border.toRgbaColor(),
            )
        }

        private fun ComposeColor.toRgbaColor(): RgbaColor = RgbaColor(
            r = red.coerceIn(0f, 1f),
            g = green.coerceIn(0f, 1f),
            b = blue.coerceIn(0f, 1f),
            a = alpha.coerceIn(0f, 1f),
        )
    }
}

/**
 * Manages Filament materials and material instances for scene objects,
 * binding default 3D surface PBR parameters to active Ktheme color tokens.
 */
class MaterialFactory(
    private val engine: Engine,
    colorScheme: KthemeColorScheme = KthemeDefaultTheme.colorScheme,
    private val materialBuilder: (Engine) -> Material = { Material.Builder().build(it) },
) {
    constructor(
        engine: Engine,
        colorScheme: ComposeColorScheme,
        materialBuilder: (Engine) -> Material = { Material.Builder().build(it) },
    ) : this(engine, KthemeDefaultTheme.colorScheme, materialBuilder) {
        activePalette = SurfaceThemePalette.fromComposeColorScheme(colorScheme)
    }

    constructor(
        engine: Engine,
        semanticColors: KthemeSemanticColors,
        materialBuilder: (Engine) -> Material = { Material.Builder().build(it) },
    ) : this(engine, KthemeDefaultTheme.colorScheme, materialBuilder) {
        activePalette = SurfaceThemePalette.fromSemanticColors(semanticColors)
    }

    private data class DoorMaterialEntry(
        val instance: MaterialInstance,
        val hasCustomPanelColor: Boolean,
        val hasCustomFrameColor: Boolean,
    )

    private var activePalette: SurfaceThemePalette = SurfaceThemePalette.fromKthemeColorScheme(colorScheme)
    private var defaultMaterial: Material? = null
    private val roleInstanceCache = mutableMapOf<String, MaterialInstance>()
    private val terrainInstances = mutableSetOf<MaterialInstance>()
    private val doorInstanceCache = mutableMapOf<String, DoorMaterialEntry>()
    private val customInstanceCache = mutableMapOf<String, MaterialInstance>()

    var isDestroyed: Boolean = false
        private set

    var isVertexTextureFetchSupported: Boolean = true

    /**
     * Returns the current normalized RGBA color mapped to a 3D surface role.
     */
    fun resolveColorForRole(type: String): RgbaColor = when (normalizeRole(type)) {
        ROLE_TERRAIN -> activePalette.terrain
        ROLE_GRID -> activePalette.grid
        ROLE_WALL -> activePalette.wall
        ROLE_FLOOR -> activePalette.floor
        ROLE_ROOM -> activePalette.room
        ROLE_FURNITURE -> activePalette.furniture
        ROLE_DOOR -> activePalette.door
        ROLE_WINDOW -> activePalette.window
        ROLE_STAIRCASE -> activePalette.staircase
        else -> activePalette.defaultSurface
    }

    /**
     * Creates a terrain material instance for GPU vertex heightmap displacement.
     * Falls back to flat ground rendering bound to the Ktheme `background` token if vertex
     * texture fetch is unsupported on legacy GPU.
     */
    fun createTerrainInstance(
        texture: Texture? = null,
        verticalScale: Float = 1.0f,
        minElevation: Float = 0f,
        maxElevation: Float = 10f,
        forceFlatFallback: Boolean = false,
    ): MaterialInstance {
        if (forceFlatFallback || !isVertexTextureFetchSupported) {
            return getOrCreateRoleInstance(ROLE_TERRAIN, roughness = 0.8f)
        }

        val terrainColor = activePalette.terrain
        val instance = getDefaultMaterial().createInstance()
        instance.setParameter("baseColor", terrainColor.r, terrainColor.g, terrainColor.b, terrainColor.a)
        instance.setParameter("roughness", 0.8f)
        instance.setParameter("metallic", 0.0f)

        if (texture != null) {
            try {
                val sampler = TextureSampler(
                    TextureSampler.MinFilter.LINEAR,
                    TextureSampler.MagFilter.LINEAR,
                    TextureSampler.WrapMode.CLAMP_TO_EDGE,
                )
                instance.setParameter("elevationTexture", texture, sampler)
                instance.setParameter("verticalScale", verticalScale)
                instance.setParameter("minElevation", minElevation)
                instance.setParameter("maxElevation", maxElevation)
            } catch (_: Throwable) {
                // Ignore parameter missing or headless sampler errors on default material
            }
        }

        terrainInstances += instance
        return instance
    }

    /**
     * Releases a heightmap terrain material instance created by [createTerrainInstance]
     * without destroying shared role fallback instances.
     */
    fun releaseTerrainInstance(instance: MaterialInstance?) {
        if (instance == null) return
        if (terrainInstances.remove(instance)) {
            if (!isDestroyed && engine.isValid && isInstanceValid(instance)) {
                try {
                    engine.destroyMaterialInstance(instance)
                } catch (_: Exception) {
                }
            }
        }
    }

    /**
     * Creates a default lit material programmatically using Filament's built-in capabilities.
     */
    fun getDefaultMaterial(): Material {
        defaultMaterial?.let { return it }

        val material = materialBuilder(engine)
        defaultMaterial = material
        return material
    }

    /**
     * Creates an explicit custom-colored material instance.
     * Custom color instances preserve their explicit RGBA parameters across [updateTheme].
     */
    fun createColorInstance(r: Float, g: Float, b: Float, a: Float = 1f): MaterialInstance {
        val key = "color_${r}_${g}_${b}_$a"
        customInstanceCache[key]?.let { return it }

        val instance = getDefaultMaterial().createInstance()
        instance.setParameter("baseColor", r, g, b, a)
        instance.setParameter("roughness", 0.6f)
        instance.setParameter("metallic", 0.0f)
        customInstanceCache[key] = instance
        return instance
    }

    /**
     * Creates a custom catalog/painted material instance that preserves its custom parameters
     * and ignores automatic theme updates until the entity is reset to a default material.
     */
    fun createCustomMaterialInstance(materialRef: String): MaterialInstance {
        val key = "custom_$materialRef"
        customInstanceCache[key]?.let { return it }

        val color = parseHexRgbaOrNull(materialRef) ?: deriveCatalogColor(materialRef)
        val instance = getDefaultMaterial().createInstance()
        instance.setParameter("baseColor", color.r, color.g, color.b, color.a)
        instance.setParameter("roughness", 0.6f)
        instance.setParameter("metallic", 0.0f)
        customInstanceCache[key] = instance
        return instance
    }

    /**
     * Creates a grid material instance bound to the Ktheme `outlineVariant` token.
     */
    fun createGridInstance(): MaterialInstance {
        return getOrCreateRoleInstance(ROLE_GRID, roughness = 0.6f)
    }

    /**
     * Gets a theme-bound material instance for a given 3D object surface role.
     */
    fun colorForType(type: String): MaterialInstance {
        val role = normalizeRole(type)
        val roughness = if (role == ROLE_TERRAIN) 0.8f else 0.6f
        return getOrCreateRoleInstance(role, roughness = roughness)
    }

    /**
     * Creates a transparent version of a material for ghost floor rendering.
     */
    fun createTransparentInstance(r: Float, g: Float, b: Float, alpha: Float): MaterialInstance {
        return createColorInstance(r, g, b, alpha)
    }

    /**
     * Creates a door material instance supporting door panel base color, frame color override,
     * and hardware metallic and roughness values when syncing 3D state to Android/Filament.
     */
    fun createDoorInstance(
        panelColorHex: String? = null,
        frameColorHex: String? = null,
        metallic: Float = 0.0f,
        roughness: Float = 0.5f,
    ): MaterialInstance {
        val key = "door_${panelColorHex}_${frameColorHex}_${metallic}_$roughness"
        doorInstanceCache[key]?.let { return it.instance }

        val instance = getDefaultMaterial().createInstance()
        val parsedPanel = parseHexRgbaOrNull(panelColorHex)
        val parsedFrame = parseHexRgbaOrNull(frameColorHex)
        val panelColor = parsedPanel ?: activePalette.door
        val frameColor = parsedFrame ?: panelColor

        try {
            instance.setParameter("baseColor", panelColor.r, panelColor.g, panelColor.b, panelColor.a)
            instance.setParameter("frameColorOverride", frameColor.r, frameColor.g, frameColor.b, frameColor.a)
            instance.setParameter("metallic", metallic)
            instance.setParameter("roughness", roughness)
        } catch (_: Exception) {
            // Ignore missing parameter errors on default materials
        }

        doorInstanceCache[key] = DoorMaterialEntry(
            instance = instance,
            hasCustomPanelColor = parsedPanel != null,
            hasCustomFrameColor = parsedFrame != null,
        )
        return instance
    }

    /**
     * Updates cached theme-bound [MaterialInstance] `baseColor` parameters in place from a
     * Compose Material 3 [ComposeColorScheme] without re-allocating mesh geometry.
     */
    fun updateTheme(colorScheme: ComposeColorScheme) {
        applyPaletteUpdate(SurfaceThemePalette.fromComposeColorScheme(colorScheme))
    }

    /**
     * Updates cached theme-bound [MaterialInstance] `baseColor` parameters in place from a
     * Ktheme [KthemeColorScheme] without re-allocating mesh geometry.
     */
    fun updateTheme(colorScheme: KthemeColorScheme) {
        applyPaletteUpdate(SurfaceThemePalette.fromKthemeColorScheme(colorScheme))
    }

    /**
     * Updates cached theme-bound [MaterialInstance] `baseColor` parameters in place from
     * [KthemeSemanticColors] without re-allocating mesh geometry.
     */
    fun updateTheme(semanticColors: KthemeSemanticColors) {
        applyPaletteUpdate(SurfaceThemePalette.fromSemanticColors(semanticColors))
    }

    private fun applyPaletteUpdate(newPalette: SurfaceThemePalette) {
        if (isDestroyed || !engine.isValid) return
        activePalette = newPalette

        val invalidRoles = mutableListOf<String>()
        for ((role, instance) in roleInstanceCache) {
            if (!isInstanceValid(instance)) {
                invalidRoles += role
                continue
            }
            safeSetBaseColor(instance, resolveColorForRole(role))
        }
        invalidRoles.forEach { roleInstanceCache.remove(it) }

        val invalidTerrains = mutableListOf<MaterialInstance>()
        val terrainColor = activePalette.terrain
        for (instance in terrainInstances) {
            if (!isInstanceValid(instance)) {
                invalidTerrains += instance
                continue
            }
            safeSetBaseColor(instance, terrainColor)
        }
        terrainInstances.removeAll(invalidTerrains.toSet())

        val invalidDoors = mutableListOf<String>()
        val doorColor = activePalette.door
        for ((key, entry) in doorInstanceCache) {
            if (!isInstanceValid(entry.instance)) {
                invalidDoors += key
                continue
            }
            if (!entry.hasCustomPanelColor) {
                safeSetBaseColor(entry.instance, doorColor)
                if (!entry.hasCustomFrameColor) {
                    try {
                        entry.instance.setParameter(
                            "frameColorOverride",
                            doorColor.r,
                            doorColor.g,
                            doorColor.b,
                            doorColor.a,
                        )
                    } catch (_: Exception) {
                    }
                }
            }
        }
        invalidDoors.forEach { doorInstanceCache.remove(it) }
    }

    private fun getOrCreateRoleInstance(role: String, roughness: Float): MaterialInstance {
        roleInstanceCache[role]?.let { cached ->
            if (isInstanceValid(cached)) {
                return cached
            }
            roleInstanceCache.remove(role)
        }

        val color = resolveColorForRole(role)
        val instance = getDefaultMaterial().createInstance()
        instance.setParameter("baseColor", color.r, color.g, color.b, color.a)
        instance.setParameter("roughness", roughness)
        instance.setParameter("metallic", 0.0f)
        roleInstanceCache[role] = instance
        return instance
    }

    private fun isInstanceValid(instance: MaterialInstance): Boolean {
        return try {
            instance.nativeObject
            true
        } catch (_: IllegalStateException) {
            false
        }
    }

    private fun safeSetBaseColor(instance: MaterialInstance, color: RgbaColor) {
        try {
            instance.setParameter("baseColor", color.r, color.g, color.b, color.a)
        } catch (_: IllegalStateException) {
            // Guard against destroyed MaterialInstance native pointer races
        }
    }

    fun destroy() {
        if (isDestroyed) return
        isDestroyed = true

        val allInstances = LinkedHashSet<MaterialInstance>().apply {
            addAll(roleInstanceCache.values)
            addAll(terrainInstances)
            addAll(doorInstanceCache.values.map { it.instance })
            addAll(customInstanceCache.values)
        }

        if (engine.isValid) {
            for (instance in allInstances) {
                if (isInstanceValid(instance)) {
                    try {
                        engine.destroyMaterialInstance(instance)
                    } catch (_: Exception) {
                    }
                }
            }
            defaultMaterial?.let { mat ->
                try {
                    engine.destroyMaterial(mat)
                } catch (_: Exception) {
                }
            }
        }

        roleInstanceCache.clear()
        terrainInstances.clear()
        doorInstanceCache.clear()
        customInstanceCache.clear()
        defaultMaterial = null
    }

    companion object {
        const val WINDOW_DEFAULT_ALPHA = 0.6f

        private const val ROLE_TERRAIN = "terrain"
        private const val ROLE_GRID = "grid"
        private const val ROLE_WALL = "wall"
        private const val ROLE_FLOOR = "floor"
        private const val ROLE_ROOM = "room"
        private const val ROLE_FURNITURE = "furniture"
        private const val ROLE_DOOR = "door"
        private const val ROLE_WINDOW = "window"
        private const val ROLE_STAIRCASE = "staircase"
        private const val ROLE_DEFAULT = "default"

        val FALLBACK_NEUTRAL = RgbaColor(0.7f, 0.7f, 0.7f, 1.0f)

        private val DEFAULT_MATERIAL_REFS = setOf(
            "",
            "default",
            "paint/white",
            "floor/wood-oak",
            "room/default",
            "fabric/gray",
            "wood/oak",
            "glass/clear",
            ROLE_WALL,
            ROLE_FLOOR,
            ROLE_ROOM,
            ROLE_FURNITURE,
            ROLE_DOOR,
            ROLE_WINDOW,
            ROLE_STAIRCASE,
        )

        /**
         * Returns true when [materialRef] refers to a built-in default surface role rather than
         * a user-applied catalog override.
         */
        fun isDefaultMaterialRef(materialRef: String?): Boolean {
            if (materialRef == null) return true
            return materialRef.trim().lowercase() in DEFAULT_MATERIAL_REFS
        }

        /**
         * Converts a hex string (`#RRGGBB`, `RRGGBB`, `#AARRGGBB`, `AARRGGBB`, `#RGB`) into
         * normalized float `(r, g, b, a)` components, falling back to [fallback] if malformed.
         */
        fun hexToRgba(hex: String?, fallback: RgbaColor = FALLBACK_NEUTRAL): RgbaColor {
            return parseHexRgbaOrNull(hex) ?: fallback
        }

        /**
         * Parses a hex color string into normalized float `(r, g, b, a)` or null if invalid.
         */
        fun parseHexRgbaOrNull(hex: String?): RgbaColor? {
            if (hex.isNullOrBlank()) return null
            val trimmed = hex.trim()
            val clean = trimmed.removePrefix("#")
            val normalized = when (clean.length) {
                3 -> buildString(7) {
                    append('#')
                    for (ch in clean) {
                        append(ch)
                        append(ch)
                    }
                }
                6, 8 -> "#$clean"
                else -> return null
            }
            return try {
                val colorInt = ColorUtils.hexToColorInt(normalized)
                val a = ((colorInt ushr 24) and 0xFF) / 255.0f
                val r = ((colorInt ushr 16) and 0xFF) / 255.0f
                val g = ((colorInt ushr 8) and 0xFF) / 255.0f
                val b = (colorInt and 0xFF) / 255.0f
                RgbaColor(r = r, g = g, b = b, a = a)
            } catch (_: Exception) {
                null
            }
        }

        private fun normalizeRole(type: String): String = when (type.trim().lowercase()) {
            "terrain" -> ROLE_TERRAIN
            "grid" -> ROLE_GRID
            "wall", "walls" -> ROLE_WALL
            "floor", "floors" -> ROLE_FLOOR
            "room" -> ROLE_ROOM
            "furniture" -> ROLE_FURNITURE
            "door", "doors" -> ROLE_DOOR
            "window", "windows" -> ROLE_WINDOW
            "staircase", "stairs" -> ROLE_STAIRCASE
            else -> ROLE_DEFAULT
        }

        private fun deriveCatalogColor(materialRef: String): RgbaColor {
            val hash = abs(materialRef.hashCode())
            val r = (0x40 + (hash and 0x7F)) / 255.0f
            val g = (0x40 + ((hash shr 7) and 0x7F)) / 255.0f
            val b = (0x40 + ((hash shr 14) and 0x7F)) / 255.0f
            return RgbaColor(r = r, g = g, b = b, a = 1.0f)
        }
    }
}
