package com.homegen.designer3d.commands

/**
 * Undoable command interface for the Command pattern.
 */
interface Command {
    val description: String
    fun execute()
    fun undo()
}
