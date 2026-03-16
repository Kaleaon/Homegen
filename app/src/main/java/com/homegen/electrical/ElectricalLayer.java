package com.homegen.electrical;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Root data structure for electrical planning saved with a project.
 */
public final class ElectricalLayer {
    private final Map<String, ElectricalNode> nodesById = new LinkedHashMap<>();
    private final Map<String, Circuit> circuitsById = new LinkedHashMap<>();
    private final Map<String, WireRoute> routesById = new LinkedHashMap<>();
    private long version = 0;

    public void addNode(ElectricalNode node) {
        nodesById.put(node.getId(), Objects.requireNonNull(node, "node"));
        version++;
    }

    public void addCircuit(Circuit circuit) {
        circuitsById.put(circuit.getId(), Objects.requireNonNull(circuit, "circuit"));
        version++;
    }

    public void addRoute(WireRoute route) {
        routesById.put(route.getId(), Objects.requireNonNull(route, "route"));
        version++;
    }

    public long getVersion() {
        return version;
    }

    public ElectricalNode getNode(String nodeId) {
        return nodesById.get(nodeId);
    }

    public Circuit getCircuit(String circuitId) {
        return circuitsById.get(circuitId);
    }

    public Collection<ElectricalNode> getNodes() {
        return Collections.unmodifiableCollection(nodesById.values());
    }

    public Collection<Circuit> getCircuits() {
        return Collections.unmodifiableCollection(circuitsById.values());
    }

    public Collection<WireRoute> getRoutes() {
        return Collections.unmodifiableCollection(routesById.values());
    }
}
