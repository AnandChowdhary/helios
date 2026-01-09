import type { Env } from "../types";

/**
 * Configuration for streaming log manager
 */
export interface StreamingLogConfig {
  /** Flush interval in milliseconds (default: 5000ms / 5 seconds) */
  flushIntervalMs?: number;
  /** Maximum buffer size before forced flush (default: 50 entries) */
  maxBufferSize?: number;
}

/**
 * Metadata stored with logs in R2
 */
export interface LogMetadata {
  taskId: string;
  createdAt: string;
  updatedAt: string;
  lineCount: string;
  status: "streaming" | "complete";
}

/**
 * Manages real-time log streaming to R2.
 * Accumulates logs in a buffer and periodically flushes to R2.
 */
export class StreamingLogManager {
  private env: Env;
  private taskId: string;
  private buffer: string[] = [];
  private allLogs: string[] = [];
  private flushIntervalMs: number;
  private maxBufferSize: number;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private createdAt: string;
  private isFinalized: boolean = false;

  constructor(env: Env, taskId: string, config: StreamingLogConfig = {}) {
    this.env = env;
    this.taskId = taskId;
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;
    this.maxBufferSize = config.maxBufferSize ?? 50;
    this.createdAt = new Date().toISOString();
    this.startFlushTimer();
  }

  /**
   * Adds a log entry to the buffer.
   * Automatically flushes if buffer exceeds maxBufferSize.
   */
  async addLog(event: string, data: string): Promise<void> {
    if (this.isFinalized) return;

    const entry = formatLogEntry(event, data);
    this.buffer.push(entry);
    this.allLogs.push(entry);

    // Force flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Flushes the current buffer to R2.
   * Does incremental append by reading existing content and appending new logs.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isFinalized) return;

    const newContent = this.buffer.join("\n");
    this.buffer = [];

    try {
      await this.writeToR2(newContent, "streaming");
    } catch (error) {
      console.error(`Failed to flush logs for task ${this.taskId}:`, error);
      // Put the logs back in the buffer to retry later
      this.buffer.unshift(...newContent.split("\n"));
    }
  }

  /**
   * Finalizes the log stream - flushes any remaining logs
   * and marks the log file as complete.
   */
  async finalize(): Promise<void> {
    if (this.isFinalized) return;

    this.isFinalized = true;
    this.stopFlushTimer();

    const newContent = this.buffer.length > 0 ? this.buffer.join("\n") : null;
    this.buffer = [];

    try {
      await this.writeToR2(newContent, "complete");
    } catch (error) {
      console.error(`Failed to finalize logs for task ${this.taskId}:`, error);
      await this.fallbackWrite();
    }
  }

  /**
   * Writes content to R2, appending to existing logs if present.
   */
  private async writeToR2(
    newContent: string | null,
    status: "streaming" | "complete",
  ): Promise<void> {
    const existing = await this.env.ARTIFACTS.get(`${this.taskId}/logs.txt`);

    let fullContent: string;
    if (existing) {
      const existingText = await existing.text();
      fullContent = newContent
        ? existingText + "\n" + newContent
        : existingText;
    } else if (newContent) {
      fullContent = newContent;
    } else {
      return;
    }

    const lineCount = fullContent
      .split("\n")
      .filter((line) => line.trim()).length;

    await this.env.ARTIFACTS.put(`${this.taskId}/logs.txt`, fullContent, {
      customMetadata: {
        taskId: this.taskId,
        createdAt: this.createdAt,
        updatedAt: new Date().toISOString(),
        lineCount: lineCount.toString(),
        status,
      },
    });
  }

  /**
   * Fallback: Write all in-memory logs if incremental writes failed
   */
  private async fallbackWrite(): Promise<void> {
    if (this.allLogs.length === 0) return;

    const content = this.allLogs.join("\n");
    const lineCount = content.split("\n").filter((line) => line.trim()).length;

    try {
      await this.env.ARTIFACTS.put(`${this.taskId}/logs.txt`, content, {
        customMetadata: {
          taskId: this.taskId,
          createdAt: this.createdAt,
          updatedAt: new Date().toISOString(),
          lineCount: lineCount.toString(),
          status: "complete",
        },
      });
    } catch (error) {
      console.error(`Fallback write failed for task ${this.taskId}:`, error);
    }
  }

  /**
   * Starts the periodic flush timer using recursive setTimeout for compatibility
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;
    const scheduleFlush = () => {
      if (this.isFinalized) return;
      this.flushTimer = setTimeout(() => {
        this.flush()
          .catch((error) => {
            console.error(
              `Periodic flush failed for task ${this.taskId}:`,
              error,
            );
          })
          .finally(() => {
            if (!this.isFinalized) {
              scheduleFlush();
            }
          });
      }, this.flushIntervalMs);
    };
    scheduleFlush();
  }

  /**
   * Stops the periodic flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      globalThis.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Gets the current number of buffered logs
   */
  get bufferedCount(): number {
    return this.buffer.length;
  }

  /**
   * Gets the total number of logs collected
   */
  get totalCount(): number {
    return this.allLogs.length;
  }
}

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
      updatedAt: new Date().toISOString(),
      lineCount: lineCount.toString(),
      status: "complete",
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

/**
 * Gets log metadata from R2 without downloading the full log file.
 *
 * @param env - Worker environment with ARTIFACTS R2 binding
 * @param taskId - Unique task identifier
 * @returns Log metadata or null if not found
 */
export async function getLogMetadata(
  env: Env,
  taskId: string,
): Promise<LogMetadata | null> {
  const object = await env.ARTIFACTS.head(`${taskId}/logs.txt`);
  if (!object) return null;

  return {
    taskId: object.customMetadata?.taskId ?? taskId,
    createdAt: object.customMetadata?.createdAt ?? "",
    updatedAt: object.customMetadata?.updatedAt ?? "",
    lineCount: object.customMetadata?.lineCount ?? "0",
    status:
      (object.customMetadata?.status as "streaming" | "complete") ?? "complete",
  };
}
