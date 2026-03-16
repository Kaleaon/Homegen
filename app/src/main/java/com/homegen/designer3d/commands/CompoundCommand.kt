package com.homegen.designer3d.commands

/**
 * Wraps multiple commands into a single undoable unit.
 */
class CompoundCommand(
    override val description: String,
    private val commands: List<Command>,
) : Command {

    override fun execute() {
        commands.forEach { it.execute() }
    }

    override fun undo() {
        commands.asReversed().forEach { it.undo() }
    }
}
