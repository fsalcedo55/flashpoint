import { analysesRouter } from "./analyses";
import { router } from "../trpc";

export const appRouter = router({
  analyses: analysesRouter,
});
export type AppRouter = typeof appRouter;
