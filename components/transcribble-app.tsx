"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  Bookmark,
  Calendar,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  Highlighter,
  ListTodo,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TextCursorInput,
  Trash2,
  Video,
  Waves,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTranscribble } from "@/hooks/use-transcribble";
import { APP_NAME, MAX_FILE_SIZE_LABEL } from "@/lib/transcribble/constants";
import type { ExportFormat } from "@/lib/transcribble/export";
import { getProjectStatusCopy } from "@/lib/transcribble/status";
import { formatBytes, formatDuration } from "@/lib/transcribble/transcript";
import type {
  HighlightColor,
  LibrarySearchResult,
  SavedRange,
  TranscriptChapter,
  TranscriptMark,
  TranscriptProject,
  TranscriptSegment,
  TranscriptTurn,
} from "@/lib/transcribble/types";

const EXPORT_FORMATS: ExportFormat[] = ["txt", "md", "srt", "vtt"];
type InspectorTab = "selection" | "outline" | "insights" | "session";

export function TranscribbleApp() {
  const {
    inputRef,
    mediaRef,
    transcriptSearchRef,
    librarySearchRef,
    projects,
    projectGroups,
    selectedProject,
    transcriptSegments,
    transcriptTurns,
    partialTranscript,
    mediaUrl,
    currentTime,
    isPlaying,
    currentProjectMarks,
    currentProjectRanges,
    focusedSegment,
    focusedSegmentId,
    playbackSegmentId,
    transcriptSearchResults,
    librarySearchResults,
    libraryQuery,
    transcriptQuery,
    currentFileMeta,
    capabilityIssue,
    assetSetup,
    storageState,
    installState,
    dragActive,
    copied,
    notice,
    assetProgressItems,
    queuedProjects,
    workspaceReady,
    accept,
    openFilePicker,
    onFileInputChange,
    onDrop,
    onDragOver,
    onDragLeave,
    onCopyTranscript,
    onDownloadTranscript,
    selectProject,
    selectSegment,
    selectAdjacentSegment,
    jumpToTranscriptMatch,
    renameSelectedProject,
    seekByDelta,
    updateSelectedSegmentText,
    toggleBookmark,
    toggleHighlight,
    saveRange,
    removeSavedRange,
    primeTranscriptionModel,
    primeMediaRuntime,
    askForPersistentStorage,
    refreshStorageState,
    resetSetupState,
    promptInstall,
    retryProject,
    removeProject,
    openLibrarySearchResult,
    setLibraryQuery,
    setTranscriptQuery,
    setNotice,
    mediaHandlers,
  } = useTranscribble();

  const markMap = useMemo(() => {
    const map = new Map<string, TranscriptMark[]>();

    for (const mark of currentProjectMarks) {
      const existing = map.get(mark.segmentId) ?? [];
      existing.push(mark);
      map.set(mark.segmentId, existing);
    }

    return map;
  }, [currentProjectMarks]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("selection");
  const [titleDraft, setTitleDraft] = useState("");
  const [rangeLabelDraft, setRangeLabelDraft] = useState("");
  const [rangeNoteDraft, setRangeNoteDraft] = useState("");
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);

  const selectedProjectInsights = selectedProject?.transcript?.insights;
  const selectedProjectStats = selectedProject?.transcript?.stats;
  const selectedProjectChapters = useMemo(
    () => selectedProject?.transcript?.chapters ?? [],
    [selectedProject?.transcript?.chapters],
  );
  const rangeMap = useMemo(() => {
    const map = new Map<string, SavedRange[]>();

    for (const range of currentProjectRanges) {
      for (const segmentId of range.segmentIds) {
        const existing = map.get(segmentId) ?? [];
        existing.push(range);
        map.set(segmentId, existing);
      }
    }

    return map;
  }, [currentProjectRanges]);
  const matchedSegmentIds = useMemo(
    () => new Set(transcriptSearchResults.map((result) => result.entry.segmentId).filter(Boolean)),
    [transcriptSearchResults],
  );
  const activeChapter = useMemo(
    () =>
      selectedProjectChapters.find(
        (chapter) => currentTime >= chapter.start && currentTime <= chapter.end + 0.25,
      ) ?? selectedProjectChapters[0] ?? null,
    [currentTime, selectedProjectChapters],
  );
  const hasTranscript = Boolean(selectedProject?.transcript);
  const attachMediaRef = (node: HTMLAudioElement | HTMLVideoElement | null) => {
    mediaRef.current = node;
  };

  useEffect(() => {
    setTitleDraft(selectedProject?.title ?? "");
  }, [selectedProject?.id, selectedProject?.title]);

  useEffect(() => {
    setRangeLabelDraft("");
    setRangeNoteDraft("");
    setRangeStart(selectedProject?.transcript?.segments[0]?.start ?? null);
    setRangeEnd(selectedProject?.transcript?.segments[0]?.end ?? null);
  }, [selectedProject?.id, selectedProject?.transcript?.segments]);

  const currentProgress = useMemo(() => {
    if (!selectedProject) {
      return 0;
    }

    return selectedProject.status === "ready" ? 100 : selectedProject.progress;
  }, [selectedProject]);

  const emptyState = !selectedProject && projects.length === 0;
  const setupReady = assetSetup.modelReady && assetSetup.mediaReady;
  const effectiveOnline = workspaceReady ? assetSetup.online : true;
  const selectedProjectStatus = selectedProject ? getProjectStatusCopy(selectedProject) : null;
  const queuedCount = queuedProjects.length;
  const workingProjectCount = useMemo(
    () =>
      projectGroups.active.filter(
        (item) => item.status === "preparing" || item.status === "loading-model" || item.status === "transcribing",
      ).length,
    [projectGroups.active],
  );
  const supportedFormatsLabel = useMemo(
    () =>
      accept
        .split(",")
        .map((value) => value.replace(".", "").toUpperCase())
        .join(" · "),
    [accept],
  );
  const setupSummary = setupReady
    ? "This browser is ready for offline reuse after the first setup."
    : effectiveOnline
      ? "The first setup downloads the local tools this browser needs, then later work stays on this device."
      : "Go online once to finish the first setup for this browser.";
  const setupBreakdownLabel = `${assetSetup.modelReady ? "Transcription ready" : "Transcription setup needed"} • ${
    assetSetup.mediaReady ? "Video support ready" : "Video setup needed"
  }`;
  const storageUsageLabel = storageState?.usage && storageState.quota
    ? `${formatBytes(storageState.usage)} used of ${formatBytes(storageState.quota)}`
    : "Storage use not reported by this browser";
  const storageProtectionLabel =
    storageState?.persisted === true
      ? "Protected from browser cleanup"
      : storageState?.persisted === false
        ? "Can still be cleared by the browser"
        : "Protection not reported";
  const storageModeLabel = storageState?.opfsSupported
    ? "Large recordings can move into the browser's private file system."
    : "Recordings stay in IndexedDB in this browser.";
  const rangeBounds = useMemo(
    () =>
      rangeStart === null || rangeEnd === null
        ? null
        : { start: Math.min(rangeStart, rangeEnd), end: Math.max(rangeStart, rangeEnd) },
    [rangeEnd, rangeStart],
  );
  const rangeDraftSegments = useMemo(
    () => (rangeBounds ? transcriptSegments.filter((segment) => segment.end >= rangeBounds.start && segment.start <= rangeBounds.end) : []),
    [rangeBounds, transcriptSegments],
  );
  const canSaveRange = Boolean(selectedProject?.transcript && rangeBounds && rangeDraftSegments.length > 0);

  const primeWorkspaceSetup = async () => {
    if (!assetSetup.modelReady) {
      await primeTranscriptionModel();
    }

    if (!assetSetup.mediaReady) {
      await primeMediaRuntime();
    }
  };

  const setRangeEdgeFromPlayback = (edge: "start" | "end") => {
    const fallbackTime = edge === "start" ? focusedSegment?.start : focusedSegment?.end;
    const nextTime = mediaUrl ? currentTime : fallbackTime;

    if (typeof nextTime !== "number") {
      return;
    }

    if (edge === "start") {
      setRangeStart(nextTime);
    } else {
      setRangeEnd(nextTime);
    }
  };

  const useFocusedSegmentRange = () => {
    if (!focusedSegment) {
      return;
    }

    setRangeStart(focusedSegment.start);
    setRangeEnd(focusedSegment.end);
    if (!rangeLabelDraft.trim()) {
      setRangeLabelDraft(focusedSegment.text.slice(0, 64).trim());
    }
  };

  const onSaveRange = () => {
    if (!rangeBounds) {
      return;
    }

    saveRange({
      start: rangeBounds.start,
      end: rangeBounds.end,
      label: rangeLabelDraft,
      note: rangeNoteDraft,
    });
    setRangeLabelDraft("");
    setRangeNoteDraft("");
  };

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === selectedProject.title) {
      return;
    }

    const handle = window.setTimeout(() => {
      renameSelectedProject(trimmed);
    }, 320);

    return () => window.clearTimeout(handle);
  }, [renameSelectedProject, selectedProject, titleDraft]);

  return (
    <div className="min-h-screen bg-[#efe9dc] text-[#16171c]">
      <div
        className="relative min-h-screen"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <header className="sticky top-0 z-20 border-b border-black/10 bg-[#13151a]/95 text-white backdrop-blur">
          <div className="mx-auto max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#1f4fff] shadow-[0_12px_30px_rgba(31,79,255,0.35)]">
                  <AudioLines className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-semibold tracking-tight">{APP_NAME}</div>
                  <div className="mt-1 max-w-2xl text-sm leading-5 text-white/62">
                    Private voice workspace for turning recordings into searchable, editable knowledge on this device.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <HeaderPill icon={ShieldCheck} label="Saved on this device" tone="success" />
                <HeaderPill
                  icon={effectiveOnline ? CheckCircle2 : AlertTriangle}
                  label={setupReady ? "Browser ready" : effectiveOnline ? "Finish first setup" : "Setup needs internet"}
                  tone={setupReady ? "success" : effectiveOnline ? "default" : "warning"}
                />
                {queuedCount > 0 ? <HeaderPill label={`Queue ${queuedCount}`} tone="default" /> : null}
                {!emptyState ? (
                  <Button onClick={openFilePicker} className="bg-[#1f4fff] text-white hover:bg-[#1a43d6]">
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Add recording
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1800px] grid-cols-1 items-start gap-4 px-4 py-4 sm:gap-5 sm:px-6 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,340px)] lg:px-8 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className="order-3 self-start overflow-hidden rounded-[28px] border border-black/10 bg-[#faf7f1] shadow-[0_18px_60px_rgba(30,35,45,0.08)] lg:order-none">
            <div className="border-b border-black/10 px-5 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6e6a61]">Library</div>
                  <div className="mt-1 text-xl font-semibold tracking-tight">
                    {projects.length === 0 ? "Saved sessions" : "Sessions on this device"}
                  </div>
                </div>
                <Badge className="border border-black/10 bg-white text-[#242831]">
                  {projects.length === 0 ? "Empty" : `${projects.length} saved`}
                </Badge>
              </div>

              <div className="mt-4 relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b877e]" />
                <Input
                  ref={librarySearchRef}
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="Search titles and transcript text"
                  className="border-black/10 bg-white pl-10 text-sm"
                />
              </div>
            </div>

            <div className="px-3 py-4 lg:max-h-[calc(100svh-8rem)] lg:overflow-y-auto">
              {capabilityIssue ? (
                <Banner tone="error" body={capabilityIssue} onDismiss={() => setNotice(null)} />
              ) : null}
              {notice ? <Banner tone={notice.tone} body={notice.message} onDismiss={() => setNotice(null)} /> : null}

              {libraryQuery.trim() ? (
                <section className="space-y-3 px-2">
                  <SectionHeading icon={Search} title="Cross-project matches" />
                  {librarySearchResults.length > 0 ? (
                    librarySearchResults.map((result) => (
                      <SearchResultRow
                        key={`${result.projectId}-${result.entry.segmentId}-${result.entry.start}`}
                        result={result}
                        isActive={result.projectId === selectedProject?.id && result.entry.segmentId === focusedSegmentId}
                        onOpen={() => openLibrarySearchResult(result)}
                      />
                    ))
                  ) : (
                    <EmptyPanel
                      title="No matches yet"
                      body="Search scans saved project titles and local transcript spans."
                    />
                  )}
                </section>
              ) : (
                <div className="space-y-5">
                  <section className="space-y-3 px-2">
                    <SectionHeading icon={Waves} title="In progress" />
                    {projectGroups.active.length > 0 ? (
                      projectGroups.active.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          selected={project.id === selectedProject?.id}
                          onOpen={() => selectProject(project.id)}
                          onRetry={() => retryProject(project.id)}
                          onDelete={() => removeProject(project.id)}
                        />
                      ))
                    ) : (
                      <EmptyPanel
                        title="Nothing is working right now"
                        body="New recordings you add will line up here automatically."
                        compact
                      />
                    )}
                  </section>

                  <section className="space-y-3 px-2">
                    <SectionHeading icon={CheckCircle2} title="Ready to reopen" />
                    {projectGroups.ready.length > 0 ? (
                      projectGroups.ready.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          selected={project.id === selectedProject?.id}
                          onOpen={() => selectProject(project.id)}
                          onRetry={() => retryProject(project.id)}
                          onDelete={() => removeProject(project.id)}
                        />
                      ))
                    ) : (
                      <EmptyPanel
                        title="Your finished sessions will show up here"
                        body="Once a recording is done, you can reopen it here to search, edit, and export it."
                        compact
                      />
                    )}
                  </section>

                  {projectGroups.errored.length > 0 ? (
                    <section className="space-y-3 px-2">
                      <SectionHeading icon={AlertTriangle} title="Needs attention" />
                      {projectGroups.errored.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          selected={project.id === selectedProject?.id}
                          onOpen={() => selectProject(project.id)}
                          onRetry={() => retryProject(project.id)}
                          onDelete={() => removeProject(project.id)}
                        />
                      ))}
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </aside>

          <main className="order-1 min-w-0 space-y-5 lg:order-none">
            <WorkspaceSurface className="overflow-hidden">
              {workspaceReady ? (
                emptyState ? (
                  <div className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                      <div className="max-w-3xl">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6f6a60]">
                          Private voice workspace
                        </div>
                        <h1 className="mt-3 max-w-[10.5ch] text-[clamp(2rem,5vw,3.45rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-[#101218]">
                          Turn recordings into notes you can search, edit, and trust.
                        </h1>
                        <p className="mt-4 max-w-2xl text-pretty text-[15px] leading-7 text-[#5c5a52] sm:text-base">
                          Import audio or video, let this browser transcribe it locally, and keep the recording,
                          transcript, edits, and review notes on this device.
                        </p>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                          <Button onClick={openFilePicker} className="h-11 bg-[#1f4fff] text-white hover:bg-[#1a43d6]">
                            <FolderOpen className="mr-2 h-4 w-4" />
                            Start with a recording
                          </Button>
                          {!setupReady ? (
                            <Button
                              variant="outline"
                              className="h-11 border-black/10 bg-white"
                              onClick={() => {
                                void primeWorkspaceSetup();
                              }}
                              disabled={
                                assetSetup.warmingModel ||
                                assetSetup.warmingMedia ||
                                queuedCount > 0 ||
                                !effectiveOnline
                              }
                            >
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              {assetSetup.warmingModel || assetSetup.warmingMedia ? "Getting ready…" : "Get this browser ready"}
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                          <FeatureCue
                            icon={Search}
                            title="Search later"
                            body="Titles, transcript hits, and saved review ranges stay easy to reopen."
                          />
                          <FeatureCue
                            icon={Bookmark}
                            title="Keep proof attached"
                            body="Edits, highlights, moments, and outputs stay tied to time ranges in the recording."
                          />
                          <FeatureCue
                            icon={Download}
                            title="Export cleanly"
                            body="Share plain text, markdown, and captions from the same saved session."
                          />
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-black/10 bg-[#f4ede0] p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                          Before you start
                        </div>
                        <div className="mt-2 text-xl font-semibold tracking-tight text-[#171a20]">
                          {setupReady ? "This browser is ready" : "One quick browser setup"}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#5c5a52]">{setupSummary}</p>

                        <div className="mt-4 grid gap-3">
                          <TrustRow
                            title="Local setup"
                            body={setupBreakdownLabel}
                            tone={setupReady ? "success" : "default"}
                          />
                          <TrustRow
                            title="Storage protection"
                            body={storageProtectionLabel}
                            tone={storageState?.persisted ? "success" : "default"}
                          />
                          <TrustRow title="Storage use" body={storageUsageLabel} />
                          <TrustRow title="Large-file storage" body={storageModeLabel} />
                        </div>

                        <div className="mt-4 rounded-[22px] border border-dashed border-[#d8d0c2] bg-[#faf7f1] px-4 py-4">
                          <div className="font-medium text-[#171a20]">Drop audio or video anywhere in the workspace</div>
                          <div className="mt-1 text-sm leading-6 text-[#5c5a52]">
                            {supportedFormatsLabel} up to {MAX_FILE_SIZE_LABEL} each. Multiple files line up
                            automatically and stay on this device.
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {storageState?.canRequestPersistence ? (
                            <Button variant="outline" className="bg-white" onClick={() => void askForPersistentStorage()}>
                              Protect storage
                            </Button>
                          ) : null}
                          <Button variant="outline" className="bg-white" onClick={() => void refreshStorageState()}>
                            Refresh browser status
                          </Button>
                          {installState.installPromptAvailable ? (
                            <Button variant="outline" className="bg-white" onClick={() => void promptInstall()}>
                              Install app
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-4 text-sm leading-6 text-[#5c5a52]">
                          Internet is still needed the first time this browser downloads the local transcription tools.
                          After that, normal work stays local here.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
                    <div className="min-w-0 space-y-5 border-b border-black/10 px-5 py-5 2xl:border-b-0 2xl:border-r">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6d6a61]">
                            Current session
                          </div>
                          <Input
                            value={titleDraft}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={() => setTitleDraft((current) => current.trim() || selectedProject?.title || "")}
                            className="mt-2 h-auto border-0 bg-transparent px-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
                            placeholder="Project title"
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#5c5a52]">
                            <span>{selectedProject?.sourceName}</span>
                            <span className="text-[#bab4aa]">•</span>
                            <span>{currentFileMeta.fileSizeLabel}</span>
                            <span className="text-[#bab4aa]">•</span>
                            <span>{currentFileMeta.durationLabel}</span>
                            <span className="text-[#bab4aa]">•</span>
                            <span>{currentFileMeta.runtimeLabel}</span>
                          </div>
                          <div className="mt-3 max-w-2xl text-sm leading-6 text-[#5c5a52]">
                            {selectedProjectStatus?.summary}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={selectedProject?.status ?? "queued"} step={selectedProjectStatus?.step} />
                          <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                            {selectedProjectStats
                              ? `${selectedProjectStats.wordCount} words`
                              : "Transcript on the way"}
                          </Badge>
                          <Button variant="outline" className="bg-transparent" onClick={onCopyTranscript} disabled={!hasTranscript}>
                            <Copy className="mr-2 h-4 w-4" />
                            {copied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-black/10 bg-[#f3ede2] p-4">
                        <div className="flex flex-col gap-5">
                          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                                Working now
                              </div>
                              <div className="mt-1 text-2xl font-semibold tracking-tight text-[#171a20]">
                                {selectedProjectStatus?.headline ?? "Waiting to start"}
                              </div>
                              <div className="mt-2 text-sm leading-6 text-[#5c5a52]">
                                {selectedProjectStatus?.summary}
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-3">
                                <Button
                                  type="button"
                                  size="icon"
                                  className="h-12 w-12 rounded-full bg-[#16181d] text-white hover:bg-[#0f1115]"
                                  onClick={() => {
                                    if (!mediaRef.current) {
                                      return;
                                    }

                                    if (mediaRef.current.paused) {
                                      void mediaRef.current.play();
                                    } else {
                                      mediaRef.current.pause();
                                    }
                                  }}
                                  disabled={!mediaUrl}
                                >
                                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="bg-white/70"
                                  onClick={() => seekByDelta(-5)}
                                  disabled={!mediaUrl}
                                >
                                  -5s
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="bg-white/70"
                                  onClick={() => seekByDelta(5)}
                                  disabled={!mediaUrl}
                                >
                                  +5s
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="bg-white/70"
                                  onClick={() => selectAdjacentSegment(-1)}
                                  disabled={!hasTranscript}
                                >
                                  Previous segment
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="bg-white/70"
                                  onClick={() => selectAdjacentSegment(1)}
                                  disabled={!hasTranscript}
                                >
                                  Next segment
                                </Button>
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#5c5a52]">
                                <span className="font-medium text-[#171a20]">Playback</span>
                                <span>{formatDuration(currentTime)} / {currentFileMeta.durationLabel}</span>
                                {activeChapter ? (
                                  <>
                                    <span className="text-[#bab4aa]">•</span>
                                    <span>Now in: {activeChapter.title}</span>
                                  </>
                                ) : null}
                              </div>

                              <div className="mt-4">
                                <Progress value={currentProgress} className="h-2 bg-black/10 [&>div]:bg-[#1f4fff]" />
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-[#5c5a52]">
                                  <span>{selectedProjectStatus?.headline}</span>
                                  <span>{currentProgress.toFixed(0)}%</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {EXPORT_FORMATS.map((format) => (
                                <Button
                                  key={format}
                                  variant="outline"
                                  className="bg-white/70 uppercase tracking-[0.18em] text-[#2b2d35]"
                                  onClick={() => onDownloadTranscript(format)}
                                  disabled={!hasTranscript}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  {format}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <TimelineOverview
                            duration={selectedProjectStats?.duration ?? selectedProject?.duration ?? 0}
                            currentTime={currentTime}
                            segments={transcriptSegments}
                            turns={transcriptTurns}
                            chapters={selectedProjectChapters}
                            marks={currentProjectMarks}
                            savedRanges={currentProjectRanges}
                            matchedSegmentIds={matchedSegmentIds}
                            focusedSegmentId={focusedSegmentId}
                            playbackSegmentId={playbackSegmentId}
                            onSeek={selectSegment}
                          />

                          <div className="rounded-[24px] border border-black/10 bg-white/70 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                                  Review range
                                </div>
                                <div className="mt-1 text-lg font-semibold tracking-tight text-[#171a20]">
                                  Save a named moment from the timeline
                                </div>
                                <div className="mt-1 text-sm leading-6 text-[#5c5a52]">
                                  Pick a start and end time, give it a short name, and keep it searchable with the
                                  transcript.
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" className="bg-white" onClick={() => setRangeStart(null)}>
                                  Clear start
                                </Button>
                                <Button variant="outline" className="bg-white" onClick={() => setRangeEnd(null)}>
                                  Clear end
                                </Button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))_auto]">
                              <div className="rounded-2xl border border-black/10 bg-[#f8f4eb] px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
                                  Start
                                </div>
                                <div className="mt-2 text-lg font-semibold text-[#171a20]">
                                  {rangeStart === null ? "Not set" : formatDuration(rangeStart)}
                                </div>
                                <div className="mt-3">
                                  <Button variant="outline" className="w-full bg-white" onClick={() => setRangeEdgeFromPlayback("start")}>
                                    Set start here
                                  </Button>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-black/10 bg-[#f8f4eb] px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
                                  End
                                </div>
                                <div className="mt-2 text-lg font-semibold text-[#171a20]">
                                  {rangeEnd === null ? "Not set" : formatDuration(rangeEnd)}
                                </div>
                                <div className="mt-3">
                                  <Button variant="outline" className="w-full bg-white" onClick={() => setRangeEdgeFromPlayback("end")}>
                                    Set end here
                                  </Button>
                                </div>
                              </div>
                              <div className="rounded-2xl border border-black/10 bg-[#f8f4eb] px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
                                  Shortcut
                                </div>
                                <div className="mt-2 text-sm leading-6 text-[#5c5a52]">
                                  Use the selected transcript line as a quick review range.
                                </div>
                                <div className="mt-3">
                                  <Button variant="outline" className="w-full bg-white" onClick={useFocusedSegmentRange} disabled={!focusedSegment}>
                                    Use selected line
                                  </Button>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <Input
                                value={rangeLabelDraft}
                                onChange={(event) => setRangeLabelDraft(event.target.value)}
                                placeholder="Name this saved moment"
                                className="border-black/10 bg-white"
                              />
                              <Input
                                value={rangeNoteDraft}
                                onChange={(event) => setRangeNoteDraft(event.target.value)}
                                placeholder="Add a short note (optional)"
                                className="border-black/10 bg-white"
                              />
                              <Button className="bg-[#16181d] text-white hover:bg-[#0f1115]" onClick={onSaveRange} disabled={!canSaveRange}>
                                Save moment
                              </Button>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#5c5a52]">
                              <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                                {rangeBounds ? `${formatDuration(rangeBounds.start)}-${formatDuration(rangeBounds.end)}` : "Choose a range"}
                              </Badge>
                              <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                                {rangeDraftSegments.length} linked segment{rangeDraftSegments.length === 1 ? "" : "s"}
                              </Badge>
                              {rangeBounds ? (
                                <span>{Math.max(rangeBounds.end - rangeBounds.start, 0).toFixed(1)} seconds</span>
                              ) : null}
                            </div>
                          </div>

                          {assetProgressItems.length > 0 ? (
                            <div className="space-y-2 border-t border-black/10 pt-4">
                              {assetProgressItems.map((item) => (
                                <div key={item.file} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[#6e6a61]">
                                    <span className="truncate pr-4">{item.file.split("/").at(-1) ?? item.file}</span>
                                    <span>{item.progress.toFixed(0)}%</span>
                                  </div>
                                  <Progress value={item.progress} className="h-1.5 bg-black/10 [&>div]:bg-[#16181d]" />
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="overflow-hidden rounded-[20px] border border-black/10 bg-black/5">
                          {mediaUrl ? (
                            selectedProject?.mediaKind === "video" ? (
                              <video
                                ref={attachMediaRef}
                                src={mediaUrl}
                                controls
                                className="aspect-video w-full bg-black"
                                onLoadedMetadata={mediaHandlers.onLoadedMetadata}
                                onTimeUpdate={mediaHandlers.onTimeUpdate}
                                onPlay={mediaHandlers.onPlay}
                                onPause={mediaHandlers.onPause}
                              />
                            ) : (
                              <div className="p-5">
                                <audio
                                  ref={attachMediaRef}
                                  src={mediaUrl}
                                  controls
                                  className="w-full"
                                  onLoadedMetadata={mediaHandlers.onLoadedMetadata}
                                  onTimeUpdate={mediaHandlers.onTimeUpdate}
                                  onPlay={mediaHandlers.onPlay}
                                  onPause={mediaHandlers.onPause}
                                />
                              </div>
                            )
                          ) : (
                            <div className="flex min-h-[180px] items-center justify-center px-6 py-10 text-center text-[#5c5a52]">
                              The source media is stored locally and will appear here when the project is selected.
                            </div>
                          )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-black/10 bg-[#fcfbf7]">
                        <div className="border-b border-black/10 px-5 py-4">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6d6a61]">
                                Transcript
                              </div>
                              <div className="mt-1 text-lg font-semibold tracking-tight">
                                Review and search the recording
                              </div>
                            </div>

                            <div className="relative w-full max-w-md">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b877e]" />
                              <Input
                                ref={transcriptSearchRef}
                                value={transcriptQuery}
                                onChange={(event) => setTranscriptQuery(event.target.value)}
                                placeholder="Search inside this transcript"
                                className="border-black/10 bg-white pl-10 text-sm"
                              />
                            </div>

                            {transcriptQuery.trim() ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="bg-white"
                                  onClick={() => jumpToTranscriptMatch(-1)}
                                  disabled={transcriptSearchResults.length === 0}
                                >
                                  Previous match
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="bg-white"
                                  onClick={() => jumpToTranscriptMatch(1)}
                                  disabled={transcriptSearchResults.length === 0}
                                >
                                  Next match
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#5c5a52]">
                            <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                              {hasTranscript ? `${transcriptSegments.length} segments` : "Transcript on the way"}
                            </Badge>
                            {selectedProjectStats ? (
                              <>
                                <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                                  {selectedProjectStats.turnCount} turns
                                </Badge>
                                <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                                  {selectedProjectStats.reviewCount} review cues
                                </Badge>
                                <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                                  {currentProjectRanges.length} saved range{currentProjectRanges.length === 1 ? "" : "s"}
                                </Badge>
                              </>
                            ) : null}
                            {transcriptQuery.trim() ? (
                              <span>{transcriptSearchResults.length} match{transcriptSearchResults.length === 1 ? "" : "es"}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="max-h-[calc(100vh-24rem)] overflow-y-auto px-4 py-4">
                          {hasTranscript ? (
                            <div className="space-y-3">
                              {transcriptSearchResults.length > 0 && transcriptQuery.trim() ? (
                                <div className="mb-4 space-y-2 rounded-2xl border border-[#d6d0c3] bg-[#f6f1e7] p-3">
                                  {transcriptSearchResults.slice(0, 6).map((result) => (
                                    <button
                                      key={`${result.entry.segmentId}-${result.entry.start}`}
                                      type="button"
                                      onClick={() => selectSegment(result.entry.segmentId)}
                                      className="flex w-full items-start justify-between gap-3 rounded-2xl border border-black/5 bg-white px-3 py-3 text-left transition hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
                                    >
                                      <div>
                                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6d6a61]">
                                          Match
                                        </div>
                                        <div className="mt-1 text-sm text-[#232730]">
                                          {highlightMatch(result.entry.text, transcriptQuery)}
                                        </div>
                                      </div>
                                      <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                                        {formatDuration(result.entry.start)}
                                      </Badge>
                                    </button>
                                  ))}
                                </div>
                              ) : null}

                              {transcriptSegments.map((segment) => (
                                <TranscriptRow
                                  key={segment.id}
                                  segment={segment}
                                  marks={markMap.get(segment.id) ?? []}
                                  ranges={rangeMap.get(segment.id) ?? []}
                                  isFocused={segment.id === focusedSegmentId}
                                  isPlaying={segment.id === playbackSegmentId}
                                  isMatched={transcriptQuery.trim().length > 0 && matchedSegmentIds.has(segment.id)}
                                  query={transcriptQuery}
                                  onSelect={() => selectSegment(segment.id)}
                                />
                              ))}
                            </div>
                          ) : partialTranscript ? (
                            <div className="space-y-4 rounded-[22px] border border-[#d9d1c2] bg-[#f6f1e7] p-5">
                              <div className="text-sm font-medium text-[#1a1c23]">Live local transcript preview</div>
                              <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[#232730]">
                                {partialTranscript}
                              </pre>
                            </div>
                          ) : (
                            <EmptyPanel
                              title="Transcript workspace is waiting"
                              body="Choose or queue local media to populate the timeline, search index, and evidence-linked outputs."
                              icon={FileText}
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-5 2xl:max-h-[calc(100svh-8rem)] 2xl:overflow-y-auto">
                      <div className="rounded-[26px] border border-black/10 bg-[#fcfbf7] p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <InspectorTabButton
                            active={inspectorTab === "selection"}
                            onClick={() => setInspectorTab("selection")}
                            label="Selection"
                          />
                          <InspectorTabButton
                            active={inspectorTab === "outline"}
                            onClick={() => setInspectorTab("outline")}
                            label="Outline"
                          />
                          <InspectorTabButton
                            active={inspectorTab === "insights"}
                            onClick={() => setInspectorTab("insights")}
                            label="Insights"
                          />
                          <InspectorTabButton
                            active={inspectorTab === "session"}
                            onClick={() => setInspectorTab("session")}
                            label="Session"
                          />
                        </div>
                      </div>

                      <div className="mt-5 space-y-5">
                        {inspectorTab === "selection" ? (
                          <WorkspaceSection
                            eyebrow="Selection"
                            title={focusedSegment ? "Review the selected line" : "No line selected"}
                            description="Edits save automatically and stay tied to the original timing."
                          >
                            {focusedSegment ? (
                              <div className="space-y-5">
                                <SegmentEditor
                                  key={focusedSegment.id}
                                  segment={focusedSegment}
                                  marks={markMap.get(focusedSegment.id) ?? []}
                                  ranges={rangeMap.get(focusedSegment.id) ?? []}
                                  onSave={updateSelectedSegmentText}
                                  onBookmark={toggleBookmark}
                                  onHighlight={toggleHighlight}
                                  onOpenRange={(range) => {
                                    selectSegment(range.segmentIds[0] ?? focusedSegment.id);
                                  }}
                                />
                              </div>
                            ) : (
                              <EmptyPanel
                                title="Pick a line from the timeline"
                                body="Selecting a line lets you edit it, bookmark it, or build a saved review range from it."
                                icon={TextCursorInput}
                              />
                            )}
                          </WorkspaceSection>
                        ) : null}

                        {inspectorTab === "outline" ? (
                          <WorkspaceSection
                            eyebrow="Outline"
                            title="Chapters, turns, and saved review ranges"
                            description="Use these saved moments to jump back to the parts that matter most."
                          >
                            <TurnMap
                              turns={transcriptTurns}
                              focusedSegmentId={focusedSegmentId}
                              onOpenTurn={(turn) => selectSegment(turn.segmentIds[0] ?? "")}
                            />

                            <div className="mt-5 space-y-3">
                              <SectionHeading icon={Waves} title="Chapters" />
                              {selectedProjectChapters.length > 0 ? (
                                selectedProjectChapters.map((chapter) => (
                                  <button
                                    key={chapter.id}
                                    type="button"
                                    onClick={() => selectSegment(chapter.segmentIds[0] ?? "")}
                                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-medium text-[#171a20]">{chapter.title}</div>
                                      <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
                                        {formatDuration(chapter.start)}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 text-sm text-[#5c5a52]">{chapter.summary}</div>
                                  </button>
                                ))
                              ) : (
                                <EmptyPanel
                                  title="No outline yet"
                                  body="Chapters appear automatically once the transcript is ready."
                                />
                              )}
                            </div>

                            <div className="mt-5 space-y-3">
                              <SectionHeading icon={Bookmark} title="Saved review ranges" />
                              {currentProjectRanges.length > 0 ? (
                                currentProjectRanges.map((range) => (
                                  <button
                                    key={range.id}
                                    type="button"
                                    onClick={() => {
                                      selectSegment(range.segmentIds[0] ?? "");
                                    }}
                                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-medium text-[#171a20]">{range.label}</div>
                                      <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
                                        {formatDuration(range.start)}-{formatDuration(range.end)}
                                      </Badge>
                                    </div>
                                    {range.note ? (
                                      <div className="mt-2 text-sm text-[#5c5a52]">{range.note}</div>
                                    ) : null}
                                    <div className="mt-3 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-[#6d6a61]">
                                      <span>{range.segmentIds.length} linked segment{range.segmentIds.length === 1 ? "" : "s"}</span>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          removeSavedRange(range.id);
                                        }}
                                        className="rounded-full px-2 py-1 text-[#6d6a61] transition hover:bg-black/5 hover:text-[#171a20]"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <EmptyPanel
                                  title="No saved review ranges yet"
                                  body="Use the review range controls above the timeline to save the important parts."
                                />
                              )}
                            </div>

                            <div className="mt-5 space-y-3">
                              <SectionHeading icon={Bookmark} title="Quick marks" />
                              {currentProjectMarks.length > 0 ? (
                                currentProjectMarks.map((mark) => (
                                  <button
                                    key={mark.id}
                                    type="button"
                                    onClick={() => selectSegment(mark.segmentId)}
                                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="font-medium text-[#171a20]">{mark.label}</div>
                                      <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
                                        {mark.kind}
                                      </Badge>
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <EmptyPanel
                                  title="No quick marks yet"
                                  body="Bookmarks and highlights are the fastest way to flag single lines while you review."
                                />
                              )}
                            </div>
                          </WorkspaceSection>
                        ) : null}

                        {inspectorTab === "insights" ? (
                          <WorkspaceSection
                            eyebrow="Intelligence"
                            title="Grounded local outputs"
                            description="Every list below links back to a transcript span or timestamp."
                          >
                            <InsightList
                              icon={Sparkles}
                              title="Summary"
                              items={
                                selectedProjectInsights?.summary.map((item) => ({
                                  id: item.id,
                                  label: item.text,
                                  meta: formatDuration(item.reference.start),
                                  onOpen: () => selectSegment(item.reference.segmentId),
                                })) ?? []
                              }
                            />
                            <InsightList
                              icon={ListTodo}
                              title="Action items"
                              items={
                                selectedProjectInsights?.actions.map((item) => ({
                                  id: item.id,
                                  label: item.text,
                                  meta: item.dueLabel
                                    ? `${item.dueLabel} · ${formatDuration(item.reference.start)}`
                                    : formatDuration(item.reference.start),
                                  onOpen: () => selectSegment(item.reference.segmentId),
                                })) ?? []
                              }
                            />
                            <InsightList
                              icon={MessageSquareText}
                              title="Questions"
                              items={
                                selectedProjectInsights?.questions.map((item) => ({
                                  id: item.id,
                                  label: item.text,
                                  meta: formatDuration(item.reference.start),
                                  onOpen: () => selectSegment(item.reference.segmentId),
                                })) ?? []
                              }
                            />
                            <InsightList
                              icon={Calendar}
                              title="Dates and deadlines"
                              items={
                                selectedProjectInsights?.dates.map((item) => ({
                                  id: item.id,
                                  label: item.label,
                                  meta: item.normalizedDate
                                    ? `${item.normalizedDate} · ${formatDuration(item.reference.start)}`
                                    : formatDuration(item.reference.start),
                                  onOpen: () => selectSegment(item.reference.segmentId),
                                })) ?? []
                              }
                            />
                            <InsightList
                              icon={FileAudio}
                              title="Key moments"
                              items={
                                selectedProjectInsights?.keyMoments.map((item) => ({
                                  id: item.id,
                                  label: item.title,
                                  meta: `${item.reason} · ${formatDuration(item.reference.start)}`,
                                  onOpen: () => selectSegment(item.reference.segmentId),
                                })) ?? []
                              }
                            />
                            <InsightTagSection
                              title="Entities"
                              tags={selectedProjectInsights?.entities.map((item) => ({
                                id: item.id,
                                label: `${item.label} · ${item.kind}`,
                                onOpen: () => selectSegment(item.references[0]?.segmentId ?? ""),
                              })) ?? []}
                            />
                            <InsightTagSection
                              title="Glossary"
                              tags={selectedProjectInsights?.glossary.map((item) => ({
                                id: item.id,
                                label: `${item.term} · ${item.count}x`,
                                onOpen: () => selectSegment(item.references[0]?.segmentId ?? ""),
                              })) ?? []}
                            />
                            <InsightList
                              icon={AlertTriangle}
                              title="Review cues"
                              items={
                                selectedProjectInsights?.reviewCues.map((item) => ({
                                  id: item.id,
                                  label: item.reason,
                                  meta: `${item.severity} · ${formatDuration(item.reference.start)}`,
                                  onOpen: () => selectSegment(item.reference.segmentId),
                                })) ?? []
                              }
                            />
                          </WorkspaceSection>
                        ) : null}

                        {inspectorTab === "session" ? (
                          <WorkspaceSection
                            eyebrow="Session"
                            title="This recording and browser"
                            description="Use this panel to check local storage, first-run setup, and what this browser can do."
                          >
                            <StatsGrid
                              stats={[
                                ["File", currentFileMeta.fileMeta],
                                ["Duration", currentFileMeta.durationLabel],
                                ["Runtime", currentFileMeta.runtimeLabel],
                                ["Model", currentFileMeta.modelLabel],
                                ["Words", selectedProjectStats ? String(selectedProjectStats.wordCount) : "Pending"],
                                ["Bookmarks", selectedProjectStats ? String(selectedProjectStats.bookmarkCount) : "0"],
                                ["Highlights", selectedProjectStats ? String(selectedProjectStats.highlightCount) : "0"],
                                ["Saved ranges", String(currentProjectRanges.length)],
                              ]}
                            />

                            <div className="mt-5 rounded-2xl border border-black/10 bg-[#f6f1e7] p-4 text-sm text-[#5c5a52]">
                              <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1f4fff]" />
                                <div>
                                  Media, transcripts, edits, saved ranges, and search stay local in browser storage.
                                  No paid API is required for the core workflow.
                                </div>
                              </div>
                            </div>

                            <SetupChecklist
                              assetSetup={assetSetup}
                              storageState={storageState}
                              installState={installState}
                              onPrimeModel={primeTranscriptionModel}
                              onPrimeMedia={primeMediaRuntime}
                              onProtectStorage={() => void askForPersistentStorage()}
                              onRefreshStorage={() => void refreshStorageState()}
                              onResetSetup={resetSetupState}
                              onPromptInstall={() => void promptInstall()}
                            />

                            <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
                              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                                Keyboard
                              </div>
                              <div className="mt-3 space-y-2 text-sm text-[#252932]">
                                <Shortcut hint="Search transcript" keys={["/"]} />
                                <Shortcut hint="Search library" keys={["Cmd/Ctrl", "K"]} />
                                <Shortcut hint="Play or pause" keys={["Space"]} />
                                <Shortcut hint="Bookmark selection" keys={["B"]} />
                                <Shortcut hint="Next or previous segment" keys={["J", "K"]} />
                              </div>
                            </div>
                          </WorkspaceSection>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex min-h-[60vh] items-center justify-center">
                  <div className="text-sm text-[#5c5a52]">Loading local workspace…</div>
                </div>
              )}
            </WorkspaceSurface>
          </main>

          <aside className="order-2 self-start space-y-4 lg:order-none lg:space-y-5">
            <WorkspaceSurface className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                    This browser
                  </div>
                  <div className="mt-1 text-lg font-semibold tracking-tight">
                    {setupReady ? "Ready for local work" : "Needs first setup"}
                  </div>
                </div>
                <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                  {effectiveOnline ? "Online" : "Offline"}
                </Badge>
              </div>

              <div className="mt-4 space-y-3">
                <ActionNote
                  icon={ShieldCheck}
                  title="Saved on this device"
                  body="Recordings, transcripts, edits, highlights, and search all stay in this browser."
                  meta={storageProtectionLabel}
                  action={
                    storageState?.canRequestPersistence ? (
                      <Button size="sm" variant="outline" className="border-black/10 bg-white" onClick={() => void askForPersistentStorage()}>
                        Protect storage
                      </Button>
                    ) : null
                  }
                />
                <ActionNote
                  icon={Cpu}
                  title={setupReady ? "Local transcription is ready" : "Finish the one-time setup"}
                  body={setupSummary}
                  meta={setupBreakdownLabel}
                  action={
                    !setupReady ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-black/10 bg-white"
                        onClick={() => {
                          void primeWorkspaceSetup();
                        }}
                        disabled={
                          assetSetup.warmingModel ||
                          assetSetup.warmingMedia ||
                          queuedCount > 0 ||
                          !effectiveOnline
                        }
                      >
                        {assetSetup.warmingModel || assetSetup.warmingMedia ? "Getting ready…" : "Get ready"}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="border-black/10 bg-white" onClick={resetSetupState}>
                        Reset setup status
                      </Button>
                    )
                  }
                />
                <ActionNote
                  icon={Download}
                  title={installState.installed ? "App mode is active" : "Install Transcribble"}
                  body={
                    installState.installed
                      ? "This browser reports that Transcribble is already installed."
                      : installState.installPromptAvailable
                        ? "Install Transcribble for a cleaner app-like launch after you've visited it once."
                        : installState.shellReady
                          ? "The app shell is cached, but this browser is not offering an install prompt right now."
                          : "App install support is still loading in this browser."
                  }
                  meta={storageModeLabel}
                  action={
                    installState.installPromptAvailable ? (
                      <Button size="sm" variant="outline" className="border-black/10 bg-white" onClick={() => void promptInstall()}>
                        Install
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="border-black/10 bg-white" onClick={() => void refreshStorageState()}>
                        Refresh
                      </Button>
                    )
                  }
                />
                {storageState?.caveats.slice(0, 1).map((caveat) => (
                  <ActionNote key={caveat} icon={AlertTriangle} title="Browser caveat" body={caveat} />
                ))}
              </div>
            </WorkspaceSurface>

            <WorkspaceSurface className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">Snapshot</div>
                  <div className="mt-1 text-lg font-semibold tracking-tight">Queue and saved work</div>
                </div>
                <Badge className="border border-black/10 bg-white text-[#2b2d35]">
                  {projects.length} session{projects.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="mt-3 text-sm leading-6 text-[#5c5a52]">
                {emptyState
                  ? "Start with a recording and Transcribble will build your saved library from there."
                  : selectedProject
                    ? `${selectedProjectStatus?.headline}. ${selectedProjectStatus?.summary}`
                    : "Pick a saved session to reopen it."}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniStat label="Queued" value={String(queuedCount)} />
                <MiniStat label="Working" value={String(workingProjectCount)} />
                <MiniStat label="Ready" value={String(projectGroups.ready.length)} />
                <MiniStat label="Errored" value={String(projectGroups.errored.length)} />
              </div>

              {selectedProject ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {currentProjectRanges.length} saved range{currentProjectRanges.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {currentProjectMarks.length} quick mark{currentProjectMarks.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
                    {hasTranscript ? `${transcriptSegments.length} segments` : "Transcript on the way"}
                  </span>
                </div>
              ) : null}
            </WorkspaceSurface>
          </aside>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={onFileInputChange}
        />

        {dragActive ? (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-[#10131f]/55 p-6 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[32px] border border-white/20 bg-white/10 px-8 py-10 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15">
                <FolderOpen className="h-7 w-7" />
              </div>
              <div className="mt-5 text-sm font-semibold uppercase tracking-[0.28em] text-white/70">
                Drop local media
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">Queue audio or video into the workspace</div>
              <div className="mt-3 text-sm leading-6 text-white/75">
                {supportedFormatsLabel} up to {MAX_FILE_SIZE_LABEL} each. Files stay local and saved sessions become
                searchable after transcription.
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">Multi-file queue</span>
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">On-device core flow</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[30px] border border-black/10 bg-[#faf7f1] shadow-[0_18px_60px_rgba(30,35,45,0.08)] ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

function HeaderPill({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon?: typeof Search;
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-[#2f5f38] bg-[#173321] text-[#bdf7c5]"
      : tone === "warning"
        ? "border-[#6b4a1c] bg-[#332515] text-[#f6d49a]"
        : "border-white/10 bg-white/5 text-white/75";

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${toneClass}`}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{label}</span>
    </div>
  );
}

function FeatureCue({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Search;
  title: string;
  body: string;
}) {
  return (
    <div className="h-full rounded-[22px] border border-black/10 bg-[#fcfbf7] px-4 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#1f4fff]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 font-medium text-[#171a20]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[#5c5a52]">{body}</div>
    </div>
  );
}

function ActionNote({
  icon: Icon,
  title,
  body,
  meta,
  action,
}: {
  icon: typeof Search;
  title: string;
  body: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-black/10 bg-[#fcfbf7] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#1f4fff]">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-[#171a20]">{title}</div>
            <div className="mt-1 text-sm leading-6 text-[#5c5a52]">{body}</div>
            {meta ? (
              <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">{meta}</div>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function TrustRow({
  title,
  body,
  tone = "default",
}: {
  title: string;
  body: string;
  tone?: "default" | "success";
}) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3 ${
        tone === "success" ? "border-[#b2dbbd] bg-[#ecfff1]" : "border-black/10 bg-white"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[#232730]">{body}</div>
    </div>
  );
}

function InspectorTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
        active
          ? "bg-[#16181d] text-white shadow-[0_10px_30px_rgba(22,24,29,0.18)]"
          : "bg-white text-[#232730] hover:bg-[#eef2ff]"
      }`}
    >
      {label}
    </button>
  );
}

function TimelineOverview({
  duration,
  currentTime,
  segments,
  turns,
  chapters,
  marks,
  savedRanges,
  matchedSegmentIds,
  focusedSegmentId,
  playbackSegmentId,
  onSeek,
}: {
  duration: number;
  currentTime: number;
  segments: TranscriptSegment[];
  turns: TranscriptTurn[];
  chapters: TranscriptChapter[];
  marks: TranscriptMark[];
  savedRanges: SavedRange[];
  matchedSegmentIds: Set<string>;
  focusedSegmentId: string | null;
  playbackSegmentId: string | null;
  onSeek: (segmentId: string) => void;
}) {
  const safeDuration = Math.max(duration, segments.at(-1)?.end ?? 0, 0);
  const currentRatio = safeDuration > 0 ? Math.min(Math.max(currentTime / safeDuration, 0), 1) : 0;
  const focusedSegment = segments.find((segment) => segment.id === focusedSegmentId) ?? null;
  const playbackSegment = segments.find((segment) => segment.id === playbackSegmentId) ?? null;

  const seekForRatio = (ratio: number) => {
    const clampedRatio = Math.min(Math.max(ratio, 0), 1);
    const targetTime = safeDuration * clampedRatio;
    const targetSegment =
      segments.find((segment) => targetTime >= segment.start && targetTime <= segment.end + 0.25) ??
      segments.find((segment) => segment.start >= targetTime) ??
      segments.at(-1);

    if (targetSegment) {
      onSeek(targetSegment.id);
    }
  };

  if (!safeDuration || segments.length === 0) {
    return (
      <div className="rounded-[24px] border border-black/10 bg-white/60 px-4 py-4 text-sm text-[#5c5a52]">
        The session map appears once timestamped segments are available.
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-[#10131a] bg-[#12151d] px-4 py-4 text-white shadow-[0_18px_50px_rgba(18,21,29,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Session Map</div>
          <div className="mt-1 text-base font-semibold tracking-tight">
            Playback, chapters, turns, searches, and saved ranges in one strip
          </div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-white/45">
          {chapters.length} chapters • {turns.length} turns
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          seekForRatio(ratio);
        }}
        className="relative mt-4 block h-24 w-full overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-left"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            className={`absolute inset-y-3 rounded-2xl ${
              index % 2 === 0 ? "bg-[#2f394c]/60" : "bg-[#212835]/65"
            }`}
            style={{
              left: `${(chapter.start / safeDuration) * 100}%`,
              width: `${Math.max(((chapter.end - chapter.start) / safeDuration) * 100, 3)}%`,
            }}
          />
        ))}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className="absolute bottom-0 top-0 w-px bg-white/14"
            style={{ left: `${(turn.start / safeDuration) * 100}%` }}
          />
        ))}
        {savedRanges.map((range) => (
          <div
            key={range.id}
            className="absolute bottom-3 top-3 rounded-2xl border border-[#ffd67b]/35 bg-[#f4c95d]/16"
            style={{
              left: `${(range.start / safeDuration) * 100}%`,
              width: `${Math.max(((range.end - range.start) / safeDuration) * 100, 1.2)}%`,
            }}
          />
        ))}
        {segments
          .filter((segment) => matchedSegmentIds.has(segment.id))
          .map((segment) => (
            <div
              key={`match-${segment.id}`}
              className="absolute top-1 h-2 w-1 rounded-full bg-[#f8d66d]"
              style={{ left: `${(segment.start / safeDuration) * 100}%` }}
            />
          ))}
        {marks.map((mark) => {
          const segment = segments.find((item) => item.id === mark.segmentId);
          if (!segment) {
            return null;
          }

          return (
            <div
              key={mark.id}
              className={`absolute bottom-1 h-2 w-2 rounded-full ${
                mark.kind === "bookmark"
                  ? "bg-[#f8d66d]"
                  : mark.color === "rose"
                    ? "bg-[#ff97b3]"
                    : mark.color === "sky"
                      ? "bg-[#86c7ff]"
                      : "bg-[#ffd670]"
              }`}
              style={{ left: `calc(${(segment.start / safeDuration) * 100}% - 4px)` }}
            />
          );
        })}
        {focusedSegment ? (
          <div
            className="absolute inset-y-4 rounded-2xl border border-[#86a4ff] bg-[#3452ad]/30"
            style={{
              left: `${(focusedSegment.start / safeDuration) * 100}%`,
              width: `${Math.max(((focusedSegment.end - focusedSegment.start) / safeDuration) * 100, 1.5)}%`,
            }}
          />
        ) : null}
        {playbackSegment ? (
          <div
            className="absolute inset-y-6 rounded-2xl bg-[#5f8bff]/55"
            style={{
              left: `${(playbackSegment.start / safeDuration) * 100}%`,
              width: `${Math.max(((playbackSegment.end - playbackSegment.start) / safeDuration) * 100, 0.75)}%`,
            }}
          />
        ) : null}
        <div
          className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
          style={{ left: `${currentRatio * 100}%` }}
        />
      </button>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/55">
        <TimelineLegend colorClass="bg-[#5f8bff]" label="playback" />
        <TimelineLegend colorClass="border border-[#86a4ff] bg-[#3452ad]/40" label="selection" />
        <TimelineLegend colorClass="border border-[#ffd67b]/50 bg-[#f4c95d]/25" label="saved ranges" />
        <TimelineLegend colorClass="bg-[#f8d66d]" label="matches and marks" />
        <TimelineLegend colorClass="bg-white/25" label="turns" />
      </div>

      {chapters.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {chapters.slice(0, 4).map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onSeek(chapter.segmentIds[0] ?? "")}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10"
            >
              <div className="text-sm font-medium text-white">{chapter.title}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/45">
                {formatDuration(chapter.start)} • {chapter.segmentIds.length} segments
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TimelineLegend({
  colorClass,
  label,
}: {
  colorClass: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`block h-2.5 w-2.5 rounded-full ${colorClass}`} />
      <span>{label}</span>
    </div>
  );
}

function TurnMap({
  turns,
  focusedSegmentId,
  onOpenTurn,
}: {
  turns: TranscriptTurn[];
  focusedSegmentId: string | null;
  onOpenTurn: (turn: TranscriptTurn) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeading icon={AudioLines} title="Conversation turns" />
      {turns.length > 0 ? (
        turns.map((turn) => (
          <button
            key={turn.id}
            type="button"
            onClick={() => onOpenTurn(turn)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
              focusedSegmentId && turn.segmentIds.includes(focusedSegmentId)
                ? "border-[#1f4fff]/35 bg-[#eef2ff]"
                : "border-black/10 bg-white hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-[#171a20]">Turn {turn.index + 1}</div>
              <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
                {formatDuration(turn.start)}-{formatDuration(turn.end)}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-[#5c5a52]">
              {turn.segmentIds.length} segments • {turn.wordCount} words
            </div>
          </button>
        ))
      ) : (
        <EmptyPanel
          title="No turn map yet"
          body="Turns appear automatically once the transcript is ready."
          icon={AudioLines}
        />
      )}
    </div>
  );
}

function SetupChecklist({
  assetSetup,
  storageState,
  installState,
  onPrimeModel,
  onPrimeMedia,
  onProtectStorage,
  onRefreshStorage,
  onResetSetup,
  onPromptInstall,
}: {
  assetSetup: {
    modelReady: boolean;
    mediaReady: boolean;
    warmingModel: boolean;
    warmingMedia: boolean;
    online: boolean;
    modelPrimedAt?: string;
    mediaPrimedAt?: string;
    lastError?: string;
  };
  storageState: {
    canRequestPersistence: boolean;
    persisted: boolean | null;
    usage?: number;
    quota?: number;
    caveats: string[];
  } | null;
  installState: {
    shellReady: boolean;
    installPromptAvailable: boolean;
    installed: boolean;
  };
  onPrimeModel: () => void;
  onPrimeMedia: () => void;
  onProtectStorage: () => void;
  onRefreshStorage: () => void;
  onResetSetup: () => void;
  onPromptInstall: () => void;
}) {
  const busy = assetSetup.warmingModel || assetSetup.warmingMedia;
  const storageUsage =
    typeof storageState?.usage === "number" && typeof storageState.quota === "number"
      ? `${formatBytes(storageState.usage)} of ${formatBytes(storageState.quota)} used`
      : "Usage details not reported";

  return (
    <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">Browser readiness</div>
          <div className="mt-1 text-base font-semibold tracking-tight text-[#171a20]">Setup, storage, and install status</div>
        </div>
        <Badge
          className={`border ${
            assetSetup.online
              ? "border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]"
              : "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]"
          }`}
        >
          {assetSetup.online ? "Online" : "Offline"}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <SetupRow
          title="Local transcription"
          description={
            assetSetup.modelReady
              ? `Ready${assetSetup.modelPrimedAt ? ` since ${new Date(assetSetup.modelPrimedAt).toLocaleString()}` : ""}.`
              : "Needed once per browser profile before offline reuse is dependable."
          }
          ready={assetSetup.modelReady}
          loading={assetSetup.warmingModel}
          disabled={busy}
          buttonLabel="Get ready"
          onClick={onPrimeModel}
        />
        <SetupRow
          title="Video and fallback media support"
          description={
            assetSetup.mediaReady
              ? `Ready${assetSetup.mediaPrimedAt ? ` since ${new Date(assetSetup.mediaPrimedAt).toLocaleString()}` : ""}.`
              : "Needed for video imports and slower media fallback paths."
          }
          ready={assetSetup.mediaReady}
          loading={assetSetup.warmingMedia}
          disabled={busy}
          buttonLabel="Get ready"
          onClick={onPrimeMedia}
        />
        <SetupRow
          title="Protected local storage"
          description={
            storageState?.persisted === true
              ? "This browser says it is less likely to clear Transcribble's saved data."
              : "Ask the browser to treat Transcribble's local storage as more durable."
          }
          ready={storageState?.persisted === true}
          loading={false}
          disabled={!storageState?.canRequestPersistence}
          buttonLabel="Protect storage"
          onClick={onProtectStorage}
        />
        <SetupRow
          title="App install"
          description={
            installState.installed
              ? "Transcribble is already installed in app mode."
              : installState.installPromptAvailable
                ? "This browser can install Transcribble after you have visited it."
                : installState.shellReady
                  ? "The app shell is cached, but this browser is not showing an install prompt."
                  : "Install support is still loading."
          }
          ready={installState.installed}
          loading={false}
          disabled={!installState.installPromptAvailable}
          buttonLabel="Install"
          onClick={onPromptInstall}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TrustRow title="Storage use" body={storageUsage} />
        <TrustRow
          title="Shell cache"
          body={installState.shellReady ? "Ready for faster return visits" : "Still loading app shell support"}
          tone={installState.shellReady ? "success" : "default"}
        />
      </div>

      {assetSetup.lastError ? (
        <div className="mt-4 rounded-2xl border border-[#f3b3b3] bg-[#fff0ef] px-4 py-3 text-sm text-[#7c2626]">
          {assetSetup.lastError}
        </div>
      ) : null}

      {storageState?.caveats.slice(0, 2).length ? (
        <div className="mt-4 space-y-2">
          {storageState.caveats.slice(0, 2).map((caveat) => (
            <div
              key={caveat}
              className="rounded-2xl border border-[#d6d0c3] bg-[#f6f1e7] px-4 py-3 text-sm text-[#5c5a52]"
            >
              {caveat}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="bg-white" onClick={onRefreshStorage}>
          Refresh browser details
        </Button>
        <Button variant="outline" className="bg-white" onClick={onResetSetup}>
          Reset setup status
        </Button>
      </div>

      <div className="mt-4 text-sm text-[#5c5a52]">
        The core workflow stays local, but a brand-new browser profile still needs one online setup before it can
        reuse the local transcription tools offline.
      </div>
    </div>
  );
}

function SetupRow({
  title,
  description,
  ready,
  loading,
  disabled,
  buttonLabel,
  onClick,
}: {
  title: string;
  description: string;
  ready: boolean;
  loading: boolean;
  disabled: boolean;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-[#fcfbf7] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 font-medium text-[#171a20]">
          <span>{title}</span>
          {ready ? <CheckCircle2 className="h-4 w-4 text-[#17643b]" /> : null}
        </div>
        <div className="mt-1 text-sm text-[#5c5a52]">{description}</div>
      </div>
      <Button variant="outline" className="bg-white" onClick={onClick} disabled={disabled || ready}>
        {loading ? "Getting ready…" : ready ? "Ready" : buttonLabel}
      </Button>
    </div>
  );
}

function Banner({
  tone,
  body,
  onDismiss,
}: {
  tone: "info" | "error";
  body: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]"
          : "border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>{body}</div>
        <button type="button" onClick={onDismiss} className="shrink-0 text-current/60 transition hover:text-current">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: typeof Search;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
      <Icon className="h-4 w-4" />
      <span>{title}</span>
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  onOpen,
  onRetry,
  onDelete,
}: {
  project: TranscriptProject;
  selected: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const status = getProjectStatusCopy(project);

  return (
    <div
      className={`rounded-[22px] border px-4 py-4 transition ${
        selected ? "border-[#1f4fff]/35 bg-[#eef2ff]" : "border-black/10 bg-white hover:border-[#1f4fff]/25 hover:bg-[#f8fbff]"
      }`}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium text-[#171a20]">{project.title}</div>
            <div className="mt-1 flex items-center gap-2 text-sm text-[#5c5a52]">
              {project.mediaKind === "video" ? <Video className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
              <span className="truncate">{project.sourceName}</span>
            </div>
          </div>
          <StatusBadge status={project.status} step={status.step} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#6d6a61]">
          <span>{status.headline}</span>
          <span>•</span>
          <span>{new Date(project.updatedAt).toLocaleString()}</span>
        </div>

        {project.status !== "ready" ? (
          <div className="mt-3">
            <Progress value={project.progress} className="h-1.5 bg-black/10 [&>div]:bg-[#1f4fff]" />
            <div className="mt-2 text-sm text-[#5c5a52]">{status.summary}</div>
          </div>
        ) : project.transcript ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
              {project.transcript.stats.wordCount} words
            </Badge>
            <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
              {project.savedRanges.length} saved ranges
            </Badge>
            <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
              {project.transcript.stats.bookmarkCount + project.transcript.stats.highlightCount} quick marks
            </Badge>
          </div>
        ) : null}
      </button>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-[#6d6a61]">{project.error ?? status.summary}</div>
        <div className="flex items-center gap-2">
          {project.status === "error" ? (
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={onRetry}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="text-[#2b2d35] hover:bg-black/5" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

function SearchResultRow({
  result,
  isActive,
  onOpen,
}: {
  result: LibrarySearchResult;
  isActive: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
        isActive ? "border-[#1f4fff]/35 bg-[#eef2ff]" : "border-black/10 bg-white hover:border-[#1f4fff]/25 hover:bg-[#f8fbff]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-[#171a20]">{result.projectTitle}</div>
        <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
          {result.matchKind === "title"
            ? "title"
            : result.matchKind === "saved-range"
              ? `${formatDuration(result.entry.start)}-${formatDuration(result.entry.end)}`
              : formatDuration(result.entry.start)}
        </Badge>
      </div>
      <div className="mt-2 text-sm text-[#232730]">
        {result.matchKind === "title"
          ? "Project title match"
          : result.matchKind === "saved-range"
            ? result.entry.label ?? result.entry.text
            : result.entry.text}
      </div>
      <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#6d6a61]">
        {result.matchKind} match • score {result.score} • {new Date(result.projectUpdatedAt).toLocaleString()}
      </div>
    </button>
  );
}

function TranscriptRow({
  segment,
  marks,
  ranges,
  isFocused,
  isPlaying,
  isMatched,
  query,
  onSelect,
}: {
  segment: TranscriptSegment;
  marks: TranscriptMark[];
  ranges: SavedRange[];
  isFocused: boolean;
  isPlaying: boolean;
  isMatched: boolean;
  query: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
        isFocused
          ? "border-[#1f4fff]/35 bg-[#eef2ff]"
          : isPlaying
            ? "border-[#15181d]/20 bg-[#f4efe4]"
            : "border-black/10 bg-white hover:border-[#1f4fff]/25 hover:bg-[#f8fbff]"
      }`}
      style={{ contentVisibility: "auto" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
            {formatDuration(segment.start)}
          </Badge>
          <Badge className="border border-black/10 bg-white text-[#2b2d35]">turn {segment.turnIndex + 1}</Badge>
          {marks.map((mark) => (
            <Badge
              key={mark.id}
              className={`border ${
                mark.kind === "bookmark"
                  ? "border-[#d9c17b] bg-[#fff5d6] text-[#7e5b00]"
                  : mark.color === "rose"
                    ? "border-[#f3b1bc] bg-[#fff0f3] text-[#9a2340]"
                    : mark.color === "sky"
                      ? "border-[#b4d6ff] bg-[#eef7ff] text-[#174d97]"
                      : "border-[#ebd37c] bg-[#fff8dd] text-[#7d6200]"
              }`}
            >
              {mark.kind}
            </Badge>
          ))}
          {ranges.slice(0, 1).map((range) => (
            <Badge key={range.id} className="border border-[#e1c37a] bg-[#fff5d6] text-[#7e5b00]">
              {range.label}
            </Badge>
          ))}
          {ranges.length > 1 ? (
            <Badge className="border border-[#e1c37a] bg-[#fff5d6] text-[#7e5b00]">
              +{ranges.length - 1} more
            </Badge>
          ) : null}
          {segment.reviewReasons.length > 0 ? (
            <Badge className="border border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]">review</Badge>
          ) : null}
          {isMatched ? (
            <Badge className="border border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]">match</Badge>
          ) : null}
        </div>
        {isPlaying ? <Waves className="mt-1 h-4 w-4 text-[#1f4fff]" /> : null}
      </div>
      <div className="mt-3 text-sm leading-7 text-[#232730]">{highlightMatch(segment.text, query)}</div>
    </button>
  );
}

function SegmentEditor({
  segment,
  marks,
  ranges,
  onSave,
  onBookmark,
  onHighlight,
  onOpenRange,
}: {
  segment: TranscriptSegment;
  marks: TranscriptMark[];
  ranges: SavedRange[];
  onSave: (text: string) => void;
  onBookmark: () => void;
  onHighlight: (color: HighlightColor) => void;
  onOpenRange: (range: SavedRange) => void;
}) {
  const [draft, setDraft] = useState(segment.text);
  const draftWordCount = useMemo(
    () => (draft.trim() ? draft.trim().split(/\s+/).length : 0),
    [draft],
  );

  useEffect(() => {
    setDraft(segment.text);
  }, [segment.id, segment.text]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (draft.trim() && draft !== segment.text) {
        onSave(draft);
      }
    }, 420);

    return () => window.clearTimeout(handle);
  }, [draft, onSave, segment.text]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border border-black/10 bg-[#f6f1e7] text-[#2b2d35]">
          {formatDuration(segment.start)} to {formatDuration(segment.end)}
        </Badge>
        {marks.length > 0 ? (
          marks.map((mark) => (
            <Badge key={mark.id} className="border border-black/10 bg-white text-[#2b2d35]">
              {mark.label}
            </Badge>
          ))
        ) : (
          <Badge className="border border-black/10 bg-white text-[#2b2d35]">Unsaved segment</Badge>
        )}
      </div>

      {ranges.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {ranges.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => onOpenRange(range)}
              className="rounded-full border border-[#e1c37a] bg-[#fff5d6] px-3 py-2 text-sm text-[#7e5b00] transition hover:border-[#c6a754] hover:bg-[#ffefbf]"
            >
              {range.label}
            </button>
          ))}
        </div>
      ) : null}

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-[180px] w-full rounded-[22px] border border-black/10 bg-white px-4 py-4 text-sm leading-7 text-[#232730] outline-none transition focus:border-[#1f4fff]/35 focus:ring-2 focus:ring-[#1f4fff]/15"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-[#6d6a61]">
        <span>Autosaves after a short pause</span>
        <span>{draftWordCount} words</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="bg-white" onClick={onBookmark}>
          <Bookmark className="mr-2 h-4 w-4" />
          Toggle bookmark
        </Button>
        <Button variant="outline" className="bg-white" onClick={() => onHighlight("amber")}>
          <Highlighter className="mr-2 h-4 w-4 text-[#c58b00]" />
          Amber highlight
        </Button>
        <Button variant="outline" className="bg-white" onClick={() => onHighlight("sky")}>
          <Highlighter className="mr-2 h-4 w-4 text-[#1d64c9]" />
          Sky highlight
        </Button>
        <Button variant="outline" className="bg-white" onClick={() => onHighlight("rose")}>
          <Highlighter className="mr-2 h-4 w-4 text-[#b42358]" />
          Rose highlight
        </Button>
      </div>

      {segment.reviewReasons.length > 0 ? (
        <div className="rounded-2xl border border-[#f3b3b3] bg-[#fff0ef] p-4 text-sm text-[#7c2626]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {segment.reviewReasons.map((reason) => (
                <div key={reason}>{reason}</div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-black/10 bg-[#fcfbf7] p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#6d6a61]">{eyebrow}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-[#171a20]">{title}</div>
      <div className="mt-1 text-sm text-[#5c5a52]">{description}</div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function InsightList({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Sparkles;
  title: string;
  items: Array<{ id: string; label: string; meta: string; onOpen: () => void }>;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onOpen}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
            >
              <div className="text-sm text-[#232730]">{item.label}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#6d6a61]">{item.meta}</div>
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 px-4 py-4 text-sm text-[#77736a]">
            No items detected yet.
          </div>
        )}
      </div>
    </div>
  );
}

function InsightTagSection({
  title,
  tags,
}: {
  title: string;
  tags: Array<{ id: string; label: string; onOpen: () => void }>;
}) {
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={tag.onOpen}
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-[#232730] transition hover:border-[#1f4fff]/30 hover:bg-[#eef2ff]"
            >
              {tag.label}
            </button>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-black/10 px-4 py-4 text-sm text-[#77736a]">
            No tags detected yet.
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyPanel({
  title,
  body,
  icon: Icon = FolderOpen,
  compact = false,
}: {
  title: string;
  body: string;
  icon?: typeof FolderOpen;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[22px] border border-dashed border-black/10 bg-[#f8f4eb] text-sm text-[#5c5a52] ${
        compact ? "px-3.5 py-3.5" : "px-4 py-5"
      }`}
    >
      <div className={`flex gap-3 ${compact ? "items-start" : "items-center"}`}>
        <div
          className={`flex items-center justify-center rounded-2xl border border-black/10 bg-white ${
            compact ? "h-8 w-8" : "h-10 w-10"
          }`}
        >
          <Icon className="h-4 w-4 text-[#2b2d35]" />
        </div>
        <div>
          <div className="font-medium text-[#171a20]">{title}</div>
          <div className={`mt-1 text-pretty ${compact ? "leading-6" : ""}`}>{body}</div>
        </div>
      </div>
    </div>
  );
}

function StatsGrid({
  stats,
}: {
  stats: Array<[string, string]>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stats.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-black/10 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">{label}</div>
          <div className="mt-2 text-sm text-[#232730]">{value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({
  status,
  step,
}: {
  status: TranscriptProject["status"];
  step?: TranscriptProject["step"];
}) {
  const content =
    status === "ready"
      ? ["Ready", "border-[#b2dbbd] bg-[#ecfff1] text-[#17643b]"]
      : status === "error"
        ? ["Needs help", "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]"]
        : step === "getting-browser-ready"
          ? ["Setup", "border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]"]
          : step === "getting-recording-ready"
            ? ["Preparing", "border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]"]
            : step === "saving"
              ? ["Saving", "border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]"]
              : status === "queued"
                ? ["Queued", "border-black/10 bg-white text-[#2b2d35]"]
                : ["Working", "border-[#c7d6ff] bg-[#eef2ff] text-[#1d3bb8]"];

  return <Badge className={`border ${content[1]}`}>{content[0]}</Badge>;
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[#171a20]">{value}</div>
    </div>
  );
}

function Shortcut({
  hint,
  keys,
}: {
  hint: string;
  keys: string[];
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{hint}</span>
      <div className="flex items-center gap-1">
        {keys.map((key) => (
          <span
            key={key}
            className="rounded-md border border-black/10 bg-[#f6f1e7] px-2 py-1 font-mono text-xs text-[#171a20]"
          >
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return text;
  }

  const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "ig"));

  if (parts.length <= 1) {
    return text;
  }

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === normalizedQuery ? (
          <mark key={`${part}-${index}`} className="rounded bg-[#fff2a8] px-1 text-[#1c1f26]">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
