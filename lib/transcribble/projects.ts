import {
  LOCAL_PROCESSING_NOTE,
  type Runtime,
} from "@/lib/transcribble/constants";
import { getDefaultProjectStep } from "@/lib/transcribble/status";
import { getFileExtension } from "@/lib/transcribble/media";
import type { MediaKind, TranscriptProject } from "@/lib/transcribble/types";

function inferMediaKind(file: File): MediaKind {
  const extension = getFileExtension(file.name);
  return extension === ".mp4" || extension === ".mov" ? "video" : "audio";
}

function createProjectTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled Session";
}

export function createProjectFromFile(file: File, runtime: Runtime): TranscriptProject {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  return {
    id,
    title: createProjectTitle(file.name),
    sourceName: file.name,
    sourceType: file.type || "application/octet-stream",
    sourceSize: file.size,
    mediaKind: inferMediaKind(file),
    createdAt: now,
    updatedAt: now,
    status: "queued",
    step: "queued",
    progress: 0,
    stageLabel: "Waiting to start",
    detail: LOCAL_PROCESSING_NOTE,
    runtime,
    fileStoreKey: id,
    marks: [],
    savedRanges: [],
  };
}

function normalizeProject(project: TranscriptProject): TranscriptProject {
  return {
    ...project,
    step: project.step ?? getDefaultProjectStep(project.status),
    marks: project.marks ?? [],
    savedRanges: project.savedRanges ?? [],
  };
}

export function recoverPersistedProjects(projects: TranscriptProject[]) {
  return projects.map((project) => {
    const normalizedProject = normalizeProject(project);

    if (project.status === "ready" || project.status === "error") {
      return normalizedProject;
    }

    return {
      ...normalizedProject,
      status: "queued" as const,
      step: "queued" as const,
      progress: 0,
      stageLabel: "Waiting to start",
      detail: "Recovered after a refresh. It is saved on this device and ready to continue.",
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
