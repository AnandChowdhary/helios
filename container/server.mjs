#!/usr/bin/env node
/**
 * Simple HTTP server for Cloudflare Containers communication.
 *
 * Exposes:
 * - GET /health - Returns container health status
 * - GET /result - Returns task execution result (from /tmp/result.json)
 * - GET /status - Returns current task status (from /tmp/status.json)
 *
 * This server runs on port 8080 (Cloudflare Containers default port).
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const PORT = process.env.PORT || 8080;
const RESULT_FILE = "/tmp/result.json";
const STATUS_FILE = "/tmp/status.json";

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
