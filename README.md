# Transcribble

Transcribble is a local-first audio workspace built around on-device transcription. Instead of stopping at `upload -> transcript -> txt`, it turns recordings into persistent local projects with a media timeline, editable timestamped segments, grounded extracted outputs, and reusable cross-project search.

## What Changed

This repo now behaves more like an audio IDE than a single-use transcription wrapper:

- Persistent local project library backed by IndexedDB
- Queue-based local transcription for multiple audio/video files
- Timestamp-aware transcript timeline with click-to-seek
- Local media persistence so projects can be reopened later
- Editable transcript segments with autosave
- Bookmarks, highlights, chapters, and key moments
- Local search within a transcript and across the saved library
- Grounded local extraction for summaries, action items, questions, dates, entities, glossary terms, and review cues
- Multi-format export: `txt`, `md`, `srt`, `vtt`
- Session-map timeline with chapters, pause-derived turns, marks, and search hit visibility
- Speech density waveform visualization on the timeline
- Tabbed inspector for selection, outline, insights, and session setup
- Manual speaker label assignment on pause-derived turns
- Auto-scroll to the active transcript segment during playback
- React error boundary for crash recovery without data loss
- IndexedDB connection recovery with automatic retry
- Enrichment provider architecture (feature-flagged, cache-first, no paid APIs)
- Expanded format support: `.ogg`, `.webm`, `.flac`, `.aac`
- Safer delete handling and stronger atomic project/file persistence
- Local setup/priming flow for the transcription model and media runtime
- Keyboard shortcuts for transcript and library workflows
- 63 unit tests covering transcript core, media validation, projects, and enrichment

## Product Direction

The core product is now:

- local-first
- privacy-preserving
- zero-marginal-cost in the core flow
- inspectable rather than fake “AI”
- grounded in transcript spans and timestamps

The transcript is treated as source material for a broader workspace:

- timeline navigation
- reusable project memory
- deterministic extraction
- exportable artifacts
- review and editing workflow

## Architecture

### Frontend

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS

### Local processing

- `@huggingface/transformers` for Whisper inference in a web worker
- `@ffmpeg/ffmpeg` for local audio extraction from video or browser decode fallback

### Local persistence

- IndexedDB stores project metadata, source media files, and reusable workspace state
- Automatic connection recovery with retry on `InvalidStateError` / `TransactionInactiveError`

### Deterministic intelligence layer

The “intelligence” features are intentionally non-hosted and inspectable:

- transcript segmentation from timestamped chunks
- explicit pause-derived turn map for navigation and future speaker attribution
- chapter generation from structure and repeated terms
- extractive summaries
- action-item detection
- question extraction
- explicit date/deadline spotting
- entity and glossary extraction
- key-moment scoring
- transcript review cues
- local full-text search index

No paid inference API or mandatory cloud backend was introduced.

### Optional enrichments

No live third-party enrichment provider is required or enabled in this build.

The current implementation deliberately prioritizes local utility over bolt-on public APIs. If public/open-data enrichments are added later, they should remain:

- optional
- cache-first
- adapter-based
- rate-limited
- failure-tolerant
- non-blocking for the core workflow

## Important Offline Note

Core processing is local, but the first run still needs model/runtime assets to be downloaded and cached by the browser:

- Whisper model assets are fetched on first use and then cached locally by the browser/runtime
- `ffmpeg.wasm` runtime assets are fetched on first use and then cached
- The app now exposes a setup/priming flow so users can warm those assets before they need an offline session

After those assets are cached, normal use stays local. Cold-start offline use from a brand-new browser profile is not yet fully bundled in-repo.

If strict first-run offline support is required, the next step would be shipping the model/runtime assets locally instead of relying on first-use downloads.

## Workspace UX

### Library

- local project persistence
- queue visibility
- safer retry/delete controls
- cross-project search
- title-only search hits for queued or not-yet-transcribed projects

### Timeline

- session-map overview strip with chapter bands, turn boundaries, marks, search hit markers, and the live playhead
- timestamped transcript segments
- active playback highlighting
- click-to-seek
- inline match highlighting

### Editing

- autosaved segment editing
- title editing
- bookmarks and color highlights
- saved-mark labels stay aligned with edited transcript text

### Outputs

- grounded summary bullets
- linked action items
- linked open questions
- linked date references
- linked saved moments and key moments in markdown export
- extracted entities and glossary terms
- review cues for ambiguous segments

## Keyboard Shortcuts

- `/` focus transcript search
- `Ctrl/Cmd + K` focus library search
- `Space` play or pause media
- `B` toggle bookmark on the selected segment
- `J` / `K` move to next or previous segment

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm run lint
npm test
npm run build
```

## File Layout

- [app/page.tsx](/Users/dylan/Projects/Dev/transcribble/app/page.tsx): app entry
- [components/transcribble-app.tsx](/Users/dylan/Projects/Dev/transcribble/components/transcribble-app.tsx): multi-pane audio workspace UI
- [hooks/use-transcribble.ts](/Users/dylan/Projects/Dev/transcribble/hooks/use-transcribble.ts): workspace controller, queue, playback, autosave
- [workers/transcriber.worker.ts](/Users/dylan/Projects/Dev/transcribble/workers/transcriber.worker.ts): local Whisper worker
- [lib/transcribble/workspace-db.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/workspace-db.ts): IndexedDB project/media storage
- [lib/transcribble/analysis.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/analysis.ts): deterministic transcript intelligence layer
- [lib/transcribble/export.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/export.ts): `txt`/`md`/`srt`/`vtt` exports
- [lib/transcribble/search.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/search.ts): transcript and library search
- [lib/transcribble/enrichment.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/enrichment.ts): feature-flagged enrichment provider architecture
- [components/error-boundary.tsx](/Users/dylan/Projects/Dev/transcribble/components/error-boundary.tsx): React error boundary for crash recovery
- [tests/](/Users/dylan/Projects/Dev/transcribble/tests/): unit tests for transcript, media, projects, and enrichment

## Current Limitations

- True speaker diarization is not implemented. Manual speaker labels can be assigned to pause-derived turns, but the app does not claim automatic speaker identity or confidence.
- Confidence scores from the model are not exposed directly; the UI shows deterministic review cues instead.
- First-run asset download is still required before the app can operate fully offline from cache, even though the setup panel can now prime those caches proactively.
- Very large files can still hit browser memory limits depending on hardware and browser runtime support.

## Best Next Steps

Highest-leverage follow-ons after this pass:

1. Add true speaker diarization using a practical local-only pipeline to complement the manual speaker labels.
2. Bundle model/runtime assets or ship an installable desktop shell for stricter offline guarantees.
3. Add range-based waveform highlights tied to bookmarks and chapters.
4. Wire enrichment providers to real free/open data sources behind the existing feature flag system.
5. Add a semantic local index if the model/runtime footprint can be justified.
