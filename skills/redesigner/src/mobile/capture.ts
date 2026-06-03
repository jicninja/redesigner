import { existsSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import type { MobileConfig } from "./config.js";
import type { CapturedScreen, MobileManifest } from "./types.js";
import { ensureDir, writeJson } from "../util/fs.js";
import { assertPlatformSupported, resolveDevice } from "./driver/resolve.js";
import { maestroInstalled, runFlow, runHierarchy } from "./driver/maestro.js";
import { secretsAsEnv, scrub } from "./secrets.js";
import { startWatch } from "./watch.js";
import { buildMobileTokens } from "./tokens.js";
import { extractMobileLogo } from "./logo.js";
import { writeMobilePreview } from "./preview.js";
import { writeMobileReportSkeletons } from "./md-templates.js";

/** Progress goes to stderr so stdout stays exactly one JSON line (the agent parses it). */
function progress(msg: string): void {
  process.stderr.write(`[redesigner:mobile] ${msg}\n`);
}

/** Emit the single machine-readable result line and set the exit code. */
function result(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
  if (obj.ok === false) process.exitCode = 1;
}

/** Resolve `--flows` into an ordered list of flow files (a single file or a directory). */
function listFlows(flowsAbs: string): string[] {
  const st = statSync(flowsAbs);
  if (st.isDirectory()) {
    return readdirSync(flowsAbs)
      .filter((f) => /\.ya?ml$/i.test(f))
      .sort()
      .map((f) => path.join(flowsAbs, f));
  }
  return [flowsAbs];
}

/** Image files captured by `takeScreenshot`, sorted by name (milestone order). */
function listImages(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Mobile capture pipeline: resolve device → run the agent-authored Maestro flow(s) against a
 * native app (MANUAL login on the device) → collect milestone screenshots + a best-effort
 * view-hierarchy snapshot → write `manifest.json` (source:"mobile"). READ-ONLY: flows must
 * only navigate/read; the engine never receives credentials except via optional `--creds`.
 */
export async function runMobileCapture(config: MobileConfig): Promise<void> {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const screensDir = path.join(config.outAbs, "screens");
  const debugDir = path.join(config.outAbs, "debug");
  await ensureDir(screensDir);

  progress(
    "SECURITY: login is MANUAL on the device — the engine never receives your username/" +
      "password. Use a TEST account. Flows must only navigate/read (no delete/submit/purchase).",
  );

  try {
    assertPlatformSupported(config.platform);
  } catch (e) {
    return result({ ok: false, error: (e as Error).message });
  }

  if (!existsSync(config.flowsAbs)) {
    return result({ ok: false, error: `Flows path not found: ${config.flowsAbs}` });
  }

  let device: string;
  try {
    device = await resolveDevice(config.platform, config.device);
  } catch (e) {
    return result({ ok: false, error: (e as Error).message });
  }

  if (!(await maestroInstalled())) {
    return result({
      ok: false,
      error: "Maestro not installed. Install from https://maestro.dev (needs Java 17+).",
    });
  }

  // Credentials → env (UPPERCASE). Never written to the flow YAML or git.
  let env: Record<string, string> = {};
  if (config.creds) {
    try {
      env = secretsAsEnv(config.creds);
    } catch (e) {
      return result({ ok: false, error: (e as Error).message });
    }
  }

  const flows = listFlows(config.flowsAbs);
  if (flows.length === 0) {
    return result({ ok: false, error: `No .yaml flows found in ${config.flowsAbs}` });
  }

  let watchPid: number | undefined;
  if (config.watch) watchPid = startWatch(config.platform, device);

  // Authoring mode: `maestro test --continuous` re-runs the flow on every save and never
  // exits on its own, so the artifact pipeline (tokens/manifest, which need a finite run)
  // is skipped. Iterate on selectors here, then run again WITHOUT --continuous to capture.
  if (config.continuous) {
    const flow = flows[0];
    progress(
      `Authoring mode (--continuous): re-running ${path.basename(flow)} on every save. ` +
        "Ctrl-C to stop, then run again without --continuous for the real capture.",
    );
    const r = await runFlow({ device, flowPath: flow, env, screensDir, debugDir, continuous: true });
    return result({
      ok: r.code === 0,
      mode: "continuous",
      exitCode: r.code,
      outAbs: config.outAbs,
      screensDir,
      watchPid,
    });
  }

  let combinedLog = "";
  let lastFailCode = 0;
  for (const flow of flows) {
    progress(`Running flow: ${path.basename(flow)}`);
    const r = await runFlow({ device, flowPath: flow, env, screensDir, debugDir });
    combinedLog += `\n=== ${path.basename(flow)} (exit ${r.code}) ===\n${r.stdout}\n--- stderr ---\n${r.stderr}\n`;
    if (r.code !== 0) {
      lastFailCode = r.code;
      warnings.push(`flow ${path.basename(flow)} exited ${r.code}`);
    }
  }

  // Best-effort hierarchy snapshot of the final on-screen view (mobile analog of HTML).
  let finalHierarchyRel: string | undefined;
  try {
    const h = await runHierarchy(device);
    if (h) {
      const rel = "screens/_final.hierarchy.json";
      writeFileSync(path.join(config.outAbs, rel), h);
      finalHierarchyRel = rel;
    }
  } catch (e) {
    warnings.push(`hierarchy: ${String(e).slice(0, 120)}`);
  }

  // Build the screen list from the captured milestone screenshots.
  const images = listImages(screensDir);
  const screens: CapturedScreen[] = images.map((file, i) => {
    const label = file.replace(/\.(png|jpe?g)$/i, "");
    const entry: CapturedScreen = { label, screenshot: `screens/${file}` };
    if (i === images.length - 1 && finalHierarchyRel) entry.hierarchy = finalHierarchyRel;
    return entry;
  });

  const auth = config.creds ? "credentials-injected" : "manual-on-device";

  // Derive artifacts from the captured screenshots (no DOM/CSS on mobile).
  if (screens.length > 0) {
    try {
      await buildMobileTokens(config.outAbs);
    } catch (e) {
      warnings.push(`tokens: ${String(e).slice(0, 120)}`);
    }
    try {
      await extractMobileLogo(config.outAbs);
    } catch (e) {
      warnings.push(`logo: ${String(e).slice(0, 120)}`);
    }
    try {
      await writeMobilePreview(config.outAbs, screens, {
        appId: config.app,
        platform: config.platform,
        device,
        auth,
      });
    } catch (e) {
      warnings.push(`preview: ${String(e).slice(0, 120)}`);
    }
  } else {
    warnings.push("no screenshots captured — check the flow's takeScreenshot steps");
  }
  await writeMobileReportSkeletons(config.outAbs, config.app);

  const manifest: MobileManifest = {
    source: "mobile",
    appId: config.app,
    platform: config.platform,
    device,
    auth,
    startedAt,
    finishedAt: new Date().toISOString(),
    flows: flows.map((f) => path.basename(f)),
    screens,
    // web-shaped alias so the existing preview / navigable-mock keep working.
    pages: screens.map((s) => ({ url: `${config.app}#${s.label}`, slug: s.label, title: s.label })),
    warnings,
  };

  await writeJson(path.join(config.outAbs, "manifest.json"), manifest);
  writeFileSync(path.join(config.outAbs, "mobile.log"), scrub(combinedLog));
  appendFileSync(
    path.join(config.outAbs, "actions.jsonl"),
    scrub(
      JSON.stringify({
        ts: new Date().toISOString(),
        action: "mobile-capture",
        appId: config.app,
        platform: config.platform,
        device,
        flows: manifest.flows,
        screens: screens.length,
      }),
    ) + "\n",
  );

  progress(`Captured ${screens.length} screen(s) → ${screensDir}`);
  result({
    ok: lastFailCode === 0,
    exitCode: lastFailCode,
    outAbs: config.outAbs,
    screensCount: screens.length,
    screenshots: screens.map((s) => path.join(config.outAbs, s.screenshot)),
    watchPid,
    warnings,
  });
}
