package com.homegen.electrical;

/**
 * Simple wiring rules for valid device-to-device connections.
 */
public final class DeviceConnectionValidator {

    public ConnectionValidationResult validate(ElectricalNode from, ElectricalNode to) {
        if (from.getId().equals(to.getId())) {
            return ConnectionValidationResult.invalid("Cannot connect a node to itself.");
        }

        ElectricalNodeType fromType = from.getType();
        ElectricalNodeType toType = to.getType();

        if (fromType == ElectricalNodeType.OUTLET && toType == ElectricalNodeType.SWITCH) {
            return ConnectionValidationResult.invalid("Direct outlet-to-switch connection is not allowed.");
        }

        if (fromType == ElectricalNodeType.PANEL && toType == ElectricalNodeType.PANEL) {
            return ConnectionValidationResult.invalid("Panel-to-panel links are not allowed in this planner.");
        }

        return ConnectionValidationResult.ok();
    }
}
