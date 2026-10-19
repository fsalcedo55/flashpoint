import { TRPCError } from "@trpc/server";
import { checkRateLimit } from "@vercel/firewall";

// Configure this SDK rule in Vercel: 5 requests per IP per 600 seconds.
export const ANALYSIS_RATE_LIMIT_ID = "flashpoint-analysis";

export async function enforceAnalysisRateLimit(headers: Headers) {
  // Local development and tests do not have Vercel's managed counters.
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") return;

  let result: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    if (process.env.VERCEL !== "1") throw new Error("Vercel deployment required");
    result = await checkRateLimit(ANALYSIS_RATE_LIMIT_ID, { headers, timeout: 3000 });
    if (result.error === "not-found") throw new Error("Analysis rate-limit rule missing");
  } catch {
    // A missing rule or failed check must never permit an unmetered paid call.
    console.error("[rate-limit] Analysis rate-limit check unavailable");
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Analysis is temporarily unavailable. Please try again shortly." });
  }

  if (result.rateLimited) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many analyses. Please wait up to 10 minutes before trying again." });
  }
}
