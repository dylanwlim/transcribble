"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Menu, Settings2, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranscribble } from "@/hooks/use-transcribble";
import {
  ADD_RECORDING_LABEL,
  SETTINGS_OPEN_LABEL,
  SUPPORTED_FORMAT_LABELS,
} from "@/lib/transcribble/constants";
import { formatShortcutTitle } from "@/lib/transcribble/shortcuts";
import { getProjectViewState } from "@/lib/transcribble/status";
import { formatBytes } from "@/lib/transcribble/transcript";
import type { HighlightColor } from "@/lib/transcribble/types";

import { CommandPalette } from "@/components/workspace/command-palette";
import { DropOverlay, EmptyState } from "@/components/workspace/empty-state";
import { ExportSheet } from "@/components/workspace/export-sheet";
import { Inspector } from "@/components/workspace/inspector";
import { SettingsSheet } from "@/components/workspace/settings-sheet";
import { Sidebar } from "@/components/workspace/sidebar";
import { Stage } from "@/components/workspace/stage";

export function TranscribbleApp() {
  const t = useTranscribble();

  const {
    inputRef,
    mediaRef,
    transcriptSearchRef,
    librarySearchRef,
    projects,
    selectedProject,
    transcriptSegments,
    transcriptTurns,
    partialTranscript,
    mediaUrl,
    currentTime,
    isPlaying,
    currentProjectMarks,
    currentProjectRanges,
    focusedSegmentId,
    playbackSegmentId,
    transcriptSearchResults,
    librarySearchResults,
    libraryQuery,
    transcriptQuery,
    capabilityIssue,
    assetSetup,
    storageState,
    helperCapabilities,
    helperPreferences,
    installState,
    dragActive,
    copied,
    notice,
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
    seekToTime,
    updateSelectedSegmentText,
    revertSegmentText,
    renameProject,
    togglePinProject,
    reorderProjects,
    toggleRecording,
    isRecording,
    toggleBookmark,
    toggleHighlight,
    bookmarkSegment,
    saveRange,
    removeSavedRange,
    primeTranscriptionModel,
    primeMediaRuntime,
    askForPersistentStorage,
    resetSetupState,
    promptInstall,
    refreshHelperCapabilities,
    updateHelperAlignment,
    updateHelperDiarization,
    updateHelperModelProfile,
    updateHelperPhraseHints,
    retryProject,
    removeProject,
    openLibrarySearchResult,
    setLibraryQuery,
    setTranscriptQuery,
    setNotice,
    mediaHandlers,
  } = t;

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = () => setPaletteOpen(true);
    window.addEventListener("transcribble:command-palette", handler);
    return () => window.removeEventListener("transcribble:command-palette", handler);
  }, []);

  const matchedSegmentIds = useMemo(
    () =>
      new Set(
        transcriptSearchResults
          .map((result) => result.entry.segmentId)
          .filter((value): value is string => Boolean(value)),
      ),
    [transcriptSearchResults],
  );

  const selectedProjectView = selectedProject
    ? getProjectViewState(selectedProject)
    : null;

  const setupReady = assetSetup.modelReady && assetSetup.mediaReady;
  const effectiveOnline = workspaceReady ? assetSetup.online : true;
  const warmingSetup = assetSetup.warmingModel || assetSetup.warmingMedia;
  const helperAvailable = helperCapabilities?.available ?? false;
  const helperSummary = helperAvailable
    ? "Reachable on localhost. Large and long recordings route here by default."
    : helperCapabilities?.reason ?? "Large recordings need the local accelerator running on this machine.";
  const helperNextAction =
    helperCapabilities?.nextAction ??
    "Install ffmpeg and ffprobe, then run the helper install, start, and check commands in this repo.";
  const helperCacheLabel =
    typeof helperCapabilities?.cacheBytes === "number"
      ? `${formatBytes(helperCapabilities.cacheBytes)} cached locally`
      : "Model cache size unavailable";

  const primeWorkspaceSetup = useCallback(async () => {
    if (!assetSetup.modelReady) {
      await primeTranscriptionModel();
    }
    if (!assetSetup.mediaReady) {
      await primeMediaRuntime();
    }
  }, [assetSetup.mediaReady, assetSetup.modelReady, primeMediaRuntime, primeTranscriptionModel]);

  const openExport = useCallback(() => {
    if (!selectedProjectView?.canExport) return;
    setExportOpen(true);
  }, [selectedProjectView?.canExport]);

  const openSettings = useCallback(() => {
    setMobileSidebarOpen(false);
    setSettingsOpen(true);
  }, []);

  // Global shortcuts (additive — the hook already handles Space / ⌘K / / / J / K / B)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const inText =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      const cmd = event.metaKey || event.ctrlKey;

      if (cmd && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openFilePicker();
        return;
      }

      if (cmd && event.key.toLowerCase() === "e") {
        event.preventDefault();
        openExport();
        return;
      }

      if (cmd && event.key === ",") {
        event.preventDefault();
        openSettings();
        return;
      }

      if (cmd && event.key === "\\") {
        event.preventDefault();
        setInspectorOpen((open) => !open);
        return;
      }

      if (cmd && (event.key === "[" || event.key === "]")) {
        event.preventDefault();
        if (projects.length === 0 || !selectedProject) return;
        const index = projects.findIndex((p) => p.id === selectedProject.id);
        const next =
          event.key === "["
            ? projects[Math.max(0, index - 1)]
            : projects[Math.min(projects.length - 1, index + 1)];
        if (next) selectProject(next.id);
        return;
      }

      if (event.key === "Escape" && !inText) {
        if (mobileSidebarOpen) {
          setMobileSidebarOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (exportOpen) {
          setExportOpen(false);
        } else if (transcriptQuery) {
          setTranscriptQuery("");
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    openFilePicker,
    openExport,
    exportOpen,
    mobileSidebarOpen,
    openSettings,
    projects,
    selectProject,
    selectedProject,
    settingsOpen,
    setTranscriptQuery,
    transcriptQuery,
  ]);

  const emptyState = !selectedProject && projects.length === 0;
  const effectiveNotice = notice ?? (capabilityIssue ? { tone: "error" as const, message: capabilityIssue } : null);
  const supportedFormats = SUPPORTED_FORMAT_LABELS;

  const renderSidebar = ({
    closeOnAction = false,
    className,
    headerAction,
    showSearchShortcut,
  }: {
    closeOnAction?: boolean;
    className?: string;
    headerAction?: React.ReactNode;
    showSearchShortcut?: boolean;
  }) => {
    const finishAction = () => {
      if (closeOnAction) {
        setMobileSidebarOpen(false);
      }
    };

    return (
      <Sidebar
        projects={projects}
        selectedProjectId={selectedProject?.id ?? null}
        onSelect={(id) => {
          selectProject(id);
          finishAction();
        }}
        onImport={() => {
          openFilePicker();
          finishAction();
        }}
        libraryQuery={libraryQuery}
        onLibraryQueryChange={setLibraryQuery}
        searchResults={librarySearchResults}
        onOpenSearchResult={(result) => {
          openLibrarySearchResult(result);
          finishAction();
        }}
        onRetry={retryProject}
        onRemove={(id) => void removeProject(id)}
        onRename={renameProject}
        onTogglePin={togglePinProject}
        onReorder={reorderProjects}
        onToggleRecording={() => {
          void toggleRecording();
          finishAction();
        }}
        onOpenSettings={() => {
          openSettings();
          finishAction();
        }}
        isRecording={isRecording}
        librarySearchRef={librarySearchRef}
        storageUsedBytes={storageState?.usage ?? null}
        storageAvailableBytes={storageState?.available ?? null}
        storagePersisted={storageState?.persisted ?? null}
        modelReady={assetSetup.modelReady}
        mediaReady={assetSetup.mediaReady}
        online={effectiveOnline}
        helperAvailable={helperAvailable}
        helperSummary={helperSummary}
        className={className}
        headerAction={headerAction}
        showSearchShortcut={showSearchShortcut}
      />
    );
  };

  return (
    <div
      className="grid h-dvh min-h-dvh w-full grid-cols-1 gap-[var(--workspace-shell-gap)] overflow-hidden bg-background text-foreground lg:grid-cols-[var(--workspace-sidebar-width)_minmax(0,1fr)]"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={onFileInputChange}
        className="hidden"
        aria-hidden
      />

      <div className="hidden min-h-0 lg:block">
        {renderSidebar({ className: "h-full", showSearchShortcut: true })}
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-col">
        <MobileHeader
          onOpenSidebar={() => setMobileSidebarOpen(true)}
          onImport={openFilePicker}
          onOpenSettings={openSettings}
        />

        <main className="relative flex min-h-0 min-w-0 flex-1">
          {emptyState ? (
            <EmptyState
              onImport={openFilePicker}
              onPrimeSetup={primeWorkspaceSetup}
              onOpenSettings={openSettings}
              setupReady={setupReady}
              warming={warmingSetup}
              online={effectiveOnline}
              helperAvailable={helperAvailable}
              supportedFormats={supportedFormats}
            />
          ) : selectedProject ? (
            <>
              <Stage
                project={selectedProject}
                mediaUrl={mediaUrl}
                mediaRef={mediaRef}
                mediaHandlers={mediaHandlers}
                currentTime={currentTime}
                isPlaying={isPlaying}
                segments={transcriptSegments}
                turns={transcriptTurns}
                marks={currentProjectMarks}
                ranges={currentProjectRanges}
                focusedSegmentId={focusedSegmentId}
                playbackSegmentId={playbackSegmentId}
                matchedSegmentIds={matchedSegmentIds}
                transcriptQuery={transcriptQuery}
                onTranscriptQueryChange={setTranscriptQuery}
                partialTranscript={partialTranscript}
                onRename={renameSelectedProject}
                onSelectSegment={selectSegment}
                onUpdateSegmentText={updateSelectedSegmentText}
                onJumpMatch={jumpToTranscriptMatch}
                onSkip={seekByDelta}
                onPrevSegment={() => selectAdjacentSegment(-1, true)}
                onNextSegment={() => selectAdjacentSegment(1, true)}
                onToggleBookmark={toggleBookmark}
                onToggleInspector={() => setInspectorOpen((o) => !o)}
                inspectorOpen={inspectorOpen}
                onCopy={onCopyTranscript}
                copied={copied}
                onExport={openExport}
                onRetry={() => retryProject(selectedProject.id)}
                onRemove={() => void removeProject(selectedProject.id)}
                onOpenSettings={openSettings}
                setupReady={setupReady}
                warmingSetup={warmingSetup}
                online={effectiveOnline}
                onPrimeSetup={primeWorkspaceSetup}
                transcriptSearchRef={transcriptSearchRef}
                canSearch={selectedProjectView?.canSearchTranscript ?? false}
                canEdit={selectedProject.status === "ready"}
                canExport={selectedProjectView?.canExport ?? false}
                onBookmarkSegment={bookmarkSegment}
                onSaveRange={saveRange}
                onRevertSegment={revertSegmentText}
              />

              {inspectorOpen && selectedProjectView?.canUseTranscript ? (
                <Inspector
                  project={selectedProject}
                  marks={currentProjectMarks}
                  ranges={currentProjectRanges}
                  onClose={() => setInspectorOpen(false)}
                  onJumpToSegment={selectSegment}
                  onJumpToTime={(time) => seekToTime(time, false)}
                  onRemoveRange={removeSavedRange}
                  onToggleHighlight={(color: HighlightColor) => toggleHighlight(color)}
                  onExport={openExport}
                />
              ) : null}
            </>
          ) : (
            <EmptyState
              onImport={openFilePicker}
              onPrimeSetup={primeWorkspaceSetup}
              onOpenSettings={openSettings}
              setupReady={setupReady}
              warming={warmingSetup}
              online={effectiveOnline}
              helperAvailable={helperAvailable}
              supportedFormats={supportedFormats}
            />
          )}

          <SettingsLaunch onOpen={openSettings} />
        </main>

        {effectiveNotice && !settingsOpen && !exportOpen && !paletteOpen ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pb-1 sm:px-6">
            <div
              role={effectiveNotice.tone === "error" ? "alert" : "status"}
              aria-live={effectiveNotice.tone === "error" ? "assertive" : "polite"}
              className={cn(
                "pointer-events-auto flex w-full max-w-[min(36rem,100%)] items-start gap-3 rounded-2xl border border-border bg-popover px-4 py-3 text-[12px] shadow-[var(--shadow-float)]",
                effectiveNotice.tone === "error" ? "border-warning/40" : "",
              )}
            >
              {effectiveNotice.tone === "error" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <span className="mt-[0.35rem] inline-flex h-2 w-2 shrink-0 rounded-full bg-success" />
              )}
              <span className="min-w-0 flex-1 leading-5">{effectiveNotice.message}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="rounded-full p-1 text-subtle transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <MobileSidebarDrawer open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)}>
        {renderSidebar({
          closeOnAction: true,
          className: "h-full shadow-[var(--shadow-float)]",
          showSearchShortcut: false,
          headerAction: (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close library"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-subtle transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
            >
              <X className="h-4 w-4" />
            </button>
          ),
        })}
      </MobileSidebarDrawer>

      <ExportSheet
        open={exportOpen}
        project={selectedProject}
        onClose={() => setExportOpen(false)}
        onDownload={onDownloadTranscript}
        onCopy={() => void onCopyTranscript()}
        copied={copied}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        modelReady={assetSetup.modelReady}
        mediaReady={assetSetup.mediaReady}
        warmingModel={assetSetup.warmingModel}
        warmingMedia={assetSetup.warmingMedia}
        online={effectiveOnline}
        onPrimeModel={primeTranscriptionModel}
        onPrimeMedia={primeMediaRuntime}
        onResetSetup={resetSetupState}
        storagePersisted={storageState?.persisted ?? null}
        storageUsed={storageState?.usage ?? null}
        storageAvailable={storageState?.available ?? null}
        storageCanRequestPersistence={storageState?.canRequestPersistence ?? false}
        onAskForPersistent={askForPersistentStorage}
        installPromptAvailable={installState.installPromptAvailable}
        installed={installState.installed}
        onInstall={promptInstall}
        helperAvailable={helperAvailable}
        helperSummary={helperSummary}
        helperNextAction={helperNextAction}
        helperUrl={helperCapabilities?.url ?? "http://127.0.0.1:7771"}
        helperBackendLabel={helperCapabilities?.backendLabel ?? helperCapabilities?.backend}
        helperCacheLabel={helperCacheLabel}
        helperModels={helperCapabilities?.models ?? []}
        helperModelProfile={helperPreferences.modelProfile}
        helperPhraseHints={helperPreferences.phraseHints}
        helperSupportsAlignment={helperCapabilities?.supportsAlignment ?? false}
        helperSupportsDiarization={helperCapabilities?.supportsDiarization ?? false}
        helperAlignmentEnabled={helperPreferences.enableAlignment}
        helperDiarizationEnabled={helperPreferences.enableDiarization}
        onHelperModelProfileChange={updateHelperModelProfile}
        onHelperPhraseHintsChange={updateHelperPhraseHints}
        onHelperAlignmentChange={updateHelperAlignment}
        onHelperDiarizationChange={updateHelperDiarization}
        onRefreshHelper={() => void refreshHelperCapabilities()}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={projects}
        onOpenProject={(id) => selectProject(id)}
        onJumpToSegment={(projectId, segmentId) => {
          selectProject(projectId);
          const segment = projects
            .find((p) => p.id === projectId)
            ?.transcript?.segments.find((s) => s.id === segmentId);
          if (segment) seekToTime(segment.start, false);
        }}
        onJumpToRange={(projectId, rangeId) => {
          selectProject(projectId);
          const range = projects
            .find((p) => p.id === projectId)
            ?.savedRanges.find((r) => r.id === rangeId);
          if (range) seekToTime(range.start, false);
        }}
      />

      <DropOverlay visible={dragActive} />
    </div>
  );
}

function MobileHeader({
  onOpenSidebar,
  onImport,
  onOpenSettings,
}: {
  onOpenSidebar: () => void;
  onImport: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-background/95 px-[var(--workspace-mobile-padding)] pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open library and search"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-subtle shadow-[var(--shadow-soft)] transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-foreground text-background">
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
            <rect x="2" y="6" width="1.6" height="4" rx="0.8" />
            <rect x="5" y="3" width="1.6" height="10" rx="0.8" />
            <rect x="8" y="5" width="1.6" height="6" rx="0.8" />
            <rect x="11" y="2" width="1.6" height="12" rx="0.8" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            Transcribble
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            Local voice workspace
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onImport}
        aria-label={ADD_RECORDING_LABEL}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-subtle shadow-[var(--shadow-soft)] transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
      >
        <Upload className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label={SETTINGS_OPEN_LABEL}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-subtle shadow-[var(--shadow-soft)] transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
      >
        <Settings2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function MobileSidebarDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Library"
      className="fixed inset-0 z-50 flex lg:hidden"
    >
      <button
        type="button"
        aria-label="Close library"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
      />
      <div className="relative h-full w-[var(--workspace-sidebar-drawer-width)] max-w-[calc(100vw-1rem)]">
        {children}
      </div>
    </div>
  );
}

function SettingsLaunch({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={SETTINGS_OPEN_LABEL}
      title={`${SETTINGS_OPEN_LABEL} (${formatShortcutTitle("settings")})`}
      className={cn(
        "absolute bottom-[max(var(--workspace-floating-offset),env(safe-area-inset-bottom))] right-[max(var(--workspace-floating-offset),env(safe-area-inset-right))] z-30 hidden h-11 w-11 items-center justify-center rounded-full lg:flex",
        "border border-border bg-surface text-subtle shadow-[var(--shadow-soft)]",
        "transition-colors duration-150 hover:text-foreground hover:bg-muted ring-focus",
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}
