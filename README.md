# Transcribble

Transcribble is a private voice workspace for turning recordings into searchable, editable knowledge on this device.

It is not a chatbot shell and it is not a hosted transcription dashboard. The core flow is local-first:

- add audio or video
- transcribe it in the browser
- review the transcript against time-linked evidence
- save moments and review ranges
- reopen, search, edit, and export later from the same browser

## What The Product Does

- Saves recordings, transcripts, edits, highlights, and saved review ranges in local browser storage
- Builds timestamped transcript segments, chapters, turns, and grounded local outputs
- Keeps cross-session search local, including transcript hits and saved review ranges
- Exports plain text, markdown, SRT, and VTT from the same saved session

## Privacy And Cost

- No paid API is required for the core workflow
- No mandatory cloud backend is required for the core workflow
- Recordings and transcript work stay in browser storage on this device
- Search, review cues, summaries, questions, dates, glossary terms, and saved review ranges are built locally

## First-Time Setup And Offline Caveat

Transcribble does local processing, but a brand-new browser profile still needs one online setup before fully local repeat use works.

On first setup the browser downloads:

- the local transcription model
- the media runtime used for video imports and browser fallback decoding

After those are cached, normal use can stay local in that browser profile.

Important note:

- This app does not claim true first-run offline support from a cold browser profile
- If the browser has never downloaded the local assets before, internet is still required once

## Storage

Transcribble now uses:

- IndexedDB for project metadata, search data, and fallback media storage
- OPFS for larger local media files when the browser supports the private file system

Existing saved projects are preserved. The storage change is additive and falls back safely when OPFS is unavailable.

The app also surfaces:

- whether the browser reports durable storage protection
- storage usage and quota when the browser exposes it
- whether larger recordings can use the private file system
- browser notes that affect local reliability

## Installability

This repo now includes a basic installable web-app foundation:

- web manifest
- generated app icons
- a lightweight service worker for quicker reopen support
- install prompt wiring when the browser exposes it

This improves reopenability and app-like launch behavior, but it does not change the first-run offline note above.

## Core Review Workflow

Transcribble supports two kinds of review markers:

- quick marks: bookmarks and highlights on individual transcript lines
- saved review ranges: named time ranges tied back to transcript segments

Saved review ranges:

- appear on the session map
- show up in the session outline
- are searchable in the library
- are included in markdown export

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

## Main Files

- [app/page.tsx](/Users/dylan/Projects/Dev/transcribble/app/page.tsx): app entry
- [components/transcribble-app.tsx](/Users/dylan/Projects/Dev/transcribble/components/transcribble-app.tsx): main workspace UI
- [hooks/use-transcribble.ts](/Users/dylan/Projects/Dev/transcribble/hooks/use-transcribble.ts): workspace controller
- [lib/transcribble/workspace-db.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/workspace-db.ts): IndexedDB and OPFS-backed storage adapter
- [lib/transcribble/status.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/status.ts): unified user-facing processing language
- [lib/transcribble/ranges.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/ranges.ts): saved review range helpers
- [lib/transcribble/search.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/search.ts): local search across sessions
- [lib/transcribble/export.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/export.ts): text, markdown, and caption export

## Known Limits

- Speaker diarization is still not implemented
- First-run offline use still depends on one online setup
- Browser memory limits still apply to very large recordings
- Some browsers do not expose durable storage or private file system support
