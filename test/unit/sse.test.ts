import { describe, it, expect, vi } from "vitest";
import {
  parseSSEEvent,
  parseSSEData,
  processSSEStream,
} from "../../src/utils/sse";

describe("SSE Utilities", () => {
  describe("parseSSEEvent", () => {
    it("extracts event type from event: line", () => {
      expect(parseSSEEvent("event: message")).toBe("message");
      expect(parseSSEEvent("event: complete")).toBe("complete");
      expect(parseSSEEvent("event: error")).toBe("error");
    });

    it("trims whitespace from event type", () => {
      expect(parseSSEEvent("event:   status  ")).toBe("status");
    });

    it("returns null for non-event lines", () => {
      expect(parseSSEEvent("data: hello")).toBeNull();
      expect(parseSSEEvent("")).toBeNull();
      expect(parseSSEEvent("random text")).toBeNull();
    });
  });

  describe("parseSSEData", () => {
    it("extracts data from data: line", () => {
      expect(parseSSEData("data: hello")).toBe("hello");
      expect(parseSSEData('data: {"key":"value"}')).toBe('{"key":"value"}');
    });

    it("preserves leading/trailing whitespace in data", () => {
      expect(parseSSEData("data:   spaced data  ")).toBe("  spaced data  ");
    });

    it("returns null for non-data lines", () => {
      expect(parseSSEData("event: message")).toBeNull();
      expect(parseSSEData("")).toBeNull();
      expect(parseSSEData("random text")).toBeNull();
    });
  });

  describe("processSSEStream", () => {
    function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let index = 0;

      return new ReadableStream({
        pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(encoder.encode(chunks[index]));
            index++;
          } else {
            controller.close();
          }
        },
      });
    }

    it("processes single SSE event", async () => {
      const stream = createMockStream([
        "event: message\ndata: hello world\n\n",
      ]);
      const events: Array<{ event: string; data: string }> = [];

      await processSSEStream(stream, {
        onEvent: async (event, data) => {
          events.push({ event, data });
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ event: "message", data: "hello world" });
    });

    it("processes multiple SSE events", async () => {
      const stream = createMockStream([
        "event: status\ndata: starting\n\nevent: message\ndata: processing\n\nevent: complete\ndata: done\n\n",
      ]);
      const events: Array<{ event: string; data: string }> = [];

      await processSSEStream(stream, {
        onEvent: async (event, data) => {
          events.push({ event, data });
        },
      });

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ event: "status", data: "starting" });
      expect(events[1]).toEqual({ event: "message", data: "processing" });
      expect(events[2]).toEqual({ event: "complete", data: "done" });
    });

    it("handles chunked data correctly", async () => {
      // Data split across chunks
      const stream = createMockStream([
        "event: mess",
        "age\ndata: hello",
        " world\n\n",
      ]);
      const events: Array<{ event: string; data: string }> = [];

      await processSSEStream(stream, {
        onEvent: async (event, data) => {
          events.push({ event, data });
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ event: "message", data: "hello world" });
    });

    it("uses default event type 'message' when not specified", async () => {
      const stream = createMockStream(["data: no event type\n\n"]);
      const events: Array<{ event: string; data: string }> = [];

      await processSSEStream(stream, {
        onEvent: async (event, data) => {
          events.push({ event, data });
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ event: "message", data: "no event type" });
    });

    it("skips heartbeats when skipHeartbeats is true", async () => {
      const stream = createMockStream([
        "event: heartbeat\ndata: ping\n\nevent: message\ndata: actual data\n\n",
      ]);
      const mockLogManager = {
        addLog: vi.fn().mockResolvedValue(undefined),
      };

      await processSSEStream(stream, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logManager: mockLogManager as any,
        skipHeartbeats: true,
        onEvent: async () => {},
      });

      // Should only log the 'message' event, not 'heartbeat'
      expect(mockLogManager.addLog).toHaveBeenCalledTimes(1);
      expect(mockLogManager.addLog).toHaveBeenCalledWith("message", "actual data");
    });

    it("logs all events when skipHeartbeats is false", async () => {
      const stream = createMockStream([
        "event: heartbeat\ndata: ping\n\nevent: message\ndata: actual data\n\n",
      ]);
      const mockLogManager = {
        addLog: vi.fn().mockResolvedValue(undefined),
      };

      await processSSEStream(stream, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logManager: mockLogManager as any,
        skipHeartbeats: false,
        onEvent: async () => {},
      });

      expect(mockLogManager.addLog).toHaveBeenCalledTimes(2);
      expect(mockLogManager.addLog).toHaveBeenCalledWith("heartbeat", "ping");
      expect(mockLogManager.addLog).toHaveBeenCalledWith("message", "actual data");
    });

    it("processes remaining buffer after stream ends", async () => {
      // No trailing newlines
      const stream = createMockStream(["event: message\ndata: final"]);
      const events: Array<{ event: string; data: string }> = [];

      await processSSEStream(stream, {
        onEvent: async (event, data) => {
          events.push({ event, data });
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ event: "message", data: "final" });
    });
  });
});
