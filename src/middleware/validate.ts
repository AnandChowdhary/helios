import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

export function validateBody<T extends z.ZodType>(schema: T) {
  return createMiddleware(async (c, next) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }

    const result = schema.safeParse(body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      throw new HTTPException(400, {
        message: "Validation failed",
        cause: { errors },
      });
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
