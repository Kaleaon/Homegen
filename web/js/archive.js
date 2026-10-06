// Composite ZIP archive export and import for Homegen project files and IndexedDB textures.
import JSZip from '#jszip';
import { serialize, deserialize } from './model.js';
import { getAllTextureBlobs, saveTextureBlob } from './textureStore.js';

/**
 * Packages plan JSON and IndexedDB binary texture assets into a single ZIP Blob.
 * @param {Object} state Current plan state
 * @returns {Promise<Blob>} ZIP archive Blob
 */
export async function exportProjectZip(state) {
  const zip = new JSZip();
  const jsonText = serialize(state);
  zip.file('plan.json', jsonText);

  const textureBlobs = await getAllTextureBlobs();
  const manifest = [];
  const texFolder = zip.folder('textures');

  for (const item of textureBlobs) {
    if (!item || !item.id || !item.blob) continue;
    let ext = 'png';
    if (item.mimeType?.includes('jpeg') || item.mimeType?.includes('jpg')) ext = 'jpg';
    else if (item.mimeType?.includes('webp')) ext = 'webp';
    else if (item.mimeType?.includes('svg')) ext = 'svg';

    const filename = `${item.id}.${ext}`;
    texFolder.file(filename, item.blob);
    manifest.push({
      id: item.id,
      filename,
      mimeType: item.mimeType || 'image/png',
      name: item.name || item.id,
    });
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Extracts a composite ZIP archive into IndexedDB texture store and returns deserialized plan state.
 * @param {File|Blob|ArrayBuffer} zipSource ZIP file, blob or buffer
 * @returns {Promise<Object>} Deserialized plan state
 */
export async function importProjectZip(zipSource) {
  const zip = await JSZip.loadAsync(zipSource);

  // 1. Locate plan JSON file
  let planFile = zip.file('plan.json');
  if (!planFile) {
    const jsonFiles = zip.file(/\.json$/i);
    planFile = jsonFiles.find((f) => f.name !== 'manifest.json') || jsonFiles[0];
  }
  if (!planFile) {
    throw new Error('No plan JSON document found in ZIP archive.');
  }

  const planText = await planFile.async('string');

  // 2. Read manifest if present
  let manifest = [];
  const manifestFile = zip.file('manifest.json');
  if (manifestFile) {
    try {
      manifest = JSON.parse(await manifestFile.async('string'));
    } catch (e) {
      console.warn('Could not parse manifest.json in ZIP:', e);
    }
  }

  // 3. Extract and save texture assets
  const manifestById = new Map(manifest.map((m) => [m.id, m]));
  const texFiles = zip.file(/^textures\//);

  for (const entry of texFiles) {
    if (entry.dir) continue;
    const pathParts = entry.name.split('/');
    const basename = pathParts[pathParts.length - 1];
    if (!basename) continue;

    const idFromFilename = basename.replace(/\.[^/.]+$/, '');
    const meta = manifestById.get(idFromFilename) || {};
    const textureId = meta.id || idFromFilename;

    const blobData = await entry.async('blob');
    let mimeType = meta.mimeType || 'image/png';
    if (basename.endsWith('.jpg') || basename.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (basename.endsWith('.webp')) mimeType = 'image/webp';
    else if (basename.endsWith('.svg')) mimeType = 'image/svg+xml';

    const typedBlob = new Blob([blobData], { type: mimeType });
    await saveTextureBlob(textureId, typedBlob, {
      name: meta.name || textureId,
      mimeType,
    });
  }

  // 4. Deserialize and return plan state
  return deserialize(planText);
}
