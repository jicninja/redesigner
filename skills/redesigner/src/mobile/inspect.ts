import path from "node:path";
import process from "node:process";
import type { Platform } from "./types.js";
import { ensureDir, writeFileSafe } from "../util/fs.js";
import { resolveDevice } from "./driver/resolve.js";
import { runHierarchy } from "./driver/maestro.js";
import { captureScreenshot } from "./driver/screenshot.js";

/** Progress goes to stderr so stdout stays exactly one JSON line (the agent parses it). */
function progress(msg: string): void {
  process.stderr.write(`[redesigner:mobile] ${msg}\n`);
}

function result(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
  if (obj.ok === false) process.exitCode = 1;
}

export interface MobileInspectOptions {
  platform: Platform;
  device: string;
  out: string;
}

/**
 * Read-only inspection of the CURRENT on-screen view: dumps the view hierarchy (mobile
 * analog of HTML) plus a screenshot, WITHOUT authoring or running a flow and WITHOUT
 * launching/relaunching the app. The agent calls this first so it can write reliable
 * text/id selectors in one pass instead of guessing relative points and re-running.
 */
export async function runMobileInspect(opts: MobileInspectOptions): Promise<void> {
  const outAbs = path.resolve(process.cwd(), opts.out);
  const screensDir = path.join(outAbs, "screens");
  await ensureDir(screensDir);

  let device: string;
  try {
    device = await resolveDevice(opts.platform, opts.device);
  } catch (e) {
    return result({ ok: false, error: (e as Error).message });
  }

  const warnings: string[] = [];
  const shotRel = "screens/_inspect.png";
  const hierRel = "screens/_inspect.hierarchy.json";

  // Screenshot (best-effort: a missing screenshot must not block the hierarchy dump).
  let shot: string | undefined;
  try {
    progress("Capturing current screen (read-only, no app launch)…");
    await captureScreenshot(opts.platform, device, path.join(outAbs, shotRel));
    shot = shotRel;
  } catch (e) {
    warnings.push(`screenshot: ${String(e).slice(0, 160)}`);
  }

  // View hierarchy of the current screen.
  let hierarchy: string | undefined;
  try {
    const h = await runHierarchy(device);
    if (h) {
      await writeFileSafe(path.join(outAbs, hierRel), h);
      hierarchy = hierRel;
    } else {
      warnings.push("hierarchy: Maestro returned nothing for the current screen");
    }
  } catch (e) {
    warnings.push(`hierarchy: ${String(e).slice(0, 160)}`);
  }

  result({
    ok: Boolean(shot || hierarchy),
    device,
    platform: opts.platform,
    screenshot: shot ? path.join(outAbs, shot) : undefined,
    hierarchy: hierarchy ? path.join(outAbs, hierarchy) : undefined,
    warnings,
  });
}
