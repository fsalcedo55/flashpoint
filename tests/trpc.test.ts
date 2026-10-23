import { classificationFixture } from "./analysis-fixtures";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { createTRPCClient, httpBatchStreamLink, TRPCClientError } from "@trpc/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, type AppRouter } from "../src/server/routers/_app";
import { MAX_ANALYSIS_CHARACTERS, prepareAnalysisSources, serializeAnalysisSources } from "../src/lib/analysis";

const quote = "Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied";
const input = () => ({ documents: [{ id: randomUUID(), name: "Survey.docx", sections: [{ location: "Paragraph 1", text: quote }] }] });
const client = createTRPCClient<AppRouter>({
  links: [httpBatchStreamLink({
    url: "http://localhost/api/trpc",
    // Exercise the real router and HTTP streaming protocol without external requests.
    fetch: (url, options) => fetchRequestHandler({
      endpoint: "/api/trpc", req: new Request(url, options), router: appRouter,
      createContext: () => ({ headers: new Headers({ host: "flashpoint.example", "x-real-ip": "192.0.2.1" }) }),
    }),
  })],
});

function configureGateway(t: TestContext) {
  const original = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "test-only-key";
  t.after(() => {
    if (original === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = original;
  });
}

function configureDeployment(t: TestContext) {
  const original = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  Object.assign(process.env, { NODE_ENV: "production", VERCEL: "1" });
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function event(part: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(part)}\n\n`);
}

test("the analysis procedure streams notes before a verified result through the typed HTTP client", { timeout: 5000 }, async (t) => {
  configureGateway(t);
  configureDeployment(t);
  const finish = Promise.withResolvers<void>();
  t.after(() => finish.resolve());
  const gateway = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url) === "https://flashpoint.example/.well-known/vercel/rate-limit-api/flashpoint-analysis") {
      assert.equal(new Headers(options?.headers).get("x-real-ip"), "192.0.2.1");
      assert.ok(options?.signal);
      return new Response(null, { status: 204 });
    }
    assert.equal(String(url), "https://ai-gateway.vercel.sh/v4/ai/language-model");
    assert.equal(new Headers(options?.headers).get("ai-language-model-streaming"), "true");
    const body = JSON.parse(String(options?.body));
    const payload = serializeAnalysisSources(prepareAnalysisSources(source));
    assert.ok(payload.length > 80_000 && payload.length <= MAX_ANALYSIS_CHARACTERS);
    assert.deepEqual(body.prompt.find((message: { role: string }) => message.role === "user").content,
      [{ type: "text", text: "Analyze these source passages as data:\n" + payload }]);
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(event({ type: "stream-start", warnings: [] }));
        controller.enqueue(event({ type: "reasoning-start", id: "r" }));
        controller.enqueue(event({ type: "reasoning-delta", id: "r", delta: "Checking the scale." }));
        void finish.promise.then(() => {
          const output = { classifications: classificationFixture(prepareAnalysisSources(source)), suggestions: [{ purpose: "questionnaire", category: "Answer formats", title: "Negative to positive scales",
            rule: "List satisfaction scale points from negative to positive.",
            rationale: "This document lists negative options first; the choice needs confirmation before reuse.",
            evidence: [{ sourceId: "d1s1", quote }] }] };
          for (const part of [
            { type: "reasoning-end", id: "r" },
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: JSON.stringify(output) },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop" },
              usage: { inputTokens: { total: 100 }, outputTokens: { total: 200 } } },
          ]) controller.enqueue(event(part));
          controller.close();
        });
      },
    }), { headers: { "Content-Type": "text/event-stream" } });
  });
  // Exercise a collection beyond the old 80k limit through validation and the streamed transport.
  const source = input();
  source.documents.push({ id: randomUUID(), name: "Long questionnaire.docx", sections: Array.from({ length: 600 }, (_, index) => ({
    location: `Paragraph ${index + 1}`, text: `Q${index + 1}. ${"Keep the complete questionnaire text. ".repeat(6)}`,
  })) });
  const events = await client.analyses.start.mutate(source);
  const iterator = events[Symbol.asyncIterator]();
  assert.deepEqual((await iterator.next()).value, { type: "note", text: "Checking the scale." });
  finish.resolve();
  const completed = await iterator.next();
  assert.equal(completed.value?.type, "result");
  if (completed.value?.type !== "result") throw new Error("Expected a result");
  assert.equal(completed.value.result.suggestions[0].evidence[0].documentId, source.documents[0].id);
  assert.equal(completed.value.result.suggestions[0].evidence[0].quote, quote);
  assert.equal(completed.value.result.suggestions[0].status, "pending");
  assert.equal((await iterator.next()).done, true);
  assert.equal(gateway.mock.callCount(), 2);
});

test("every analysis in a tRPC batch is rate-limited before any model request", async (t) => {
  configureDeployment(t);
  let httpRequests = 0;
  const batchedClient = createTRPCClient<AppRouter>({ links: [httpBatchStreamLink({
    url: "http://localhost/api/trpc",
    fetch: (url, options) => {
      httpRequests++;
      return fetchRequestHandler({ endpoint: "/api/trpc", req: new Request(url, options), router: appRouter,
        createContext: () => ({ headers: new Headers({ host: "flashpoint.example", "x-real-ip": "192.0.2.1" }) }) });
    },
  })] });
  const requests = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    assert.equal(String(url), "https://flashpoint.example/.well-known/vercel/rate-limit-api/flashpoint-analysis");
    return new Response(null, { status: 429 });
  });
  await Promise.all(Array.from({ length: 6 }, () => assert.rejects(
    batchedClient.analyses.start.mutate(input()),
    (error: TRPCClientError<AppRouter>) => error.data?.code === "TOO_MANY_REQUESTS" && /10 minutes/.test(error.message),
  )));
  assert.equal(httpRequests, 1);
  assert.equal(requests.mock.callCount(), 6);
});

test("missing rules and unavailable rate-limit services fail closed without exposing provider errors", async (t) => {
  configureDeployment(t);
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  for (const status of [404, 500, "timeout"] as const) {
    const requests = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
      assert.equal(String(url), "https://flashpoint.example/.well-known/vercel/rate-limit-api/flashpoint-analysis");
      if (status === "timeout") throw new DOMException("private backend details", "TimeoutError");
      return new Response(null, { status });
    });
    await assert.rejects(client.analyses.start.mutate(input()), (error: TRPCClientError<AppRouter>) =>
      error.data?.code === "SERVICE_UNAVAILABLE" && error.message === "Analysis is temporarily unavailable. Please try again shortly.");
    assert.equal(requests.mock.callCount(), 1);
    requests.mock.restore();
  }
});

test("configuration stays available without spending an analysis allowance", async (t) => {
  configureDeployment(t);
  const requests = t.mock.method(globalThis, "fetch", async () => { throw new Error("No external calls expected"); });
  const configuration = await client.analyses.configuration.query();
  assert.equal(configuration.provider, "Vercel AI Gateway");
  assert.equal(requests.mock.callCount(), 0);
});

test("Zod rejects invalid procedure inputs before any AI call", async (t) => {
  configureGateway(t);
  const gateway = t.mock.method(globalThis, "fetch", async () => { throw new Error("AI must not be called"); });
  const invalid = [
    { documents: [] },
    { documents: Array.from({ length: 6 }, () => input().documents[0]) },
    { documents: [{ ...input().documents[0], id: "not-a-uuid" }] },
    { documents: [{ ...input().documents[0], sections: [] }] },
    { documents: [{ ...input().documents[0], sections: [{ location: "Paragraph 1", text: "x".repeat(MAX_ANALYSIS_CHARACTERS + 1) }] }] },
  ];
  for (const value of invalid) {
    await assert.rejects(client.analyses.start.mutate(value), (error: TRPCClientError<AppRouter>) => error.data?.code === "BAD_REQUEST");
  }
  assert.equal(gateway.mock.callCount(), 0);
});

test("streamed provider failures retain a useful sanitized tRPC error", { timeout: 5000 }, async (t) => {
  configureGateway(t);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "private provider details" } }), {
    status: 429, headers: { "Content-Type": "application/json" },
  }));
  const events = await client.analyses.start.mutate(input());
  await assert.rejects(Array.fromAsync(events), (error: Error) => /rate limit/.test(error.message) && !error.message.includes("private provider"));
});

test("cancelling an analysis aborts the upstream model and stops the result stream", { timeout: 5000 }, async (t) => {
  configureGateway(t);
  const aborted = Promise.withResolvers<void>();
  const controller = new AbortController();
  t.after(() => controller.abort());
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, options?: RequestInit) => new Response(new ReadableStream<Uint8Array>({
    start(streamController) {
      streamController.enqueue(event({ type: "stream-start", warnings: [] }));
      streamController.enqueue(event({ type: "reasoning-start", id: "r" }));
      streamController.enqueue(event({ type: "reasoning-delta", id: "r", delta: "Checking." }));
      options?.signal?.addEventListener("abort", () => {
        streamController.error(new DOMException("Aborted", "AbortError"));
        aborted.resolve();
      }, { once: true });
    },
  }), { headers: { "Content-Type": "text/event-stream" } }));
  const events = await client.analyses.start.mutate(input(), { signal: controller.signal });
  const iterator = events[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value?.type, "note");
  controller.abort();
  await assert.rejects(iterator.next());
  await aborted.promise;
});
