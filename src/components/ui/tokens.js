/**
 * Design tokens — drop these into `tailwind.config.ts` under `theme.extend`.
 * Kept in a JS file (not the components) so they're easy to import into
 * Storybook, tests, or future packages.
 *
 * Palette mirrors Vercel: pure black/white with a small, precise grayscale.
 * No accent hues, no gradients, no shadows beyond hairlines.
 */
module.exports = {
  colors: {
    bg: "#000000",
    fg: "#ffffff",
    "gray-1": "#0a0a0a", // near-black surface (cards on bg)
    "gray-2": "#111111",
    "gray-3": "#1a1a1a", // hover surface
    "gray-4": "#2a2a2a", // borders on dark bg
    "gray-5": "#3d3d3d",
    "gray-6": "#666666", // secondary text
    "gray-7": "#888888",
    "gray-8": "#a3a3a3",
    "gray-9": "#ededed", // near-white text
  },
  fontFamily: {
    sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
    mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"],
  },
  borderRadius: {
    none: "0",
    sm: "4px",
    DEFAULT: "6px",
    md: "8px",
    lg: "12px",
  },
};