package com.homegen.electrical;

import java.util.Objects;

/**
 * A power device or distribution point in the electrical layer.
 */
public final class ElectricalNode {
    private final String id;
    private final ElectricalNodeType type;
    private final Vector3 location;
    private final String wallId;
    private final double expectedLoadAmps;

    public ElectricalNode(
            String id,
            ElectricalNodeType type,
            Vector3 location,
            String wallId,
            double expectedLoadAmps
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.type = Objects.requireNonNull(type, "type");
        this.location = Objects.requireNonNull(location, "location");
        this.wallId = wallId;
        this.expectedLoadAmps = expectedLoadAmps;
    }

    public String getId() {
        return id;
    }

    public ElectricalNodeType getType() {
        return type;
    }

    public Vector3 getLocation() {
        return location;
    }

    public String getWallId() {
        return wallId;
    }

    public double getExpectedLoadAmps() {
        return expectedLoadAmps;
    }
}
