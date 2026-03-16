package com.homegen.electrical.serialization

import kotlinx.serialization.Serializable

@Serializable
data class ElectricalLayerData(
    val nodes: List<ElectricalNodeData> = emptyList(),
    val circuits: List<CircuitData> = emptyList(),
    val routes: List<WireRouteData> = emptyList()
)

@Serializable
data class ElectricalNodeData(
    val id: String,
    val type: String,
    val wallId: String? = null,
    val expectedLoadAmps: Double,
    val location: Vec3Data
)

@Serializable
data class CircuitData(
    val id: String,
    val name: String,
    val colorHex: String,
    val breakerAmps: Double,
    val nodeIds: List<String> = emptyList(),
    val routeIds: List<String> = emptyList()
)

@Serializable
data class WireRouteData(
    val id: String,
    val circuitId: String,
    val fromNodeId: String,
    val toNodeId: String,
    val path: List<Vec3Data>,
    val metadata: Map<String, String> = emptyMap()
)

@Serializable
data class Vec3Data(
    val x: Float,
    val y: Float,
    val z: Float
)
