# redisgner

**Skill de [Claude Code](https://claude.com/claude-code) para relevar una web/app y rediseñarla con Claude.**

Modelo híbrido: un **motor Node/Playwright** (determinístico y de **solo lectura**) captura todo lo que define el estilo de un sitio; **Claude** (con visión) hace el análisis, la auditoría UX, el logo, las preguntas y el rediseño. Los pasos pesados (mock navegable, auditoría, build del rediseño, exports) se delegan a subagentes para no gastar contexto.

> El nombre es a propósito: **re-dis(e)gner**. Releva un sitio y lo deja listo para rediseñar.

---

## Instalación

Es un plugin de Claude Code. Desde Claude Code:

```text
/plugin marketplace add jicninja/redisgner
/plugin install redisgner@redisgner
```

**Requisitos:** Node ≥ 20 y npm. En la **primera corrida**, el skill instala sus dependencias y baja Chromium de Playwright automáticamente (`npm install` + `postinstall`).

Después, simplemente pedíselo a Claude:

```text
rediseñá este sitio: https://app.ejemplo.com
```

o *"relevá el estilo de …"*, *"scrapeá este sitio"*, *"redisgner …"*.

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

---

## Seguridad

- **Login MANUAL, sin credenciales.** El motor **nunca** recibe ni pide usuario/contraseña. Si el sitio tiene login, se abre una ventana de Chromium (`--no-headless`) y **logueás vos a mano**; el motor detecta solo cuando entraste y sigue. No hay flags ni env vars de credenciales — es intencional.
- **Solo lectura.** El crawler no borra, edita ni envía formularios (salvo el login que hacés vos). Salta links destructivos.
- Usá siempre una **cuenta de prueba**, nunca una productiva.
- Las cookies de sesión quedan solo en los artefactos locales (`.auth/`, gitignored) — nunca se publican.

---

## Uso manual del motor (opcional)

Más allá del skill, el motor se puede correr a mano desde `skills/redisgner/`:

```bash
cd skills/redisgner
npm install                 # primera vez (baja Chromium)

# Relevar (con navegador visible por si hay login manual)
npm run capture -- --url https://ejemplo.com --out ./redisgner-artifacts --max-pages 25 --no-headless

# Scaffold del rediseño (React) y, opcional, mock HTML
npm run scaffold -- --out . --artifacts ./redisgner-artifacts
npm run scaffold -- --out . --artifacts ./redisgner-artifacts --target html
```

**Flags de `capture`:** `--url` (req.), `--login-url`, `--out`, `--max-pages`, `--viewport WxH`, `--no-headless`, `--capture-trace`, `--page-timeout <ms>`.
**Flags de `scaffold`:** `--out` (req.), `--artifacts`, `--target react|html`.

---

## Artefactos (`redisgner-artifacts/`)

```text
manifest.json   preview.html   tokens.json
screenshots/    html/          css/{computed,inline,transitions.json,animations.json,hover-states.json}
logo/{logo.png, candidates/, candidates.json}
reports/{site-overview, visual-style, design-tokens, logo-analysis, logo-prompt, redesign-brief, uiux-expert-review}.md
```

Se generan en el **proyecto donde invocás** la skill, no en el repo del plugin.

---

## Estructura del repo

```text
.claude-plugin/{plugin.json, marketplace.json}   ← marketplace + plugin
skills/redisgner/
  SKILL.md                                        ← orquestación (lo que lee Claude)
  package.json, bin/, src/                        ← motor Node/Playwright
```

## Licencia

MIT — ver [LICENSE](./LICENSE).
