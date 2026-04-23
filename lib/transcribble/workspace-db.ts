import type { CachedLookup, TranscriptProject } from "@/lib/transcribble/types";
import { chooseMediaStorageBackend, createOpfsFileName, isOpfsSupported } from "@/lib/transcribble/storage";

const DB_NAME = "transcribble-workspace";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const FILE_STORE = "files";
const CACHE_STORE = "cache";

interface LegacyStoredFileRecord {
  projectId: string;
  file: File;
}

interface IndexedDbFileRecord {
  projectId: string;
  adapter: "indexeddb";
  file: File;
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

interface OpfsFileRecord {
  projectId: string;
  adapter: "opfs";
  opfsFileName: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

type StoredFileRecord = LegacyStoredFileRecord | IndexedDbFileRecord | OpfsFileRecord;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function isLegacyFileRecord(record: StoredFileRecord | undefined): record is LegacyStoredFileRecord {
  return Boolean(record && "file" in record && !("adapter" in record));
}

function isIndexedDbFileRecord(record: StoredFileRecord | undefined): record is IndexedDbFileRecord {
  return Boolean(record && "adapter" in record && record.adapter === "indexeddb");
}

function isOpfsFileRecord(record: StoredFileRecord | undefined): record is OpfsFileRecord {
  return Boolean(record && "adapter" in record && record.adapter === "opfs");
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: "projectId" });
      }

      if (!database.objectStoreNames.contains(CACHE_STORE)) {
        database.createObjectStore(CACHE_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });

  return dbPromise;
}

async function getStoredFileRecord(projectId: string) {
  const database = await openDatabase();
  const transaction = database.transaction(FILE_STORE, "readonly");
  const record = (await requestToPromise(transaction.objectStore(FILE_STORE).get(projectId))) as
    | StoredFileRecord
    | undefined;
  await transactionDone(transaction);

  return record;
}

async function getOpfsMediaDirectory() {
  if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.getDirectory !== "function") {
    return null;
  }

  const rootDirectory = await navigator.storage.getDirectory();
  return rootDirectory.getDirectoryHandle("transcribble-media", { create: true });
}

async function writeFileToOpfs(projectId: string, file: File) {
  const directory = await getOpfsMediaDirectory();

  if (!directory) {
    return null;
  }

  const opfsFileName = createOpfsFileName(projectId, file.name);
  const handle = await directory.getFileHandle(opfsFileName, { create: true });
  const writable = await handle.createWritable();

  if (typeof file.stream === "function" && typeof writable.write === "function") {
    await file.stream().pipeTo(writable);
  } else {
    await writable.write(file);
    await writable.close();
  }

  return {
    projectId,
    adapter: "opfs",
    opfsFileName,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
  } satisfies OpfsFileRecord;
}

function buildIndexedDbFileRecord(projectId: string, file: File) {
  return {
    projectId,
    adapter: "indexeddb",
    file,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
  } satisfies IndexedDbFileRecord;
}

async function removeOpfsFile(record: OpfsFileRecord) {
  const directory = await getOpfsMediaDirectory();

  if (!directory) {
    return;
  }

  try {
    await directory.removeEntry(record.opfsFileName);
  } catch {
    return;
  }
}

async function readStoredMediaFile(record: StoredFileRecord | undefined) {
  if (!record) {
    return null;
  }

  if (isLegacyFileRecord(record) || isIndexedDbFileRecord(record)) {
    return record.file;
  }

  if (!isOpfsFileRecord(record)) {
    return null;
  }

  const directory = await getOpfsMediaDirectory();
  if (!directory) {
    return null;
  }

  try {
    const handle = await directory.getFileHandle(record.opfsFileName);
    const file = await handle.getFile();

    if (file.name === record.name && file.type === record.type && file.lastModified === record.lastModified) {
      return file;
    }

    return new File([file], record.name, {
      type: record.type,
      lastModified: record.lastModified,
    });
  } catch {
    return null;
  }
}

async function putStoredMediaFile(projectId: string, file: File) {
  if (isOpfsSupported() && chooseMediaStorageBackend(file.size, true) === "opfs") {
    try {
      const opfsRecord = await writeFileToOpfs(projectId, file);
      if (opfsRecord) {
        return opfsRecord as StoredFileRecord;
      }
    } catch {
      // Fall through to IndexedDB.
    }
  }

  return buildIndexedDbFileRecord(projectId, file) as StoredFileRecord;
}

export async function listProjects() {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECT_STORE, "readonly");
  const store = transaction.objectStore(PROJECT_STORE);
  const records = await requestToPromise(store.getAll());
  await transactionDone(transaction);

  return (records as TranscriptProject[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function putProject(project: TranscriptProject) {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECT_STORE, "readwrite");
  transaction.objectStore(PROJECT_STORE).put(project);
  await transactionDone(transaction);
}

export async function putProjects(projects: TranscriptProject[]) {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECT_STORE, "readwrite");
  const store = transaction.objectStore(PROJECT_STORE);

  for (const project of projects) {
    store.put(project);
  }

  await transactionDone(transaction);
}

export async function putProjectWithFile(project: TranscriptProject, file: File) {
  const storedFile = await putStoredMediaFile(project.fileStoreKey, file);
  const database = await openDatabase();
  const transaction = database.transaction([PROJECT_STORE, FILE_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).put(project);
  transaction.objectStore(FILE_STORE).put(storedFile);
  await transactionDone(transaction);
}

export async function deleteProject(project: Pick<TranscriptProject, "id" | "fileStoreKey">) {
  const storedFile = await getStoredFileRecord(project.fileStoreKey);
  const database = await openDatabase();
  const transaction = database.transaction([PROJECT_STORE, FILE_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).delete(project.id);
  transaction.objectStore(FILE_STORE).delete(project.fileStoreKey);
  await transactionDone(transaction);

  if (isOpfsFileRecord(storedFile)) {
    await removeOpfsFile(storedFile);
  }
}

export async function putProjectFile(projectId: string, file: File) {
  const storedFile = await putStoredMediaFile(projectId, file);
  const database = await openDatabase();
  const transaction = database.transaction(FILE_STORE, "readwrite");
  transaction.objectStore(FILE_STORE).put(storedFile);
  await transactionDone(transaction);
}

export async function getProjectFile(fileStoreKey: string) {
  const record = await getStoredFileRecord(fileStoreKey);
  return readStoredMediaFile(record);
}

export async function getCachedLookup<T>(key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readonly");
  const record = (await requestToPromise(transaction.objectStore(CACHE_STORE).get(key))) as CachedLookup | undefined;
  await transactionDone(transaction);

  if (!record) {
    return null;
  }

  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    await deleteCachedLookup(key);
    return null;
  }

  return record.value as T;
}

export async function putCachedLookup(key: string, value: unknown, ttlMs?: number) {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  transaction.objectStore(CACHE_STORE).put({
    key,
    value,
    createdAt: new Date().toISOString(),
    expiresAt: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : undefined,
  } satisfies CachedLookup);
  await transactionDone(transaction);
}

export async function deleteCachedLookup(key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  transaction.objectStore(CACHE_STORE).delete(key);
  await transactionDone(transaction);
}
