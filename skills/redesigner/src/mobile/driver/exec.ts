import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Locate the adb binary: env override → bundled copy (this host) → PATH. */
export function adbPath(): string {
  if (process.env.QA_ADB && existsSync(process.env.QA_ADB)) return process.env.QA_ADB;
  const bundled = "C:\\Users\\Lucas\\Lucas\\end\\adb.exe";
  if (process.platform === "win32" && existsSync(bundled)) return bundled;
  return "adb";
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run a command, never throwing — returns code so callers decide. */
export async function run(cmd: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { maxBuffer: 1024 * 1024 * 16 });
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 };
  } catch (err: unknown) {
    const e = err as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      code?: number;
      message?: string;
    };
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? e.message ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

/** Check whether an executable resolves on PATH (or as given). */
export async function which(cmd: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const { code } = await run(probe, [cmd]);
  return code === 0;
}
