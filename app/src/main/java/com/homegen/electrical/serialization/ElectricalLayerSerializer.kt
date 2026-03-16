package com.homegen.electrical.serialization

import com.homegen.designer3d.math.Vector3
import com.homegen.electrical.Circuit
import com.homegen.electrical.ElectricalLayer
import com.homegen.electrical.ElectricalNode
import com.homegen.electrical.ElectricalNodeType
import com.homegen.electrical.WireRoute
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Replaces the old manual-JSON ElectricalLayerExporter with
 * kotlinx.serialization and adds deserialization (import) support.
 */
object ElectricalLayerSerializer {

    private val json = Json {
        ignoreUnknownKeys = true
        prettyPrint = false
    }

    fun encode(layer: ElectricalLayer): String {
        val data = ElectricalLayerData(
            nodes = layer.nodes.map { node ->
                ElectricalNodeData(
                    id = node.id,
                    type = node.type.name,
                    wallId = node.wallId,
                    expectedLoadAmps = node.expectedLoadAmps,
                    location = Vec3Data(node.location.x, node.location.y, node.location.z)
                )
            },
            circuits = layer.circuits.map { circuit ->
                CircuitData(
                    id = circuit.id,
                    name = circuit.name,
                    colorHex = circuit.colorHex,
                    breakerAmps = circuit.breakerAmps,
                    nodeIds = circuit.nodeIds,
                    routeIds = circuit.routeIds
                )
            },
            routes = layer.routes.map { route ->
                WireRouteData(
                    id = route.id,
                    circuitId = route.circuitId,
                    fromNodeId = route.fromNodeId,
                    toNodeId = route.toNodeId,
                    path = route.path.map { Vec3Data(it.x, it.y, it.z) },
                    metadata = route.metadata
                )
            }
        )
        return json.encodeToString(data)
    }

    fun decode(jsonString: String): ElectricalLayer {
        val data = json.decodeFromString<ElectricalLayerData>(jsonString)
        val layer = ElectricalLayer()

        for (nodeData in data.nodes) {
            layer.addNode(
                ElectricalNode(
                    nodeData.id,
                    ElectricalNodeType.valueOf(nodeData.type),
                    Vector3(nodeData.location.x, nodeData.location.y, nodeData.location.z),
                    nodeData.wallId,
                    nodeData.expectedLoadAmps
                )
            )
        }

        for (circuitData in data.circuits) {
            layer.addCircuit(
                Circuit(
                    circuitData.id,
                    circuitData.name,
                    circuitData.colorHex,
                    circuitData.breakerAmps,
                    circuitData.nodeIds,
                    circuitData.routeIds
                )
            )
        }

        for (routeData in data.routes) {
            layer.addRoute(
                WireRoute(
                    routeData.id,
                    routeData.circuitId,
                    routeData.fromNodeId,
                    routeData.toNodeId,
                    routeData.path.map { Vector3(it.x, it.y, it.z) },
                    routeData.metadata
                )
            )
        }

        return layer
    }
}
