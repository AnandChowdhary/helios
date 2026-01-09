/**
 * Structured error codes for the Helios API.
 * Each error code follows the format: CATEGORY_SPECIFIC_ERROR
 * Categories: AUTH, VALIDATION, RATE_LIMIT, TASK, STREAM, WEBHOOK, INTERNAL
 */

/**
 * Error code constants
 */
export const ErrorCodes = {
  // Authentication errors (401)
  AUTH_MISSING_KEY: "AUTH_MISSING_KEY",
  AUTH_INVALID_KEY: "AUTH_INVALID_KEY",
  AUTH_DISABLED_KEY: "AUTH_DISABLED_KEY",

  // Validation errors (400)
  VALIDATION_FAILED: "VALIDATION_FAILED",
  VALIDATION_INVALID_JSON: "VALIDATION_INVALID_JSON",
  VALIDATION_INVALID_PARAM: "VALIDATION_INVALID_PARAM",

  // Rate limiting errors (429)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  CONCURRENT_LIMIT_EXCEEDED: "CONCURRENT_LIMIT_EXCEEDED",

  // Task errors (400/404)
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  TASK_NOT_CANCELLABLE: "TASK_NOT_CANCELLABLE",
  TASK_TIMEOUT: "TASK_TIMEOUT",
  TASK_EXECUTION_FAILED: "TASK_EXECUTION_FAILED",
  TASK_CLONE_FAILED: "TASK_CLONE_FAILED",

  // Artifact errors (404)
  LOGS_NOT_FOUND: "LOGS_NOT_FOUND",
  DIFF_NOT_FOUND: "DIFF_NOT_FOUND",

  // Push errors (400/500)
  PUSH_NOT_COMPLETED: "PUSH_NOT_COMPLETED",
  PUSH_NO_CREDENTIALS: "PUSH_NO_CREDENTIALS",
  PUSH_FAILED: "PUSH_FAILED",

  // Stream errors (400/426)
  STREAM_UPGRADE_REQUIRED: "STREAM_UPGRADE_REQUIRED",
  STREAM_INVALID_JSON: "STREAM_INVALID_JSON",
  STREAM_VALIDATION_FAILED: "STREAM_VALIDATION_FAILED",
  STREAM_TASK_RUNNING: "STREAM_TASK_RUNNING",
  STREAM_ERROR: "STREAM_ERROR",

  // Webhook errors
  WEBHOOK_DELIVERY_FAILED: "WEBHOOK_DELIVERY_FAILED",

  // Internal errors (500)
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Human-readable error messages for each error code
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Authentication
  [ErrorCodes.AUTH_MISSING_KEY]: "Missing API key. Provide a valid API key in the Authorization header.",
  [ErrorCodes.AUTH_INVALID_KEY]: "Invalid API key. The provided API key does not exist.",
  [ErrorCodes.AUTH_DISABLED_KEY]: "API key is disabled. Contact support to re-enable your key.",

  // Validation
  [ErrorCodes.VALIDATION_FAILED]: "Request validation failed. Check the errors field for details.",
  [ErrorCodes.VALIDATION_INVALID_JSON]: "Invalid JSON in request body.",
  [ErrorCodes.VALIDATION_INVALID_PARAM]: "Invalid query parameter.",

  // Rate limiting
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: "Rate limit exceeded. Please wait before making more requests.",
  [ErrorCodes.CONCURRENT_LIMIT_EXCEEDED]: "Concurrent task limit exceeded. Wait for running tasks to complete.",

  // Task
  [ErrorCodes.TASK_NOT_FOUND]: "Task not found. The task may have expired or been deleted.",
  [ErrorCodes.TASK_NOT_CANCELLABLE]: "Task cannot be cancelled. Only pending or running tasks can be cancelled.",
  [ErrorCodes.TASK_TIMEOUT]: "Task timed out. The operation exceeded the maximum allowed duration.",
  [ErrorCodes.TASK_EXECUTION_FAILED]: "Task execution failed. Check the error details for more information.",
  [ErrorCodes.TASK_CLONE_FAILED]: "Failed to clone repository. Verify the URL and credentials.",

  // Artifacts
  [ErrorCodes.LOGS_NOT_FOUND]: "Logs not found. The task may still be running or logs may have expired.",
  [ErrorCodes.DIFF_NOT_FOUND]: "Diff not found. The task may not have made any changes.",

  // Push
  [ErrorCodes.PUSH_NOT_COMPLETED]: "Cannot push changes. The task has not completed successfully.",
  [ErrorCodes.PUSH_NO_CREDENTIALS]: "Cannot push changes. No git credentials were provided.",
  [ErrorCodes.PUSH_FAILED]: "Failed to push changes to remote repository.",

  // Stream
  [ErrorCodes.STREAM_UPGRADE_REQUIRED]: "WebSocket upgrade required. Use a WebSocket client to connect.",
  [ErrorCodes.STREAM_INVALID_JSON]: "Invalid JSON message received.",
  [ErrorCodes.STREAM_VALIDATION_FAILED]: "WebSocket message validation failed.",
  [ErrorCodes.STREAM_TASK_RUNNING]: "Task is already running. Cannot start a new execution.",
  [ErrorCodes.STREAM_ERROR]: "An error occurred during task streaming.",

  // Webhook
  [ErrorCodes.WEBHOOK_DELIVERY_FAILED]: "Failed to deliver webhook notification.",

  // Internal
  [ErrorCodes.INTERNAL_ERROR]: "An unexpected error occurred. Please try again later.",
};

/**
 * HTTP status codes for each error code
 */
export const ErrorStatusCodes: Record<ErrorCode, number> = {
  // Authentication (401)
  [ErrorCodes.AUTH_MISSING_KEY]: 401,
  [ErrorCodes.AUTH_INVALID_KEY]: 401,
  [ErrorCodes.AUTH_DISABLED_KEY]: 401,

  // Validation (400)
  [ErrorCodes.VALIDATION_FAILED]: 400,
  [ErrorCodes.VALIDATION_INVALID_JSON]: 400,
  [ErrorCodes.VALIDATION_INVALID_PARAM]: 400,

  // Rate limiting (429)
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCodes.CONCURRENT_LIMIT_EXCEEDED]: 429,

  // Task (400/404)
  [ErrorCodes.TASK_NOT_FOUND]: 404,
  [ErrorCodes.TASK_NOT_CANCELLABLE]: 400,
  [ErrorCodes.TASK_TIMEOUT]: 408,
  [ErrorCodes.TASK_EXECUTION_FAILED]: 500,
  [ErrorCodes.TASK_CLONE_FAILED]: 400,

  // Artifacts (404)
  [ErrorCodes.LOGS_NOT_FOUND]: 404,
  [ErrorCodes.DIFF_NOT_FOUND]: 404,

  // Push (400/500)
  [ErrorCodes.PUSH_NOT_COMPLETED]: 400,
  [ErrorCodes.PUSH_NO_CREDENTIALS]: 400,
  [ErrorCodes.PUSH_FAILED]: 500,

  // Stream (400/426)
  [ErrorCodes.STREAM_UPGRADE_REQUIRED]: 426,
  [ErrorCodes.STREAM_INVALID_JSON]: 400,
  [ErrorCodes.STREAM_VALIDATION_FAILED]: 400,
  [ErrorCodes.STREAM_TASK_RUNNING]: 409,
  [ErrorCodes.STREAM_ERROR]: 500,

  // Webhook (500 - internal, logged only)
  [ErrorCodes.WEBHOOK_DELIVERY_FAILED]: 500,

  // Internal (500)
  [ErrorCodes.INTERNAL_ERROR]: 500,
};
