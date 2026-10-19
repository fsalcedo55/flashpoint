# Flashpoint Preferences

A standalone preferences parser built for the Flashpoint.AI trial, starting with survey questionnaires.

Upload PDF or DOCX questionnaires to detect patterns in how you write and structure surveys. Review each suggested preference alongside its source evidence, then confirm, edit, or deny it. Only confirmed preferences become part of your saved profile.

The trial uses one shared workspace without authentication or integration with existing Flashpoint systems. Data is saved in PostgreSQL; uploaded originals are stored locally.

## Stack

TypeScript (strict), Next.js Pages Router, Tailwind CSS, shadcn/ui, tRPC, Drizzle, PostgreSQL, and Vercel AI SDK with AI Gateway.

## Run locally

Requires Node.js 24.21.0 (see `.nvmrc`), pnpm 12.14.0, and Docker running.

```bash
pnpm install --frozen-lockfile
cp -n .env.example .env.local
```

Add your `AI_GATEWAY_API_KEY` to `.env.local` to enable preference extraction. This file is ignored by Git; keep the key there.

```bash
pnpm db:up
pnpm db:migrate
pnpm dev
```

Open [localhost:3000](http://127.0.0.1:3000). Use the [sample questionnaires](tests/fixtures/questionnaires/README.md) to try the upload → analysis → review → profile flow.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Tests require PostgreSQL and use isolated temporary databases with mocked AI calls.

See [design.md](design.md) for the Flashpoint visual reference.
