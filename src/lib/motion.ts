// Motion's copy of the CSS easing tokens in globals.css (`--ease-out`), so JS and CSS
// animations share one curve. Exits are quicker than entrances.
export const easeOut = [0.23, 1, 0.32, 1] as const;
export const enter = { duration: 0.2, ease: easeOut } as const;
export const exit = { duration: 0.15, ease: easeOut } as const;

// Use full transform strings, not Motion's x/y shorthands, so animations stay
// hardware-accelerated. Under reduced motion, <MotionConfig reducedMotion="user">
// drops the transforms and keeps the fades.
export const rise = {
  initial: { opacity: 0, transform: "translateY(6px)" },
  animate: { opacity: 1, transform: "translateY(0px)", transition: enter },
  exit: { opacity: 0, transform: "translateY(0px)", transition: exit },
} as const;
