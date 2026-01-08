import { describe, it, expect } from "vitest";
import { CreateTaskSchema } from "../src/schemas/task";

describe("CreateTaskSchema", () => {
  const validInput = {
    prompt: "Fix the bug in authentication",
    repository: {
      url: "https://github.com/user/repo",
      branch: "main",
    },
    claude: {
      apiKey: "sk-ant-test-key",
      model: "claude-sonnet-4-5",
    },
  };

  it("validates a complete valid input", () => {
    const result = CreateTaskSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("validates with default branch", () => {
    const input = {
      ...validInput,
      repository: { url: "https://github.com/user/repo" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repository.branch).toBe("main");
    }
  });

  it("rejects empty prompt", () => {
    const input = { ...validInput, prompt: "" };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-supported repository URLs", () => {
    const input = {
      ...validInput,
      repository: { url: "https://example.com/repo" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts GitHub URLs", () => {
    const input = {
      ...validInput,
      repository: { url: "https://github.com/owner/repo" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts GitLab URLs", () => {
    const input = {
      ...validInput,
      repository: { url: "https://gitlab.com/owner/repo" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts Bitbucket URLs", () => {
    const input = {
      ...validInput,
      repository: { url: "https://bitbucket.org/owner/repo" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid branch names", () => {
    const input = {
      ...validInput,
      repository: { url: "https://github.com/user/repo", branch: "invalid branch!" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts valid branch names with slashes", () => {
    const input = {
      ...validInput,
      repository: { url: "https://github.com/user/repo", branch: "feature/new-feature" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects invalid API key format", () => {
    const input = {
      ...validInput,
      claude: { ...validInput.claude, apiKey: "invalid-key" },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("validates optional webhook config", () => {
    const input = {
      ...validInput,
      output: {
        mode: "async" as const,
        webhook: {
          url: "https://example.com/webhook",
          secret: "a-secret-that-is-16-chars",
        },
      },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects webhook with short secret", () => {
    const input = {
      ...validInput,
      output: {
        mode: "async" as const,
        webhook: {
          url: "https://example.com/webhook",
          secret: "short",
        },
      },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("validates optional settings", () => {
    const input = {
      ...validInput,
      options: {
        timeout: 60,
        allowedTools: ["Read", "Write"],
        workingDirectory: "/app",
      },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects timeout below minimum", () => {
    const input = {
      ...validInput,
      options: { timeout: 10 },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects timeout above maximum", () => {
    const input = {
      ...validInput,
      options: { timeout: 1000 },
    };
    const result = CreateTaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
