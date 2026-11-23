package com.homegen.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.homegen.spatial.BasemapPreset
import com.homegen.spatial.GisApiKeyStore
import com.homegen.spatial.GisIngestionClient
import com.homegen.spatial.IngestedSiteBundle
import com.homegen.spatial.SpatialCoreJni
import com.ktheme.android.ui.KthemeButton
import com.ktheme.android.ui.KthemeButtonVariant
import com.ktheme.android.ui.KthemeDialog
import com.ktheme.android.ui.KthemeText
import com.ktheme.android.ui.KthemeTextVariant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun GisImportDialog(
    keyStore: GisApiKeyStore,
    gisClient: GisIngestionClient,
    spatialCore: SpatialCoreJni,
    onImported: (IngestedSiteBundle) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("37.7749, -122.4194") }
    var googleApiKey by remember { mutableStateOf(keyStore.getGoogleMapsApiKey()) }
    var includeElevation by remember { mutableStateOf(true) }
    var selectedPreset by remember { mutableStateOf(BasemapPreset.OPENSTREETMAP) }
    var statusMessage by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }

    KthemeDialog(
        onDismissRequest = { if (!isBusy) onDismiss() },
        title = { KthemeText("Direct GIS Site Ingestion") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { KthemeText("Site Address or Lat, Lon") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = googleApiKey,
                    onValueChange = {
                        googleApiKey = it
                        keyStore.setGoogleMapsApiKey(it)
                    },
                    label = { KthemeText("Google Maps API Key (Local Only)") },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(
                        BasemapPreset.OPENSTREETMAP,
                        BasemapPreset.USGS_TOPO,
                        BasemapPreset.GOOGLE_SATELLITE,
                    ).forEach { preset ->
                        KthemeButton(
                            onClick = { selectedPreset = preset },
                            variant = if (selectedPreset == preset) {
                                KthemeButtonVariant.Brand
                            } else {
                                KthemeButtonVariant.Tonal
                            },
                        ) {
                            KthemeText(preset.provider)
                        }
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Checkbox(
                        checked = includeElevation,
                        onCheckedChange = { includeElevation = it },
                    )
                    KthemeText(
                        text = "Fetch live elevation grid & contours",
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                KthemeButton(
                    onClick = {
                        isBusy = true
                        statusMessage = "Geocoding site coordinates..."
                        scope.launch {
                            try {
                                val match = withContext(Dispatchers.IO) {
                                    gisClient.geocode(query)
                                }
                                statusMessage = "Matched: ${match.displayName} (${match.lat}, ${match.lon})"
                            } catch (e: Exception) {
                                statusMessage = "Lookup error: ${e.message}"
                            } finally {
                                isBusy = false
                            }
                        }
                    },
                    enabled = !isBusy && query.isNotBlank(),
                    variant = KthemeButtonVariant.Tonal,
                ) {
                    KthemeText("Preview Coordinates")
                }
                if (statusMessage.isNotEmpty()) {
                    KthemeText(
                        text = statusMessage,
                        variant = KthemeTextVariant.Muted,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !isBusy && query.isNotBlank(),
                onClick = {
                    isBusy = true
                    keyStore.setGoogleMapsApiKey(googleApiKey)
                    statusMessage = "Importing parcel boundaries, terrain & basemap..."
                    scope.launch {
                        try {
                            val bundle = withContext(Dispatchers.IO) {
                                gisClient.ingestSite(
                                    query = query,
                                    spatialCore = spatialCore,
                                    includeElevation = includeElevation,
                                    basemapPreset = selectedPreset,
                                )
                            }
                            onImported(bundle)
                        } catch (e: Exception) {
                            statusMessage = "Import failed: ${e.message}"
                        } finally {
                            isBusy = false
                        }
                    }
                },
            ) {
                KthemeText("Import Site")
            }
        },
        dismissButton = {
            TextButton(
                enabled = !isBusy,
                onClick = onDismiss,
            ) {
                KthemeText("Cancel")
            }
        },
        modifier = modifier,
    )
}
