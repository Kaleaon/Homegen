package com.homegen.electrical.serialization

import com.homegen.designer3d.math.Vector3
import com.homegen.electrical.Circuit
import com.homegen.electrical.ElectricalLayer
import com.homegen.electrical.ElectricalNode
import com.homegen.electrical.ElectricalNodeType
import com.homegen.electrical.WireRoute
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ElectricalLayerSerializerTest {

    @Test
    fun `empty layer round trips`() {
        val layer = ElectricalLayer()
        val json = ElectricalLayerSerializer.encode(layer)
        val restored = ElectricalLayerSerializer.decode(json)

        assertTrue(restored.nodes.toList().isEmpty())
        assertTrue(restored.circuits.toList().isEmpty())
        assertTrue(restored.routes.toList().isEmpty())
    }

    @Test
    fun `layer with nodes circuits and routes round trips`() {
        val layer = ElectricalLayer()
        layer.addNode(
            ElectricalNode("n1", ElectricalNodeType.PANEL, Vector3(0f, 1f, 2f), "w1", 0.0)
        )
        layer.addNode(
            ElectricalNode("n2", ElectricalNodeType.OUTLET, Vector3(3f, 1f, 2f), "w2", 12.0)
        )
        layer.addCircuit(
            Circuit("c1", "Kitchen", "#FF0000", 20.0, listOf("n1", "n2"), listOf("r1"))
        )
        layer.addRoute(
            WireRoute(
                "r1", "c1", "n1", "n2",
                listOf(Vector3(0f, 1f, 2f), Vector3(1.5f, 1f, 2f), Vector3(3f, 1f, 2f)),
                mapOf("conduit" to "EMT")
            )
        )

        val json = ElectricalLayerSerializer.encode(layer)
        val restored = ElectricalLayerSerializer.decode(json)

        val nodes = restored.nodes.toList()
        assertEquals(2, nodes.size)
        assertEquals("n1", nodes[0].id)
        assertEquals(ElectricalNodeType.PANEL, nodes[0].type)
        assertEquals(0f, nodes[0].location.x)
        assertEquals(12.0, nodes[1].expectedLoadAmps, 0.001)

        val circuits = restored.circuits.toList()
        assertEquals(1, circuits.size)
        assertEquals("Kitchen", circuits[0].name)
        assertEquals("#FF0000", circuits[0].colorHex)
        assertEquals(listOf("n1", "n2"), circuits[0].nodeIds)

        val routes = restored.routes.toList()
        assertEquals(1, routes.size)
        assertEquals(3, routes[0].path.size)
        assertEquals("EMT", routes[0].metadata["conduit"])
    }

    @Test
    fun `decode handles unknown keys gracefully`() {
        val json = """{"nodes":[],"circuits":[],"routes":[],"futureField":"test"}"""
        val layer = ElectricalLayerSerializer.decode(json)
        assertTrue(layer.nodes.toList().isEmpty())
    }
}
