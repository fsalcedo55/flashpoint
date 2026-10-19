import type { NextApiRequest, NextApiResponse } from "next";
import { TRPCError } from "@trpc/server";
import { analysisInputSchema, type AnalysisStreamEvent } from "@/lib/analysis";
import { analyzeDocuments } from "@/server/analyses";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } }, maxDuration: 120 };

// Newline-delimited JSON: the model's reasoning summary as it streams, then the verified result.
export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Use POST to start an analysis." });
  }
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
    return response.status(403).json({ error: "Start analyses from this app." });
  }
  const input = analysisInputSchema.safeParse(request.body);
  if (!input.success) return response.status(400).json({ error: "Provide one to five documents with extracted text." });

  const controller = new AbortController();
  request.on("close", () => controller.abort());
  const send = (event: AnalysisStreamEvent) => { response.write(JSON.stringify(event) + "\n"); };
  response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no" });
  response.flushHeaders();
  try {
    const result = await analyzeDocuments(input.data, { onNote: (text) => send({ type: "note", text }), signal: controller.signal });
    send({ type: "result", result });
  } catch (error) {
    send({ type: "error", message: error instanceof TRPCError ? error.message : "Analysis could not be completed. Try again." });
  } finally {
    response.end();
  }
}
