package com.homegen.assets.data

/**
 * Registry of free asset sources curated from "The People's Design Library".
 *
 * These are community-vetted, free-to-use resources for 3D models, PBR textures,
 * and HDRI environments. Resources marked as top-rated (🔥) by the community
 * are listed first in each category.
 *
 * Licensing: Most sources offer CC0, CC-BY, or similar permissive licenses.
 * Always check individual asset licenses before redistribution.
 */
object AssetSources {

    data class AssetSource(
        val name: String,
        val url: String,
        val category: SourceCategory,
        val description: String,
        val formats: List<String>,
        val topRated: Boolean = false,
        val apiAvailable: Boolean = false,
    )

    enum class SourceCategory {
        MODELS_3D,
        TEXTURES_PBR,
        TEXTURES_PLAIN,
        HDRI,
        CAD_2D,
        FURNITURE_BRANDS,
    }

    /** Top free 3D model sources for home design / furniture. */
    val modelSources = listOf(
        AssetSource(
            name = "Poly Haven",
            url = "https://polyhaven.com",
            category = SourceCategory.MODELS_3D,
            description = "CC0 models, textures, and HDRIs. High quality, no restrictions.",
            formats = listOf("glb", "gltf", "fbx", "obj", "blend"),
            topRated = true,
            apiAvailable = true,
        ),
        AssetSource(
            name = "3D Maxter",
            url = "https://3dmaxter.com",
            category = SourceCategory.MODELS_3D,
            description = "Large collection of free interior/furniture 3D models.",
            formats = listOf("max", "obj", "fbx", "3ds"),
            topRated = true,
        ),
        AssetSource(
            name = "Zeel Project",
            url = "https://zeelproject.com",
            category = SourceCategory.MODELS_3D,
            description = "Community-rated 'The Best' — curated furniture models.",
            formats = listOf("max", "obj", "fbx"),
            topRated = true,
        ),
        AssetSource(
            name = "Dimensiva",
            url = "https://dimensiva.com",
            category = SourceCategory.MODELS_3D,
            description = "Free furniture 3D models from real brands.",
            formats = listOf("max", "obj", "fbx", "skp"),
            topRated = true,
        ),
        AssetSource(
            name = "3DSky Free",
            url = "https://3dsky.org",
            category = SourceCategory.MODELS_3D,
            description = "Large library of interior 3D models, free section available.",
            formats = listOf("max", "obj", "fbx"),
            topRated = true,
        ),
        AssetSource(
            name = "Archiproducts",
            url = "https://www.archiproducts.com",
            category = SourceCategory.MODELS_3D,
            description = "Official 3D models from real furniture/product brands.",
            formats = listOf("obj", "3ds", "dwg"),
        ),
        AssetSource(
            name = "pCon.catalog",
            url = "https://pcon-catalog.com",
            category = SourceCategory.MODELS_3D,
            description = "Official 3D banks of furniture companies. Accurate brand models.",
            formats = listOf("obj", "3ds", "dwg"),
        ),
        AssetSource(
            name = "Sketchfab",
            url = "https://sketchfab.com",
            category = SourceCategory.MODELS_3D,
            description = "Huge 3D model marketplace with many free downloadable models.",
            formats = listOf("glb", "gltf", "obj", "fbx"),
            apiAvailable = true,
        ),
        AssetSource(
            name = "Sweet Home 3D",
            url = "https://www.sweethome3d.com/free-3d-models/",
            category = SourceCategory.MODELS_3D,
            description = "~1600 free OBJ furniture models. Free Art License / CC-BY.",
            formats = listOf("obj"),
        ),
        AssetSource(
            name = "ArchiUp",
            url = "https://archiup.com",
            category = SourceCategory.MODELS_3D,
            description = "Free architecture and furniture 3D models.",
            formats = listOf("max", "obj", "skp", "3ds"),
        ),
        AssetSource(
            name = "Free 3D",
            url = "https://free3d.com",
            category = SourceCategory.MODELS_3D,
            description = "Free 3D models including vintage objects collection.",
            formats = listOf("obj", "fbx", "max", "blend"),
        ),
        AssetSource(
            name = "Archive 3D",
            url = "https://archive3d.net",
            category = SourceCategory.MODELS_3D,
            description = "Free 3D models for architecture visualization.",
            formats = listOf("3ds", "gsm"),
        ),
        AssetSource(
            name = "LEED3D",
            url = "https://leed3d.com",
            category = SourceCategory.MODELS_3D,
            description = "Free 3D models for architectural visualization.",
            formats = listOf("max", "obj", "fbx"),
        ),
    )

    /** Top free PBR texture sources with maps (normal, roughness, etc). */
    val textureSources = listOf(
        AssetSource(
            name = "Ambient CG",
            url = "https://ambientcg.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "CC0 PBR materials. High quality, no restrictions.",
            formats = listOf("jpg", "png", "exr"),
            topRated = true,
            apiAvailable = true,
        ),
        AssetSource(
            name = "Poly Haven (Textures)",
            url = "https://polyhaven.com/textures",
            category = SourceCategory.TEXTURES_PBR,
            description = "CC0 PBR textures with all map types.",
            formats = listOf("jpg", "png", "exr"),
            topRated = true,
            apiAvailable = true,
        ),
        AssetSource(
            name = "cgbookcase",
            url = "https://www.cgbookcase.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free PBR textures — great rocks, paving, roads.",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
        AssetSource(
            name = "ShareTextures",
            url = "https://www.sharetextures.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free PBR textures with all map types.",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
        AssetSource(
            name = "3D Textures",
            url = "https://3dtextures.me",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free seamless PBR textures.",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
        AssetSource(
            name = "Texture Fun",
            url = "https://texturefun.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free PBR texture library.",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
        AssetSource(
            name = "Raw Textures",
            url = "https://www.rawpbr.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free PBR textures, curated collection.",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
        AssetSource(
            name = "Poly Suite",
            url = "https://polysuite.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "High quality PBR material library.",
            formats = listOf("jpg", "png", "exr"),
            topRated = true,
        ),
        AssetSource(
            name = "Lightbeans",
            url = "https://lightbeans.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free PBR textures and materials.",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
        AssetSource(
            name = "Twinbru",
            url = "https://www.twinbru.com",
            category = SourceCategory.TEXTURES_PBR,
            description = "Free fabric/upholstery textures (sent via email).",
            formats = listOf("jpg", "png"),
            topRated = true,
        ),
    )

    /** Free HDRI environment sources. */
    val hdriSources = listOf(
        AssetSource(
            name = "Poly Haven (HDRIs)",
            url = "https://polyhaven.com/hdris",
            category = SourceCategory.HDRI,
            description = "CC0 HDRIs for lighting and reflections.",
            formats = listOf("hdr", "exr"),
            topRated = true,
            apiAvailable = true,
        ),
        AssetSource(
            name = "HDRi Haven",
            url = "https://hdrihaven.com",
            category = SourceCategory.HDRI,
            description = "Now part of Poly Haven. CC0 HDRIs.",
            formats = listOf("hdr", "exr"),
            topRated = true,
        ),
    )

    /** All sources combined. */
    val allSources: List<AssetSource>
        get() = modelSources + textureSources + hdriSources

    /** Sources that have REST APIs for programmatic downloading. */
    val apiSources: List<AssetSource>
        get() = allSources.filter { it.apiAvailable }

    /** Get sources that support a specific file format. */
    fun sourcesForFormat(format: String): List<AssetSource> =
        allSources.filter { format.lowercase() in it.formats }
}
