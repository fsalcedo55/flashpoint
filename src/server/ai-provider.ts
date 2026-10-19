import { createGateway } from "ai";
import { TRPCError } from "@trpc/server";

export function aiConfiguration() {
  return {
    provider: "Vercel AI Gateway",
    model: process.env.AI_GATEWAY_MODEL?.trim() || "anthropic/claude-opus-5.5",
    configured: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
  };
}

export function extractionModel() {
  const config = aiConfiguration();
  if (!config.configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI extraction is not configured. Add AI_GATEWAY_API_KEY to .env.local and restart the app." });
  return createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY?.trim() })(config.model);
}
