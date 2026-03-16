package com.homegen.electrical;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Color legend + per-circuit load summary helpers.
 */
public final class ElectricalSummary {
    private ElectricalSummary() {
    }

    public static String buildCircuitLegend(ElectricalLayer layer) {
        List<String> entries = new ArrayList<>();
        for (Circuit circuit : layer.getCircuits()) {
            entries.add(circuit.getName() + "(" + circuit.getColorHex() + ")");
        }
        return entries.isEmpty() ? "No circuits" : String.join(", ", entries);
    }

    public static List<String> buildLoadSummary(ElectricalLayer layer) {
        List<String> lines = new ArrayList<>();
        for (Circuit circuit : layer.getCircuits()) {
            double load = 0;
            for (String nodeId : circuit.getNodeIds()) {
                ElectricalNode node = layer.getNode(nodeId);
                if (node != null) {
                    load += node.getExpectedLoadAmps();
                }
                // Missing nodes are silently skipped in the summary — see ElectricalRuleChecker for warnings
            }
            String utilization = String.format(Locale.US, "%.1f%%", (load / circuit.getBreakerAmps()) * 100.0);
            lines.add(circuit.getName() + ": " + load + "A / " + circuit.getBreakerAmps() + "A (" + utilization + ")");
        }
        return lines;
    }
}
