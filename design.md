# Flashpoint.AI design guide

Working design reference for the standalone preferences parser. Reviewed **October 18, 2026** against the public Flashpoint.AI website and the current app source.

This is a reconstruction from public evidence, not an official brand manual. No brand manual was linked from the pages inspected. The authenticated Flashpoint product was not inspected. **Observed** means a value or treatment was read from the live site; **Recommended** means an adaptation for this app. Company-supplied guidelines should supersede inferred choices when available. The user's explicit product preferences remain constraints on this implementation.

## Reference and direction

Sources inspected visually and through rendered DOM/computed styles at a 1280 × 720 desktop viewport:

- [Homepage](https://flashpoint.ai/): logo, navigation, hero, actions, cards, section treatments, and footer.
- [Products / Surveys](https://flashpoint.ai/products#surveys): typography, lists, source-like testimonial panels, and research vocabulary.
- [Logo image referenced by the website](https://flashpoint.ai/logo-flashpoint-black.png): black symbol with an orange detail. This is an observed public asset, not an approved asset kit.

The observed identity combines a warm paper-like background, dark editorial serif headings, restrained sans-serif UI text, blue primary actions, and small orange accents. Large areas of dark ink appear in marketing sections. Rounded surfaces, thin dividers, and generous spacing carry most of the visual structure.

For the preferences parser, bring that identity into a compact research workspace. Make documents, suggested rules, source evidence, and review decisions easy to scan. Keep the existing three destinations: **Your documents**, **Review preferences**, and **Preference profile**.

## Brand name and logo

**Observed:** the header spells the name **Flashpoint.AI**. It pairs a separate symbol with a text wordmark in Plus Jakarta Sans, weight 600, 16px at the inspected desktop size. The symbol is about 20px tall, with approximately 16px between symbol and wordmark. The underlying image is 182 × 232; preserve its aspect ratio. [Source: homepage](https://flashpoint.ai/).

**Recommended:**

- Use `Flashpoint.AI` in the app identity and browser titles. Keep functional page names separate from the brand.
- Use the supplied company logo when available; the observed public mark is the visual reference in the meantime. Preserve the symbol's proportions and colors.
- The app uses the unchanged public mark at `public/brand/flashpoint-mark.png` for its identity and favicon, paired with the `Flashpoint.AI` text wordmark. This replaces the prototype's green sliders icon and lowercase `flashpoint.` lockup.
- Do not redraw the symbol, put it inside an invented green tile, stretch it, or add gradients to it. If a suitable asset is unavailable, use the correctly spelled text name rather than inventing another mark.
- Formal clear-space, minimum-size, and reverse-logo rules remain unverified. The measured header sizes are reference examples, not company requirements.

## Color

### Observed website palette

Values below come from computed styles and CSS custom properties on the [homepage](https://flashpoint.ai/) and [product page](https://flashpoint.ai/products#surveys).

| Role on the website | Value | Evidence |
| --- | --- | --- |
| Main background | `#FBFAF8` | Body background and root `--background` |
| Main text | `#1F2024` | Body color and root `--foreground` |
| Headings / dark sections | `#121110` | Hero headings, feature section, footer |
| Supporting text | `#4A4F57` | Introductory paragraphs and product lists |
| Warm panel surface | `#F3F1EC` | Brand/agency cards and hover surfaces |
| Primary action blue | `#1D4ED8` | “Try it free” and “Log In” button backgrounds |
| Orange accent | `#F4501E` | Root `--accent`, small highlights and product-list markers |
| White | `#FFFFFF` | Primary button labels and light surfaces |
| Subtle rules | Ink with low opacity | Header uses `#121110` at 8%; secondary CTA border uses 25% |

**Blue is the observed action color. Orange is an accent.** The prototype's forest green and sage palette is not supported by these references.

### Recommended app tokens

These values are implemented in `src/styles/globals.css`. The mapping adapts the observed website palette to the app; it is not an official company token set.

| App token | Value | Provenance / use |
| --- | --- | --- |
| `--background` | `#FBFAF8` | Observed canvas |
| `--foreground` | `#1F2024` | Observed main text |
| `--card`, `--popover` | `#FFFFFF` | Recommended working surfaces |
| `--card-foreground`, `--popover-foreground` | `#1F2024` | Observed main text |
| `--primary` | `#1D4ED8` | Observed action blue |
| `--primary-foreground` | `#FFFFFF` | Observed action text |
| `--secondary`, `--muted` | `#F3F1EC` | Observed warm panel color, adapted for UI |
| `--secondary-foreground` | `#1F2024` | Recommended neutral text |
| `--muted-foreground` | `#4A4F57` | Observed supporting text |
| `--accent` | `#EDF2FF` | Recommended pale blue hover/selection fill |
| `--accent-foreground` | `#1D4ED8` | Recommended selection text |
| `--brand-orange` | `#F4501E` | Observed brand accent; use sparingly |
| `--border` | `#DEDBD5` | Recommended decorative divider |
| `--input` | `#8D8A83` | Recommended stronger boundary for controls |
| `--ring` | `#1D4ED8` | Recommended keyboard focus color |
| `--destructive` | `#AC3C34` | Existing functional error red; not a brand claim |
| `--sidebar` | `#F3F1EC` | Recommended warm sidebar |
| `--sidebar-foreground` | `#1F2024` | Recommended sidebar text |
| `--sidebar-primary`, `--sidebar-ring` | `#1D4ED8` | Recommended active/focus color |
| `--sidebar-primary-foreground` | `#FFFFFF` | Recommended filled-action text |
| `--sidebar-accent` | `#EDF2FF` | Recommended active navigation surface |
| `--sidebar-accent-foreground` | `#1D4ED8` | Recommended active navigation text |
| `--sidebar-border` | `#DEDBD5` | Recommended decorative separation |

The website's `--accent` and shadcn's `--accent` serve different purposes. Keep orange in a dedicated brand token; mapping it directly to shadcn's generic accent would turn menu highlights and selection surfaces orange everywhere. Green may identify a confirmed/success state, paired with a label or icon; it should not remain the app's identity color.

The implementation also uses observed heading ink `#121110` as `--heading` and recommended darker blue `#1E40AF` as `--primary-hover`, maintaining white-label contrast on hover. Orange remains in the original logo and the reserved brand token.

## Typography

### Observed families and desktop measurements

| Use | Family | Weight | Observed sizing |
| --- | --- | --- | --- |
| Homepage hero | Newsreader | 400 | 72px / 73.44px line height; −1.8px tracking |
| Products page title | Newsreader | 400 | 60px / 63px |
| Major section heading | Newsreader | 400 | 48px / about 52px |
| Homepage card heading | Newsreader | 400 | 30px / 37.5px |
| Body and navigation | Inter | 400–600 | Body 16px; lead paragraphs 18px / 29.25px |
| Action labels | Inter | 600 | 14px / 20px; 0.35px tracking |
| Header wordmark | Plus Jakarta Sans | 600 | 16px / 24px; 0.01em tracking |

These are marketing-page measurements, not appropriate defaults for every app component. [Sources: homepage](https://flashpoint.ai/), [products](https://flashpoint.ai/products#surveys).

### Recommended app scale

| Element | Treatment |
| --- | --- |
| Page title | Newsreader 400, 32px mobile / 40px desktop, line height 1.15, tracking −0.025em |
| Section heading | Inter 600, 18–20px, line height 1.4 |
| Selected preference rule | Inter 500, 20px, line height 1.5 |
| Body, explanation, evidence quote | Inter 400, 14–16px, line height 1.6 |
| Navigation, buttons, field labels | Inter 500–600, 14px, line height 1.4 |
| Source references, metadata | Inter 400–500, 12–13px, line height 1.5 |

Use the serif for page-level identity and keep dense review content in Inter. Avoid the current 10px text for evidence, categories, or important instructions. Preserve full source quotations and readable line wrapping. Use tabular numerals for counts.

Load fonts through the installed Next.js font facilities. For reproducible local builds, prefer licensed local WOFF2 assets with `next/font/local`, retaining their license files. Map the supplied font variables to Tailwind's `--font-sans` and `--font-heading`; use a separate wordmark family only where needed. Font variables must also reach portaled dialogs, sheets, and popovers. Until assets are available, use a system sans fallback for Inter and Georgia/serif for Newsreader, and identify that as an approximation.

## Layout, surfaces, and motion

**Observed:** the website uses spacious sections, two-column cards/lists, 28px rounded homepage cards, largely flat surfaces, and subtle rules. Large CTAs have 28px radii with 14px vertical and 28px horizontal padding. Header buttons use a 19px radius. Their class definitions specify a 450ms radius transition toward a smaller rounded rectangle; this is an observed implementation detail, not a requirement for the app. The homepage also includes geometric cube imagery with an orange focal point. [Source: homepage](https://flashpoint.ai/).

**Recommended for the app:**

- Retain the useful desktop sidebar and mobile navigation sheet. A 240px sidebar and the existing 20/32/40px responsive content gutters are reasonable app-specific choices.
- Use a 4px spacing base: 8–12px within controls, 16–24px within cards, and 24–40px between content groups.
- Use 12–16px card radii, 8px inset evidence surfaces, and rounded primary buttons around 40px high. Give touch controls at least a 44px hit area. These dimensions adapt the site's rounded character to denser work.
- Favor white working cards on the warm canvas, thin warm-gray separators, and minimal shadows. Reserve stronger shadows for floating dialogs and menus.
- In review, keep the suggestion list and selected evidence side by side when space permits. Stack them on small screens. Wrap long filenames and rules rather than forcing horizontal scrolling.
- Keep Confirm, Edit, and Deny reachable without covering the evidence. A sticky action row may help on long details if it respects viewport and safe-area padding.
- Use brief 150–200ms color/opacity transitions for ordinary app feedback. Respect reduced-motion preferences. Marketing carousels, animated geometry, and long CTA morphs are not needed for the review workflow.

## Component and state rules

| Component / state | Recommended treatment |
| --- | --- |
| Main action | Blue fill, white label; one clear primary action per task area |
| Secondary action | Neutral outline or text; clear hover and keyboard focus |
| Active navigation / selected suggestion | Pale blue surface plus blue text or border; expose active/selected state semantically |
| Document upload | Neutral dashed boundary and a clear Choose files action; show supported types and limits nearby. Files upload the moment they are chosen or dropped (no separate Upload step); each shows in the list as Uploading, then Processing, and is selected for analysis once ready. Rows are two lines (name; format, size and sections followed by the status or type badge) with no per-row file icon. Full-height upload area only while the workspace has no documents; afterwards a single-row strip above the list, so the page is list-first |
| Selection actions | An action on a list's selection (Find preferences) appears in a bar pinned to the bottom of the viewport while anything is selected, with the count, Clear, and an ⓘ holding the AI data-transmission disclosure. Nothing in the page header. Expected states (Ready) carry no badge; only exceptions (Uploading, Processing, Failed) do |
| Instructional copy | None. Page descriptions, "select up to N", "check the status below" and similar are removed; disclosures that affect a decision go behind an info icon or appear only as an exception notice (e.g. missing API key) |
| Destructive actions | Delete is an icon button beside the item's other actions (document rows, the review action row, profile cards), confirmed in a dialog that names the item and says it cannot be undone. Documents cited as evidence refuse deletion with a reason. Deleting the last suggestion of an analysis forgets that analysis so the same documents can be analyzed again |
| Analysis in flight | The brand motif from flashpoint.ai (a field of tiles, one lit orange) as a small inline SVG: a 6×3 grid of faint orange-outlined tiles where one tile at a time lights in `--brand-orange` and leaves a two-step fading trail, beside stage text that cycles through the real pipeline steps. Orange is the site's progress color; blue stays for actions. Reduced motion: the grid pulses instead of searching |
| Working notes | The model's reasoning *summary* (never raw reasoning) streams into the analysis row through the AI Elements `Reasoning` component, restyled: muted text on a warm inset, capped height, auto-scrolling. The trigger shows the grid plus the model's current section title while running, and "Worked for N seconds" once done, when the notes collapse below the result as an audit record. The cycling stages remain only as the fallback before the first note arrives or when a model returns none. Notes are working material, never styled as conclusions; each suggestion's rationale stays the authoritative explanation |
| New suggestions | When the sidebar's Review preferences count rises while the user is watching (an analysis landed), the badge fills brand orange for about a second and settles back. It does not flash on page load |
| Reset workspace | A muted action at the bottom of the sidebar (and the mobile navigation sheet). Its dialog lists exactly what will be deleted by count (documents, suggestions, confirmed, denied, analyses) |
| Evidence | Warm inset surface; filename and page/paragraph reference above the exact quotation; distinguish quotation from model explanation |
| Review decisions | From md up, the suggestion list scrolls with the page and the detail is sticky beside it (one inner scroll for long evidence that, at its end, hands the wheel on to the page; never `overscroll-contain` here). The detail fills the viewport height, so choosing an item far down the list shows its detail from the top without scrolling back up. Don't give the list its own scroll area: three scroll regions is too many. The detail's inner scroll fades its bottom edge into the card while more content sits below (`ScrollFade`), and the fade clears at the end; use the same treatment for any other inner scroll area. The suggestion list gets the page-scroll version (`PageScrollFade`): a fade into the canvas pinned to the viewport bottom until the list's end is in view. The Deny / Edit / Confirm row is sticky to the bottom of the detail (of the viewport on mobile), so long evidence never pushes the decision off screen. A decision, including Save and confirm from Edit, selects the next item in the list (not the first) and scrolls the detail back to its top |
| Page headers | Title only. No descriptions and no header buttons that duplicate sidebar navigation (e.g. “View profile”, “Review preferences”) |
| Profile | A single reading column (max 768px), grouped by category. Every item is confirmed, so cards carry no check icon or “Confirmed by you” label; metadata and actions share one row. No summary aside: counts live in the sidebar badges |
| Pending suggestion | Neutral “Suggested” / “To review” label; no implied approval |
| Document classification | Show “Not analyzed” before analysis and “Analyzing” only on documents in the active run. After analysis, show the detected work-product type as a badge, separate from its file format. The type badge is itself the button (tooltip “Why this type?”) that opens the explanation and source quotes in document details; no separate link per row. Keep “Other document” and “Uncertain type” neutral |
| Review by document type | Filter suggestions by Questionnaire, Research report, or Research plan / SOW. Review tabs, counts, and completion messages apply to the current filter; completing one type must not imply that all types are reviewed. The filter sits beside the tabs and is always shown, so filtering by type is discoverable even before a second type exists; types with no suggestions are disabled in it. The list prefixes each item with its type only while the filter is on All and suggestions span more than one type |
| Confirmed preference | Explicit “Confirmed” label with check icon; optional restrained success color |
| Denied preference | Explicit “Denied” label; do not present a normal review choice as a system failure |
| Processing | Plain progress label and spinner where helpful; preserve stable layout |
| Error | Readable red text, a specific reason, and a useful retry action; keep unsaved edits |
| Empty state | State what is missing and give the next action |

Retain shadcn/Radix behavior and Lucide icons for ordinary controls. Lucide is an existing app choice, not a verified Flashpoint brand requirement. Prefer 16–20px outline icons with consistent stroke weight. Icons supplement labels; the brand symbol is a separate asset.

## Voice and product constraints

The public website talks directly about research tasks and outcomes. Adapt that clarity to short, factual interface copy. Do not import its promotional claims or numbered section treatments into the working app.

The user has explicitly requested:

- No all-caps eyebrow subtitles or decorative labels such as `01 / YOUR DOCUMENTS`.
- No extra `Preference Studio` heading in the sidebar.
- No `Standalone trial` or similar trial badge.
- No marketing slogans or reassurance panels such as “Start small” or “Always your decision.”

These choices still apply even where a comparable treatment appears on the public website.

Use sentence case and concrete verbs: **Upload documents**, **Find preferences**, **Review preferences**, **Confirm**, **Edit**, **Deny**, **Retry analysis**. Keep the distinction between suggestions and confirmed preferences explicit. Describe inference as tentative; do not imply that an uploaded document automatically trains a model or updates the approved profile. Source quotes establish provenance; users judge whether the proposed rule follows from them.

Explain file limits, processing failures, and AI data transmission where they affect a user's decision. Technical setup messages belong in setup/error contexts, not in decorative page copy.

## Accessibility guardrails

Target at least 4.5:1 contrast for normal text, 3:1 for qualifying large text, and 3:1 for visual information needed to identify controls and states. These are accessibility requirements, not inferred brand rules. [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Calculated from the solid sRGB values above; ratios are rounded for reporting:

| Pair | Contrast | App implication |
| --- | --- | --- |
| White on action blue | 6.70:1 | Suitable for normal button labels |
| Main text on canvas | 15.60:1 | Strong reading contrast |
| Supporting text on canvas | 7.90:1 | Suitable for explanations and metadata |
| Orange on canvas | 3.35:1 | Avoid for normal-sized text |
| White on orange | 3.49:1 | Avoid for normal-sized button labels |
| Proposed input boundary on white | 3.45:1 | Suitable as a necessary control boundary |

Keep decorative dividers distinct from control boundaries: the pale divider token is not sufficient by itself to identify an input. Test actual composited colors when opacity is involved. Use visible keyboard focus, meaningful labels, semantic selection states, and text/icons alongside status color. Preserve dialog focus management, keyboard navigation, and reduced-motion support.

## Implementation

Applied to the standalone app on October 18, 2026. Document processing, AI extraction, saved preferences, and review decisions retain their existing behavior.

| Area | File / area | Applied change |
| --- | --- | --- |
| Palette | `src/styles/globals.css` | Warm neutrals, blue actions and selection, stronger input boundaries, visible focus |
| Brand | `src/components/app-shell.tsx`, `public/brand` | Original public mark, favicon, correctly spelled wordmark in desktop and mobile navigation |
| Fonts | `src/lib/fonts.ts`, `src/pages/_app.tsx`, `src/styles/fonts` | Local WOFF2 families with retained SIL licenses; root variables also reach portaled UI |
| Titles | `src/components/page-heading.tsx` | Newsreader 400, 32px mobile / 40px desktop; dense content stays in Inter |
| Components | Shared buttons, dialogs, tabs, cards, badges | Rounded actions, neutral working surfaces, selected/focus states, touch-target minimums |
| Content | Review, Profile, and document components | 12px minimum metadata, larger quotes and section headings, wrapping source references |
| Documents page | `src/pages/index.tsx`, `src/components/saved-documents.tsx`, `src/components/document-analysis.tsx` | Shares the shell's single centered column (max 1024px, set once on `<main>` in `app-shell.tsx` for every page); compact upload strip once documents exist; Find preferences in the list header; document name opens the extracted text; download as an icon button; Recent analyses below the list |

Browser checks covered desktop and 390px / 320px mobile widths: navigation, source viewer, edit/cancel, pending review, completed review, confirmed profile, keyboard focus, and page overflow. The three font families report loaded; portaled dialogs inherit Inter. Existing saved decisions were not changed during these checks. These checks are not a full accessibility audit.

For future changes:

- Compare Documents, Review, and Profile against this guide at desktop and narrow mobile widths.
- Verify the name, official mark, fonts, warm surfaces, blue actions, and restrained orange accents.
- Check hover, focus, selection, disabled, pending, confirmed, denied, error, and empty states.
- Check long quotations and filenames, keyboard operation, and zoomed layouts.
- Preserve document upload, source references, and review decisions within the current tab. The demo uses React state; refreshing or closing the tab clears the workspace.
- Keep all previously removed marketing labels and panels absent.

Remaining company-specific questions: approved vector/favicons and logo variants; whether the internal product uses the same typography as the marketing site; formal brand spacing rules; approved dark-mode and semantic-status palettes. Until those are supplied, use the observed light identity and clearly labeled app recommendations here.
