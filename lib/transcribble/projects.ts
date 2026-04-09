import {
  LOCAL_PROCESSING_NOTE,
  type Runtime,
} from "@/lib/transcribble/constants";
import { getFileExtension } from "@/lib/transcribble/media";
import type { MediaKind, TranscriptProject } from "@/lib/transcribble/types";

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
    progress: 0,
    stageLabel: "Queued",
    detail: LOCAL_PROCESSING_NOTE,
    runtime,
    fileStoreKey: id,
    marks: [],
  };
}

export function recoverPersistedProjects(projects: TranscriptProject[]) {
  return projects.map((project) => {
    if (project.status === "ready" || project.status === "error" || project.status === "paused") {
      return project;
    }

    return {
      ...project,
      status: "queued" as const,
      progress: 0,
      stageLabel: "Recovered",
      detail: "Recovered after a refresh. The file is stored locally and queued to continue.",
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
