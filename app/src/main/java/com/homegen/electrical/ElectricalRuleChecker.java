package com.homegen.electrical;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Basic electrical validation checks for planner feedback.
 */
public final class ElectricalRuleChecker {

    private long cachedVersion = -1;
    private List<String> cachedIssues;

    public List<String> run(ElectricalLayer layer) {
        if (cachedIssues != null && layer.getVersion() == cachedVersion) {
            return cachedIssues;
        }

        List<String> issues = new ArrayList<>();
        issues.addAll(checkUnconnectedNodes(layer));
        issues.addAll(checkCircuitOverload(layer));
        cachedVersion = layer.getVersion();
        cachedIssues = Collections.unmodifiableList(issues);
        return cachedIssues;
    }

    private List<String> checkUnconnectedNodes(ElectricalLayer layer) {
        Set<String> connected = new HashSet<>();
        for (WireRoute route : layer.getRoutes()) {
            connected.add(route.getFromNodeId());
            connected.add(route.getToNodeId());
        }

        List<String> issues = new ArrayList<>();
        for (ElectricalNode node : layer.getNodes()) {
            if (!connected.contains(node.getId())) {
                issues.add("Node '" + node.getId() + "' is unconnected.");
            }
        }
        return issues;
    }

    private List<String> checkCircuitOverload(ElectricalLayer layer) {
        List<String> issues = new ArrayList<>();
        for (Circuit circuit : layer.getCircuits()) {
            double load = 0;
            for (String nodeId : circuit.getNodeIds()) {
                ElectricalNode node = layer.getNode(nodeId);
                if (node != null) {
                    load += node.getExpectedLoadAmps();
                } else {
                    issues.add("Circuit '" + circuit.getName() + "' references unknown node '" + nodeId + "'.");
                }
            }
            if (load > circuit.getBreakerAmps()) {
                issues.add("Circuit '" + circuit.getName() + "' is overloaded: " + load + "A > " + circuit.getBreakerAmps() + "A.");
            }
        }
        return issues;
    }
}
