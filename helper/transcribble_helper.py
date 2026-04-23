#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlparse

HELPER_VERSION = "0.1.0"
HELPER_PROTOCOL_VERSION = "1"
HELPER_HOST = os.environ.get("TRANSCRIBBLE_HELPER_HOST", "127.0.0.1")
HELPER_PORT = int(os.environ.get("TRANSCRIBBLE_HELPER_PORT", "7771"))
HELPER_ROOT = Path(
    os.environ.get(
        "TRANSCRIBBLE_HELPER_HOME",
        str(Path.home() / ".transcribble-helper"),
    )
).expanduser()
JOBS_DIR = HELPER_ROOT / "jobs"
MODELS_DIR = HELPER_ROOT / "models"
HF_CACHE_DIR = HELPER_ROOT / "hf-cache"
DEFAULT_SAMPLE_RATE = 16_000
DEFAULT_CHUNK_SEC = 8 * 60
MIN_CHUNK_SEC = 90
CHUNK_OVERLAP_SEC = 2
MODEL_DOWNLOAD_POLL_INTERVAL_SEC = 0.5

os.environ.setdefault("HF_HOME", str(HF_CACHE_DIR))


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def json_dumps(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True).encode("utf-8")


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def file_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def normalize_spacing(text: str) -> str:
    return " ".join((text or "").split())


def format_bytes(value: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(max(0, value))
    unit = units[0]
    for unit in units:
        if size < 1024 or unit == units[-1]:
            break
        size /= 1024
    precision = 0 if unit in {"B", "KB"} else 1
    return f"{size:.{precision}f} {unit}"


def has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def ffmpeg_path() -> str | None:
    return os.environ.get("TRANSCRIBBLE_HELPER_FFMPEG") or shutil.which("ffmpeg")


def ffprobe_path() -> str | None:
    return os.environ.get("TRANSCRIBBLE_HELPER_FFPROBE") or shutil.which("ffprobe")


def nvidia_available() -> bool:
    return shutil.which("nvidia-smi") is not None


def preferred_backend() -> str | None:
    if os.environ.get("TRANSCRIBBLE_HELPER_STUB") == "1":
        return "stub"

    machine = platform.machine().lower()
    if sys.platform == "darwin" and machine in {"arm64", "aarch64"} and has_module("mlx_whisper"):
        return "mlx-whisper"

    if has_module("faster_whisper"):
        return "faster-whisper"

    return None


def available_backends() -> list[str]:
    backends: list[str] = []
    if os.environ.get("TRANSCRIBBLE_HELPER_STUB") == "1":
        backends.append("stub")
    if sys.platform == "darwin" and platform.machine().lower() in {"arm64", "aarch64"} and has_module("mlx_whisper"):
        backends.append("mlx-whisper")
    if has_module("faster_whisper"):
        backends.append("faster-whisper")
    return backends


def helper_available() -> bool:
    return bool(ffmpeg_path() and ffprobe_path() and preferred_backend())


def helper_next_action(backend: str | None) -> str | None:
    if not ffmpeg_path() or not ffprobe_path():
        return "Install native ffmpeg and ffprobe, then run npm run helper:check."
    if not backend:
        return "Run npm run helper:install, then npm run helper:start."
    return "Run npm run helper:start if the helper is not already running."


def model_display_name(profile: str, backend: str | None) -> str:
    if backend == "mlx-whisper":
        return mlx_model_name(profile)
    if backend == "faster-whisper":
        return faster_model_name(profile)
    return faster_model_name(profile)


def model_cache_markers(profile: str, backend: str | None) -> list[str]:
    if backend == "mlx-whisper":
        repo_name = mlx_model_name(profile).replace("/", "--")
        return [repo_name, f"models--{repo_name}"]
    if backend == "faster-whisper":
        model_name = faster_model_name(profile)
        return [model_name, f"models--Systran--{model_name}"]
    return []


def model_cache_paths(profile: str, backend: str | None) -> list[Path]:
    if backend == "stub":
        return []

    matches: dict[str, Path] = {}
    for root in [MODELS_DIR, HF_CACHE_DIR]:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_dir():
                continue
            if any(marker in path.name for marker in model_cache_markers(profile, backend)):
                matches[str(path.resolve())] = path

    if backend == "faster-whisper":
        direct_root = MODELS_DIR / "faster-whisper" / faster_model_name(profile)
        if direct_root.exists():
            matches[str(direct_root.resolve())] = direct_root

    return list(matches.values())


def capabilities_payload() -> dict[str, Any]:
    backend = preferred_backend()
    available = helper_available()
    models = [
        {
            "profile": "fast",
            "label": "Fast mode",
            "modelName": model_display_name("fast", backend),
            "downloaded": model_downloaded("fast", backend),
            "diskUsageBytes": model_disk_usage("fast", backend),
            "recommended": True,
        },
        {
            "profile": "accurate",
            "label": "Accuracy mode",
            "modelName": model_display_name("accurate", backend),
            "downloaded": model_downloaded("accurate", backend),
            "diskUsageBytes": model_disk_usage("accurate", backend),
        },
    ]
    reason = None
    if not ffmpeg_path():
        reason = "ffmpeg was not found on this machine."
    elif not ffprobe_path():
        reason = "ffprobe was not found on this machine."
    elif not backend:
        reason = "No local Whisper backend was installed. Run the helper install step first."

    return {
        "available": available,
        "url": f"http://{HELPER_HOST}:{HELPER_PORT}",
        "protocolVersion": HELPER_PROTOCOL_VERSION,
        "version": HELPER_VERSION,
        "platform": f"{platform.system()} {platform.machine()}",
        "backend": backend,
        "backendLabel": backend_label(backend),
        "ffmpegReady": bool(ffmpeg_path()),
        "ffprobeReady": bool(ffprobe_path()),
        "supportsWordTimestamps": backend in {"mlx-whisper", "faster-whisper", "stub"},
        "supportsAlignment": False,
        "supportsDiarization": False,
        "cacheBytes": file_size(MODELS_DIR) + file_size(HF_CACHE_DIR),
        "models": models,
        "reason": reason,
        "nextAction": helper_next_action(backend),
    }


def backend_label(value: str | None) -> str | None:
    if value == "mlx-whisper":
        return "MLX Whisper"
    if value == "faster-whisper":
        return "faster-whisper"
    if value == "stub":
        return "Stub backend"
    return None


def faster_model_name(profile: str) -> str:
    return "distil-large-v3" if profile == "fast" else "large-v3"


def mlx_model_name(profile: str) -> str:
    return "mlx-community/whisper-large-v3-turbo" if profile == "fast" else "mlx-community/whisper-large-v3"


def model_root(profile: str, backend: str | None) -> Path:
    backend_name = backend or "unknown"
    model_name = faster_model_name(profile) if backend_name == "faster-whisper" else profile
    return MODELS_DIR / backend_name / model_name


def model_downloaded(profile: str, backend: str | None) -> bool:
    if backend == "stub":
        return True
    return any(file_size(path) > 0 for path in model_cache_paths(profile, backend))


def model_disk_usage(profile: str, backend: str | None) -> int | None:
    if backend == "stub":
        return 0
    paths = model_cache_paths(profile, backend)
    if not paths:
        return 0
    return sum(file_size(path) for path in paths)


def compute_device() -> tuple[str, str]:
    forced = os.environ.get("TRANSCRIBBLE_HELPER_DEVICE")
    if forced:
        return forced, os.environ.get("TRANSCRIBBLE_HELPER_COMPUTE_TYPE", "int8")

    if nvidia_available():
        return "cuda", "int8_float16"

    return "cpu", "int8"


@dataclass
class ChunkPlan:
    chunk_index: int
    start_ms: int
    end_ms: int
    primary_start_ms: int
    primary_end_ms: int
    overlap_ms: int

    @property
    def duration_sec(self) -> float:
        return max(0.0, (self.end_ms - self.start_ms) / 1000)


def plan_chunks(duration_sec: float) -> list[ChunkPlan]:
    total_ms = max(0, int(duration_sec * 1000))
    if total_ms <= 0:
        return []

    overlap_ms = CHUNK_OVERLAP_SEC * 1000
    chunk_ms = max(MIN_CHUNK_SEC * 1000, DEFAULT_CHUNK_SEC * 1000)
    plans: list[ChunkPlan] = []
    primary_start_ms = 0
    chunk_index = 0

    while primary_start_ms < total_ms:
        primary_end_ms = min(total_ms, primary_start_ms + chunk_ms)
        start_ms = primary_start_ms if chunk_index == 0 else max(0, primary_start_ms - overlap_ms)
        plans.append(
            ChunkPlan(
                chunk_index=chunk_index,
                start_ms=start_ms,
                end_ms=primary_end_ms,
                primary_start_ms=primary_start_ms,
                primary_end_ms=primary_end_ms,
                overlap_ms=overlap_ms,
            )
        )
        primary_start_ms = primary_end_ms
        chunk_index += 1

    return plans


def merge_chunk_payloads(chunk_results: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(chunk_results, key=lambda item: item["chunkIndex"])
    merged_chunks: list[dict[str, Any]] = []
    text_parts: list[str] = []

    for chunk in ordered:
        payload = chunk["payload"]
        entries = payload.get("chunks") or [
            {
                "text": payload.get("text", ""),
                "timestamp": [0, max(0.0, (chunk["endMs"] - chunk["startMs"]) / 1000)],
            }
        ]

        for entry in entries:
            start_ms = chunk["startMs"] + round((entry["timestamp"][0] or 0) * 1000)
            end_value = entry["timestamp"][1]
            end_ms = None if end_value is None else chunk["startMs"] + round(end_value * 1000)
            midpoint_ms = start_ms if end_ms is None else start_ms + round((end_ms - start_ms) / 2)

            if midpoint_ms < chunk["primaryStartMs"] or midpoint_ms > chunk["primaryEndMs"]:
                continue

            next_chunk = {
                "text": normalize_spacing(entry.get("text", "")),
                "timestamp": [start_ms / 1000, None if end_ms is None else end_ms / 1000],
                "words": [
                    {
                        "text": normalize_spacing(word.get("text", "")),
                        "start": chunk["startMs"] / 1000 + float(word.get("start", 0)),
                        "end": chunk["startMs"] / 1000 + float(word.get("end", 0)),
                        "confidence": word.get("confidence"),
                    }
                    for word in (entry.get("words") or [])
                    if normalize_spacing(word.get("text", ""))
                ],
                "speakerLabel": entry.get("speakerLabel"),
                "attribution": entry.get("attribution"),
            }

            if not next_chunk["text"]:
                continue

            if merged_chunks:
                previous = merged_chunks[-1]
                if (
                    normalize_spacing(previous.get("text", "")).lower()
                    == normalize_spacing(next_chunk["text"]).lower()
                    and (previous.get("speakerLabel") or "") == (next_chunk.get("speakerLabel") or "")
                ):
                    continue

            merged_chunks.append(next_chunk)
            text_parts.append(next_chunk["text"])

    return {
        "text": normalize_spacing(" ".join(text_parts)),
        "chunks": merged_chunks,
        "language": ordered[0].get("payload", {}).get("language"),
    }


class HelperError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class JobStore:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.cancel_events: dict[str, threading.Event] = {}
        self.threads: dict[str, threading.Thread] = {}
        ensure_dir(JOBS_DIR)
        ensure_dir(MODELS_DIR)
        ensure_dir(HF_CACHE_DIR)

    def job_dir(self, job_id: str) -> Path:
        return ensure_dir(JOBS_DIR / job_id)

    def job_path(self, job_id: str) -> Path:
        return self.job_dir(job_id) / "job.json"

    def load(self, job_id: str) -> dict[str, Any]:
        job = load_json(self.job_path(job_id))
        if job is None:
            raise FileNotFoundError(job_id)
        return job

    def save(self, job: dict[str, Any]) -> dict[str, Any]:
        job["updatedAt"] = utc_now()
        self.job_path(job["id"]).write_text(json.dumps(job, ensure_ascii=True, indent=2), encoding="utf-8")
        return job

    def update(self, job_id: str, updater) -> dict[str, Any]:
        with self.lock:
            job = self.load(job_id)
            next_job = updater(job)
            return self.save(next_job)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            try:
                existing = self.load(payload["jobId"])
                return existing
            except FileNotFoundError:
                pass

            job = {
                "id": payload["jobId"],
                "projectId": payload["projectId"],
                "sourceName": payload["sourceName"],
                "sourceType": payload["sourceType"],
                "sourceSize": payload["sourceSize"],
                "mediaKind": payload["mediaKind"],
                "protocolVersion": HELPER_PROTOCOL_VERSION,
                "status": "pending_upload",
                "progress": 0,
                "detail": "Saved on this device. Waiting for the local accelerator source file.",
                "createdAt": utc_now(),
                "updatedAt": utc_now(),
                "backend": preferred_backend(),
                "backendLabel": backend_label(preferred_backend()),
                "modelProfile": payload.get("modelProfile", "fast"),
                "modelName": None,
                "modelDownloadBytes": 0,
                "phraseHints": payload.get("phraseHints") or [],
                "enableAlignment": bool(payload.get("enableAlignment")),
                "enableDiarization": bool(payload.get("enableDiarization")),
                "sourceUploaded": False,
                "totalChunks": 0,
                "completedChunks": 0,
                "resume": {},
                "chunkResults": [],
                "error": None,
                "cancelRequested": False,
            }
            return self.save(job)

    def set_source(self, job_id: str, source_name: str, reader, content_length: int | None) -> dict[str, Any]:
        with self.lock:
            job = self.load(job_id)
            job_dir = self.job_dir(job_id)
            source_dir = ensure_dir(job_dir / "source")
            target_path = source_dir / Path(source_name).name
            with target_path.open("wb") as handle:
                remaining = content_length
                while remaining is None or remaining > 0:
                    chunk = reader.read(64 * 1024 if remaining is None else min(64 * 1024, remaining))
                    if not chunk:
                        break
                    handle.write(chunk)
                    if remaining is not None:
                        remaining -= len(chunk)

            job["sourcePath"] = str(target_path)
            job["sourceUploaded"] = True
            job["status"] = "queued"
            job["progress"] = 4
            job["detail"] = "Source file saved locally. Waiting for the accelerator to start."
            job["error"] = None
            saved = self.save(job)
        self.start(saved["id"])
        return saved

    def start(self, job_id: str) -> None:
        with self.lock:
            thread = self.threads.get(job_id)
            if thread and thread.is_alive():
                return
            cancel_event = self.cancel_events.setdefault(job_id, threading.Event())
            cancel_event.clear()
            thread = threading.Thread(target=self._run_job, args=(job_id,), daemon=True)
            self.threads[job_id] = thread
            thread.start()

    def cancel(self, job_id: str) -> dict[str, Any]:
        cancel_event = self.cancel_events.setdefault(job_id, threading.Event())
        cancel_event.set()
        return self.update(
            job_id,
            lambda job: {
                **job,
                "cancelRequested": True,
                "status": "canceled",
                "progress": 0,
                "detail": "The local accelerator job was canceled.",
                "canceledAt": utc_now(),
            },
        )

    def retry(self, job_id: str) -> dict[str, Any]:
        job = self.update(
            job_id,
            lambda current: {
                **current,
                "status": "queued",
                "progress": 0,
                "detail": "Queued to retry with the local accelerator.",
                "error": None,
                "cancelRequested": False,
                "completedAt": None,
                "canceledAt": None,
                "completedChunks": 0,
                "resume": {},
                "chunkResults": [],
                "transcript": None,
            },
        )
        self.start(job_id)
        return job

    def resume_pending_jobs(self) -> None:
        for job_path in JOBS_DIR.glob("*/job.json"):
            job = load_json(job_path)
            if not job:
                continue
            if job.get("status") in {
                "queued",
                "downloading_model",
                "probing",
                "extracting_audio",
                "chunking",
                "transcribing",
                "merging",
            }:
                self.start(job["id"])

    def _run_job(self, job_id: str) -> None:
        try:
            self._transcribe_job(job_id)
        except HelperError as exc:
            status = "canceled" if exc.code == "job_canceled" else "failed"
            self.update(
                job_id,
                lambda job: {
                    **job,
                    "status": status,
                    "progress": 0,
                    "detail": str(exc),
                    "error": {
                        "code": exc.code,
                        "message": str(exc),
                        "retryable": exc.retryable,
                    },
                    "canceledAt": utc_now() if status == "canceled" else job.get("canceledAt"),
                },
            )
        except Exception as exc:  # pragma: no cover - last-resort crash guard
            self.update(
                job_id,
                lambda job: {
                    **job,
                    "status": "failed",
                    "progress": 0,
                    "detail": str(exc),
                    "error": {
                        "code": "helper_crash",
                        "message": str(exc),
                        "retryable": True,
                    },
                },
            )

    def _transcribe_job(self, job_id: str) -> None:
        job = self.load(job_id)
        source_path = Path(job.get("sourcePath") or "")
        if not source_path.exists():
            raise HelperError("missing_source", "The source file is missing from the local helper.", False)

        self.update_job_status(job_id, "probing", 8, "Probing the recording locally.")
        probe = run_ffprobe(source_path)
        audio_stream_index, duration_sec = assert_usable_audio_stream(probe)

        plans = plan_chunks(duration_sec)
        self.update_job_status(
            job_id,
            "chunking",
            18,
            f"Planning {len(plans)} local chunk{'s' if len(plans) != 1 else ''} with overlap.",
        )
        self.update(
            job_id,
            lambda current: {
                **current,
                "durationSec": duration_sec,
                "totalChunks": len(plans),
                "resume": {
                    **(current.get("resume") or {}),
                    "totalChunks": len(plans),
                },
            },
        )

        chunk_results = {item["chunkIndex"]: item for item in (self.load(job_id).get("chunkResults") or [])}
        chunks_dir = ensure_dir(self.job_dir(job_id) / "chunks")

        for index, plan in enumerate(plans):
            self._raise_if_canceled(job_id)
            if plan.chunk_index in chunk_results:
                continue

            self.update_job_status(
                job_id,
                "extracting_audio",
                15 + round((index / max(1, len(plans))) * 10),
                f"Extracting speech audio for chunk {index + 1} of {len(plans)}.",
            )
            chunk_path = chunks_dir / f"chunk-{plan.chunk_index:04d}.wav"
            extract_chunk(source_path, chunk_path, audio_stream_index, plan)
            self._raise_if_canceled(job_id)

            self.update_job_status(
                job_id,
                "transcribing",
                28 + round((index / max(1, len(plans))) * 58),
                f"Transcribing chunk {index + 1} of {len(plans)} locally.",
            )
            payload, backend, model_name = transcribe_chunk(
                job_id,
                chunk_path,
                self.load(job_id).get("modelProfile", "fast"),
                self.load(job_id).get("phraseHints") or [],
            )
            self._raise_if_canceled(job_id)
            try:
                chunk_path.unlink(missing_ok=True)
            except OSError:
                pass

            chunk_record = {
                "chunkIndex": plan.chunk_index,
                "startMs": plan.start_ms,
                "endMs": plan.end_ms,
                "primaryStartMs": plan.primary_start_ms,
                "primaryEndMs": plan.primary_end_ms,
                "payload": payload,
            }
            chunk_results[plan.chunk_index] = chunk_record

            completed = sorted(chunk_results)
            self.update(
                job_id,
                lambda current: {
                    **current,
                    "backend": backend,
                    "backendLabel": backend_label(backend),
                    "modelName": model_name,
                    "chunkResults": [chunk_results[key] for key in completed],
                    "completedChunks": len(completed),
                    "resume": {
                        "totalChunks": len(plans),
                        "completedChunks": len(completed),
                        "completedChunkIndexes": completed,
                        "nextChunkIndex": next((plan.chunk_index for plan in plans if plan.chunk_index not in chunk_results), None),
                    },
                },
            )

        self._raise_if_canceled(job_id)
        self.update_job_status(job_id, "merging", 96, "Merging the local chunk transcripts.")
        merged = merge_chunk_payloads([chunk_results[item.chunk_index] for item in plans if item.chunk_index in chunk_results])

        self.update(
            job_id,
            lambda current: {
                **current,
                "status": "completed",
                "progress": 100,
                "detail": "Saved on this device. The local accelerator transcript is ready to review.",
                "transcript": merged,
                "completedAt": utc_now(),
                "resume": {
                    "totalChunks": len(plans),
                    "completedChunks": len(plans),
                    "completedChunkIndexes": [plan.chunk_index for plan in plans],
                    "nextChunkIndex": None,
                },
                "error": None,
            },
        )

    def update_job_status(self, job_id: str, status: str, progress: int, detail: str) -> dict[str, Any]:
        return self.update(
            job_id,
            lambda job: {
                **job,
                "status": status,
                "progress": progress,
                "detail": detail,
            },
        )

    def _raise_if_canceled(self, job_id: str) -> None:
        event = self.cancel_events.setdefault(job_id, threading.Event())
        if event.is_set() or self.load(job_id).get("cancelRequested"):
            raise HelperError("job_canceled", "The local accelerator job was canceled.", False)


def track_model_download(
    job_id: str,
    profile: str,
    backend: str,
    action: Callable[[], Any],
) -> Any:
    if model_downloaded(profile, backend):
        return action()

    model_label = "fast" if profile == "fast" else "accurate"
    stop_event = threading.Event()

    def update_download_status() -> None:
        downloaded_bytes = model_disk_usage(profile, backend) or 0
        current_job = STORE.load(job_id)
        if current_job.get("cancelRequested") or current_job.get("status") == "canceled":
            stop_event.set()
            return
        STORE.update(
            job_id,
            lambda job: {
                **job,
                "status": "downloading_model",
                "progress": max(20, int(job.get("progress") or 0)),
                "detail": (
                    f"Downloading the {model_label} local model on this machine. "
                    f"{format_bytes(downloaded_bytes)} cached locally so far."
                ),
                "modelDownloadBytes": downloaded_bytes,
            },
        )

    def poll_download() -> None:
        last_bytes = -1
        while not stop_event.wait(MODEL_DOWNLOAD_POLL_INTERVAL_SEC):
            downloaded_bytes = model_disk_usage(profile, backend) or 0
            if downloaded_bytes == last_bytes:
                continue
            last_bytes = downloaded_bytes
            try:
                update_download_status()
            except FileNotFoundError:
                return

    update_download_status()
    poller = threading.Thread(target=poll_download, daemon=True)
    poller.start()

    try:
        return action()
    finally:
        stop_event.set()
        poller.join(timeout=1)
        try:
            downloaded_bytes = model_disk_usage(profile, backend) or 0
            STORE.update(
                job_id,
                lambda job: {
                    **job,
                    "modelDownloadBytes": downloaded_bytes,
                },
            )
        except FileNotFoundError:
            pass


def humanize_media_command_failure(stderr: str, fallback: str) -> str:
    message = (stderr or "").strip()
    lower = message.lower()

    if "moov atom not found" in lower or "invalid data found" in lower or "end of file" in lower:
        return "This recording looks corrupt or incomplete, so the local accelerator could not read it."

    if "no such file or directory" in lower:
        return "The local accelerator could not reopen the saved source file."

    return message or fallback


def validate_job_create_payload(payload: dict[str, Any]) -> None:
    required_fields = [
        "jobId",
        "projectId",
        "sourceName",
        "sourceType",
        "sourceSize",
        "mediaKind",
    ]
    missing_fields = [field for field in required_fields if not payload.get(field)]
    if missing_fields:
        raise HelperError(
            "invalid_job_payload",
            f"Missing helper job field{'s' if len(missing_fields) != 1 else ''}: {', '.join(missing_fields)}.",
            False,
        )

    if payload.get("mediaKind") not in {"audio", "video"}:
        raise HelperError("invalid_media_kind", "mediaKind must be audio or video.", False)

    if payload.get("modelProfile") not in {None, "fast", "accurate"}:
        raise HelperError("invalid_model_profile", "modelProfile must be fast or accurate.", False)


def run_ffprobe(source_path: Path) -> dict[str, Any]:
    probe_binary = ffprobe_path()
    if not probe_binary:
        raise HelperError("ffprobe_missing", "ffprobe was not found on this machine.", False)

    result = subprocess.run(
        [
            probe_binary,
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(source_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise HelperError(
            "ffprobe_failed",
            humanize_media_command_failure(result.stderr, "ffprobe could not read this recording."),
            False,
        )
    return json.loads(result.stdout)


def assert_usable_audio_stream(probe: dict[str, Any]) -> tuple[int, float]:
    audio_stream = next((stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"), None)
    if not audio_stream or "index" not in audio_stream:
        raise HelperError("no_audio_track", "This recording does not contain a usable audio stream.", False)

    duration_sec = float(probe.get("format", {}).get("duration") or 0)
    if duration_sec <= 0:
        raise HelperError("invalid_duration", "This recording does not report a usable duration.", False)

    return int(audio_stream["index"]), duration_sec


def extract_chunk(source_path: Path, output_path: Path, audio_stream_index: int, plan: ChunkPlan) -> None:
    ffmpeg_binary = ffmpeg_path()
    if not ffmpeg_binary:
        raise HelperError("ffmpeg_missing", "ffmpeg was not found on this machine.", False)

    command = [
        ffmpeg_binary,
        "-y",
        "-v",
        "error",
        "-ss",
        f"{plan.start_ms / 1000:.3f}",
        "-i",
        str(source_path),
        "-map",
        f"0:{audio_stream_index}",
        "-ac",
        "1",
        "-ar",
        str(DEFAULT_SAMPLE_RATE),
        "-t",
        f"{plan.duration_sec:.3f}",
        str(output_path),
    ]

    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise HelperError(
            "ffmpeg_extract_failed",
            humanize_media_command_failure(
                result.stderr,
                "ffmpeg could not extract speech audio from this recording.",
            ),
            True,
        )


_MODEL_CACHE: dict[tuple[str, str], Any] = {}


def transcribe_chunk(
    job_id: str,
    chunk_path: Path,
    profile: str,
    phrase_hints: list[str],
) -> tuple[dict[str, Any], str, str]:
    backend = preferred_backend()
    if backend == "stub":
        return stub_transcription(chunk_path), "stub", "stub-local-model"
    if backend == "mlx-whisper":
        try:
            return track_model_download(
                job_id,
                profile,
                "mlx-whisper",
                lambda: (transcribe_with_mlx(chunk_path, profile), "mlx-whisper", mlx_model_name(profile)),
            )
        except Exception:
            if "faster-whisper" in available_backends():
                return track_model_download(
                    job_id,
                    profile,
                    "faster-whisper",
                    lambda: (
                        transcribe_with_faster_whisper(chunk_path, profile, phrase_hints),
                        "faster-whisper",
                        faster_model_name(profile),
                    ),
                )
            raise
    if backend == "faster-whisper":
        return track_model_download(
            job_id,
            profile,
            "faster-whisper",
            lambda: (
                transcribe_with_faster_whisper(chunk_path, profile, phrase_hints),
                "faster-whisper",
                faster_model_name(profile),
            ),
        )
    raise HelperError("backend_missing", "No supported local Whisper backend was available.", False)


def transcribe_with_faster_whisper(chunk_path: Path, profile: str, phrase_hints: list[str]) -> dict[str, Any]:
    from faster_whisper import WhisperModel

    device, compute_type = compute_device()
    model_name = faster_model_name(profile)
    cache_key = (model_name, f"{device}:{compute_type}")
    model = _MODEL_CACHE.get(cache_key)
    if model is None:
        model = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
            download_root=str(ensure_dir(MODELS_DIR / "faster-whisper")),
        )
        _MODEL_CACHE[cache_key] = model

    segments, info = model.transcribe(
        str(chunk_path),
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        initial_prompt=", ".join(phrase_hints) if phrase_hints else None,
        condition_on_previous_text=False,
    )
    segment_list = list(segments)
    return {
        "text": normalize_spacing(" ".join(segment.text.strip() for segment in segment_list)),
        "chunks": [
            {
                "text": normalize_spacing(segment.text),
                "timestamp": [float(segment.start), float(segment.end)],
                "words": [
                    {
                        "text": normalize_spacing(getattr(word, "word", "")),
                        "start": float(getattr(word, "start", 0)),
                        "end": float(getattr(word, "end", 0)),
                        "confidence": getattr(word, "probability", None),
                    }
                    for word in (getattr(segment, "words", None) or [])
                    if normalize_spacing(getattr(word, "word", ""))
                ],
            }
            for segment in segment_list
            if normalize_spacing(segment.text)
        ],
        "language": getattr(info, "language", None),
    }


def transcribe_with_mlx(chunk_path: Path, profile: str) -> dict[str, Any]:
    import mlx_whisper

    result = mlx_whisper.transcribe(
        str(chunk_path),
        path_or_hf_repo=mlx_model_name(profile),
        word_timestamps=True,
    )
    segments = result.get("segments", [])
    return {
        "text": normalize_spacing(result.get("text", "")),
        "chunks": [
            {
                "text": normalize_spacing(segment.get("text", "")),
                "timestamp": [float(segment.get("start", 0)), float(segment.get("end", 0))],
                "words": [
                    {
                        "text": normalize_spacing(word.get("word", "")),
                        "start": float(word.get("start", 0)),
                        "end": float(word.get("end", 0)),
                        "confidence": word.get("probability"),
                    }
                    for word in (segment.get("words") or [])
                    if normalize_spacing(word.get("word", ""))
                ],
            }
            for segment in segments
            if normalize_spacing(segment.get("text", ""))
        ],
        "language": result.get("language"),
    }


def stub_transcription(chunk_path: Path) -> dict[str, Any]:
    stem = chunk_path.stem.replace("-", " ")
    return {
        "text": normalize_spacing(f"Stub transcript for {stem}"),
        "chunks": [
            {
                "text": normalize_spacing(f"Stub transcript for {stem}"),
                "timestamp": [0.0, 12.0],
            }
        ],
        "language": "en",
    }


STORE = JobStore()


class Handler(BaseHTTPRequestHandler):
    server_version = f"TranscribbleHelper/{HELPER_VERSION}"

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._write_headers()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/health":
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "protocolVersion": HELPER_PROTOCOL_VERSION,
                        "version": HELPER_VERSION,
                        "available": helper_available(),
                        "backend": preferred_backend(),
                    },
                )
                return

            if path == "/capabilities":
                self._send_json(200, capabilities_payload())
                return

            if path.startswith("/jobs/"):
                job_id = path.split("/")[2]
                self._send_json(200, {"job": STORE.load(job_id)})
                return

            self._send_json(404, {"error": "Not found"})
        except FileNotFoundError:
            self._send_json(404, {"error": "Job not found"})
        except Exception as exc:  # pragma: no cover - defensive surface
            self._send_json(500, {"error": str(exc)})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/jobs":
                payload = self._read_json()
                validate_job_create_payload(payload)
                job = STORE.create(payload)
                self._send_json(200, {"job": job})
                return

            if path.startswith("/jobs/") and path.endswith("/cancel"):
                job_id = path.split("/")[2]
                job = STORE.cancel(job_id)
                self._send_json(200, {"job": job})
                return

            if path.startswith("/jobs/") and path.endswith("/retry"):
                job_id = path.split("/")[2]
                job = STORE.retry(job_id)
                self._send_json(200, {"job": job})
                return

            self._send_json(404, {"error": "Not found"})
        except HelperError as exc:
            self._send_json(
                400,
                {
                    "error": str(exc),
                    "code": exc.code,
                },
            )
        except Exception as exc:  # pragma: no cover - defensive surface
            self._send_json(500, {"error": str(exc)})

    def do_PUT(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path.startswith("/jobs/") and path.endswith("/source"):
                job_id = path.split("/")[2]
                source_name = unquote(self.headers.get("x-transcribble-source-name", "")).strip() or f"{job_id}.bin"
                content_length_header = self.headers.get("content-length")
                content_length = int(content_length_header) if content_length_header else None
                job = STORE.set_source(job_id, source_name, self.rfile, content_length)
                self._send_json(200, {"job": job})
                return

            self._send_json(404, {"error": "Not found"})
        except HelperError as exc:
            self._send_json(400, {"error": str(exc), "code": exc.code})
        except Exception as exc:  # pragma: no cover - defensive surface
            self._send_json(500, {"error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
        return

    def _read_json(self) -> dict[str, Any]:
        content_length = int(self.headers.get("content-length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"
        return json.loads(raw_body.decode("utf-8"))

    def _write_headers(self) -> None:
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET,POST,PUT,OPTIONS")
        self.send_header("access-control-allow-headers", "content-type,x-transcribble-source-name")
        self.send_header("cache-control", "no-store")

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json_dumps(payload)
        self.send_response(status)
        self._write_headers()
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    ensure_dir(HELPER_ROOT)
    ensure_dir(JOBS_DIR)
    ensure_dir(MODELS_DIR)
    ensure_dir(HF_CACHE_DIR)
    STORE.resume_pending_jobs()
    server = ThreadingHTTPServer((HELPER_HOST, HELPER_PORT), Handler)
    print(f"Transcribble Helper listening on http://{HELPER_HOST}:{HELPER_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
