import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export function errorHandler(err: Error, c: Context): Response {
  console.error("Error:", err);

  if (err instanceof HTTPException) {
    const cause = err.cause as { errors?: unknown } | undefined;
    const response: ErrorResponse = {
      error: {
        message: err.message,
        details: cause?.errors,
      },
    };
    return c.json(response, err.status);
  }

  // Unknown error
  const response: ErrorResponse = {
    error: {
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    },
  };

  return c.json(response, 500);
}
