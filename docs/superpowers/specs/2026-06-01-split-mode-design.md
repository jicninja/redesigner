# Split mode — comparación interactiva antes/ahora (skill redesigner)

Fecha: 2026-06-01
Estado: aprobado para implementación

## Objetivo

Agregar a la skill `redesigner` un **split mode**: una **sub-vista dentro del
proyecto `redesign/`** (no un artefacto suelto) que compara, con el **HTML real
de ambos lados**, cómo se veía el sitio **antes** (lo relevado, copiado al
proyecto) vs. cómo se ve **ahora** (el propio rediseño), mediante una
**cortina/máscara que sigue el mouse**. Se accede con el rediseño levantado
(`http://localhost:5173/#/split`).

No-objetivos: editar el rediseño, sincronizar scroll, comparar por PNG, exportar
nada nuevo, ni generar un HTML fuera de `redesign/`.

## Decisiones (cerradas en brainstorming)

1. **Comparar por HTML real**, no por screenshots.
2. **Interacción:** cortina con `clip-path`; en modo Split la máscara **sigue el
   mouse**. Botones `[Antes] [Split] [Ahora]`. **Split es el default.**
3. **Doble click** sobre el stage → modo **inmersivo**: oculta la barra superior
   y muestra **solo el diseño nuevo** a pantalla completa. Otro doble click →
   vuelve a Split con la barra visible.
4. **El split es una sub-vista del `redesign/`** (ruta `#/split`), no parte de
   `redesigner-artifacts`. Lado "ahora" = la app viva; lado "antes" = HTML
   original **copiado** a `redesign/public/_original/`. Ambos lados se sirven
   desde el mismo origen (`localhost`) → sin CORS.
5. **Alcance:** dropdown para elegir qué **página original** mostrar (del
   `manifest`); el lado rediseño es navegable.
6. **Imágenes/assets reales:** se **descargan a disco durante la captura** para
   que el "antes" se vea fiel y offline.

## Arquitectura

### Parte A — Captura de assets (motor `src/capture/`)

**Por qué:** hoy la captura guarda HTML/CSS (texto) + screenshots + logo, pero
**no descarga imágenes/fuentes**. Sin ellas el "antes" se ve roto.

- **`src/capture/asset-collector.ts`** (espejo de `CssCollector`):
  `attach(context, outAbs)` engancha `context.on("response")`; para `res.ok()`
  con content-type `image/*`/`font/*` o url con extensión de imagen/fuente,
  guarda el buffer en `assets/<host>/<base>__<hash>.<ext>` y mapea
  `urlAbsoluta → rutaLocal` (rel al out). Salta assets > ~8 MB → `warnings`.
- **`src/capture/page-capture.ts`:** antes de `page.content()`, **absolutizar**
  en el navegador todas las URLs de assets (`img.src`, `link.href`, `script.src`,
  `srcset`) usando las props `.src`/`.href` (ya absolutas). Así el HTML
  serializado tiene URLs absolutas que matchean los mapas para la reescritura.
- **`src/capture/asset-rewrite.ts`** (funciones puras): `relAssetPath`,
  `rewriteReferences(text, map, fromFileAbs, outAbs)` (reemplaza URLs absolutas
  conocidas por rutas locales **relativas**), `rewriteFile`.
- **Reescritura (en `index.ts`, tras el crawl):** combinar el mapa de assets con
  el de hojas del `CssCollector` (`css.map()`, nuevo) y reescribir cada
  `html/<slug>.html` → las descargadas pasan a rutas locales relativas; las **no
  descargadas quedan absolutas** y cargan del sitio vivo cuando haya conexión
  (por eso **no se inyecta `<base>`**: rompería las rutas locales relativas).
  También reescribir los `css/<name>.css` con el mapa de assets (best-effort:
  solo `url()` absolutos; los `url()` relativos dentro de CSS quedan como están —
  limitación conocida). `Manifest` suma `assetsDownloaded: number`.

**Efecto colateral positivo:** `preview.html` y el `site-mock` también renderizan
mejor el HTML original.

### Parte B — Sub-vista `SplitView` en el scaffold (`src/scaffold/`)

El scaffold del rediseño (target `react`) emite la vista y copia lo necesario:

- **Copia de artefactos:** `redesign/public/_original/` recibe los directorios
  `html/`, `assets/` y `css/` de `redesigner-artifacts` (vía `fs.cp` recursivo).
  Así las páginas originales quedan en `/_original/html/<slug>.html` y sus rutas
  relativas (`../assets/…`, `../css/…`) resuelven a `/_original/assets|css/…`.
- **`src/scaffold/split-view.ts`** — `buildSplitView(pages)` devuelve el código
  fuente del componente React `SplitView` (patrón de `buildMotionLib`/
  `tokensToThemeCss`: builder de string puro, testeable). El componente:
  - Barra: `<select>` de páginas originales (cambia `#before.src` a
    `/_original/html/<slug>.html`) + botones `[Antes][Split][Ahora]`.
  - Stage con dos iframes: `#before` (original copiado) y `#after` (`src="/"`,
    la app viva), `#after` recortado con `clip-path: inset(0 0 0 var(--x))`.
  - Split (default): `mousemove` mueve `--x`; `#after` `pointer-events:none`.
  - Botones: Antes (`--x:100%`, before interactivo) / Ahora (`--x:0%`, after
    interactivo) / Split.
  - `dblclick` → toggle inmersivo (oculta barra + solo diseño nuevo); de nuevo →
    Split. Estilos inline o Tailwind; sin libs extra.
- **Ruteo mínimo en `main.tsx`:** sin router. Render condicional por hash:
  `location.hash === "#/split" ? <SplitView/> : <App/>`. (El `#after` con
  `src="/"` no lleva hash → muestra `App`, no recursión.)
- El scaffold escribe `src/pages/SplitView.tsx` con `buildSplitView(pages)` y
  ajusta `main.tsx`.

**Mismo origen:** before y after se sirven desde `localhost` → sin CORS.

### Parte C — Pipeline / SKILL.md

- **No hay comando CLI nuevo ni `split.html`.** El split se genera con el
  scaffold (paso 9) y se ve con el rediseño levantado.
- **`SKILL.md`:** en el paso **9b**, tras `npm run dev`, indicar abrir
  `http://localhost:5173/#/split` y explicar la interacción. Regla: el split es
  una sub-vista de `redesign/` (`#/split`), usa el HTML original copiado a
  `public/_original/` y los assets descargados en la captura.

## Flujo de datos

```
capture ─┬─ html/<slug>.html  (URLs absolutizadas; descargadas → ../assets|css local)
         ├─ assets/<host>/…    (imgs/fuentes bajadas)            ← NUEVO
         ├─ css/<name>.css     (url() absolutos → assets locales) ← reescrito
         └─ manifest.json (+ assetsDownloaded)

scaffold (react) ─┬─ copia html/+assets/+css/ → redesign/public/_original/
                  ├─ src/pages/SplitView.tsx  (buildSplitView)
                  └─ main.tsx  (#/split → <SplitView/>)

redesign vivo (localhost:5173)
   /#/split  → SplitView
       #before → /_original/html/<slug>.html  (mismo origen)
       #after  → /                              (la app)
```

## Manejo de errores

- `asset-collector`: respuestas ilegibles/redirect → ignorar (try/catch). Assets
  grandes → saltear + `warnings`.
- Reescritura: si un archivo no se puede reescribir, dejarlo igual + `warnings`;
  nunca abortar el crawl.
- Scaffold: si no existen `html/`/`assets/`/`css/` en artifacts, copiar lo que
  haya (no fallar). Si `manifest.pages` está vacío, emitir SplitView con dropdown
  vacío y un aviso visible.
- SplitView: si `#after` no carga (server caído) → overlay
  "levantá el rediseño y recargá".

## Testing

- **Typecheck:** `npm run typecheck` verde.
- **`asset-rewrite`** (unit): `relAssetPath`, `rewriteReferences`.
- **`asset-collector`** (unit): `isAssetResponse`, `assetLocalName`.
- **`buildSplitView`** (unit, string): contiene los dos iframes, `<select>` con
  una opción por página apuntando a `/_original/html/<slug>.html`, los tres
  botones, y los handlers `mousemove`/`dblclick`; escapa títulos.
- **Smoke manual:** capture en un sitio simple → `npm run scaffold` → `npm run
  dev` en `redesign/` → abrir `/#/split` → verificar: Split sigue el mouse,
  botones fijan lados, doble click entra/sale de inmersivo ocultando la barra,
  dropdown cambia el original, el "antes" muestra sus imágenes.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/capture/asset-collector.ts` | **nuevo** — descarga imgs/fuentes |
| `src/capture/asset-rewrite.ts` | **nuevo** — reescribe a rutas locales |
| `src/capture/css-collector.ts` | método `map()` |
| `src/capture/page-capture.ts` | absolutizar URLs antes de `content()` |
| `src/capture/index.ts` | cablear descarga + reescritura + `assetsDownloaded` |
| `src/scaffold/split-view.ts` | **nuevo** — `buildSplitView(pages)` |
| `src/scaffold/scaffold.ts` | copiar `_original` + escribir SplitView + ruteo en main.tsx |
| `SKILL.md` | paso 9b (`/#/split`) + regla |
