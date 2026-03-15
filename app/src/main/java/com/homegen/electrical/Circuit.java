package com.homegen.electrical;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Circuit metadata and assignment for electrical devices/routes.
 */
public final class Circuit {
    private final String id;
    private final String name;
    private final String colorHex;
    private final double breakerAmps;
    private final List<String> nodeIds;
    private final List<String> routeIds;

    public Circuit(
            String id,
            String name,
            String colorHex,
            double breakerAmps,
            List<String> nodeIds,
            List<String> routeIds
    ) {
        this.id = Objects.requireNonNull(id, "id");
        this.name = Objects.requireNonNull(name, "name");
        this.colorHex = Objects.requireNonNull(colorHex, "colorHex");
        this.breakerAmps = breakerAmps;
        this.nodeIds = Collections.unmodifiableList(new ArrayList<>(
                nodeIds == null ? Collections.emptyList() : nodeIds));
        this.routeIds = Collections.unmodifiableList(new ArrayList<>(
                routeIds == null ? Collections.emptyList() : routeIds));
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getColorHex() {
        return colorHex;
    }

    public double getBreakerAmps() {
        return breakerAmps;
    }

    public List<String> getNodeIds() {
        return nodeIds;
    }

    public List<String> getRouteIds() {
        return routeIds;
    }
}
