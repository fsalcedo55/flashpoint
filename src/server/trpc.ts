import { initTRPC } from "@trpc/server";

export const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return { ...shape,
      message: error.code === "INTERNAL_SERVER_ERROR" ? "The request could not be completed. Try again." : shape.message,
      data: { ...shape.data, stack: undefined },
    };
  },
});
