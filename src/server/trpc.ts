import { initTRPC } from "@trpc/server";
import type { CreateNextContextOptions } from "@trpc/server/adapters/next";

export function createTRPCContext({ req }: CreateNextContextOptions) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return { headers };
}

const t = initTRPC.context<ReturnType<typeof createTRPCContext>>().create({
  errorFormatter({ shape, error }) {
    return { ...shape,
      message: error.code === "INTERNAL_SERVER_ERROR" ? "The request could not be completed. Try again." : shape.message,
      data: { ...shape.data, stack: undefined },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
