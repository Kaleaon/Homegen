package com.homegen.designer3d.rendering

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Shared direct [ByteBuffer] allocation helpers for native Filament vertex, index, and texture buffers.
 */
object BufferUtils {

    /**
     * Allocates a native-ordered direct [ByteBuffer] populated with [data] and rewound to position 0.
     */
    fun toFloatBuffer(data: FloatArray): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(data.size * Float.SIZE_BYTES).order(ByteOrder.nativeOrder())
        buf.asFloatBuffer().put(data)
        buf.rewind()
        return buf
    }

    /**
     * Allocates a native-ordered direct [ByteBuffer] populated with [data] and rewound to position 0.
     */
    fun toShortBuffer(data: ShortArray): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(data.size * Short.SIZE_BYTES).order(ByteOrder.nativeOrder())
        buf.asShortBuffer().put(data)
        buf.rewind()
        return buf
    }

    /**
     * Allocates a native-ordered direct [ByteBuffer] populated with [data] and rewound to position 0.
     */
    fun toIntBuffer(data: IntArray): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(data.size * Int.SIZE_BYTES).order(ByteOrder.nativeOrder())
        buf.asIntBuffer().put(data)
        buf.rewind()
        return buf
    }
}
