"use client";

import { MonitorUp, Pin, Upload, Video } from "lucide-react";
import React, { useMemo } from "react";

import { cn } from "@/lib/utils";
import { ADD_RECORDING_LABEL } from "@/lib/transcribble/constants";
import { formatDuration } from "@/lib/transcribble/transcript";
import type { TranscriptProject } from "@/lib/transcribble/types";

interface LibraryOverviewProps {
  projects: TranscriptProject[];
  onOpenProject: (id: string) => void;
  onImport: () => void;
  desktopAppInstalled: boolean;
  desktopInstallAvailable: boolean;
  onOpenDesktopApp: () => void | Promise<void>;
}

function formatRelative(iso: string) {
  const then = new Date(iso);
  const now = new Date();
  const sameDay =
    now.getFullYear() === then.getFullYear() &&
    now.getMonth() === then.getMonth() &&
    now.getDate() === then.getDate();
  if (sameDay) {
    return then.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = now.getFullYear() === then.getFullYear();
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function summarize(project: TranscriptProject): string {
  const text = project.transcript?.segments?.map((s) => s.text).join(" ").trim();
  if (text && text.length > 0) return text;
  switch (project.status) {
    case "ready":
      return "Recording saved. Open to read the transcript.";
    case "paused":
      return project.detail || "Saved locally. Resume when ready.";
    case "error":
      return project.error || "Needs attention.";
    case "canceled":
      return "Canceled. Open to retry.";
    default:
      return project.stageLabel || "Processing…";
  }
}

function statusTone(project: TranscriptProject): string {
  if (project.status === "error") return "text-warning";
  if (project.status === "paused" || project.status === "canceled") return "text-warning/90";
  if (project.status === "ready") return "text-subtle";
  return "text-primary";
}

function statusLabel(project: TranscriptProject): string {
  if (project.status === "ready") return "Ready";
  if (project.status === "error") return "Needs attention";
  if (project.status === "paused") return "Paused";
  if (project.status === "canceled") return "Canceled";
  return project.stageLabel || "Working";
}

export function LibraryOverview({
  projects,
  onOpenProject,
  onImport,
  desktopAppInstalled,
  desktopInstallAvailable,
  onOpenDesktopApp,
}: LibraryOverviewProps) {
  const sorted = useMemo(() => {
    const copy = projects.slice();
    copy.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return copy;
  }, [projects]);

  const readyCount = projects.filter((p) => p.status === "ready").length;
  const totalDuration = projects.reduce(
    (acc, project) => acc + (project.transcript?.stats.duration ?? project.duration ?? 0),
    0,
  );

  const desktopLabel = desktopAppInstalled
    ? "Open app"
    : desktopInstallAvailable
      ? "Install app"
      : "Desktop app";

  return (
    <div className="scroll-y flex h-full min-h-0 w-full flex-col">
      <div className="mx-auto w-full max-w-[min(1100px,100%)] px-[var(--workspace-mobile-padding)] py-8 lg:px-10 lg:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">
              Library
            </div>
            <h1 className="mt-1 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight text-foreground">
              All recordings
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {projects.length === 0
                ? "Nothing saved yet."
                : `${projects.length} saved · ${readyCount} ready · ${formatDuration(totalDuration)} total`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void onOpenDesktopApp()}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[12px] font-medium text-foreground",
                "transition-colors duration-150 hover:bg-muted ring-focus",
              )}
            >
              <MonitorUp className="h-3.5 w-3.5" />
              {desktopLabel}
            </button>
            <button
              type="button"
              onClick={onImport}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[12px] font-medium text-background",
                "transition-transform duration-150 motion-safe:hover:-translate-y-px ring-focus",
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {ADD_RECORDING_LABEL}
            </button>
          </div>
        </header>

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
            <p className="text-[14px] text-muted-foreground">
              Drop an audio or video file anywhere to start, or record from your microphone.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((project) => {
              const duration =
                project.transcript?.stats.duration ?? project.duration ?? 0;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className={cn(
                    "group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 text-left",
                    "transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-soft)] ring-focus",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {project.pinned ? (
                          <Pin className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                        ) : null}
                        <div className="truncate text-[14px] font-semibold tracking-tight text-foreground">
                          {project.title}
                        </div>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle tabular">
                        <span>{formatRelative(project.updatedAt)}</span>
                        {duration > 0 ? (
                          <>
                            <span className="text-border-strong">·</span>
                            <span>{formatDuration(duration)}</span>
                          </>
                        ) : null}
                        {project.mediaKind === "video" ? (
                          <Video className="h-3 w-3 opacity-60" aria-hidden />
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                        statusTone(project),
                      )}
                    >
                      {statusLabel(project)}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-[12.5px] leading-5 text-muted-foreground">
                    {summarize(project)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
