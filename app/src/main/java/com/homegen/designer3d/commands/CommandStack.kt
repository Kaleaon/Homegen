package com.homegen.designer3d.commands

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Manages undo/redo stacks and exposes observable state for UI binding.
 */
class CommandStack {

    private val undoStack = mutableListOf<Command>()
    private val redoStack = mutableListOf<Command>()

    private val _canUndo = MutableStateFlow(false)
    val canUndo: StateFlow<Boolean> = _canUndo.asStateFlow()

    private val _canRedo = MutableStateFlow(false)
    val canRedo: StateFlow<Boolean> = _canRedo.asStateFlow()

    /** Version counter incremented on every mutation; useful for auto-save triggers. */
    var version: Long = 0L
        private set

    fun execute(command: Command) {
        command.execute()
        undoStack.add(command)
        redoStack.clear()
        version++
        updateState()
    }

    fun undo() {
        val cmd = undoStack.removeLastOrNull() ?: return
        cmd.undo()
        redoStack.add(cmd)
        version++
        updateState()
    }

    fun redo() {
        val cmd = redoStack.removeLastOrNull() ?: return
        cmd.execute()
        undoStack.add(cmd)
        version++
        updateState()
    }

    fun clear() {
        undoStack.clear()
        redoStack.clear()
        version++
        updateState()
    }

    private fun updateState() {
        _canUndo.value = undoStack.isNotEmpty()
        _canRedo.value = redoStack.isNotEmpty()
    }
}
