import { analysisInputSchema } from "../../lib/analysis";
import { aiConfiguration } from "../ai/provider";
import { streamAnalysis } from "../services/analysis-stream";
import { enforceAnalysisRateLimit } from "../services/rate-limit";
import { publicProcedure, router } from "../trpc";

export const analysesRouter = router({
  configuration: publicProcedure.query(() => aiConfiguration()),

  start: publicProcedure
    .input(analysisInputSchema)
    .use(async ({ ctx, next }) => {
      await enforceAnalysisRateLimit(ctx.headers);
      return next();
    })
    .mutation(({ input, signal }) => streamAnalysis(input, { signal })),
});
