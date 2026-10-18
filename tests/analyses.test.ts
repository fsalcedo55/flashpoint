import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { APICallError, createGateway } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createDatabase } from "../src/server/db";
import { analyses, documents, preferences } from "../src/server/db/schema";
import { analyzeDocuments, listAnalyses } from "../src/server/analyses";
import { extractionSchema, generatePreferences, verifyEvidence, type SourcePassage } from "../src/server/preference-extraction";
import { appRouter } from "../src/server/router";

loadEnvConfig(process.cwd());

const openingQuote = "1. Which brands come to mind?\n2. Which of these brands do you recognize?";
const scaleQuote = "Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied";
const candidate = (sourceId: string, quote = openingQuote, rule = "Begin brand awareness sections with an open-ended question before listing brands.") => ({
  category: "Question order", title: "Ask unaided questions first", rule,
  rationale: "This questionnaire asks for unprompted recall first. This may be specific to this document and needs confirmation.",
  evidence: [{ sourceId, quote }],
});
function response(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 200, text: 200, reasoning: undefined } },
    warnings: [],
  };
}
function fixtureModel(output: unknown) { return new MockLanguageModelV4({ doGenerate: response(output) }); }

test("evidence validation rejects invented references and preserves original quote formatting", () => {
  const source: SourcePassage = { sourceId: "d1s1", documentId: randomUUID(), document: "Survey.pdf", location: "Page 1", text: openingQuote };
  const output = extractionSchema.parse({ suggestions: [candidate("d1s1", openingQuote.replace("\n", " ")), candidate("invented"), candidate("d1s1", "A quote that never appeared anywhere.")] });
  const verified = verifyEvidence(output, [source]);
  assert.equal(verified.suggestions.length, 1);
  assert.equal(verified.rejectedCount, 2);
  assert.equal(verified.suggestions[0].evidence[0].quote, openingQuote);
  assert.equal(verified.suggestions[0].evidence[0].location, "Page 1");
});

test("the Gateway adapter sends authenticated structured requests and forwards provider options", async () => {
  let calls = 0;
  const provider = createGateway({ apiKey: "test-only-key", fetch: async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://ai-gateway.vercel.sh/v4/ai/language-model");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-only-key");
    assert.equal(headers.get("ai-language-model-id"), "openai/gpt-5.4-mini");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.providerOptions.openai.store, false);
    assert.equal(body.responseFormat.type, "json");
    assert.ok(body.responseFormat.schema.properties.suggestions);
    assert.equal(body.maxOutputTokens, 6000);
    assert.ok(!body.tools?.length);
    return new Response(JSON.stringify(response({ suggestions: [candidate("d1s1")] })), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  const result = await generatePreferences(provider("openai/gpt-5.4-mini"), [{ sourceId: "d1s1", documentId: randomUUID(), document: "Survey.pdf", location: "Page 1", text: openingQuote }]);
  assert.equal(result.output.suggestions.length, 1);
  assert.equal(result.inputTokens, 100);
  assert.equal(calls, 1);
});

test("AI analysis persists verified pending preferences and preserves user decisions", async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const url = new URL(process.env.DATABASE_URL);
  const name = "flashpoint_test_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  let database: ReturnType<typeof createDatabase> | undefined;
  await admin.query(`CREATE DATABASE "${name}"`);
  try {
    url.pathname = "/" + name;
    database = createDatabase(url.toString());
    const { db } = database;
    await migrate(db, { migrationsFolder: "./drizzle" });
    const caller = appRouter.createCaller({ db });
    const [document] = await db.insert(documents).values({ name: "Survey.pdf", status: "ready", fileType: "pdf",
      sections: [{ location: "Page 1", text: openingQuote }, { location: "Page 2", text: scaleQuote }],
      characterCount: openingQuote.length + scaleQuote.length, sectionCount: 2 }).returning();
    const [another] = await db.insert(documents).values({ name: "Another survey.docx", status: "ready", fileType: "docx",
      sections: [{ location: "Paragraph 1", text: "What is your first impression of this concept?" }], characterCount: 45, sectionCount: 1 }).returning();
    const output = { suggestions: [candidate("d1s1"), { ...candidate("d1s2", scaleQuote, "Use fully labeled five-point satisfaction scales."), category: "Answer formats", title: "Label all scale points" }, candidate("not-a-source")] };
    let runId = "";

    await t.test("concurrent requests make one model call, validate quotes, and save only pending preferences", async () => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const model = new MockLanguageModelV4({ doGenerate: async () => { entered(); await gate; return response(output); } });
      const dependency = { model, provider: "test", modelId: "fixture-v1" };
      const first = analyzeDocuments(db, [document.id], dependency);
      await started;
      const concurrent = await analyzeDocuments(db, [document.id], dependency);
      assert.equal(concurrent.status, "running");
      assert.equal((await listAnalyses(db))[0].status, "running");
      release();
      const run = await first;
      runId = run.id;
      assert.equal(run.id, concurrent.id);
      assert.equal(model.doGenerateCalls.length, 1);
      assert.equal(run.status, "completed");
      assert.equal(run.suggestionCount, 2);
      assert.equal(run.rejectedCount, 1);
      assert.equal(run.inputTokens, 100);
      const saved = await caller.preferences.list();
      assert.equal(saved.length, 2);
      assert.ok(saved.every((item) => item.status === "pending" && item.version === 0));
      assert.equal(saved[0].evidence[0].quote, openingQuote);
      assert.equal(saved[0].evidence[0].document, "Survey.pdf");
      assert.ok(model.doGenerateCalls[0].prompt.some((message) => message.role === "system" && message.content.includes("UNTRUSTED DATA")));
      assert.equal(model.doGenerateCalls[0].tools, undefined);
    });

    await t.test("confirm/edit/deny and repeated analysis never reset decisions or call the model again", async () => {
      const [first, second] = await caller.preferences.list();
      await caller.preferences.decide({ id: first.id, version: 0, status: "confirmed", rule: "Start brand recall sections with one short open-ended question." });
      await caller.preferences.decide({ id: second.id, version: 0, status: "denied" });
      const before = await caller.preferences.list();
      const model = fixtureModel(output);
      const same = await analyzeDocuments(db, [document.id], { model, provider: "test", modelId: "fixture-v1" });
      assert.equal(same.id, runId);
      assert.equal(model.doGenerateCalls.length, 0);
      assert.deepEqual(await caller.preferences.list(), before);
      const rerun = await analyzeDocuments(db, [document.id], { model, provider: "test", modelId: "fixture-v2" });
      assert.equal(rerun.status, "completed");
      assert.equal(rerun.suggestionCount, 0);
      assert.deepEqual(await caller.preferences.list(), before);
    });

    await t.test("bad inputs and oversized documents make no model calls", async () => {
      const model = fixtureModel(output);
      const dependency = { model, provider: "test", modelId: "validation" };
      for (const ids of [[], [document.id, document.id], [randomUUID()]]) {
        await assert.rejects(analyzeDocuments(db, ids, dependency), (error) => error instanceof TRPCError && error.code === "BAD_REQUEST");
      }
      const [oversized] = await db.insert(documents).values({ name: "Large.docx", sections: [{ location: "Paragraph 1", text: "x".repeat(80_001) }] }).returning();
      await assert.rejects(analyzeDocuments(db, [oversized.id], dependency), /80,000/);
      assert.equal(model.doGenerateCalls.length, 0);
    });

    await t.test("missing credentials are actionable and never create a pretend analysis", async () => {
      const original = process.env.AI_GATEWAY_API_KEY;
      delete process.env.AI_GATEWAY_API_KEY;
      try {
        const before = await db.select().from(analyses);
        assert.equal((await caller.analyses.configuration()).configured, false);
        await assert.rejects(caller.analyses.start({ documentIds: [another.id] }), (error) => error instanceof TRPCError && error.code === "PRECONDITION_FAILED" && error.message.includes("AI_GATEWAY_API_KEY"));
        assert.deepEqual(await db.select().from(analyses), before);
      } finally {
        if (original !== undefined) process.env.AI_GATEWAY_API_KEY = original;
      }
    });

    await t.test("unverifiable output fails; an empty result is valid; malformed output saves nothing", async () => {
      const before = await caller.preferences.list();
      const invalid = await analyzeDocuments(db, [another.id], { model: fixtureModel({ suggestions: [candidate("made-up")] }), provider: "test", modelId: "invalid-evidence" });
      assert.equal(invalid.status, "failed");
      assert.match(invalid.error!, /verifiable source/);
      const empty = await analyzeDocuments(db, [another.id], { model: fixtureModel({ suggestions: [] }), provider: "test", modelId: "empty" });
      assert.equal(empty.status, "completed");
      assert.equal(empty.suggestionCount, 0);
      const malformed = await analyzeDocuments(db, [another.id], { model: fixtureModel({ somethingElse: "secret response" }), provider: "test", modelId: "malformed" });
      assert.equal(malformed.status, "failed");
      assert.ok(!malformed.error!.includes("secret response"));
      assert.deepEqual(await caller.preferences.list(), before);
    });

    await t.test("Gateway failures are actionable, sanitized, and never save preferences", async () => {
      const before = await caller.preferences.list();
      const originalEnvironment = process.env.NODE_ENV;
      try {
        for (const environment of ["development", "production"]) {
          Object.assign(process.env, { NODE_ENV: environment });
          for (const [status, type, expected] of [
            [401, "authentication_error", /Gateway API key/],
            [402, "insufficient_funds", /credits or budget/],
            [403, "customer_verification_required", /account verification/],
            [404, "model_not_found", /model ID/],
            [429, "rate_limit_exceeded", /rate limit/],
            [503, "internal_server_error", /could not complete/],
          ] as const) {
            let calls = 0;
            const provider = createGateway({ apiKey: "test-only-key", fetch: async () => {
              calls += 1;
              return new Response(JSON.stringify({ error: { type, message: "private provider details" } }), {
                status, headers: { "Content-Type": "application/json" },
              });
            } });
            const run = await analyzeDocuments(db, [another.id], { model: provider("openai/gpt-5.4-mini"), provider: "gateway-test", modelId: `error-${status}-${environment}` });
            assert.equal(run.status, "failed");
            assert.match(run.error!, expected);
            assert.ok(!run.error!.includes("private"));
            assert.equal(calls, 1);
          }
        }
      } finally {
        if (originalEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
        else Object.assign(process.env, { NODE_ENV: originalEnvironment });
      }
      assert.deepEqual(await caller.preferences.list(), before);
    });

    await t.test("provider failures are sanitized and retries reuse the failed run", async () => {
      const model = new MockLanguageModelV4({ doGenerate: async () => { throw new APICallError({ message: "private provider details", url: "https://example.invalid", requestBodyValues: {}, statusCode: 429, responseBody: "private text" }); } });
      const failed = await analyzeDocuments(db, [another.id], { model, provider: "test", modelId: "retry" });
      assert.equal(failed.status, "failed");
      assert.match(failed.error!, /rate limit or quota/);
      assert.ok(!failed.error!.includes("private"));
      assert.equal(model.doGenerateCalls.length, 1);
      const retried = await analyzeDocuments(db, [another.id], { model: fixtureModel({ suggestions: [] }), provider: "test", modelId: "retry" });
      assert.equal(retried.id, failed.id);
      assert.equal(retried.status, "completed");
      assert.notEqual(retried.attemptToken, failed.attemptToken);
      assert.equal(retried.error, null);
    });

    await t.test("an expired attempt cannot overwrite a newer attempt", async () => {
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const slow = new MockLanguageModelV4({ doGenerate: async () => { entered(); await gate; return response({ suggestions: [candidate("d1s1")] }); } });
      const first = analyzeDocuments(db, [document.id], { model: slow, provider: "test", modelId: "interrupted" });
      await started;
      const [run] = await db.select().from(analyses).where(eq(analyses.model, "interrupted"));
      await db.update(analyses).set({ startedAt: new Date(Date.now() - 180_000) }).where(eq(analyses.id, run.id));
      await listAnalyses(db);
      const retry = await analyzeDocuments(db, [document.id], { model: fixtureModel({ suggestions: [] }), provider: "test", modelId: "interrupted" });
      assert.equal(retry.status, "completed");
      const before = await caller.preferences.list();
      release();
      await first;
      assert.deepEqual(await caller.preferences.list(), before);
      const [after] = await db.select().from(analyses).where(eq(analyses.id, run.id));
      assert.equal(after.attemptToken, retry.attemptToken);
      assert.equal(after.suggestionCount, 0);
    });

    await t.test("fresh connections preserve analyses and source-backed review decisions", async () => {
      const before = await caller.preferences.list();
      await database!.pool.end();
      database = createDatabase(url.toString());
      assert.deepEqual(await appRouter.createCaller({ db: database.db }).preferences.list(), before);
      assert.ok((await database.db.select().from(preferences)).some((item) => item.analysisId === runId));
    });

    await t.test("deleting the last suggestion forgets its analysis so a rerun can suggest again; reset clears everything", async () => {
      const { db } = database!;
      const freshCaller = appRouter.createCaller({ db });
      await assert.rejects(freshCaller.preferences.delete({ id: randomUUID() }), (error: TRPCError) => error.code === "NOT_FOUND");
      const rows = await db.select({ id: preferences.id }).from(preferences).where(eq(preferences.analysisId, runId));
      assert.equal(rows.length, 2);
      await freshCaller.preferences.delete({ id: rows[0].id });
      assert.equal((await db.select().from(analyses).where(eq(analyses.id, runId))).length, 1);
      await freshCaller.preferences.delete({ id: rows[1].id });
      assert.equal((await db.select().from(analyses).where(eq(analyses.id, runId))).length, 0);
      assert.equal((await db.select().from(preferences).where(eq(preferences.analysisId, runId))).length, 0);
      const model = fixtureModel(output);
      const again = await analyzeDocuments(db, [document.id], { model, provider: "test", modelId: "fixture-v1" });
      assert.equal(model.doGenerateCalls.length, 1);
      assert.equal(again.suggestionCount, 2);

      const result = await freshCaller.workspace.reset();
      assert.ok(result.documents >= 2 && result.preferences >= 2 && result.analyses >= 1);
      assert.deepEqual(await freshCaller.preferences.list(), []);
      assert.deepEqual(await freshCaller.documents.list(), []);
      assert.deepEqual(await listAnalyses(db), []);
      assert.equal((await db.select().from(documents)).length, 0);
    });
  } finally {
    await database?.pool.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
