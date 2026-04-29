import { buildTranscriptDocument } from "@/lib/transcribble/analysis";
import { LOCAL_ACCELERATOR_REQUIRED_NOTE } from "@/lib/transcribble/constants";
import { applyProjectStep } from "@/lib/transcribble/status";
import type {
  LocalHelperCapabilities,
  LocalHelperJob,
  TranscriptProject,
} from "@/lib/transcribble/types";

export function projectNeedsHelperReconnect(project: TranscriptProject) {
  return (
    project.backend === "local-helper" &&
    Boolean(project.backendJobId) &&
    project.status !== "ready" &&
    project.status !== "error" &&
    project.status !== "canceled"
  );
}

export function buildLocalHelperRequiredDetail(reason?: string) {
  if (reason?.includes(LOCAL_ACCELERATOR_REQUIRED_NOTE) || reason?.includes("npm run helper:check")) {
    return reason;
  }
  return reason ? `${reason} ${LOCAL_ACCELERATOR_REQUIRED_NOTE}` : LOCAL_ACCELERATOR_REQUIRED_NOTE;
}

export function resolveLocalHelperStart(
  capabilities: LocalHelperCapabilities | null | undefined,
) {
  if (capabilities?.available && capabilities.url) {
    return {
      available: true as const,
      url: capabilities.url,
    };
  }

  return {
    available: false as const,
    reason: capabilities?.reason ?? "Transcribble Helper was not reachable on localhost.",
  };
}

export function syncLocalHelperJobIntoProject(project: TranscriptProject, job: LocalHelperJob) {
  const baseProject: TranscriptProject = {
    ...project,
    backend: "local-helper",
    backendJobId: job.id,
    backendStatus: job.status,
    backendProvider: job.backend,
    backendLastSyncedAt: new Date().toISOString(),
    transcriptionModelProfile: job.modelProfile,
    transcriptionModelName: job.modelName,
    duration: job.durationSec ?? project.duration,
    resumeState: job.resume,
  };

  switch (job.status) {
    case "pending_upload":
      return applyProjectStep(baseProject, {
        status: "pending-upload",
        step: "pending-upload",
        progress: Math.max(0, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "uploading":
      return applyProjectStep(baseProject, {
        status: "uploading",
        step: "uploading",
        progress: Math.max(0, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "queued":
      return applyProjectStep(baseProject, {
        status: "queued",
        step: "queued",
        progress: Math.max(0, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "downloading_model":
      return applyProjectStep(baseProject, {
        status: "preparing",
        step: "getting-local-model",
        progress: Math.max(18, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "probing":
      return applyProjectStep(baseProject, {
        status: "preparing",
        step: "probing",
        progress: Math.max(8, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "extracting_audio":
      return applyProjectStep(baseProject, {
        status: "extracting-audio",
        step: "extracting-audio",
        progress: Math.max(18, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "chunking":
      return applyProjectStep(baseProject, {
        status: "chunking",
        step: "chunking",
        progress: Math.max(28, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "transcribing":
      return applyProjectStep(baseProject, {
        status: "transcribing",
        step: "transcribing",
        progress: Math.max(40, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "merging":
      return applyProjectStep(baseProject, {
        status: "merging",
        step: "merging",
        progress: Math.max(86, job.progress),
        detail: job.detail,
        error: undefined,
      });
    case "completed": {
      const transcript = job.transcript
        ? buildTranscriptDocument(
            project.id,
            job.transcript,
            job.durationSec ?? project.duration ?? 0,
            project.marks ?? [],
          )
        : project.transcript;

      return applyProjectStep(
        {
          ...baseProject,
          transcript,
        },
        {
          status: "ready",
          step: "ready",
          progress: 100,
          detail: job.detail || "Saved on this device. The local accelerator transcript is ready to review.",
          error: undefined,
        },
      );
    }
    case "canceled":
      return applyProjectStep(baseProject, {
        status: "canceled",
        step: "canceled",
        progress: 0,
        detail: job.detail,
        error: job.error?.message,
      });
    case "failed":
    default:
      return applyProjectStep(baseProject, {
        status: "error",
        step: "error",
        progress: 0,
        detail: job.detail,
        error: job.error?.message ?? job.detail,
      });
  }
}
