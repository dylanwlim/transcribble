"use client";

import {
  AlertTriangle,
  Copy,
  Download,
  Info,
  MoreHorizontal,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/transcribble/transcript";
import { getBackendLabel } from "@/lib/transcribble/transcription-routing";
import type {
  SavedRange,
  TranscriptMark,
  TranscriptProject,
  TranscriptSegment,
  TranscriptTurn,
} from "@/lib/transcribble/types";
import { TranscriptPane } from "./transcript-pane";
import { Transport } from "./transport";
import { Waveform } from "./waveform";

interface StageProps {
  project: TranscriptProject;
  mediaUrl: string | null;
  mediaRef: React.RefObject<HTMLAudioElement | HTMLVideoElement | null>;
  mediaHandlers: {
    onLoadedMetadata: () => void;
    onTimeUpdate: () => void;
    onPlay: () => void;
    onPause: () => void;
  };
  currentTime: number;
  isPlaying: boolean;
  segments: TranscriptSegment[];
  turns: TranscriptTurn[];
  marks: TranscriptMark[];
  ranges: SavedRange[];
  focusedSegmentId: string | null;
  playbackSegmentId: string | null;
  matchedSegmentIds: Set<string>;
  transcriptQuery: string;
  onTranscriptQueryChange: (value: string) => void;
  partialTranscript: string;
  onRename: (title: string) => void;
  onSelectSegment: (id: string, autoplay?: boolean) => void;
  onUpdateSegmentText: (text: string) => void;
  onJumpMatch: (direction: -1 | 1) => void;
  onSkip: (delta: number) => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  onToggleBookmark: () => void;
  onToggleInspector: () => void;
  inspectorOpen: boolean;
  onCopy: () => void;
  copied: boolean;
  onExport: () => void;
  onDownloadTxt: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onOpenSettings: () => void;
  transcriptSearchRef: React.Ref<HTMLInputElement>;
  canSearch: boolean;
  canEdit: boolean;
  canExport: boolean;
  canSaveRanges: boolean;
  onBookmarkSegment?: (segmentId: string) => void;
  onSaveRange?: (args: { start: number; end: number; label?: string }) => void;
  onRevertSegment?: (segmentId: string) => void;
}

export function Stage(props: StageProps) {
  const {
    project,
    mediaUrl,
    mediaRef,
    mediaHandlers,
    currentTime,
    isPlaying,
    segments,
    turns,
    marks,
    ranges,
    focusedSegmentId,
    playbackSegmentId,
    matchedSegmentIds,
    transcriptQuery,
    onTranscriptQueryChange,
    partialTranscript,
    onRename,
    onSelectSegment,
    onUpdateSegmentText,
    onJumpMatch,
    onSkip,
    onPrevSegment,
    onNextSegment,
    onToggleBookmark,
    onToggleInspector,
    inspectorOpen,
    onCopy,
    copied,
    onExport,
    onDownloadTxt,
    onRetry,
    onRemove,
    onOpenSettings,
    transcriptSearchRef,
    canSearch,
    canEdit,
    canExport,
    canSaveRanges,
    onBookmarkSegment,
    onSaveRange,
    onRevertSegment,
  } = props;

  const [playbackRate, setPlaybackRate] = useState(1);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [titleFocused, setTitleFocused] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    setTitleDraft(project.title);
  }, [project.id, project.title]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = playbackRate;
    }
  }, [mediaRef, playbackRate, mediaUrl]);

  const duration =
    project.transcript?.stats.duration ?? project.duration ?? 0;

  const onPlayPause = () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      void media.play();
    } else {
      media.pause();
    }
  };

  const isError = project.status === "error";
  const isPaused = project.status === "paused";
  const isReady = project.status === "ready";
  const needsLocalHelper = project.step === "needs-local-helper";
  const bookmarkActive = marks.some(
    (mark) => mark.kind === "bookmark" && mark.segmentId === focusedSegmentId,
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="grid grid-cols-1 items-center gap-3 border-b border-border px-4 py-2 sm:h-[var(--workspace-header-height)] sm:grid-cols-[1fr_minmax(0,22rem)_1fr] sm:px-6">
        <div className="min-w-0 order-2 sm:order-1">
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface/70 p-0.5">
            {canExport ? (
              <HeaderAction
                label="Copy transcript"
                onClick={onCopy}
                icon={<Copy className="h-3.5 w-3.5" />}
                badge={copied ? "Copied" : undefined}
              />
            ) : null}
            {canExport ? (
              <HeaderAction
                label="Download .txt"
                onClick={onDownloadTxt}
                icon={<Download className="h-3.5 w-3.5" />}
              />
            ) : null}
            {isError ? (
              <HeaderAction
                label="Try again"
                onClick={onRetry}
                icon={<RotateCw className="h-3.5 w-3.5" />}
              />
            ) : null}
          </div>
        </div>

        <div className="min-w-0 text-center order-1 sm:order-2">
          <input
            aria-label="Session title"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => {
              setTitleFocused(false);
              const trimmed = titleDraft.trim();
              if (!trimmed) {
                setTitleDraft(project.title);
              } else if (trimmed !== project.title) {
                onRename(trimmed);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitleDraft(project.title);
                event.currentTarget.blur();
              }
            }}
            className={cn(
              "w-full truncate bg-transparent text-center text-[17px] font-semibold tracking-tight text-foreground outline-none",
              "rounded px-1 -mx-1 transition-colors duration-150",
              titleFocused ? "bg-muted/60" : "",
            )}
          />
          <div className="mt-0.5 flex min-w-0 items-center justify-center gap-1.5 text-[11px] text-subtle tabular">
            <span>{formatDate(project.createdAt)}</span>
            <span className="text-border-strong">·</span>
            <span>{formatDuration(duration)}</span>
            {stripExtension(project.sourceName) !== project.title ? (
              <>
                <span className="text-border-strong">·</span>
                <span className="truncate" title={project.sourceName}>
                  {project.sourceName}
                </span>
              </>
            ) : null}
            <span className="text-border-strong">·</span>
            <span>{getBackendLabel(project.backend)}</span>
          </div>
        </div>

        <div className="order-3 flex items-center justify-center gap-1 sm:justify-end">
          <div ref={moreRef} className="relative">
            <HeaderAction
              label="More"
              onClick={() => setMoreOpen((o) => !o)}
              icon={<MoreHorizontal className="h-3.5 w-3.5" />}
              active={moreOpen}
            />
            {moreOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-10 z-20 w-52 origin-top-right rounded-lg border border-border bg-popover p-1 text-sm shadow-[var(--shadow-float)] animate-rise-in"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleInspector();
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                >
                  <Info className="h-3.5 w-3.5" />
                  {inspectorOpen ? "Hide details" : "Show details"}
                  <span className="ml-auto text-[10px] text-subtle">⌘\</span>
                </button>
                {canExport ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onExport();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export as…
                    <span className="ml-auto text-[10px] text-subtle">⌘E</span>
                  </button>
                ) : null}
                {isError ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onRetry();
                      setMoreOpen(false);
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
                    onRemove();
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-record hover:bg-record-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete recording
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {isPaused ? (
        <div className="mx-6 mt-3 flex items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[12px] leading-5 text-foreground animate-rise-in">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div className="min-w-0">
              <div className="font-medium">
                {needsLocalHelper ? "Local accelerator required." : "Paused locally."}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {project.detail}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {needsLocalHelper ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-muted ring-focus"
              >
                Open settings
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-muted ring-focus"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {needsLocalHelper ? "Check again" : "Try again"}
            </button>
          </div>
        </div>
      ) : null}

      {isError ? (
        <div className="mx-6 mt-3 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[12px] leading-5 text-foreground animate-rise-in">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <div className="font-medium">Couldn&apos;t finish this one yet.</div>
            <div className="mt-0.5 text-muted-foreground">
              {project.error ?? project.detail}
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 px-6 pt-4">
        <TranscriptPane
          project={project}
          segments={segments}
          turns={turns}
          focusedSegmentId={focusedSegmentId}
          playbackSegmentId={playbackSegmentId}
          marks={marks}
          matchedSegmentIds={matchedSegmentIds}
          transcriptQuery={transcriptQuery}
          onTranscriptQueryChange={onTranscriptQueryChange}
          onSelectSegment={onSelectSegment}
          onUpdateSegmentText={onUpdateSegmentText}
          onToggleBookmark={onToggleBookmark}
          onJumpMatch={onJumpMatch}
          transcriptSearchRef={transcriptSearchRef}
          partialTranscript={partialTranscript}
          canSearch={canSearch}
          canEdit={canEdit}
          canSaveRanges={canSaveRanges}
          onBookmarkSegment={onBookmarkSegment}
          onSaveRange={onSaveRange}
          onRevertSegment={onRevertSegment}
        />
      </div>

      <div className="border-t border-border bg-background/95 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {mediaUrl && project.mediaKind === "video" ? (
          <div className="mb-3 overflow-hidden rounded-lg bg-black">
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={mediaUrl}
              onLoadedMetadata={mediaHandlers.onLoadedMetadata}
              onTimeUpdate={mediaHandlers.onTimeUpdate}
              onPlay={mediaHandlers.onPlay}
              onPause={mediaHandlers.onPause}
              className={cn(
                "mx-auto block w-full object-contain transition-[max-height] duration-300",
                isReady ? "max-h-36" : "max-h-20",
              )}
              controls={false}
            />
          </div>
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={mediaUrl ?? undefined}
            onLoadedMetadata={mediaHandlers.onLoadedMetadata}
            onTimeUpdate={mediaHandlers.onTimeUpdate}
            onPlay={mediaHandlers.onPlay}
            onPause={mediaHandlers.onPause}
            className="hidden"
          />
        )}

        <Waveform
          mediaUrl={mediaUrl}
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          segments={segments}
          marks={marks}
          ranges={ranges}
          envelope={project.transcript?.envelope ?? project.envelope}
          onSeek={(time) => {
            const media = mediaRef.current;
            if (media) {
              media.currentTime = Math.max(0, Math.min(duration, time));
            }
          }}
          onBookmarkClick={(segmentId) => onSelectSegment(segmentId, false)}
          disabled={!mediaUrl && !isReady}
        />

        <Transport
          isPlaying={isPlaying}
          disabled={!mediaUrl}
          currentTime={currentTime}
          duration={duration}
          playbackRate={playbackRate}
          onPlayPause={onPlayPause}
          onSkip={onSkip}
          onPrevSegment={onPrevSegment}
          onNextSegment={onNextSegment}
          onChangeRate={setPlaybackRate}
          onToggleBookmark={onToggleBookmark}
          bookmarkActive={bookmarkActive}
        />
      </div>
    </div>
  );
}

function HeaderAction({
  label,
  shortcut,
  onClick,
  icon,
  active,
  destructive,
  badge,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
  destructive?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
        "text-subtle transition-all duration-150 hover:bg-muted hover:text-foreground",
        "motion-safe:active:scale-[0.96] ring-focus",
        active && "bg-muted text-foreground",
        destructive && "hover:text-record hover:bg-record-soft",
      )}
    >
      {icon}
      {badge ? <span className="hidden sm:inline">{badge}</span> : null}
    </button>
  );
}

function formatDate(iso: string) {
  const then = new Date(iso);
  return then.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
