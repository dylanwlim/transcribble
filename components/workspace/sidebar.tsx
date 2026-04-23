"use client";

import {
  AlertTriangle,
  Check,
  CircleDot,
  FileAudio,
  HardDrive,
  Mic,
  MoreHorizontal,
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
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { formatBytes, formatDuration } from "@/lib/transcribble/transcript";
import type {
  LibrarySearchResult,
  TranscriptProject,
} from "@/lib/transcribble/types";

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
  isRecording: boolean;
  librarySearchRef: React.Ref<HTMLInputElement>;
  storageUsedBytes: number | null;
  storageQuotaBytes: number | null;
  storagePersisted: boolean | null;
  modelReady: boolean;
  mediaReady: boolean;
  online: boolean;
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
    project.status === "queued" ||
    project.status === "preparing" ||
    project.status === "loading-model" ||
    project.status === "transcribing";
  const isError = project.status === "error";
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
        "group relative rounded-lg px-3 py-2.5 transition-colors duration-150",
        "cursor-pointer",
        selected
          ? "bg-muted/80"
          : "hover:bg-muted/50",
        dropHint === "before" && "shadow-[inset_0_2px_0_0_hsl(var(--primary))]",
        dropHint === "after" && "shadow-[inset_0_-2px_0_0_hsl(var(--primary))]",
      )}
      onClick={() => {
        if (renaming) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (renaming) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
    >
      <div className="flex items-center gap-2">
        <StatusDot project={project} />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              ref={renameRef}
              type="text"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitRename}
              onClick={(event) => event.stopPropagation()}
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
              className="w-full bg-transparent text-sm font-medium leading-tight text-foreground outline-none ring-focus rounded"
              aria-label="Rename recording"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              {project.pinned ? (
                <Pin className="h-3 w-3 shrink-0 text-subtle" aria-label="Pinned" />
              ) : null}
              <div className="truncate text-sm font-medium leading-tight text-foreground">
                {project.title}
              </div>
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle tabular">
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
        <button
          type="button"
          aria-label="Session actions"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className={cn(
            "rounded-md p-1 text-subtle opacity-0 transition-opacity duration-150",
            "hover:bg-border/40 hover:text-foreground ring-focus",
            "group-hover:opacity-100 focus-visible:opacity-100",
            (selected || menuOpen) && "opacity-100",
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
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

      {isError ? (
        <div className="mt-1.5 text-[11px] leading-4 text-warning">
          {project.error ?? "Couldn't finish yet"}
        </div>
      ) : null}

      {menuOpen ? (
        <div
          role="menu"
          onClick={(event) => event.stopPropagation()}
          className="absolute right-2 top-9 z-10 w-44 origin-top-right rounded-lg border border-border bg-popover p-1 text-sm shadow-[var(--shadow-float)] animate-rise-in"
        >
          {isError ? (
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
  isRecording,
  librarySearchRef,
  storageUsedBytes,
  storageQuotaBytes,
  storagePersisted,
  modelReady,
  mediaReady,
  online,
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
          p.status === "preparing" ||
          p.status === "loading-model" ||
          p.status === "transcribing",
      ),
      ready: projects.filter((p) => p.status === "ready" || p.status === "error"),
    }),
    [projects],
  );

  const storageLabel =
    storageUsedBytes !== null && storageQuotaBytes && storageQuotaBytes > 0
      ? `${formatBytes(storageUsedBytes)} / ${formatBytes(storageQuotaBytes)}`
      : storageUsedBytes !== null
        ? formatBytes(storageUsedBytes)
        : "Storage local";

  const allReady = modelReady && mediaReady;

  return (
    <aside className={cn("flex h-full min-h-0 w-full flex-col border-r border-border bg-surface", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <rect x="2" y="6" width="1.6" height="4" rx="0.8" />
              <rect x="5" y="3" width="1.6" height="10" rx="0.8" />
              <rect x="8" y="5" width="1.6" height="6" rx="0.8" />
              <rect x="11" y="2" width="1.6" height="12" rx="0.8" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold tracking-tight">Transcribble</span>
        </div>
        {headerAction}
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
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 select-none rounded-full border border-border-strong bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground mono">
              ⌘K
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onImport}
          className={cn(
            "group flex min-h-10 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium",
            "text-foreground hover:bg-muted/60 transition-colors duration-150 ring-focus",
          )}
        >
          <Upload className="h-3.5 w-3.5 text-subtle group-hover:text-foreground" />
          <span>Add recording</span>
          <span className="ml-auto select-none rounded-full border border-border-strong bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground mono">
            ⌘O
          </span>
        </button>
        <button
          type="button"
          onClick={() => void onToggleRecording()}
          aria-label={isRecording ? "Stop recording" : "Record from microphone"}
          title={isRecording ? "Stop recording" : "Record from microphone"}
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 ring-focus",
            isRecording
              ? "bg-record text-background animate-pulse-record"
              : "text-subtle hover:bg-muted/60 hover:text-foreground",
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
                    Add a recording to begin.
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-[11px]">
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" />
              <div className="min-w-0">
                <div className="truncate font-medium text-muted-foreground tabular">
                  {storageLabel}
                </div>
                {storagePersisted === false ? (
                  <div className="mt-1 flex items-start gap-1.5 text-[10px] leading-4 text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning" />
                    <span className="min-w-0 text-balance">
                      Browser may clear files if storage gets tight
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <span
            title={
              allReady
                ? online
                  ? "Local tools ready"
                  : "Local tools ready · Offline"
                : online
                  ? "One-time setup needed"
                  : "Offline · setup needs internet"
            }
            className={cn(
              "inline-flex min-h-8 items-center gap-1 self-start whitespace-nowrap rounded-full border border-border-strong px-2.5 text-[10px] font-medium uppercase tracking-[0.16em]",
              allReady ? "text-success" : "text-warning",
            )}
          >
            {allReady ? <Check className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
            <span>{allReady ? "Ready" : "Setup"}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

export const SidebarIcons = {
  file: FileAudio,
};
