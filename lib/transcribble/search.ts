import { normalizeSearchText, tokenizeText } from "@/lib/transcribble/transcript";
import type { LibrarySearchResult, ProjectSearchEntry, TranscriptProject } from "@/lib/transcribble/types";

function scoreEntry(entry: ProjectSearchEntry, normalizedQuery: string, queryTokens: string[]) {
  let score = 0;

  if (entry.normalizedText.includes(normalizedQuery)) {
    score += 12;
  }

  for (const token of queryTokens) {
    if (entry.tokens.includes(token)) {
      score += 4;
    }
  }

  return score;
}

function scoreTitle(title: string, normalizedQuery: string, queryTokens: string[]) {
  const normalizedTitle = normalizeSearchText(title);
  const titleTokens = tokenizeText(title);
  let score = 0;

  if (normalizedTitle.includes(normalizedQuery)) {
    score += 18;
  }

  for (const token of queryTokens) {
    if (titleTokens.includes(token)) {
      score += 5;
    }
  }

  return score;
}

export function searchProjectEntries(entries: ProjectSearchEntry[], query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  return entries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, normalizedQuery, queryTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.start - right.entry.start);
}

export function searchProjectLibrary(projects: TranscriptProject[], query: string): LibrarySearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeText(query);

  if (!normalizedQuery) {
    return [] as LibrarySearchResult[];
  }

  return projects
    .flatMap((project) => {
      const titleHit = scoreTitle(project.title, normalizedQuery, queryTokens);
      const titleEntry =
        titleHit > 0
          ? ({
              projectId: project.id,
              projectTitle: project.title,
              projectUpdatedAt: project.updatedAt,
              score: titleHit,
              matchKind: "title",
              entry: {
                segmentId: "",
                start: 0,
                end: 0,
                text: project.title,
                normalizedText: normalizeSearchText(project.title),
                tokens: tokenizeText(project.title),
              },
            } satisfies LibrarySearchResult)
          : null;
      const transcriptHits: LibrarySearchResult[] =
        project.transcript?.searchEntries
          .flatMap((entry) => {
            const score = scoreEntry(entry, normalizedQuery, queryTokens) + Math.round(titleHit / 4);

            if (score <= 0) {
              return [];
            }

            return [
              {
                projectId: project.id,
                projectTitle: project.title,
                projectUpdatedAt: project.updatedAt,
                score,
                matchKind: "segment",
                entry,
              } satisfies LibrarySearchResult,
            ];
          }) ?? [];

      const matches = [...transcriptHits];

      if (titleEntry) {
        matches.unshift(titleEntry);
      }

      return matches;
    })
    .sort((left, right) => right.score - left.score || right.projectUpdatedAt.localeCompare(left.projectUpdatedAt))
    .slice(0, 40);
}
