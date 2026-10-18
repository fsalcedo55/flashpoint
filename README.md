# Flashpoint Preferences

A standalone trial application for deriving user preferences from past survey questionnaires and other work products. Users will review the evidence and confirm, edit, or deny each suggested preference.

## Current setup

The app uses Next.js 16 with Pages Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix Nova), tRPC 11, TanStack Query, Drizzle ORM, and PostgreSQL 18.

- Node.js: `24.21.0`, pinned in `.nvmrc`
- Package manager: `pnpm@12.14.0`, pinned in `package.json`
- Application code: `src/`
- Import alias: `@/*` resolves to `src/*`

The responsive application shell includes:

- `/`: upload PDF/DOCX files, inspect extracted text, select documents for AI analysis, retry failures, and download originals.
- `/review`: inspect AI suggestions with verified source quotes, then confirm, edit, deny, or revisit decisions.
- `/profile`: see only confirmed preferences, edit their wording, or return them to review.

Documents, suggestions, source evidence, and review decisions are saved to PostgreSQL. Confirming, editing, denying, and returning a preference to review survive refreshes and app/database restarts. Original suggested wording is retained alongside the edited rule.

Uploaded originals are saved on local disk; metadata and extracted text are saved to PostgreSQL. PDF text includes page references. DOCX text includes paragraph references, without formatting or images. Identical file contents reuse the existing document, even if the filename changes.

Preference extraction uses the Vercel AI SDK through Vercel AI Gateway with structured output. Each suggested preference includes source quotes checked against the extracted text before saving. All new suggestions start pending; only the user's confirmation puts them in the profile. The trial uses one shared workspace without authentication; the development and production scripts bind to loopback for local use.

## Local development

With nvm installed and loaded in your shell:

```bash
nvm install
nvm use
```

If the pinned pnpm version is not available under that Node version, bootstrap it once:

```bash
npm install --global pnpm@12.14.0
```

Install project dependencies, then start Docker Desktop and initialize the local database:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm dev
```

Open [127.0.0.1:3000](http://127.0.0.1:3000), and choose a questionnaire; it uploads immediately. Once ready, select its name to inspect the extracted text. Refreshing the page preserves the document and its contents. Uploads work without an AI key. If `.env.local` already exists, add missing variables from `.env.example` instead of overwriting your file.

### Enable AI extraction

Create a [Vercel AI Gateway API key](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys) and add it directly to the gitignored `.env.local` as `AI_GATEWAY_API_KEY`; never put it in a `NEXT_PUBLIC_` variable or commit it. This local app uses Gateway key authentication and does not require a direct OpenAI key or a Vercel deployment. `AI_GATEWAY_MODEL` defaults to `openai/gpt-5.4-mini` and can be changed to an accessible Gateway model supporting structured output. Use an exact `provider/model` ID from the [live model catalog](https://ai-gateway.vercel.sh/v1/models). Restart `pnpm dev` after changing server configuration. The UI's **Check configuration** checks whether a key is present, not whether Gateway accepts it.

Select one to five ready documents, then choose **Find preferences**. Extracted text and filenames are sent through Vercel AI Gateway to the selected model provider; originals are not uploaded to the model. Requests use the native Gateway adapter with structured JSON output, without tools or SDK automatic retries. The OpenAI-specific `store: false` option is forwarded for OpenAI models; it is not a claim of zero retention across Gateway or other providers. No live call occurs when the key is missing, and there is no mock fallback in the application. Credential, credit/budget, model-access, and rate-limit failures show actionable messages without exposing raw provider errors.

The [AI SDK structured-output guide](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) and [Vercel AI Gateway setup guide](https://vercel.com/docs/ai-gateway/getting-started) describe the APIs used by this integration.

`compose.yaml` runs a dedicated PostgreSQL container on `127.0.0.1:5432` with local-only development credentials and the persistent `flashpoint_postgres_data` volume. `pnpm db:stop` stops it without removing data; `pnpm db:up` starts it again. Avoid `docker compose down -v` unless you intentionally want to erase this local workspace. If port 5432 is already used, change the published port in `compose.yaml` and `DATABASE_URL` together.

Use pnpm for project dependencies and commit `pnpm-lock.yaml` when they change.

## Backend layout

- `src/server/db/schema.ts`: documents, preferences, and source evidence, with foreign keys and constraints.
- `drizzle/`: generated, versioned SQL migrations. Change the schema, run `pnpm db:generate`, review the SQL, then run `pnpm db:migrate`. Commit the SQL and migration metadata.
- `src/server/db/index.ts`: lazy PostgreSQL connection pool reused during development reloads. Credentials stay on the server.
- `src/server/router.ts`: typed `preferences.list`, `preferences.decide`, `preferences.delete`, `documents.delete`, and `workspace.reset` procedures, with Zod validation and version checks to reject stale edits.
- `src/server/documents.ts`: document persistence, content deduplication, processing status, and retries; exposed through tRPC `documents.list`, `documents.get`, and `documents.retry`.
- `src/server/analyses.ts`: durable analysis records, request deduplication, transactional suggestion/evidence saves, retries, and interrupted-attempt recovery.
- `src/server/preference-extraction.ts`: versioned extraction prompt, Zod output schema, and source-quote validation. Document content is untrusted data and cannot approve preferences or invoke tools.
- `src/server/ai-provider.ts`: server-only model/key configuration; tRPC exposes only the provider, model name, and a configured boolean.
- `src/server/document-extraction.ts`: PDF parsing with `pdf-parse` and DOCX raw text with `mammoth`. DOCX ZIP contents are size-checked with `yauzl` before parsing.
- `src/server/document-storage.ts`: private originals stored under generated UUID filenames.
- `src/pages/api/documents/upload.ts`: bounded multipart upload via `formidable`, one file per request. The UI submits up to ten selected files sequentially.
- `src/pages/api/documents/[id]/download.ts`: original downloads by document ID.
- `src/pages/api/trpc/[trpc].ts`: Next.js Pages Router API adapter.
- `src/components/api-provider.tsx`: tRPC and TanStack Query providers.
- `src/components/workspace-provider.tsx`: server data cache and asynchronous review actions; files awaiting upload remain in browser memory.

The UI waits for a successful save before changing the profile, shows loading/errors, and preserves an open edit on failure. A failed save can be retried. A stale edit shows a conflict and refreshes the saved version. **Reset workspace** in the sidebar deletes everything after a confirmation that lists the counts.

Integration references: [tRPC React Query setup](https://trpc.io/docs/client/tanstack-react-query/setup), [Next.js API adapter](https://trpc.io/docs/server/adapters/nextjs), and [Drizzle with PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new).

## Document storage and processing

Originals live in `.data/uploads/` by default, outside the public directory and ignored by Git. Set `UPLOAD_DIR` to an absolute persistent directory to override this location. Back up this directory together with PostgreSQL: the database contains extracted text, but downloading or retrying requires the original file. Local disk storage is intended for this local trial; deploying to an ephemeral filesystem requires replacing it with durable object storage.

Processing is awaited within the upload or retry request. The UI polls while work is in progress. If the server stops or processing exceeds two minutes, the next document-list refresh marks that attempt failed and allows a retry. An attempt token prevents an older process from overwriting a newer attempt. There is no background queue or OCR service yet.

Limits and behavior:

- Nonempty PDF/DOCX files, up to 10 MB each; at most ten selected in the browser. The server independently checks size, extension, and signature.
- At most 200 PDF pages or 5,000 DOCX paragraphs, and 500,000 extracted characters per document. Over-limit documents fail explicitly; text is not silently truncated.
- DOCX archives are limited to 2,000 entries and 50 MB expanded content. No archive files are written to disk, and external document references are not fetched.
- Password-protected PDFs, damaged files, and documents without readable text show a failed status with a reason. PDFs with some blank/scanned pages retain those page positions and show a warning.
- Extracted content is rendered as plain text. It is untrusted source material, never executable markup or instructions.
- Files that pass initial upload validation retain their originals even if extraction fails. Retry uses the saved original; a damaged document generally needs a newly exported copy.

## Verification

### Analysis behavior and limits

- One to five ready uploaded documents per request, limited to 80,000 characters including source references. Oversized selections fail before any model call; text is never silently truncated. Larger corpora and chunked analysis are future work.
- At most 12 candidates per run. Each candidate needs one to four quotes. Unknown references and quotes that do not occur in the indicated source cause the candidate to be discarded. Whitespace differences are tolerated, and the saved quote uses original source formatting. Quote matching establishes provenance, not whether an inference is correct; users still review it.
- The prompt asks for observable work choices and contextual, tentative rules. It excludes respondent opinions and personal/sensitive traits, acknowledges single-example uncertainty, and allows no suggestions when evidence is insufficient. Prompt quality requires evaluation on real representative questionnaires.
- The document content, selected set, prompt version, provider, and model determine a unique analysis. Repeating a completed request reuses its result without another API call. Exact normalized duplicate rules across runs are skipped; semantic paraphrase deduplication is not implemented. Existing edits, denials, and approvals remain unchanged.
- Model requests time out after 90 seconds with automatic retries disabled. Interrupted runs become retryable after two minutes. Attempts are fenced so late results cannot overwrite newer attempts. Suggestions, source evidence, and run completion commit in one transaction.
- Analysis records retain provider/model/prompt version, token counts, and safe failure messages. Raw provider errors and complete model responses are not logged or returned. The last ten runs are shown in the document screen. This remains a request-based local trial, without a background queue.

### Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

To serve a completed production build, run `pnpm start`.

The UI follows the public-site reference in [design.md](design.md). Inter, Newsreader, and Plus Jakarta Sans are bundled locally with their SIL licenses under `src/styles/fonts`, so builds do not need to download fonts. The public Flashpoint.AI mark is retained unchanged under `public/brand`. In a restricted runner, Turbopack may need permission to create local worker processes and sockets.

`pnpm test` requires the local database to be running. Tests create uniquely named temporary databases and an isolated temporary upload directory, apply the real migrations, and exercise the tRPC router and document pipeline. AI tests use the SDK's mock model at the server dependency boundary, with no paid calls or credentials. They cover structured output, source verification, request concurrency, preserving reviewed decisions, missing credentials, invalid output, provider errors, retries, and expired attempts. Document tests cover extraction, originals, upload validation, processing limits, and reconnect persistence. Cleanup drops only the test databases and test files. The app database is not cleared or modified. The configured database role needs `CREATEDB` permission (the local Docker role has it).

To check the live flow, configure the key, upload a PDF and DOCX, inspect their text, select them, and run **Find preferences**. Review the source quotes; confirm one suggestion, edit another, and deny a third. Refresh `/profile`: only confirmed real preferences should remain. Running the same selection again should preserve decisions without a second model request. Check failures with an invalid key, an oversized selection, and a damaged document; no failure should add approved preferences.

## First product milestone

Upload one questionnaire, extract candidate preferences with source evidence, confirm a preference, and persist it to the approved profile.
