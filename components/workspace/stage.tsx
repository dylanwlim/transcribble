"use client";

import {
  AlertTriangle,
  Copy,
  Download,
  Info,
  RotateCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

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
  onRetry: () => void;
  onRemove: () => void;
  onOpenSettings: () => void;
  setupReady: boolean;
  warmingSetup: boolean;
  online: boolean;
  onPrimeSetup: () => void | Promise<void>;
  transcriptSearchRef: React.Ref<HTMLInputElement>;
  canSearch: boolean;
  canEdit: boolean;
  canExport: boolean;
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
    onRetry,
    onRemove,
    onOpenSettings,
    setupReady,
    warmingSetup,
    online,
    onPrimeSetup,
    transcriptSearchRef,
    canSearch,
    canEdit,
    canExport,
    onBookmarkSegment,
    onSaveRange,
    onRevertSegment,
  } = props;

  const [playbackRate, setPlaybackRate] = useState(1);
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [titleFocused, setTitleFocused] = useState(false);

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
  const isHelperRoute = project.backend === "local-helper";
  const showHelperRouteBanner = isHelperRoute && !isPaused && !isError;
  const needsLocalHelper = project.step === "needs-local-helper";
  const bookmarkActive = marks.some(
    (mark) => mark.kind === "bookmark" && mark.segmentId === focusedSegmentId,
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="grid grid-cols-1 items-center gap-3 border-b border-border px-4 py-3 sm:grid-cols-[1fr_minmax(0,22rem)_1fr] sm:px-6">
        <div className="min-w-0 order-2 sm:order-1">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface/70 p-1">
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
                label="Download transcript"
                shortcut="⌘E"
                onClick={onExport}
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
            <span className="text-border-strong">·</span>
            <span className="truncate">{project.sourceName}</span>
            <span className="text-border-strong">·</span>
            <span>{getBackendLabel(project.backend)}</span>
          </div>
        </div>

        <div className="order-3 flex items-center justify-center gap-1 sm:justify-end">
          {isError ? (
            <HeaderAction
              label="Remove"
              onClick={onRemove}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              destructive
            />
          ) : null}
          <HeaderAction
            label={inspectorOpen ? "Hide details" : "Show details"}
            shortcut="⌘\\"
            onClick={onToggleInspector}
            icon={<Info className="h-3.5 w-3.5" />}
            active={inspectorOpen}
          />
        </div>
      </header>

      {!setupReady ? (
        <SetupBanner
          online={online}
          warming={warmingSetup}
          onPrime={onPrimeSetup}
        />
      ) : null}

      {showHelperRouteBanner ? (
        <div className="mx-6 mt-3 flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[12px] leading-5 text-foreground animate-rise-in">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="font-medium">
              {needsLocalHelper
                ? "Local accelerator required."
                : isReady
                  ? "Local accelerator transcript completed."
                  : "Local accelerator in progress."}
            </div>
            <div className="mt-0.5 text-muted-foreground">
              {needsLocalHelper
                ? "Long or memory-heavy recordings stay saved here, but they need the Transcribble Helper running on this machine before transcription can continue."
                : "This recording was routed to the local accelerator because the browser path was not reliable enough for a full pass."}
            </div>
          </div>
        </div>
      ) : null}

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
              className="mx-auto block max-h-36 w-full object-contain"
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
          envelope={project.transcript?.envelope}
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
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium",
        "text-subtle transition-colors duration-150 hover:bg-muted hover:text-foreground",
        "ring-focus",
        active && "bg-muted text-foreground",
        destructive && "hover:text-record hover:bg-record-soft",
      )}
    >
      {icon}
      {badge ? <span className="hidden sm:inline">{badge}</span> : null}
    </button>
  );
}

function SetupBanner({
  online,
  warming,
  onPrime,
}: {
  online: boolean;
  warming: boolean;
  onPrime: () => void | Promise<void>;
}) {
  return (
    <div className="mx-6 mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-[12px] animate-rise-in">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 leading-5">
        <span className="font-medium text-foreground">One-time setup.</span>{" "}
        <span className="text-muted-foreground">
          {online
            ? "Download the local tools once, then Transcribble stays on this device."
            : "Go online once so the browser can cache its local tools."}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void onPrime()}
        disabled={warming || !online}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[12px] font-medium",
          "hover:bg-muted disabled:opacity-50 ring-focus",
        )}
      >
        {warming ? "Getting ready…" : "Get ready"}
      </button>
    </div>
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
