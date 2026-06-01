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
