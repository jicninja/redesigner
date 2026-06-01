# Split mode — comparación interactiva antes/ahora (skill redesigner)

Fecha: 2026-06-01
Estado: aprobado para implementación

## Objetivo

Agregar a la skill `redesigner` un **split mode**: un artefacto HTML interactivo
que compara, con el **HTML real de ambos lados**, cómo se veía el sitio
**antes** (lo relevado) vs. cómo se ve **ahora** (el rediseño), mediante una
**cortina/máscara** que sigue el mouse. Se genera con el rediseño ya levantado
(paso 9b del SKILL) y queda offline-capaz para el lado original.

No-objetivos: editar el rediseño, sincronizar scroll entre lados, comparar por
PNG (se compara por HTML vivo), exportar nada nuevo.

## Decisiones (cerradas en brainstorming)

1. **Comparar por HTML real**, no por screenshots. Antes = `html/<slug>.html`
   capturado; Ahora = app viva del rediseño.
2. **Interacción:** cortina con `clip-path`; en modo Split la máscara **sigue el
   mouse**. Botones arriba `[Antes] [Split] [Ahora]`. **Split es el default.**
3. **Doble click** sobre el stage → modo **inmersivo**: oculta la barra superior
   y muestra **solo el diseño nuevo** a pantalla completa. Otro doble click →
   vuelve a Split con la barra visible.
4. **Fuente del "ahora":** app viva (`--redesign-url`, default
   `http://localhost:5173`).
5. **Alcance:** dropdown para elegir qué **página original** mostrar (del
   `manifest`); el lado rediseño es la app viva, navegable por el usuario.
6. **Imágenes/assets reales:** se **descargan a disco durante la captura**
   (reusable) para que el "antes" se vea fiel y offline.

## Arquitectura

Tres partes cohesivas hacia el mismo objetivo.

### Parte A — Captura de assets (motor `src/capture/`)

**Por qué:** hoy la captura guarda HTML (texto) y CSS (texto) + screenshots +
logo, pero **no descarga las imágenes/fuentes** del sitio. Las `<img>`,
`background-image`, `srcset`, fuentes e íconos quedan como URLs. Abierto en
`file://`, el HTML con rutas relativas no carga sus assets. Para que el "antes"
muestre las imágenes reales offline hay que bajarlas.

**Componente nuevo: `src/capture/asset-collector.ts`** (espejo de
`CssCollector`):

- `attach(context)`: engancha `context.on("response")`. Para respuestas con
  `res.ok()` y content-type `image/*`, `font/*`, o url con extensión de
  imagen/fuente/icono (`.png|.jpg|.jpeg|.gif|.svg|.webp|.avif|.ico|.woff2?|.ttf|.otf`),
  guarda el **buffer** (`await res.body()`) en disco con nombre estable.
- Nombre estable: `assets/<host>/<base>__<hash>.<ext>` (mismo patrón
  `host + shortHash(url)` que `CssCollector.writeAll`).
- Expone `map(): Map<urlAbsoluta, rutaLocalRelativaAlOut>` para el reescritor.
- Tope defensivo de tamaño/cantidad por asset (p. ej. saltear > ~8 MB) y
  registrar en `warnings` lo saltado.

**Reescritura de referencias (`src/capture/asset-rewrite.ts` o función en el
collector):** tras el crawl, antes de escribir el manifest:

- Reescribir cada `html/<slug>.html` guardado: reemplazar URLs de assets
  conocidas (en `src`, `srcset`, `href` de `<link rel=stylesheet/icon>`, e inline
  `style`/`<style>` con `url(...)`) por la **ruta local relativa** (relativa
  desde `html/` hacia `assets/`).
- Reescribir las CSS de red guardadas (`css/<host>__….css`) y `css/inline/*.css`:
  sus `url(...)` de fondos/fuentes → rutas locales relativas (desde la ubicación
  del CSS hacia `assets/`).
- **Matching robusto:** el `Map` tiene URLs **absolutas**; los atributos del DOM
  serializado pueden ser relativos. Estrategia elegida: resolver en el navegador.
  En `capturePage`, **antes** de `page.content()`, recorrer el DOM con
  `page.evaluate` y normalizar `img.src`/`source.srcset`/`link.href` y fondos a
  su **URL absoluta** (vía la propiedad `.src`/`.href`, que ya es absoluta), y
  setearlas como atributo absoluto. Así el HTML serializado tiene URLs absolutas
  que matchean el `Map` para la reescritura por texto. (El `Map` puede no tener
  un asset que no disparó response —p. ej. lazy fuera de viewport—; para esos
  queda el fallback `<base>`.)
- **Fallback:** inyectar `<base href="<url original de la página>">` en el
  `<head>` del HTML guardado (solo si no hay `<base>` ya), para que cualquier
  asset no descargado resuelva contra el sitio vivo cuando haya conexión.

**Cableado en `src/capture/index.ts`:** instanciar `AssetCollector` junto al
`CssCollector`, `attach` al context, y tras el crawl correr la reescritura. El
`Manifest` suma `assetsDownloaded: number`.

**Efecto colateral positivo:** `preview.html` y el `site-mock` también muestran
mejor el HTML original (no estaba antes en alcance, pero se benefician gratis).

### Parte B — Generador `split.html` (`src/report/split.ts`)

`writeSplit(outAbs, pages, { redesignUrl })` escribe
`redesigner-artifacts/split.html`, **autocontenido** (HTML + CSS + JS inline,
sin frameworks), siguiendo el estilo de `src/report/preview.ts`.

`pages` = lista del manifest (`{ url, slug, title, html }`). El JS embebe esa
lista como JSON para el dropdown.

**Estructura del documento:**

- **Barra superior (`#bar`):**
  - `<select id="page">` con una opción por página (label `title || slug`,
    value = ruta `html/<slug>.html`). Cambia el `src` del iframe `#before`.
  - Botones `[Antes] [Split] [Ahora]` (`#mode-before`, `#mode-split`,
    `#mode-after`). El activo se resalta.
  - Texto chico con la URL del rediseño y la del original seleccionado.
- **Stage (`#stage`):** contenedor `position:relative`, ocupa el resto del alto.
  - `iframe#before` (original) — capa de abajo, tamaño completo.
  - `iframe#after` (rediseño, `src = redesignUrl`) — capa de arriba, tamaño
    completo, recortada con `clip-path: inset(0 0 0 var(--x))`.
  - `#divider` — línea + handle en `left: var(--x)`, visible en modo Split.

**Variable `--x`** (porcentaje 0–100) controla la cortina:
- `--x = 0%` → `#after` totalmente visible (Ahora).
- `--x = 100%` → `#after` totalmente recortado, se ve `#before` (Antes).
- intermedio → cortina; izquierda = antes, derecha = ahora.

**Estados (clase en `<body>`):**
- `mode-split` (**default**): `mousemove` sobre `#stage` actualiza `--x` según la
  X del cursor; `#divider` visible; `#after` con `pointer-events:none` (para que
  el mousemove lo capture el stage). Es el modo de comparación visual.
- `mode-before`: `--x:100%`; `#before` arriba (z-index) y `pointer-events:auto`
  → original interactivo. `#divider` oculto.
- `mode-after`: `--x:0%`; `#after` arriba y `pointer-events:auto` → rediseño
  interactivo. `#divider` oculto.
- `immersive`: oculta `#bar`, fuerza vista solo-rediseño a pantalla completa
  (`--x:0%`, `#after` interactivo). Es ortogonal: se entra/sale con doble click.

**Interacciones:**
- Botones → setean el modo correspondiente.
- **Doble click (`dblclick`) sobre `#stage`** → **toggle `immersive`**: entra
  (oculta barra + solo diseño nuevo) o sale (vuelve a Split con barra). Como el
  default y el "volver" son Split, al salir de inmersivo se restaura `mode-split`.
- Dropdown → cambia `#before.src`.

**Limitación documentada en el propio HTML y en SKILL:** sin scroll-sync (el
`#after` es cross-origin a `localhost`, no se puede leer/empujar su scroll). Cada
lado scrollea por separado.

`escapeHtml` reutilizado del patrón de `preview.ts`.

### Parte C — CLI + pipeline

- **`bin/capture.ts`:** nuevo comando `split`:
  - `--out <dir>` (default `.`), `--artifacts <dir>` (default
    `./redesigner-artifacts`), `--redesign-url <url>` (default
    `http://localhost:5173`).
  - Lee `manifest.json`, llama `writeSplit`. Si no hay manifest, error claro
    (“corré capture primero”).
- **`package.json`:** script `"split": "tsx bin/capture.ts split"`.
- **`SKILL.md`:** en el paso **9b** (mostrar + iterar), con el rediseño
  levantado (`npm run dev`), agregar:
  ```bash
  npm --prefix "SKILL_DIR" run split -- \
    --out "PROYECTO" --artifacts "PROYECTO/redesigner-artifacts" \
    --redesign-url "http://localhost:5173"
  open "PROYECTO/redesigner-artifacts/split.html"
  ```
  Explicarle al usuario: Split sigue el mouse (default), botones para fijar
  Antes/Ahora, doble click = solo diseño nuevo a pantalla completa (y de vuelta).
  Determinístico y barato → corre en el **motor**, no en subagente.
- Mencionar en **Reglas** que `split.html` necesita el server del rediseño
  levantado para el lado "ahora".

## Flujo de datos

```
capture ─┬─ html/<slug>.html      (DOM, URLs absolutizadas, <base> fallback)
         ├─ assets/<host>/…        (imgs/fuentes bajadas)  ← NUEVO
         ├─ css/… (reescrito url() → assets locales)        ← reescrito
         └─ manifest.json (+ assetsDownloaded)

split (con redesign vivo) ─ lee manifest ─ split.html
   #before  → html/<slug>.html (offline, assets locales)
   #after   → http://localhost:5173 (vivo, interactivo)
```

## Manejo de errores

- `asset-collector`: respuestas ilegibles/redirect → ignorar (try/catch), como
  `CssCollector`. Assets demasiado grandes → saltear + `warnings`.
- Reescritura: si un HTML/CSS no se puede reescribir, dejarlo como estaba +
  `warnings`; nunca abortar el crawl por esto.
- `split`: sin `manifest.json` → mensaje claro y `exitCode=1`. Sin páginas →
  generar `split.html` con aviso “no hay páginas capturadas”.
- En el HTML: si `#after` no carga (server caído) → overlay con
  “levantá el rediseño (`npm run dev`) y recargá”.

## Testing

- **Typecheck:** `npm run typecheck` debe pasar.
- **`asset-collector` / reescritura:** test unitario con un HTML/CSS fixture y un
  `Map` de URLs → assert que las referencias quedan reescritas a rutas locales
  relativas correctas y que se inyecta `<base>` solo si falta.
- **`writeSplit`:** dado un manifest fixture, generar el HTML y assert que
  contiene los iframes `#before`/`#after`, el `<select>` con una opción por
  página, los tres botones de modo, y el JS de `mousemove`/`dblclick`.
- **Smoke manual:** correr capture en un sitio simple → `split.html` →
  verificar a ojo: Split sigue el mouse, botones fijan lados, doble click entra/
  sale de inmersivo ocultando la barra, dropdown cambia el original.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/capture/asset-collector.ts` | **nuevo** — descarga imgs/fuentes |
| `src/capture/asset-rewrite.ts` | **nuevo** — reescribe HTML/CSS a rutas locales + `<base>` |
| `src/capture/page-capture.ts` | absolutizar URLs de assets antes de `content()` |
| `src/capture/index.ts` | cablear `AssetCollector` + reescritura + `assetsDownloaded` |
| `src/report/split.ts` | **nuevo** — generador `split.html` |
| `bin/capture.ts` | comando `split` |
| `package.json` | script `split` |
| `SKILL.md` | paso 9b + regla |
