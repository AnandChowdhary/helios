import { Container } from "@cloudflare/containers";
import type { Env, TaskResult } from "../types";

/**
 * ClaudeRunner is a container-enabled Durable Object that runs Claude Code tasks.
 *
 * The container:
 * 1. Clones a repository
 * 2. Runs Claude Code with the provided prompt
 * 3. Collects results (diff, file changes)
 * 4. Exposes results via HTTP for the Worker to fetch
 *
 * Communication flow:
 * - Worker calls startAndWaitForPorts() with task config in envVars
 * - Container runs entrypoint.sh which executes Claude Code
 * - Container exposes port 8080 with a simple HTTP server for results
 * - Worker fetches results from /result endpoint
 */
export class ClaudeRunner extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "5m";
  enableInternet = true;

  override async onStart(): Promise<void> {
    console.log("ClaudeRunner container started");
  }

  override async onStop(): Promise<void> {
    console.log("ClaudeRunner container stopped");
  }

  override async onError(error: unknown): Promise<void> {
    console.error("ClaudeRunner container error:", error);
  }
}

/**
 * Starts a Claude Code task in a container and returns immediately.
 * The task runs asynchronously and results can be polled via getTaskResult().
 *
 * @param env - Worker environment with CLAUDE_RUNNER binding
 * @param taskId - Unique task identifier (used as container instance ID)
 * @param config - Task configuration including prompt, repo, and Claude settings
 */
export async function startContainerTask(
  env: Env,
  taskId: string,
  config: {
    prompt: string;
    repository: { url: string; branch: string };
    claude: { apiKey: string; model: string; maxTurns: number; systemPrompt?: string };
    options: { timeout: number };
    gitToken?: string;
  }
): Promise<void> {
  // Get or create a container instance for this task
  const containerId = env.CLAUDE_RUNNER.idFromName(taskId);
  const container = env.CLAUDE_RUNNER.get(containerId) as DurableObjectStub<ClaudeRunner>;

  // Start the container with task configuration as environment variables
  await container.startAndWaitForPorts({
    startOptions: {
      envVars: {
        TASK_ID: taskId,
        ANTHROPIC_API_KEY: config.claude.apiKey,
        REPO_URL: config.repository.url,
        REPO_BRANCH: config.repository.branch,
        GIT_TOKEN: config.gitToken || "",
        PROMPT: config.prompt,
        MODEL: config.claude.model,
        MAX_TURNS: config.claude.maxTurns.toString(),
        TIMEOUT: config.options.timeout.toString(),
        SYSTEM_PROMPT: config.claude.systemPrompt || "",
      },
      enableInternet: true,
    },
    ports: 8080,
    cancellationOptions: {
      // Wait up to 2 minutes for the container to start
      instanceGetTimeoutMS: 120000,
      // Wait up to 30 seconds for the port to be ready
      portReadyTimeoutMS: 30000,
    },
  });
}

/**
 * Gets the current state of a container task.
 *
 * @param env - Worker environment with CLAUDE_RUNNER binding
 * @param taskId - Unique task identifier
 * @returns Container state including status and exit code if stopped
 */
export async function getContainerState(
  env: Env,
  taskId: string
): Promise<{
  status: "running" | "stopping" | "stopped" | "healthy" | "stopped_with_code";
  exitCode?: number;
}> {
  const containerId = env.CLAUDE_RUNNER.idFromName(taskId);
  const container = env.CLAUDE_RUNNER.get(containerId) as DurableObjectStub<ClaudeRunner>;
  return container.getState();
}

/**
 * Fetches the result from a running or completed container task.
 *
 * @param env - Worker environment with CLAUDE_RUNNER binding
 * @param taskId - Unique task identifier
 * @returns Task result if available, or null if still running
 */
export async function getContainerResult(
  env: Env,
  taskId: string
): Promise<TaskResult | null> {
  const containerId = env.CLAUDE_RUNNER.idFromName(taskId);
  const container = env.CLAUDE_RUNNER.get(containerId) as DurableObjectStub<ClaudeRunner>;

  try {
    const response = await container.fetch(new Request("http://container/result"));
    if (!response.ok) {
      return null;
    }
    return await response.json() as TaskResult;
  } catch {
    return null;
  }
}

/**
 * Stops a running container task.
 *
 * @param env - Worker environment with CLAUDE_RUNNER binding
 * @param taskId - Unique task identifier
 */
export async function stopContainerTask(
  env: Env,
  taskId: string
): Promise<void> {
  const containerId = env.CLAUDE_RUNNER.idFromName(taskId);
  const container = env.CLAUDE_RUNNER.get(containerId) as DurableObjectStub<ClaudeRunner>;

  await container.stop();
}
