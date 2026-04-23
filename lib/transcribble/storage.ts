import { formatBytes } from "@/lib/transcribble/transcript";

export type MediaStorageBackend = "indexeddb" | "opfs";

export interface BrowserStorageState {
  persistenceSupported: boolean;
  canRequestPersistence: boolean;
  persisted: boolean | null;
  usage?: number;
  available?: number;
  quota?: number;
  usageRatio?: number;
  opfsSupported: boolean;
  preferredMediaBackend: MediaStorageBackend;
  caveats: string[];
}

export const OPFS_MEDIA_THRESHOLD_BYTES = 24 * 1024 * 1024;
const OPFS_STORAGE_MARGIN_RATIO = 0.08;
const INDEXED_DB_STORAGE_MARGIN_RATIO = 0.18;
const OPFS_STORAGE_MARGIN_MIN_BYTES = 32 * 1024 * 1024;
const INDEXED_DB_STORAGE_MARGIN_MIN_BYTES = 64 * 1024 * 1024;
const STORAGE_MARGIN_MAX_BYTES = 512 * 1024 * 1024;

export interface LocalStorageCapacityCheck {
  ok: boolean;
  backend: MediaStorageBackend;
  availableBytes: number | null;
  requiredBytes: number | null;
}

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

export function getAvailableStorageBytes(usage?: number, quota?: number) {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota === undefined) {
    return undefined;
  }

  return Math.max(0, (quota ?? 0) - (usage ?? 0));
}

// Browser quota estimates can be noisy. Keep a dynamic headroom buffer for metadata,
// write amplification, and estimate drift instead of using a fixed file-size cap.
export function estimateLocalStorageMargin(fileSize: number, backend: MediaStorageBackend) {
  const ratio = backend === "opfs" ? OPFS_STORAGE_MARGIN_RATIO : INDEXED_DB_STORAGE_MARGIN_RATIO;
  const minimum = backend === "opfs" ? OPFS_STORAGE_MARGIN_MIN_BYTES : INDEXED_DB_STORAGE_MARGIN_MIN_BYTES;

  return Math.min(STORAGE_MARGIN_MAX_BYTES, Math.max(minimum, Math.ceil(fileSize * ratio)));
}

export function estimateRequiredLocalStorage(fileSize: number, backend: MediaStorageBackend) {
  return fileSize + estimateLocalStorageMargin(fileSize, backend);
}

export function buildStorageStatus(usage?: number | null, available?: number | null) {
  const usedLabel = typeof usage === "number" ? `${formatBytes(usage)} used` : "Local storage";
  const availableLabel = typeof available === "number" ? `${formatBytes(available)} available` : null;

  return {
    usedLabel,
    availableLabel,
    summary: availableLabel ? `${usedLabel} · ${availableLabel}` : usedLabel,
  };
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
    caveats.push("This browser does not report whether local storage is protected from automatic cleanup.");
  } else if (persisted === false) {
    caveats.push("Browser may clear local files if storage space gets tight.");
  }

  if (!opfsSupported) {
    caveats.push("Larger recordings stay in IndexedDB here because this browser does not support the private file system.");
  }

  if (typeof Worker === "undefined") {
    caveats.push("Background transcription is unavailable in this browser.");
  }

  const available = getAvailableStorageBytes(usage, quota);

  return {
    persistenceSupported,
    canRequestPersistence,
    persisted,
    usage,
    available,
    quota,
    usageRatio: usage !== undefined && quota !== undefined && quota > 0 ? usage / quota : undefined,
    opfsSupported,
    preferredMediaBackend: chooseMediaStorageBackend(OPFS_MEDIA_THRESHOLD_BYTES, opfsSupported),
    caveats,
  };
}

export async function validateLocalStorageCapacity(
  fileSize: number,
  state?: BrowserStorageState | null,
): Promise<LocalStorageCapacityCheck> {
  const resolvedState = state ?? (await readBrowserStorageState());
  const backend = chooseMediaStorageBackend(fileSize, resolvedState.opfsSupported);
  const availableBytes = resolvedState.available ?? getAvailableStorageBytes(resolvedState.usage, resolvedState.quota);

  if (availableBytes === undefined) {
    return {
      ok: true,
      backend,
      availableBytes: null,
      requiredBytes: null,
    };
  }

  const requiredBytes = estimateRequiredLocalStorage(fileSize, backend);

  return {
    ok: availableBytes >= requiredBytes,
    backend,
    availableBytes,
    requiredBytes,
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
