package com.homegen.ui

import com.homegen.designer3d.storage.ProjectStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectGalleryTest {

    private val testScope = CoroutineScope(Dispatchers.Unconfined + Job())

    @Test
    fun `empty project list returns empty visible projects`() {
        val deletedProjects = mutableListOf<String>()
        val state = ProjectGalleryState(
            undoTimeoutMillis = 4000L,
            scope = testScope,
            onProjectDeleted = { deletedProjects.add(it) },
        )

        val visible = state.getVisibleProjects(emptyList())
        assertTrue(visible.isEmpty())
        assertTrue(deletedProjects.isEmpty())
    }

    @Test
    fun `deleteProject hides project optimistically without calling onProjectDeleted immediately`() {
        val deletedProjects = mutableListOf<String>()
        val state = ProjectGalleryState(
            undoTimeoutMillis = 4000L,
            scope = testScope,
            onProjectDeleted = { deletedProjects.add(it) },
        )

        val project1 = ProjectStorage.ProjectSummary("Project 1", 1000L)
        val project2 = ProjectStorage.ProjectSummary("Project 2", 2000L)
        val projects = listOf(project1, project2)

        // Optimistically delete Project 1
        state.pendingDeletions = setOf("Project 1")

        val visible = state.getVisibleProjects(projects)
        assertEquals(1, visible.size)
        assertEquals("Project 2", visible[0].name)
        assertTrue(deletedProjects.isEmpty())
    }

    @Test
    fun `undoDelete restores project to visible list without triggering onProjectDeleted`() {
        val deletedProjects = mutableListOf<String>()
        val state = ProjectGalleryState(
            undoTimeoutMillis = 4000L,
            scope = testScope,
            onProjectDeleted = { deletedProjects.add(it) },
        )

        val project1 = ProjectStorage.ProjectSummary("Project 1", 1000L)
        val projects = listOf(project1)

        state.pendingDeletions = setOf("Project 1")
        assertEquals(0, state.getVisibleProjects(projects).size)

        // Undo deletion
        state.undoDelete("Project 1")

        val visible = state.getVisibleProjects(projects)
        assertEquals(1, visible.size)
        assertEquals("Project 1", visible[0].name)
        assertTrue(deletedProjects.isEmpty())
    }

    @Test
    fun `commitDeletion invokes onProjectDeleted and removes item from pending`() {
        val deletedProjects = mutableListOf<String>()
        val state = ProjectGalleryState(
            undoTimeoutMillis = 4000L,
            scope = testScope,
            onProjectDeleted = { deletedProjects.add(it) },
        )

        state.pendingDeletions = setOf("Project 1")

        // Commit deletion
        state.commitDeletion("Project 1")

        assertEquals(listOf("Project 1"), deletedProjects)
        assertFalse(state.pendingDeletions.contains("Project 1"))
    }

    @Test
    fun `dispose commits any pending deletions safely`() {
        val deletedProjects = mutableListOf<String>()
        val state = ProjectGalleryState(
            undoTimeoutMillis = 4000L,
            scope = testScope,
            onProjectDeleted = { deletedProjects.add(it) },
        )

        state.pendingDeletions = setOf("Project A", "Project B")

        // Unmount component (dispose)
        state.dispose()

        assertEquals(setOf("Project A", "Project B"), deletedProjects.toSet())
        assertTrue(state.pendingDeletions.isEmpty())
    }

    @Test
    fun `deleting last remaining project transitions gallery to empty state`() {
        val deletedProjects = mutableListOf<String>()
        val state = ProjectGalleryState(
            undoTimeoutMillis = 4000L,
            scope = testScope,
            onProjectDeleted = { deletedProjects.add(it) },
        )

        val singleProject = ProjectStorage.ProjectSummary("Last Project", 1000L)
        val projects = listOf(singleProject)

        // Before deletion: 1 visible project
        assertEquals(1, state.getVisibleProjects(projects).size)

        // Optimistic deletion
        state.pendingDeletions = setOf("Last Project")

        // After deletion: 0 visible projects (triggers empty state composable view)
        val visible = state.getVisibleProjects(projects)
        assertTrue(visible.isEmpty())
    }
}
