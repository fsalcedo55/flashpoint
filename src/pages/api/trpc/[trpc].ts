import { createNextApiHandler } from "@trpc/server/adapters/next";
import { appRouter } from "@/server/router";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } }, maxDuration: 120 };
export default createNextApiHandler({
  router: appRouter,
  responseMeta: () => ({ headers: { "Cache-Control": "no-store" } }),
  onError({ path, error }) { console.error(`[tRPC] ${path ?? "request"}: ${error.code}`); },
});
