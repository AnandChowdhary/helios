import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import { createError, ErrorCodes } from "../utils/errors";

export function validateBody<T extends z.ZodType>(schema: T) {
  return createMiddleware(async (c, next) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw createError(ErrorCodes.VALIDATION_INVALID_JSON);
    }

    const result = schema.safeParse(body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      throw createError(ErrorCodes.VALIDATION_FAILED, undefined, errors);
    }

    c.set("validatedBody", result.data);

    await next();
  });
}

declare module "hono" {
  interface ContextVariableMap {
    validatedBody: unknown;
  }
}
