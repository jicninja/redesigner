/**
 * Genera el "split mode" como SUBVISTA del propio rediseño (no como artefacto
 * aparte). El `CompareShell` envuelve la app: por DEFAULT muestra el SPLIT (una
 * cortina con handle arrastrable que además sigue el mouse) del sitio ORIGINAL
 * (capturado offline en `public/_original/`) sobre el rediseño real.
 *
 * - Lado "antes": iframe a `/_original/html/<slug>.html` (offline, assets locales).
 * - Lado "ahora": el rediseño real (render directo, `children`).
 * - Scroll sincronizado SOLO en split (el original es same-origin).
 * - Cambiar de página (dropdown) navega TAMBIÉN el rediseño vía `route`, y
 *   navegar el rediseño actualiza el dropdown.
 * - La cortina sigue el mouse por default; un botón (o clic en el handle ⇔) la
 *   deja FIJA para poder hacer hover/click sobre el rediseño.
 */

export interface OriginalPageInfo {
  slug: string;
  title: string;
  url: string;
}

/** Ruta (hash) tentativa del rediseño para un slug del original. Ajustable. */
function guessRoute(slug: string): string {
  if (!slug || slug === "home" || slug === "index") return "#/";
  return "#/" + slug;
}

/** Módulo de datos `src/lib/original.ts` con la lista de páginas originales. */
export function originalDataSource(pages: OriginalPageInfo[]): string {
  const items = pages.map((p) => ({
    slug: p.slug,
    title: p.title || p.slug,
    url: p.url,
    src: `/_original/html/${p.slug}.html`,
    route: guessRoute(p.slug),
  }));
  return `// Generado por redesigner: páginas del sitio ORIGINAL capturadas (lado "antes"
// del CompareShell). Sirven offline desde public/_original/.
//
// \`route\` = ruta (hash) del REDISEÑO equivalente, para sincronizar la vista de
// ambos lados. Es una conjetura por slug: AJUSTALA a las rutas reales de tu
// rediseño (p. ej. event_detail -> "#/event/35").
export interface OriginalPage {
  slug: string;
  title: string;
  url: string;
  src: string;
  route: string;
}

export const ORIGINAL_PAGES: OriginalPage[] = ${JSON.stringify(items, null, 2)};
`;
}

/** Componente `src/CompareShell.tsx`. */
export function compareShellSource(): string {
  return `import { useEffect, useRef, useState, type ReactNode } from "react";
import { ORIGINAL_PAGES } from "./lib/original";

type Mode = "before" | "split" | "after";
const ACCENT = "#6d4aff";

// Primer segmento de un hash ("#/event/35" -> "event"; "#/" -> "").
function seg(hash: string): string {
  return hash.replace("#/", "").replace("#", "").split("/")[0];
}

/**
 * Shell de comparación ANTES/AHORA que envuelve la app.
 * Default: SPLIT — cortina que sigue el mouse, original (iframe offline) sobre el
 * rediseño real (children). Botones [Antes][Split][Ahora] fijan cada lado.
 * - Scroll sincronizado SOLO en split (en Antes/Ahora cada lado scrollea solo).
 * - Cambiar de página (dropdown) navega TAMBIÉN el rediseño (route), y navegar
 *   el rediseño actualiza el dropdown.
 * - "Seguir el mouse" está ON por default; el botón 🖱️ o un clic en el handle ⇔
 *   lo dejan FIJO (y ahí el handle se arrastra), liberando hover/click.
 * - Doble click: solo el diseño nuevo a pantalla completa; otro doble click vuelve.
 */
export function CompareShell({ children }: { children: ReactNode }) {
  const hasOriginals = ORIGINAL_PAGES.length > 0;
  const [mode, setMode] = useState<Mode>("split");
  // inmersivo (pantalla completa) de un lado: "before" = original, "after" = rediseño.
  const [immersive, setImmersive] = useState<null | "before" | "after">(null);
  const [x, setX] = useState(50);
  const [idx, setIdx] = useState(0);
  const [follow, setFollow] = useState(true); // la cortina sigue el mouse (default)
  const [barOpen, setBarOpen] = useState(true); // menú flotante visible
  const stage = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLIFrameElement>(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  const current = ORIGINAL_PAGES[idx];
  const reveal =
    immersive === "before" ? 100 : immersive === "after" ? 0 : mode === "before" ? 100 : mode === "after" ? 0 : x;
  const showCompare = hasOriginals && !immersive;

  // Selección de página: cambia el original (iframe) Y navega el rediseño.
  function selectPage(i: number) {
    setIdx(i);
    const route = ORIGINAL_PAGES[i]?.route || "#/";
    if (window.location.hash !== route) window.location.hash = route;
  }

  // Navegar el rediseño (children) actualiza el dropdown del original.
  useEffect(() => {
    const onHash = () => {
      const s = seg(window.location.hash);
      const i = ORIGINAL_PAGES.findIndex((p) => seg(p.route) === s);
      if (i >= 0) setIdx((cur) => (cur === i ? cur : i));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Scroll sincronizado SOLO en split.
  useEffect(() => {
    if (!showCompare || mode !== "split") return;
    const onScroll = () => {
      const w = beforeRef.current?.contentWindow;
      if (!w) return;
      try {
        w.scrollTo(0, window.scrollY);
      } catch {
        /* noop */
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showCompare, mode, idx]);

  // Arrastre del handle (para ajustar cuando está fijo).
  useEffect(() => {
    function onPM(e: PointerEvent) {
      if (!dragging.current || !stage.current) return;
      moved.current = true;
      const r = stage.current.getBoundingClientRect();
      setX(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
    }
    function onPU() {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onPM);
    window.addEventListener("pointerup", onPU);
    return () => {
      window.removeEventListener("pointermove", onPM);
      window.removeEventListener("pointerup", onPU);
    };
  }, []);
  function startDrag(e: React.PointerEvent) {
    dragging.current = true;
    moved.current = false;
    e.preventDefault();
  }
  // Clic en el handle (sin arrastrar) = alternar fijo/seguir mouse.
  function toggleFollow() {
    if (moved.current) {
      moved.current = false;
      return;
    }
    setFollow((f) => !f);
  }
  // "Seguir el mouse" (default): la cortina sigue el cursor en split.
  function onMove(e: React.MouseEvent) {
    if (!showCompare || mode !== "split" || !follow || dragging.current || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    setX(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
  }
  // Doble click = pantalla completa del LADO clickeado (izq=original / der=rediseño).
  // Otro doble click vuelve al split y el menú reaparece SIEMPRE.
  function enterOrExit(side: "before" | "after") {
    if (!hasOriginals) return;
    setImmersive((cur) => {
      const next = cur ? null : side;
      if (!next) {
        setMode("split");
        setBarOpen(true);
      }
      return next;
    });
  }
  function onDbl(e: React.MouseEvent) {
    const r = stage.current?.getBoundingClientRect();
    let side: "before" | "after" = "after";
    if (r) {
      const curtain = r.left + (r.width * reveal) / 100;
      side = e.clientX < curtain ? "before" : "after";
    }
    enterOrExit(side);
  }

  return (
    <div
      ref={stage}
      onMouseMove={onMove}
      onDoubleClick={onDbl}
      style={{ position: "relative", minHeight: "100vh" }}
    >
      {/* AHORA — el rediseño real (capa base). */}
      {children}

      {/* ANTES — original offline, recortado desde la izquierda.
          SIEMPRE montado (no se desmonta en inmersivo) para NO re-descargarlo al
          volver al split (evita el flash en blanco). Solo se oculta con display.
          z-index alto para tapar elementos fixed/sticky del rediseño (navbar). */}
      {hasOriginals && current && (
        <iframe
          key={current.src}
          ref={beforeRef}
          src={current.src}
          title={"Antes — " + current.title}
          onLoad={() => {
            try {
              if (mode === "split") {
                beforeRef.current?.contentWindow?.scrollTo(0, window.scrollY);
              }
              // doble click DENTRO del original (lado izquierdo) → original a
              // pantalla completa; si no, el iframe se come el evento.
              const doc = beforeRef.current?.contentDocument;
              doc?.addEventListener("dblclick", () => enterOrExit("before"));
            } catch {
              /* same-origin esperado; si falla, no rompe */
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100%",
            border: 0,
            background: "#fff",
            zIndex: 9000,
            display: immersive === "after" ? "none" : "block",
            pointerEvents:
              immersive === "before" || (!immersive && mode === "before") ? "auto" : "none",
            clipPath: "inset(0 " + (100 - reveal) + "% 0 0)",
          }}
        />
      )}

      {/* Divisor + handle (solo en split). */}
      {showCompare && mode === "split" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            bottom: 0,
            left: reveal + "%",
            width: 2,
            background: ACCENT,
            transform: "translateX(-1px)",
            zIndex: 9001,
            pointerEvents: "none",
          }}
        >
          <div
            onPointerDown={startDrag}
            onClick={toggleFollow}
            title={follow ? "Clic = dejar fijo · arrastrar = mover" : "Clic = volver a seguir el mouse · arrastrar = mover"}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 40,
              height: 40,
              borderRadius: 99,
              background: follow ? ACCENT : "#fff",
              color: follow ? "#fff" : ACCENT,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              boxShadow: "0 4px 14px #0008",
              pointerEvents: "auto",
              cursor: follow ? "pointer" : "ew-resize",
              touchAction: "none",
              border: "2px solid " + ACCENT,
            }}
          >
            {follow ? "⇔" : "🔒"}
          </div>
        </div>
      )}

      {/* Barra de control (oculta en inmersivo o si se cerró con la X). */}
      {showCompare && barOpen && (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9002,
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "7px 10px",
            borderRadius: 12,
            background: "#151517ee",
            border: "1px solid #34343a",
            color: "#e8e8ea",
            font: "13px/1.2 system-ui, sans-serif",
            backdropFilter: "blur(8px)",
          }}
        >
          <select
            value={idx}
            onChange={(e) => selectPage(Number(e.target.value))}
            style={{
              background: "#1b1d20",
              color: "#e8e8ea",
              border: "1px solid #34343a",
              borderRadius: 8,
              padding: "5px 8px",
              maxWidth: 220,
              font: "inherit",
            }}
          >
            {ORIGINAL_PAGES.map((p, i) => (
              <option key={p.slug + i} value={i}>
                {p.title}
              </option>
            ))}
          </select>
          <div style={{ display: "inline-flex", gap: 3, background: "#1b1d20", border: "1px solid #34343a", borderRadius: 9, padding: 3 }}>
            {(["before", "split", "after"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  border: 0,
                  borderRadius: 7,
                  padding: "5px 11px",
                  font: "inherit",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: mode === m ? ACCENT : "transparent",
                  color: mode === m ? "#fff" : "#b8b8c0",
                }}
              >
                {m === "before" ? "Antes" : m === "split" ? "Split" : "Ahora"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            title={follow ? "El split sigue el mouse — clic para fijar" : "Split fijo — clic para que siga el mouse"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 8,
              padding: "6px 11px",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid " + (follow ? ACCENT : "#34343a"),
              background: follow ? ACCENT : "#1b1d20",
              color: follow ? "#fff" : "#b8b8c0",
            }}
          >
            <span aria-hidden style={{ fontSize: 14 }}>🖱️</span>
            {follow ? "Sigue mouse" : "Fijo"}
          </button>
          <span style={{ opacity: 0.55, fontSize: 12 }}>
            {follow ? "doble click = solo el diseño nuevo" : "arrastrá ⇔ · doble click = solo el nuevo"}
          </span>
          <button
            type="button"
            onClick={() => setBarOpen(false)}
            title="Cerrar menú (doble click en el lienzo lo vuelve a mostrar)"
            style={{
              border: 0,
              background: "transparent",
              color: "#b8b8c0",
              cursor: "pointer",
              font: "inherit",
              fontWeight: 800,
              fontSize: 15,
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Chip para reabrir el menú si se cerró con la X. */}
      {showCompare && !barOpen && (
        <button
          type="button"
          onClick={() => setBarOpen(true)}
          title="Mostrar menú de comparación"
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9002,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid #34343a",
            background: "#151517cc",
            color: "#e8e8ea",
            font: "13px/1 system-ui, sans-serif",
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
          }}
        >
          ⇔ menú
        </button>
      )}
    </div>
  );
}
`;
}
