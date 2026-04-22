"use client";

import {
  Bookmark,
  Clock,
  Download,
  FileAudio,
  Highlighter,
  Info,
  MessageSquare,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";

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
  const insights = transcript?.insights;
  const stats = transcript?.stats;
  const bookmarks = marks.filter((mark) => mark.kind === "bookmark");
  const highlights = marks.filter((mark) => mark.kind === "highlight");

  return (
    <aside className="flex h-full w-[320px] flex-col border-l border-border bg-surface animate-fade-in">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-subtle" />
          <span className="text-[13px] font-medium">Details</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="scroll-y flex-1 px-4 py-4">
        <Section title="About">
          <div className="space-y-1.5 text-[12px]">
            <MetaRow
              icon={project.mediaKind === "video" ? Video : FileAudio}
              label="Source"
              value={project.sourceName}
            />
            <MetaRow
              icon={Clock}
              label="Duration"
              value={formatDuration(stats?.duration ?? project.duration ?? 0)}
            />
            <MetaRow
              label="Size"
              value={formatBytes(project.sourceSize)}
            />
            <MetaRow
              label="Created"
              value={new Date(project.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            />
            {stats ? (
              <MetaRow label="Words" value={`${stats.wordCount.toLocaleString()}`} />
            ) : null}
          </div>
        </Section>

        {insights && insights.summary.length > 0 ? (
          <Section title="Summary" icon={Sparkles}>
            <ul className="space-y-2">
              {insights.summary.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToSegment(item.reference.segmentId, true)}
                    className="group block w-full rounded-md px-2 py-1.5 -mx-2 text-left text-[12px] leading-5 text-foreground/90 transition-colors duration-150 hover:bg-muted ring-focus"
                  >
                    <span>{item.text}</span>
                    <span className="mt-0.5 block text-[10px] text-subtle tabular mono">
                      {formatDuration(item.reference.start)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {insights && insights.actions.length > 0 ? (
          <Section title="Action items">
            <ul className="space-y-1.5">
              {insights.actions.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToSegment(item.reference.segmentId, true)}
                    className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 -mx-2 text-left text-[12px] leading-5 hover:bg-muted ring-focus"
                  >
                    <span className="mt-1.5 block h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span className="flex-1">{item.text}</span>
                    <span className="text-[10px] text-subtle tabular mono">
                      {formatDuration(item.reference.start)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {bookmarks.length > 0 || highlights.length > 0 ? (
          <Section title="Bookmarks & highlights" icon={Bookmark}>
            <div className="space-y-1">
              {bookmarks.map((mark) => (
                <button
                  key={mark.id}
                  type="button"
                  onClick={() => onJumpToSegment(mark.segmentId, true)}
                  className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 -mx-2 text-left text-[12px] hover:bg-muted ring-focus"
                >
                  <Bookmark className="mt-0.5 h-3 w-3 fill-current text-primary" />
                  <span className="line-clamp-2 flex-1 leading-5">{mark.label}</span>
                </button>
              ))}
              {highlights.map((mark) => (
                <button
                  key={mark.id}
                  type="button"
                  onClick={() => onJumpToSegment(mark.segmentId, true)}
                  className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 -mx-2 text-left text-[12px] hover:bg-muted ring-focus"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-3 w-[3px] rounded-full",
                      mark.color === "amber"
                        ? "bg-warning"
                        : mark.color === "rose"
                          ? "bg-record"
                          : "bg-primary",
                    )}
                  />
                  <span className="line-clamp-2 flex-1 leading-5">{mark.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 pl-1 text-[11px] text-subtle">
              <Highlighter className="h-3 w-3" /> Highlight:
              <HighlightDot color="sky" onClick={() => onToggleHighlight("sky")} />
              <HighlightDot color="amber" onClick={() => onToggleHighlight("amber")} />
              <HighlightDot color="rose" onClick={() => onToggleHighlight("rose")} />
            </div>
          </Section>
        ) : null}

        {ranges.length > 0 ? (
          <Section title="Saved ranges" icon={MessageSquare}>
            <ul className="space-y-1">
              {ranges.map((range) => (
                <li key={range.id}>
                  <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-muted">
                    <button
                      type="button"
                      onClick={() => onJumpToTime(range.start)}
                      className="flex-1 text-left text-[12px] leading-5 ring-focus"
                    >
                      <div className="font-medium text-foreground">
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
                      className="opacity-0 transition-opacity hover:text-record group-hover:opacity-100 ring-focus"
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
              className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-[12px] hover:bg-muted ring-focus"
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
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between text-[10px] font-medium uppercase tracking-wider text-subtle hover:text-foreground"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          {Icon ? <Icon className="h-3 w-3" /> : null}
          {title}
        </span>
        <span className={cn("transition-transform duration-150", open ? "rotate-90" : "rotate-0")}>
          ›
        </span>
      </button>
      {open ? <div>{children}</div> : null}
    </section>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-subtle">
        {Icon ? <Icon className="inline h-3 w-3 mr-1" /> : null}
        {label}
      </div>
      <div className="min-w-0 flex-1 break-words text-[12px] text-foreground/90 tabular">
        {value}
      </div>
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
        "ml-1 inline-block h-2.5 w-2.5 rounded-full transition-transform hover:scale-125 ring-focus",
        className,
      )}
    />
  );
}
