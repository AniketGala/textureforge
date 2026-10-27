const DATABASE_NAME = "textureforge-local-assets";
const DATABASE_VERSION = 1;
const IMAGE_STORE = "project-images";

export type StoredProjectImage = {
  projectId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  updatedAt: string;
};

function imageDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support local image storage."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE)) {
        database.createObjectStore(IMAGE_STORE, { keyPath: "projectId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(imageStorageError(request.error));
    request.onblocked = () => reject(new Error("Local image storage is busy. Close other TextureForge tabs and try again."));
  });
}

export function imageStorageError(error: DOMException | null): Error {
  if (error?.name === "QuotaExceededError") {
    return new Error("This browser is out of local storage space. Free browser storage and try saving again.");
  }
  return new Error(error?.message || "The browser could not access local image storage.");
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await imageDatabase();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    let settled = false;
    const fail = (error: DOMException | null) => {
      if (settled) return;
      settled = true;
      reject(imageStorageError(error));
    };
    try {
      const transaction = database.transaction(IMAGE_STORE, mode);
      const request = run(transaction.objectStore(IMAGE_STORE));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => fail(request.error);
      transaction.oncomplete = () => {
        database.close();
        if (!settled) { settled = true; resolve(result); }
      };
      transaction.onerror = () => { database.close(); fail(transaction.error); };
      transaction.onabort = () => { database.close(); fail(transaction.error); };
    } catch (error) {
      database.close();
      const exception = error instanceof DOMException ? error : null;
      reject(imageStorageError(exception));
    }
  });
}

export function saveProjectImage(projectId: string, blob: Blob, fileName: string): Promise<IDBValidKey> {
  if (!blob.size) return Promise.reject(new Error("The source image is empty and could not be saved."));
  return withStore("readwrite", (store) => store.put({
    projectId, blob, fileName, mimeType: blob.type, updatedAt: new Date().toISOString()
  } satisfies StoredProjectImage));
}

export function getProjectImage(projectId: string): Promise<StoredProjectImage | undefined> {
  return withStore("readonly", (store) => store.get(projectId));
}

export function deleteProjectImage(projectId: string): Promise<void> {
  return withStore("readwrite", (store) => store.delete(projectId)).then(() => undefined);
}
