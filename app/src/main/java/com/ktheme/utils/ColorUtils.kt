package com.ktheme.utils

/**
 * Color utilities for Ktheme.
 */
object ColorUtils {

    /**
     * Parse hex to Android color int
     */
    fun hexToColorInt(hex: String): Int {
        val cleanHex = hex.removePrefix("#")
        return when (cleanHex.length) {
            6 -> ("FF$cleanHex").toLong(16).toInt()
            8 -> cleanHex.toLong(16).toInt()
            else -> throw IllegalArgumentException("Invalid hex color: $hex")
        }
    }
}
