"use client";

import {
  Bookmark,
  Clock,
  Download,
  FileAudio,
  Highlighter,
  Info,
  MessageSquare,
  Trash2,
  Video,
  X,
} from "lucide-react";
import React, { type ReactNode, useEffect } from "react";

import { cn } from "@/lib/utils";
import { formatBytes, formatDuration } from "@/lib/transcribble/transcript";
import type {
  SavedRange,
  TranscriptMark,
  TranscriptProject,
} from "@/lib/transcribble/types";

interface InspectorProps {
  project: TranscriptProject;
  marks: TranscriptMark[];
  ranges: SavedRange[];
  onClose: () => void;
  onJumpToSegment: (segmentId: string, autoplay?: boolean) => void;
  onJumpToTime: (time: number) => void;
  onRemoveRange: (rangeId: string) => void;
  onToggleHighlight: (color: "amber" | "sky" | "rose") => void;
  onExport: () => void;
}

export function Inspector({
  project,
  marks,
  ranges,
  onClose,
  onJumpToSegment,
  onJumpToTime,
  onRemoveRange,
  onToggleHighlight,
  onExport,
}: InspectorProps) {
  const transcript = project.transcript;
  const stats = transcript?.stats;
  const bookmarks = marks.filter((mark) => mark.kind === "bookmark");
  const highlights = marks.filter((mark) => mark.kind === "highlight");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasBookmarksOrHighlights = bookmarks.length > 0 || highlights.length > 0;
  const sourceExt = extractExtension(project.sourceName);
  const createdAt = new Date(project.createdAt);

  return (
    <>
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-foreground/15 backdrop-blur-[1px] animate-fade-in 2xl:hidden"
      />
      <aside
        className={cn(
          "animate-rise-in flex flex-col border-l border-border bg-surface",
          "fixed inset-y-0 right-0 z-40 h-full w-[min(22rem,100%)] shadow-[var(--shadow-float)]",
          "2xl:relative 2xl:z-auto 2xl:w-[20rem] 2xl:shadow-none",
        )}
        aria-label="Recording details"
      >
        <div className="flex h-[var(--workspace-header-height)] shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-subtle" />
            <span className="text-[13px] font-semibold tracking-tight">Details</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-muted hover:text-foreground motion-safe:active:scale-[0.95] ring-focus"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="scroll-y flex-1 px-4 py-4">
          <Section title="About">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
              <MetaCell
                icon={project.mediaKind === "video" ? Video : FileAudio}
                label="Source"
                value={project.sourceName}
                span={2}
                title={project.sourceName}
              />
              <MetaCell
                icon={Clock}
                label="Duration"
                value={formatDuration(stats?.duration ?? project.duration ?? 0)}
              />
              <MetaCell
                label="Size"
                value={formatBytes(project.sourceSize)}
              />
              <MetaCell
                label="Format"
                value={sourceExt ? sourceExt.toUpperCase() : "—"}
              />
              <MetaCell
                label="Created"
                value={createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              />
              {stats ? (
                <MetaCell
                  label="Words"
                  value={stats.wordCount.toLocaleString()}
                />
              ) : null}
              <MetaCell
                label="Stored"
                value="This device"
                title="Recordings live in this browser's local storage; nothing is uploaded."
              />
            </div>
          </Section>

          {hasBookmarksOrHighlights ? (
            <Section title="Bookmarks & highlights" icon={Bookmark}>
              <div className="space-y-0.5">
                {bookmarks.map((mark) => (
                  <button
                    key={mark.id}
                    type="button"
                    onClick={() => onJumpToSegment(mark.segmentId, true)}
                    className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 -mx-2 text-left text-[12px] leading-5 transition-colors duration-150 hover:bg-muted ring-focus"
                  >
                    <Bookmark className="mt-0.5 h-3 w-3 shrink-0 fill-current text-primary" />
                    <span className="line-clamp-2 flex-1">{mark.label}</span>
                  </button>
                ))}
                {highlights.map((mark) => (
                  <button
                    key={mark.id}
                    type="button"
                    onClick={() => onJumpToSegment(mark.segmentId, true)}
                    className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 -mx-2 text-left text-[12px] leading-5 transition-colors duration-150 hover:bg-muted ring-focus"
                  >
                    <span
                      className={cn(
                        "mt-1 inline-flex h-3 w-[3px] shrink-0 rounded-full",
                        mark.color === "amber"
                          ? "bg-warning"
                          : mark.color === "rose"
                            ? "bg-record"
                            : "bg-primary",
                      )}
                    />
                    <span className="line-clamp-2 flex-1">{mark.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1 pl-1 text-[11px] text-subtle">
                <Highlighter className="h-3 w-3" /> Highlight:
                <HighlightDot color="sky" onClick={() => onToggleHighlight("sky")} />
                <HighlightDot color="amber" onClick={() => onToggleHighlight("amber")} />
                <HighlightDot color="rose" onClick={() => onToggleHighlight("rose")} />
              </div>
            </Section>
          ) : null}

          {ranges.length > 0 ? (
            <Section title="Saved ranges" icon={MessageSquare}>
              <ul className="space-y-0.5">
                {ranges.map((range) => (
                  <li key={range.id}>
                    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 transition-colors duration-150 hover:bg-muted">
                      <button
                        type="button"
                        onClick={() => onJumpToTime(range.start)}
                        className="flex-1 text-left text-[12px] leading-5 ring-focus"
                      >
                        <div className="truncate font-medium text-foreground">
                          {range.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-subtle tabular mono">
                          {formatDuration(range.start)} — {formatDuration(range.end)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRange(range.id)}
                        aria-label="Remove range"
                        className="rounded p-1 text-subtle opacity-0 transition-opacity duration-150 hover:text-record group-hover:opacity-100 focus-visible:opacity-100 ring-focus"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {project.status === "ready" ? (
            <Section title="Export">
              <button
                type="button"
                onClick={onExport}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-[12px]",
                  "transition-all duration-150 hover:bg-muted motion-safe:active:scale-[0.99] ring-focus",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Open export
                </span>
                <span className="text-[10px] text-subtle mono">⌘E</span>
              </button>
            </Section>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Clock;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {title}
      </div>
      <div>{children}</div>
    </section>
  );
}

function MetaCell({
  icon: Icon,
  label,
  value,
  span,
  title,
}: {
  icon?: typeof Clock;
  label: string;
  value: string;
  span?: 1 | 2;
  title?: string;
}) {
  return (
    <div className={cn("min-w-0", span === 2 && "col-span-2")} title={title}>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-subtle">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        <span>{label}</span>
      </div>
      <div className="truncate text-[12.5px] text-foreground tabular">{value}</div>
    </div>
  );
}

function HighlightDot({
  color,
  onClick,
}: {
  color: "amber" | "sky" | "rose";
  onClick: () => void;
}) {
  const className =
    color === "amber" ? "bg-warning" : color === "rose" ? "bg-record" : "bg-primary";
  return (
    <button
      type="button"
      aria-label={`Highlight ${color}`}
      onClick={onClick}
      className={cn(
        "ml-1 inline-block h-2.5 w-2.5 rounded-full transition-transform duration-150 hover:scale-125 ring-focus",
        className,
      )}
    />
  );
}

function extractExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1);
}
