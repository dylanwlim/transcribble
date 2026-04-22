"use client";

import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Highlighter,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/transcribble/transcript";
import type {
  TranscriptMark,
  TranscriptProject,
  TranscriptSegment,
  TranscriptTurn,
} from "@/lib/transcribble/types";

interface TranscriptPaneProps {
  project: TranscriptProject;
  segments: TranscriptSegment[];
  turns: TranscriptTurn[];
  focusedSegmentId: string | null;
  playbackSegmentId: string | null;
  marks: TranscriptMark[];
  matchedSegmentIds: Set<string>;
  transcriptQuery: string;
  onTranscriptQueryChange: (value: string) => void;
  onSelectSegment: (id: string, autoplay?: boolean) => void;
  onUpdateSegmentText: (text: string) => void;
  onToggleBookmark: () => void;
  onJumpMatch: (direction: -1 | 1) => void;
  transcriptSearchRef: React.Ref<HTMLInputElement>;
  partialTranscript?: string;
  canSearch: boolean;
  canEdit: boolean;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  try {
    const pattern = new RegExp(`(${escapeRegExp(query)})`, "gi");
    const parts = text.split(pattern);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark
          key={i}
          className="bg-primary/20 text-foreground rounded-sm px-0.5"
        >
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  } catch {
    return text;
  }
}

function TurnHeader({ turn }: { turn: TranscriptTurn }) {
  const label = turn.speakerLabel ?? null;
  return (
    <div className="flex items-baseline gap-3 pt-6 first:pt-0">
      <div className="w-14 text-right">
        <span className="text-[11px] text-subtle tabular mono">
          {formatDuration(turn.start)}
        </span>
      </div>
      <div className="flex-1">
        {label ? (
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SegmentRow({
  segment,
  isFocused,
  isPlaying,
  isMatched,
  marks,
  transcriptQuery,
  onSelect,
  onUpdate,
  canEdit,
}: {
  segment: TranscriptSegment;
  isFocused: boolean;
  isPlaying: boolean;
  isMatched: boolean;
  marks: TranscriptMark[];
  transcriptQuery: string;
  onSelect: (autoplay?: boolean) => void;
  onUpdate: (text: string) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(segment.text);
  }, [segment.text, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== segment.text) {
      onUpdate(next);
    }
    setEditing(false);
  };

  const hasBookmark = marks.some((m) => m.kind === "bookmark");
  const hasHighlight = marks.find((m) => m.kind === "highlight");
  const hasReview = segment.reviewReasons.length > 0;

  return (
    <div className="group flex items-start gap-3 py-1">
      <button
        type="button"
        onClick={() => onSelect(true)}
        className={cn(
          "w-14 shrink-0 pt-1 text-right text-[11px] tabular mono",
          "text-subtle transition-colors duration-150 hover:text-foreground",
          "ring-focus rounded",
          isPlaying && "text-primary",
        )}
        aria-label={`Jump to ${formatDuration(segment.start)}`}
      >
        {formatDuration(segment.start)}
      </button>

      <div
        className={cn(
          "relative min-w-0 flex-1 rounded-md px-3 py-1.5 -mx-3",
          "transition-colors duration-150",
          isFocused && "bg-muted/70",
          isPlaying && "bg-primary/5 ring-1 ring-inset ring-primary/20",
          isMatched && !isPlaying && "bg-primary/[0.04]",
        )}
      >
        {hasHighlight ? (
          <div
            className={cn(
              "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full",
              hasHighlight.color === "amber"
                ? "bg-warning"
                : hasHighlight.color === "rose"
                  ? "bg-record"
                  : "bg-primary",
            )}
          />
        ) : null}

        {editing && canEdit ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(segment.text);
                setEditing(false);
              }
            }}
            rows={Math.max(1, Math.ceil(draft.length / 80))}
            className={cn(
              "w-full resize-none bg-transparent text-[15px] leading-7 text-foreground outline-none",
              "ring-focus",
            )}
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(true)}
            onDoubleClick={() => canEdit && setEditing(true)}
            className={cn(
              "block w-full text-left text-[15px] leading-7",
              "text-foreground/90 transition-colors duration-150",
              "hover:text-foreground ring-focus rounded",
            )}
          >
            {highlightText(segment.text, transcriptQuery)}
          </button>
        )}

        {(hasBookmark || hasReview) && !editing ? (
          <div className="mt-1 flex items-center gap-1.5 opacity-60">
            {hasBookmark ? (
              <Bookmark className="h-3 w-3 fill-current text-primary" />
            ) : null}
            {hasReview ? (
              <span className="text-[10px] uppercase tracking-wider text-warning">
                Review
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TranscriptPane({
  project,
  segments,
  turns,
  focusedSegmentId,
  playbackSegmentId,
  marks,
  matchedSegmentIds,
  transcriptQuery,
  onTranscriptQueryChange,
  onSelectSegment,
  onUpdateSegmentText,
  onJumpMatch,
  transcriptSearchRef,
  partialTranscript,
  canSearch,
  canEdit,
}: TranscriptPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousPlaybackRef = useRef<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<number, TranscriptSegment[]>();
    for (const segment of segments) {
      const bucket = map.get(segment.turnIndex) ?? [];
      bucket.push(segment);
      map.set(segment.turnIndex, bucket);
    }
    return turns
      .map((turn) => ({ turn, segments: map.get(turn.index) ?? [] }))
      .filter((entry) => entry.segments.length > 0);
  }, [segments, turns]);

  const marksBySegment = useMemo(() => {
    const map = new Map<string, TranscriptMark[]>();
    for (const mark of marks) {
      const existing = map.get(mark.segmentId) ?? [];
      existing.push(mark);
      map.set(mark.segmentId, existing);
    }
    return map;
  }, [marks]);

  useLayoutEffect(() => {
    if (!playbackSegmentId) return;
    if (previousPlaybackRef.current === playbackSegmentId) return;
    previousPlaybackRef.current = playbackSegmentId;
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(
      `[data-segment-id="${playbackSegmentId}"]`,
    );
    if (!target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top;
    if (offset < 80 || offset > containerRect.height - 120) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [playbackSegmentId]);

  const hasSegments = segments.length > 0;
  const partial = partialTranscript?.trim();

  const matchTotal = matchedSegmentIds.size;
  const matchIndex = transcriptQuery && focusedSegmentId && matchedSegmentIds.has(focusedSegmentId)
    ? Array.from(matchedSegmentIds).indexOf(focusedSegmentId) + 1
    : 0;

  const onSearchKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onJumpMatch(event.shiftKey ? -1 : 1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onTranscriptQueryChange("");
        (event.currentTarget as HTMLInputElement).blur();
      }
    },
    [onJumpMatch, onTranscriptQueryChange],
  );

  return (
    <div className="flex h-full flex-col">
      {canSearch ? (
        <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-1 border-b border-border bg-background/95 px-1 py-2 backdrop-blur">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              ref={transcriptSearchRef}
              type="search"
              value={transcriptQuery}
              onChange={(event) => onTranscriptQueryChange(event.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Find in transcript"
              aria-label="Find in transcript"
              className={cn(
                "h-8 w-full rounded-md border-0 bg-muted/60 pl-8 pr-24 text-[13px] placeholder:text-subtle",
                "ring-focus",
              )}
            />
            <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-[10px] tabular text-subtle">
              {transcriptQuery ? (
                <span>
                  {matchIndex || 0} / {matchTotal}
                </span>
              ) : (
                <span className="rounded border border-border px-1 mono">/</span>
              )}
            </div>
          </div>
          {transcriptQuery ? (
            <>
              <button
                type="button"
                onClick={() => onJumpMatch(-1)}
                aria-label="Previous match"
                className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onJumpMatch(1)}
                aria-label="Next match"
                className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onTranscriptQueryChange("")}
                aria-label="Clear search"
                className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="scroll-y flex-1 pb-24"
        aria-label="Transcript"
      >
        {hasSegments ? (
          <div className="space-y-0.5">
            {grouped.map(({ turn, segments: bucket }) => (
              <div key={turn.id}>
                <TurnHeader turn={turn} />
                <div className="space-y-0">
                  {bucket.map((segment) => (
                    <div key={segment.id} data-segment-id={segment.id}>
                      <SegmentRow
                        segment={segment}
                        isFocused={focusedSegmentId === segment.id}
                        isPlaying={playbackSegmentId === segment.id}
                        isMatched={matchedSegmentIds.has(segment.id)}
                        marks={marksBySegment.get(segment.id) ?? []}
                        transcriptQuery={transcriptQuery}
                        onSelect={(autoplay) => onSelectSegment(segment.id, autoplay)}
                        onUpdate={onUpdateSegmentText}
                        canEdit={canEdit}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : partial ? (
          <div className="mx-auto max-w-2xl px-2 py-8 text-[15px] leading-7 text-muted-foreground">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3 animate-pulse-record" />
              Listening on this device
            </div>
            {partial}
          </div>
        ) : (
          <TranscriptEmptyState project={project} />
        )}
      </div>
    </div>
  );
}

function TranscriptEmptyState({ project }: { project: TranscriptProject }) {
  const isWorking =
    project.status === "preparing" ||
    project.status === "loading-model" ||
    project.status === "transcribing" ||
    project.status === "queued";

  return (
    <div className="flex h-full items-center justify-center px-6 py-16">
      <div className="max-w-sm text-center">
        {isWorking ? (
          <>
            <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-4 w-4 text-primary animate-pulse-record" />
            </div>
            <div className="text-sm font-medium text-foreground">
              {project.stageLabel}
            </div>
            <div className="mt-1 text-[13px] leading-6 text-muted-foreground">
              {project.detail}
            </div>
            {project.progress > 0 ? (
              <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.max(4, project.progress)}%` }}
                />
              </div>
            ) : null}
          </>
        ) : project.status === "error" ? (
          <>
            <div className="text-sm font-medium text-foreground">
              Couldn&apos;t finish yet
            </div>
            <div className="mt-1 text-[13px] leading-6 text-muted-foreground">
              {project.detail}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-muted-foreground">
            No transcript yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function SelectionToolbar({
  visible,
  x,
  y,
  onCopy,
  onBookmark,
  onClose,
}: {
  visible: boolean;
  x: number;
  y: number;
  onCopy: () => void;
  onBookmark: () => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="fixed z-40 flex items-center gap-0.5 rounded-full border border-border bg-popover px-1 py-1 text-[12px] shadow-[var(--shadow-float)] animate-rise-in"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        onClick={onCopy}
        className="rounded-full px-2.5 py-1 text-foreground hover:bg-muted ring-focus"
      >
        Copy
      </button>
      <button
        type="button"
        onClick={onBookmark}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-foreground hover:bg-muted ring-focus"
      >
        <Bookmark className="h-3 w-3" />
        Bookmark
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full p-1 text-subtle hover:bg-muted ring-focus"
        aria-label="Close"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// re-exports not needed, but keep for clarity
export const TranscriptIcons = { Highlighter };
