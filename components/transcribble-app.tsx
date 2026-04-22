"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranscribble } from "@/hooks/use-transcribble";
import { getProjectViewState } from "@/lib/transcribble/status";
import type { HighlightColor } from "@/lib/transcribble/types";

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
    toggleBookmark,
    toggleHighlight,
    removeSavedRange,
    primeTranscriptionModel,
    primeMediaRuntime,
    askForPersistentStorage,
    resetSetupState,
    promptInstall,
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
        setSettingsOpen(true);
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
        if (settingsOpen) {
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
    projects,
    selectProject,
    selectedProject,
    settingsOpen,
    setTranscriptQuery,
    transcriptQuery,
  ]);

  const emptyState = !selectedProject && projects.length === 0;
  const effectiveNotice = notice ?? (capabilityIssue ? { tone: "error" as const, message: capabilityIssue } : null);

  return (
    <div
      className="flex h-screen min-h-screen w-full overflow-hidden bg-background text-foreground"
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

      <Sidebar
        projects={projects}
        selectedProjectId={selectedProject?.id ?? null}
        onSelect={selectProject}
        onImport={openFilePicker}
        libraryQuery={libraryQuery}
        onLibraryQueryChange={setLibraryQuery}
        searchResults={librarySearchResults}
        onOpenSearchResult={openLibrarySearchResult}
        onRetry={retryProject}
        onRemove={(id) => void removeProject(id)}
        librarySearchRef={librarySearchRef}
        storageUsedBytes={storageState?.usage ?? null}
        storageQuotaBytes={storageState?.quota ?? null}
        storagePersisted={storageState?.persisted ?? null}
        modelReady={assetSetup.modelReady}
        mediaReady={assetSetup.mediaReady}
        online={effectiveOnline}
      />

      <main className="relative flex min-w-0 flex-1">
        {emptyState ? (
          <EmptyState
            onImport={openFilePicker}
            onPrimeSetup={primeWorkspaceSetup}
            setupReady={setupReady}
            warming={warmingSetup}
            online={effectiveOnline}
            supportedFormatsLabel={accept
              .split(",")
              .map((value) => value.replace(".", "").toUpperCase())
              .join(" · ")}
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
              setupReady={setupReady}
              warmingSetup={warmingSetup}
              online={effectiveOnline}
              onPrimeSetup={primeWorkspaceSetup}
              transcriptSearchRef={transcriptSearchRef}
              canSearch={selectedProjectView?.canSearchTranscript ?? false}
              canEdit={selectedProject.status === "ready"}
              canExport={selectedProjectView?.canExport ?? false}
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
            setupReady={setupReady}
            warming={warmingSetup}
            online={effectiveOnline}
            supportedFormatsLabel={accept
              .split(",")
              .map((value) => value.replace(".", "").toUpperCase())
              .join(" · ")}
          />
        )}
      </main>

      {effectiveNotice ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2 animate-rise-in">
          <div
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-[12px] shadow-[var(--shadow-float)]",
              effectiveNotice.tone === "error"
                ? "text-foreground border-warning/40"
                : "text-foreground",
            )}
          >
            {effectiveNotice.tone === "error" ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
            ) : (
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            )}
            <span className="flex-1 leading-5">{effectiveNotice.message}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}

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
        storageQuota={storageState?.quota ?? null}
        onAskForPersistent={askForPersistentStorage}
        installPromptAvailable={installState.installPromptAvailable}
        installed={installState.installed}
        onInstall={promptInstall}
      />

      <DropOverlay visible={dragActive} />

      <SettingsLaunch onOpen={() => setSettingsOpen(true)} />
    </div>
  );
}

function SettingsLaunch({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open settings"
      title="Settings (⌘,)"
      className={cn(
        "fixed bottom-4 left-4 z-30 flex h-7 w-7 items-center justify-center rounded-full",
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
