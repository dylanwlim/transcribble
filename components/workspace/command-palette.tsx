"use client";

import { Bookmark, FileText, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/transcribble/transcript";
import type { TranscriptProject } from "@/lib/transcribble/types";

type CommandItem =
  | {
      kind: "project";
      id: string;
      projectId: string;
      title: string;
      subtitle: string;
      search: string;
    }
  | {
      kind: "bookmark";
      id: string;
      projectId: string;
      segmentId: string;
      title: string;
      subtitle: string;
      search: string;
    }
  | {
      kind: "saved-range";
      id: string;
      projectId: string;
      rangeId: string;
      start: number;
      title: string;
      subtitle: string;
      search: string;
    };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  projects: TranscriptProject[];
  onOpenProject: (projectId: string) => void;
  onJumpToSegment: (projectId: string, segmentId: string) => void;
  onJumpToRange: (projectId: string, rangeId: string) => void;
}

function buildItems(projects: TranscriptProject[]): CommandItem[] {
  const items: CommandItem[] = [];
  for (const project of projects) {
    items.push({
      kind: "project",
      id: `project:${project.id}`,
      projectId: project.id,
      title: project.title,
      subtitle: project.transcript?.stats.duration
        ? `Recording · ${formatDuration(project.transcript.stats.duration)}`
        : "Recording",
      search: `${project.title} ${project.sourceName}`.toLowerCase(),
    });

    for (const mark of project.marks) {
      if (mark.kind !== "bookmark") continue;
      const segment = project.transcript?.segments.find((s) => s.id === mark.segmentId);
      items.push({
        kind: "bookmark",
        id: `bookmark:${mark.id}`,
        projectId: project.id,
        segmentId: mark.segmentId,
        title: mark.label || segment?.text.slice(0, 64) || "Bookmark",
        subtitle: `${project.title} · ${segment ? formatDuration(segment.start) : ""}`,
        search: `${mark.label} ${segment?.text ?? ""} ${project.title}`.toLowerCase(),
      });
    }

    for (const range of project.savedRanges) {
      items.push({
        kind: "saved-range",
        id: `range:${range.id}`,
        projectId: project.id,
        rangeId: range.id,
        start: range.start,
        title: range.label,
        subtitle: `${project.title} · ${formatDuration(range.start)}–${formatDuration(range.end)}`,
        search: `${range.label} ${project.title}`.toLowerCase(),
      });
    }
  }
  return items;
}

function score(item: CommandItem, query: string) {
  if (!query) return 0;
  const needle = query.toLowerCase();
  if (item.search.includes(needle)) {
    return item.search.startsWith(needle) ? 3 : item.title.toLowerCase().includes(needle) ? 2 : 1;
  }
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => item.search.includes(token))) {
    return 1;
  }
  return 0;
}

export function CommandPalette({
  open,
  onClose,
  projects,
  onOpenProject,
  onJumpToSegment,
  onJumpToRange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => buildItems(projects), [projects]);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return items.slice(0, 80);
    }
    return items
      .map((item) => ({ item, score: score(item, trimmed) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map((entry) => entry.item);
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[data-active="true"]');
    if (active) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.top < containerRect.top) {
        active.scrollIntoView({ block: "nearest" });
      } else if (activeRect.bottom > containerRect.bottom) {
        active.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex]);

  if (!open) return null;

  const runItem = (item: CommandItem) => {
    if (item.kind === "project") {
      onOpenProject(item.projectId);
    } else if (item.kind === "bookmark") {
      onJumpToSegment(item.projectId, item.segmentId);
    } else {
      onJumpToRange(item.projectId, item.rangeId);
    }
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(filtered.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) runItem(item);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh]"
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-[var(--shadow-float)] animate-sheet-in">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 text-subtle" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a recording, bookmark, or saved range"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-subtle outline-none"
            aria-label="Command search"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div ref={listRef} className="scroll-y max-h-[50vh] p-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <Sparkles className="h-4 w-4 text-subtle" />
              <div className="text-[13px] text-muted-foreground">No matches.</div>
              <div className="text-[11px] text-subtle">
                Try a title, a bookmark, or a saved range.
              </div>
            </div>
          ) : (
            filtered.map((item, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runItem(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-75",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      item.kind === "bookmark"
                        ? "bg-primary/10 text-primary"
                        : item.kind === "saved-range"
                          ? "bg-warning/15 text-warning"
                          : "bg-muted text-subtle",
                    )}
                  >
                    {item.kind === "bookmark" ? (
                      <Bookmark className="h-3.5 w-3.5 fill-current" />
                    ) : item.kind === "saved-range" ? (
                      <span className="text-[10px] mono">R</span>
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-foreground">
                      {item.title}
                    </div>
                    <div className="truncate text-[11px] text-subtle">
                      {item.subtitle}
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-subtle">
                    {item.kind === "project"
                      ? "Recording"
                      : item.kind === "bookmark"
                        ? "Bookmark"
                        : "Saved range"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-subtle">
          <span className="inline-flex items-center gap-2">
            <kbd className="rounded border border-border bg-surface px-1 mono">↑</kbd>
            <kbd className="rounded border border-border bg-surface px-1 mono">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <kbd className="rounded border border-border bg-surface px-1 mono">↵</kbd>
            <span>Open</span>
            <kbd className="rounded border border-border bg-surface px-1 mono">Esc</kbd>
            <span>Close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
