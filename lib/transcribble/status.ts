import type { ProjectStatus, ProjectStep, TranscriptProject } from "@/lib/transcribble/types";

type ProjectTone = "neutral" | "working" | "success" | "warning";

interface StageCopy {
  badgeLabel: string;
  headline: string;
  summary: string;
  tone: ProjectTone;
}

const STAGE_COPY: Record<ProjectStep, StageCopy> = {
  queued: {
    badgeLabel: "Queued",
    headline: "Waiting to start",
    summary: "Saved on this device and waiting for its turn.",
    tone: "neutral",
  },
  "getting-browser-ready": {
    badgeLabel: "Setup",
    headline: "Getting this browser ready",
    summary: "Downloading the one-time tools this browser needs before it can transcribe locally.",
    tone: "working",
  },
  "getting-recording-ready": {
    badgeLabel: "Preparing",
    headline: "Getting your recording ready",
    summary: "Reading the file and preparing the audio in this browser.",
    tone: "working",
  },
  transcribing: {
    badgeLabel: "Working",
    headline: "Transcribing now",
    summary: "Listening locally and building the transcript on this device.",
    tone: "working",
  },
  saving: {
    badgeLabel: "Saving",
    headline: "Saving your session",
    summary: "Finishing the transcript and saving it so you can reopen it later.",
    tone: "working",
  },
  ready: {
    badgeLabel: "Ready",
    headline: "Ready to review",
    summary: "Saved on this device. Search, edit, and export whenever you need it.",
    tone: "success",
  },
  error: {
    badgeLabel: "Needs help",
    headline: "Needs attention",
    summary: "This recording hit a problem before it could finish.",
    tone: "warning",
  },
};

export interface ProjectStatusCopy extends StageCopy {
  step: ProjectStep;
  statusLabel: string;
  summary: string;
}

export function getDefaultProjectStep(status: ProjectStatus): ProjectStep {
  switch (status) {
    case "queued":
      return "queued";
    case "preparing":
      return "getting-recording-ready";
    case "loading-model":
      return "getting-browser-ready";
    case "transcribing":
      return "transcribing";
    case "ready":
      return "ready";
    case "error":
      return "error";
    default:
      return "queued";
  }
}

export function getProjectStep(project: Pick<TranscriptProject, "status" | "step">) {
  return project.step ?? getDefaultProjectStep(project.status);
}

export function getProjectStatusCopy(
  project: Pick<TranscriptProject, "status" | "step" | "detail" | "error">,
): ProjectStatusCopy {
  const step = getProjectStep(project);
  const base = STAGE_COPY[step];

  return {
    ...base,
    step,
    statusLabel: base.badgeLabel,
    summary: project.error ?? project.detail ?? base.summary,
  };
}

export function applyProjectStep<T extends TranscriptProject>(
  project: T,
  options: {
    status?: ProjectStatus;
    step: ProjectStep;
    progress?: number;
    detail?: string;
    error?: string;
  } & Partial<Omit<T, "status" | "step" | "progress" | "detail" | "error" | "stageLabel">>,
) {
  const { status, step, progress, detail, error, ...rest } = options;
  const copy = STAGE_COPY[step];

  return {
    ...project,
    ...rest,
    status: status ?? project.status,
    step,
    progress: progress ?? project.progress,
    stageLabel: copy.headline,
    detail: detail ?? copy.summary,
    error,
  };
}
