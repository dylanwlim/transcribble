import type { CachedLookup, TranscriptProject } from "@/lib/transcribble/types";

const DB_NAME = "transcribble-workspace";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const FILE_STORE = "files";
const CACHE_STORE = "cache";

interface StoredFileRecord {
  projectId: string;
  file: File;
}

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

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser environment."));
      return;
    }

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

    request.onsuccess = () => {
      const database = request.result;

      database.onclose = () => {
        dbPromise = null;
      };

      database.onversionchange = () => {
        database.close();
        dbPromise = null;
      };

      resolve(database);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB is blocked by another connection. Close other tabs and retry."));
    };
  });

  return dbPromise;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "InvalidStateError" || error.name === "TransactionInactiveError")
    ) {
      dbPromise = null;
      return operation();
    }
    throw error;
  }
}

export async function listProjects() {
  return withRetry(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const store = transaction.objectStore(PROJECT_STORE);
    const records = await requestToPromise(store.getAll());
    await transactionDone(transaction);

    return (records as TranscriptProject[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
}

export async function putProject(project: TranscriptProject) {
  return withRetry(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(PROJECT_STORE, "readwrite");
    transaction.objectStore(PROJECT_STORE).put(project);
    await transactionDone(transaction);
  });
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
  return withRetry(async () => {
    const database = await openDatabase();
    const transaction = database.transaction([PROJECT_STORE, FILE_STORE], "readwrite");
    transaction.objectStore(PROJECT_STORE).put(project);
    transaction.objectStore(FILE_STORE).put({
      projectId: project.fileStoreKey,
      file,
    } satisfies StoredFileRecord);
    await transactionDone(transaction);
  });
}

export async function deleteProject(project: Pick<TranscriptProject, "id" | "fileStoreKey">) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECT_STORE, FILE_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).delete(project.id);
  transaction.objectStore(FILE_STORE).delete(project.fileStoreKey);
  await transactionDone(transaction);
}

export async function putProjectFile(projectId: string, file: File) {
  const database = await openDatabase();
  const transaction = database.transaction(FILE_STORE, "readwrite");
  transaction.objectStore(FILE_STORE).put({
    projectId,
    file,
  } satisfies StoredFileRecord);
  await transactionDone(transaction);
}

export async function getProjectFile(fileStoreKey: string) {
  return withRetry(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(FILE_STORE, "readonly");
    const record = (await requestToPromise(
      transaction.objectStore(FILE_STORE).get(fileStoreKey),
    )) as StoredFileRecord | undefined;
    await transactionDone(transaction);

    return record?.file ?? null;
  });
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
