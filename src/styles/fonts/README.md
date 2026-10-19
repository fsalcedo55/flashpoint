# Bundled brand fonts

Downloaded from Google Fonts on October 18, 2026. These are the families observed on Flashpoint.AI's public website, as documented in the project `design.md`.

| File | Family / weight | Source | License |
| --- | --- | --- | --- |
| `inter-latin.woff2` | Inter, variable 400–600 | [Google Fonts asset](https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) | `Inter-OFL.txt` |
| `newsreader-latin.woff2` | Newsreader, variable 400–500, optical sizing | [Google Fonts asset](https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjIJFJpc.woff2) | `Newsreader-OFL.txt` |
| `plus-jakarta-sans-latin-600.woff2` | Plus Jakarta Sans, 600 | [Google Fonts asset](https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_d0n9TR_VMq2oRsWk.woff2) | `PlusJakartaSans-OFL.txt` |

All three use the SIL Open Font License 1.1. License files are retained unchanged from the [Google Fonts repository](https://github.com/google/fonts/tree/main/ofl). These are Latin subsets; other characters use the declared system fallbacks.

`src/lib/fonts.ts` loads the assets through `next/font/local`. `_app.tsx` places the font-family variables on `:root`, including Radix portals. No runtime font request to Google or build-time font download is required.
