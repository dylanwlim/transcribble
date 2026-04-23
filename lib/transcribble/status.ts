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
    summary: "Saved on this device and waiting in line.",
    tone: "neutral",
  },
  "getting-browser-ready": {
    badgeLabel: "Setup",
    headline: "Getting this browser ready",
    summary: "Downloading the one-time tools this browser needs before it can transcribe.",
    tone: "working",
  },
  "getting-recording-ready": {
    badgeLabel: "Preparing",
    headline: "Getting your recording ready",
    summary: "Reading the file and preparing the audio on this device.",
    tone: "working",
  },
  transcribing: {
    badgeLabel: "Working",
    headline: "Transcribing now",
    summary: "Listening locally and building the transcript on this device.",
    tone: "working",
  },
  paused: {
    badgeLabel: "Saved",
    headline: "Saved and waiting",
    summary: "Saved on this device. This browser may need more runtime room before it can continue.",
    tone: "warning",
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
    badgeLabel: "Problem",
    headline: "Couldn't finish yet",
    summary: "Transcribble hit a problem before this recording could finish.",
    tone: "warning",
  },
};

export interface ProjectStatusCopy extends StageCopy {
  step: ProjectStep;
  statusLabel: string;
  summary: string;
}

export interface ProjectViewState extends ProjectStatusCopy {
  canUseTranscript: boolean;
  canSearchTranscript: boolean;
  canExport: boolean;
  canSaveRanges: boolean;
  transcriptBadgeLabel: string;
  transcriptSearchPlaceholder: string;
  transcriptEmptyTitle: string;
  transcriptEmptyBody: string;
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
    case "paused":
      return "paused";
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
  project: Pick<TranscriptProject, "status" | "step"> & Partial<Pick<TranscriptProject, "detail" | "error">>,
): ProjectStatusCopy {
  const step = getProjectStep(project);
  const base = STAGE_COPY[step];

  return {
    ...base,
    step,
    statusLabel: base.badgeLabel,
    summary: project.detail || project.error || base.summary,
  };
}

export function getProjectViewState(
  project: Pick<TranscriptProject, "status" | "step" | "transcript"> &
    Partial<Pick<TranscriptProject, "detail" | "error">>,
): ProjectViewState {
  const status = getProjectStatusCopy(project);
  const hasTranscript = Boolean(project.transcript);

  if (hasTranscript) {
    return {
      ...status,
      canUseTranscript: true,
      canSearchTranscript: true,
      canExport: true,
      canSaveRanges: project.status === "ready",
      transcriptBadgeLabel: "Transcript ready",
      transcriptSearchPlaceholder: "Search inside this transcript",
      transcriptEmptyTitle: "Transcript ready",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "error") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "No transcript yet",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "This recording could not finish yet",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "paused") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Saved and waiting",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Saved and waiting",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "queued") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Waiting to start",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "This recording is waiting in line",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "getting-browser-ready") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Browser setup in progress",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Getting this browser ready",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "getting-recording-ready") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Preparing recording",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Getting your recording ready",
      transcriptEmptyBody: status.summary,
    };
  }

  return {
    ...status,
    canUseTranscript: false,
    canSearchTranscript: false,
    canExport: false,
    canSaveRanges: false,
    transcriptBadgeLabel: "Transcribing now",
    transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
    transcriptEmptyTitle: "Transcribing now",
    transcriptEmptyBody: status.summary,
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
