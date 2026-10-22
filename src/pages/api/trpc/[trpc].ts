import type { NextApiRequest, NextApiResponse } from "next";
import { createNextApiHandler } from "@trpc/server/adapters/next";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";

// Keep this literal for Next.js config extraction; allow cleanup after the 210s client deadline.
export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 240 };
const trpcHandler = createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  responseMeta: () => ({ headers: { "Cache-Control": "no-store", "X-Accel-Buffering": "no" } }),
  onError({ path, error }) { console.error(`[tRPC] ${path ?? "request"}: ${error.code}`); },
});

export default function handler(request: NextApiRequest, response: NextApiResponse) {
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(403).json({ error: "Make requests from this app." });
  }
  return trpcHandler(request, response);
}
