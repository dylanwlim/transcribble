# Transcribble Agent Notes

Start here:
- `git status --short`
- `README.md`
- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `next.config.mjs`

Repo truth:
- Single-route Next.js 15 App Router app. `app/page.tsx` mounts `components/transcribble-app.tsx`. There are no `app/api` routes or server-side product backends in the core flow.
- Main controller: `hooks/use-transcribble.ts`.
- Main workspace shell: `components/workspace/sidebar.tsx`, `stage.tsx`, `transcript-pane.tsx`, `inspector.tsx`, `export-sheet.tsx`, `settings-sheet.tsx`.
- Local processing boundary: `workers/transcriber.worker.ts` plus `lib/transcribble/media.ts`.
- Persistence boundary: `lib/transcribble/workspace-db.ts` plus `lib/transcribble/storage.ts`.
- Search/export/analysis map: `lib/transcribble/search.ts`, `ranges.ts`, `export.ts`, `analysis.ts`, `status.ts`, `types.ts`.
- Tests live in `tests/*.test.ts`.

Do not assume:
- Local-first is true after first setup, not from a cold offline browser profile. The model and media runtime still download once, and `lib/transcribble/media.ts` pulls FFmpeg core from jsDelivr.
- The committed product is still import-first. If this checkout has extra UI work in progress, inspect `git diff` before treating new affordances as durable repo truth.
- Speaker turns are currently pause-derived. `speakerLabel`, `manual`, and `diarized` are future seams, not a finished speaker workflow.
- Export is transcript-focused (`txt`, `md`, `srt`, `vtt`). Whole-workspace backup/import is still missing.
- `lib/transcribble/enrichment.ts` is optional and feature-flagged. Core flows should not depend on hosted enrichments.
- Verify Vercel before touching public URLs. Keep `README.md` and `app/layout.tsx` aligned with the live public alias, not stale defaults.

Validation:
- Docs/instruction-only edits: verify referenced files and commands exist; do not run `npm run validate` by default.
- Code or executable-config edits: `npm run typecheck`, `npm test`, `npm run build`.
- Broad sweep: `npm run validate`.

Maintenance rule:
- After meaningful architecture, command, validation, or deployment changes, update `AGENTS.md`, `CLAUDE.md`, `README.md`, and any hardcoded public metadata in the same change.
