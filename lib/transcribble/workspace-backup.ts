import type { TranscriptProject } from "@/lib/transcribble/types";

export const WORKSPACE_BACKUP_VERSION = 1;

export interface WorkspaceBackupMediaIncluded {
  status: "included";
  name: string;
  type: string;
  size: number;
  lastModified: number;
  dataBase64: string;
}

export interface WorkspaceBackupMediaMissing {
  status: "missing";
  reason: string;
}

export type WorkspaceBackupMedia = WorkspaceBackupMediaIncluded | WorkspaceBackupMediaMissing;

export interface WorkspaceBackupEntry {
  project: TranscriptProject;
  media: WorkspaceBackupMedia;
}

export interface WorkspaceBackup {
  app: "transcribble";
  version: typeof WORKSPACE_BACKUP_VERSION;
  createdAt: string;
  projects: WorkspaceBackupEntry[];
}

export interface PreparedWorkspaceImport {
  projects: TranscriptProject[];
  files: Array<{ fileStoreKey: string; file: File }>;
  summary: {
    importedProjects: number;
    restoredMedia: number;
    missingMedia: number;
    remappedProjects: number;
  };
}

export async function createWorkspaceBackup(
  projects: readonly TranscriptProject[],
  readProjectFile: (fileStoreKey: string) => Promise<File | null>,
): Promise<WorkspaceBackup> {
  const entries: WorkspaceBackupEntry[] = [];

  for (const project of projects) {
    let media: WorkspaceBackupMedia;
    try {
      const file = await readProjectFile(project.fileStoreKey);
      media = file
        ? await encodeFileForBackup(file)
        : {
            status: "missing",
            reason: "The saved media file could not be reopened from local browser storage.",
          };
    } catch {
      media = {
        status: "missing",
        reason: "The browser could not read this media file while creating the backup.",
      };
    }

    entries.push({
      project,
      media,
    });
  }

  return {
    app: "transcribble",
    version: WORKSPACE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    projects: entries,
  };
}

export function validateWorkspaceBackupPayload(value: unknown):
  | { ok: true; backup: WorkspaceBackup }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Backup file is not valid JSON." };
  }

  const backup = value as Partial<WorkspaceBackup>;
  if (backup.app !== "transcribble") {
    return { ok: false, error: "This is not a Transcribble workspace backup." };
  }

  if (backup.version !== WORKSPACE_BACKUP_VERSION) {
    return {
      ok: false,
      error: `This backup uses schema version ${String(backup.version ?? "unknown")}; this app expects version ${WORKSPACE_BACKUP_VERSION}.`,
    };
  }

  if (!Array.isArray(backup.projects)) {
    return { ok: false, error: "Backup file is missing its projects list." };
  }

  for (const [index, entry] of backup.projects.entries()) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: `Backup project ${index + 1} is malformed.` };
    }

    const project = (entry as Partial<WorkspaceBackupEntry>).project;
    if (!project || typeof project.id !== "string" || typeof project.title !== "string") {
      return { ok: false, error: `Backup project ${index + 1} is missing required metadata.` };
    }

    const media = (entry as Partial<WorkspaceBackupEntry>).media;
    if (!media || (media.status !== "included" && media.status !== "missing")) {
      return { ok: false, error: `Backup project ${index + 1} has invalid media metadata.` };
    }

    if (media.status === "included" && (typeof media.dataBase64 !== "string" || typeof media.name !== "string")) {
      return { ok: false, error: `Backup project ${index + 1} has invalid media data.` };
    }
  }

  return { ok: true, backup: backup as WorkspaceBackup };
}

export async function prepareWorkspaceBackupImport(
  backup: WorkspaceBackup,
  existingProjects: readonly Pick<TranscriptProject, "id" | "fileStoreKey">[],
): Promise<PreparedWorkspaceImport> {
  const takenProjectIds = new Set(existingProjects.map((project) => project.id));
  const takenFileKeys = new Set(existingProjects.map((project) => project.fileStoreKey));
  const projects: TranscriptProject[] = [];
  const files: Array<{ fileStoreKey: string; file: File }> = [];
  let restoredMedia = 0;
  let missingMedia = 0;
  let remappedProjects = 0;

  for (const entry of backup.projects) {
    const source = entry.project;
    const nextProjectId = takenProjectIds.has(source.id) ? createId() : source.id;
    const nextFileStoreKey =
      takenFileKeys.has(source.fileStoreKey) || nextProjectId !== source.id
        ? createId()
        : source.fileStoreKey;

    if (nextProjectId !== source.id || nextFileStoreKey !== source.fileStoreKey) {
      remappedProjects += 1;
    }

    takenProjectIds.add(nextProjectId);
    takenFileKeys.add(nextFileStoreKey);

    let project: TranscriptProject = rewriteProjectReferences(
      {
        ...source,
        id: nextProjectId,
        fileStoreKey: nextFileStoreKey,
        updatedAt: new Date().toISOString(),
      },
      source.id,
      nextProjectId,
    );

    if (entry.media.status === "included") {
      files.push({
        fileStoreKey: nextFileStoreKey,
        file: decodeBackupMedia(entry.media),
      });
      restoredMedia += 1;
    } else {
      missingMedia += 1;
      project = {
        ...project,
        detail:
          project.transcript && project.status === "ready"
            ? "Imported from a workspace backup. The transcript is restored, but the original media file was not included."
            : "Imported from a workspace backup, but the original media file was not included.",
      };
    }

    projects.push(project);
  }

  return {
    projects,
    files,
    summary: {
      importedProjects: projects.length,
      restoredMedia,
      missingMedia,
      remappedProjects,
    },
  };
}

async function encodeFileForBackup(file: File): Promise<WorkspaceBackupMediaIncluded> {
  const buffer = await file.arrayBuffer();
  return {
    status: "included",
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
    dataBase64: arrayBufferToBase64(buffer),
  };
}

function decodeBackupMedia(media: WorkspaceBackupMediaIncluded) {
  const bytes = base64ToUint8Array(media.dataBase64);
  return new File([bytes], media.name, {
    type: media.type || "application/octet-stream",
    lastModified: media.lastModified,
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32_768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(value: string) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rewriteProjectReferences<T extends TranscriptProject>(project: T, previousProjectId: string, nextProjectId: string): T {
  if (previousProjectId === nextProjectId || !project.transcript) {
    return project;
  }

  return rewriteJsonProjectId(project, previousProjectId, nextProjectId) as T;
}

function rewriteJsonProjectId(value: unknown, previousProjectId: string, nextProjectId: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteJsonProjectId(item, previousProjectId, nextProjectId));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = key === "projectId" && item === previousProjectId
        ? nextProjectId
        : rewriteJsonProjectId(item, previousProjectId, nextProjectId);
    }
    return result;
  }

  return value;
}
