package com.homegen.designer3d.storage

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.OutputStream

/**
 * Captures the current frame and saves it to the device's media store or shares it.
 */
class ScreenshotExporter(private val context: Context) {

    /**
     * Saves a bitmap to the Pictures/Homegen directory in MediaStore.
     * Returns the content URI, or null on failure.
     */
    fun saveToGallery(bitmap: Bitmap, filename: String = "homegen_${System.currentTimeMillis()}.png"): Uri? {
        val contentValues = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, filename)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/Homegen")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }

        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues) ?: return null

        return try {
            resolver.openOutputStream(uri)?.use { stream: OutputStream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }
            uri
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            null
        }
    }

    /**
     * Creates a share intent for the given image URI.
     */
    fun createShareIntent(imageUri: Uri): Intent {
        return Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, imageUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }
}
