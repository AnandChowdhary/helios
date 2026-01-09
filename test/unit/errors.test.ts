import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createError,
  errorResponse,
  errorHandler,
  ErrorCodes,
} from "../../src/utils/errors";

describe("Error Utilities", () => {
  describe("createError", () => {
    it("creates HTTPException with default message", () => {
      const error = createError(ErrorCodes.AUTH_MISSING_KEY);

      expect(error).toBeInstanceOf(HTTPException);
      expect(error.status).toBe(401);
      expect(error.message).toBe(
        "Missing API key. Provide a valid API key in the Authorization header.",
      );
      expect(error.cause).toEqual({
        code: ErrorCodes.AUTH_MISSING_KEY,
        details: undefined,
      });
    });

    it("creates HTTPException with custom message", () => {
      const customMessage = "Custom auth error message";
      const error = createError(ErrorCodes.AUTH_INVALID_KEY, customMessage);

      expect(error).toBeInstanceOf(HTTPException);
      expect(error.status).toBe(401);
      expect(error.message).toBe(customMessage);
    });

    it("creates HTTPException with details", () => {
      const details = { field: "apiKey", reason: "expired" };
      const error = createError(
        ErrorCodes.AUTH_DISABLED_KEY,
        undefined,
        details,
      );

      expect(error).toBeInstanceOf(HTTPException);
      expect(error.cause).toEqual({
        code: ErrorCodes.AUTH_DISABLED_KEY,
        details,
      });
    });

    it("creates HTTPException with correct status codes for various error codes", () => {
      // 400 errors
      expect(createError(ErrorCodes.VALIDATION_FAILED).status).toBe(400);
      expect(createError(ErrorCodes.VALIDATION_INVALID_JSON).status).toBe(400);
      expect(createError(ErrorCodes.TASK_NOT_CANCELLABLE).status).toBe(400);

      // 401 errors
      expect(createError(ErrorCodes.AUTH_MISSING_KEY).status).toBe(401);
      expect(createError(ErrorCodes.AUTH_INVALID_KEY).status).toBe(401);

      // 404 errors
      expect(createError(ErrorCodes.TASK_NOT_FOUND).status).toBe(404);
      expect(createError(ErrorCodes.LOGS_NOT_FOUND).status).toBe(404);

      // 429 errors
      expect(createError(ErrorCodes.RATE_LIMIT_EXCEEDED).status).toBe(429);
      expect(createError(ErrorCodes.CONCURRENT_LIMIT_EXCEEDED).status).toBe(
        429,
      );

      // 500 errors
      expect(createError(ErrorCodes.INTERNAL_ERROR).status).toBe(500);
      expect(createError(ErrorCodes.TASK_EXECUTION_FAILED).status).toBe(500);
    });
  });

  describe("errorResponse", () => {
    it("creates error response with default message", () => {
      const response = errorResponse(ErrorCodes.TASK_NOT_FOUND);

      expect(response).toEqual({
        error: {
          code: ErrorCodes.TASK_NOT_FOUND,
          message: "Task not found. The task may have expired or been deleted.",
        },
      });
    });

    it("creates error response with custom message", () => {
      const customMessage = "Task xyz not found in the database";
      const response = errorResponse(ErrorCodes.TASK_NOT_FOUND, customMessage);

      expect(response).toEqual({
        error: {
          code: ErrorCodes.TASK_NOT_FOUND,
          message: customMessage,
        },
      });
    });

    it("creates error response with details", () => {
      const details = { taskId: "task_123", searchedIn: ["kv", "r2"] };
      const response = errorResponse(
        ErrorCodes.TASK_NOT_FOUND,
        undefined,
        details,
      );

      expect(response).toEqual({
        error: {
          code: ErrorCodes.TASK_NOT_FOUND,
          message: "Task not found. The task may have expired or been deleted.",
          details,
        },
      });
    });

    it("creates error response with custom message and details", () => {
      const response = errorResponse(
        ErrorCodes.VALIDATION_FAILED,
        "Invalid input data",
        { fields: ["prompt", "repository.url"] },
      );

      expect(response).toEqual({
        error: {
          code: ErrorCodes.VALIDATION_FAILED,
          message: "Invalid input data",
          details: { fields: ["prompt", "repository.url"] },
        },
      });
    });

    it("does not include details key when undefined", () => {
      const response = errorResponse(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        "Rate limit exceeded",
        undefined,
      );

      expect(response.error).not.toHaveProperty("details");
    });
  });

  describe("errorHandler", () => {
    let app: Hono;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      app = new Hono();
      app.onError(errorHandler);
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("handles HTTPException with structured error code", async () => {
      app.get("/test", () => {
        throw createError(ErrorCodes.AUTH_MISSING_KEY);
      });

      const res = await app.request("/test");
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(401);
      expect(body.error.code).toBe(ErrorCodes.AUTH_MISSING_KEY);
    });

    it("handles HTTPException with custom message and details", async () => {
      const details = { field: "token" };
      app.get("/test", () => {
        throw createError(
          ErrorCodes.AUTH_INVALID_KEY,
          "Token is malformed",
          details,
        );
      });

      const res = await app.request("/test");
      const body = (await res.json()) as {
        error: { code: string; message: string; details: unknown };
      };

      expect(res.status).toBe(401);
      expect(body.error.code).toBe(ErrorCodes.AUTH_INVALID_KEY);
      expect(body.error.message).toBe("Token is malformed");
      expect(body.error.details).toEqual(details);
    });

    it("handles legacy HTTPException without error code - 400", async () => {
      app.get("/test", () => {
        throw new HTTPException(400, { message: "Bad request" });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(400);
      expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
    });

    it("handles legacy HTTPException without error code - 401", async () => {
      app.get("/test", () => {
        throw new HTTPException(401, { message: "Unauthorized" });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(401);
      expect(body.error.code).toBe(ErrorCodes.AUTH_INVALID_KEY);
    });

    it("handles legacy HTTPException without error code - 404", async () => {
      app.get("/test", () => {
        throw new HTTPException(404, { message: "Not found" });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(404);
      expect(body.error.code).toBe(ErrorCodes.TASK_NOT_FOUND);
    });

    it("handles legacy HTTPException without error code - 429", async () => {
      app.get("/test", () => {
        throw new HTTPException(429, { message: "Too many requests" });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(429);
      expect(body.error.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
    });

    it("handles legacy HTTPException with unknown status code", async () => {
      app.get("/test", () => {
        // Using 418 I'm a teapot which is not mapped in inferErrorCodeFromStatus
        throw new HTTPException(418 as 500, { message: "I'm a teapot" });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as { error: { code: string } };

      expect(res.status).toBe(418);
      expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });

    it("handles legacy HTTPException with errors in cause", async () => {
      app.get("/test", () => {
        throw new HTTPException(400, {
          message: "Validation error",
          cause: { errors: [{ path: "prompt", message: "Required" }] },
        });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as {
        error: { code: string; details: unknown };
      };

      expect(res.status).toBe(400);
      expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect(body.error.details).toEqual([
        { path: "prompt", message: "Required" },
      ]);
    });

    it("handles unknown Error type", async () => {
      app.get("/test", () => {
        throw new Error("Something went wrong");
      });

      const res = await app.request("/test");
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };

      expect(res.status).toBe(500);
      expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
      expect(body.error.message).toBe(
        "An unexpected error occurred. Please try again later.",
      );
    });

    it("handles TypeError correctly", async () => {
      app.get("/test", () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj: any = null;
        // This will throw a TypeError
        return obj.nonExistent();
      });

      const res = await app.request("/test");
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };

      expect(res.status).toBe(500);
      expect(body.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
    });

    it("logs errors to console", async () => {
      const testError = new Error("Test error");
      app.get("/test", () => {
        throw testError;
      });

      await app.request("/test");

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error:", testError);
    });

    it("prefers details over errors in cause", async () => {
      app.get("/test", () => {
        throw createError(ErrorCodes.VALIDATION_FAILED, "Validation error", {
          fieldErrors: ["name required"],
        });
      });

      const res = await app.request("/test");
      const body = (await res.json()) as {
        error: { code: string; details: unknown };
      };

      expect(body.error.details).toEqual({ fieldErrors: ["name required"] });
    });
  });
});
