package com.homegen.templates.data

import com.homegen.templates.model.RoomType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomTemplateRepositoryTest {

    @Test
    fun `allTemplates returns non-empty list of initial templates`() {
        val templates = RoomTemplateRepository.allTemplates()
        assertTrue(templates.isNotEmpty())
    }

    @Test
    fun `filterByType for populated category returns matching templates`() {
        val livingRooms = RoomTemplateRepository.filterByType(RoomType.LIVING_ROOM)
        assertTrue(livingRooms.isNotEmpty())
        assertTrue(livingRooms.all { it.roomType == RoomType.LIVING_ROOM })

        val bedrooms = RoomTemplateRepository.filterByType(RoomType.BEDROOM)
        assertTrue(bedrooms.isNotEmpty())
        assertTrue(bedrooms.all { it.roomType == RoomType.BEDROOM })
    }

    @Test
    fun `filterByType for empty categories returns empty list`() {
        val entrywayTemplates = RoomTemplateRepository.filterByType(RoomType.ENTRYWAY)
        assertTrue(entrywayTemplates.isEmpty())

        val laundryTemplates = RoomTemplateRepository.filterByType(RoomType.LAUNDRY)
        assertTrue(laundryTemplates.isEmpty())
    }

    @Test
    fun `clearing filter or querying allTemplates restores all templates`() {
        val filtered = RoomTemplateRepository.filterByType(RoomType.ENTRYWAY)
        assertTrue(filtered.isEmpty())

        val restored = RoomTemplateRepository.allTemplates()
        assertEquals(RoomTemplateRepository.allTemplates().size, restored.size)
        assertTrue(restored.isNotEmpty())
    }

    @Test
    fun `filterByStyle returns matching templates`() {
        val scandiTemplates = RoomTemplateRepository.filterByStyle("scandinavian")
        assertTrue(scandiTemplates.isNotEmpty())
        assertTrue(scandiTemplates.all { it.styleId == "scandinavian" })

        val unknownStyle = RoomTemplateRepository.filterByStyle("non_existent_style")
        assertTrue(unknownStyle.isEmpty())
    }

    @Test
    fun `findById finds existing template and returns null for non-existent`() {
        val found = RoomTemplateRepository.findById("living_scandi_compact")
        assertNotNull(found)
        assertEquals("Compact Scandinavian Living", found?.name)

        val notFound = RoomTemplateRepository.findById("invalid_id")
        assertNull(notFound)
    }
}
