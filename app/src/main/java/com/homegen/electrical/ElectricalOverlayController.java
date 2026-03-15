package com.homegen.electrical;

/**
 * Enables/disables the electrical mode overlay while reflecting circuit color coding.
 */
public final class ElectricalOverlayController {
    public static final String OVERLAY_ID = "electrical-mode";

    private final EditingContext editingContext;

    public ElectricalOverlayController(EditingContext editingContext) {
        this.editingContext = editingContext;
    }

    public void enable(ElectricalLayer layer) {
        editingContext.showOverlay(OVERLAY_ID);
        String surface = editingContext.isIn3DMode() ? "3D" : "2D";
        editingContext.setOverlayLegend(
                OVERLAY_ID,
                "Electrical mode (" + surface + "): " +
                        ElectricalSummary.buildCircuitLegend(layer)
        );
    }

    public void disable() {
        editingContext.hideOverlay(OVERLAY_ID);
    }
}
