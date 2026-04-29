# Transcribble Agent Notes

Start here:
- `git status --short`
- `README.md`
- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `next.config.mjs`

Repo truth:
- Single-route Next.js 15 App Router app. `app/page.tsx` mounts `components/transcribble-app.tsx`.
- Main controller: `hooks/use-transcribble.ts`.
- Main workspace shell: `components/workspace/sidebar.tsx`, `stage.tsx`, `transcript-pane.tsx`, `inspector.tsx`, `export-sheet.tsx`, `settings-sheet.tsx`, `library-overview.tsx`, `brand-mark.tsx`.
- Microphone recording surface: `components/workspace/recording-console.tsx`, driven by the recording state in `hooks/use-transcribble.ts` and helper utilities in `lib/transcribble/recording.ts`.
- The sidebar/mobile brand header (logo + "Transcribble") clears the selected project and renders `library-overview.tsx`, the aggregated All Recordings grid. The favicon and apple-touch icon are rendered from `app/icon.tsx` and `app/apple-icon.tsx` using the same mark as `BrandMark`.
- Transcript playback highlight is driven by an rAF loop in `hooks/use-transcribble.ts` while the media is playing, so the `playbackSegmentId` tracks `media.currentTime` in real time instead of the ~4Hz `timeupdate` event.
- Browser-local processing boundary: `workers/transcriber.worker.ts` plus `lib/transcribble/media.ts`.
- Local accelerator boundary: `helper/transcribble_helper.py`, `lib/transcribble/local-helper-client.ts`, `lib/transcribble/local-helper-state.ts`, and `lib/transcribble/transcription-backends.ts`.
- Persistence boundary: `lib/transcribble/workspace-db.ts` plus `lib/transcribble/storage.ts`.
- Search/export/analysis map: `lib/transcribble/search.ts`, `ranges.ts`, `export.ts`, `analysis.ts`, `status.ts`, `types.ts`.
- Tests live in `tests/*.test.ts`.

Do not assume:
- Browser mode is only for smaller, safer recordings. Do not claim browser-only support for arbitrary long or large FFmpeg-decodable media.
- The default architecture is zero-dollar and local-first. Do not reintroduce any default dependency on OpenAI, Vercel Blob, Vercel Workflows, or another usage-billed backend.
- The helper may not be installed or running on a given machine. If a job needs it, keep the file local and say that the local accelerator is required.
- Helper lifecycle commands are `npm run helper:install`, `npm run helper:start`, and `npm run helper:check`.
- `npm run helper:check` is the diagnostic entrypoint. It should report whether `ffmpeg`, `ffprobe`, the helper venv/backend, or the running localhost service is missing.
- Helper connectivity from the public HTTPS app must stay friendly: the helper should answer secure-browser localhost preflights/permission checks cleanly, and UI copy must not leak raw fetch strings like `Failed to fetch`.
- Import validation is quota-aware. Do not reintroduce a fixed file-size cap or “upload” language for local recording imports.
- Microphone recording is a real local media capture flow using `getUserMedia` + `MediaRecorder`; do not replace it with a fake UI or a parallel persistence system.
- Live transcript while recording is browser SpeechRecognition/webkitSpeechRecognition only where available. Treat it as provisional browser dictation, not the final local transcript and not a fully local layer.
- Saved microphone recordings must enter the existing IndexedDB/OPFS project pipeline and the existing browser/helper transcription route after stop.
- Speaker turns are currently pause-derived. `speakerLabel`, `manual`, and `diarized` are future seams, not a finished speaker workflow.
- Export is transcript-focused (`txt`, `md`, `srt`, `vtt`). Workspace backup/import is local JSON, additive by default, and honest about missing media.
- `lib/transcribble/enrichment.ts` is optional and feature-flagged. Core flows should not depend on hosted enrichments.
- Verify Vercel before touching public URLs. Keep `README.md` and `app/layout.tsx` aligned with the live public alias, not stale defaults.
- Helper model downloads are one-time local cache events under `~/.transcribble-helper`; UI/docs should describe them honestly and avoid claiming the model is already cached before the weight files are actually present.
- Helper-backed long media chunks locally, can run bounded chunk workers, and stitches the transcript before export. `TRANSCRIBBLE_HELPER_CHUNK_WORKERS=1..4` overrides the default worker count before `npm run helper:start`.
- Helper phrase hints are backend capability-gated. The current helper passes phrase hints to both MLX Whisper and `faster-whisper`; UI copy should not claim support for a backend unless `/capabilities` reports it.
- Long-media helper-required copy must stay actionable and include `npm run helper:start` and `npm run helper:check`.
- Keep the main UI calm and Voice Memos-like: recording list, drag-in import, focused player/transcript, clear `.txt` export, and a visible desktop-app install/open affordance. Avoid bringing back dashboard-style panels unless the workflow truly needs them.
- `app/manifest.ts` shortcuts must map to real single-route app actions. `/?action=add` is handled by the app and should keep opening the add-recording path without duplicating recording work.
- `public/sw.js` is intentionally narrow: network-first navigations, versioned static asset caches, old-cache cleanup on activate, and no caching for helper/API/localhost-style responses.
- Workspace backup/import is local JSON and additive by default. It validates schema before writing, remaps conflicting IDs, restores media only when the browser can read it from local storage, and otherwise restores metadata/transcripts with an explicit missing-media state.

Validation:
- Docs/instruction-only edits: verify referenced files and commands exist; do not run `npm run validate` by default.
- Code or executable-config edits: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`.
- Broad sweep: `npm run validate`.

Maintenance rule:
- After meaningful architecture, workflow, environment, script, validation, or deployment changes, update `AGENTS.md`, `CLAUDE.md`, `README.md`, and any hardcoded public metadata in the same change.
