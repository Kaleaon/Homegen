package com.homegen.electrical;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Represents a polyline route for wiring and route-level metadata.
 */
public final class WireRoute {
    private final String id;
    private final String circuitId;
    private final String fromNodeId;
    private final String toNodeId;
    private final List<Vector3> path;
    private final Map<String, String> metadata;

    public WireRoute(
            String id,
            String circuitId,
            String fromNodeId,
            String toNodeId,
            List<Vector3> path,
            Map<String, String> metadata
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.circuitId = Objects.requireNonNull(circuitId, "circuitId");
        this.fromNodeId = Objects.requireNonNull(fromNodeId, "fromNodeId");
        this.toNodeId = Objects.requireNonNull(toNodeId, "toNodeId");
        if (path == null || path.size() < 2) {
            throw new IllegalArgumentException("Wire route path must include at least two points.");
        }
        this.path = Collections.unmodifiableList(new ArrayList<>(path));
        this.metadata = Collections.unmodifiableMap(new LinkedHashMap<>(
                metadata == null ? Collections.emptyMap() : metadata));
    }

    public String getId() {
        return id;
    }

    public String getCircuitId() {
        return circuitId;
    }

    public String getFromNodeId() {
        return fromNodeId;
    }

    public String getToNodeId() {
        return toNodeId;
    }

    public List<Vector3> getPath() {
        return path;
    }

    public Map<String, String> getMetadata() {
        return metadata;
    }

    public double totalLength() {
        double total = 0;
        for (int i = 1; i < path.size(); i++) {
            total += path.get(i - 1).distanceTo(path.get(i));
        }
        return total;
    }
}
