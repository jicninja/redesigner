import path from "node:path";
import { readFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeFileSafe } from "../util/fs.js";
import { log } from "../util/log.js";
import { tokensToThemeCss } from "./theme.js";
import { buildMotionLib } from "./motion-seed.js";
import type { DesignTokens } from "../capture/tokens.js";
import { slugFromPathname } from "../util/fs.js";
import { compareShellSource, originalDataSource } from "./compare-shell.js";

export interface ScaffoldOptions {
  out: string;
  artifacts: string;
  target: string; // "react" | "html"
}

async function readJsonOr<T>(file: string, fallback: T): Promise<T> {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const EMPTY_TOKENS: DesignTokens = {
  colors: [],
  backgrounds: [],
  fontFamilies: [],
  fontSizes: [],
  fontWeights: [],
  lineHeights: [],
  spacing: [],
  radii: [],
  shadows: [],
  roles: { accentCandidates: [] },
};

export async function runScaffold(opts: ScaffoldOptions): Promise<void> {
  const artifactsAbs = path.resolve(process.cwd(), opts.artifacts);
  const tokens = await readJsonOr<DesignTokens>(
    path.join(artifactsAbs, "tokens.json"),
    EMPTY_TOKENS,
  );

  if (opts.target === "html") {
    const { exportHtmlMock } = await import("./html-export.js");
    await exportHtmlMock({ out: opts.out, artifacts: artifactsAbs, tokens });
    return;
  }

  const manifest = await readJsonOr<{
    pages: { url: string; slug: string; title: string }[];
  }>(path.join(artifactsAbs, "manifest.json"), { pages: [] });
  const transitions = await readJsonOr<{ selector: string; value: string }[]>(
    path.join(artifactsAbs, "css", "transitions.json"),
    [],
  );
  const anims = await readJsonOr(
    path.join(artifactsAbs, "css", "animations.json"),
    {},
  );

  const root = path.resolve(process.cwd(), opts.out, "redesign");
  await emitReactProject(root, tokens, manifest, transitions, anims);
  await copyOriginals(artifactsAbs, root);
  await emitCompareShell(root, manifest);
  log.success(`Scaffold del rediseño en: ${root}`);
  log.info("Próximo paso (Claude design): completar componentes/páginas guiado por reports/redesign-brief.md.");
}

async function emitReactProject(
  root: string,
  tokens: DesignTokens,
  manifest: { pages: { url: string; slug: string; title: string }[] },
  transitions: { selector: string; value: string }[],
  anims: unknown,
): Promise<void> {
  const w = (rel: string, content: string) => writeFileSafe(path.join(root, rel), content);

  await w(
    "package.json",
    JSON.stringify(
      {
        name: "redesign",
        private: true,
        type: "module",
        scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
        dependencies: {
          react: "^19.2.0",
          "react-dom": "^19.2.0",
          motion: "^12.40.0",
        },
        devDependencies: {
          "@tailwindcss/vite": "^4.3.0",
          "@types/react": "^19.0.0",
          "@types/react-dom": "^19.0.0",
          "@vitejs/plugin-react": "^6.0.0",
          tailwindcss: "^4.3.0",
          typescript: "^6.0.0",
          vite: "^8.0.0",
        },
      },
      null,
      2,
    ),
  );

  await w(
    "vite.config.ts",
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`,
  );

  await w(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );

  await w(
    "index.html",
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Rediseño</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  await w(
    "src/styles/theme.css",
    `@import "tailwindcss";\n\n${tokensToThemeCss(tokens)}`,
  );

  await w("src/lib/motion.ts", buildMotionLib(transitions, anims as never));

  await w("src/vite-env.d.ts", `/// <reference types="vite/client" />\n`);

  await w(
    "src/main.tsx",
    `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import { App } from "./App";
import { CompareShell } from "./CompareShell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CompareShell>
      <App />
    </CompareShell>
  </StrictMode>,
);
`,
  );

  // App con una demo de los componentes y movimiento.
  await w(
    "src/App.tsx",
    `import { motion } from "motion/react";
import { fadeUp, staggerContainer } from "./lib/motion";
import { Button } from "./components/Button";
import { Card } from "./components/Card";
import { NavBar } from "./components/NavBar";

export function App() {
  return (
    <div className="min-h-screen bg-surface text-text font-sans">
      <NavBar />
      <motion.main
        className="mx-auto max-w-5xl px-6 py-16"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <motion.h1 variants={fadeUp} className="text-4xl font-bold tracking-tight">
          Rediseño
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-4 text-lg opacity-80">
          Base generada por redesigner. Reemplazá este contenido siguiendo
          reports/redesign-brief.md.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-8 flex gap-4">
          <Button>Primario</Button>
          <Button variant="ghost">Secundario</Button>
        </motion.div>
        <motion.div
          variants={staggerContainer}
          className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {[1, 2, 3].map((i) => (
            <Card key={i} title={\`Tarjeta \${i}\`}>
              Contenido de ejemplo con micro-interacción de hover.
            </Card>
          ))}
        </motion.div>
      </motion.main>
    </div>
  );
}
`,
  );

  await w(
    "src/components/Button.tsx",
    `import { motion } from "motion/react";
import type { ReactNode } from "react";
import { hoverLift } from "../lib/motion";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "ghost";
  onClick?: () => void;
}

export function Button({ children, variant = "primary", onClick }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors";
  const styles =
    variant === "primary"
      ? "bg-primary text-surface hover:opacity-90"
      : "border border-current/20 text-text hover:bg-current/5";
  return (
    <motion.button {...hoverLift} onClick={onClick} className={\`\${base} \${styles}\`}>
      {children}
    </motion.button>
  );
}
`,
  );

  await w(
    "src/components/Card.tsx",
    `import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fadeUp, hoverLift } from "../lib/motion";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      {...hoverLift}
      className="rounded-xl border border-current/10 bg-current/[0.02] p-6 shadow-md"
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm opacity-75">{children}</p>
    </motion.div>
  );
}
`,
  );

  await w(
    "src/components/NavBar.tsx",
    `import { motion } from "motion/react";

export function NavBar() {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-10 border-b border-current/10 backdrop-blur"
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* TODO: reemplazar por el logo rediseñado (src/assets/logo.*) */}
        <span className="text-lg font-bold">Marca</span>
        <div className="flex gap-6 text-sm">
          <a href="#" className="opacity-80 transition-opacity hover:opacity-100">Inicio</a>
          <a href="#" className="opacity-80 transition-opacity hover:opacity-100">Productos</a>
          <a href="#" className="opacity-80 transition-opacity hover:opacity-100">Contacto</a>
        </div>
      </nav>
    </motion.header>
  );
}
`,
  );

  // Stubs de páginas a partir del manifest (Claude las completa).
  const pages = manifest.pages.slice(0, 12);
  for (const p of pages) {
    const comp = pascal(slugFromPathname(new URL(p.url).pathname));
    await w(
      `src/pages/${comp}.tsx`,
      `import { motion } from "motion/react";
import { pageTransition } from "../lib/motion";

// Original: ${p.url}
// Título: ${p.title}
export function ${comp}() {
  return (
    <motion.section variants={pageTransition} initial="initial" animate="animate" exit="exit">
      {/* TODO (Claude design): reconstruir esta pantalla siguiendo el brief y la screenshot. */}
      <h2 className="text-2xl font-semibold">${comp}</h2>
    </motion.section>
  );
}
`,
    );
  }

  await w(
    "src/assets/README.md",
    "Dejá acá el logo rediseñado (logo.png/svg) que generaste a mano con gpt-image.\n",
  );

  await w(
    ".gitignore",
    "node_modules/\ndist/\n*.log\n",
  );

  await w(
    "README.md",
    `# Rediseño (generado por redesigner)

Base **React 19 + Vite 8 + Tailwind v4 + Framer Motion (motion@12)**.

\`\`\`bash
npm install
npm run dev
\`\`\`

- Tokens del sitio original en \`src/styles/theme.css\` (bloque \`@theme\`). Ajustá los roles.
- Variants de movimiento en \`src/lib/motion.ts\`.
- Componentes base en \`src/components/\`, páginas stub en \`src/pages/\`.
- Logo: poné el rediseñado en \`src/assets/\`.

Completá componentes y páginas siguiendo \`../redesigner-artifacts/reports/redesign-brief.md\`.
`,
  );
}

/** Emite el shell de comparación (CompareShell.tsx) + el módulo de datos del original. */
async function emitCompareShell(
  root: string,
  manifest: { pages: { url: string; slug: string; title: string }[] },
): Promise<void> {
  await writeFileSafe(path.join(root, "src", "CompareShell.tsx"), compareShellSource());
  await writeFileSafe(
    path.join(root, "src", "lib", "original.ts"),
    originalDataSource(
      manifest.pages.map((p) => ({ slug: p.slug, title: p.title, url: p.url })),
    ),
  );
}

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

function pascal(slug: string): string {
  const base = slug.replace(/[^a-zA-Z0-9]+/g, " ").trim() || "Home";
  return base
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}
