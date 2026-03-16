package com.homegen.designer3d.rendering

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.android.filament.Engine
import com.google.android.filament.MaterialInstance
import com.google.android.filament.Texture
import java.io.File
import java.io.InputStream
import java.nio.ByteBuffer

/**
 * Loads PBR texture sets (albedo, normal, roughness, metallic, AO) and applies
 * them to Filament MaterialInstances.
 *
 * Supports texture sets from free sources like Ambient CG, Poly Haven, cgbookcase, etc.
 * Textures can be loaded from local assets or from downloaded files in the cache directory.
 *
 * Expected naming convention in a texture set directory:
 *   {name}_Color.jpg / _Diffuse.jpg / _BaseColor.jpg  → albedo
 *   {name}_NormalGL.jpg / _Normal.jpg                  → normal map
 *   {name}_Roughness.jpg                               → roughness
 *   {name}_Metalness.jpg / _Metallic.jpg               → metallic
 *   {name}_AmbientOcclusion.jpg / _AO.jpg              → ambient occlusion
 *   {name}_Displacement.jpg / _Height.jpg              → height (optional)
 */
class PbrTextureLoader(
    private val engine: Engine,
    private val context: Context,
) {
    private val textureCache = mutableMapOf<String, Texture>()

    data class PbrTextureSet(
        val albedo: Texture?,
        val normal: Texture?,
        val roughness: Texture?,
        val metallic: Texture?,
        val ao: Texture?,
    )

    /**
     * Loads a PBR texture set from a directory in the app's assets.
     * Looks for standard PBR map naming conventions.
     */
    fun loadFromAssets(directory: String): PbrTextureSet {
        val files = try {
            context.assets.list(directory)?.toList() ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }

        return PbrTextureSet(
            albedo = findAndLoad(directory, files, listOf("Color", "Diffuse", "BaseColor", "Albedo", "color", "diffuse")),
            normal = findAndLoad(directory, files, listOf("NormalGL", "Normal", "normal", "NormalDX")),
            roughness = findAndLoad(directory, files, listOf("Roughness", "roughness", "Rough")),
            metallic = findAndLoad(directory, files, listOf("Metalness", "Metallic", "metallic", "Metal")),
            ao = findAndLoad(directory, files, listOf("AmbientOcclusion", "AO", "ao")),
        )
    }

    /**
     * Loads a PBR texture set from a directory on disk (e.g. downloaded cache).
     */
    fun loadFromDirectory(dir: File): PbrTextureSet {
        val files = dir.listFiles()?.map { it.name } ?: emptyList()
        val path = dir.absolutePath

        return PbrTextureSet(
            albedo = findAndLoadFile(path, files, listOf("Color", "Diffuse", "BaseColor", "Albedo")),
            normal = findAndLoadFile(path, files, listOf("NormalGL", "Normal", "NormalDX")),
            roughness = findAndLoadFile(path, files, listOf("Roughness", "Rough")),
            metallic = findAndLoadFile(path, files, listOf("Metalness", "Metallic", "Metal")),
            ao = findAndLoadFile(path, files, listOf("AmbientOcclusion", "AO")),
        )
    }

    /**
     * Applies a PBR texture set to a MaterialInstance.
     */
    fun applyToMaterial(textureSet: PbrTextureSet, materialInstance: MaterialInstance) {
        val sampler = com.google.android.filament.TextureSampler(
            com.google.android.filament.TextureSampler.MinFilter.LINEAR_MIPMAP_LINEAR,
            com.google.android.filament.TextureSampler.MagFilter.LINEAR,
            com.google.android.filament.TextureSampler.WrapMode.REPEAT,
        )

        textureSet.albedo?.let {
            materialInstance.setParameter("baseColorMap", it, sampler)
        }
        textureSet.normal?.let {
            materialInstance.setParameter("normalMap", it, sampler)
        }
        textureSet.roughness?.let {
            materialInstance.setParameter("roughnessMap", it, sampler)
        }
        textureSet.metallic?.let {
            materialInstance.setParameter("metallicMap", it, sampler)
        }
        textureSet.ao?.let {
            materialInstance.setParameter("aoMap", it, sampler)
        }
    }

    /**
     * Creates a Filament Texture from a Bitmap.
     */
    fun createTexture(bitmap: Bitmap): Texture {
        val texture = Texture.Builder()
            .width(bitmap.width)
            .height(bitmap.height)
            .levels(1)
            .sampler(Texture.Sampler.SAMPLER_2D)
            .format(Texture.InternalFormat.RGBA8)
            .build(engine)

        val buffer = ByteBuffer.allocateDirect(bitmap.width * bitmap.height * 4)
        bitmap.copyPixelsToBuffer(buffer)
        buffer.flip()

        texture.setImage(
            engine, 0,
            Texture.PixelBufferDescriptor(
                buffer,
                Texture.Format.RGBA,
                Texture.Type.UBYTE,
            )
        )
        texture.generateMipmaps(engine)

        return texture
    }

    private fun findAndLoad(assetDir: String, files: List<String>, keywords: List<String>): Texture? {
        val match = files.firstOrNull { name ->
            keywords.any { kw -> name.contains(kw, ignoreCase = true) }
                && (name.endsWith(".jpg", true) || name.endsWith(".png", true))
        } ?: return null

        val key = "$assetDir/$match"
        textureCache[key]?.let { return it }

        return try {
            val bitmap = context.assets.open("$assetDir/$match").use { stream ->
                BitmapFactory.decodeStream(stream)
            } ?: return null
            val texture = createTexture(bitmap)
            bitmap.recycle()
            textureCache[key] = texture
            texture
        } catch (e: Exception) {
            null
        }
    }

    private fun findAndLoadFile(dirPath: String, files: List<String>, keywords: List<String>): Texture? {
        val match = files.firstOrNull { name ->
            keywords.any { kw -> name.contains(kw, ignoreCase = true) }
                && (name.endsWith(".jpg", true) || name.endsWith(".png", true))
        } ?: return null

        val key = "$dirPath/$match"
        textureCache[key]?.let { return it }

        return try {
            val bitmap = BitmapFactory.decodeFile("$dirPath/$match") ?: return null
            val texture = createTexture(bitmap)
            bitmap.recycle()
            textureCache[key] = texture
            texture
        } catch (e: Exception) {
            null
        }
    }

    fun destroy() {
        textureCache.values.forEach { engine.destroyTexture(it) }
        textureCache.clear()
    }
}
