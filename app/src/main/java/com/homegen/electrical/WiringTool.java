package com.homegen.electrical;

import com.homegen.designer3d.math.Vector3;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Builds wire routes with wall snapping and endpoint validation.
 */
public final class WiringTool {
    private final WallSnapper wallSnapper;
    private final DeviceConnectionValidator validator;

    public WiringTool(WallSnapper wallSnapper, DeviceConnectionValidator validator) {
        this.wallSnapper = wallSnapper;
        this.validator = validator;
    }

    public WireRoute createRoute(
            Circuit circuit,
            ElectricalNode from,
            ElectricalNode to,
            List<Vector3> rawPath,
            Map<String, String> metadata
    ) {
        ConnectionValidationResult result = validator.validate(from, to);
        if (!result.isValid()) {
            throw new IllegalArgumentException("Invalid connection: " + result.getMessage());
        }

        List<Vector3> snapped = new ArrayList<>(rawPath.size());
        for (Vector3 point : rawPath) {
            snapped.add(wallSnapper.snapToNearestWall(point));
        }

        return new WireRoute(
                UUID.randomUUID().toString(),
                circuit.getId(),
                from.getId(),
                to.getId(),
                snapped,
                metadata
        );
    }
}
