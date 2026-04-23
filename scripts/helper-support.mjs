import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const helperDir = path.join(repoRoot, "helper");
export const venvDir = path.join(helperDir, ".venv");
export const helperScriptPath = path.join(helperDir, "transcribble_helper.py");
export const helperHost = process.env.TRANSCRIBBLE_HELPER_HOST ?? "127.0.0.1";
export const helperPort = process.env.TRANSCRIBBLE_HELPER_PORT ?? "7771";
export const helperBaseUrl = `http://${helperHost}:${helperPort}`;
export const isMacOs = process.platform === "darwin";
export const isAppleSilicon = isMacOs && process.arch === "arm64";

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error ?? null,
  };
}

function commandPath(command) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = runCapture(locator, [command]);
  if (!result.ok || !result.stdout) {
    return null;
  }

  return result.stdout.split("\n")[0]?.trim() || null;
}

function firstNonEmptyLine(...values) {
  for (const value of values) {
    const line = value
      .split("\n")
      .map((entry) => entry.trim())
      .find(Boolean);

    if (line) {
      return line;
    }
  }

  return null;
}

function pythonProbe(command) {
  const probe = runCapture(command, [
    "-c",
    [
      "import importlib.util, json, platform, sys",
      "machine = platform.machine().lower()",
      'is_apple_silicon = sys.platform == "darwin" and machine in {"arm64", "aarch64"}',
      'modules = {"faster_whisper": importlib.util.find_spec("faster_whisper") is not None, "mlx_whisper": importlib.util.find_spec("mlx_whisper") is not None}',
      'preferred_backend = "mlx-whisper" if is_apple_silicon and modules["mlx_whisper"] else "faster-whisper" if modules["faster_whisper"] else None',
      'print(json.dumps({"pythonVersion": sys.version.split()[0], "pythonExecutable": sys.executable, "modules": modules, "preferredBackend": preferred_backend}))',
    ].join("; "),
  ]);

  if (!probe.ok) {
    return {
      ok: false,
      error:
        firstNonEmptyLine(probe.stderr, probe.stdout) ??
        "Python dependency probe failed.",
    };
  }

  try {
    return {
      ok: true,
      ...JSON.parse(probe.stdout),
    };
  } catch {
    return {
      ok: false,
      error: "Python dependency probe returned invalid output.",
    };
  }
}

function platformLabel() {
  const platformName =
    process.platform === "darwin"
      ? "macOS"
      : process.platform === "win32"
        ? "Windows"
        : process.platform === "linux"
          ? "Linux"
          : process.platform;

  return `${platformName} ${process.arch}`;
}

export function venvPythonPath() {
  if (process.platform === "win32") {
    return path.join(venvDir, "Scripts", "python.exe");
  }

  return path.join(venvDir, "bin", "python");
}

export function findSystemPython() {
  for (const candidate of ["python3", "python"]) {
    const probe = pythonProbe(candidate);
    if (!probe.ok) {
      continue;
    }

    return {
      command: candidate,
      version: probe.pythonVersion,
      executable: probe.pythonExecutable,
    };
  }

  return null;
}

export function inspectBinary(command) {
  const result = runCapture(command, ["-version"]);
  if (!result.ok) {
    return {
      found: false,
      command,
      path: null,
      versionLine: null,
    };
  }

  return {
    found: true,
    command,
    path: commandPath(command),
    versionLine: firstNonEmptyLine(result.stdout, result.stderr),
  };
}

export function inspectVenv() {
  const pythonPath = venvPythonPath();
  if (!existsSync(pythonPath)) {
    return {
      present: false,
      pythonPath,
      ok: false,
      modules: {
        faster_whisper: false,
        mlx_whisper: false,
      },
      preferredBackend: null,
      pythonVersion: null,
      pythonExecutable: null,
      error: null,
    };
  }

  const probe = pythonProbe(pythonPath);
  if (!probe.ok) {
    return {
      present: true,
      pythonPath,
      ok: false,
      modules: {
        faster_whisper: false,
        mlx_whisper: false,
      },
      preferredBackend: null,
      pythonVersion: null,
      pythonExecutable: null,
      error: probe.error,
    };
  }

  return {
    present: true,
    pythonPath,
    ok: true,
    modules: probe.modules,
    preferredBackend: probe.preferredBackend,
    pythonVersion: probe.pythonVersion,
    pythonExecutable: probe.pythonExecutable,
    error: null,
  };
}

export function collectPreflight() {
  return {
    platformLabel: platformLabel(),
    systemPython: findSystemPython(),
    venv: inspectVenv(),
    ffmpeg: inspectBinary("ffmpeg"),
    ffprobe: inspectBinary("ffprobe"),
  };
}

export function formatBackendLabel(backend) {
  if (backend === "mlx-whisper") {
    return "MLX Whisper";
  }

  if (backend === "faster-whisper") {
    return "faster-whisper";
  }

  if (backend === "stub") {
    return "Stub backend";
  }

  return "none";
}

export function collectBlockingIssues(preflight) {
  const issues = [];

  if (!preflight.systemPython) {
    issues.push("Python 3 was not found.");
  }

  if (!preflight.ffmpeg.found) {
    issues.push("ffmpeg was not found.");
  }

  if (!preflight.ffprobe.found) {
    issues.push("ffprobe was not found.");
  }

  if (!preflight.venv.present) {
    issues.push(`The helper virtualenv is missing at ${preflight.venv.pythonPath}.`);
    return issues;
  }

  if (!preflight.venv.ok) {
    issues.push(preflight.venv.error ?? "The helper virtualenv could not be inspected.");
    return issues;
  }

  if (!preflight.venv.preferredBackend) {
    issues.push("No local Whisper backend is importable inside the helper virtualenv.");
  }

  return issues;
}

export function ffmpegInstallHint() {
  if (isMacOs) {
    return "brew install ffmpeg";
  }

  return "Install native ffmpeg and ffprobe, then rerun the helper commands.";
}

export async function fetchRunningHelper(timeoutMs = 1_500) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const healthResponse = await fetch(`${helperBaseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!healthResponse.ok) {
      return {
        reachable: false,
        error: `Health request failed with ${healthResponse.status}.`,
      };
    }

    const capabilitiesResponse = await fetch(`${helperBaseUrl}/capabilities`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!capabilitiesResponse.ok) {
      return {
        reachable: false,
        error: `Capabilities request failed with ${capabilitiesResponse.status}.`,
      };
    }

    return {
      reachable: true,
      health: await healthResponse.json(),
      capabilities: await capabilitiesResponse.json(),
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : `Could not reach ${helperBaseUrl}.`,
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function printPreflightSummary(prefix, preflight) {
  const pythonLine = preflight.systemPython
    ? `${preflight.systemPython.executable} (${preflight.systemPython.version})`
    : "missing";
  const venvLine = preflight.venv.present
    ? `${preflight.venv.pythonExecutable ?? preflight.venv.pythonPath}${preflight.venv.pythonVersion ? ` (${preflight.venv.pythonVersion})` : ""}`
    : "missing";
  const backendLine = preflight.venv.present
    ? preflight.venv.preferredBackend
      ? formatBackendLabel(preflight.venv.preferredBackend)
      : "missing"
    : "not installed";

  console.log(`${prefix} platform: ${preflight.platformLabel}`);
  console.log(`${prefix} python: ${pythonLine}`);
  console.log(`${prefix} helper venv: ${venvLine}`);
  console.log(`${prefix} ffmpeg: ${preflight.ffmpeg.found ? preflight.ffmpeg.path ?? "found" : "missing"}`);
  console.log(`${prefix} ffprobe: ${preflight.ffprobe.found ? preflight.ffprobe.path ?? "found" : "missing"}`);
  console.log(`${prefix} preferred backend: ${backendLine}`);
}
