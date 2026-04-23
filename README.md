# Transcribble

Transcribble is a local-first voice workspace for turning recordings into searchable, editable knowledge on this device.

Current public app: [transcribble-rho.vercel.app](https://transcribble-rho.vercel.app)

## Modes

- Browser mode: the lightweight path for smaller, safer recordings when the browser runtime is genuinely a good fit.
- Local accelerator mode: the default path for long or large media. It runs through the Transcribble Helper on `localhost`, uses native `ffprobe` / `ffmpeg`, and keeps the work on the same machine.

The app does **not** default to any paid cloud transcription backend.

## Privacy And Cost

- Default behavior is zero-dollar and local-first.
- No OpenAI API key, Vercel Blob, Vercel Workflows, S3, R2, Supabase Storage, Cloudinary, AssemblyAI, or Deepgram is required for the default architecture.
- Browser mode keeps recordings on this device.
- Local accelerator mode also keeps recordings on this machine and does not upload them to a remote service.

## Large Files

Transcribble now handles large imports honestly:

- the browser still accepts large files when local storage is available
- backend routing is centralized in `lib/transcribble/transcription-backends.ts`
- smaller/safe recordings stay on the browser-local path
- long or memory-risk recordings route to the local accelerator
- if the helper is not running, the app keeps the source file locally and says that the local accelerator is required instead of pretending the browser will continue

The guaranteed path for a 1.1 GB meeting `.mp4` is the local accelerator, not `decodeAudioData()`, `AudioBuffer`, or `ffmpeg.wasm`.

## Transcribble Helper

The helper lives in [helper/transcribble_helper.py](/Users/dylan/Projects/Dev/transcribble/helper/transcribble_helper.py).

It exposes:

- `GET /health`
- `GET /capabilities`
- `POST /jobs`
- `PUT /jobs/:id/source`
- `GET /jobs/:id`
- `POST /jobs/:id/cancel`
- `POST /jobs/:id/retry`

It:

- probes media with native `ffprobe`
- fails clearly when no usable audio stream exists
- extracts mono 16 kHz speech audio with native `ffmpeg`
- chunks long recordings with overlap
- shows explicit helper-side model download progress while the first local model is being prepared
- persists job state locally so refreshes and helper restarts can resume
- prefers MLX Whisper on Apple Silicon when available, otherwise uses `faster-whisper`

### Install The Helper

1. Install native `ffmpeg` and `ffprobe`.
2. Run `npm run helper:install`.
3. Run `npm run helper:start`.
4. Run `npm run helper:check`.

Helper state is stored under `~/.transcribble-helper` by default.
If the helper is unavailable, run `npm run helper:check` first. It now tells you explicitly whether `ffmpeg`, `ffprobe`, the helper Python env/backend, or the localhost service is missing.
On Apple Silicon, the helper prefers MLX Whisper when it is installed and falls back to `faster-whisper` otherwise.
The first helper-backed job downloads the selected local model once, caches it under `~/.transcribble-helper`, and reuses it on later runs.
On the public HTTPS app, Chromium-based browsers may preflight or prompt before allowing localhost helper access. If the browser asks whether Transcribble can reach localhost or your local network, allow it and refresh the app.

## First-Time Browser Setup

Browser mode still needs one online setup in a fresh browser profile because the local model and browser media runtime are downloaded once and then cached.

That first-run requirement applies only to the browser path. Large recordings should use the helper instead of relying on the browser runtime.

## Storage

Transcribble uses:

- IndexedDB for project metadata, search data, and fallback media storage
- OPFS for larger local media files when the browser supports the private file system

The app also surfaces:

- whether persistent local storage was granted
- local storage usage and available space when the browser exposes it
- quota-aware import checks instead of a fixed file-size cap

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Main Files

- [app/page.tsx](/Users/dylan/Projects/Dev/transcribble/app/page.tsx): app entry
- [components/transcribble-app.tsx](/Users/dylan/Projects/Dev/transcribble/components/transcribble-app.tsx): main workspace UI
- [hooks/use-transcribble.ts](/Users/dylan/Projects/Dev/transcribble/hooks/use-transcribble.ts): workspace controller and backend routing integration
- [lib/transcribble/transcription-backends.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/transcription-backends.ts): browser vs local-helper routing
- [lib/transcribble/local-helper-client.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/local-helper-client.ts): localhost helper client
- [lib/transcribble/local-helper-state.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/local-helper-state.ts): helper job to project-state mapping
- [scripts/helper-check.mjs](/Users/dylan/Projects/Dev/transcribble/scripts/helper-check.mjs): helper health and capability check
- [lib/transcribble/workspace-db.ts](/Users/dylan/Projects/Dev/transcribble/lib/transcribble/workspace-db.ts): IndexedDB and OPFS-backed storage adapter
- [helper/transcribble_helper.py](/Users/dylan/Projects/Dev/transcribble/helper/transcribble_helper.py): local accelerator service

## Known Limits

- Browser mode is intentionally conservative and should not be treated as “supports any FFmpeg-decodable media.”
- The helper requires local Python plus native `ffmpeg` / `ffprobe`.
- Speaker turns in the app stay pause-derived unless a future local diarization pass is enabled.
- Optional alignment and diarization controls are exposed as helper settings, but the default helper build does not bundle those heavier local dependencies yet.
- Whole-workspace backup and re-import are still not implemented.
