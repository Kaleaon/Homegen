package com.homegen.designer3d.rendering

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteOrder

class BufferUtilsTest {

    @Test
    fun toFloatBufferAllocatesDirectNativeBufferRewoundWithExpectedContents() {
        val input = floatArrayOf(-1.5f, 0.0f, 3.25f, 42.125f, Float.MAX_VALUE)
        val buf = BufferUtils.toFloatBuffer(input)

        assertTrue(buf.isDirect)
        assertEquals(ByteOrder.nativeOrder(), buf.order())
        assertEquals(0, buf.position())
        assertEquals(input.size * Float.SIZE_BYTES, buf.limit())
        assertEquals(input.size * Float.SIZE_BYTES, buf.capacity())

        for (i in input.indices) {
            assertEquals(input[i], buf.getFloat(i * Float.SIZE_BYTES), 0.0f)
        }

        val readBack = FloatArray(input.size)
        buf.asFloatBuffer().get(readBack)
        assertArrayEquals(input, readBack, 0.0f)
        assertEquals(0, buf.position())
    }

    @Test
    fun toShortBufferAllocatesDirectNativeBufferRewoundWithExpectedContents() {
        val input = shortArrayOf(Short.MIN_VALUE, -7, 0, 12, Short.MAX_VALUE)
        val buf = BufferUtils.toShortBuffer(input)

        assertTrue(buf.isDirect)
        assertEquals(ByteOrder.nativeOrder(), buf.order())
        assertEquals(0, buf.position())
        assertEquals(input.size * Short.SIZE_BYTES, buf.limit())
        assertEquals(input.size * Short.SIZE_BYTES, buf.capacity())

        for (i in input.indices) {
            assertEquals(input[i], buf.getShort(i * Short.SIZE_BYTES))
        }

        val readBack = ShortArray(input.size)
        buf.asShortBuffer().get(readBack)
        assertArrayEquals(input, readBack)
        assertEquals(0, buf.position())
    }

    @Test
    fun toIntBufferAllocatesDirectNativeBufferRewoundWithExpectedContents() {
        val input = intArrayOf(Int.MIN_VALUE, -1024, 0, 65536, Int.MAX_VALUE)
        val buf = BufferUtils.toIntBuffer(input)

        assertTrue(buf.isDirect)
        assertEquals(ByteOrder.nativeOrder(), buf.order())
        assertEquals(0, buf.position())
        assertEquals(input.size * Int.SIZE_BYTES, buf.limit())
        assertEquals(input.size * Int.SIZE_BYTES, buf.capacity())

        for (i in input.indices) {
            assertEquals(input[i], buf.getInt(i * Int.SIZE_BYTES))
        }

        val readBack = IntArray(input.size)
        buf.asIntBuffer().get(readBack)
        assertArrayEquals(input, readBack)
        assertEquals(0, buf.position())
    }

    @Test
    fun emptyArraysReturnZeroCapacityDirectNativeBuffers() {
        val emptyFloats = BufferUtils.toFloatBuffer(floatArrayOf())
        assertTrue(emptyFloats.isDirect)
        assertEquals(ByteOrder.nativeOrder(), emptyFloats.order())
        assertEquals(0, emptyFloats.position())
        assertEquals(0, emptyFloats.limit())
        assertEquals(0, emptyFloats.capacity())

        val emptyShorts = BufferUtils.toShortBuffer(shortArrayOf())
        assertTrue(emptyShorts.isDirect)
        assertEquals(ByteOrder.nativeOrder(), emptyShorts.order())
        assertEquals(0, emptyShorts.position())
        assertEquals(0, emptyShorts.limit())
        assertEquals(0, emptyShorts.capacity())

        val emptyInts = BufferUtils.toIntBuffer(intArrayOf())
        assertTrue(emptyInts.isDirect)
        assertEquals(ByteOrder.nativeOrder(), emptyInts.order())
        assertEquals(0, emptyInts.position())
        assertEquals(0, emptyInts.limit())
        assertEquals(0, emptyInts.capacity())
    }
}
