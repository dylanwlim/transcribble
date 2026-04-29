# Transcribble Helper

The Transcribble Helper is the zero-dollar local accelerator for long or large media.

It runs on `http://127.0.0.1:7771`, keeps files on the same machine, uses native `ffprobe` / `ffmpeg`, and transcribes in resumable chunks with a local Whisper backend.

## Install

1. Install native `ffmpeg` and `ffprobe`.
2. Run `npm run helper:install`.
3. Run `npm run helper:start`.
4. Run `npm run helper:check`.

The helper prefers MLX Whisper on Apple Silicon when `mlx-whisper` is installed. Otherwise it uses `faster-whisper`.
Phrase hints from the app are passed to MLX Whisper and `faster-whisper` as an initial prompt when those backends are active.
`npm run helper:check` tells you whether `ffmpeg`, `ffprobe`, the helper virtualenv/backend, or the localhost service is missing.

## Notes

- Source media, chunk state, and transcripts persist under `~/.transcribble-helper` by default.
- The first helper-backed transcription downloads the selected local model once and then reuses the cached files on later jobs.
- Set `TRANSCRIBBLE_HELPER_STUB=1` to run the helper in a deterministic stub mode for local testing.
- Set `TRANSCRIBBLE_HELPER_HOME` to move the helper state directory.
