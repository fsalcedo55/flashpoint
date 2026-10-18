import { createNextApiHandler } from "@trpc/server/adapters/next";
import { getDatabase } from "@/server/db";
import { appRouter } from "@/server/router";

export const config = { maxDuration: 120 };

export default createNextApiHandler({
  router: appRouter,
  createContext: () => ({ db: getDatabase() }),
  responseMeta: () => ({ headers: { "Cache-Control": "no-store" } }),
  onError({ path, error }) {
    console.error(`[tRPC] ${path ?? "context"}: ${error.code}`);
  },
});
