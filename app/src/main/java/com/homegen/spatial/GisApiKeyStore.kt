package com.homegen.spatial

import android.content.Context
import android.content.SharedPreferences

/**
 * Local-only storage for user-supplied Google Maps API keys backed by Android SharedPreferences.
 * Keys are never written into ProjectFile or exported archives.
 */
class GisApiKeyStore(
    private val prefs: SharedPreferences?,
) {
    private var inMemoryFallbackKey: String = ""

    constructor(context: Context) : this(
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
    )

    fun getGoogleMapsApiKey(): String {
        val stored = if (prefs != null) {
            prefs.getString(KEY_GOOGLE_MAPS_API_KEY, "") ?: ""
        } else {
            inMemoryFallbackKey
        }
        return stored.trim()
    }

    fun setGoogleMapsApiKey(apiKey: String?) {
        val cleaned = apiKey?.trim().orEmpty()
        if (prefs != null) {
            val editor = prefs.edit()
            if (cleaned.isEmpty()) {
                editor.remove(KEY_GOOGLE_MAPS_API_KEY)
            } else {
                editor.putString(KEY_GOOGLE_MAPS_API_KEY, cleaned)
            }
            editor.apply()
        } else {
            inMemoryFallbackKey = cleaned
        }
    }

    fun clearGoogleMapsApiKey() {
        setGoogleMapsApiKey("")
    }

    companion object {
        const val PREFS_NAME = "homegen_gis_prefs"
        const val KEY_GOOGLE_MAPS_API_KEY = "google_maps_api_key"

        fun inMemoryForTesting(initialKey: String = ""): GisApiKeyStore {
            return GisApiKeyStore(prefs = null).also {
                it.setGoogleMapsApiKey(initialKey)
            }
        }
    }
}
