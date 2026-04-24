"use client";

import {
  AlertTriangle,
  Check,
  CircleDot,
  FileAudio,
  HardDrive,
  Mic,
  MoreHorizontal,
  MonitorUp,
  Pencil,
  Pin,
  PinOff,
  RotateCw,
  Search,
  Square,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  ADD_RECORDING_HELPER,
  ADD_RECORDING_LABEL,
  SETTINGS_OPEN_LABEL,
  SETTINGS_SIDEBAR_LABEL,
} from "@/lib/transcribble/constants";
import { buildStorageStatus } from "@/lib/transcribble/storage";
import { formatDuration } from "@/lib/transcribble/transcript";
import type {
  LibrarySearchResult,
  TranscriptProject,
} from "@/lib/transcribble/types";
import { KeyboardShortcut } from "./keyboard-shortcut";

interface SidebarProps {
  projects: TranscriptProject[];
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onImport: () => void;
  libraryQuery: string;
  onLibraryQueryChange: (value: string) => void;
  searchResults: LibrarySearchResult[];
  onOpenSearchResult: (result: LibrarySearchResult) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onReorder: (sourceId: string, targetId: string, position: "before" | "after") => void;
  onToggleRecording: () => void | Promise<void>;
  onOpenSettings: () => void;
  isRecording: boolean;
  librarySearchRef: React.Ref<HTMLInputElement>;
  storageUsedBytes: number | null;
  storageAvailableBytes: number | null;
  storagePersisted: boolean | null;
  modelReady: boolean;
  mediaReady: boolean;
  online: boolean;
  helperAvailable: boolean;
  helperSummary: string;
  desktopAppInstalled: boolean;
  desktopInstallAvailable: boolean;
  onOpenDesktopApp: () => void | Promise<void>;
  className?: string;
  headerAction?: React.ReactNode;
  showSearchShortcut?: boolean;
}

function formatDate(iso: string) {
  const now = new Date();
  const then = new Date(iso);
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

function StatusDot({ project }: { project: TranscriptProject }) {
  if (project.status === "error") {
    return (
      <span
        title="Needs attention"
        aria-label="Needs attention"
        className="flex h-2 w-2 shrink-0 items-center justify-center rounded-full bg-warning"
      />
    );
  }
  if (project.status === "paused") {
    const pausedLabel =
      project.step === "needs-local-helper" ? "Local accelerator required" : "Paused locally";
    return (
      <span
        title={pausedLabel}
        aria-label={pausedLabel}
        className="flex h-2 w-2 shrink-0 rounded-full bg-transparent ring-1 ring-inset ring-warning"
      />
    );
  }
  if (project.status === "ready") {
    return (
      <span
        title="Ready"
        aria-label="Ready"
        className="flex h-2 w-2 shrink-0 rounded-full bg-transparent ring-1 ring-inset ring-border-strong"
      />
    );
  }
  return (
    <span
      title={project.stageLabel}
      aria-label={project.stageLabel}
      className="flex h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse-record"
    />
  );
}

function ProjectRow({
  project,
  selected,
  onOpen,
  onRetry,
  onRemove,
  onRename,
  onTogglePin,
  onDragStartRow,
  onDropOnRow,
}: {
  project: TranscriptProject;
  selected: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  onDragStartRow: (id: string) => void;
  onDropOnRow: (targetId: string, position: "before" | "after") => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [dropHint, setDropHint] = useState<"before" | "after" | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  const duration =
    project.transcript?.stats.duration ?? project.duration ?? 0;
  const isActive =
    project.status === "pending-upload" ||
    project.status === "uploading" ||
    project.status === "queued" ||
    project.status === "preparing" ||
    project.status === "loading-model" ||
    project.status === "extracting-audio" ||
    project.status === "chunking" ||
    project.status === "merging" ||
    project.status === "transcribing";
  const isRetryable =
    project.status === "error" || project.status === "paused" || project.status === "canceled";
  const statusMessageTone =
    project.status === "error" || project.status === "canceled" ? "text-warning" : "text-muted-foreground";
  const progress = Math.max(0, Math.min(100, project.progress));

  useEffect(() => {
    if (!renaming) setTitleDraft(project.title);
  }, [project.title, renaming]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const commitRename = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== project.title) onRename(trimmed);
    setRenaming(false);
  };

  return (
    <div
      role="option"
      aria-selected={selected}
      draggable={!isActive && !renaming}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", project.id);
        onDragStartRow(project.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        const position = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
        setDropHint(position);
      }}
      onDragLeave={() => setDropHint(null)}
      onDrop={(event) => {
        event.preventDefault();
        const position = dropHint ?? "after";
        setDropHint(null);
        onDropOnRow(project.id, position);
      }}
      className={cn(
        "group relative rounded-lg transition-colors duration-150",
        selected ? "bg-primary text-primary-foreground" : "hover:bg-muted/50",
        dropHint === "before" && "shadow-[inset_0_2px_0_0_hsl(var(--primary))]",
        dropHint === "after" && "shadow-[inset_0_-2px_0_0_hsl(var(--primary))]",
      )}
    >
      {renaming ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 pr-8">
            <StatusDot project={project} />
            <div className="min-w-0 flex-1">
              <input
                ref={renameRef}
                type="text"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTitleDraft(project.title);
                    setRenaming(false);
                  }
                }}
                className={cn(
                  "w-full rounded bg-transparent text-sm font-medium leading-tight outline-none ring-focus",
                  selected ? "text-primary-foreground" : "text-foreground",
                )}
                aria-label="Rename recording"
              />
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-1.5 text-[11px] tabular",
                  selected ? "text-primary-foreground/75" : "text-subtle",
                )}
              >
                <span>{formatDate(project.updatedAt)}</span>
                {duration > 0 ? (
                  <>
                    <span className="text-border-strong">·</span>
                    <span>{formatDuration(duration)}</span>
                  </>
                ) : null}
                {project.mediaKind === "video" ? (
                  <Video className="h-3 w-3 opacity-50" />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="w-full rounded-lg px-3 py-2.5 text-left ring-focus"
        >
          <div className="flex items-center gap-2 pr-8">
            <StatusDot project={project} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {project.pinned ? (
                  <Pin className="h-3 w-3 shrink-0 text-subtle" aria-label="Pinned" />
                ) : null}
                <div
                  className={cn(
                    "truncate text-sm font-semibold leading-tight",
                    selected ? "text-primary-foreground" : "text-foreground",
                  )}
                >
                  {project.title}
                </div>
              </div>
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-1.5 text-[11px] tabular",
                  selected ? "text-primary-foreground/75" : "text-subtle",
                )}
              >
                <span>{formatDate(project.updatedAt)}</span>
                {duration > 0 ? (
                  <>
                    <span className="text-border-strong">·</span>
                    <span>{formatDuration(duration)}</span>
                  </>
                ) : null}
                {project.mediaKind === "video" ? (
                  <Video className="h-3 w-3 opacity-50" />
                ) : null}
              </div>
            </div>
          </div>

          {isActive ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border/60">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] uppercase tracking-wider text-subtle">
                {project.stageLabel}
              </span>
            </div>
          ) : null}

          {isRetryable ? (
            <div className={cn("mt-1.5 text-[11px] leading-4", statusMessageTone)}>
              {project.detail || project.error || "Saved and waiting"}
            </div>
          ) : null}
        </button>
      )}

      <button
        type="button"
        aria-label="Session actions"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
        className={cn(
          "absolute right-2 top-2 rounded-md p-1 text-subtle opacity-0 transition-opacity duration-150",
          "hover:bg-border/40 hover:text-foreground ring-focus",
          "group-hover:opacity-100 focus-visible:opacity-100",
          (selected || menuOpen) && "opacity-100",
        )}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="absolute right-2 top-9 z-10 w-44 origin-top-right rounded-lg border border-border bg-popover p-1 text-sm shadow-[var(--shadow-float)] animate-rise-in"
        >
          {isRetryable ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRetry();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Try again
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setRenaming(true);
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onTogglePin();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
          >
            {project.pinned ? (
              <>
                <PinOff className="h-3.5 w-3.5" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="h-3.5 w-3.5" />
                Pin to top
              </>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRemove();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-record hover:bg-record-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SearchResultRow({
  result,
  onOpen,
}: {
  result: LibrarySearchResult;
  onOpen: () => void;
}) {
  const excerpt = result.entry.text;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/60 ring-focus"
    >
      <div className="truncate text-sm font-medium">{result.projectTitle}</div>
      <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
        {excerpt}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-subtle tabular">
        <span>{result.matchKind === "title" ? "Title" : result.matchKind === "saved-range" ? "Saved range" : "Transcript"}</span>
        <span className="text-border-strong">·</span>
        <span>{formatDuration(result.entry.start)}</span>
      </div>
    </button>
  );
}

export function Sidebar({
  projects,
  selectedProjectId,
  onSelect,
  onImport,
  libraryQuery,
  onLibraryQueryChange,
  searchResults,
  onOpenSearchResult,
  onRetry,
  onRemove,
  onRename,
  onTogglePin,
  onReorder,
  onToggleRecording,
  onOpenSettings,
  isRecording,
  librarySearchRef,
  storageUsedBytes,
  storageAvailableBytes,
  storagePersisted,
  modelReady,
  mediaReady,
  online,
  helperAvailable,
  helperSummary,
  desktopAppInstalled,
  desktopInstallAvailable,
  onOpenDesktopApp,
  className,
  headerAction,
  showSearchShortcut = true,
}: SidebarProps) {
  const dragSourceRef = useRef<string | null>(null);
  const searching = libraryQuery.trim().length > 0;
  const { active, ready } = useMemo(
    () => ({
      active: projects.filter(
        (p) =>
          p.status === "queued" ||
          p.status === "pending-upload" ||
          p.status === "uploading" ||
          p.status === "preparing" ||
          p.status === "loading-model" ||
          p.status === "extracting-audio" ||
          p.status === "chunking" ||
          p.status === "transcribing" ||
          p.status === "merging",
      ),
      ready: projects.filter((p) => p.status === "ready" || p.status === "error" || p.status === "paused"),
    }),
    [projects],
  );

  const storageSummary = buildStorageStatus(storageUsedBytes, storageAvailableBytes);
  const browserToolsReady = modelReady && mediaReady;
  const allReady = browserToolsReady && helperAvailable;
  const workspaceStatusTitle = allReady
    ? online
      ? "Workspace ready"
      : "Workspace ready offline"
    : browserToolsReady
      ? "Helper not connected"
      : online
        ? "Browser setup needed"
        : "Needs one online pass";
  const workspaceStatusSummary = allReady
    ? "Browser tools and the local accelerator are ready."
    : browserToolsReady
      ? helperSummary
      : online
        ? "Prepare this browser once, then keep the recording work local."
        : "Go online once so this browser can cache its local tools.";
  const storageLine = [storageSummary.usedLabel, storageSummary.availableLabel].filter(Boolean).join(" · ");

  const desktopLabel = desktopAppInstalled
    ? "Open app"
    : desktopInstallAvailable
      ? "Install app"
      : "Desktop app";

  return (
    <aside className={cn("flex h-full min-h-0 w-full flex-col border-r border-border bg-surface", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold tracking-tight text-foreground">
            All Recordings
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Local transcripts
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void onOpenDesktopApp()}
            title={desktopLabel}
            aria-label={desktopLabel}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
          >
            <MonitorUp className="h-3.5 w-3.5" />
            <span className="hidden min-[380px]:inline">{desktopLabel}</span>
          </button>
          {headerAction}
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            ref={librarySearchRef}
            type="search"
            value={libraryQuery}
            onChange={(event) => onLibraryQueryChange(event.target.value)}
            placeholder="Search"
            aria-label="Search library"
            className={cn(
              "h-9 w-full rounded-xl border border-border/70 bg-muted/70 pl-8 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground",
              "ring-focus",
            )}
          />
          {libraryQuery ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onLibraryQueryChange("")}
              className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-border/60 ring-focus"
            >
              <X className="h-3 w-3" />
            </button>
          ) : showSearchShortcut ? (
            <KeyboardShortcut
              shortcutId="search-library"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 select-none"
            />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onImport}
          className={cn(
            "group flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-left text-[13px] font-medium",
            "text-foreground transition-colors duration-150 hover:bg-muted ring-focus",
          )}
        >
          <Upload className="h-3.5 w-3.5 text-subtle group-hover:text-foreground" />
          <span>{ADD_RECORDING_LABEL}</span>
          <KeyboardShortcut shortcutId="add-recording" className="ml-auto select-none" />
        </button>
        <button
          type="button"
          onClick={() => void onToggleRecording()}
          aria-label={isRecording ? "Stop recording" : "Record from microphone"}
          title={isRecording ? "Stop recording" : "Record from microphone"}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-surface transition-colors duration-150 ring-focus",
            isRecording
              ? "bg-record text-background animate-pulse-record"
              : "text-subtle hover:bg-muted hover:text-foreground",
          )}
        >
          {isRecording ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        <div className="scroll-y h-full px-3 pb-3">
          {searching ? (
            <div className="px-1 py-2">
              <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
                Results
              </div>
              {searchResults.length === 0 ? (
                <div className="px-2 py-6 text-center text-[12px] text-subtle">
                  Nothing in the library matches that.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {searchResults.map((result) => (
                    <SearchResultRow
                      key={`${result.projectId}-${result.entry.segmentId}-${result.entry.start}`}
                      result={result}
                      onOpen={() => onOpenSearchResult(result)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {active.length > 0 ? (
                <section>
                  <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
                    Working
                  </div>
                  <div className="space-y-0.5">
                    {active.map((project) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        selected={project.id === selectedProjectId}
                        onOpen={() => onSelect(project.id)}
                        onRetry={() => onRetry(project.id)}
                        onRemove={() => onRemove(project.id)}
                        onRename={(title) => onRename(project.id, title)}
                        onTogglePin={() => onTogglePin(project.id)}
                        onDragStartRow={(id) => {
                          dragSourceRef.current = id;
                        }}
                        onDropOnRow={(targetId, position) => {
                          const sourceId = dragSourceRef.current;
                          dragSourceRef.current = null;
                          if (sourceId) onReorder(sourceId, targetId, position);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
                  Library
                </div>
                {ready.length === 0 ? (
                <div className="px-2 py-6 text-[12px] leading-5 text-muted-foreground">
                    {ADD_RECORDING_HELPER}
                </div>
              ) : (
                  <div className="space-y-0.5">
                    {ready.map((project) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        selected={project.id === selectedProjectId}
                        onOpen={() => onSelect(project.id)}
                        onRetry={() => onRetry(project.id)}
                        onRemove={() => onRemove(project.id)}
                        onRename={(title) => onRename(project.id, title)}
                        onTogglePin={() => onTogglePin(project.id)}
                        onDragStartRow={(id) => {
                          dragSourceRef.current = id;
                        }}
                        onDropOnRow={(targetId, position) => {
                          const sourceId = dragSourceRef.current;
                          dragSourceRef.current = null;
                          if (sourceId) onReorder(sourceId, targetId, position);
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-[var(--workspace-footer-padding)] pb-[max(var(--workspace-footer-padding),env(safe-area-inset-bottom))] pt-3">
        <div className="rounded-2xl border border-border/80 bg-surface/80 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
                {allReady ? <Check className="h-3 w-3 text-success" /> : <CircleDot className="h-3 w-3 text-warning" />}
                <span>{workspaceStatusTitle}</span>
              </div>
              <div className="mt-1 text-[12px] leading-5 text-foreground/90">
                {workspaceStatusSummary}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular">
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-subtle" />
                <span className="min-w-0 truncate">{storageLine}</span>
              </div>
              {storagePersisted === false ? (
                <div className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning" />
                  <span className="min-w-0">Browser may clear saved files if storage gets tight.</span>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label={SETTINGS_OPEN_LABEL}
              title={SETTINGS_OPEN_LABEL}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 self-start whitespace-nowrap rounded-full border border-border-strong px-3 text-[10px] font-medium uppercase tracking-[0.16em] ring-focus",
                "transition-colors duration-150 hover:bg-muted/70",
                allReady ? "text-success hover:text-success" : "text-warning hover:text-warning",
              )}
            >
              <span>{SETTINGS_SIDEBAR_LABEL}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export const SidebarIcons = {
  file: FileAudio,
};
