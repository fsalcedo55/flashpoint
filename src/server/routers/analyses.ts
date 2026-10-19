import { analysisInputSchema } from "../../lib/analysis";
import { aiConfiguration } from "../ai/provider";
import { streamAnalysis } from "../services/analysis-stream";
import { publicProcedure, router } from "../trpc";

export const analysesRouter = router({
  configuration: publicProcedure.query(() => aiConfiguration()),

  start: publicProcedure
    .input(analysisInputSchema)
    .mutation(({ input, signal }) => streamAnalysis(input, { signal })),
});
