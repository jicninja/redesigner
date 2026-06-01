# Split Mode Implementation Plan

> **Modo prototipo (preferencia del usuario):** sin tests/TDD. Cada tarea se verifica con `npm run typecheck` en el motor y, al final, un `npm run build` del `redesign/`. Steps con checkbox (`- [ ]`).

**Goal:** Agregar al `redesigner` una sub-vista `#/split` dentro del proyecto `redesign/` que compara, con HTML real, el sitio original (offline, assets descargados y copiados al proyecto) vs. el rediseño vivo, con una máscara que sigue el mouse.

**Architecture:** (A) La captura baja imágenes/fuentes a `assets/` y reescribe el HTML/CSS guardado: las URLs descargadas pasan a rutas locales relativas, las no descargadas quedan absolutas (cargan del sitio vivo). (B) El scaffold copia `html/`+`assets/`+`css/` a `redesign/public/_original/`, emite `src/pages/SplitView.tsx` (cortina por mouse + modos + inmersivo) y rutea `#/split → <SplitView/>` en `main.tsx`. Ambos lados se sirven desde `localhost` (mismo origen).

**Tech Stack:** Node ≥20 + TypeScript, Playwright, React 19/Vite (proyecto generado). Verificación: `npm run typecheck` + `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-01-split-mode-design.md`

Rutas relativas a `skills/redesigner/`. Hacé `cd skills/redesigner` antes de los comandos.

---

### Task 1: `asset-rewrite.ts` (funciones puras de reescritura)

**Files:**
- Create: `src/capture/asset-rewrite.ts`

- [ ] **Step 1: Implementar `asset-rewrite.ts`**

```ts
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeFileSafe } from "../util/fs.js";

/** Ruta local (posix, relativa) desde el dir de `fromFileAbs` hacia el asset (rel al out). */
export function relAssetPath(
  fromFileAbs: string,
  assetRelToOut: string,
  outAbs: string,
): string {
  const assetAbs = path.join(outAbs, assetRelToOut);
  const rel = path.relative(path.dirname(fromFileAbs), assetAbs);
  return rel.split(path.sep).join("/");
}

/** Reemplaza toda aparición de las URLs absolutas del map por su ruta local relativa. */
export function rewriteReferences(
  text: string,
  map: Map<string, string>,
  fromFileAbs: string,
  outAbs: string,
): string {
  let out = text;
  for (const [url, assetRel] of map) {
    if (!out.includes(url)) continue;
    const local = relAssetPath(fromFileAbs, assetRel, outAbs);
    out = out.split(url).join(local);
  }
  return out;
}

/** Lee, transforma y reescribe un archivo en disco. No-op si no existe. */
export async function rewriteFile(
  fileAbs: string,
  transform: (text: string) => string,
): Promise<void> {
  if (!existsSync(fileAbs)) return;
  const text = await readFile(fileAbs, "utf8");
  await writeFileSafe(fileAbs, transform(text));
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd skills/redesigner && npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add skills/redesigner/src/capture/asset-rewrite.ts
git commit -m "feat(redesigner): asset-rewrite — reescribe referencias a rutas locales"
```

---

### Task 2: `asset-collector.ts` (descarga de imágenes/fuentes)

**Files:**
- Create: `src/capture/asset-collector.ts`

- [ ] **Step 1: Implementar `asset-collector.ts`**

```ts
import path from "node:path";
import type { BrowserContext } from "playwright";
import { writeFileSafe, shortHash } from "../util/fs.js";

const ASSET_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|woff2?|ttf|otf|eot)(\?|$)/i;
const MAX_BYTES = 8 * 1024 * 1024;

/** ¿La respuesta es una imagen/fuente que vale la pena bajar? */
export function isAssetResponse(contentType: string, url: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("image/") || ct.startsWith("font/")) return true;
  if (ct.includes("font")) return true; // application/font-woff, x-font-ttf, etc.
  return ASSET_EXT.test(url);
}

/** Nombre local estable: assets/<host>/<base>__<hash><ext>. */
export function assetLocalName(url: string): string {
  let host = "asset";
  let base = "file";
  let ext = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/[^a-z0-9.-]/gi, "-") || "asset";
    const bn = path.basename(u.pathname.replace(/\/+$/, ""));
    const dot = bn.lastIndexOf(".");
    if (dot > 0) {
      base = bn.slice(0, dot);
      ext = bn.slice(dot);
    } else {
      base = bn || "file";
    }
  } catch {
    /* noop */
  }
  base = base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "file";
  ext = ext.replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 8);
  return path.posix.join("assets", host, `${base}__${shortHash(url)}${ext}`);
}

/**
 * Baja imágenes/fuentes interceptando RESPONSES de red (inmune a CORS: lee el
 * body, no el DOM). Guarda a disco y mapea urlAbsoluta -> rutaLocal (rel al out).
 */
export class AssetCollector {
  private assets = new Map<string, string>();
  private warnings: string[] = [];

  attach(context: BrowserContext, outAbs: string): void {
    context.on("response", async (res) => {
      try {
        const url = res.url();
        if (this.assets.has(url) || !res.ok()) return;
        const ct = res.headers()["content-type"] ?? "";
        if (!isAssetResponse(ct, url)) return;
        const body = await res.body();
        if (!body.length) return;
        if (body.length > MAX_BYTES) {
          this.warnings.push(`asset grande saltado (${body.length}b): ${url}`);
          return;
        }
        const rel = assetLocalName(url);
        await writeFileSafe(path.join(outAbs, rel), body);
        this.assets.set(url, rel);
      } catch {
        /* respuestas ilegibles/redirect: ignorar */
      }
    });
  }

  map(): Map<string, string> {
    return this.assets;
  }
  count(): number {
    return this.assets.size;
  }
  getWarnings(): string[] {
    return this.warnings;
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `cd skills/redesigner && npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add skills/redesigner/src/capture/asset-collector.ts
git commit -m "feat(redesigner): AssetCollector — baja imgs/fuentes a assets/"
```

---

### Task 3: `CssCollector.map()` + absolutizar URLs en `page-capture.ts`

**Files:**
- Modify: `src/capture/css-collector.ts`
- Modify: `src/capture/page-capture.ts`

- [ ] **Step 1: Refactor de `CssCollector` + `map()`**

En `src/capture/css-collector.ts`, reemplazá el método `writeAll` por esta versión y agregá `localName` (privado) y `map()`:

```ts
  /** Nombre local estable de una hoja: `<host>__<base>__<hash>.css`. */
  private localName(url: string): string {
    let host = "inline";
    let base = "sheet";
    try {
      const u = new URL(url);
      host = u.hostname.replace(/[^a-z0-9.-]/gi, "-");
      base = path.basename(u.pathname).replace(/\.css$/i, "") || "sheet";
    } catch {
      /* noop */
    }
    return `${host}__${base}__${shortHash(url)}.css`;
  }

  /** Escribe cada stylesheet a disco con nombre estable `<host>__<hash>.css`. */
  async writeAll(cssDir: string): Promise<string[]> {
    const written: string[] = [];
    for (const [url, css] of this.sheets) {
      const name = this.localName(url);
      const file = path.join(cssDir, name);
      await writeFileSafe(file, `/* source: ${url} */\n${css}`);
      written.push(name);
    }
    return written;
  }

  /** Mapa urlAbsoluta -> ruta local rel al out (`css/<name>`), para reescritura. */
  map(): Map<string, string> {
    const m = new Map<string, string>();
    for (const url of this.sheets.keys()) {
      m.set(url, path.posix.join("css", this.localName(url)));
    }
    return m;
  }
```

(Borrá el cuerpo viejo de `writeAll` que armaba `host`/`base`/`name` inline.)

- [ ] **Step 2: Absolutizar URLs de assets en `page-capture.ts`**

En `src/capture/page-capture.ts`, dentro de `capturePage`, **antes** de `const html = await page.content();`, agregá:

```ts
  // Absolutiza URLs de assets para que el HTML serializado matchee los mapas de
  // descarga (las props .src/.href ya devuelven absoluto). Sin <base>: las no
  // descargadas quedan absolutas y cargan del sitio vivo.
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLImageElement>("img[src]")
      .forEach((el) => el.setAttribute("src", el.src));
    document
      .querySelectorAll<HTMLLinkElement>("link[href]")
      .forEach((el) => el.setAttribute("href", el.href));
    document
      .querySelectorAll<HTMLScriptElement>("script[src]")
      .forEach((el) => el.setAttribute("src", el.src));
    const absSrcset = (el: Element) => {
      const ss = el.getAttribute("srcset");
      if (!ss) return;
      const abs = ss
        .split(",")
        .map((part) => {
          const [u, d] = part.trim().split(/\s+/, 2);
          try {
            return new URL(u, location.href).href + (d ? ` ${d}` : "");
          } catch {
            return part.trim();
          }
        })
        .join(", ");
      el.setAttribute("srcset", abs);
    };
    document.querySelectorAll("img[srcset], source[srcset]").forEach(absSrcset);
  });
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd skills/redesigner && npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add skills/redesigner/src/capture/css-collector.ts skills/redesigner/src/capture/page-capture.ts
git commit -m "feat(redesigner): CssCollector.map() + absolutizar URLs de assets"
```

---

### Task 4: Cablear descarga + reescritura en `index.ts`

**Files:**
- Modify: `src/capture/index.ts`

- [ ] **Step 1: Imports**

Agregá:

```ts
import { AssetCollector } from "./asset-collector.js";
import { rewriteReferences, rewriteFile } from "./asset-rewrite.js";
```

- [ ] **Step 2: `assetsDownloaded` en el `Manifest`**

En la interface `Manifest`, tras `cssSheets: number;` agregá:

```ts
  assetsDownloaded: number;
```

- [ ] **Step 3: Instanciar y atachar el `AssetCollector`**

Justo después de `css.attach(session.context);`:

```ts
  const assets = new AssetCollector();
  assets.attach(session.context, config.outAbs);
```

- [ ] **Step 4: Reescribir tras el crawl**

Después de `const sheetNames = await css.writeAll(...)` y `const combinedCss = css.combinedCss();`, antes de `extractFineDetails`, agregá:

```ts
    // Reescribir referencias de assets a rutas locales (las no descargadas
    // quedan absolutas y cargan del sitio vivo). Sin <base>.
    const refMap = new Map<string, string>([...assets.map(), ...css.map()]);
    for (const p of captured) {
      const htmlAbs = path.join(config.outAbs, p.html);
      await rewriteFile(htmlAbs, (t) =>
        rewriteReferences(t, refMap, htmlAbs, config.outAbs),
      );
    }
    // CSS guardadas: solo url() absolutos que matcheen (best-effort; los url()
    // relativos quedan como están — limitación conocida).
    for (const name of sheetNames) {
      const cssAbs = path.join(config.outAbs, "css", name);
      await rewriteFile(cssAbs, (t) =>
        rewriteReferences(t, assets.map(), cssAbs, config.outAbs),
      );
    }
    for (const w of assets.getWarnings()) warnings.push(w);
```

- [ ] **Step 5: Pasar `assetsDownloaded` al manifest**

En la llamada `await writeManifest(config, { ... })` agregá:

```ts
        assetsDownloaded: assets.count(),
```

En la firma de `writeManifest`, en el objeto `data`, agregá `assetsDownloaded: number;`. En el objeto `manifest` que construye, agregá tras `cssSheets: data.cssSheets,`:

```ts
    assetsDownloaded: data.assetsDownloaded,
```

- [ ] **Step 6: Verificar typecheck**

Run: `cd skills/redesigner && npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add skills/redesigner/src/capture/index.ts
git commit -m "feat(redesigner): descarga de assets + reescritura offline en la captura"
```

---

### Task 5: `split-view.ts` — builder del componente React

**Files:**
- Create: `src/scaffold/split-view.ts`

- [ ] **Step 1: Implementar `split-view.ts`**

El builder devuelve el código fuente de `SplitView.tsx`. **Evitamos template literals dentro del componente emitido** (CSS como string doble-comilla, className por concatenación) para no anidar backticks.

```ts
export interface SplitViewPage {
  slug: string;
  title: string;
}

const COMPONENT_CSS =
  ".sv{position:fixed;inset:0;display:flex;flex-direction:column;background:#0b0b0c;color:#e8e8ea;font:14px/1.4 system-ui,sans-serif;z-index:9999}" +
  ".sv-immersive .sv-bar{display:none}" +
  ".sv-bar{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid #26262a;background:#151517}" +
  ".sv-bar select{background:#0b0b0c;color:#e8e8ea;border:1px solid #34343a;border-radius:8px;padding:6px 8px}" +
  ".sv-modes{display:flex;gap:4px}" +
  ".sv-modes button{background:#0b0b0c;color:#e8e8ea;border:1px solid #34343a;border-radius:8px;padding:6px 12px;cursor:pointer}" +
  ".sv-modes button.active{background:#2a4cff;border-color:#2a4cff}" +
  ".sv-hint{margin-left:auto;font-size:12px;opacity:.55}" +
  ".sv-stage{position:relative;flex:1;overflow:hidden;background:#fff}" +
  ".sv-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}" +
  ".sv-orig{z-index:1}" +
  ".sv-new{z-index:2;clip-path:inset(0 0 0 var(--x))}" +
  ".sv-split .sv-new{pointer-events:none}" +
  ".sv-before .sv-new{pointer-events:none}" +
  ".sv-before .sv-orig{z-index:3}" +
  ".sv-divider{display:none;position:absolute;top:0;bottom:0;left:var(--x);width:2px;margin-left:-1px;background:#2a4cff;z-index:4;pointer-events:none}" +
  ".sv-split .sv-divider{display:block}" +
  ".sv-fallback{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;z-index:5;background:#0b0b0c}";

/** Genera el código fuente de src/pages/SplitView.tsx. */
export function buildSplitView(pages: SplitViewPage[]): string {
  const data = JSON.stringify(
    pages.map((p) => ({ slug: p.slug, title: p.title })),
  );
  const css = JSON.stringify(COMPONENT_CSS);
  return `import { useEffect, useRef, useState } from "react";

type Mode = "before" | "split" | "after";

const PAGES: { slug: string; title: string }[] = ${data};
const ORIGINAL_BASE = "/_original/html/";
const CSS = ${css};

// Sub-vista de comparación antes/ahora. Se accede en #/split.
// "antes" = HTML original copiado a public/_original/; "ahora" = la app viva (/).
export function SplitView() {
  const [mode, setMode] = useState<Mode>("split");
  const [immersive, setImmersive] = useState(false);
  const [page, setPage] = useState((PAGES[0] && PAGES[0].slug) || "");
  const [x, setX] = useState(50);
  const [afterFailed, setAfterFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loadedRef.current) setAfterFailed(true);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const pick = (m: Mode) => {
    setImmersive(false);
    setMode(m);
  };
  const onMove = (e: React.MouseEvent) => {
    if (mode !== "split" || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    setX(pct);
  };
  const onDbl = () => {
    const n = !immersive;
    setImmersive(n);
    setMode(n ? "after" : "split");
  };

  const clipX = mode === "before" ? 100 : mode === "after" ? 0 : x;
  const beforeSrc =
    ORIGINAL_BASE + (page || (PAGES[0] && PAGES[0].slug) || "") + ".html";

  return (
    <div className={"sv sv-" + mode + (immersive ? " sv-immersive" : "")}>
      <style>{CSS}</style>
      <div className="sv-bar">
        <label>
          Página original{" "}
          <select value={page} onChange={(e) => setPage(e.target.value)}>
            {PAGES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title || p.slug}
              </option>
            ))}
          </select>
        </label>
        <div className="sv-modes">
          <button className={mode === "before" ? "active" : ""} onClick={() => pick("before")}>
            Antes
          </button>
          <button className={mode === "split" ? "active" : ""} onClick={() => pick("split")}>
            Split
          </button>
          <button className={mode === "after" ? "active" : ""} onClick={() => pick("after")}>
            Ahora
          </button>
        </div>
        <span className="sv-hint">Split sigue el mouse · doble click = solo el diseño nuevo</span>
      </div>
      <div
        className="sv-stage"
        ref={stageRef}
        onMouseMove={onMove}
        onDoubleClick={onDbl}
        style={{ ["--x"]: clipX + "%" } as React.CSSProperties}
      >
        <iframe className="sv-orig" src={beforeSrc} title="antes" />
        <iframe
          className="sv-new"
          src="/"
          title="ahora"
          onLoad={() => {
            loadedRef.current = true;
            setAfterFailed(false);
          }}
        />
        <div className="sv-divider" />
        {afterFailed ? (
          <div className="sv-fallback">
            El lado "ahora" no cargó. Levantá el rediseño (npm run dev) y recargá.
          </div>
        ) : null}
      </div>
    </div>
  );
}
`;
}
```

- [ ] **Step 2: Verificar typecheck (del motor)**

Run: `cd skills/redesigner && npm run typecheck`
Expected: sin errores. (El TS del componente emitido se valida al buildear el redesign en Task 7.)

- [ ] **Step 3: Commit**

```bash
git add skills/redesigner/src/scaffold/split-view.ts
git commit -m "feat(redesigner): builder de la sub-vista SplitView (cortina por mouse)"
```

---

### Task 6: Scaffold — copiar `_original`, escribir SplitView, rutear en `main.tsx`

**Files:**
- Modify: `src/scaffold/scaffold.ts`

- [ ] **Step 1: Imports**

En `src/scaffold/scaffold.ts`, agregá a los imports de arriba:

```ts
import { cp } from "node:fs/promises";
import { buildSplitView } from "./split-view.js";
```

(`existsSync` ya está importado de `node:fs`.)

- [ ] **Step 2: Copiar artefactos originales tras emitir el proyecto**

En `runScaffold`, después de `await emitReactProject(root, tokens, manifest, transitions, anims);` y antes del `log.success`, agregá:

```ts
  await copyOriginals(artifactsAbs, root);
```

Y al final del archivo (junto a `pascal`), agregá la función:

```ts
/** Copia html/+assets/+css/ del relevamiento a redesign/public/_original/. */
async function copyOriginals(artifactsAbs: string, root: string): Promise<void> {
  const dest = path.join(root, "public", "_original");
  for (const dir of ["html", "assets", "css"]) {
    const src = path.join(artifactsAbs, dir);
    if (existsSync(src)) {
      await cp(src, path.join(dest, dir), { recursive: true });
    }
  }
}
```

- [ ] **Step 3: Emitir `src/pages/SplitView.tsx`**

En `emitReactProject`, después del bloque que escribe los stubs de páginas (el `for (const p of pages)`), agregá:

```ts
  await w(
    "src/pages/SplitView.tsx",
    buildSplitView(manifest.pages.map((p) => ({ slug: p.slug, title: p.title }))),
  );
```

- [ ] **Step 4: Rutear `#/split` en `main.tsx`**

Reemplazá el bloque que escribe `src/main.tsx` por esta versión (suma el import de `SplitView` y el render condicional por hash):

```ts
  await w(
    "src/main.tsx",
    `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { App } from "./App";
import { SplitView } from "./pages/SplitView";

const isSplit =
  typeof location !== "undefined" && location.hash === "#/split";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSplit ? <SplitView /> : <App />}
  </StrictMode>,
);
`,
  );
```

- [ ] **Step 5: Verificar typecheck (del motor)**

Run: `cd skills/redesigner && npm run typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add skills/redesigner/src/scaffold/scaffold.ts
git commit -m "feat(redesigner): scaffold copia _original + emite SplitView + ruta #/split"
```

---

### Task 7: Smoke end-to-end (scaffold + build del redesign)

**Files:** (ninguno — verificación)

- [ ] **Step 1: Armar un artifacts fixture mínimo**

```bash
cd skills/redesigner
rm -rf /tmp/sm && mkdir -p /tmp/sm/redesigner-artifacts/html /tmp/sm/redesigner-artifacts/assets
printf '%s' '{"url":"https://s.com/","pages":[{"url":"https://s.com/","slug":"home","title":"Inicio"},{"url":"https://s.com/about","slug":"about","title":"Nosotros"}]}' > /tmp/sm/redesigner-artifacts/manifest.json
printf '%s' '<!doctype html><html><head><title>Inicio</title></head><body><h1>Home original</h1></body></html>' > /tmp/sm/redesigner-artifacts/html/home.html
printf '%s' '<!doctype html><html><head><title>Nosotros</title></head><body><h1>About original</h1></body></html>' > /tmp/sm/redesigner-artifacts/html/about.html
```

- [ ] **Step 2: Correr el scaffold**

Run: `cd skills/redesigner && npm run scaffold -- --out /tmp/sm --artifacts /tmp/sm/redesigner-artifacts`
Expected: log de éxito; se crea `/tmp/sm/redesign/`.

- [ ] **Step 3: Verificar que se generó la sub-vista y la copia**

```bash
ls /tmp/sm/redesign/src/pages/SplitView.tsx \
   /tmp/sm/redesign/public/_original/html/home.html
grep -c "SplitView" /tmp/sm/redesign/src/main.tsx
grep -c "_original/html/" /tmp/sm/redesign/src/pages/SplitView.tsx
```
Expected: los dos archivos existen; ambos `grep -c` imprimen `≥1`.

- [ ] **Step 4: Buildear el redesign (valida el TSX emitido)**

Run: `cd /tmp/sm/redesign && npm install && npm run build`
Expected: build OK sin errores de TypeScript (confirma que `SplitView.tsx` y `main.tsx` compilan).

- [ ] **Step 5: Smoke visual (opcional, manual)**

```bash
cd /tmp/sm/redesign && npm run dev
```
Abrir `http://localhost:5173/#/split` y verificar: Split sigue el mouse, los botones fijan Antes/Ahora, doble click entra/sale de inmersivo ocultando la barra, el dropdown cambia el original. Cortar el server al terminar.

---

### Task 8: Documentar en `SKILL.md`

**Files:**
- Modify: `SKILL.md`

- [ ] **Step 1: Agregar el sub-paso del split en 9b**

En `SKILL.md`, sección `## 9b. Mostrar + iterar`, después del punto 1 (levantar `npm run dev` y sacar capturas), agregá:

```markdown
1c. **Split antes/ahora.** Con el rediseño levantado, abrí la sub-vista de comparación:
   ```bash
   open "http://localhost:5173/#/split"
   ```
   Explicale al usuario: **Split** es el modo por defecto y la máscara **sigue el mouse**; los botones `[Antes] [Split] [Ahora]` fijan un lado (Antes/Ahora quedan interactivos); **doble click** muestra solo el diseño nuevo a pantalla completa (oculta la barra) y otro doble click vuelve al Split; el dropdown elige qué página original comparar. El lado "antes" es el HTML original copiado a `redesign/public/_original/`; el "ahora" es la app viva.
```

- [ ] **Step 2: Agregar la regla**

En la sección `## Reglas`, agregá un bullet:

```markdown
- El **split** (comparación antes/ahora) es una **sub-vista de `redesign/`** (`#/split`), no un artefacto: usa el HTML original copiado a `public/_original/` (con los assets descargados en la captura) y la app viva como "ahora". Necesita el server del rediseño levantado.
```

- [ ] **Step 3: Commit**

```bash
git add skills/redesigner/SKILL.md
git commit -m "docs(redesigner): documentar split mode (#/split) en SKILL.md"
```

---

## Self-Review

**Spec coverage:**
- Parte A (descarga assets + reescritura + `assetsDownloaded`, sin `<base>`) → Tasks 1–4. ✓
- Absolutizar URLs en navegador → Task 3 Step 2. ✓
- Parte B (sub-vista `SplitView`: dropdown, 3 botones, cortina por mouse default, doble click inmersivo ocultando barra, fallback; copia `_original`; ruta `#/split`) → Tasks 5–6. ✓
- Parte C / SKILL.md (`#/split` en 9b + regla) → Task 8. ✓
- Smoke e2e (scaffold + build) → Task 7. ✓
- Limitaciones (CSS url() relativo) → documentadas en Task 4 Step 4. ✓

**Placeholder scan:** sin TBD/TODO; cada step tiene código o comando concreto.

**Type consistency:** `SplitViewPage`/`buildSplitView` coinciden entre Task 5 y Task 6; `AssetCollector.map()/count()/getWarnings()`, `CssCollector.map()`, `rewriteReferences/rewriteFile` coinciden entre Tasks 1–4; `assetsDownloaded` agregado en interface, llamada y `writeManifest`. Sin `<base>`/`injectBase` (removido del diseño). ✓
```
