import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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
      expect(content).toContain('timeout "$timeout"');
    });

    it("handles task status events", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      // The log_status function outputs status events
      expect(content).toContain("log_status");
      // Check that all status types are used
      expect(content).toMatch(/log_status\s+"cloning"/);
      expect(content).toMatch(/log_status\s+"running"/);
      expect(content).toMatch(/log_status\s+"completed"/);
      expect(content).toMatch(/log_status\s+"failed"/);
    });

    it("collects git diff results", () => {
      const content = readFileSync(entrypointPath, "utf-8");
      expect(content).toContain("git diff");
      expect(content).toContain("filesChanged");
    });
  });
});
