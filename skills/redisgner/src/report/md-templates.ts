import path from "node:path";
import { existsSync } from "node:fs";
import { writeFileSafe } from "../util/fs.js";

/**
 * Pre-escribe los reportes MD como esqueletos con headers + TODO para que
 * Claude los rellene. No sobrescribe si ya existen (para no pisar trabajo).
 */
export async function writeReportSkeletons(outAbs: string, url: string): Promise<void> {
  const reportsDir = path.join(outAbs, "reports");
  const today = new Date().toISOString().slice(0, 10);

  const files: Record<string, string> = {
    "site-overview.md": `# Resumen del sitio

> Sitio relevado: ${url}
> Fecha: ${today}

## ¿Qué es / qué hace?
TODO (Claude): describí el propósito del producto a partir del HTML y las screenshots.

## Secciones / áreas principales
TODO: lista de secciones detectadas (nav, dashboard, settings, etc.).

## Audiencia y dominio
TODO: tipo de usuario y rubro inferido.
`,
    "visual-style.md": `# Estilo visual

> Fecha: ${today}

## Layout y estructura
TODO (Claude): grilla, densidad, jerarquía, uso del espacio.

## Color
TODO: paleta, mood, contraste. (Ver tokens.json.)

## Tipografía
TODO: familias, escala, pesos, sensación.

## Movimiento / animaciones
TODO: lenguaje de movimiento (ver css/transitions.json y css/animations.json), hovers (css/hover-states.json).

## Componentes recurrentes
TODO: botones, cards, inputs, badges, modales.
`,
    "design-tokens.md": `# Design tokens

> Fuente: tokens.json (frecuencias agregadas de computed styles).
> Fecha: ${today}

## Colores
TODO (Claude): anotá roles (fondo, texto, acento, bordes) a partir de tokens.json.

## Tipografía
TODO: escala tipográfica y pesos.

## Spacing / radios / sombras
TODO: escala de espaciado, radios y sombras inferidas.
`,
    "logo-analysis.md": `# Análisis del logo

> Candidatos: logo/candidates/  ·  logo/candidates.json
> Fecha: ${today}

## Descripción
TODO (Claude, VLM): describí el logo (tipo: wordmark/isotipo/combinado, colores, estilo).

## Veredicto de calidad
TODO: ¿es básico/genérico? ¿usa fuente por defecto? ¿tiene concepto? (sí/no + por qué)

## Recomendación
TODO: rediseñar / refinar / mantener.
`,
    "logo-prompt.md": `# Prompt para rediseño de logo (gpt-image)

> Se completa solo si el logo se evalúa como básico.
> Fecha: ${today}

TODO (Claude): prompt afinado para gpt-image, listo para pegar a mano.
Incluí: concepto de marca, estilo, paleta, tipografía, fondo transparente, variaciones.
`,
    "redesign-brief.md": `# Brief de rediseño

> Fecha: ${today}

## Dirección elegida
TODO (Claude): revamp total vs refinamiento + estilo elegido por el usuario.

## Mejoras propuestas
TODO: lista concreta de cambios hacia una UI más limpia y profesional.

## Inventario de componentes
TODO: componentes a construir en el rediseño (React + Tailwind + motion).

## Plan de movimiento (Framer Motion)
TODO: mapear transitions/keyframes capturados a variants de \`motion\` (fadeUp, stagger, hover/tap, page transitions con AnimatePresence).
`,
  };

  for (const [name, content] of Object.entries(files)) {
    const dest = path.join(reportsDir, name);
    if (existsSync(dest)) continue; // no pisar
    await writeFileSafe(dest, content);
  }
}
