import { initTRPC } from "@trpc/server";
import type { Database } from "./db";

export const t = initTRPC.context<{ db: Database }>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message: error.code === "INTERNAL_SERVER_ERROR"
        ? "The workspace could not be saved or loaded. Check the database connection and try again."
        : shape.message,
      data: { ...shape.data, stack: undefined },
    };
  },
});
