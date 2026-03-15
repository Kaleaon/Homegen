package com.homegen.electrical;

/**
 * Adapter over whichever 2D/3D editor host this module integrates with.
 */
public interface EditingContext {
    boolean isIn3DMode();

    void showOverlay(String overlayId);

    void hideOverlay(String overlayId);

    void setOverlayLegend(String overlayId, String legendText);
}
