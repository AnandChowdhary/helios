import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const containerDir = join(__dirname, "../../container");

describe("Container", () => {
  describe("Dockerfile", () => {
    const dockerfilePath = join(containerDir, "Dockerfile");

    it("exists", () => {
      expect(existsSync(dockerfilePath)).toBe(true);
    });

    it("uses Node.js 22 base image", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("FROM node:22-slim");
    });

    it("installs required dependencies", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("git");
      expect(content).toContain("curl");
      expect(content).toContain("jq");
    });

    it("installs Claude Code", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("@anthropic-ai/claude-code");
    });

    it("creates non-root user for security", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("useradd");
      expect(content).toContain("USER claude");
    });

    it("sets up workspace directory", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("/workspace");
      expect(content).toContain("WORKDIR /workspace");
    });

    it("copies and sets entrypoint", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("COPY");
      expect(content).toContain("entrypoint.sh");
      expect(content).toContain("ENTRYPOINT");
    });
  });

  describe("entrypoint.sh", () => {
    const entrypointPath = join(containerDir, "entrypoint.sh");

    it("exists", () => {
      expect(existsSync(entrypointPath)).toBe(true);
    });

    it("has proper shebang", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content.startsWith("#!/bin/bash")).toBe(true);
    });

    it("uses strict mode", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("validates required environment variables", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("ANTHROPIC_API_KEY");
      expect(content).toContain("REPO_URL");
      expect(content).toContain("PROMPT");
    });

    it("outputs structured JSON events", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("log_event");
      // Check for JSON output structure in the log_event function
      // The bash script uses escaped quotes: \"type\"
      expect(content).toContain('\\"type\\":');
      expect(content).toContain('\\"data\\":');
    });

    it("handles git token securely", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("GIT_TOKEN");
      // Token should be embedded in URL, not logged
      expect(content).not.toContain('echo "$GIT_TOKEN"');
    });

    it("runs Claude Code with required flags", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("--dangerously-skip-permissions");
      expect(content).toContain("--model");
      expect(content).toContain("--max-turns");
      expect(content).toContain("--output-format");
      expect(content).toContain("stream-json");
    });

    it("supports timeout configuration", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("TIMEOUT");
      // The timeout command uses -k flag to forcefully kill after 10s if SIGTERM doesn't work
      expect(content).toContain('timeout -k 10 "$timeout_secs"');
    });

    it("handles task status events", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      // The update_status function updates status file and logs status events
      expect(content).toContain("update_status");
      // Check that all status types are used
      expect(content).toMatch(/update_status\s+"cloning"/);
      expect(content).toMatch(/update_status\s+"running"/);
      expect(content).toMatch(/update_status\s+"completed"/);
      expect(content).toMatch(/update_status\s+"failed"/);
    });

    it("collects git diff results", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("git diff");
      expect(content).toContain("filesChanged");
    });

    it("starts HTTP server for Cloudflare Containers communication", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      // Should start the HTTP server in background
      expect(content).toContain("node /server.mjs");
      expect(content).toContain("HTTP_SERVER_PID");
    });

    it("writes results to file for HTTP server", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      // Should write results to /tmp/result.json for HTTP server to serve
      expect(content).toContain("RESULT_FILE");
      expect(content).toContain("write_result");
    });

    it("writes status to file for HTTP server", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      // Should write status to /tmp/status.json for HTTP server to serve
      expect(content).toContain("STATUS_FILE");
    });
  });

  describe("server.mjs", () => {
    const serverPath = join(containerDir, "server.mjs");

    it("exists", () => {
      expect(existsSync(serverPath)).toBe(true);
    });

    it("has proper shebang for Node.js", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
    });

    it("exposes health endpoint", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content).toContain("/health");
    });

    it("exposes result endpoint", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content).toContain("/result");
    });

    it("exposes status endpoint", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content).toContain("/status");
    });

    it("reads result from /tmp/result.json", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content).toContain("/tmp/result.json");
    });

    it("uses port 8080 by default", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content).toContain("8080");
    });

    it("handles graceful shutdown", () => {
      const content = readFileSync(serverPath, "utf-8");
      expect(content).toContain("SIGTERM");
      expect(content).toContain("SIGINT");
    });
  });
});
