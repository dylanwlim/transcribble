import type { TranscriptProject } from "@/lib/transcribble/types";

export function sortProjects(projects: readonly TranscriptProject[]) {
  return [...projects].sort((left, right) => {
    const pinnedDelta = Number(right.pinned ?? false) - Number(left.pinned ?? false);
    if (pinnedDelta !== 0) return pinnedDelta;

    const leftOrder = left.sortOrder;
    const rightOrder = right.sortOrder;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function reorderProjectsById(
  projects: readonly TranscriptProject[],
  sourceId: string,
  targetId: string,
  position: "before" | "after",
) {
  if (sourceId === targetId) return sortProjects(projects);

  const ordered = sortProjects(projects);
  const source = ordered.find((project) => project.id === sourceId);
  const target = ordered.find((project) => project.id === targetId);
  if (!source || !target) return ordered;

  const withoutSource = ordered.filter((project) => project.id !== sourceId);
  const targetIndex = withoutSource.findIndex((project) => project.id === targetId);
  if (targetIndex === -1) return ordered;

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const reordered = [
    ...withoutSource.slice(0, insertIndex),
    source,
    ...withoutSource.slice(insertIndex),
  ];

  return reordered.map((project, index) => ({ ...project, sortOrder: index }));
}
