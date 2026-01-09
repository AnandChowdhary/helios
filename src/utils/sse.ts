import type { StreamingLogManager } from "./logs";

/**
 * Parses an SSE line and extracts the event type.
 * Returns the event type if this is an "event:" line, null otherwise.
 */
export function parseSSEEvent(line: string): string | null {
  if (line.startsWith("event: ")) {
    return line.slice(7).trim();
  }
  return null;
}

/**
 * Parses an SSE line and extracts the data payload.
 * Returns the data if this is a "data:" line, null otherwise.
 */
export function parseSSEData(line: string): string | null {
  if (line.startsWith("data: ")) {
    return line.slice(6);
  }
  return null;
}

/**
 * Processes a ReadableStream containing SSE data, parsing events and invoking
 * callbacks for each event.
 */
export async function processSSEStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    onEvent: (event: string, data: string) => Promise<void>;
    logManager?: StreamingLogManager;
    skipHeartbeats?: boolean;
  },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  const processLine = async (line: string) => {
    const eventType = parseSSEEvent(line);
    if (eventType !== null) {
      currentEvent = eventType;
      return;
    }

    const data = parseSSEData(line);
    if (data !== null) {
      // Log entry (skip heartbeats if requested)
      const skipLog = options.skipHeartbeats && currentEvent === "heartbeat";
      if (options.logManager && !skipLog) {
        await options.logManager.addLog(currentEvent, data);
      }

      await options.onEvent(currentEvent, data);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      await processLine(line);
    }
  }

  // Process any remaining content in buffer after stream ends
  if (buffer.trim()) {
    const remainingLines = buffer.split("\n");
    for (const line of remainingLines) {
      await processLine(line);
    }
  }
}
