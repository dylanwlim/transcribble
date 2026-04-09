"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FolderOpen,
  Highlighter,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
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
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTranscribble } from "@/hooks/use-transcribble";
import { APP_NAME, MAX_FILE_SIZE_LABEL } from "@/lib/transcribble/constants";
import type { ExportFormat } from "@/lib/transcribble/export";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/transcribble/transcript";
import type {
  HighlightColor,
  LibrarySearchResult,
  TranscriptChapter,
  TranscriptInsights,
  TranscriptMark,
  TranscriptProject,
  TranscriptSegment,
  TranscriptTurn,
} from "@/lib/transcribble/types";

const EXPORT_FORMATS: ExportFormat[] = ["txt", "md", "srt", "vtt"];
const PIPELINE_STEPS = [
  { key: "queued", label: "Queued" },
  { key: "preparing", label: "Prepare media" },
  { key: "loading-model", label: "Load model" },
  { key: "transcribing", label: "Transcribe" },
  { key: "ready", label: "Ready" },
] as const;

type WorkspaceTab = "outline" | "insights" | "session";

const INTERACTIVE =
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out motion-reduce:transition-none motion-safe:hover:-translate-y-px motion-safe:hover:shadow-[0_14px_28px_rgba(17,20,27,0.05)] motion-safe:active:translate-y-0";

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
    focusedSegment,
    focusedSegmentId,
    playbackSegmentId,
    transcriptSearchResults,
    librarySearchResults,
    libraryQuery,
    transcriptQuery,
    currentFileMeta,
    capabilityIssue,
    runtime,
    assetSetup,
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
    assignSpeakerLabel,
    primeTranscriptionModel,
    primeMediaRuntime,
    cancelProject,
    retryProject,
    removeProject,
    openLibrarySearchResult,
    setLibraryQuery,
    setTranscriptQuery,
    setNotice,
    mediaHandlers,
  } = useTranscribble();

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("session");
  const [titleDraft, setTitleDraft] = useState("");
  const transcriptReadyRef = useRef(false);

  const selectedProjectInsights = selectedProject?.transcript?.insights;
  const selectedProjectStats = selectedProject?.transcript?.stats;
  const selectedProjectChapters = useMemo(
    () => selectedProject?.transcript?.chapters ?? [],
    [selectedProject?.transcript?.chapters],
  );
  const matchedSegmentIds = useMemo(
    () => new Set(transcriptSearchResults.map((result) => result.entry.segmentId).filter(Boolean)),
    [transcriptSearchResults],
  );
  const activeChapter = useMemo(
    () =>
      selectedProjectChapters.find(
        (chapter) => currentTime >= chapter.start && currentTime <= chapter.end + 0.25,
      ) ??
      selectedProjectChapters[0] ??
      null,
    [currentTime, selectedProjectChapters],
  );
  const hasTranscript = Boolean(selectedProject?.transcript);
  const emptyState = projects.length === 0;
  const setupReady = assetSetup.modelReady && assetSetup.mediaReady;
  const effectiveOnline = assetSetup.online;
  const supportedFormatsLabel = useMemo(
    () =>
      accept
        .split(",")
        .map((value) => value.replace(".", "").toUpperCase())
        .join(" · "),
    [accept],
  );
  const activeQueue = projectGroups.active;
  const attentionProjects = [...projectGroups.paused, ...projectGroups.errored].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  const queuedCount = queuedProjects.length;
  const currentProgress = selectedProject
    ? selectedProject.status === "ready"
      ? 100
      : selectedProject.progress
    : 0;
  const currentWorkerProject = useMemo(
    () => activeQueue.find((project) => isProjectRunning(project.status)) ?? activeQueue[0] ?? null,
    [activeQueue],
  );
  const queuePosition = useMemo(() => {
    if (!selectedProject) {
      return null;
    }

    const index = activeQueue.findIndex((project) => project.id === selectedProject.id);
    return index === -1 ? null : index + 1;
  }, [activeQueue, selectedProject]);
  const insightItemCount = useMemo(() => {
    if (!selectedProjectInsights) {
      return 0;
    }

    return [
      selectedProjectInsights.summary.length,
      selectedProjectInsights.actions.length,
      selectedProjectInsights.questions.length,
      selectedProjectInsights.dates.length,
      selectedProjectInsights.entities.length,
      selectedProjectInsights.glossary.length,
      selectedProjectInsights.keyMoments.length,
      selectedProjectInsights.reviewCues.length,
    ].reduce((total, count) => total + count, 0);
  }, [selectedProjectInsights]);
  const setupSummary = setupReady
    ? "Offline-ready cache primed for this browser."
    : effectiveOnline
      ? "First run caches the local model and media runtime for later offline sessions."
      : "Reconnect once to cache the local assets required for dependable offline reuse.";
  const setupBreakdownLabel = `${assetSetup.modelReady ? "Model cached" : "Model pending"} • ${
    assetSetup.mediaReady ? "Media runtime cached" : "Media runtime pending"
  }`;

  const attachMediaRef = (node: HTMLAudioElement | HTMLVideoElement | null) => {
    mediaRef.current = node;
  };

  useEffect(() => {
    setTitleDraft(selectedProject?.title ?? "");
  }, [selectedProject?.id, selectedProject?.title]);

  useEffect(() => {
    const nextReady = Boolean(selectedProject?.transcript);

    if (selectedProject?.id) {
      if (nextReady && !transcriptReadyRef.current) {
        setWorkspaceTab("outline");
      }

      if (!nextReady && transcriptReadyRef.current) {
        setWorkspaceTab("session");
      }
    } else {
      setWorkspaceTab("session");
    }

    transcriptReadyRef.current = nextReady;
  }, [selectedProject?.id, selectedProject?.transcript]);

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

  const primeWorkspaceSetup = async () => {
    if (!assetSetup.modelReady) {
      await primeTranscriptionModel();
    }

    if (!assetSetup.mediaReady) {
      await primeMediaRuntime();
    }
  };

  const togglePlayback = () => {
    if (!mediaRef.current) {
      return;
    }

    if (mediaRef.current.paused) {
      void mediaRef.current.play();
    } else {
      mediaRef.current.pause();
    }
  };

  return (
    <div className="min-h-screen bg-[#efe9dc] text-[#101321]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(31,79,255,0.16),transparent_38%),radial-gradient(circle_at_top_right,rgba(18,23,34,0.16),transparent_36%)]" />
      <div
        className="relative min-h-screen"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#10131a] text-white">
          <div className="mx-auto flex max-w-[1560px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-[#1f4fff] shadow-[0_18px_40px_rgba(31,79,255,0.34)]">
                <AudioLines className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
                  <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-medium text-white/82">
                    Local-first audio workspace
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/78">
                  Searchable transcripts, timestamped edits, grounded outputs, and reusable sessions that stay on-device.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
              <SignalChip
                icon={ShieldCheck}
                title="On-device workspace"
                body={setupSummary}
                tone={setupReady ? "success" : "default"}
                className="lg:min-w-[23rem]"
              />
              <div className="flex flex-wrap items-center gap-2">
                <MiniSignal icon={Cpu} label={runtime === "webgpu" ? "WebGPU runtime" : "WASM runtime"} />
                <MiniSignal
                  icon={setupReady ? CheckCircle2 : AlertTriangle}
                  label={setupReady ? "Offline ready" : effectiveOnline ? "Offline setup" : "Needs connection"}
                  tone={setupReady ? "success" : effectiveOnline ? "default" : "warning"}
                />
                {queuedCount > 0 ? <MiniSignal label={`${queuedCount} queued`} /> : null}
                <Button
                  onClick={openFilePicker}
                  className="rounded-full bg-[#1f4fff] px-5 text-white shadow-[0_16px_32px_rgba(31,79,255,0.22)] hover:bg-[#1a43d6]"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Add media
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1560px] px-4 py-4 sm:px-6 lg:px-8">
          {capabilityIssue || notice ? (
            <div className="mb-4 space-y-2">
              {capabilityIssue ? (
                <NoticeBanner tone="error" body={capabilityIssue} onDismiss={() => setNotice(null)} />
              ) : null}
              {notice ? <NoticeBanner tone={notice.tone} body={notice.message} onDismiss={() => setNotice(null)} /> : null}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <LibraryRail
              libraryQuery={libraryQuery}
              librarySearchResults={librarySearchResults}
              selectedProjectId={selectedProject?.id ?? null}
              focusedSegmentId={focusedSegmentId}
              librarySearchRef={librarySearchRef}
              setLibraryQuery={setLibraryQuery}
              openLibrarySearchResult={openLibrarySearchResult}
              projectGroups={projectGroups}
              attentionProjects={attentionProjects}
              projects={projects}
              currentWorkerProjectId={currentWorkerProject?.id ?? null}
              onOpenProject={selectProject}
              onCancelProject={cancelProject}
              onRetryProject={retryProject}
              onRemoveProject={removeProject}
            />

            <main className="min-w-0">
              {!workspaceReady ? (
                <Surface className="min-h-[52vh] animate-pulse rounded-[32px] bg-[#faf7f1]/90" />
              ) : emptyState ? (
                <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
                  <EmptyWorkspace
                    setupReady={setupReady}
                    effectiveOnline={effectiveOnline}
                    setupBreakdownLabel={setupBreakdownLabel}
                    supportedFormatsLabel={supportedFormatsLabel}
                    assetSetup={assetSetup}
                    openFilePicker={openFilePicker}
                    onPrimeWorkspaceSetup={() => {
                      void primeWorkspaceSetup();
                    }}
                    queuedCount={queuedCount}
                  />
                </div>
              ) : selectedProject ? (
                <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
                  <ProjectHeader
                    project={selectedProject}
                    titleDraft={titleDraft}
                    onTitleChange={setTitleDraft}
                    onTitleBlur={() => setTitleDraft((current) => current.trim() || selectedProject.title)}
                    currentFileMeta={currentFileMeta}
                    hasTranscript={hasTranscript}
                    copied={copied}
                    onCopyTranscript={onCopyTranscript}
                  />

                  {hasTranscript ? (
                    <ReadyWorkspace
                      project={selectedProject}
                      transcriptQuery={transcriptQuery}
                      setTranscriptQuery={setTranscriptQuery}
                      transcriptSearchRef={transcriptSearchRef}
                      transcriptSearchResults={transcriptSearchResults}
                      transcriptSegments={transcriptSegments}
                      transcriptTurns={transcriptTurns}
                      matchedSegmentIds={matchedSegmentIds}
                      selectedProjectChapters={selectedProjectChapters}
                      currentProjectMarks={currentProjectMarks}
                      activeChapter={activeChapter}
                      focusedSegment={focusedSegment}
                      focusedSegmentId={focusedSegmentId}
                      playbackSegmentId={playbackSegmentId}
                      currentTime={currentTime}
                      mediaUrl={mediaUrl}
                      isPlaying={isPlaying}
                      attachMediaRef={attachMediaRef}
                      mediaHandlers={mediaHandlers}
                      onTogglePlayback={togglePlayback}
                      currentFileMeta={currentFileMeta}
                      selectedProjectStats={selectedProjectStats}
                      currentProjectInsightsCount={insightItemCount}
                      workspaceTab={workspaceTab}
                      setWorkspaceTab={setWorkspaceTab}
                      onSeekByDelta={seekByDelta}
                      onSelectAdjacentSegment={selectAdjacentSegment}
                      onSelectSegment={selectSegment}
                      onJumpToTranscriptMatch={jumpToTranscriptMatch}
                      onSaveSegment={updateSelectedSegmentText}
                      onToggleBookmark={toggleBookmark}
                      onToggleHighlight={toggleHighlight}
                      onDownloadTranscript={onDownloadTranscript}
                      assetSetup={assetSetup}
                      onPrimeModel={primeTranscriptionModel}
                      onPrimeMedia={primeMediaRuntime}
                      onAssignSpeakerLabel={assignSpeakerLabel}
                    />
                  ) : (
                    <ProcessingWorkspace
                      project={selectedProject}
                      currentProgress={currentProgress}
                      queuePosition={queuePosition}
                      activeQueueSize={activeQueue.length}
                      currentWorkerProject={currentWorkerProject}
                      partialTranscript={partialTranscript}
                      assetProgressItems={assetProgressItems}
                      mediaUrl={mediaUrl}
                      isPlaying={isPlaying}
                      currentTime={currentTime}
                      currentFileMeta={currentFileMeta}
                      activeChapter={activeChapter}
                      attachMediaRef={attachMediaRef}
                      mediaHandlers={mediaHandlers}
                      onTogglePlayback={togglePlayback}
                      setupReady={setupReady}
                      setupBreakdownLabel={setupBreakdownLabel}
                      effectiveOnline={effectiveOnline}
                      supportedFormatsLabel={supportedFormatsLabel}
                      assetSetup={assetSetup}
                      onSeekByDelta={seekByDelta}
                      onSelectAdjacentSegment={selectAdjacentSegment}
                      onCancelProject={cancelProject}
                      onRetryProject={retryProject}
                      onRemoveProject={removeProject}
                      onPrimeWorkspaceSetup={() => {
                        void primeWorkspaceSetup();
                      }}
                      onPrimeModel={primeTranscriptionModel}
                      onPrimeMedia={primeMediaRuntime}
                    />
                  )}
                </div>
              ) : (
                <Surface className="rounded-[32px] px-6 py-12 text-center">
                  <div className="mx-auto max-w-md">
                    <div className="text-sm text-[#5d635f]">Select a saved session from the library to reopen the workspace.</div>
                  </div>
                </Surface>
              )}
            </main>
          </div>
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
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#10131f]/52 p-6 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0">
            <div className="w-full max-w-2xl rounded-[36px] border border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.08))] px-8 py-10 text-white shadow-[0_28px_90px_rgba(0,0,0,0.34)] motion-safe:animate-in motion-safe:zoom-in-95">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/16">
                <FolderOpen className="h-7 w-7" />
              </div>
              <div className="mt-5 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-white/68">Drop local media</div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">Queue audio or video into the workspace</div>
                <div className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/74">
                  {supportedFormatsLabel} up to {MAX_FILE_SIZE_LABEL} each. Files stay local and queue automatically for on-device transcription.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LibraryRail({
  libraryQuery,
  librarySearchResults,
  selectedProjectId,
  focusedSegmentId,
  librarySearchRef,
  setLibraryQuery,
  openLibrarySearchResult,
  projectGroups,
  attentionProjects,
  projects,
  currentWorkerProjectId,
  onOpenProject,
  onCancelProject,
  onRetryProject,
  onRemoveProject,
}: {
  libraryQuery: string;
  librarySearchResults: LibrarySearchResult[];
  selectedProjectId: string | null;
  focusedSegmentId: string | null;
  librarySearchRef: React.RefObject<HTMLInputElement | null>;
  setLibraryQuery: (value: string) => void;
  openLibrarySearchResult: (result: LibrarySearchResult) => void;
  projectGroups: {
    ready: TranscriptProject[];
    active: TranscriptProject[];
    paused: TranscriptProject[];
    errored: TranscriptProject[];
  };
  attentionProjects: TranscriptProject[];
  projects: TranscriptProject[];
  currentWorkerProjectId: string | null;
  onOpenProject: (projectId: string) => void;
  onCancelProject: (projectId: string) => void;
  onRetryProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
}) {
  const activeCount = projectGroups.active.length;
  const savedCount = projectGroups.ready.length;
  const attentionCount = attentionProjects.length;

  return (
    <aside className="xl:sticky xl:top-[5.85rem] xl:self-start">
      <Surface className="rounded-[30px] overflow-hidden">
        <div className="border-b border-black/8 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PanelEyebrow>Library</PanelEyebrow>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-[#11131c]">Sessions and queue</div>
            </div>
            <Badge className="border border-black/8 bg-white text-[#232730]">{projects.length} total</Badge>
          </div>

          <div className="mt-4 relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#88857c]" />
            <Input
              ref={librarySearchRef}
              value={libraryQuery}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Search sessions and transcript text"
              className="h-11 rounded-2xl border-black/8 bg-white pl-10 text-sm shadow-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <SummaryPill label="Queue" value={String(activeCount)} />
            <SummaryPill label="Saved" value={String(savedCount)} />
            {attentionCount > 0 ? <SummaryPill label="Needs attention" value={String(attentionCount)} tone="warning" /> : null}
          </div>
        </div>

        <div className="max-h-[calc(100svh-8.5rem)] space-y-5 overflow-y-auto px-4 py-4">
          {libraryQuery.trim() ? (
            <section className="space-y-3">
              <SectionHeading icon={Search} title="Matches" meta={`${librarySearchResults.length}`} />
              {librarySearchResults.length > 0 ? (
                librarySearchResults.map((result) => (
                  <SearchResultRow
                    key={`${result.projectId}-${result.entry.segmentId}-${result.entry.start}`}
                    result={result}
                    isActive={result.projectId === selectedProjectId && result.entry.segmentId === focusedSegmentId}
                    onOpen={() => openLibrarySearchResult(result)}
                  />
                ))
              ) : (
                <EmptyPanel
                  compact
                  title="No matches yet"
                  body="Search scans saved project titles and transcript spans stored in this browser."
                />
              )}
            </section>
          ) : (
            <>
              <LibrarySection
                title={activeCount > 0 ? "Queue" : "Queue is clear"}
                meta={activeCount > 0 ? `${activeCount} active` : undefined}
                icon={Waves}
              >
                {projectGroups.active.length > 0 ? (
                  projectGroups.active.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      selected={project.id === selectedProjectId}
                      currentWorker={project.id === currentWorkerProjectId}
                      onOpen={() => onOpenProject(project.id)}
                      onCancel={() => onCancelProject(project.id)}
                      onRetry={() => onRetryProject(project.id)}
                      onDelete={() => onRemoveProject(project.id)}
                    />
                  ))
                ) : (
                  <EmptyPanel
                    compact
                    title="Queue is clear"
                    body="Add local audio or video to start a new on-device transcript session."
                  />
                )}
              </LibrarySection>

              {attentionProjects.length > 0 ? (
                <LibrarySection
                  title="Needs decision"
                  meta={`${attentionProjects.length} waiting`}
                  icon={AlertTriangle}
                >
                  {attentionProjects.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      selected={project.id === selectedProjectId}
                      onOpen={() => onOpenProject(project.id)}
                      onCancel={() => onCancelProject(project.id)}
                      onRetry={() => onRetryProject(project.id)}
                      onDelete={() => onRemoveProject(project.id)}
                    />
                  ))}
                </LibrarySection>
              ) : null}

              <LibrarySection
                title={projectGroups.ready.length > 0 ? "Saved sessions" : "Saved sessions"}
                meta={projectGroups.ready.length > 0 ? `${projectGroups.ready.length} ready` : undefined}
                icon={CheckCircle2}
              >
                {projectGroups.ready.length > 0 ? (
                  projectGroups.ready.map((project) => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      selected={project.id === selectedProjectId}
                      onOpen={() => onOpenProject(project.id)}
                      onCancel={() => onCancelProject(project.id)}
                      onRetry={() => onRetryProject(project.id)}
                      onDelete={() => onRemoveProject(project.id)}
                    />
                  ))
                ) : (
                  <EmptyPanel
                    compact
                    title="Nothing saved yet"
                    body="Completed transcripts stay searchable, editable, and exportable in this browser."
                  />
                )}
              </LibrarySection>
            </>
          )}
        </div>
      </Surface>
    </aside>
  );
}

function EmptyWorkspace({
  setupReady,
  effectiveOnline,
  setupBreakdownLabel,
  supportedFormatsLabel,
  assetSetup,
  openFilePicker,
  onPrimeWorkspaceSetup,
  queuedCount,
}: {
  setupReady: boolean;
  effectiveOnline: boolean;
  setupBreakdownLabel: string;
  supportedFormatsLabel: string;
  assetSetup: {
    modelReady: boolean;
    mediaReady: boolean;
    warmingModel: boolean;
    warmingMedia: boolean;
  };
  openFilePicker: () => void;
  onPrimeWorkspaceSetup: () => void;
  queuedCount: number;
}) {
  return (
    <Surface className="overflow-hidden rounded-[34px]">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="border-b border-black/8 px-6 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:py-10">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-[#1f4fff] text-white shadow-[0_16px_34px_rgba(31,79,255,0.22)]">
              <AudioLines className="h-6 w-6" />
            </div>
            <span className="rounded-full border border-black/8 bg-white px-3 py-1 text-xs font-medium text-[#2b3038]">
              Private browser workspace
            </span>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                setupReady
                  ? "border-[#b7dbc4] bg-[#ebfff0] text-[#17643b]"
                  : "border-[#ddd4c4] bg-[#f8f3e8] text-[#5b5a52]",
              )}
            >
              {setupReady ? "Offline setup primed" : "First-run setup available"}
            </span>
          </div>

          <div className="mt-8 max-w-3xl">
            <PanelEyebrow>Start here</PanelEyebrow>
            <h1 className="mt-3 max-w-[11.5ch] text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-[#10131a]">
              Turn raw audio into a clean, searchable local workspace.
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-[15px] leading-7 text-[#575c58] sm:text-lg">
              Add audio or video, let the browser transcribe it on-device, then reopen the same session to search,
              edit, highlight, and export without handing files to a paid backend.
            </p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              onClick={openFilePicker}
              className="rounded-full bg-[#1f4fff] px-5 text-white shadow-[0_18px_34px_rgba(31,79,255,0.22)] hover:bg-[#1a43d6]"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Add local media
            </Button>
            {!setupReady ? (
              <Button
                variant="outline"
                className="rounded-full border-black/8 bg-white px-5"
                onClick={onPrimeWorkspaceSetup}
                disabled={
                  assetSetup.warmingModel ||
                  assetSetup.warmingMedia ||
                  queuedCount > 0 ||
                  !effectiveOnline
                }
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                {assetSetup.warmingModel || assetSetup.warmingMedia ? "Priming local setup…" : "Prime offline setup"}
              </Button>
            ) : (
              <div className="inline-flex items-center rounded-full border border-[#b7dbc4] bg-[#ebfff0] px-4 py-2 text-sm font-medium text-[#17643b]">
                Offline cache primed for this browser
              </div>
            )}
          </div>

          <div className="mt-8 rounded-[28px] border border-dashed border-[#d8d0c1] bg-[#f8f3e8] px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-base font-semibold text-[#161922]">Drop media anywhere in the workspace</div>
                <div className="mt-1 text-sm leading-6 text-[#575c58]">
                  {supportedFormatsLabel} up to {MAX_FILE_SIZE_LABEL} each. Multiple files queue automatically and stay local.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b685f]">
                <span className="rounded-full border border-black/8 bg-white px-3 py-1.5">Multi-file queue</span>
                <span className="rounded-full border border-black/8 bg-white px-3 py-1.5">Evidence-linked outputs</span>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <ValuePanel
              icon={Search}
              title="Search locally"
              body="Saved sessions keep titles and transcript spans indexed in this browser for later lookup."
            />
            <ValuePanel
              icon={Bookmark}
              title="Keep evidence attached"
              body="Edits, highlights, and bookmarks stay tied to transcript timestamps instead of floating free."
            />
            <ValuePanel
              icon={Download}
              title="Export working files"
              body="TXT, MD, SRT, and VTT come from the same local session without a handoff step."
            />
          </div>
        </div>

        <div className="px-6 py-8 sm:px-8 xl:py-10">
          <div className="space-y-4">
            <div>
              <PanelEyebrow>Local setup</PanelEyebrow>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-[#11131c]">Prime this browser once</div>
              <p className="mt-2 text-sm leading-6 text-[#575c58]">
                The core workflow stays local. First run only needs to cache the model and media runtime for repeat sessions.
              </p>
            </div>

            <div className="rounded-[28px] border border-black/8 bg-[#f7f3ea] p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-[#171a20]">{setupReady ? "Offline-ready" : "Setup status"}</div>
                <Badge
                  className={cn(
                    "border",
                    effectiveOnline
                      ? "border-[#c6d5ff] bg-[#eef2ff] text-[#1d3bb8]"
                      : "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]",
                  )}
                >
                  {effectiveOnline ? "Online" : "Offline"}
                </Badge>
              </div>
              <div className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                {setupBreakdownLabel}
              </div>
              <div className="mt-4 space-y-3">
                <ChecklistRow title="Transcription model" ready={setupReady || assetSetup.modelReady} />
                <ChecklistRow title="Media runtime" ready={setupReady || assetSetup.mediaReady} />
              </div>
            </div>

            <div className="rounded-[28px] border border-black/8 bg-white p-5">
              <div className="text-sm font-medium text-[#171a20]">What happens next</div>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-[#575c58]">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-xs font-semibold text-[#1f4fff]">
                    1
                  </span>
                  Choose media to queue a local transcription session.
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-xs font-semibold text-[#1f4fff]">
                    2
                  </span>
                  The browser prepares media, loads the model, and writes timestamped transcript segments.
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-xs font-semibold text-[#1f4fff]">
                    3
                  </span>
                  Search, edit, export, and reopen the same evidence-linked workspace later.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function ProjectHeader({
  project,
  titleDraft,
  onTitleChange,
  onTitleBlur,
  currentFileMeta,
  hasTranscript,
  copied,
  onCopyTranscript,
}: {
  project: TranscriptProject;
  titleDraft: string;
  onTitleChange: (value: string) => void;
  onTitleBlur: () => void;
  currentFileMeta: {
    fileMeta: string;
    durationLabel: string;
    runtimeLabel: string;
    modelLabel: string;
    fileSizeLabel: string;
  };
  hasTranscript: boolean;
  copied: boolean;
  onCopyTranscript: () => void;
}) {
  const statusSummary = hasTranscript
    ? "The workspace is live. Every edit, highlight, bookmark, and extracted item can jump back to its source segment."
    : project.status === "queued"
      ? "This file is saved locally and queued. The live processing status and queue actions are shown below."
      : isProjectRunning(project.status)
        ? "This file is being processed locally. The active stage, queue context, and controls are shown below."
        : "This file is still stored locally. Retry or remove it from the workflow controls below.";

  return (
    <Surface className="rounded-[32px] px-6 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PanelEyebrow>{hasTranscript ? "Transcript ready" : "Current session"}</PanelEyebrow>
            <StatusPill status={project.status} label={hasTranscript ? "Ready" : project.stageLabel} />
          </div>
          <Input
            value={titleDraft}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
            className="mt-3 h-auto border-0 bg-transparent px-0 text-[clamp(1.9rem,3vw,3rem)] font-semibold tracking-[-0.04em] text-[#10131a] shadow-none focus-visible:ring-0"
            placeholder="Project title"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#5a5f5b]">
            <span>{project.sourceName}</span>
            <span className="text-[#b9b3a7]">•</span>
            <span>{currentFileMeta.fileSizeLabel}</span>
            <span className="text-[#b9b3a7]">•</span>
            <span>{currentFileMeta.durationLabel}</span>
            <span className="text-[#b9b3a7]">•</span>
            <span>{currentFileMeta.runtimeLabel}</span>
          </div>
          <div className="mt-3 text-sm leading-6 text-[#5a5f5b]">{statusSummary}</div>
        </div>

        {hasTranscript ? (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button variant="outline" className="rounded-full border-black/8 bg-white px-4" onClick={onCopyTranscript}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy transcript"}
            </Button>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

function ProcessingWorkspace({
  project,
  currentProgress,
  queuePosition,
  activeQueueSize,
  currentWorkerProject,
  partialTranscript,
  assetProgressItems,
  mediaUrl,
  isPlaying,
  currentTime,
  currentFileMeta,
  activeChapter,
  attachMediaRef,
  mediaHandlers,
  onTogglePlayback,
  setupReady,
  setupBreakdownLabel,
  effectiveOnline,
  supportedFormatsLabel,
  assetSetup,
  onSeekByDelta,
  onSelectAdjacentSegment,
  onCancelProject,
  onRetryProject,
  onRemoveProject,
  onPrimeWorkspaceSetup,
  onPrimeModel,
  onPrimeMedia,
}: {
  project: TranscriptProject;
  currentProgress: number;
  queuePosition: number | null;
  activeQueueSize: number;
  currentWorkerProject: TranscriptProject | null;
  partialTranscript: string;
  assetProgressItems: Array<{
    file: string;
    progress: number;
    total?: number;
    loaded?: number;
  }>;
  mediaUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  currentFileMeta: {
    durationLabel: string;
  };
  activeChapter: TranscriptChapter | null;
  attachMediaRef: (node: HTMLAudioElement | HTMLVideoElement | null) => void;
  mediaHandlers: {
    onLoadedMetadata: () => void;
    onTimeUpdate: () => void;
    onPlay: () => void;
    onPause: () => void;
    onError: () => void;
  };
  onTogglePlayback: () => void;
  setupReady: boolean;
  setupBreakdownLabel: string;
  effectiveOnline: boolean;
  supportedFormatsLabel: string;
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
  onSeekByDelta: (deltaSeconds: number) => void;
  onSelectAdjacentSegment: (direction: -1 | 1) => void;
  onCancelProject: (projectId: string) => void;
  onRetryProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  onPrimeWorkspaceSetup: () => void;
  onPrimeModel: () => void;
  onPrimeMedia: () => void;
}) {
  const isRunning = isProjectRunning(project.status);
  const canRetry = project.status === "paused" || project.status === "error";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_360px]">
      <div className="space-y-4">
        <Surface className="rounded-[32px] px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <PanelEyebrow>{isRunning ? "Processing now" : project.status === "queued" ? "Waiting in queue" : "Session on hold"}</PanelEyebrow>
              <div className="mt-2 text-[clamp(1.8rem,3vw,2.7rem)] font-semibold tracking-[-0.04em] text-[#10131a]">
                {getProcessingHeadline(project)}
              </div>
              <p className="mt-3 text-pretty text-sm leading-7 text-[#5a5f5b]">
                {project.status === "queued"
                  ? queuePosition && queuePosition > 1
                    ? `This file is saved locally and waiting behind ${queuePosition - 1} ${queuePosition - 1 === 1 ? "session" : "sessions"}.`
                    : "This file is saved locally and will begin as soon as the browser is ready."
                  : project.detail}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
              {(isRunning || project.status === "queued") ? (
                <Button
                  variant="outline"
                  className="rounded-full border-black/8 bg-white px-4"
                  onClick={() => onCancelProject(project.id)}
                >
                  <X className="mr-2 h-4 w-4" />
                  {project.status === "queued" ? "Remove from queue" : "Stop"}
                </Button>
              ) : null}
              {canRetry ? (
                <Button
                  variant="outline"
                  className="rounded-full border-black/8 bg-white px-4"
                  onClick={() => onRetryProject(project.id)}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="rounded-full px-4 text-[#66645f] hover:bg-black/5 hover:text-[#161a20]"
                onClick={() => onRemoveProject(project.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <PipelineSteps project={project} />
            <div className="mt-5 rounded-[26px] border border-black/8 bg-[#f8f3e8] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium text-[#171a20]">{project.stageLabel}</div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                  {queuePosition ? `${queuePosition} of ${Math.max(activeQueueSize, queuePosition)}` : "Selected session"}
                </div>
              </div>
              <Progress
                value={currentProgress}
                className="mt-4 h-2 rounded-full bg-black/8 [&>div]:bg-[#1f4fff]"
              />
              <div className="mt-3 text-sm leading-6 text-[#5a5f5b]">{project.detail}</div>

              {assetProgressItems.length > 0 ? (
                <div className="mt-4 space-y-3 border-t border-black/8 pt-4">
                  {assetProgressItems.map((item) => (
                    <div key={item.file} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
                        <span className="truncate">{item.file.split("/").at(-1) ?? item.file}</span>
                        <span>{item.progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={item.progress} className="h-1.5 bg-black/8 [&>div]:bg-[#16181d]" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {partialTranscript ? (
              <div className="rounded-[28px] border border-black/8 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">
                  <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Live preview
                </div>
                <div className="mt-3 text-sm leading-7 text-[#232730]">{partialTranscript}</div>
              </div>
            ) : (
              <LockedWorkspaceCard
                title="Transcript tools unlock automatically"
                body="Search, segment editing, grounded insights, and exports appear as soon as the local transcript is ready."
              />
            )}

            <LockedWorkspaceCard
              title="What you can do now"
              body={
                project.status === "error"
                  ? "Retry from this workspace or remove the file if it was the wrong upload."
                  : project.status === "paused"
                    ? "The file is still stored locally. Retry to place it back in line or remove it."
                    : "Keep adding files, stop this job, or leave the browser open while the local queue runs."
              }
              meta={[
                currentWorkerProject?.id === project.id ? "Current job" : currentWorkerProject ? `Working on ${currentWorkerProject.title}` : "Waiting",
                setupReady ? "Offline setup ready" : "Setup still warmable",
              ]}
            />
          </div>
        </Surface>
      </div>

      <div className="space-y-4 xl:sticky xl:top-[5.85rem] xl:self-start">
        <PlaybackPanel
          project={project}
          mediaUrl={mediaUrl}
          isPlaying={isPlaying}
          currentTime={currentTime}
          currentFileMeta={currentFileMeta}
          activeChapter={activeChapter}
          attachMediaRef={attachMediaRef}
          mediaHandlers={mediaHandlers}
          onTogglePlayback={onTogglePlayback}
          onSeekByDelta={onSeekByDelta}
          onSelectAdjacentSegment={onSelectAdjacentSegment}
          hasTranscript={false}
        />

        <Surface className="rounded-[28px] px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PanelEyebrow>Queue context</PanelEyebrow>
              <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">What happens next</div>
            </div>
            <Badge className="border border-black/8 bg-white text-[#232730]">{activeQueueSize} queued</Badge>
          </div>

          <div className="mt-4 space-y-3">
            <QueueLine
              title={currentWorkerProject ? currentWorkerProject.title : "Nothing is running"}
              meta={currentWorkerProject ? currentWorkerProject.stageLabel : "Queue idle"}
              active
            />
            {queuePosition && queuePosition < activeQueueSize ? (
              <QueueLine
                title={project.title}
                meta={project.status === "queued" ? "Waiting in line" : project.stageLabel}
              />
            ) : null}
          </div>

          <div className="mt-5 rounded-[24px] border border-black/8 bg-[#f8f3e8] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">Formats</div>
            <div className="mt-2 text-sm leading-6 text-[#585d59]">
              {supportedFormatsLabel}. Local sessions become searchable and exportable once transcription completes.
            </div>
          </div>
        </Surface>

        {!setupReady || assetSetup.lastError ? (
          <SetupChecklist
            assetSetup={assetSetup}
            onPrimeModel={onPrimeModel}
            onPrimeMedia={onPrimeMedia}
            onPrimeWorkspaceSetup={onPrimeWorkspaceSetup}
            compact
          />
        ) : (
          <Surface className="rounded-[28px] px-5 py-5">
            <PanelEyebrow>Setup</PanelEyebrow>
            <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">Browser cache is ready</div>
            <div className="mt-3 text-sm leading-6 text-[#585d59]">{setupBreakdownLabel}</div>
            <div className="mt-4 inline-flex items-center rounded-full border border-[#b7dbc4] bg-[#ebfff0] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#17643b]">
              {effectiveOnline ? "Offline reuse enabled" : "Can reopen offline"}
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}

function ReadyWorkspace({
  project,
  transcriptQuery,
  setTranscriptQuery,
  transcriptSearchRef,
  transcriptSearchResults,
  transcriptSegments,
  transcriptTurns,
  matchedSegmentIds,
  selectedProjectChapters,
  currentProjectMarks,
  activeChapter,
  focusedSegment,
  focusedSegmentId,
  playbackSegmentId,
  currentTime,
  mediaUrl,
  isPlaying,
  attachMediaRef,
  mediaHandlers,
  onTogglePlayback,
  currentFileMeta,
  selectedProjectStats,
  currentProjectInsightsCount,
  workspaceTab,
  setWorkspaceTab,
  onSeekByDelta,
  onSelectAdjacentSegment,
  onSelectSegment,
  onJumpToTranscriptMatch,
  onSaveSegment,
  onToggleBookmark,
  onToggleHighlight,
  onDownloadTranscript,
  assetSetup,
  onPrimeModel,
  onPrimeMedia,
  onAssignSpeakerLabel,
}: {
  project: TranscriptProject;
  transcriptQuery: string;
  setTranscriptQuery: (value: string) => void;
  transcriptSearchRef: React.RefObject<HTMLInputElement | null>;
  transcriptSearchResults: Array<{
    entry: {
      segmentId: string;
      start: number;
      text: string;
    };
    score: number;
  }>;
  transcriptSegments: TranscriptSegment[];
  transcriptTurns: TranscriptTurn[];
  matchedSegmentIds: Set<string>;
  selectedProjectChapters: TranscriptChapter[];
  currentProjectMarks: TranscriptMark[];
  activeChapter: TranscriptChapter | null;
  focusedSegment: TranscriptSegment | null;
  focusedSegmentId: string | null;
  playbackSegmentId: string | null;
  currentTime: number;
  mediaUrl: string | null;
  isPlaying: boolean;
  attachMediaRef: (node: HTMLAudioElement | HTMLVideoElement | null) => void;
  mediaHandlers: {
    onLoadedMetadata: () => void;
    onTimeUpdate: () => void;
    onPlay: () => void;
    onPause: () => void;
    onError: () => void;
  };
  onTogglePlayback: () => void;
  currentFileMeta: {
    durationLabel: string;
    fileMeta: string;
    runtimeLabel: string;
    modelLabel: string;
    fileSizeLabel: string;
  };
  selectedProjectStats:
    | {
        duration: number;
        wordCount: number;
        segmentCount: number;
        turnCount: number;
        reviewCount: number;
        bookmarkCount: number;
        highlightCount: number;
      }
    | undefined;
  currentProjectInsightsCount: number;
  workspaceTab: WorkspaceTab;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  onSeekByDelta: (deltaSeconds: number) => void;
  onSelectAdjacentSegment: (direction: -1 | 1) => void;
  onSelectSegment: (segmentId: string) => void;
  onJumpToTranscriptMatch: (direction: -1 | 1) => void;
  onSaveSegment: (text: string) => void;
  onToggleBookmark: () => void;
  onToggleHighlight: (color: HighlightColor) => void;
  onDownloadTranscript: (format: ExportFormat) => void;
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
  onPrimeModel: () => void;
  onPrimeMedia: () => void;
  onAssignSpeakerLabel: (turnId: string, label: string) => void;
}) {
  const markMap = useMemo(() => {
    const map = new Map<string, TranscriptMark[]>();

    for (const mark of currentProjectMarks) {
      const existing = map.get(mark.segmentId) ?? [];
      existing.push(mark);
      map.set(mark.segmentId, existing);
    }

    return map;
  }, [currentProjectMarks]);

  const speakerByTurnIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const turn of transcriptTurns) {
      if (turn.speakerLabel) {
        map.set(turn.index, turn.speakerLabel);
      }
    }
    return map;
  }, [transcriptTurns]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_360px]">
        <Surface className="overflow-hidden rounded-[32px]">
          <div className="border-b border-black/8 px-6 py-5 sm:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <PanelEyebrow>Transcript workspace</PanelEyebrow>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-[#11131c]">
                  Search, scan, and seek through the session
                </div>
                <div className="mt-2 text-sm leading-6 text-[#585d59]">
                  Timestamped segments, chapters, turns, bookmarks, and grounded outputs all point back to the same source audio.
                </div>
              </div>

              <div className="w-full max-w-md relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a877f]" />
                <Input
                  ref={transcriptSearchRef}
                  value={transcriptQuery}
                  onChange={(event) => setTranscriptQuery(event.target.value)}
                  placeholder="Search inside this transcript"
                  className="h-11 rounded-2xl border-black/8 bg-white pl-10 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#585d59]">
              <Badge className="border border-black/8 bg-white text-[#232730]">
                {selectedProjectStats?.wordCount ?? 0} words
              </Badge>
              <Badge className="border border-black/8 bg-white text-[#232730]">
                {transcriptSegments.length} segments
              </Badge>
              <Badge className="border border-black/8 bg-white text-[#232730]">
                {transcriptTurns.length} turns
              </Badge>
              {selectedProjectStats ? (
                <Badge className="border border-black/8 bg-white text-[#232730]">
                  {selectedProjectStats.reviewCount} review cues
                </Badge>
              ) : null}
              {transcriptQuery.trim() ? (
                <span>{transcriptSearchResults.length} matches</span>
              ) : null}
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6">
            <TimelineOverview
              duration={selectedProjectStats?.duration ?? project.duration ?? 0}
              currentTime={currentTime}
              segments={transcriptSegments}
              turns={transcriptTurns}
              chapters={selectedProjectChapters}
              marks={currentProjectMarks}
              matchedSegmentIds={matchedSegmentIds}
              focusedSegmentId={focusedSegmentId}
              playbackSegmentId={playbackSegmentId}
              onSeek={onSelectSegment}
            />

            {transcriptQuery.trim() ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-black/8 bg-white px-4"
                  onClick={() => onJumpToTranscriptMatch(-1)}
                  disabled={transcriptSearchResults.length === 0}
                >
                  Previous match
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-black/8 bg-white px-4"
                  onClick={() => onJumpToTranscriptMatch(1)}
                  disabled={transcriptSearchResults.length === 0}
                >
                  Next match
                </Button>
              </div>
            ) : null}

            {transcriptSearchResults.length > 0 && transcriptQuery.trim() ? (
              <div className="mt-4 space-y-2 rounded-[26px] border border-black/8 bg-[#f8f3e8] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">Best matches</div>
                {transcriptSearchResults.slice(0, 5).map((result) => (
                  <button
                    key={`${result.entry.segmentId}-${result.entry.start}`}
                    type="button"
                    onClick={() => onSelectSegment(result.entry.segmentId)}
                    className={cn(
                      "w-full rounded-2xl border border-black/8 bg-white px-4 py-3 text-left",
                      INTERACTIVE,
                      "hover:border-[#1f4fff]/28 hover:bg-[#eef2ff]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm leading-6 text-[#232730]">
                        {highlightMatch(result.entry.text, transcriptQuery)}
                      </div>
                      <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
                        {formatDuration(result.entry.start)}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 max-h-[calc(100svh-18rem)] space-y-3 overflow-y-auto pr-1">
              {transcriptSegments.map((segment) => (
                <TranscriptRow
                  key={segment.id}
                  segment={segment}
                  marks={markMap.get(segment.id) ?? []}
                  speakerLabel={speakerByTurnIndex.get(segment.turnIndex)}
                  isFocused={segment.id === focusedSegmentId}
                  isPlaying={segment.id === playbackSegmentId}
                  isMatched={transcriptQuery.trim().length > 0 && matchedSegmentIds.has(segment.id)}
                  query={transcriptQuery}
                  onSelect={() => onSelectSegment(segment.id)}
                />
              ))}
            </div>
          </div>
        </Surface>

        <div className="space-y-4 xl:sticky xl:top-[5.85rem] xl:self-start">
          <PlaybackPanel
            project={project}
          mediaUrl={mediaUrl}
          isPlaying={isPlaying}
          currentTime={currentTime}
          currentFileMeta={currentFileMeta}
          activeChapter={activeChapter}
          attachMediaRef={attachMediaRef}
          mediaHandlers={mediaHandlers}
          onTogglePlayback={onTogglePlayback}
          onSeekByDelta={onSeekByDelta}
          onSelectAdjacentSegment={onSelectAdjacentSegment}
          hasTranscript
          />

          <Surface className="rounded-[28px] px-5 py-5">
            <PanelEyebrow>Selection</PanelEyebrow>
            <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">
              {focusedSegment ? "Edit the selected segment" : "Choose a segment to edit"}
            </div>
            <div className="mt-2 text-sm leading-6 text-[#585d59]">
              Autosaves stay local and preserve timestamp links for bookmarks, highlights, and grounded outputs.
            </div>

            <div className="mt-4">
              {focusedSegment ? (
                <SegmentEditor
                  segment={focusedSegment}
                  marks={markMap.get(focusedSegment.id) ?? []}
                  onSave={onSaveSegment}
                  onBookmark={onToggleBookmark}
                  onHighlight={onToggleHighlight}
                />
              ) : (
                <EmptyPanel
                  title="Pick a line from the transcript"
                  body="Selecting a segment gives you inline editing, bookmark, and highlight controls."
                  icon={TextCursorInput}
                />
              )}
            </div>
          </Surface>
        </div>
      </div>

      <Surface className="overflow-hidden rounded-[32px]">
        <div className="border-b border-black/8 px-5 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <PanelEyebrow>Workspace tools</PanelEyebrow>
              <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">
                Connected views of the same transcript
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-[24px] bg-[#f4efe4] p-1.5">
              <WorkspaceTabButton
                active={workspaceTab === "outline"}
                label={`Outline${selectedProjectChapters.length ? ` · ${selectedProjectChapters.length}` : ""}`}
                onClick={() => setWorkspaceTab("outline")}
              />
              <WorkspaceTabButton
                active={workspaceTab === "insights"}
                label={`Insights${currentProjectInsightsCount ? ` · ${currentProjectInsightsCount}` : ""}`}
                onClick={() => setWorkspaceTab("insights")}
              />
              <WorkspaceTabButton
                active={workspaceTab === "session"}
                label="Session"
                onClick={() => setWorkspaceTab("session")}
              />
            </div>
          </div>
        </div>

        <div
          key={workspaceTab}
          className="px-5 py-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
        >
          {workspaceTab === "outline" ? (
            <OutlineTab
              turns={transcriptTurns}
              focusedSegmentId={focusedSegmentId}
              selectedProjectChapters={selectedProjectChapters}
              currentProjectMarks={currentProjectMarks}
              onOpenTurn={(turn) => onSelectSegment(turn.segmentIds[0] ?? "")}
              onOpenChapter={(chapter) => onSelectSegment(chapter.segmentIds[0] ?? "")}
              onOpenMark={(mark) => onSelectSegment(mark.segmentId)}
              onAssignSpeakerLabel={onAssignSpeakerLabel}
            />
          ) : null}

          {workspaceTab === "insights" ? (
            <InsightsTab
              insights={project.transcript?.insights}
              onOpenSegment={onSelectSegment}
            />
          ) : null}

          {workspaceTab === "session" ? (
            <SessionTab
              currentFileMeta={currentFileMeta}
              selectedProjectStats={selectedProjectStats}
              currentProjectMarks={currentProjectMarks}
              onDownloadTranscript={onDownloadTranscript}
              assetSetup={assetSetup}
              onPrimeModel={onPrimeModel}
              onPrimeMedia={onPrimeMedia}
            />
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

function getProcessingHeadline(project: TranscriptProject) {
  return project.status === "queued"
    ? "Queued locally and ready to run."
    : project.status === "paused"
      ? "Processing stopped before the transcript was ready."
      : project.status === "error"
        ? "The local transcript needs another attempt."
        : project.status === "loading-model"
          ? "Loading the local model for this browser session."
          : project.status === "preparing"
            ? "Preparing the source media for speech decoding."
            : "Writing the transcript locally.";
}

function PlaybackPanel({
  project,
  mediaUrl,
  isPlaying,
  currentTime,
  currentFileMeta,
  activeChapter,
  attachMediaRef,
  mediaHandlers,
  onTogglePlayback,
  onSeekByDelta,
  onSelectAdjacentSegment,
  hasTranscript,
}: {
  project: TranscriptProject;
  mediaUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  currentFileMeta: {
    durationLabel: string;
  };
  activeChapter: TranscriptChapter | null;
  attachMediaRef: (node: HTMLAudioElement | HTMLVideoElement | null) => void;
  mediaHandlers: {
    onLoadedMetadata: () => void;
    onTimeUpdate: () => void;
    onPlay: () => void;
    onPause: () => void;
    onError: () => void;
  };
  onTogglePlayback: () => void;
  onSeekByDelta: (deltaSeconds: number) => void;
  onSelectAdjacentSegment: (direction: -1 | 1) => void;
  hasTranscript: boolean;
}) {
  return (
    <Surface className="overflow-hidden rounded-[28px]">
      <div className="border-b border-black/8 px-5 py-4">
        <PanelEyebrow>Playback</PanelEyebrow>
        <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">Source media and transport</div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 rounded-full bg-[#16181d] text-white hover:bg-[#0f1115]"
            onClick={onTogglePlayback}
            disabled={!mediaUrl}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-black/8 bg-white px-4"
            onClick={() => onSeekByDelta(-5)}
            disabled={!mediaUrl}
          >
            -5s
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-black/8 bg-white px-4"
            onClick={() => onSeekByDelta(5)}
            disabled={!mediaUrl}
          >
            +5s
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-black/8 bg-white px-4"
            onClick={() => onSelectAdjacentSegment(-1)}
            disabled={!hasTranscript}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-black/8 bg-white px-4"
            onClick={() => onSelectAdjacentSegment(1)}
            disabled={!hasTranscript}
          >
            Next
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-[#585d59]">
          <span className="font-medium text-[#171a20]">
            {formatDuration(currentTime)} / {currentFileMeta.durationLabel}
          </span>
          {activeChapter ? (
            <>
              <span className="text-[#bcb5a8]">•</span>
              <span>{activeChapter.title}</span>
            </>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[22px] border border-black/8 bg-black/5">
          {mediaUrl ? (
            project.mediaKind === "video" ? (
              <video
                ref={attachMediaRef}
                src={mediaUrl}
                controls
                className="aspect-video w-full bg-black"
                onLoadedMetadata={mediaHandlers.onLoadedMetadata}
                onTimeUpdate={mediaHandlers.onTimeUpdate}
                onPlay={mediaHandlers.onPlay}
                onPause={mediaHandlers.onPause}
                onError={mediaHandlers.onError}
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
                  onError={mediaHandlers.onError}
                />
              </div>
            )
          ) : (
            <div className="flex min-h-[180px] items-center justify-center px-6 py-8 text-center text-sm leading-6 text-[#585d59]">
              The source file is saved locally and will appear here when the browser finishes loading it.
            </div>
          )}
        </div>
      </div>
    </Surface>
  );
}

function PipelineSteps({
  project,
}: {
  project: TranscriptProject;
}) {
  const currentRank = getProjectRank(project);

  return (
    <div className="grid gap-2 md:grid-cols-5">
      {PIPELINE_STEPS.map((step, index) => {
        const complete = project.status === "ready" ? true : index < currentRank;
        const current = project.status !== "ready" && index === currentRank;

        return (
          <div
            key={step.key}
            className={cn(
              "rounded-[22px] border px-4 py-3",
              complete
                ? "border-[#b8dbc3] bg-[#ebfff0]"
                : current
                  ? project.status === "error"
                    ? "border-[#f3b3b3] bg-[#fff0ef]"
                    : project.status === "paused"
                      ? "border-[#f3d9ad] bg-[#fff6e7]"
                      : "border-[#c6d5ff] bg-[#eef2ff]"
                  : "border-black/8 bg-white",
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6d6a61]">{step.label}</div>
            <div className="mt-1 text-sm text-[#171a20]">
              {complete
                ? "Done"
                : current
                  ? project.status === "error"
                    ? "Needs retry"
                    : project.status === "paused"
                      ? "Stopped"
                      : "Current"
                  : "Waiting"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OutlineTab({
  turns,
  focusedSegmentId,
  selectedProjectChapters,
  currentProjectMarks,
  onOpenTurn,
  onOpenChapter,
  onOpenMark,
  onAssignSpeakerLabel,
}: {
  turns: TranscriptTurn[];
  focusedSegmentId: string | null;
  selectedProjectChapters: TranscriptChapter[];
  currentProjectMarks: TranscriptMark[];
  onOpenTurn: (turn: TranscriptTurn) => void;
  onOpenChapter: (chapter: TranscriptChapter) => void;
  onOpenMark: (mark: TranscriptMark) => void;
  onAssignSpeakerLabel: (turnId: string, label: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_340px]">
      <div className="space-y-5">
        <div>
          <div className="text-sm font-medium text-[#171a20]">Chapters</div>
          <div className="mt-1 text-sm leading-6 text-[#585d59]">
            Outline sections segment the transcript into reusable navigation anchors.
          </div>
          <div className="mt-4 space-y-3">
            {selectedProjectChapters.length > 0 ? (
              selectedProjectChapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => onOpenChapter(chapter)}
                  className={cn(
                    "w-full rounded-[24px] border border-black/8 bg-white px-4 py-4 text-left",
                    INTERACTIVE,
                    "hover:border-[#1f4fff]/28 hover:bg-[#eef2ff]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[#171a20]">{chapter.title}</div>
                      <div className="mt-2 text-sm leading-6 text-[#585d59]">{chapter.summary}</div>
                    </div>
                    <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
                      {formatDuration(chapter.start)}
                    </Badge>
                  </div>
                </button>
              ))
            ) : (
              <EmptyPanel title="No chapter outline yet" body="Chapters appear automatically once the transcript is ready." />
            )}
          </div>
        </div>

        <TurnMap turns={turns} focusedSegmentId={focusedSegmentId} onOpenTurn={onOpenTurn} onAssignSpeakerLabel={onAssignSpeakerLabel} />
      </div>

      <div>
        <div className="text-sm font-medium text-[#171a20]">Saved moments</div>
        <div className="mt-1 text-sm leading-6 text-[#585d59]">
          Bookmarks and highlights keep reusable evidence attached to exact transcript spans.
        </div>
        <div className="mt-4 space-y-3">
          {currentProjectMarks.length > 0 ? (
            currentProjectMarks.map((mark) => (
              <button
                key={mark.id}
                type="button"
                onClick={() => onOpenMark(mark)}
                className={cn(
                  "w-full rounded-[24px] border border-black/8 bg-white px-4 py-4 text-left",
                  INTERACTIVE,
                  "hover:border-[#1f4fff]/28 hover:bg-[#eef2ff]",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-[#171a20]">{mark.label}</div>
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
                      {mark.kind}
                      {mark.color ? ` • ${mark.color}` : ""}
                    </div>
                  </div>
                  <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">{mark.kind}</Badge>
                </div>
              </button>
            ))
          ) : (
            <EmptyPanel title="Nothing saved yet" body="Bookmarks and highlights make this session easier to revisit later." />
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsTab({
  insights,
  onOpenSegment,
}: {
  insights: TranscriptInsights | undefined;
  onOpenSegment: (segmentId: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_320px]">
      <div className="space-y-5">
        <InsightList
          icon={Sparkles}
          title="Summary"
          items={
            insights?.summary.map((item) => ({
              id: item.id,
              label: item.text,
              meta: formatDuration(item.reference.start),
              onOpen: () => onOpenSegment(item.reference.segmentId),
            })) ?? []
          }
        />
        <InsightList
          icon={ListTodo}
          title="Action items"
          items={
            insights?.actions.map((item) => ({
              id: item.id,
              label: item.text,
              meta: item.dueLabel ? `${item.dueLabel} • ${formatDuration(item.reference.start)}` : formatDuration(item.reference.start),
              onOpen: () => onOpenSegment(item.reference.segmentId),
            })) ?? []
          }
        />
        <InsightList
          icon={MessageSquareText}
          title="Questions"
          items={
            insights?.questions.map((item) => ({
              id: item.id,
              label: item.text,
              meta: formatDuration(item.reference.start),
              onOpen: () => onOpenSegment(item.reference.segmentId),
            })) ?? []
          }
        />
        <InsightList
          icon={Calendar}
          title="Dates and deadlines"
          items={
            insights?.dates.map((item) => ({
              id: item.id,
              label: item.label,
              meta: item.normalizedDate ? `${item.normalizedDate} • ${formatDuration(item.reference.start)}` : formatDuration(item.reference.start),
              onOpen: () => onOpenSegment(item.reference.segmentId),
            })) ?? []
          }
        />
      </div>

      <div className="space-y-5">
        <InsightList
          icon={FileAudio}
          title="Key moments"
          items={
            insights?.keyMoments.map((item) => ({
              id: item.id,
              label: item.title,
              meta: `${item.reason} • ${formatDuration(item.reference.start)}`,
              onOpen: () => onOpenSegment(item.reference.segmentId),
            })) ?? []
          }
        />
        <InsightList
          icon={AlertTriangle}
          title="Review cues"
          items={
            insights?.reviewCues.map((item) => ({
              id: item.id,
              label: item.reason,
              meta: `${item.severity} • ${formatDuration(item.reference.start)}`,
              onOpen: () => onOpenSegment(item.reference.segmentId),
            })) ?? []
          }
        />
        <InsightTagSection
          title="Entities"
          tags={
            insights?.entities.map((item) => ({
              id: item.id,
              label: `${item.label} • ${item.kind}`,
              onOpen: () => onOpenSegment(item.references[0]?.segmentId ?? ""),
            })) ?? []
          }
        />
        <InsightTagSection
          title="Glossary"
          tags={
            insights?.glossary.map((item) => ({
              id: item.id,
              label: `${item.term} • ${item.count}x`,
              onOpen: () => onOpenSegment(item.references[0]?.segmentId ?? ""),
            })) ?? []
          }
        />
      </div>
    </div>
  );
}

function SessionTab({
  currentFileMeta,
  selectedProjectStats,
  currentProjectMarks,
  onDownloadTranscript,
  assetSetup,
  onPrimeModel,
  onPrimeMedia,
}: {
  currentFileMeta: {
    fileMeta: string;
    durationLabel: string;
    runtimeLabel: string;
    modelLabel: string;
    fileSizeLabel: string;
  };
  selectedProjectStats:
    | {
        wordCount: number;
        segmentCount: number;
        turnCount: number;
        bookmarkCount: number;
        highlightCount: number;
        reviewCount: number;
      }
    | undefined;
  currentProjectMarks: TranscriptMark[];
  onDownloadTranscript: (format: ExportFormat) => void;
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
  onPrimeModel: () => void;
  onPrimeMedia: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_340px]">
      <div className="space-y-5">
        <div>
          <div className="text-sm font-medium text-[#171a20]">Session details</div>
          <div className="mt-1 text-sm leading-6 text-[#585d59]">
            The source media, transcript, edits, and workspace state stay in this browser unless you remove them.
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SessionStat label="File" value={currentFileMeta.fileMeta} />
            <SessionStat label="Size" value={currentFileMeta.fileSizeLabel} />
            <SessionStat label="Duration" value={currentFileMeta.durationLabel} />
            <SessionStat label="Runtime" value={currentFileMeta.runtimeLabel} />
            <SessionStat label="Model" value={currentFileMeta.modelLabel} />
            <SessionStat label="Saved marks" value={String(currentProjectMarks.length)} />
            <SessionStat label="Words" value={String(selectedProjectStats?.wordCount ?? 0)} />
            <SessionStat label="Review cues" value={String(selectedProjectStats?.reviewCount ?? 0)} />
          </div>
        </div>

        <div className="rounded-[28px] border border-black/8 bg-[#f8f3e8] p-5">
          <div className="text-sm font-medium text-[#171a20]">Export working files</div>
          <div className="mt-2 text-sm leading-6 text-[#585d59]">
            Export plain text, markdown notes, or caption files directly from this local workspace.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXPORT_FORMATS.map((format) => (
              <Button
                key={format}
                variant="outline"
                className="rounded-full border-black/8 bg-white px-4 uppercase tracking-[0.18em]"
                onClick={() => onDownloadTranscript(format)}
              >
                <Download className="mr-2 h-4 w-4" />
                {format}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <SetupChecklist
          assetSetup={assetSetup}
          onPrimeModel={onPrimeModel}
          onPrimeMedia={onPrimeMedia}
        />

        <Surface className="rounded-[28px] px-5 py-5">
          <PanelEyebrow>Keyboard</PanelEyebrow>
          <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">Fast navigation</div>
          <div className="mt-4 space-y-3">
            <Shortcut hint="Search transcript" keys={["/"]} />
            <Shortcut hint="Search library" keys={["Cmd/Ctrl", "K"]} />
            <Shortcut hint="Play or pause" keys={["Space"]} />
            <Shortcut hint="Bookmark selection" keys={["B"]} />
            <Shortcut hint="Next or previous segment" keys={["J", "K"]} />
          </div>
        </Surface>
      </div>
    </div>
  );
}

function SignalChip({
  icon: Icon,
  title,
  body,
  tone = "default",
  className,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
  tone?: "default" | "success";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[26px] border px-4 py-3",
        tone === "success" ? "border-[#2a5b37] bg-[#173221]" : "border-white/10 bg-white/6",
        className,
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px]",
          tone === "success" ? "bg-white/10 text-[#9df0b1]" : "bg-white/8 text-white/74",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white">{title}</div>
        <div className="mt-1 text-sm leading-5 text-white/62">{body}</div>
      </div>
    </div>
  );
}

function MiniSignal({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon?: typeof Cpu;
  label: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm",
        tone === "success"
          ? "border-[#2f5f38] bg-[#173321] text-[#bdf7c5]"
          : tone === "warning"
            ? "border-[#6b4a1c] bg-[#332515] text-[#f6d49a]"
            : "border-white/10 bg-white/6 text-white/72",
      )}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{label}</span>
    </div>
  );
}

function Surface({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-[#faf7f1] shadow-[0_18px_60px_rgba(30,35,45,0.08)] ring-1 ring-black/8",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6d6a61]">{children}</div>;
}

function SectionHeading({
  icon: Icon,
  title,
  meta,
}: {
  icon: typeof Search;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6d6a61]">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      {meta ? <div className="text-xs text-[#7a756d]">{meta}</div> : null}
    </div>
  );
}

function SummaryPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]",
        tone === "warning" ? "border-[#ecd8aa] bg-[#fff6e7] text-[#7d5e12]" : "border-black/8 bg-white text-[#66645f]",
      )}
    >
      <span>{label}</span>
      <span className="text-[#171a20]">{value}</span>
    </div>
  );
}

function LibrarySection({
  title,
  meta,
  icon: Icon,
  children,
}: {
  title: string;
  meta?: string;
  icon: typeof Search;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SectionHeading icon={Icon} title={title} meta={meta} />
      {children}
    </section>
  );
}

function ProjectListItem({
  project,
  selected,
  currentWorker = false,
  onOpen,
  onCancel,
  onRetry,
  onDelete,
}: {
  project: TranscriptProject;
  selected: boolean;
  currentWorker?: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const actionableRetry = project.status === "error" || project.status === "paused";
  const actionableCancel = project.status === "queued" || isProjectRunning(project.status);

  return (
    <div
      className={cn(
        "rounded-[26px] border px-4 py-4",
        INTERACTIVE,
        selected ? "border-[#1f4fff]/28 bg-[#eef2ff]" : "border-black/8 bg-white hover:border-[#1f4fff]/18 hover:bg-[#f8fbff]",
      )}
    >
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate font-medium text-[#171a20]">{project.title}</div>
              {currentWorker ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1d3bb8]">
                  <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  Live
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-[#5a5f5b]">
              {project.mediaKind === "video" ? <Video className="h-4 w-4" /> : <FileAudio className="h-4 w-4" />}
              <span className="truncate">{project.sourceName}</span>
            </div>
          </div>
          <StatusPill status={project.status} label={statusLabel(project)} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
          <span>{project.stageLabel}</span>
          <span>•</span>
          <span>{formatUpdatedAt(project.updatedAt)}</span>
        </div>

        {project.status === "ready" && project.transcript ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
              {project.transcript.stats.wordCount} words
            </Badge>
            <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
              {project.transcript.stats.bookmarkCount + project.transcript.stats.highlightCount} saved marks
            </Badge>
          </div>
        ) : (
          <div className="mt-3">
            <Progress
              value={project.status === "queued" ? 4 : project.progress}
              className="h-1.5 bg-black/8 [&>div]:bg-[#1f4fff]"
            />
            <div className="mt-2 text-sm leading-6 text-[#5a5f5b]">{project.detail}</div>
          </div>
        )}
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        {actionableCancel ? (
          <Button variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={onCancel}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            {project.status === "queued" ? "Hold" : "Stop"}
          </Button>
        ) : null}
        {actionableRetry ? (
          <Button variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={onRetry}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Retry
          </Button>
        ) : null}
        <Button variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Remove
        </Button>
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
      className={cn(
        "w-full rounded-[24px] border px-4 py-4 text-left",
        INTERACTIVE,
        isActive ? "border-[#1f4fff]/28 bg-[#eef2ff]" : "border-black/8 bg-white hover:border-[#1f4fff]/18 hover:bg-[#f8fbff]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-[#171a20]">{result.projectTitle}</div>
          <div className="mt-2 text-sm leading-6 text-[#232730]">
            {result.matchKind === "title" ? "Project title match" : result.entry.text}
          </div>
        </div>
        <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
          {result.matchKind === "title" ? "title" : formatDuration(result.entry.start)}
        </Badge>
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
        {result.matchKind} match • score {result.score} • {formatUpdatedAt(result.projectUpdatedAt)}
      </div>
    </button>
  );
}

function QueueLine({
  title,
  meta,
  active = false,
}: {
  title: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-4 py-3",
        active ? "border-[#c6d5ff] bg-[#eef2ff]" : "border-black/8 bg-white",
      )}
    >
      <div className="font-medium text-[#171a20]">{title}</div>
      <div className="mt-1 text-sm text-[#585d59]">{meta}</div>
    </div>
  );
}

function WorkspaceTabButton({
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
      className={cn(
        "rounded-[18px] px-4 py-2.5 text-sm font-medium",
        INTERACTIVE,
        active
          ? "bg-[#16181d] text-white shadow-[0_12px_24px_rgba(22,24,29,0.16)]"
          : "text-[#232730] hover:bg-white",
      )}
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
      <div className="rounded-[24px] border border-black/8 bg-white px-4 py-4 text-sm text-[#585d59]">
        The session map appears once timestamped segments are available.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-[#11141d] bg-[#12151d] px-5 py-5 text-white shadow-[0_18px_50px_rgba(18,21,29,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/44">Session map</div>
          <div className="mt-1 text-base font-semibold tracking-tight">
            Playback, chapters, turns, matches, and saved moments in one strip
          </div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-white/44">
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
        <SpeechDensityWaveform segments={segments} duration={safeDuration} />
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            className={cn("absolute inset-y-3 rounded-2xl", index % 2 === 0 ? "bg-[#2f394c]/60" : "bg-[#212835]/65")}
            style={{
              left: `${(chapter.start / safeDuration) * 100}%`,
              width: `${Math.max(((chapter.end - chapter.start) / safeDuration) * 100, 3)}%`,
            }}
          />
        ))}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className="absolute inset-y-0 w-px bg-white/14"
            style={{ left: `${(turn.start / safeDuration) * 100}%` }}
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
              className={cn(
                "absolute bottom-1 h-2 w-2 rounded-full",
                mark.kind === "bookmark"
                  ? "bg-[#f8d66d]"
                  : mark.color === "rose"
                    ? "bg-[#ff97b3]"
                    : mark.color === "sky"
                      ? "bg-[#86c7ff]"
                      : "bg-[#ffd670]",
              )}
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
        <TimelineLegend colorClass="bg-[#f8d66d]" label="matches and bookmarks" />
        <TimelineLegend colorClass="bg-white/25" label="turns" />
      </div>
    </div>
  );
}

function SpeechDensityWaveform({
  segments,
  duration,
}: {
  segments: TranscriptSegment[];
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !duration || segments.length === 0) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const bucketCount = Math.min(width, 200);
    const bucketSize = duration / bucketCount;
    const densities = new Float32Array(bucketCount);

    for (const segment of segments) {
      const wpm = segment.end > segment.start
        ? segment.wordCount / ((segment.end - segment.start) / 60)
        : 0;
      const startBucket = Math.floor(segment.start / bucketSize);
      const endBucket = Math.min(Math.floor(segment.end / bucketSize), bucketCount - 1);
      for (let i = startBucket; i <= endBucket; i++) {
        densities[i] = Math.max(densities[i], wpm);
      }
    }

    const maxDensity = Math.max(...densities, 1);
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / bucketCount;
    const midY = height / 2;

    for (let i = 0; i < bucketCount; i++) {
      const ratio = densities[i] / maxDensity;
      const barHeight = Math.max(ratio * midY * 0.85, ratio > 0 ? 1 : 0);
      const x = i * barWidth;

      ctx.fillStyle = `rgba(95, 139, 255, ${0.15 + ratio * 0.35})`;
      ctx.fillRect(x, midY - barHeight, barWidth - 0.5, barHeight * 2);
    }
  }, [segments, duration]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={96}
      className="absolute inset-0 h-full w-full"
      style={{ imageRendering: "pixelated" }}
    />
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
      <span className={cn("block h-2.5 w-2.5 rounded-full", colorClass)} />
      <span>{label}</span>
    </div>
  );
}

function TurnMap({
  turns,
  focusedSegmentId,
  onOpenTurn,
  onAssignSpeakerLabel,
}: {
  turns: TranscriptTurn[];
  focusedSegmentId: string | null;
  onOpenTurn: (turn: TranscriptTurn) => void;
  onAssignSpeakerLabel: (turnId: string, label: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-[#171a20]">Turns</div>
      <div className="text-sm leading-6 text-[#585d59]">
        Pause-derived turns provide a stable review structure and a clean future hook for speaker attribution.
      </div>
      <div className="space-y-3">
        {turns.length > 0 ? (
          turns.map((turn) => (
            <TurnCard
              key={turn.id}
              turn={turn}
              isFocused={Boolean(focusedSegmentId && turn.segmentIds.includes(focusedSegmentId))}
              onOpen={() => onOpenTurn(turn)}
              onAssignSpeaker={(label) => onAssignSpeakerLabel(turn.id, label)}
            />
          ))
        ) : (
          <EmptyPanel title="No turn map yet" body="Turns appear automatically once timestamped segments are ready." />
        )}
      </div>
    </div>
  );
}

function TurnCard({
  turn,
  isFocused,
  onOpen,
  onAssignSpeaker,
}: {
  turn: TranscriptTurn;
  isFocused: boolean;
  onOpen: () => void;
  onAssignSpeaker: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(turn.speakerLabel ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(turn.speakerLabel ?? "");
  }, [turn.speakerLabel]);

  const commitLabel = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed !== (turn.speakerLabel ?? "")) {
      onAssignSpeaker(trimmed);
    }
    setEditing(false);
  }, [draft, onAssignSpeaker, turn.speakerLabel]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  return (
    <div
      className={cn(
        "rounded-[24px] border px-4 py-4",
        isFocused
          ? "border-[#1f4fff]/28 bg-[#eef2ff]"
          : "border-black/8 bg-white hover:border-[#1f4fff]/18 hover:bg-[#f8fbff]",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn("w-full text-left", INTERACTIVE)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#171a20]">Turn {turn.index + 1}</span>
            {turn.speakerLabel ? (
              <Badge className="border border-[#c6d5ff] bg-[#eef2ff] text-[#1d3bb8]">
                {turn.speakerLabel}
              </Badge>
            ) : null}
          </div>
          <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
            {formatDuration(turn.start)}-{formatDuration(turn.end)}
          </Badge>
        </div>
        <div className="mt-2 text-sm text-[#585d59]">
          {turn.segmentIds.length} segments • {turn.wordCount} words • {turn.attribution}
        </div>
      </button>
      <div className="mt-3 flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitLabel();
              }
              if (event.key === "Escape") {
                setDraft(turn.speakerLabel ?? "");
                setEditing(false);
              }
            }}
            placeholder="Speaker name"
            className="h-8 w-full max-w-[200px] rounded-xl border border-black/8 bg-white px-3 text-sm text-[#232730] outline-none focus:border-[#1f4fff]/32 focus:ring-2 focus:ring-[#1f4fff]/14"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-dashed border-black/12 px-3 py-1 text-xs text-[#6d6a61] transition hover:border-[#1f4fff]/28 hover:bg-[#eef2ff] hover:text-[#1d3bb8]"
          >
            {turn.speakerLabel ? `Speaker: ${turn.speakerLabel}` : "Assign speaker"}
          </button>
        )}
      </div>
    </div>
  );
}

function TranscriptRow({
  segment,
  marks,
  speakerLabel,
  isFocused,
  isPlaying,
  isMatched,
  query,
  onSelect,
}: {
  segment: TranscriptSegment;
  marks: TranscriptMark[];
  speakerLabel?: string;
  isFocused: boolean;
  isPlaying: boolean;
  isMatched: boolean;
  query: string;
  onSelect: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if ((isFocused || isPlaying) && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isFocused, isPlaying]);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-[26px] border px-4 py-4 text-left",
        INTERACTIVE,
        isFocused
          ? "border-[#1f4fff]/28 bg-[#eef2ff] shadow-[0_12px_24px_rgba(31,79,255,0.08)]"
          : isPlaying
            ? "border-[#15181d]/12 bg-[#f4efe4]"
            : "border-black/8 bg-white hover:border-[#1f4fff]/18 hover:bg-[#f8fbff]",
      )}
      style={{ contentVisibility: "auto" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">{formatDuration(segment.start)}</Badge>
          <Badge className="border border-black/8 bg-white text-[#232730]">
            {speakerLabel ? speakerLabel : `turn ${segment.turnIndex + 1}`}
          </Badge>
          {marks.map((mark) => (
            <Badge
              key={mark.id}
              className={cn(
                "border",
                mark.kind === "bookmark"
                  ? "border-[#d9c17b] bg-[#fff5d6] text-[#7e5b00]"
                  : mark.color === "rose"
                    ? "border-[#f3b1bc] bg-[#fff0f3] text-[#9a2340]"
                    : mark.color === "sky"
                      ? "border-[#b4d6ff] bg-[#eef7ff] text-[#174d97]"
                      : "border-[#ebd37c] bg-[#fff8dd] text-[#7d6200]",
              )}
            >
              {mark.kind}
            </Badge>
          ))}
          {segment.reviewReasons.length > 0 ? (
            <Badge className="border border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]">review</Badge>
          ) : null}
          {isMatched ? <Badge className="border border-[#c6d5ff] bg-[#eef2ff] text-[#1d3bb8]">match</Badge> : null}
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
  onSave,
  onBookmark,
  onHighlight,
}: {
  segment: TranscriptSegment;
  marks: TranscriptMark[];
  onSave: (text: string) => void;
  onBookmark: () => void;
  onHighlight: (color: HighlightColor) => void;
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
        <Badge className="border border-black/8 bg-[#f8f3e8] text-[#232730]">
          {formatDuration(segment.start)} to {formatDuration(segment.end)}
        </Badge>
        {marks.length > 0 ? (
          marks.map((mark) => (
            <Badge key={mark.id} className="border border-black/8 bg-white text-[#232730]">
              {mark.label}
            </Badge>
          ))
        ) : (
          <Badge className="border border-black/8 bg-white text-[#232730]">Unsaved segment</Badge>
        )}
      </div>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-[180px] w-full rounded-[24px] border border-black/8 bg-white px-4 py-4 text-sm leading-7 text-[#232730] outline-none transition focus:border-[#1f4fff]/32 focus:ring-2 focus:ring-[#1f4fff]/14 motion-reduce:transition-none"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">
        <span>Autosaves after a short pause</span>
        <span>{draftWordCount} words</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-full border-black/8 bg-white px-4" onClick={onBookmark}>
          <Bookmark className="mr-2 h-4 w-4" />
          Toggle bookmark
        </Button>
        <Button variant="outline" className="rounded-full border-black/8 bg-white px-4" onClick={() => onHighlight("amber")}>
          <Highlighter className="mr-2 h-4 w-4 text-[#c58b00]" />
          Amber
        </Button>
        <Button variant="outline" className="rounded-full border-black/8 bg-white px-4" onClick={() => onHighlight("sky")}>
          <Highlighter className="mr-2 h-4 w-4 text-[#1d64c9]" />
          Sky
        </Button>
        <Button variant="outline" className="rounded-full border-black/8 bg-white px-4" onClick={() => onHighlight("rose")}>
          <Highlighter className="mr-2 h-4 w-4 text-[#b42358]" />
          Rose
        </Button>
      </div>

      {segment.reviewReasons.length > 0 ? (
        <div className="rounded-[24px] border border-[#f3b3b3] bg-[#fff0ef] p-4 text-sm text-[#7c2626]">
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

function SetupChecklist({
  assetSetup,
  onPrimeModel,
  onPrimeMedia,
  onPrimeWorkspaceSetup,
  compact = false,
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
  onPrimeModel: () => void;
  onPrimeMedia: () => void;
  onPrimeWorkspaceSetup?: () => void;
  compact?: boolean;
}) {
  const busy = assetSetup.warmingModel || assetSetup.warmingMedia;

  return (
    <Surface className="rounded-[28px] px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <PanelEyebrow>Local setup</PanelEyebrow>
          <div className="mt-1 text-xl font-semibold tracking-tight text-[#11131c]">Prime this browser for offline reuse</div>
        </div>
        <Badge
          className={cn(
            "border",
            assetSetup.online
              ? "border-[#c6d5ff] bg-[#eef2ff] text-[#1d3bb8]"
              : "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]",
          )}
        >
          {assetSetup.online ? "Online" : "Offline"}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <SetupRow
          title="Transcription model"
          description={
            assetSetup.modelReady
              ? `Primed${assetSetup.modelPrimedAt ? ` on ${new Date(assetSetup.modelPrimedAt).toLocaleString()}` : ""}.`
              : "Needed once per browser profile before reliable offline use."
          }
          ready={assetSetup.modelReady}
          loading={assetSetup.warmingModel}
          disabled={busy}
          buttonLabel="Prime model"
          onClick={onPrimeModel}
        />
        <SetupRow
          title="Media runtime"
          description={
            assetSetup.mediaReady
              ? `Primed${assetSetup.mediaPrimedAt ? ` on ${new Date(assetSetup.mediaPrimedAt).toLocaleString()}` : ""}.`
              : "Warms the video extraction and decode fallback runtime used for media preparation."
          }
          ready={assetSetup.mediaReady}
          loading={assetSetup.warmingMedia}
          disabled={busy}
          buttonLabel="Prime media"
          onClick={onPrimeMedia}
        />
      </div>

      {assetSetup.lastError ? (
        <div className="mt-4 rounded-[22px] border border-[#f3b3b3] bg-[#fff0ef] px-4 py-3 text-sm text-[#7c2626]">
          {assetSetup.lastError}
        </div>
      ) : null}

      {!compact && onPrimeWorkspaceSetup ? (
        <div className="mt-4">
          <Button
            variant="outline"
            className="rounded-full border-black/8 bg-white px-4"
            onClick={onPrimeWorkspaceSetup}
            disabled={busy || !assetSetup.online}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Prime both
          </Button>
        </div>
      ) : null}
    </Surface>
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
    <div className="flex flex-col gap-3 rounded-[24px] border border-black/8 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 font-medium text-[#171a20]">
          <span>{title}</span>
          {ready ? <CheckCircle2 className="h-4 w-4 text-[#17643b]" /> : null}
        </div>
        <div className="mt-1 text-sm leading-6 text-[#585d59]">{description}</div>
      </div>
      <Button variant="outline" className="rounded-full border-black/8 bg-white px-4" onClick={onClick} disabled={disabled}>
        {loading ? "Priming…" : ready ? "Refresh cache" : buttonLabel}
      </Button>
    </div>
  );
}

function NoticeBanner({
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
      className={cn(
        "rounded-[24px] border px-4 py-3 text-sm",
        tone === "error" ? "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]" : "border-[#c6d5ff] bg-[#eef2ff] text-[#1d3bb8]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>{body}</div>
        <button type="button" onClick={onDismiss} className="shrink-0 text-current/60 transition hover:text-current">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ValuePanel({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Search;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[26px] border border-black/8 bg-white px-4 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#eef2ff] text-[#1f4fff]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 text-lg font-semibold tracking-tight text-[#171a20]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[#585d59]">{body}</div>
    </div>
  );
}

function ChecklistRow({
  title,
  ready,
}: {
  title: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-black/8 bg-white px-4 py-3">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          ready ? "bg-[#ebfff0] text-[#17643b]" : "bg-[#eef2ff] text-[#1f4fff]",
        )}
      >
        {ready ? <CheckCircle2 className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-[#171a20]">{title}</div>
        <div className="text-sm text-[#585d59]">{ready ? "Cached locally" : "Needs first-run fetch"}</div>
      </div>
    </div>
  );
}

function LockedWorkspaceCard({
  title,
  body,
  meta = [],
}: {
  title: string;
  body: string;
  meta?: string[];
}) {
  return (
    <div className="rounded-[28px] border border-black/8 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[#eef2ff] text-[#1f4fff]">
          <LockKeyhole className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-[#171a20]">{title}</div>
          <div className="mt-2 text-sm leading-6 text-[#585d59]">{body}</div>
          {meta.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {meta.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-black/8 bg-[#f8f3e8] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6d6a61]"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
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
      className={cn(
        "rounded-[24px] border border-dashed border-black/10 bg-[#f8f3e8] text-sm text-[#585d59]",
        compact ? "px-4 py-4" : "px-4 py-5",
      )}
    >
      <div className={cn("flex gap-3", compact ? "items-start" : "items-center")}>
        <div
          className={cn(
            "flex items-center justify-center rounded-[18px] border border-black/8 bg-white",
            compact ? "h-9 w-9" : "h-10 w-10",
          )}
        >
          <Icon className="h-4 w-4 text-[#2b2d35]" />
        </div>
        <div>
          <div className="font-medium text-[#171a20]">{title}</div>
          <div className={cn("mt-1 text-pretty leading-6", compact ? "text-sm" : "")}>{body}</div>
        </div>
      </div>
    </div>
  );
}

function SessionStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6d6a61]">{label}</div>
      <div className="mt-2 text-sm leading-6 text-[#232730]">{value}</div>
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
      <span className="text-sm text-[#232730]">{hint}</span>
      <div className="flex items-center gap-1">
        {keys.map((key) => (
          <span
            key={key}
            className="rounded-md border border-black/8 bg-[#f8f3e8] px-2 py-1 font-mono text-xs text-[#171a20]"
          >
            {key}
          </span>
        ))}
      </div>
    </div>
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
    <div>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6d6a61]">
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
              className={cn(
                "w-full rounded-[22px] border border-black/8 bg-white px-4 py-3 text-left",
                INTERACTIVE,
                "hover:border-[#1f4fff]/18 hover:bg-[#eef2ff]",
              )}
            >
              <div className="text-sm leading-6 text-[#232730]">{item.label}</div>
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6d6a61]">{item.meta}</div>
            </button>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-black/10 px-4 py-4 text-sm text-[#767269]">
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
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6d6a61]">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={tag.onOpen}
              className={cn(
                "rounded-full border border-black/8 bg-white px-3 py-2 text-sm text-[#232730]",
                INTERACTIVE,
                "hover:border-[#1f4fff]/18 hover:bg-[#eef2ff]",
              )}
            >
              {tag.label}
            </button>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-black/10 px-4 py-4 text-sm text-[#767269]">
            No tags detected yet.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  status,
  label,
}: {
  status: TranscriptProject["status"];
  label?: string;
}) {
  const classes =
    status === "ready"
      ? "border-[#b7dbc4] bg-[#ebfff0] text-[#17643b]"
      : status === "error"
        ? "border-[#f3b3b3] bg-[#fff0ef] text-[#7c2626]"
        : status === "paused"
          ? "border-[#ecd8aa] bg-[#fff6e7] text-[#7d5e12]"
          : status === "queued"
            ? "border-black/8 bg-white text-[#232730]"
            : "border-[#c6d5ff] bg-[#eef2ff] text-[#1d3bb8]";

  return <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]", classes)}>{label ?? statusLabel({ status } as TranscriptProject)}</span>;
}

function statusLabel(project: Pick<TranscriptProject, "status">) {
  return project.status === "ready"
    ? "Ready"
    : project.status === "error"
      ? "Error"
      : project.status === "paused"
        ? "Held"
        : project.status === "queued"
          ? "Queued"
          : "Working";
}

function isProjectRunning(status: TranscriptProject["status"]) {
  return status === "preparing" || status === "loading-model" || status === "transcribing";
}

function getProjectRank(project: TranscriptProject) {
  if (project.status === "ready") {
    return 4;
  }

  if (project.status === "transcribing") {
    return 3;
  }

  if (project.status === "loading-model") {
    return 2;
  }

  if (project.status === "preparing") {
    return 1;
  }

  if ((project.status === "paused" || project.status === "error") && project.progress >= 60) {
    return 3;
  }

  if ((project.status === "paused" || project.status === "error") && project.progress >= 26) {
    return 2;
  }

  if ((project.status === "paused" || project.status === "error") && project.progress >= 8) {
    return 1;
  }

  return 0;
}

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
