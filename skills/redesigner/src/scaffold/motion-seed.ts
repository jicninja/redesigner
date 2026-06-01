interface AnimationsFile {
  animations?: { selector: string; value: string }[];
  keyframes?: { name: string; css: string }[];
}

/**
 * Generates `lib/motion.ts` with Framer Motion (`motion@12`) variants seeded
 * from the captured transitions/keyframes. Claude refines them afterwards.
 */
export function buildMotionLib(
  transitions: { selector: string; value: string }[],
  anims: AnimationsFile,
): string {
  // Try to derive a representative duration/easing from the transitions.
  const durations = transitions
    .map((t) => /([\d.]+)s/.exec(t.value)?.[1])
    .filter(Boolean)
    .map(Number);
  const avgDur =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 100) / 100
      : 0.3;

  const keyframeNames = (anims.keyframes ?? []).map((k) => k.name).join(", ") || "(none)";

  return `import type { Variants, Transition } from "motion/react";

/*
 * Motion variants seeded by redesigner from the original site.
 * Average transition duration detected: ${avgDur}s.
 * @keyframes detected in the original: ${keyframeNames}.
 * Adjust/expand according to the redesign brief.
 */

export const baseTransition: Transition = {
  duration: ${avgDur},
  ease: [0.22, 1, 0.36, 1], // approx easeOutExpo
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: baseTransition },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: baseTransition },
};

/** Container with stagger for lists/grids. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

/** Hover/tap micro-interactions (mirror the captured :hover states). */
export const hoverLift = {
  whileHover: { y: -2, scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: baseTransition,
};

/** Page transition for use with <AnimatePresence mode="wait">. */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: baseTransition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
`;
}
