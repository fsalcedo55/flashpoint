import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { preferences } from "./db/schema";
import { deletePreference, listPreferences } from "./preferences";
import { t } from "./trpc";
import { deleteDocument, getDocument, listDocuments, retryDocument } from "./documents";
import { analyzeDocuments, listAnalyses } from "./analyses";
import { aiConfiguration } from "./ai-provider";
import { resetWorkspace } from "./workspace";

const identity = { id: z.uuid(), version: z.number().int().nonnegative() };
const decisionInput = z.discriminatedUnion("status", [
  z.strictObject({ ...identity, status: z.literal("confirmed"), rule: z.string().trim().min(10).max(500).optional() }),
  z.strictObject({ ...identity, status: z.enum(["pending", "denied"]) }),
]);

export const appRouter = t.router({
  analyses: t.router({
    configuration: t.procedure.query(() => aiConfiguration()),
    list: t.procedure.query(({ ctx }) => listAnalyses(ctx.db)),
    start: t.procedure.input(z.object({ documentIds: z.array(z.uuid()).min(1).max(5) }))
      .mutation(({ ctx, input }) => analyzeDocuments(ctx.db, input.documentIds)),
  }),
  documents: t.router({
    list: t.procedure.query(({ ctx }) => listDocuments(ctx.db)),
    get: t.procedure.input(z.object({ id: z.uuid() })).query(({ ctx, input }) => getDocument(ctx.db, input.id)),
    retry: t.procedure.input(z.object({ id: z.uuid() })).mutation(({ ctx, input }) => retryDocument(ctx.db, input.id)),
    delete: t.procedure.input(z.object({ id: z.uuid() })).mutation(({ ctx, input }) => deleteDocument(ctx.db, input.id)),
  }),
  preferences: t.router({
    list: t.procedure.query(({ ctx }) => listPreferences(ctx.db)),
    decide: t.procedure.input(decisionInput).mutation(async ({ ctx, input }) => {
      const [saved] = await ctx.db.update(preferences).set({
        status: input.status,
        ...(input.status === "confirmed" && input.rule !== undefined ? { rule: input.rule } : {}),
        reviewedAt: input.status === "pending" ? null : new Date(),
        updatedAt: new Date(),
        version: sql`${preferences.version} + 1`,
      }).where(and(eq(preferences.id, input.id), eq(preferences.version, input.version)))
        .returning({ id: preferences.id, status: preferences.status, rule: preferences.rule, version: preferences.version });

      if (!saved) {
        const [existing] = await ctx.db.select({ id: preferences.id }).from(preferences).where(eq(preferences.id, input.id));
        throw new TRPCError(existing
          ? { code: "CONFLICT", message: "This preference changed in another tab. Review the latest version and try again." }
          : { code: "NOT_FOUND", message: "This preference no longer exists. Reload the workspace and try again." });
      }
      return saved;
    }),
    delete: t.procedure.input(z.object({ id: z.uuid() })).mutation(({ ctx, input }) => deletePreference(ctx.db, input.id)),
  }),
  workspace: t.router({
    reset: t.procedure.mutation(({ ctx }) => resetWorkspace(ctx.db)),
  }),
});

export type AppRouter = typeof appRouter;
