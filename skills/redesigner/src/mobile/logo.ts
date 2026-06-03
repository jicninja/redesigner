import path from "node:path";
import { readdirSync, copyFileSync } from "node:fs";
import { ensureDir, writeJson } from "../util/fs.js";
import { log } from "../util/log.js";
import { cropBand } from "./image.js";

/** Top fraction of a screen that usually holds the app/brand header. */
const HEADER_BAND = 0.14;

/**
 * Mobile has no DOM, so there's no `<img>`/favicon to extract. We approximate the brand mark
 * by cropping the HEADER BAND of the first captured screen (where the logo/app name usually
 * sits) into `logo/logo.png` + `logo/candidates/`. The VLM verifies and describes it in
 * logo-analysis.md (SKILL). A real launcher-icon pull (adb/APK extraction) can be added later.
 */
export async function extractMobileLogo(outAbs: string): Promise<number> {
  const screensDir = path.join(outAbs, "screens");
  const files = readdirSync(screensDir)
    .filter((f) => /\.png$/i.test(f))
    .sort();
  if (files.length === 0) return 0;

  const logoDir = path.join(outAbs, "logo");
  const candDir = path.join(logoDir, "candidates");
  await ensureDir(candDir);

  const firstScreen = path.join(screensDir, files[0]);
  const candidate = path.join(candDir, "0.png");
  cropBand(firstScreen, candidate, 0, HEADER_BAND);
  copyFileSync(candidate, path.join(logoDir, "logo.png"));

  await writeJson(path.join(logoDir, "candidates.json"), {
    candidates: [
      {
        file: "0.png",
        source: "header-crop",
        fromScreen: files[0],
        note: "Top band of the first screen — the app's logo/name usually sits here.",
      },
    ],
    note:
      "Mobile has no DOM: this is a header crop, not an extracted asset. The VLM verifies it " +
      "in logo-analysis.md. A launcher-icon pull (adb/APK) can be added in a later pass.",
  });

  log.info(`Mobile logo: header crop from ${files[0]} → logo/logo.png`);
  return 1;
}
