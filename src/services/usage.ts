import type { Env, DailyUsage, UsageSummary, Task } from "../types";

// Cost per 1M tokens (Claude Sonnet 4.5 pricing)
const INPUT_TOKEN_COST_PER_MILLION = 3.0; // $3 per 1M input tokens
const OUTPUT_TOKEN_COST_PER_MILLION = 15.0; // $15 per 1M output tokens

/**
 * Get a date in YYYY-MM-DD format
 */
export function getDateKey(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

/**
 * Get the first day of the month in YYYY-MM-DD format
 */
export function getFirstOfMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Get the KV key for a specific API key and date
 */
function getUsageKey(apiKeyId: string, date: string): string {
  return `${apiKeyId}:${date}`;
}

/**
 * Create an empty DailyUsage object for initialization
 */
function createEmptyDailyUsage(apiKeyId: string, date: string): DailyUsage {
  return {
    apiKeyId,
    date,
    requests: 0,
    tasksCreated: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    tasksCancelled: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalDurationMs: 0,
  };
}

/**
 * Get usage data for a specific API key and date
 */
export async function getDailyUsage(
  env: Env,
  apiKeyId: string,
  date: string,
): Promise<DailyUsage> {
  const key = getUsageKey(apiKeyId, date);
  const usage = await env.USAGE.get<DailyUsage>(key, "json");
  return usage ?? createEmptyDailyUsage(apiKeyId, date);
}

/**
 * Update daily usage with atomic increment operations
 */
async function updateDailyUsage(
  env: Env,
  apiKeyId: string,
  updates: Partial<Omit<DailyUsage, "apiKeyId" | "date"> & { date?: string }>,
): Promise<void> {
  const date = updates.date ?? getDateKey();
  const key = getUsageKey(apiKeyId, date);

  // Get current usage
  const current = await getDailyUsage(env, apiKeyId, date);

  // Apply updates
  const updated: DailyUsage = {
    ...current,
    requests: current.requests + (updates.requests ?? 0),
    tasksCreated: current.tasksCreated + (updates.tasksCreated ?? 0),
    tasksCompleted: current.tasksCompleted + (updates.tasksCompleted ?? 0),
    tasksFailed: current.tasksFailed + (updates.tasksFailed ?? 0),
    tasksCancelled: current.tasksCancelled + (updates.tasksCancelled ?? 0),
    inputTokens: current.inputTokens + (updates.inputTokens ?? 0),
    outputTokens: current.outputTokens + (updates.outputTokens ?? 0),
    totalDurationMs: current.totalDurationMs + (updates.totalDurationMs ?? 0),
  };

  // Store with 90-day expiration
  await env.USAGE.put(key, JSON.stringify(updated), {
    expirationTtl: 86400 * 90,
  });
}

/**
 * Track an API request
 */
export async function trackRequest(env: Env, apiKeyId: string): Promise<void> {
  await updateDailyUsage(env, apiKeyId, { requests: 1 });
}

/**
 * Track task creation
 */
export async function trackTaskCreated(
  env: Env,
  apiKeyId: string,
): Promise<void> {
  await updateDailyUsage(env, apiKeyId, { tasksCreated: 1 });
}

/**
 * Track task completion with token usage and duration
 */
export async function trackTaskCompleted(
  env: Env,
  apiKeyId: string,
  task: Task,
): Promise<void> {
  const inputTokens = task.result?.usage?.inputTokens ?? 0;
  const outputTokens = task.result?.usage?.outputTokens ?? 0;

  // Calculate duration in milliseconds
  let durationMs = 0;
  if (task.startedAt && task.completedAt) {
    durationMs =
      new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
  }

  const status = task.status;
  const updates: Partial<Omit<DailyUsage, "apiKeyId" | "date">> = {
    inputTokens,
    outputTokens,
    totalDurationMs: durationMs,
  };

  if (status === "completed") {
    updates.tasksCompleted = 1;
  } else if (status === "failed") {
    updates.tasksFailed = 1;
  } else if (status === "cancelled") {
    updates.tasksCancelled = 1;
  }

  await updateDailyUsage(env, apiKeyId, updates);
}

/**
 * Calculate estimated cost based on token usage
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_TOKEN_COST_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_TOKEN_COST_PER_MILLION;
  return Math.round((inputCost + outputCost) * 100) / 100; // Round to 2 decimal places
}

/**
 * Get usage summary for a date range
 */
export async function getUsageSummary(
  env: Env,
  apiKeyId: string,
  startDate: string,
  endDate: string,
): Promise<UsageSummary> {
  const daily: DailyUsage[] = [];

  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Iterate through each day
  const current = new Date(start);
  while (current <= end) {
    const dateKey = getDateKey(current);
    const usage = await getDailyUsage(env, apiKeyId, dateKey);
    // Only include days with activity
    if (
      usage.requests > 0 ||
      usage.tasksCreated > 0 ||
      usage.tasksCompleted > 0 ||
      usage.tasksFailed > 0 ||
      usage.tasksCancelled > 0
    ) {
      daily.push(usage);
    }
    current.setDate(current.getDate() + 1);
  }

  // Calculate totals
  const totals = {
    requests: 0,
    tasksCreated: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    tasksCancelled: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalDurationMs: 0,
    estimatedCost: 0,
  };

  for (const day of daily) {
    totals.requests += day.requests;
    totals.tasksCreated += day.tasksCreated;
    totals.tasksCompleted += day.tasksCompleted;
    totals.tasksFailed += day.tasksFailed;
    totals.tasksCancelled += day.tasksCancelled;
    totals.inputTokens += day.inputTokens;
    totals.outputTokens += day.outputTokens;
    totals.totalDurationMs += day.totalDurationMs;
  }

  totals.estimatedCost = calculateCost(totals.inputTokens, totals.outputTokens);

  return {
    apiKeyId,
    period: {
      start: startDate,
      end: endDate,
    },
    totals,
    daily,
  };
}

/**
 * Get usage for the current month
 */
export async function getCurrentMonthUsage(
  env: Env,
  apiKeyId: string,
): Promise<UsageSummary> {
  const now = new Date();
  return getUsageSummary(env, apiKeyId, getFirstOfMonth(now), getDateKey(now));
}
