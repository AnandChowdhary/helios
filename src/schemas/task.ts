import { z } from "zod";

const OptionsSchema = z.object({
  timeout: z.number().int().min(30).max(600).default(300),
  allowedTools: z
    .array(z.string())
    .default(["Read", "Write", "Bash", "Glob", "Grep"]),
  workingDirectory: z.string().default("/workspace"),
  environment: z.record(z.string(), z.string()).optional(),
});

const OutputSchema = z.object({
  mode: z.enum(["sync", "async"]).default("sync"),
  webhook: z
    .object({
      url: z.string().url(),
      secret: z.string().min(16),
    })
    .optional(),
});

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1).max(100000),
  repository: z.object({
    url: z
      .string()
      .url()
      .refine(
        (url) =>
          /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)/.test(url),
        "Only GitHub, GitLab, and Bitbucket URLs are supported"
      ),
    branch: z
      .string()
      .max(100)
      .regex(/^[a-zA-Z0-9_\-/.]+$/, "Invalid branch name")
      .default("main"),
    credentials: z
      .object({
        type: z.literal("token"),
        value: z.string().min(1),
      })
      .optional(),
  }),
  claude: z.object({
    apiKey: z
      .string()
      .refine(
        (key) => key.startsWith("sk-ant-"),
        "Invalid Anthropic API key format"
      ),
    model: z
      .enum(["claude-sonnet-4-5", "claude-opus-4"])
      .default("claude-sonnet-4-5"),
    maxTurns: z.number().int().min(1).max(50).default(10),
    systemPrompt: z.string().max(10000).optional(),
  }),
  options: OptionsSchema.optional(),
  output: OutputSchema.optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
