import { Hono } from "hono";
import type { Env, ApiKey } from "../types";
import { getUsageSummary, getCurrentMonthUsage } from "../services/usage";

export const usageRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /v1/usage
 *
 * Get usage summary for the authenticated API key.
 *
 * Query params:
 * - start: Start date (YYYY-MM-DD) - defaults to first day of current month
 * - end: End date (YYYY-MM-DD) - defaults to today
 *
 * Returns usage summary with totals and daily breakdown.
 */
usageRouter.get("/", async (c) => {
  const apiKey = c.get("apiKey") as ApiKey;
  const startParam = c.req.query("start");
  const endParam = c.req.query("end");

  // If no dates provided, get current month usage
  if (!startParam && !endParam) {
    const usage = await getCurrentMonthUsage(c.env, apiKey.id);
    return c.json(usage);
  }

  // Validate dates
  const now = new Date();
  const startDate = startParam || getFirstOfMonth(now);
  const endDate = endParam || getDateKey(now);

  // Validate date format
  if (!isValidDateFormat(startDate)) {
    return c.json(
      {
        error: {
          message: "Invalid start date format. Use YYYY-MM-DD.",
        },
      },
      400,
    );
  }

  if (!isValidDateFormat(endDate)) {
    return c.json(
      {
        error: {
          message: "Invalid end date format. Use YYYY-MM-DD.",
        },
      },
      400,
    );
  }

  // Validate date range
  if (new Date(startDate) > new Date(endDate)) {
    return c.json(
      {
        error: {
          message: "Start date cannot be after end date.",
        },
      },
      400,
    );
  }

  // Limit date range to 90 days
  const daysDiff = Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (daysDiff > 90) {
    return c.json(
      {
        error: {
          message: "Date range cannot exceed 90 days.",
        },
      },
      400,
    );
  }

  const usage = await getUsageSummary(c.env, apiKey.id, startDate, endDate);
  return c.json(usage);
});

/**
 * GET /v1/usage/current
 *
 * Get current month's usage summary for the authenticated API key.
 * Convenience endpoint equivalent to GET /v1/usage without date params.
 */
usageRouter.get("/current", async (c) => {
  const apiKey = c.get("apiKey") as ApiKey;
  const usage = await getCurrentMonthUsage(c.env, apiKey.id);
  return c.json(usage);
});

// Helper functions

function getDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getFirstOfMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function isValidDateFormat(dateStr: string): boolean {
  // Check format YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  // Check if it's a valid date
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}
