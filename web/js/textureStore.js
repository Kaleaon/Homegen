// IndexedDB Blob Texture Store for Homegen
// Manages custom texture binary files in IndexedDB object store `homegen_textures`.

const DB_NAME = 'homegen_db';
const DB_VERSION = 1;
const STORE_NAME = 'homegen_textures';

// In-memory fallback if IndexedDB is unavailable (e.g. Node tests / non-browser)
const memoryStore = new Map();

let dbPromise = null;

function isIDBSupported() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function getDB() {
  if (!isIDBSupported()) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = (err) => {
          console.warn('IndexedDB failed to open, using memory store:', err);
          resolve(null);
        };
      } catch (err) {
        console.warn('IndexedDB exception, using memory store:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function saveTextureBlob(id, blob, metadata = {}) {
  const record = {
    id,
    blob,
    mimeType: blob.type || metadata.mimeType || 'image/png',
    name: metadata.name || id,
    createdAt: Date.now(),
  };

  const db = await getDB();
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(id);
      req.onerror = (e) => reject(e.target.error);
    });
  } else {
    memoryStore.set(id, record);
    return id;
  }
}

export async function getTextureBlob(id) {
  if (!id) return null;
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => resolve(null);
    });
  } else {
    const rec = memoryStore.get(id);
    return rec ? rec.blob : null;
  }
}

export async function getTextureUrl(id) {
  const blob = await getTextureBlob(id);
  if (!blob) return null;
  if (typeof URL !== 'undefined' && URL.createObjectURL) {
    return URL.createObjectURL(blob);
  }
  if (typeof blob === 'string') return blob;
  return null;
}

export async function deleteTextureBlob(id) {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } else {
    memoryStore.delete(id);
    return true;
  }
}

export async function listTextures() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []).map((r) => ({
          id: r.id,
          name: r.name,
          mimeType: r.mimeType,
          size: r.blob ? r.blob.size || 0 : 0,
          createdAt: r.createdAt,
        }));
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } else {
    return Array.from(memoryStore.values()).map((r) => ({
      id: r.id,
      name: r.name,
      mimeType: r.mimeType,
      size: r.blob ? r.blob.size || 0 : 0,
      createdAt: r.createdAt,
    }));
  }
}

export async function getAllTextureBlobs() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } else {
    return Array.from(memoryStore.values());
  }
}

export async function clearTextures() {
  const db = await getDB();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } else {
    memoryStore.clear();
    return true;
  }
}
