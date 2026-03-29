# transcribble

`transcribble` is a one-page media-to-text transcription app that runs locally in the browser. It accepts `.mp3`, `.mp4`, `.m4a`, `.wav`, and `.mov`, extracts audio client-side when needed, and transcribes on-device with Whisper via `@huggingface/transformers`.

## Highlights

- Local-first transcription with no paid inference API
- WebGPU acceleration when available, WebAssembly fallback otherwise
- Drag-and-drop upload flow with validation, progress, and friendly errors
- In-browser audio extraction for video uploads using `ffmpeg.wasm`
- Copy, download-as-`.txt`, and reset actions after transcription completes
- Responsive dashboard UI adapted from the provided template

## Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- `@huggingface/transformers`
- `@ffmpeg/ffmpeg`

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run lint
npm run build
npm run start
```

## Deployment

The app is frontend-only and deploys cleanly to Vercel with no environment variables.

## Notes on local transcription

- The first transcription run downloads model files and caches them in the browser.
- Performance depends on browser support and hardware. Recent Chrome and Edge builds provide the best WebGPU path today.
- Large or long media files can still hit browser memory limits because decoding, extraction, and inference all happen locally.
