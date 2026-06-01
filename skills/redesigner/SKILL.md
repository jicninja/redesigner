---
name: redesigner
description: Releva una web/app con Playwright (login MANUAL + crawl de SOLO LECTURA), captura screenshots, HTML, CSS, hovers/animaciones, detecta el logo y agrega design tokens; arma un mock navegable de lo relevado, suma una auditoría UX por subagente, y después orquesta el rediseño con Claude (React + Tailwind + Framer Motion) y exporta a Pencil, mock HTML y Figma. Usar cuando el usuario quiera relevar/auditar el estilo de un sitio o rediseñarlo. Trigger en "rediseñar", "relevar este sitio", "scrapear el estilo", "redesigner".
---

# redesigner — relevar y rediseñar un sitio

Pipeline híbrido: un motor Node/Playwright (determinístico, **solo lectura**) captura artefactos; vos (Claude, con visión) hacés el análisis, el logo, las preguntas y el rediseño. Los pasos pesados (mock navegable, auditoría UX, build del rediseño, exports) se **delegan a subagentes** para no gastar el contexto de esta conversación.

`SKILL_DIR` = directorio de este skill (donde está `package.json`). `PROYECTO` = cwd del usuario.

## 0. Setup (primera vez)

Si `SKILL_DIR/node_modules` no existe, instalá dependencias:
```bash
npm --prefix "SKILL_DIR" install
```
(El `postinstall` baja Chromium de Playwright.)

## 1. Preflight interactivo (en español)

1. Pedí la **URL** del sitio si no la dieron.
2. **Advertí SIEMPRE** (literal): *"El login es MANUAL: si el sitio pide usuario y contraseña, se abre una ventana del navegador y logueás vos a mano. Yo nunca te pido ni manejo credenciales. Aun así, usá una cuenta de PRUEBA/testing, nunca una productiva. El crawler es de solo lectura — no borra, edita ni envía formularios."*
3. **Nunca** pidas usuario/contraseña por el chat. No hace falta saber de antemano si el sitio tiene login: el motor lo detecta solo y, si hay, abre el navegador para que loguees a mano.

> Seguridad: el motor **no acepta credenciales** (no hay flags ni env vars de user/pass). El único camino de login es manual en la ventana visible. Esto es intencional.

## 2. Capture (determinístico, solo lectura, login manual)

Corré **siempre con `--no-headless`** (el navegador tiene que ser visible por si aparece un login manual):
```bash
npm --prefix "SKILL_DIR" run capture -- \
  --url "<URL>" --out "PROYECTO/redesigner-artifacts" --max-pages 25 --no-headless
```
Lanzalo en **background** (el navegador queda abierto esperando que loguees si hay login). Si el sitio pide login, aparece una ventana de Chromium: avisale al usuario que **logueé a mano**; el motor detecta solo cuando entró y sigue con el crawl (no hay que tocar la terminal). Flags útiles: `--login-url`, `--max-pages`, `--viewport`.

Al terminar, leé `redesigner-artifacts/manifest.json` (páginas, `auth`, `warnings`, `skippedDestructive`). Si `auth` es `failed: ...`, decí el motivo (p. ej. timeout del login manual) y ofrecé reintentar.

## 3. Revisión barata del scrape (preview.html)

**Antes de gastar contexto en imágenes**, abrí el preview para revisar a ojo lo capturado:
```bash
open "PROYECTO/redesigner-artifacts/preview.html"
```
Es una galería básica (screenshots viewport + links al HTML/full de cada página). Mirá ahí qué se relevó. Solo cargá screenshots puntuales con Read cuando necesites detalle visual fino — no leas todas.

## 4. Mock navegable del sitio relevado — vía SUBAGENTE

**Antes de analizar y de pedir decisiones**, generá un **mock navegable** del sitio tal como lo capturó Playwright, para que el usuario recorra vista por vista lo relevado. **Delegalo a un subagente** (Agent tool) con contexto limpio. Pasale solo la ruta de `redesigner-artifacts`. El subagente debe:

- Leer `redesigner-artifacts/manifest.json` y las `screenshots/*.full.png`.
- Escribir `redesigner-artifacts/site-mock/index.html`: un HTML **autocontenido y navegable** (sin servidor, solo JS + rutas relativas a `../screenshots/*.full.png`). Estructura simple: un panel lateral (o topbar) con la lista de páginas (por `title`/`slug` del manifest) y un área principal que muestra el **screenshot full** de la vista elegida; al clickear una página de la lista, cambia la vista (mock "vista por vista"). Liviano y claro, nada de frameworks.
- Devolver un resumen corto (qué páginas incluyó), NO volcar el HTML.

Después, abrilo para el usuario:
```bash
open "PROYECTO/redesigner-artifacts/site-mock/index.html"
```
Decile que ahí puede recorrer el sitio relevado vista por vista.

## 5. Escribir los reportes de análisis

Rellená los esqueletos en `redesigner-artifacts/reports/` (ya existen con TODOs):
- `site-overview.md` — qué es/hace el sitio (de HTML + screenshots).
- `visual-style.md` — layout, color, tipografía, densidad, lenguaje de movimiento (mirá `css/transitions.json`, `css/animations.json`, `css/hover-states.json`).
- `design-tokens.md` — anotá roles de paleta/escala desde `tokens.json`.

## 6. Logo (VLM)

Mirá `redesigner-artifacts/logo/logo.png` y `logo/candidates/` con Read. Completá `reports/logo-analysis.md`: tipo (wordmark/isotipo/combinado), calidad, **¿es básico/genérico?** (sí/no + por qué).

Si es **básico**:
1. `AskUserQuestion`: pedile al usuario que explique la marca (valores, audiencia, qué la diferencia).
2. Componé un **prompt afinado para gpt-image** (concepto, estilo, paleta de `tokens.json`, fondo transparente, variaciones) y escribilo en `reports/logo-prompt.md`. Mostráselo: **el usuario lo lanza a mano** en gpt-image/ChatGPT (no hay llamada a API). El logo resultante lo dejará en `redesign/src/assets/`.

## 7. Auditoría UX experta — vía SUBAGENTE

**Antes de pedirle decisiones al usuario**, sumá una mirada experta. **Delegá a un subagente** (Agent tool) que actúe como **diseñador/a senior de UI/UX y producto**. Pasale las rutas de `redesigner-artifacts` (screenshots full + `reports/*.md` ya escritos). El subagente debe:

- Revisar las pantallas y los reportes y producir una **auditoría accionable** en `redesigner-artifacts/reports/uiux-expert-review.md`, cubriendo: heurísticas de Nielsen, jerarquía visual, consistencia (botones/espaciado/color), accesibilidad y contraste, densidad y legibilidad, patrones de navegación, estados (vacío/carga/error), y **quick wins** vs **oportunidades de rediseño**.
- Priorizar las recomendaciones (impacto × esfuerzo) y, cuando aplique, mapear problemas concretos a soluciones de diseño.
- Devolver un **resumen corto** (top hallazgos y recomendaciones) — NO volcar todo el archivo.

Leé `reports/uiux-expert-review.md` (o el resumen) y **incorporá sus recomendaciones** a tus decisiones y al brief del paso 9.

## 8. Preguntas de rediseño

`AskUserQuestion` (multi si aplica):
- **Tipo**: revamp total vs refinamiento.
- **Estilo**: minimal / corporate / playful / dark / etc.
- **Prioridad**: qué páginas/componentes importan más.

Con las respuestas + la auditoría UX, completá `reports/redesign-brief.md`: mejoras concretas, inventario de componentes, y el **plan de movimiento** (mapear transitions/keyframes a variants de `motion`).

## 9. Claude design (SIEMPRE primero) — vía SUBAGENTE

Generá la base del proyecto:
```bash
npm --prefix "SKILL_DIR" run scaffold -- --out "PROYECTO" --artifacts "PROYECTO/redesigner-artifacts"
```
Esto crea `PROYECTO/redesign/` (React 19 + Vite 8 + Tailwind v4 + `motion@12`, tokens en `src/styles/theme.css`, variants en `src/lib/motion.ts`, stubs de componentes/páginas).

El scaffold también genera el **split mode** embebido: `src/CompareShell.tsx`, un shell que **envuelve la app** (`main.tsx` monta `<CompareShell><App/></CompareShell>`). Compara el sitio **original** (lado "antes", iframe servido **offline** desde `public/_original/` — copiado de los artefactos `html/`, `assets/`, `css/`; lista de páginas en `src/lib/original.ts`) contra el **rediseño real** (lado "ahora", el propio `App` renderizado), con una cortina que por **default sigue el mouse** y se puede **fijar** (botón 🖱️ en la barra o clic en el handle ⇔; al fijar, el handle se arrastra y se libera el hover/click sobre el rediseño). El **scroll** y la **vista** (dropdown ↔ ruta del rediseño, vía `route` en `src/lib/original.ts`) se sincronizan entre ambos lados. Por **default** muestra el split; **doble click** = solo el diseño nuevo a pantalla completa (oculta la barra), otro doble click vuelve al split. El subagente NO debe romper el montaje de `CompareShell` ni `public/_original/`.

Luego **delegá el build del rediseño a un subagente** (Agent tool) para ahorrar contexto. El subagente debe:
- Usar el skill `frontend-design`.
- Leer `reports/redesign-brief.md`, `visual-style.md`, `design-tokens.md`, `uiux-expert-review.md` y las screenshots relevantes del preview.
- Completar componentes y páginas en `PROYECTO/redesign/`, usando Tailwind v4 (`@theme`) y Framer Motion (`motion/react`) de forma generosa (entrada con `fadeUp`/`staggerContainer`, hover/tap con `hoverLift`, transición de páginas con `AnimatePresence`).
- Verificar con `npm install && npm run build` dentro de `redesign/`.
- Devolver un resumen corto (qué construyó, qué falta), NO volcar todos los archivos.

`redesign/` es la **fuente de verdad** para los exports.

## 9b. Mostrar + iterar (MILESTONE — gate obligatorio antes de exportar)

**No exportes hasta que el usuario apruebe el rediseño.** Después de que el subagente construye:

1. **Mostrá el rediseño**. Levantá el proyecto y sacá screenshots de las pantallas clave:
   ```bash
   cd "PROYECTO/redesign" && npm run dev   # (en background) o npm run build && npm run preview
   ```
   Tomá capturas (con el Playwright del propio skill o el skill `run`) de las vistas principales en desktop y mobile, y mostráselas al usuario con Read. Si no, decile la URL local (`http://localhost:5173`) para que lo mire.
1c. **Split antes/ahora.** Con el rediseño levantado (`http://localhost:5173`), el comparador `CompareShell` ya está embebido: la app arranca mostrando el **split** sobre el rediseño.
   Explicale al usuario: **Split** es el modo por defecto y la cortina por **default sigue el mouse**; con el botón 🖱️ (o clic en el handle ⇔) la **fijás** para hacer hover/click sobre el rediseño, y la reposicionás **arrastrando** el handle. Los botones `[Antes] [Split] [Ahora]` fijan un lado (en Antes el original queda interactivo); **doble click** muestra solo el diseño nuevo a pantalla completa y otro doble click vuelve al Split; el dropdown elige qué página original comparar y **navega también el rediseño**. El **scroll** se sincroniza entre lados. El lado "antes" es el HTML original copiado a `redesign/public/_original/`; el "ahora" es el rediseño real renderizado. No hay artefacto `split.html` aparte ni ruta especial: el comparador envuelve la app.
2. **Preguntá si le gusta** (`AskUserQuestion` o abierto): ¿aprobado o querés cambios?
3. **Si quiere cambios**: tomá su prompt/feedback y **volvé a delegar al subagente** (paso 9) con ese feedback + lo ya construido. Repetí el ciclo *build → mostrar → feedback* las veces que haga falta.
4. **Solo cuando el usuario apruebe**, pasá a los exports.

Este loop de iteración es central: el usuario debe ver y refinar el rediseño por prompt antes de exportar.

## 10. Exports derivados (opcional, SOLO tras aprobación) — vía SUBAGENTE de contexto limpio

`AskUserQuestion` multi-select: ¿qué exports querés además del proyecto React? (Mock HTML, Figma, Pencil.)

**Delegá TODOS los exports a un subagente dedicado (Agent tool) con contexto limpio.** Este subagente NO necesita el historial de la conversación: pasale solo las rutas (`PROYECTO`, `redesigner-artifacts`, `redesign/`) y la lista de exports elegidos. Debe:

- **Mock HTML estático**: correr `npm --prefix "SKILL_DIR" run scaffold -- --out "PROYECTO" --artifacts "PROYECTO/redesigner-artifacts" --target html` → genera `redesign-html/index.html` + `tokens.figma.json`.
- **Figma**: dejar listo `redesign-html/index.html` (importable con el plugin **html.to.design**) y `tokens.figma.json` (plugin **Tokens Studio**); reportar al usuario esos dos caminos.
- **Pencil (.pen)**: con el MCP `pencil` — `get_editor_state({include_schema:true})` + `get_guidelines`, luego `batch_design` para recrear las pantallas clave del rediseño como diseño .pen (tomando de referencia `redesign/` y las screenshots); verificar con `get_screenshot`.
- Devolver un resumen corto de qué exportó y dónde quedó cada cosa.

Así el contexto de esta conversación queda limpio: el mock navegable (paso 4), la auditoría UX (paso 7), el build del rediseño (paso 9) y los exports (paso 10) corren en subagentes.

## Reglas

- El crawler es **estrictamente de solo lectura**: nunca pide al motor borrar/editar/enviar nada.
- **Sin credenciales**: el motor nunca recibe ni pide usuario/contraseña. El login, si existe, es **manual** en el navegador visible (`--no-headless`). Nunca pidas credenciales por el chat.
- Preferí `preview.html` / el mock navegable sobre cargar muchas imágenes al contexto.
- El mock navegable, la auditoría UX, el build del rediseño y los exports van **por subagente**.
- El **split** (comparación antes/ahora) está **embebido en `redesign/`** vía `CompareShell` que envuelve la app, no es un artefacto aparte: usa el HTML original copiado a `public/_original/` (con los `assets/` descargados en la captura) y el rediseño real como "ahora". Necesita el server del rediseño levantado (`npm run dev`).
