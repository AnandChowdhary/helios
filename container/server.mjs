#!/usr/bin/env node
/**
 * Simple HTTP server for Cloudflare Containers communication.
 *
 * Exposes:
 * - GET /health - Returns container health status
 * - GET /result - Returns task execution result (from /tmp/result.json)
 * - GET /status - Returns current task status (from /tmp/status.json)
 * - GET /logs - Server-Sent Events stream of task logs (from /tmp/task.log)
 *
 * This server runs on port 8080 (Cloudflare Containers default port).
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, watch } from "node:fs";

const PORT = process.env.PORT || 8080;
const RESULT_FILE = "/tmp/result.json";
const STATUS_FILE = "/tmp/status.json";
const LOG_FILE = "/tmp/task.log";

/**
 * Read JSON file safely, returning null if not found or invalid.
 */
async function readJsonFile(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Send JSON response.
 */
function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Stream logs via Server-Sent Events.
 * Reads existing log content and then watches for new lines.
 */
async function streamLogs(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Track bytes read to avoid re-sending
  let bytesRead = 0;
  let closed = false;

  res.on("close", () => {
    closed = true;
  });

  // Function to read and send new log content
  async function sendNewContent() {
    if (closed || !existsSync(LOG_FILE)) return;

    try {
      const stats = await stat(LOG_FILE);
      if (stats.size > bytesRead) {
        const content = await readFile(LOG_FILE, "utf-8");
        const newContent = content.slice(bytesRead);
        bytesRead = content.length;

        // Send each line as an SSE event
        const lines = newContent.split("\n").filter(Boolean);
        for (const line of lines) {
          if (closed) return;
          try {
            // Try to parse as JSON to determine event type
            const parsed = JSON.parse(line);
            const eventType = parsed.type || "message";
            res.write(`event: ${eventType}\n`);
            res.write(`data: ${JSON.stringify(parsed.data || parsed)}\n\n`);
          } catch {
            // Not JSON, send as plain log
            res.write(`event: log\n`);
            res.write(`data: ${JSON.stringify({ message: line })}\n\n`);
          }
        }
      }
    } catch {
      // File not ready yet, ignore
    }
  }

  // Send initial content
  await sendNewContent();

  // Watch for file changes
  let watcher = null;
  if (existsSync(LOG_FILE)) {
    try {
      watcher = watch(LOG_FILE, async () => {
        await sendNewContent();
      });
    } catch {
      // Fallback to polling if watch fails
    }
  }

  // Also poll for the result file to know when to end the stream
  const pollInterval = setInterval(async () => {
    if (closed) {
      clearInterval(pollInterval);
      if (watcher) watcher.close();
      return;
    }

    // Send any new log content
    await sendNewContent();

    // Check if result is ready
    if (existsSync(RESULT_FILE)) {
      try {
        const result = await readJsonFile(RESULT_FILE);
        if (result) {
          res.write(`event: complete\n`);
          res.write(`data: ${JSON.stringify(result)}\n\n`);
          clearInterval(pollInterval);
          if (watcher) watcher.close();
          res.end();
        }
      } catch {
        // Result not ready yet
      }
    }
  }, 500);

  // Timeout after 10 minutes
  setTimeout(() => {
    if (!closed) {
      clearInterval(pollInterval);
      if (watcher) watcher.close();
      res.write(`event: timeout\n`);
      res.write(`data: ${JSON.stringify({ error: "Stream timeout" })}\n\n`);
      res.end();
    }
  }, 600000);
}

/**
 * HTTP request handler.
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check endpoint
  if (url.pathname === "/health") {
    sendJson(res, {
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Task result endpoint
  if (url.pathname === "/result") {
    const result = await readJsonFile(RESULT_FILE);
    if (result === null) {
      sendJson(res, { error: "Result not yet available" }, 404);
      return;
    }
    sendJson(res, result);
    return;
  }

  // Task status endpoint
  if (url.pathname === "/status") {
    const status = await readJsonFile(STATUS_FILE);
    if (status === null) {
      sendJson(res, { status: "starting", message: "Task is starting" });
      return;
    }
    sendJson(res, status);
    return;
  }

  // SSE logs streaming endpoint
  if (url.pathname === "/logs") {
    await streamLogs(res);
    return;
  }

  // Unknown endpoint
  sendJson(res, { error: "Not found" }, 404);
}

// Create and start the server
const server = createServer(handleRequest);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// Handle graceful shutdown
function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
