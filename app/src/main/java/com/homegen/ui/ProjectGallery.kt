package com.homegen.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.homegen.designer3d.storage.ProjectStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ProjectGalleryState(
    val undoTimeoutMillis: Long = 4000L,
    private val scope: CoroutineScope,
    private val onProjectDeleted: (String) -> Unit,
) {
    var pendingDeletions by mutableStateOf(setOf<String>())

    val pendingJobs = mutableMapOf<String, Job>()

    fun getVisibleProjects(projects: List<ProjectStorage.ProjectSummary>): List<ProjectStorage.ProjectSummary> {
        return projects.filter { it.name !in pendingDeletions }
    }

    fun deleteProject(
        projectName: String,
        snackbarHostState: SnackbarHostState,
    ) {
        pendingDeletions = pendingDeletions + projectName
        val job = scope.launch {
            val result = withTimeoutOrNull(undoTimeoutMillis) {
                snackbarHostState.showSnackbar(
                    message = "Project '$projectName' deleted",
                    actionLabel = "Undo",
                    duration = SnackbarDuration.Indefinite,
                )
            }
            if (result == SnackbarResult.ActionPerformed) {
                undoDelete(projectName)
            } else {
                snackbarHostState.currentSnackbarData?.dismiss()
                commitDeletion(projectName)
            }
        }
        pendingJobs[projectName] = job
    }

    fun undoDelete(projectName: String) {
        pendingJobs[projectName]?.cancel()
        pendingJobs.remove(projectName)
        pendingDeletions = pendingDeletions - projectName
    }

    fun commitDeletion(projectName: String) {
        pendingJobs[projectName]?.cancel()
        pendingJobs.remove(projectName)
        if (projectName in pendingDeletions) {
            onProjectDeleted(projectName)
            pendingDeletions = pendingDeletions - projectName
        }
    }

    fun syncWithProjects(projects: List<ProjectStorage.ProjectSummary>) {
        val existingNames = projects.map { it.name }.toSet()
        pendingDeletions = pendingDeletions.intersect(existingNames)
    }

    fun dispose() {
        val toCommit = pendingDeletions
        pendingJobs.values.forEach { it.cancel() }
        pendingJobs.clear()
        toCommit.forEach { projectName ->
            onProjectDeleted(projectName)
        }
        pendingDeletions = emptySet()
    }
}

@Composable
fun rememberProjectGalleryState(
    undoTimeoutMillis: Long = 4000L,
    onProjectDeleted: (String) -> Unit,
    scope: CoroutineScope = rememberCoroutineScope(),
): ProjectGalleryState {
    return remember(undoTimeoutMillis, onProjectDeleted, scope) {
        ProjectGalleryState(
            undoTimeoutMillis = undoTimeoutMillis,
            scope = scope,
            onProjectDeleted = onProjectDeleted,
        )
    }
}

@Composable
fun EmptyGalleryState(
    onCreateProject: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "No Projects Yet",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Start by creating your first project to draft floor plans and 3D interior designs.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onCreateProject) {
            Text("Create New Project")
        }
    }
}

@Composable
fun ProjectGallery(
    projects: List<ProjectStorage.ProjectSummary>,
    onProjectSelected: (String) -> Unit,
    onProjectDeleted: (String) -> Unit,
    onCreateProject: () -> Unit = {},
    undoTimeoutMillis: Long = 4000L,
    modifier: Modifier = Modifier,
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() },
) {
    val scope = rememberCoroutineScope()
    val state = rememberProjectGalleryState(
        undoTimeoutMillis = undoTimeoutMillis,
        onProjectDeleted = onProjectDeleted,
        scope = scope,
    )

    DisposableEffect(state) {
        onDispose {
            state.dispose()
        }
    }

    LaunchedEffect(projects) {
        state.syncWithProjects(projects)
    }

    val visibleProjects = state.getVisibleProjects(projects)
    val dateFormat = remember { SimpleDateFormat("MMM d, yyyy HH:mm", Locale.getDefault()) }

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            if (visibleProjects.isEmpty()) {
                EmptyGalleryState(
                    onCreateProject = onCreateProject,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(visibleProjects, key = { it.name }) { project ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onProjectSelected(project.name) },
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column {
                                    Text(project.name, style = MaterialTheme.typography.titleMedium)
                                    Text(
                                        dateFormat.format(Date(project.lastModified)),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                TextButton(
                                    onClick = {
                                        state.deleteProject(project.name, snackbarHostState)
                                    },
                                ) {
                                    Text("Delete")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
