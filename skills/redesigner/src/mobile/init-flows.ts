import path from "node:path";
import { existsSync } from "node:fs";
import process from "node:process";
import { writeFileSafe } from "../util/fs.js";
import { REDESIGN_DIR, FLOWS_SUBDIR } from "../util/paths.js";

export interface InitFlowsOptions {
  /** PROJECT dir; flows are seeded under `<out>/redesign/flows/`. */
  out: string;
  /** appId to seed into the flow headers (optional; left as a placeholder if absent). */
  app?: string;
}

function result(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
  if (obj.ok === false) process.exitCode = 1;
}

/** Reusable subflow: screenshot the CURRENT screen, parameterized by NAME. */
function screenshotSubflow(appId: string): string {
  return `# _screenshot.yaml — reusable subflow: screenshot whatever is on screen right now.
# Call it from survey.yaml:
#   - runFlow: { file: _screenshot.yaml, env: { NAME: "050_extra" } }
appId: ${appId}
---
- takeScreenshot: \${NAME}
`;
}

/** Editable survey skeleton: resumes the app (keeps manual login) and walks the nav. */
function surveyFlow(appId: string): string {
  return `# survey.yaml — redesigner survey flow. READ-ONLY.
# Walk the app's main navigation and screenshot each screen.
#
# LOGIN: handled automatically BEFORE this flow runs. The engine launches the app and,
# if it detects a login screen, waits while you log in BY HAND on the device (it never
# receives your credentials). This flow then just resumes that logged-in session.
#
# RULES (do not break):
#   - NEVER tap log out / delete / pay / checkout / submit.
#   - NEVER use clearState — it would drop the MANUAL login you did on the device.
#   - launchApp RESUMES the app; it does not reset it.
#
# Author selectors from screens/_inspect.hierarchy.json (run \`mobile-inspect\` first).
# Selector ladder (use the most stable the hierarchy offers):
#   1. id / accessibility id  ->  tapOn: { id: "tab_pending" }
#   2. visible text           ->  tapOn: "Pendientes"
#   3. relative selectors     ->  tapOn: { below: "Header" } | childOf | containsDescendants
#   4. relative point         ->  tapOn: { point: "17%, 8%" }   # LAST RESORT (breaks across sizes)
appId: ${appId}
---
- launchApp
- takeScreenshot: 010_home

# --- Walk the main navigation (uncomment + edit to match the app) ----------------
# - tapOn: "Pendientes"
# - takeScreenshot: 020_pendientes
#
# - tapOn: { id: "tab_profile" }
# - takeScreenshot: 030_profile
#
# - tapOn: { below: "Header" }          # icon-only control: relative selector
# - takeScreenshot: 040_detail
#
# Reusable screenshot without retyping the boilerplate:
# - runFlow: { file: _screenshot.yaml, env: { NAME: "050_extra" } }
`;
}

/**
 * Seed `<out>/redesign/flows/` with an editable survey flow + a reusable screenshot
 * subflow, so the agent edits a ready template instead of hand-writing boilerplate. Never
 * overwrites existing flows (they may hold the user's authored navigation).
 */
export async function runMobileInitFlows(opts: InitFlowsOptions): Promise<void> {
  const appId = opts.app && opts.app.trim() ? opts.app.trim() : "<APP_ID>";
  const flowsDir = path.resolve(process.cwd(), opts.out, REDESIGN_DIR, FLOWS_SUBDIR);

  const files: { rel: string; content: string }[] = [
    { rel: "_screenshot.yaml", content: screenshotSubflow(appId) },
    { rel: "survey.yaml", content: surveyFlow(appId) },
  ];

  const written: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const abs = path.join(flowsDir, f.rel);
    if (existsSync(abs)) {
      skipped.push(f.rel);
      continue;
    }
    await writeFileSafe(abs, f.content);
    written.push(f.rel);
  }

  result({ ok: true, flowsDir, written, skipped, appId });
}
