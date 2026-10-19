import localFont from "next/font/local";

export const inter = localFont({
  src: "../styles/fonts/inter-latin.woff2",
  weight: "400 600",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const newsreader = localFont({
  src: "../styles/fonts/newsreader-latin.woff2",
  weight: "400 500",
  style: "normal",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const jakarta = localFont({
  src: "../styles/fonts/plus-jakarta-sans-latin-600.woff2",
  weight: "600",
  style: "normal",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
