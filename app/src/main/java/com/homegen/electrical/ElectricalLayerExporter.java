package com.homegen.electrical;

/**
 * Exports electrical layer data as a JSON fragment suitable for project save files.
 */
public final class ElectricalLayerExporter {

    public String exportAsJson(ElectricalLayer layer) {
        StringBuilder builder = new StringBuilder();
        builder.append("{\"electricalLayer\":{");
        appendNodes(builder, layer);
        builder.append(',');
        appendCircuits(builder, layer);
        builder.append(',');
        appendRoutes(builder, layer);
        builder.append("}}\n");
        return builder.toString();
    }

    private void appendNodes(StringBuilder builder, ElectricalLayer layer) {
        builder.append("\"nodes\":[");
        boolean first = true;
        for (ElectricalNode node : layer.getNodes()) {
            if (!first) {
                builder.append(',');
            }
            first = false;
            builder.append('{')
                    .append("\"id\":\"").append(escape(node.getId())).append("\",")
                    .append("\"type\":\"").append(node.getType().name()).append("\",")
                    .append("\"wallId\":\"").append(escape(node.getWallId())).append("\",")
                    .append("\"expectedLoadAmps\":").append(node.getExpectedLoadAmps()).append(',')
                    .append("\"location\":{")
                    .append("\"x\":").append(node.getLocation().getX()).append(',')
                    .append("\"y\":").append(node.getLocation().getY()).append(',')
                    .append("\"z\":").append(node.getLocation().getZ())
                    .append("}}");
        }
        builder.append(']');
    }

    private void appendCircuits(StringBuilder builder, ElectricalLayer layer) {
        builder.append("\"circuits\":[");
        boolean first = true;
        for (Circuit circuit : layer.getCircuits()) {
            if (!first) {
                builder.append(',');
            }
            first = false;
            builder.append('{')
                    .append("\"id\":\"").append(escape(circuit.getId())).append("\",")
                    .append("\"name\":\"").append(escape(circuit.getName())).append("\",")
                    .append("\"colorHex\":\"").append(escape(circuit.getColorHex())).append("\",")
                    .append("\"breakerAmps\":").append(circuit.getBreakerAmps())
                    .append('}');
        }
        builder.append(']');
    }

    private void appendRoutes(StringBuilder builder, ElectricalLayer layer) {
        builder.append("\"routes\":[");
        boolean firstRoute = true;
        for (WireRoute route : layer.getRoutes()) {
            if (!firstRoute) {
                builder.append(',');
            }
            firstRoute = false;
            builder.append('{')
                    .append("\"id\":\"").append(escape(route.getId())).append("\",")
                    .append("\"circuitId\":\"").append(escape(route.getCircuitId())).append("\",")
                    .append("\"fromNodeId\":\"").append(escape(route.getFromNodeId())).append("\",")
                    .append("\"toNodeId\":\"").append(escape(route.getToNodeId())).append("\",")
                    .append("\"path\":[");

            boolean firstPoint = true;
            for (Vector3 point : route.getPath()) {
                if (!firstPoint) {
                    builder.append(',');
                }
                firstPoint = false;
                builder.append('{')
                        .append("\"x\":").append(point.getX()).append(',')
                        .append("\"y\":").append(point.getY()).append(',')
                        .append("\"z\":").append(point.getZ())
                        .append('}');
            }

            builder.append("],\"metadata\":{");
            boolean firstMeta = true;
            for (java.util.Map.Entry<String, String> entry : route.getMetadata().entrySet()) {
                if (!firstMeta) {
                    builder.append(',');
                }
                firstMeta = false;
                builder.append('\"').append(escape(entry.getKey())).append("\":\"")
                        .append(escape(entry.getValue())).append('\"');
            }
            builder.append("}}");
        }
        builder.append(']');
    }

    private String escape(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
