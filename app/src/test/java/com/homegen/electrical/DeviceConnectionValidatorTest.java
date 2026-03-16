package com.homegen.electrical;

import com.homegen.designer3d.math.Vector3;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.*;

public class DeviceConnectionValidatorTest {

    private DeviceConnectionValidator validator;

    @Before
    public void setUp() {
        validator = new DeviceConnectionValidator();
    }

    @Test
    public void selfConnectionIsRejected() {
        ElectricalNode node = new ElectricalNode(
                "n1", ElectricalNodeType.OUTLET,
                new Vector3(0f, 0f, 0f), "w1", 5.0
        );
        ConnectionValidationResult result = validator.validate(node, node);
        assertFalse(result.isValid());
        assertTrue(result.getMessage().contains("itself"));
    }

    @Test
    public void outletToSwitchIsRejected() {
        ElectricalNode outlet = new ElectricalNode(
                "n1", ElectricalNodeType.OUTLET,
                new Vector3(0f, 0f, 0f), "w1", 5.0
        );
        ElectricalNode sw = new ElectricalNode(
                "n2", ElectricalNodeType.SWITCH,
                new Vector3(1f, 0f, 0f), "w1", 0
        );
        ConnectionValidationResult result = validator.validate(outlet, sw);
        assertFalse(result.isValid());
    }

    @Test
    public void panelToPanelIsRejected() {
        ElectricalNode p1 = new ElectricalNode(
                "n1", ElectricalNodeType.PANEL,
                new Vector3(0f, 0f, 0f), "w1", 0
        );
        ElectricalNode p2 = new ElectricalNode(
                "n2", ElectricalNodeType.PANEL,
                new Vector3(1f, 0f, 0f), "w2", 0
        );
        ConnectionValidationResult result = validator.validate(p1, p2);
        assertFalse(result.isValid());
    }

    @Test
    public void panelToOutletIsAccepted() {
        ElectricalNode panel = new ElectricalNode(
                "n1", ElectricalNodeType.PANEL,
                new Vector3(0f, 0f, 0f), "w1", 0
        );
        ElectricalNode outlet = new ElectricalNode(
                "n2", ElectricalNodeType.OUTLET,
                new Vector3(1f, 0f, 0f), "w1", 5.0
        );
        ConnectionValidationResult result = validator.validate(panel, outlet);
        assertTrue(result.isValid());
    }

    @Test
    public void switchToFixtureIsAccepted() {
        ElectricalNode sw = new ElectricalNode(
                "n1", ElectricalNodeType.SWITCH,
                new Vector3(0f, 0f, 0f), "w1", 0
        );
        ElectricalNode fixture = new ElectricalNode(
                "n2", ElectricalNodeType.FIXTURE,
                new Vector3(1f, 0f, 0f), "w1", 2.0
        );
        ConnectionValidationResult result = validator.validate(sw, fixture);
        assertTrue(result.isValid());
    }
}
