import { analysisInputSchema } from "../lib/analysis";
import { analyzeDocuments } from "./analyses";
import { aiConfiguration } from "./ai-provider";
import { t } from "./trpc";

export const appRouter = t.router({
  analyses: t.router({
    configuration: t.procedure.query(() => aiConfiguration()),
    start: t.procedure.input(analysisInputSchema).mutation(({ input }) => analyzeDocuments(input)),
  }),
});
export type AppRouter = typeof appRouter;
