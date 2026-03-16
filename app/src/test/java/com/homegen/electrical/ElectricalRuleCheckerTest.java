package com.homegen.electrical;

import com.homegen.designer3d.math.Vector3;
import org.junit.Before;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;

public class ElectricalRuleCheckerTest {

    private ElectricalRuleChecker checker;

    @Before
    public void setUp() {
        checker = new ElectricalRuleChecker();
    }

    @Test
    public void emptyLayerReturnsNoIssues() {
        ElectricalLayer layer = new ElectricalLayer();
        List<String> issues = checker.run(layer);
        assertTrue(issues.isEmpty());
    }

    @Test
    public void unconnectedNodeIsReported() {
        ElectricalLayer layer = new ElectricalLayer();
        layer.addNode(new ElectricalNode(
                "n1", ElectricalNodeType.OUTLET,
                new Vector3(0f, 0f, 0f), "w1", 5.0
        ));

        List<String> issues = checker.run(layer);
        assertEquals(1, issues.size());
        assertTrue(issues.get(0).contains("unconnected"));
    }

    @Test
    public void connectedNodeIsNotReported() {
        ElectricalLayer layer = new ElectricalLayer();
        ElectricalNode n1 = new ElectricalNode("n1", ElectricalNodeType.PANEL,
                new Vector3(0f, 0f, 0f), "w1", 0);
        ElectricalNode n2 = new ElectricalNode("n2", ElectricalNodeType.OUTLET,
                new Vector3(1f, 0f, 0f), "w1", 5.0);
        layer.addNode(n1);
        layer.addNode(n2);

        layer.addRoute(new WireRoute(
                "r1", "c1", "n1", "n2",
                Arrays.asList(new Vector3(0f, 0f, 0f), new Vector3(1f, 0f, 0f)),
                null
        ));

        List<String> issues = checker.run(layer);
        assertTrue("Connected nodes should have no unconnected issues",
                issues.stream().noneMatch(i -> i.contains("unconnected")));
    }

    @Test
    public void circuitOverloadIsReported() {
        ElectricalLayer layer = new ElectricalLayer();
        layer.addNode(new ElectricalNode("n1", ElectricalNodeType.OUTLET,
                new Vector3(0f, 0f, 0f), "w1", 20.0));
        layer.addCircuit(new Circuit("c1", "Kitchen", "#FF0000", 15.0,
                Collections.singletonList("n1"), Collections.emptyList()));

        List<String> issues = checker.run(layer);
        assertTrue(issues.stream().anyMatch(i -> i.contains("overloaded")));
    }

    @Test
    public void circuitWithinLimitIsNotReported() {
        ElectricalLayer layer = new ElectricalLayer();
        layer.addNode(new ElectricalNode("n1", ElectricalNodeType.OUTLET,
                new Vector3(0f, 0f, 0f), "w1", 10.0));
        layer.addCircuit(new Circuit("c1", "Kitchen", "#FF0000", 15.0,
                Collections.singletonList("n1"), Collections.emptyList()));

        List<String> issues = checker.run(layer);
        assertTrue(issues.stream().noneMatch(i -> i.contains("overloaded")));
    }

    @Test
    public void unknownNodeIdInCircuitIsReported() {
        ElectricalLayer layer = new ElectricalLayer();
        layer.addCircuit(new Circuit("c1", "Kitchen", "#FF0000", 15.0,
                Collections.singletonList("nonexistent"), Collections.emptyList()));

        List<String> issues = checker.run(layer);
        assertTrue(issues.stream().anyMatch(i -> i.contains("unknown node")));
    }
}
