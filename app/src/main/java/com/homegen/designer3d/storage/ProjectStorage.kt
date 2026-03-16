package com.homegen.designer3d.storage

import android.content.Context
import com.homegen.designer3d.model.HomeObject
import com.homegen.designer3d.serialization.ProjectSerializer
import java.io.File

/**
 * Persists projects as JSON files under the app's private storage.
 */
class ProjectStorage(context: Context) {

    private val projectsDir = File(context.filesDir, "projects").apply { mkdirs() }
    private val serializer = ProjectSerializer()

    fun save(name: String, objects: List<HomeObject>) {
        val json = serializer.encode(objects)
        File(projectsDir, "$name.json").writeText(json)
    }

    fun load(name: String): List<HomeObject> {
        val file = File(projectsDir, "$name.json")
        if (!file.exists()) return emptyList()
        return serializer.decode(file.readText())
    }

    fun delete(name: String): Boolean {
        return File(projectsDir, "$name.json").delete()
    }

    data class ProjectSummary(val name: String, val lastModified: Long)

    fun listProjects(): List<ProjectSummary> {
        return projectsDir.listFiles()
            ?.filter { it.extension == "json" }
            ?.map { ProjectSummary(it.nameWithoutExtension, it.lastModified()) }
            ?.sortedByDescending { it.lastModified }
            ?: emptyList()
    }
}
