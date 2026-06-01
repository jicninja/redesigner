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
 * Pipeline de captura completo: login → crawl no destructivo → captura por
 * página → detalles finos + logo + tokens → manifest + esqueletos de reportes.
 */
export async function runCapture(config: CaptureConfig): Promise<void> {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  await ensureDir(config.outAbs);

  log.box(
    "⚠️  SEGURIDAD: el login es MANUAL en la ventana del navegador — el motor\n" +
      "NUNCA recibe usuario/contraseña. Usá una cuenta de PRUEBA/testing, nunca\n" +
      "una productiva. El crawler es de SOLO LECTURA (no borra, edita ni envía\n" +
      "formularios salvo el login que hacés vos a mano).",
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
      log.error(`Login falló: ${loginResult.reason}`);
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
      loginResult.status === "public" ? "público" : `ok (${loginResult.method})`;
    log.success(`Acceso: ${authLabel}`);
    if (loginResult.status !== "public") await saveStorageState(session);

    // Crawl no destructivo capturando cada página.
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
    log.success(`Crawl: ${visited.length} páginas, ${skipped.length} saltadas.`);

    // Escribir todas las hojas de estilo colectadas por red.
    const sheetNames = await css.writeAll(path.join(config.outAbs, "css"));
    const combinedCss = css.combinedCss();

    // Reescribir HTML/CSS guardados → assets locales (offline) + <base> fallback.
    try {
      await rewriteCapturedAssets(
        config.outAbs,
        captured.map((p) => ({ html: p.html, url: p.url, slug: p.slug })),
        sheetNames,
        assets.map(),
        warnings,
      );
    } catch (err) {
      warnings.push(`reescritura assets: ${String(err).slice(0, 120)}`);
    }
    warnings.push(...assets.getWarnings());

    // Detalles finos (hover/focus/transitions/keyframes) sobre la primera página.
    try {
      await extractFineDetails(page, config.outAbs, combinedCss);
    } catch (err) {
      warnings.push(`detalles finos: ${String(err).slice(0, 120)}`);
    }

    // Logo.
    let logoCount = 0;
    try {
      logoCount = await detectLogo(session.context, captured, config.outAbs);
    } catch (err) {
      warnings.push(`logo: ${String(err).slice(0, 120)}`);
    }

    // Tokens de diseño.
    try {
      await buildTokens(config.outAbs, combinedCss);
    } catch (err) {
      warnings.push(`tokens: ${String(err).slice(0, 120)}`);
    }

    // Esqueletos de reportes para que Claude rellene.
    await writeReportSkeletons(config.outAbs, config.url);

    // Preview.html: galería básica para revisar lo scrapeado a ojo (barato).
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

    log.success(`Artefactos en: ${config.outAbs} (${assets.count()} assets)`);
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
