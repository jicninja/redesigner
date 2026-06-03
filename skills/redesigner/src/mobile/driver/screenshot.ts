import { spawn } from "node:child_process";
import { writeFileSafe } from "../../util/fs.js";
import type { Platform } from "../types.js";
import { adbPath, run } from "./exec.js";

/**
 * Capture a one-off screenshot of whatever is currently on screen, WITHOUT launching or
 * touching the app (read-only). Used by `mobile-inspect` so the agent can eyeball the
 * starting screen before authoring a flow.
 *
 * - Android: `adb exec-out screencap -p` streams the PNG on stdout (binary-safe via spawn).
 * - iOS: `xcrun simctl io <device> screenshot <file>` writes straight to disk (macOS only).
 */
export async function captureScreenshot(
  platform: Platform,
  device: string,
  destFile: string,
): Promise<void> {
  if (platform === "android") {
    const png = await adbScreencap(device);
    await writeFileSafe(destFile, png);
    return;
  }
  // iOS: simctl writes the file itself; ensure the parent dir exists first.
  await writeFileSafe(destFile, Buffer.alloc(0));
  const r = await run("xcrun", ["simctl", "io", device, "screenshot", destFile]);
  if (r.code !== 0) throw new Error(`simctl screenshot failed: ${r.stderr.slice(0, 200)}`);
}

/** Stream `screencap -p` stdout as a Buffer (execFile's string mode would corrupt PNG bytes). */
function adbScreencap(device: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(adbPath(), ["-s", device, "exec-out", "screencap", "-p"], {
      shell: process.platform === "win32",
    });
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && chunks.length === 0) {
        reject(new Error(`adb screencap failed (exit ${code}): ${err.slice(0, 200)}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}
