import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import { createTRPCClient, httpBatchStreamLink, TRPCClientError } from "@trpc/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, type AppRouter } from "../src/server/routers/_app";

const quote = "Very dissatisfied / Dissatisfied / Neutral / Satisfied / Very satisfied";
const input = () => ({ documents: [{ id: randomUUID(), name: "Survey.docx", sections: [{ location: "Paragraph 1", text: quote }] }] });
const client = createTRPCClient<AppRouter>({
  links: [httpBatchStreamLink({
    url: "http://localhost/api/trpc",
    // Exercise the real router and HTTP streaming protocol without external requests.
    fetch: (url, options) => fetchRequestHandler({
      endpoint: "/api/trpc", req: new Request(url, options), router: appRouter,
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

function event(part: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(part)}\n\n`);
}

test("the analysis procedure streams notes before a verified result through the typed HTTP client", { timeout: 5000 }, async (t) => {
  configureGateway(t);
  const finish = Promise.withResolvers<void>();
  t.after(() => finish.resolve());
  const gateway = t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(String(url), "https://ai-gateway.vercel.sh/v4/ai/language-model");
    assert.equal(new Headers(options?.headers).get("ai-language-model-streaming"), "true");
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(event({ type: "stream-start", warnings: [] }));
        controller.enqueue(event({ type: "reasoning-start", id: "r" }));
        controller.enqueue(event({ type: "reasoning-delta", id: "r", delta: "Checking the scale." }));
        void finish.promise.then(() => {
          const output = { suggestions: [{ category: "Answer formats", title: "Negative to positive scales",
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
  const source = input();
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
  assert.equal(gateway.mock.callCount(), 1);
});

test("Zod rejects invalid procedure inputs before any AI call", async (t) => {
  configureGateway(t);
  const gateway = t.mock.method(globalThis, "fetch", async () => { throw new Error("AI must not be called"); });
  const invalid = [
    { documents: [] },
    { documents: Array.from({ length: 6 }, () => input().documents[0]) },
    { documents: [{ ...input().documents[0], id: "not-a-uuid" }] },
    { documents: [{ ...input().documents[0], sections: [] }] },
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
