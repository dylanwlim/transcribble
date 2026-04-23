import {
  LOCAL_PROCESSING_NOTE,
  LOCAL_ACCELERATOR_NOTE,
  LOCAL_ACCELERATOR_REQUIRED_NOTE,
  type Runtime,
} from "@/lib/transcribble/constants";
import { getDefaultProjectStep } from "@/lib/transcribble/status";
import { getFileExtension } from "@/lib/transcribble/media";
import type {
  MediaKind,
  TranscriptProject,
  TranscriptionBackend,
  TranscriptionRoute,
} from "@/lib/transcribble/types";

interface LegacyPersistedProjectFields {
  backend?: unknown;
  transcriptionRoute?: unknown;
  cloudJobId?: string;
  cloudProvider?: string;
  cloudStatus?: string;
  cloudLastSyncedAt?: string;
}

type PersistedProjectRecord = TranscriptProject & LegacyPersistedProjectFields;

function inferMediaKind(file: File): MediaKind {
  const extension = getFileExtension(file.name);
  if (extension === ".mp4" || extension === ".mov") {
    return "video";
  }
  if (extension === ".webm") {
    return file.type.startsWith("video/") ? "video" : "audio";
  }
  return "audio";
}

function createProjectTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled Session";
}

export function createProjectFromFile(file: File, runtime: Runtime): TranscriptProject {
  return createProjectFromImportedFile(file, runtime, "browser");
}

export function createProjectFromImportedFile(
  file: File,
  runtime: Runtime,
  backend: TranscriptionBackend,
): TranscriptProject {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const usesLocalHelper = backend === "local-helper";

  return {
    id,
    title: createProjectTitle(file.name),
    sourceName: file.name,
    sourceType: file.type || "application/octet-stream",
    sourceSize: file.size,
    mediaKind: inferMediaKind(file),
    createdAt: now,
    updatedAt: now,
    status: usesLocalHelper ? "pending-upload" : "queued",
    step: usesLocalHelper ? "pending-upload" : "queued",
    progress: 0,
    stageLabel: usesLocalHelper ? "Waiting to send" : "Waiting to start",
    detail: usesLocalHelper ? LOCAL_ACCELERATOR_NOTE : LOCAL_PROCESSING_NOTE,
    runtime,
    backend,
    transcriptionRoute: backend,
    fileStoreKey: id,
    marks: [],
    savedRanges: [],
  };
}

function normalizeProject(project: PersistedProjectRecord): TranscriptProject {
  const route = normalizeLegacyRoute(project.backend ?? project.transcriptionRoute);

  return {
    ...project,
    backend: route,
    step: project.step ?? getDefaultProjectStep(project.status),
    stageLabel:
      project.stageLabel ||
      (route === "local-helper" && project.step === "needs-local-helper"
        ? "Local accelerator required"
        : project.stageLabel),
    detail:
      project.detail ||
      (route === "local-helper" ? LOCAL_ACCELERATOR_NOTE : LOCAL_PROCESSING_NOTE),
    backendJobId: project.backendJobId ?? project.cloudJobId,
    backendStatus: project.backendStatus ?? project.cloudStatus,
    backendProvider: project.backendProvider ?? project.cloudProvider,
    backendLastSyncedAt: project.backendLastSyncedAt ?? project.cloudLastSyncedAt,
    marks: project.marks ?? [],
    savedRanges: project.savedRanges ?? [],
  };
}

export function recoverPersistedProjects(projects: TranscriptProject[]) {
  return projects.map((project) => {
    const rawProject = project as PersistedProjectRecord;
    const normalizedProject = normalizeProject(rawProject);
    const backend = normalizedProject.backend ?? "browser";

    if (
      project.status === "ready" ||
      project.status === "error" ||
      project.status === "paused" ||
      project.status === "canceled" ||
      (backend === "local-helper" && Boolean(normalizedProject.backendJobId))
    ) {
      if (cameFromRemovedRemotePath(rawProject) && project.status !== "ready") {
        return {
          ...normalizedProject,
          backend: "local-helper" as const,
          transcriptionRoute: "local-helper" as const,
          status: "paused" as const,
          step: "needs-local-helper" as const,
          progress: 0,
          stageLabel: "Local accelerator required",
          detail:
            "This session came from an older build that used the removed cloud path. It is still saved on this device. Retry it with the local accelerator instead.",
          updatedAt: new Date().toISOString(),
        };
      }

      return normalizedProject;
    }

    return {
      ...normalizedProject,
      status: "queued" as const,
      step: "queued" as const,
      progress: 0,
      stageLabel: "Waiting to start",
      detail:
        backend === "local-helper"
          ? LOCAL_ACCELERATOR_REQUIRED_NOTE
          : "Recovered after a refresh. It is saved on this device and ready to continue.",
      updatedAt: new Date().toISOString(),
    };
  });
}

export function updateProjectTimestamp<T extends TranscriptProject>(project: T): T {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLegacyRoute(route?: TranscriptionRoute | "external"): TranscriptionBackend | undefined {
  if (route === "local") {
    return "browser";
  }

  if (route === "cloud" || route === "external") {
    return "local-helper";
  }

  if (route === "browser" || route === "local-helper") {
    return route;
  }

  return undefined;
}

function cameFromRemovedRemotePath(project: PersistedProjectRecord) {
  const legacyBackend = project["backend"] as unknown;
  const legacyRoute = project["transcriptionRoute"] as unknown;

  return (
    legacyBackend === "external" ||
    legacyRoute === "external" ||
    legacyRoute === "cloud" ||
    Boolean(project.cloudJobId)
  );
}
