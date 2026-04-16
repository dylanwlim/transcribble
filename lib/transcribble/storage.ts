export type MediaStorageBackend = "indexeddb" | "opfs";

export interface BrowserStorageState {
  persistenceSupported: boolean;
  canRequestPersistence: boolean;
  persisted: boolean | null;
  usage?: number;
  quota?: number;
  usageRatio?: number;
  opfsSupported: boolean;
  preferredMediaBackend: MediaStorageBackend;
  caveats: string[];
}

export const OPFS_MEDIA_THRESHOLD_BYTES = 24 * 1024 * 1024;

function getStorageManager() {
  if (typeof navigator === "undefined") {
    return null;
  }

  return navigator.storage ?? null;
}

export function isOpfsSupported() {
  const storage = getStorageManager();
  return Boolean(storage && typeof storage.getDirectory === "function");
}

export function chooseMediaStorageBackend(fileSize: number, opfsSupported: boolean) {
  return opfsSupported && fileSize >= OPFS_MEDIA_THRESHOLD_BYTES ? "opfs" : "indexeddb";
}

export function getPreferredMediaBackend(fileSize = OPFS_MEDIA_THRESHOLD_BYTES) {
  return chooseMediaStorageBackend(fileSize, isOpfsSupported());
}

export function sanitizeStorageName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "media";
}

export function createOpfsFileName(projectId: string, sourceName: string) {
  const extensionMatch = /\.[^.]+$/.exec(sourceName);
  const extension = extensionMatch?.[0]?.toLowerCase() ?? ".bin";
  return `${sanitizeStorageName(projectId)}${extension}`;
}

export async function readBrowserStorageState(): Promise<BrowserStorageState> {
  const storage = getStorageManager();
  const persistenceSupported = Boolean(storage && typeof storage.persisted === "function");
  const canRequestPersistence = Boolean(storage && typeof storage.persist === "function");
  const opfsSupported = Boolean(storage && typeof storage.getDirectory === "function");

  let persisted: boolean | null = null;
  let usage: number | undefined;
  let quota: number | undefined;
  const caveats: string[] = [];

  if (persistenceSupported) {
    try {
      persisted = await storage!.persisted();
    } catch {
      persisted = null;
    }
  }

  if (storage && typeof storage.estimate === "function") {
    try {
      const estimate = await storage.estimate();
      usage = estimate.usage;
      quota = estimate.quota;
    } catch {
      usage = undefined;
      quota = undefined;
    }
  }

  if (!persistenceSupported) {
    caveats.push("This browser does not report whether storage is protected from automatic cleanup.");
  } else if (persisted === false) {
    caveats.push("Large files may be cleared by the browser if storage space gets tight.");
  }

  if (!opfsSupported) {
    caveats.push("Larger recordings stay in IndexedDB here because this browser does not support the private file system.");
  }

  if (typeof Worker === "undefined") {
    caveats.push("Background transcription is unavailable in this browser.");
  }

  return {
    persistenceSupported,
    canRequestPersistence,
    persisted,
    usage,
    quota,
    usageRatio: usage !== undefined && quota !== undefined && quota > 0 ? usage / quota : undefined,
    opfsSupported,
    preferredMediaBackend: chooseMediaStorageBackend(OPFS_MEDIA_THRESHOLD_BYTES, opfsSupported),
    caveats,
  };
}

export async function requestPersistentStorage() {
  const storage = getStorageManager();
  if (!storage || typeof storage.persist !== "function") {
    return null;
  }

  try {
    return await storage.persist();
  } catch {
    return null;
  }
}
