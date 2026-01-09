#!/usr/bin/env node
/**
 * Simple HTTP server for Cloudflare Containers communication.
 *
 * Exposes:
 * - GET /health - Returns container health status
 * - GET /result - Returns task execution result (from /tmp/result.json)
 * - GET /status - Returns current task status (from /tmp/status.json)
 * - GET /logs - Server-Sent Events stream of task logs (from /tmp/task.log)
 * - POST /push - Push changes to remote repository
 *
 * This server runs on port 8080 (Cloudflare Containers default port).
 */

import { exec } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const PORT = process.env.PORT || 8080;
const RESULT_FILE = "/tmp/result.json";
const STATUS_FILE = "/tmp/status.json";
const LOG_FILE = "/tmp/task.log";
const REPO_DIR = "/workspace/repo";
const PUSH_RESULT_FILE = "/tmp/push_result.json";

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
 * Read request body as JSON.
 */
async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Execute a shell command and return output.
 */
function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { ...options, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

/**
 * Handle push request - pushes changes to remote repository.
 * Expects POST body with:
 * - branch: target branch name
 * - credentials: { type: "token", value: "..." }
 * - createPR: boolean
 * - prTitle: string (optional)
 * - prBody: string (optional)
 */
async function handlePush(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    sendJson(res, { error: "Method not allowed" }, 405);
    return;
  }

  // Check if repo directory exists
  if (!existsSync(REPO_DIR)) {
    sendJson(
      res,
      { error: "Repository not found. Task may not have completed." },
      400
    );
    return;
  }

  // Parse request body
  let body;
  try {
    body = await readRequestBody(req);
  } catch (e) {
    sendJson(res, { error: "Invalid request body" }, 400);
    return;
  }

  const { branch, credentials, createPR, prTitle, prBody } = body;

  // Validate required fields
  if (!branch || typeof branch !== "string") {
    sendJson(res, { error: "Missing or invalid 'branch' field" }, 400);
    return;
  }

  if (!credentials?.value) {
    sendJson(res, { error: "Missing git credentials" }, 400);
    return;
  }

  const gitToken = credentials.value;
  const repoUrl = process.env.REPO_URL;

  if (!repoUrl) {
    sendJson(res, { error: "Repository URL not configured" }, 500);
    return;
  }

  try {
    // Change to repo directory
    process.chdir(REPO_DIR);

    // Check if there are changes to push
    const status = await execCommand("git status --porcelain");
    const hasUncommittedChanges = status.length > 0;

    // Stage and commit any uncommitted changes
    if (hasUncommittedChanges) {
      await execCommand("git add -A");
      await execCommand('git commit -m "Helios task changes"');
    }

    // Get current branch
    const currentBranch = await execCommand("git branch --show-current");

    // Rename branch if different from target
    if (currentBranch !== branch) {
      await execCommand(`git branch -m "${branch}"`);
    }

    // Configure remote with token
    const remoteUrlWithToken = repoUrl.replace(
      "https://",
      `https://${gitToken}@`
    );
    await execCommand(`git remote set-url origin "${remoteUrlWithToken}"`);

    // Push to remote
    await execCommand(`git push -u origin "${branch}" --force 2>&1`);

    const result = {
      success: true,
      branch,
      pushed: true,
      message: `Successfully pushed to branch: ${branch}`,
    };

    // Create PR if requested (GitHub only for now)
    if (createPR && repoUrl.includes("github.com")) {
      try {
        const prResult = await createGitHubPR({
          repoUrl,
          token: gitToken,
          branch,
          title: prTitle || `Helios: ${branch}`,
          body: prBody || "Changes made by Helios Claude Code task.",
        });
        result.pullRequest = prResult;
      } catch (prError) {
        result.pullRequestError = prError.message;
      }
    }

    // Store result
    await writeFile(PUSH_RESULT_FILE, JSON.stringify(result));
    sendJson(res, result);
  } catch (error) {
    const errorResult = {
      success: false,
      error: error.message,
    };
    await writeFile(PUSH_RESULT_FILE, JSON.stringify(errorResult));
    sendJson(res, errorResult, 500);
  }
}

/**
 * Create a GitHub pull request using the GitHub API.
 */
async function createGitHubPR({ repoUrl, token, branch, title, body }) {
  // Extract owner and repo from URL
  // Format: https://github.com/owner/repo.git or https://github.com/owner/repo
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) {
    throw new Error("Could not parse GitHub repository URL");
  }

  const [, owner, repo] = match;

  // Get the default branch
  const repoInfoResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Helios-Bot",
      },
    }
  );

  if (!repoInfoResponse.ok) {
    throw new Error(
      `Failed to get repository info: ${repoInfoResponse.status}`
    );
  }

  const repoInfo = await repoInfoResponse.json();
  const baseBranch = repoInfo.default_branch;

  // Create the pull request
  const prResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Helios-Bot",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        head: branch,
        base: baseBranch,
      }),
    }
  );

  if (!prResponse.ok) {
    const errorText = await prResponse.text();
    throw new Error(`Failed to create PR: ${prResponse.status} - ${errorText}`);
  }

  const pr = await prResponse.json();
  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
  };
}

/**
 * Stream logs via Server-Sent Events.
 * Reads existing log content and then watches for new lines.
 */
async function streamLogs(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
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

  // Track if we've seen a terminal status
  let statusCompletedCount = 0;
  let lastHeartbeat = Date.now();

  // Also poll for the result file to know when to end the stream
  const pollInterval = setInterval(async () => {
    if (closed) {
      clearInterval(pollInterval);
      if (watcher) watcher.close();
      return;
    }

    // Send any new log content
    await sendNewContent();

    // Send heartbeat every 15 seconds to keep connection alive
    const now = Date.now();
    if (now - lastHeartbeat >= 15000) {
      lastHeartbeat = now;
      res.write(`event: heartbeat\n`);
      res.write(
        `data: ${JSON.stringify({
          timestamp: new Date().toISOString(),
          message: "Connection alive",
        })}\n\n`
      );
    }

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
          return;
        }
      } catch {
        // Result not ready yet
      }
    }

    // Fallback: Check status file for completion
    // If status indicates done but no result file, wait a bit then generate result
    if (existsSync(STATUS_FILE)) {
      try {
        const status = await readJsonFile(STATUS_FILE);
        if (
          status &&
          (status.status === "completed" || status.status === "failed")
        ) {
          statusCompletedCount++;

          // Wait a few polls for result file to appear
          if (statusCompletedCount >= 3) {
            // Generate a result from status if result file still missing
            const fallbackResult = {
              success: status.status === "completed",
              summary: status.message || `Task ${status.status}`,
              error:
                status.status === "failed"
                  ? status.message || "Task failed"
                  : undefined,
              filesChanged: [],
              usage: { inputTokens: 0, outputTokens: 0 },
            };
            res.write(`event: complete\n`);
            res.write(`data: ${JSON.stringify(fallbackResult)}\n\n`);
            clearInterval(pollInterval);
            if (watcher) watcher.close();
            res.end();
            return;
          }
        }
      } catch {
        // Status not ready yet
      }
    }
  }, 500);

  // Timeout after 10 minutes
  setTimeout(() => {
    if (!closed) {
      clearInterval(pollInterval);
      if (watcher) watcher.close();
      // Send as 'error' event type so clients recognize it as terminal
      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({
          code: "STREAM_TIMEOUT",
          message: "Stream timeout after 10 minutes",
        })}\n\n`
      );
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

  // Raw logs endpoint (returns accumulated log file content)
  if (url.pathname === "/logs/raw") {
    if (!existsSync(LOG_FILE)) {
      sendJson(res, { error: "Logs not yet available" }, 404);
      return;
    }
    try {
      const content = await readFile(LOG_FILE, "utf-8");
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(content);
    } catch (e) {
      sendJson(res, { error: "Failed to read log file" }, 500);
    }
    return;
  }

  // Push changes to remote
  if (url.pathname === "/push") {
    await handlePush(req, res);
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
