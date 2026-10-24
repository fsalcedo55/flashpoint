# Flashpoint Preferences

A standalone preferences parser for questionnaires, research reports, and research plans / statements of work (SOWs).

Upload PDF, DOCX or PPTX files. Analysis first detects each document’s purpose from its content, then suggests preferences relevant to that type. The detected type, explanation and supporting passages appear in the document details. Other or uncertain documents produce no preferences. Review each suggested preference alongside its source evidence, then confirm, edit, or deny it. Only confirmed preferences become part of your profile for the current session.

Each tab has its own temporary workspace in React state. Navigating within the app keeps documents and decisions; refreshing or closing the tab clears them. There is no database, browser storage, or login.

## Stack

TypeScript (strict), Next.js Pages Router, Tailwind CSS, shadcn/ui, tRPC, and Vercel AI SDK with AI Gateway.

Classification and extraction share one model call. Survey, report and planning preferences remain separately scoped; cited documents must match that scope. Classification is tentative and only appears after analysis.

The analysis router exposes configuration and a Zod-validated streaming mutation. File uploads use a separate multipart route with file size and content checks.

## Code organization

```text
src/server/
├── routers/   # tRPC procedures, input validation, and root router
├── services/  # Analysis workflow, progress streaming, and document processing
├── ai/        # Gateway configuration, prompts, model calls, and evidence checks
└── trpc.ts    # Shared tRPC initialization and procedure helpers
```

Routers delegate work to services; analysis services use the AI modules. Browser-safe schemas and workspace logic live in `src/lib`, UI components in `src/components`, and route entry points in `src/pages`. Tests and AI evaluations reuse the server functions directly.

## Run locally

Requires Node.js 24.21.0 (see `.nvmrc`), pnpm 12.14.0, and a Vercel AI Gateway key for analysis.

```bash
pnpm install --frozen-lockfile
cp -n .env.example .env.local
```

Add your `AI_GATEWAY_API_KEY` to `.env.local` to enable preference extraction. This file is ignored by Git; keep the key there.

The default extractor is GPT-6.1 Sol with medium reasoning. Change `AI_GATEWAY_MODEL` to use another Gateway model; see the [evaluation results and tradeoffs](evals/EXTRACTION-REFINEMENT.md).

```bash
pnpm dev
```

Open [localhost:3000](http://127.0.0.1:3000). Use the [sample questionnaires](tests/fixtures/questionnaires/README.md) to try the upload → analysis → review → profile flow.

Uploads are processed per request; temporary server files are removed after reading. Originals and results stay in browser memory. Selected text and supported embedded presentation images are sent through Vercel AI Gateway for analysis; the API key stays on the server. The model must support image input for decks containing images.

DOCX extraction groups labeled questions with their options, keeps table rows, and preserves supported automatic list numbers. Complex numbering and merged layouts produce warnings; suggestions still require review. PDFs use page text without OCR.

PPTX extraction preserves slide order (up to 200 slides) and labels text/tables, speaker notes, chart types/cached values, formatting properties, and embedded images as separate sources. Hidden slides and their associated content are excluded. Supported font, color, size, background and placeholder properties include layout/master/theme inheritance; this is not a rendered slide. Complex effects, automatic bullets and some inherited styling remain incomplete. External links and linked workbooks are never opened. PNG, JPEG, GIF and WebP assets are normalized to JPEG at up to 1024 pixels; SVG/EMF/WMF are flagged as unsupported. Image observations appear beside their source image for review, separately from verified text quotes.

The demo accepts PDF/DOCX/PPTX files up to 4.4 MB each (4,400,000 bytes), leaving 100 KB for multipart overhead under [Vercel’s 4.5 MB request limit](https://vercel.com/docs/functions/limitations#request-body-size). Larger files require a different upload path, such as direct object-storage uploads; increasing the application limit alone cannot bypass the hosting limit. Deployment needs the two AI environment variables above.

Each analysis accepts up to five documents, 400,000 characters of serialized source text/references, and 40 distinct images, within a 3.5 MB combined request budget. Each upload allows 40 images and 2.4 MB of encoded image data. Content exceeding a budget is rejected with an explanation, never silently truncated. One model call gets up to 180 seconds; the browser waits 210 seconds and the API route allows 240 seconds. These are demo budgets, not the model's context limit. Deployment uses [Vercel Fluid Compute](https://vercel.com/docs/functions/configuring-functions/duration).

## Public deployment

The analysis procedure checks Vercel Firewall before each model call, including each procedure in a tRPC batch. Before sharing a deployment:

- Create a Vercel Firewall SDK rule (`@vercel/firewall`) with rate limit ID `flashpoint-analysis`: **5 requests per IP per 600 seconds**, fixed window, action **429 / rate limit**. Publish the rule and verify it in a protected preview first.
- For protected previews, enable Protection Bypass for Automation and expose Vercel system environment variables as required by the [SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk).
- Give the demo's dedicated Gateway API key a **$10 budget with no automatic reset**. This budget also covers local tests and evaluations using that key. Gateway budgets are soft caps; already admitted requests can finish above the allowance.

Local development skips the firewall check. Production requires Vercel and a working rule; missing rules, timeouts, and failed checks stop analysis. Upload parsing has size/content limits but no application rate limit yet. Workspace review and editing do not call the model.

Vercel's counters are regional, and visitors sharing an IP share its allowance. The separate Gateway budget limits spending across IPs and regions. No application database is needed.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests cover extraction, evidence verification, session isolation, and review decisions using mocked AI calls. No database or credentials are needed.

Run `pnpm eval:ai` for the separate, paid [AI quality evaluation](evals/README.md). It checks recurring patterns, contradictions, limited evidence, and embedded instructions using fictional documents.

See [design.md](design.md) for the Flashpoint visual reference.
