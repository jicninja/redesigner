# redesigner

**A [Claude Code](https://claude.com/claude-code) skill to crawl a web/app and redesign it with Claude.**

Hybrid model: a **Node engine** (deterministic and **read-only**) captures everything that defines a product's style; **Claude** (with vision) does the analysis, the UX audit, the logo, the questions and the redesign. The heavy steps (navigable mock, audit, redesign build, exports) are delegated to subagents to save context.

It works on two sources that feed the **same** pipeline:

- **Web** — a URL, surveyed with **Playwright**.
- **Native mobile apps** — a real device/emulator, driven with **Maestro** (Android/iOS), with tokens derived from the screen **pixels** (no DOM).

> Point it at any site **or app** — it surveys the style, then rebuilds it with Claude.

*(Español más abajo ↓)*

---

## Install

It's a Claude Code plugin. From Claude Code:

```text
/plugin marketplace add jicninja/redesigner
/plugin install redesigner@redesigner
```

**Requirements:** Node ≥ 20 and npm. On the **first run**, the skill installs its dependencies and downloads Playwright's Chromium automatically (`npm install` + `postinstall`).

Then just ask Claude:

```text
redesign this site: https://app.example.com
```

or *"survey the style of …"*, *"scrape this site"*, *"redesigner …"*.

---

## Example — redesigning its own repo page

redesigner was pointed at **its own GitHub repo page** and asked to redesign it — **twice, in two very different styles**. Both keep the exact same page (repo header, tabs, file list, README panel, About sidebar) and only swap the skin.

**Before** — the plain GitHub repo page:

![Before](docs/example/before.png)

**After ① — dark glassmorphism** · 🔗 **[redesigner-glass.surge.sh](https://redesigner-glass.surge.sh)**
Frosted translucent panels with `backdrop-blur`, a soft ambient blue glow and a single brand accent (`#3b82f6`).

![Glassmorphism restyle](docs/example/after.png)

**After ② — cyberpunk / neon** · 🔗 **[redesigner-cyber.surge.sh](https://redesigner-cyber.surge.sh)**
Neon cyan + magenta on near-black, glowing borders, HUD corner brackets, CRT scanlines, angular clipped chrome and glitch micro-interactions.

![Cyberpunk restyle](docs/example/cyber-after.png)

*Same structure and content, two full re-skins — change only the design tokens. Produced end to end with redesigner (capture → analysis → Claude design with Tailwind v4 + Framer Motion), then deployed to Surge.*

---

## How it works (pipeline)

1. **Capture** (Playwright, read-only) — crawls same-origin **without touching anything destructive** (skips logout/delete/checkout/…), and per page saves: screenshots (full + viewport), HTML, CSS (via network interception, CORS-immune), sampled computed styles, hovers/focus (pixels + diff), `transitions` and `@keyframes`. Detects the **logo** and aggregates **design tokens**.
2. **preview.html** — lightweight gallery to eyeball what was scraped, without spending model context.
3. **Navigable mock** (subagent) — recreates the surveyed site view by view, so you can walk through it before deciding.
4. **Analysis** (Claude) — reports in `reports/`: overview, visual style, design tokens, logo.
5. **UX audit** (subagent, senior designer role) — Nielsen heuristics, hierarchy, consistency, accessibility/contrast, states, and quick wins vs opportunities.
6. **Logo** — if it's generic, it builds a **prompt for gpt-image** that you run yourself (no API, no cost).
7. **Claude design** (subagent with the `frontend-design` skill) — scaffolds **React 19 + Vite + Tailwind v4 + Framer Motion** seeded with the tokens, and Claude fills in components and pages.
8. **Show + iterate** — mandatory gate: the redesign is shown and iterated by prompt **until you approve**, before exporting.
9. **Exports** (subagent, optional, only after approval) — static HTML mock, **Figma** (`html.to.design` + `tokens.figma.json` for Tokens Studio) and **Pencil** (.pen via MCP).

`redesign/` (the React project) is the **source of truth** for exports.

### Before/after split (embedded)

The web scaffold ships an **embedded comparator** — `CompareShell` wraps the app, so the running redesign opens on a split between the **original** site (served **offline** from `public/_original/`, copied from the capture's `html/` + `assets/`) and the **real redesign**. The curtain **follows the mouse** by default and can be **pinned** and dragged; scroll and the current view are synced between both sides; **double-click** toggles fullscreen on the new design. No separate artifact — it lives inside `redesign/` and only needs `npm run dev`.

### Mobile (native apps)

When the source is a native app, capture runs through **Maestro** instead of Playwright:

1. **`mobile-doctor`** — checks Maestro / Java / adb and lists attached devices; if no Android device is up, it lists offline **AVDs** with the exact `emulator -avd <name>` command for you to boot one.
2. **`mobile-inspect`** — dumps the **current** screen's view hierarchy + a screenshot (read-only, no app launch) so Claude reads real labels/ids and authors reliable selectors in one pass.
3. **`mobile-init-flows`** — seeds an editable Maestro **flow template** (`redesigner-flows/survey.yaml` + a reusable `_screenshot.yaml`).
4. **`mobile-capture`** — drives the app (MANUAL login on the device, READ-ONLY: navigate + screenshot only), one shot per screen, and derives `tokens.json` (palette from pixels) and a header-crop logo. `--watch` opens a live mirror; **`--continuous`** re-runs the flow on every save for fast selector authoring; near-identical consecutive screenshots (splash/loading) are dropped automatically.
5. **`mobile-scaffold`** — generates `redesign-mobile/` (**React Native + Expo Router + TypeScript**) seeded with the mobile tokens, one screen stub per surveyed screen.

From there the **shared** steps apply (mock, analysis, UX audit with a mobile lens, questions, build, show/iterate), and the main mobile export target is **Pencil** as phone-sized frames.

---

## Security

- **MANUAL login, no credentials.** The engine **never** receives or asks for a username/password. If the site has a login, a Chromium window opens (`--no-headless`) and **you log in by hand**; the engine detects on its own when you're in and continues. There are no credential flags or env vars — by design.
- **Read-only.** The crawler does not delete, edit or submit forms (except the login you do yourself). It skips destructive links. **Mobile flows** are read-only too: they only navigate and screenshot — never tap log out / delete / pay / submit, and never `clearState` on an app you logged into by hand.
- Always use a **test account**, never a production one.
- Session cookies stay only in the local artifacts (`.auth/`, gitignored) — never published. On mobile there are no credential flags either; an optional `--creds <group>` only injects values from a local gitignored `.qa.secrets.json` as Maestro `--env`.

---

## Manual engine usage (optional)

Beyond the skill, the engine can be run by hand from `skills/redesigner/`:

```bash
cd skills/redesigner
npm install                 # first time (downloads Chromium)

# Survey (with a visible browser in case there's a manual login)
npm run capture -- --url https://example.com --out ./redesigner-artifacts --max-pages 25 --no-headless

# Scaffold the redesign (React) and, optionally, the HTML mock
npm run scaffold -- --out . --artifacts ./redesigner-artifacts
npm run scaffold -- --out . --artifacts ./redesigner-artifacts --target html
```

**`capture` flags:** `--url` (req.), `--login-url`, `--out`, `--max-pages`, `--viewport WxH`, `--no-headless`, `--capture-trace`, `--page-timeout <ms>`.
**`scaffold` flags:** `--out` (req.), `--artifacts`, `--target react|html`.

### Mobile (native apps, via Maestro)

Requires **Maestro** (Java 17+) and a device/emulator (Android: adb + an AVD/USB device; iOS: macOS).

```bash
cd skills/redesigner
npm run mobile-doctor                              # checks Maestro/Java/adb + lists devices/AVDs
npm run mobile-inspect -- --platform android       # dump current screen hierarchy + screenshot
npm run mobile-init-flows -- --out . --app <appId> # seed an editable Maestro flow template

# Survey the app (MANUAL login on device; --watch opens a live mirror)
npm run mobile-capture -- --app <appId> --platform android \
  --flows ./redesigner-flows/survey.yaml --out ./redesigner-artifacts --watch

# Scaffold the mobile redesign (React Native + Expo Router)
npm run mobile-scaffold -- --out . --artifacts ./redesigner-artifacts
```

**`mobile-capture` flags:** `--app` (req.), `--platform android|ios` (req.), `--flows` (req.), `--out`, `--device <udid>`, `--creds <group>`, `--watch`, `--continuous`.

---

## Artifacts (`redesigner-artifacts/`)

```text
manifest.json   preview.html   tokens.json
screenshots/    html/          css/{computed,inline,transitions.json,animations.json,hover-states.json}
logo/{logo.png, candidates/, candidates.json}
reports/{site-overview, visual-style, design-tokens, logo-analysis, logo-prompt, redesign-brief, uiux-expert-review}.md
```

**Mobile** writes the same layout with `source:"mobile"`, replacing `screenshots/` + `html/` + `css/` with `screens/NNN_<label>.png` (plus `_inspect.png` / `_inspect.hierarchy.json` from `mobile-inspect`); `tokens.json` is derived from pixels (`dominantBackground`, `primaryText`, `accentCandidates`) and `logo/logo.png` is a header crop.

They are generated in the **project where you invoke** the skill, not in the plugin repo.

---

## Repo structure

```text
.claude-plugin/{plugin.json, marketplace.json}   ← marketplace + plugin
skills/redesigner/
  SKILL.md                                        ← orchestration (what Claude reads)
  package.json, bin/capture.ts                    ← CLI entrypoint (web + mobile commands)
  src/{capture,scaffold,report,util}/             ← Node/Playwright engine (web)
  src/mobile/                                      ← Maestro engine (native apps)
```

## License

MIT — see [LICENSE](./LICENSE).

<br>

---
---

<br>

# redesigner (Español)

**Skill de [Claude Code](https://claude.com/claude-code) para relevar una web/app y rediseñarla con Claude.**

Modelo híbrido: un **motor Node** (determinístico y de **solo lectura**) captura todo lo que define el estilo de un producto; **Claude** (con visión) hace el análisis, la auditoría UX, el logo, las preguntas y el rediseño. Los pasos pesados (mock navegable, auditoría, build del rediseño, exports) se delegan a subagentes para no gastar contexto.

Funciona sobre dos fuentes que alimentan el **mismo** pipeline:

- **Web** — una URL, relevada con **Playwright**.
- **Apps mobile nativas** — un device/emulador real, manejado con **Maestro** (Android/iOS), con tokens derivados de los **píxeles** de la pantalla (sin DOM).

> Apuntalo a cualquier sitio **o app** — releva el estilo y lo reconstruye con Claude.

---

## Instalación

Es un plugin de Claude Code. Desde Claude Code:

```text
/plugin marketplace add jicninja/redesigner
/plugin install redesigner@redesigner
```

**Requisitos:** Node ≥ 20 y npm. En la **primera corrida**, el skill instala sus dependencias y baja Chromium de Playwright automáticamente (`npm install` + `postinstall`).

Después, simplemente pedíselo a Claude:

```text
rediseñá este sitio: https://app.ejemplo.com
```

o *"relevá el estilo de …"*, *"scrapeá este sitio"*, *"redesigner …"*.

---

## Ejemplo — rediseñando su propia página del repo

Apuntamos redesigner a **su propia página de GitHub** y le pedimos que la rediseñe — **dos veces, en dos estilos bien distintos**. Ambos mantienen exactamente la misma página (header del repo, tabs, lista de archivos, panel del README, sidebar About) y solo cambian la piel.

**Antes** — la página del repo en GitHub, pelada:

![Antes](docs/example/before.png)

**Después ① — glassmorphism oscuro** · 🔗 **[redesigner-glass.surge.sh](https://redesigner-glass.surge.sh)**
Paneles de vidrio esmerilado translúcido con `backdrop-blur`, un glow azul ambiental suave y un único acento de marca (`#3b82f6`).

![Restyle glassmorphism](docs/example/after.png)

**Después ② — cyberpunk / neon** · 🔗 **[redesigner-cyber.surge.sh](https://redesigner-cyber.surge.sh)**
Neon cyan + magenta sobre negro, bordes con glow, corner-brackets tipo HUD, scanlines CRT, chrome angular recortado y micro-glitches.

![Restyle cyberpunk](docs/example/cyber-after.png)

*Misma estructura y contenido, dos reskins completos — cambian solo los design tokens. Hecho de punta a punta con redesigner (capture → análisis → Claude design con Tailwind v4 + Framer Motion) y deployado a Surge.*

---

## Cómo funciona (pipeline)

1. **Capture** (Playwright, solo lectura) — crawlea same-origin **sin tocar nada destructivo** (salta logout/delete/checkout/…), y por cada página guarda: screenshots (full + viewport), HTML, CSS (vía interceptación de red, inmune a CORS), computed styles muestreados, hovers/focus (píxeles + diff), `transitions` y `@keyframes`. Detecta el **logo** y agrega **design tokens**.
2. **preview.html** — galería liviana para revisar a ojo lo scrapeado, sin gastar contexto del modelo.
3. **Mock navegable** (subagente) — recrea el sitio relevado vista por vista, para que lo recorras antes de decidir.
4. **Análisis** (Claude) — reportes en `reports/`: overview, estilo visual, design tokens, logo.
5. **Auditoría UX** (subagente, rol de diseñador/a senior) — heurísticas de Nielsen, jerarquía, consistencia, accesibilidad/contraste, estados, y quick wins vs oportunidades.
6. **Logo** — si es genérico, arma un **prompt para gpt-image** que vos lanzás a mano (sin API ni costo).
7. **Claude design** (subagente con el skill `frontend-design`) — scaffold **React 19 + Vite + Tailwind v4 + Framer Motion** sembrado con los tokens, y Claude completa componentes y páginas.
8. **Mostrar + iterar** — gate obligatorio: se muestra el rediseño y se itera por prompt **hasta que apruebes**, antes de exportar.
9. **Exports** (subagente, opcional, solo tras aprobación) — mock HTML estático, **Figma** (`html.to.design` + `tokens.figma.json` para Tokens Studio) y **Pencil** (.pen vía MCP).

`redesign/` (proyecto React) es la **fuente de verdad** de los exports.

### Split antes/después (embebido)

El scaffold web trae un **comparador embebido** — `CompareShell` envuelve la app, así el rediseño corriendo abre en un split entre el sitio **original** (servido **offline** desde `public/_original/`, copiado del `html/` + `assets/` de la captura) y el **rediseño real**. La cortina **sigue el mouse** por defecto y se puede **fijar** y arrastrar; el scroll y la vista actual quedan sincronizados entre ambos lados; **doble clic** alterna pantalla completa del nuevo diseño. No es un artefacto aparte — vive dentro de `redesign/` y solo necesita `npm run dev`.

### Mobile (apps nativas)

Cuando la fuente es una app nativa, la captura va por **Maestro** en vez de Playwright:

1. **`mobile-doctor`** — chequea Maestro / Java / adb y lista los devices conectados; si no hay device Android arriba, lista los **AVDs** offline con el comando exacto `emulator -avd <nombre>` para que arranques uno.
2. **`mobile-inspect`** — vuelca la jerarquía de vistas de la pantalla **actual** + un screenshot (solo lectura, sin lanzar la app) para que Claude lea labels/ids reales y arme selectores confiables de una.
3. **`mobile-init-flows`** — siembra un **template de flow** Maestro editable (`redesigner-flows/survey.yaml` + un `_screenshot.yaml` reutilizable).
4. **`mobile-capture`** — maneja la app (login MANUAL en el device, SOLO LECTURA: solo navega + screenshot), una toma por pantalla, y deriva `tokens.json` (paleta de los píxeles) y un logo recortado del header. `--watch` abre un mirror en vivo; **`--continuous`** re-corre el flow en cada guardado para iterar selectores rápido; los screenshots consecutivos casi idénticos (splash/loading) se descartan solos.
5. **`mobile-scaffold`** — genera `redesign-mobile/` (**React Native + Expo Router + TypeScript**) sembrado con los tokens mobile, un stub de pantalla por cada pantalla relevada.

De ahí en más aplican los pasos **compartidos** (mock, análisis, auditoría UX con lente mobile, preguntas, build, mostrar/iterar), y el target principal de export mobile es **Pencil** como frames de teléfono.

---

## Seguridad

- **Login MANUAL, sin credenciales.** El motor **nunca** recibe ni pide usuario/contraseña. Si el sitio tiene login, se abre una ventana de Chromium (`--no-headless`) y **logueás vos a mano**; el motor detecta solo cuando entraste y sigue. No hay flags ni env vars de credenciales — es intencional.
- **Solo lectura.** El crawler no borra, edita ni envía formularios (salvo el login que hacés vos). Salta links destructivos. Los **flows mobile** también son de solo lectura: solo navegan y sacan screenshots — nunca toques cerrar sesión / borrar / pagar / enviar, ni `clearState` en una app donde te logueaste a mano.
- Usá siempre una **cuenta de prueba**, nunca una productiva.
- Las cookies de sesión quedan solo en los artefactos locales (`.auth/`, gitignored) — nunca se publican. En mobile tampoco hay flags de credenciales; un `--creds <group>` opcional solo inyecta valores de un `.qa.secrets.json` local (gitignored) como `--env` de Maestro.

---

## Uso manual del motor (opcional)

Más allá del skill, el motor se puede correr a mano desde `skills/redesigner/`:

```bash
cd skills/redesigner
npm install                 # primera vez (baja Chromium)

# Relevar (con navegador visible por si hay login manual)
npm run capture -- --url https://ejemplo.com --out ./redesigner-artifacts --max-pages 25 --no-headless

# Scaffold del rediseño (React) y, opcional, mock HTML
npm run scaffold -- --out . --artifacts ./redesigner-artifacts
npm run scaffold -- --out . --artifacts ./redesigner-artifacts --target html
```

**Flags de `capture`:** `--url` (req.), `--login-url`, `--out`, `--max-pages`, `--viewport WxH`, `--no-headless`, `--capture-trace`, `--page-timeout <ms>`.
**Flags de `scaffold`:** `--out` (req.), `--artifacts`, `--target react|html`.

### Mobile (apps nativas, vía Maestro)

Necesita **Maestro** (Java 17+) y un device/emulador (Android: adb + un AVD/device USB; iOS: macOS).

```bash
cd skills/redesigner
npm run mobile-doctor                              # chequea Maestro/Java/adb + lista devices/AVDs
npm run mobile-inspect -- --platform android       # vuelca jerarquía de la pantalla actual + screenshot
npm run mobile-init-flows -- --out . --app <appId> # siembra un template de flow Maestro editable

# Relevar la app (login MANUAL en el device; --watch abre un mirror en vivo)
npm run mobile-capture -- --app <appId> --platform android \
  --flows ./redesigner-flows/survey.yaml --out ./redesigner-artifacts --watch

# Scaffold del rediseño mobile (React Native + Expo Router)
npm run mobile-scaffold -- --out . --artifacts ./redesigner-artifacts
```

**Flags de `mobile-capture`:** `--app` (req.), `--platform android|ios` (req.), `--flows` (req.), `--out`, `--device <udid>`, `--creds <group>`, `--watch`, `--continuous`.

---

## Artefactos (`redesigner-artifacts/`)

```text
manifest.json   preview.html   tokens.json
screenshots/    html/          css/{computed,inline,transitions.json,animations.json,hover-states.json}
logo/{logo.png, candidates/, candidates.json}
reports/{site-overview, visual-style, design-tokens, logo-analysis, logo-prompt, redesign-brief, uiux-expert-review}.md
```

**Mobile** escribe el mismo layout con `source:"mobile"`, reemplazando `screenshots/` + `html/` + `css/` por `screens/NNN_<label>.png` (más `_inspect.png` / `_inspect.hierarchy.json` de `mobile-inspect`); `tokens.json` se deriva de los píxeles (`dominantBackground`, `primaryText`, `accentCandidates`) y `logo/logo.png` es un recorte del header.

Se generan en el **proyecto donde invocás** la skill, no en el repo del plugin.

---

## Estructura del repo

```text
.claude-plugin/{plugin.json, marketplace.json}   ← marketplace + plugin
skills/redesigner/
  SKILL.md                                        ← orquestación (lo que lee Claude)
  package.json, bin/capture.ts                    ← entrypoint CLI (comandos web + mobile)
  src/{capture,scaffold,report,util}/             ← motor Node/Playwright (web)
  src/mobile/                                     ← motor Maestro (apps nativas)
```

## Licencia

MIT — ver [LICENSE](./LICENSE).
