import type { TranscriptProject } from "@/lib/transcribble/types";

export interface PersistedUiState {
  selectedProjectId?: string | null;
  activeView?: "library" | "project";
}

export function createPersistedProjectSelection(projectId: string | null): PersistedUiState {
  return projectId
    ? { activeView: "project", selectedProjectId: projectId }
    : { activeView: "library", selectedProjectId: null };
}

export function resolveInitialProjectSelection(
  projects: readonly Pick<TranscriptProject, "id">[],
  state: PersistedUiState | null | undefined,
) {
  if (projects.length === 0) {
    return null;
  }

  if (state?.activeView === "library") {
    return null;
  }

  const storedProjectId = state?.selectedProjectId;
  if (storedProjectId && projects.some((project) => project.id === storedProjectId)) {
    return storedProjectId;
  }

  if (state && "selectedProjectId" in state && storedProjectId === null) {
    return null;
  }

  return projects[0]?.id ?? null;
}
