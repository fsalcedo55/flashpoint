# Flashpoint Preferences

A standalone preferences parser built for the Flashpoint.AI trial, starting with survey questionnaires.

Upload PDF or DOCX questionnaires to detect patterns in how you write and structure surveys. Review each suggested preference alongside its source evidence, then confirm, edit, or deny it. Only confirmed preferences become part of your profile for the current session.

Each tab has its own temporary workspace in React state. Navigating within the app keeps documents and decisions; refreshing or closing the tab clears them. There is no database, browser storage, or login.

## Stack

TypeScript (strict), Next.js Pages Router, Tailwind CSS, shadcn/ui, tRPC, and Vercel AI SDK with AI Gateway.

## Run locally

Requires Node.js 24.21.0 (see `.nvmrc`), pnpm 12.14.0, and a Vercel AI Gateway key for analysis.

```bash
pnpm install --frozen-lockfile
cp -n .env.example .env.local
```

Add your `AI_GATEWAY_API_KEY` to `.env.local` to enable preference extraction. This file is ignored by Git; keep the key there.

The default extractor is GPT-6 Luna with medium reasoning. Change `AI_GATEWAY_MODEL` to use another Gateway model; see the [evaluation results and tradeoffs](evals/IMPROVEMENTS.md).

```bash
pnpm dev
```

Open [localhost:3000](http://127.0.0.1:3000). Use the [sample questionnaires](tests/fixtures/questionnaires/README.md) to try the upload → analysis → review → profile flow.

Uploads are processed per request; temporary server files are removed after reading. Originals and results stay in browser memory. Selected text is sent through Vercel AI Gateway for analysis; the API key stays on the server.

The demo accepts PDF/DOCX files up to 4 MB each, leaving room for multipart overhead under [Vercel’s 4.5 MB request limit](https://vercel.com/docs/functions/limitations#request-body-size). Deployment needs the two AI environment variables above. The demo has no authentication or application-level rate limiting; use deployment access protection when sharing it privately.

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
