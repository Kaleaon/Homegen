package com.homegen.ui

import com.homegen.electrical.EditingContext

/**
 * Concrete EditingContext backed by callback functions wired to Compose state.
 */
class AndroidEditingContext(
    private val onShowOverlay: (String) -> Unit,
    private val onHideOverlay: (String) -> Unit,
    private val onSetLegend: (String, String) -> Unit,
    private var is3DMode: Boolean = true
) : EditingContext {

    override fun isIn3DMode(): Boolean = is3DMode

    fun setIs3DMode(mode: Boolean) {
        is3DMode = mode
    }

    override fun showOverlay(overlayId: String) {
        onShowOverlay(overlayId)
    }

    override fun hideOverlay(overlayId: String) {
        onHideOverlay(overlayId)
    }

    override fun setOverlayLegend(overlayId: String, legendText: String) {
        onSetLegend(overlayId, legendText)
    }
}
