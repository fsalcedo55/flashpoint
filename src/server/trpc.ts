import { initTRPC } from "@trpc/server";

const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return { ...shape,
      message: error.code === "INTERNAL_SERVER_ERROR" ? "The request could not be completed. Try again." : shape.message,
      data: { ...shape.data, stack: undefined },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
