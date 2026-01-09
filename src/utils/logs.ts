import type { Env } from "../types";

/**
 * Stores task logs to R2 with metadata.
 *
 * @param env - Worker environment with ARTIFACTS R2 binding
 * @param taskId - Unique task identifier
 * @param logs - Log content as string or array of log lines
 */
export async function storeLogsToR2(
  env: Env,
  taskId: string,
  logs: string | string[],
): Promise<void> {
  const content = Array.isArray(logs) ? logs.join("\n") : logs;
  if (!content) return;

  const lineCount = content.split("\n").filter((line) => line.trim()).length;
  await env.ARTIFACTS.put(`${taskId}/logs.txt`, content, {
    customMetadata: {
      taskId,
      createdAt: new Date().toISOString(),
      lineCount: lineCount.toString(),
    },
  });
}

/**
 * Creates a formatted log entry with timestamp and event type.
 *
 * @param event - Event type (e.g., "error", "message", "complete")
 * @param data - Log data/message
 * @returns Formatted log entry string
 */
export function formatLogEntry(event: string, data: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${event}] ${data}`;
}
