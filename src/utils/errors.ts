import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  ErrorCodes,
  ErrorMessages,
  ErrorStatusCodes,
  type ErrorCode,
} from "./error-codes";

/**
 * Standard error response structure for the Helios API
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Extended HTTPException with error code support
 */
export interface HeliosErrorCause {
  code?: ErrorCode;
  errors?: unknown;
  details?: unknown;
}

/**
 * Create an HTTPException with a structured error code
 */
export function createError(
  code: ErrorCode,
  customMessage?: string,
  details?: unknown,
): HTTPException {
  const status = ErrorStatusCodes[code] as ContentfulStatusCode;
  const message = customMessage || ErrorMessages[code];

  return new HTTPException(status, {
    message,
    cause: { code, details } as HeliosErrorCause,
  });
}

/**
 * Create a JSON error response object (for use in routes that return directly)
 */
export function errorResponse(
  code: ErrorCode,
  customMessage?: string,
  details?: unknown,
): ErrorResponse {
  return {
    error: {
      code,
      message: customMessage || ErrorMessages[code],
      ...(details !== undefined && { details }),
    },
  };
}

/**
 * Global error handler for Hono application
 */
export function errorHandler(err: Error, c: Context): Response {
  console.error("Error:", err);

  if (err instanceof HTTPException) {
    const cause = err.cause as HeliosErrorCause | undefined;

    // If we have a structured error code from createError(), use it
    if (cause?.code) {
      // Prefer details over errors; errors is a legacy field for validation errors
      const details = cause.details ?? cause.errors;
      const response: ErrorResponse = {
        error: {
          code: cause.code,
          message: err.message,
          ...(details !== undefined && { details }),
        },
      };
      return c.json(response, err.status);
    }

    // Legacy HTTPException without error code - try to infer from status
    const code = inferErrorCodeFromStatus(err.status);
    const response: ErrorResponse = {
      error: {
        code,
        message: err.message,
        ...(cause?.errors !== undefined && { details: cause.errors }),
      },
    };
    return c.json(response, err.status);
  }

  // Unknown error - return generic internal error
  const response: ErrorResponse = {
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: ErrorMessages[ErrorCodes.INTERNAL_ERROR],
    },
  };

  return c.json(response, 500);
}

/**
 * Infer an error code from HTTP status for legacy errors
 */
function inferErrorCodeFromStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCodes.VALIDATION_FAILED;
    case 401:
      return ErrorCodes.AUTH_INVALID_KEY;
    case 404:
      return ErrorCodes.TASK_NOT_FOUND;
    case 429:
      return ErrorCodes.RATE_LIMIT_EXCEEDED;
    default:
      return ErrorCodes.INTERNAL_ERROR;
  }
}

// Re-export error codes for convenience
export { ErrorCodes, ErrorMessages, ErrorStatusCodes, type ErrorCode };
