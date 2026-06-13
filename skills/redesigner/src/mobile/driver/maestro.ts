import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { run, which } from "./exec.js";

export function maestroCmd(): string {
  return process.env.QA_MAESTRO ?? "maestro";
}

export async function maestroInstalled(): Promise<boolean> {
  const cmd = maestroCmd();
  // QA_MAESTRO may be an explicit path (e.g. the Windows .bat) — verify directly.
  if (isAbsolute(cmd)) return existsSync(cmd);
  return which(cmd);
}

export interface RunFlowOptions {
  device: string;
  flowPath: string;
  /** Credentials/params injected as `--env KEY=VALUE`; never written to YAML. */
  env: Record<string, string>;
  /** cwd for the run, so `takeScreenshot: <name>` lands here (the artifacts `screens/`). */
  screensDir: string;
  /** `--debug-output` target for Maestro's failure artifacts. */
  debugDir: string;
  /** Authoring mode: pass `--continuous` so Maestro re-runs the flow on every save. */
  continuous?: boolean;
}

export interface RunFlowResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a Maestro flow against a resolved device. Runs with cwd=screensDir so
 * `takeScreenshot: <name>` lands in the artifacts folder, and points --debug-output
 * at debugDir for failure artifacts.
 */
export function runFlow(opts: RunFlowOptions): Promise<RunFlowResult> {
  const args = ["test", "--device", opts.device, "--debug-output", opts.debugDir];
  if (opts.continuous) args.push("--continuous");
  for (const [k, v] of Object.entries(opts.env)) args.push("--env", `${k}=${v}`);
  args.push(opts.flowPath);

  return new Promise((resolve) => {
    const child = spawn(maestroCmd(), args, {
      cwd: opts.screensDir,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 127, stdout, stderr: stderr + String(err) }));
  });
}

/**
 * Foreground an app on the device via an ephemeral `launchApp` flow (cross-platform,
 * reuses the Maestro runner instead of raw adb/xcrun). `launchApp` RESUMES the app —
 * it does not reset it — so a session the user logged into by hand is preserved.
 * Returns true on success. Never throws.
 */
export async function launchApp(device: string, appId: string): Promise<boolean> {
  const dir = mkdtempSync(join(tmpdir(), "redesigner-launch-"));
  const flow = join(dir, "launch.yaml");
  writeFileSync(flow, `appId: ${appId}\n---\n- launchApp\n`);
  try {
    const r = await run(maestroCmd(), ["test", "--device", device, flow]);
    return r.code === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Best-effort: dump the current on-screen view hierarchy (mobile analog of HTML).
 * Returns raw stdout, or null if Maestro can't produce it. Never throws.
 */
export async function runHierarchy(device: string): Promise<string | null> {
  // `--device` is a GLOBAL maestro option: it must precede the subcommand. The `hierarchy`
  // subcommand itself rejects `--device`, so it goes before it (unlike `test --device`).
  const r = await run(maestroCmd(), ["--device", device, "hierarchy"]);
  if (r.code !== 0 || !r.stdout.trim()) return null;
  return r.stdout;
}
