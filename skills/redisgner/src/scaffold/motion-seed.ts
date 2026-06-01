interface AnimationsFile {
  animations?: { selector: string; value: string }[];
  keyframes?: { name: string; css: string }[];
}

/**
 * Genera `lib/motion.ts` con variants de Framer Motion (`motion@12`) sembradas
 * a partir de las transiciones/keyframes capturadas. Claude las refina luego.
 */
export function buildMotionLib(
  transitions: { selector: string; value: string }[],
  anims: AnimationsFile,
): string {
  // Intentar derivar una duración/easing representativa de las transiciones.
  const durations = transitions
    .map((t) => /([\d.]+)s/.exec(t.value)?.[1])
    .filter(Boolean)
    .map(Number);
  const avgDur =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 100) / 100
      : 0.3;

  const keyframeNames = (anims.keyframes ?? []).map((k) => k.name).join(", ") || "(ninguno)";

  return `import type { Variants, Transition } from "motion/react";

/*
 * Variants de movimiento sembradas por redisgner desde el sitio original.
 * Duración media de transiciones detectada: ${avgDur}s.
 * @keyframes detectados en el original: ${keyframeNames}.
 * Ajustá/expandí según el brief de rediseño.
 */

export const baseTransition: Transition = {
  duration: ${avgDur},
  ease: [0.22, 1, 0.36, 1], // easeOutExpo aprox
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: baseTransition },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: baseTransition },
};

/** Contenedor con stagger para listas/grids. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

/** Micro-interacciones de hover/tap (espejan los :hover capturados). */
export const hoverLift = {
  whileHover: { y: -2, scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: baseTransition,
};

/** Transición de página para usar con <AnimatePresence mode="wait">. */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: baseTransition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
`;
}
