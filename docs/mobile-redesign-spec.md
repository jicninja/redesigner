# redesigner — capa mobile (Maestro) · Spec

> Branch: `mobile-redesign`. Estado: **propuesta, sin aprobar ejecución**.

## Objetivo

Sumarle a `redesigner` una **fuente de captura mobile** paralela a Playwright: relevar las
pantallas de una **app nativa** (Android/iOS) conduciéndola con **Maestro**, y alimentar el
pipeline existente (preview → mock navegable → análisis → UX audit → rediseño) para producir
un **rediseño mobile**.

Decisiones tomadas con el usuario:

- **Motor:** reusar el patrón del proyecto `mobile-qa` — un CLI fino de Node que envuelve el
  binario `maestro`, con flows YAML autoreados por Claude y screenshots por hito. **No** el MCP
  oficial de Maestro.
- **Fuente:** relevar una **app nativa** (nueva fuente de captura), no validar el output web.
- **Control:** la app puede ser de **terceros** para capturar, pero el usuario tiene acceso al
  código del rediseño después (output tratado como app propia). La captura debe tolerar apps
  cuyo flujo no controlamos del todo (login manual en el device).

## Diferencia esencial web vs mobile

| | Web (Playwright, hoy) | Mobile (Maestro, nuevo) |
|---|---|---|
| Navegación | crawl automático de links same-origin | flows YAML autoreados por Claude (taps/waits) |
| "Página" | URL | pantalla = hito (`takeScreenshot`) |
| Estructura | HTML + CSS + computed styles | **view hierarchy** (`maestro hierarchy`) — análogo del HTML |
| Estilo | CSS interceptado por red, tokens desde CSS | **sin CSS** → tokens derivados de **píxeles** de screenshots |
| Logo | `<img>`/favicon detectado en DOM | crop del header / icono de launcher + VLM |
| Login | manual en Chromium visible | manual en el **device** (el usuario tappea); creds opcionales vía `--creds` como en mobile-qa |
| Read-only | crawler no envía forms | flows solo navegan/leen; nada destructivo (sin logout/delete/compra) |

**Implicancia:** lo que cambia es la **captura** y la **derivación de tokens/logo**. El resto
del pipeline (preview, mock navegable subagente, reports, UX audit, build del rediseño) se
**reusa** porque consume `redesigner-artifacts/` + screenshots.

## Forma de los artefactos (mobile)

Mismo `redesigner-artifacts/`, con un manifest etiquetado `source: "mobile"`:

```
redesigner-artifacts/
  manifest.json        # { source:"mobile", appId, platform, device, auth, screens:[...], warnings }
  preview.html         # galería de screenshots de pantallas
  tokens.json          # paleta/escala derivadas de píxeles (no de CSS)
  screens/             # NNN_<label>.png  (full por hito) + NNN_<label>.hierarchy.json
  logo/                # icono de launcher / crop de header + candidates
  reports/             # mismos skeletons, lente mobile en uiux-expert-review
```

Manifest mobile (campos nuevos, retrocompatible con downstream que lee `pages`):

```jsonc
{
  "source": "mobile",
  "appId": "com.example.app",
  "platform": "android",
  "device": "<udid>",
  "auth": "manual-on-device" | "public" | "failed: ...",
  "screens": [{ "label": "home", "screenshot": "screens/001_home.png",
                "hierarchy": "screens/001_home.hierarchy.json" }],
  "pages": [ ...alias de screens para que el mock/preview existentes funcionen... ],
  "warnings": []
}
```

## Descomposición en waves (gates)

> Regla OdaMind: solo la wave aprobada queda activa; aprobación de ejecución por wave.

### Wave 1 — Motor de captura mobile (port + adaptación de mobile-qa)
- Portar la capa device/driver de `mobile-qa` a `skills/redesigner/src/mobile/`:
  `driver/{maestro,resolve,android,ios,exec}.ts`, `secrets`, `report`, `watch`, `config`, `types`.
- Comandos en el engine de redesigner: `mobile-doctor` y `mobile-capture`
  (`--app <appId> --platform android|ios --flows <dir|file> --out redesigner-artifacts [--creds] [--watch]`).
- Corre los flows YAML autoreados, junta screenshots por hito **y** `maestro hierarchy` por
  pantalla en `redesigner-artifacts/screens/`.
- Escribe `manifest.json` con `source:"mobile"`.
- **Salida verificable:** `mobile-doctor` reporta maestro/java/device; `mobile-capture` sobre
  un flow de smoke produce screens/ + manifest.

### Wave 2 — Derivación de artefactos mobile (sin DOM)
- Extracción determinística de **paleta/tokens desde píxeles** de las screenshots
  (colores dominantes, ratios de contraste) → `tokens.json`.
- Logo: crop del header de la primera pantalla + (en SKILL) análisis VLM; icono de launcher si
  está disponible vía adb.
- `preview.html` y skeletons de reports adaptados a "screens".
- El mock navegable (subagente) ya lee manifest+screenshots → ajuste mínimo.

### Wave 3 — Orquestación en SKILL.md (rama mobile)
- Branch en el SKILL: intent "rediseñá esta app / app nativa / mobile" → pipeline mobile.
- Warning de **login manual en el device**; guía para **autorear flows Maestro** (locators por
  `id`/testID, fallback a texto; `takeScreenshot` liberal por hito).
- UX audit con **lente mobile**: touch targets, thumb zones, safe areas, patrones nativos,
  estados (empty/loading/error), gestos.

### Wave 4 — Scaffold del rediseño mobile + show/iterate
- **GATE DE DECISIÓN (abierto):** stack de salida del rediseño mobile —
  **React Native / Expo** (matchea tu ecosistema `list-app`/`mobile-qa`, "app propia" real) vs
  **React web mobile-first** (reusa el scaffold actual en viewport de teléfono).
- Scaffold sembrado con tokens; subagente con `frontend-design` construye; se muestra en device
  via screenshots de Maestro; loop de iteración hasta aprobar.

### Wave 5 — Exports (opcional)
- Frames mobile en Pencil (.pen) y/o Figma. Prioridad baja.

## Decisión abierta a resolver antes de Wave 4

**Stack del rediseño mobile:** React Native/Expo vs React web mobile-first. No bloquea
Waves 1–3 (captura y análisis son independientes del stack de salida). Se decide antes de
tocar el scaffold.

## No-objetivos (por ahora)
- Driver observe→act totalmente adaptativo para apps de terceros sin ningún flow: los flows los
  autorea Claude; el login y los pasos no-predecibles los hace el usuario en el device (con
  `--watch` / mirror).
- iOS solo valida en macOS (igual que mobile-qa).
```
