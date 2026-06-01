import path from "node:path";
import type { CaptureConfig } from "../config.js";
import { log } from "../util/log.js";
import { ensureDir, writeJson } from "../util/fs.js";
import {
  launchSession,
  saveStorageState,
  closeSession,
  type Session,
} from "./browser.js";
import { login } from "./login.js";
import { crawl } from "./crawl.js";
import { capturePage, type PageArtifacts } from "./page-capture.js";
import { CssCollector } from "./css-collector.js";
import { AssetCollector } from "./asset-collector.js";
import { rewriteCapturedAssets } from "./asset-rewrite.js";
import { extractFineDetails } from "./fine-details.js";
import { detectLogo } from "./logo.js";
import { buildTokens } from "./tokens.js";
import { writeReportSkeletons } from "../report/md-templates.js";
import { writePreview } from "../report/preview.js";

export interface Manifest {
  url: string;
  startedAt: string;
  finishedAt: string;
  auth: string;
  pagesVisited: number;
  pages: { url: string; slug: string; title: string }[];
  skippedDestructive: { url: string; reason: string }[];
  cssSheets: number;
  assetsDownloaded: number;
  logoCandidates: number;
  warnings: string[];
}

/**
 * Full capture pipeline: login → non-destructive crawl → per-page
 * capture → fine details + logo + tokens → manifest + report skeletons.
 */
export async function runCapture(config: CaptureConfig): Promise<void> {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  await ensureDir(config.outAbs);

  log.box(
    "⚠️  SECURITY: login is MANUAL in the browser window — the engine\n" +
      "NEVER receives your username/password. Use a TEST/testing account, never\n" +
      "a production one. The crawler is READ-ONLY (it does not delete, edit or submit\n" +
      "forms, except the login you do by hand).",
  );

  const session: Session = await launchSession(config);
  const css = new CssCollector();
  css.attach(session.context);
  const assets = new AssetCollector(config.outAbs);
  assets.attach(session.context);

  const captured: PageArtifacts[] = [];

  try {
    const page = await session.context.newPage();

    const loginResult = await login(page, config);
    if (loginResult.status === "failed") {
      log.error(`Login failed: ${loginResult.reason}`);
      warnings.push(`login: ${loginResult.reason}`);
      await writeManifest(config, {
        startedAt,
        auth: `failed: ${loginResult.reason}`,
        captured,
        skipped: [],
        cssSheets: 0,
        assetsDownloaded: 0,
        logoCandidates: 0,
        warnings,
      });
      return;
    }
    const authLabel =
      loginResult.status === "public" ? "public" : `ok (${loginResult.method})`;
    log.success(`Access: ${authLabel}`);
    if (loginResult.status !== "public") await saveStorageState(session);

    // Non-destructive crawl, capturing each page.
    const startUrl = page.url();
    const { visited, skipped } = await crawl(
      page,
      startUrl,
      { maxPages: config.maxPages, pageTimeout: config.pageTimeout },
      {
        onPage: async (p, url) => {
          const art = await capturePage(p, url, config.outAbs);
          captured.push(art);
        },
      },
    );
    log.success(`Crawl: ${visited.length} pages, ${skipped.length} skipped.`);

    // Write all the stylesheets collected over the network.
    const sheetNames = await css.writeAll(path.join(config.outAbs, "css"));
    const combinedCss = css.combinedCss();

    // Rewrite saved HTML/CSS → local assets (offline) + <base> fallback.
    try {
      await rewriteCapturedAssets(
        config.outAbs,
        captured.map((p) => ({ html: p.html, url: p.url, slug: p.slug })),
        sheetNames,
        assets.map(),
        warnings,
      );
    } catch (err) {
      warnings.push(`asset rewrite: ${String(err).slice(0, 120)}`);
    }
    warnings.push(...assets.getWarnings());

    // Fine details (hover/focus/transitions/keyframes) on the first page.
    try {
      await extractFineDetails(page, config.outAbs, combinedCss);
    } catch (err) {
      warnings.push(`fine details: ${String(err).slice(0, 120)}`);
    }

    // Logo.
    let logoCount = 0;
    try {
      logoCount = await detectLogo(session.context, captured, config.outAbs);
    } catch (err) {
      warnings.push(`logo: ${String(err).slice(0, 120)}`);
    }

    // Design tokens.
    try {
      await buildTokens(config.outAbs, combinedCss);
    } catch (err) {
      warnings.push(`tokens: ${String(err).slice(0, 120)}`);
    }

    // Report skeletons for Claude to fill in.
    await writeReportSkeletons(config.outAbs, config.url);

    // Preview.html: basic gallery to eyeball what was scraped (cheap).
    await writePreview(config.outAbs, captured, { url: config.url, auth: authLabel });

    await writeManifest(config, {
      startedAt,
      auth: authLabel,
      captured,
      skipped,
      cssSheets: sheetNames.length,
      assetsDownloaded: assets.count(),
      logoCandidates: logoCount,
      warnings,
    });

    log.success(`Artifacts in: ${config.outAbs} (${assets.count()} assets)`);
  } finally {
    await closeSession(session);
  }
}

async function writeManifest(
  config: CaptureConfig,
  data: {
    startedAt: string;
    auth: string;
    captured: PageArtifacts[];
    skipped: { url: string; reason: string }[];
    cssSheets: number;
    assetsDownloaded: number;
    logoCandidates: number;
    warnings: string[];
  },
): Promise<void> {
  const manifest: Manifest = {
    url: config.url,
    startedAt: data.startedAt,
    finishedAt: new Date().toISOString(),
    auth: data.auth,
    pagesVisited: data.captured.length,
    pages: data.captured.map((p) => ({ url: p.url, slug: p.slug, title: p.title })),
    skippedDestructive: data.skipped,
    cssSheets: data.cssSheets,
    assetsDownloaded: data.assetsDownloaded,
    logoCandidates: data.logoCandidates,
    warnings: data.warnings,
  };
  await writeJson(path.join(config.outAbs, "manifest.json"), manifest);
}
