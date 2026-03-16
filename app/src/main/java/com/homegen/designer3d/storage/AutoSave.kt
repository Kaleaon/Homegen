package com.homegen.designer3d.storage

import com.homegen.designer3d.SceneController
import com.homegen.designer3d.commands.CommandStack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Debounced auto-save triggered by CommandStack version changes.
 */
class AutoSave(
    private val storage: ProjectStorage,
    private val sceneController: SceneController,
    private val commandStack: CommandStack,
    private val projectName: String = "autosave",
    private val intervalMs: Long = 30_000L,
) {
    private var lastSavedVersion = -1L
    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        job = scope.launch {
            while (isActive) {
                delay(intervalMs)
                val currentVersion = commandStack.version
                if (currentVersion != lastSavedVersion) {
                    storage.save(projectName, sceneController.listObjects())
                    lastSavedVersion = currentVersion
                }
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    fun saveNow() {
        storage.save(projectName, sceneController.listObjects())
        lastSavedVersion = commandStack.version
    }
}
