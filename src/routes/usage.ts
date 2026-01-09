import { Hono } from "hono";
import type { Env, ApiKey } from "../types";
import {
  getUsageSummary,
  getCurrentMonthUsage,
  getDateKey,
  getFirstOfMonth,
} from "../services/usage";

export const usageRouter = new Hono<{ Bindings: Env }>();

const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DATE_RANGE_DAYS = 90;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function isValidDateFormat(dateStr: string): boolean {
  if (!DATE_FORMAT_REGEX.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

usageRouter.get("/", async (c) => {
  const apiKey = c.get("apiKey") as ApiKey;
  const startParam = c.req.query("start");
  const endParam = c.req.query("end");

  if (!startParam && !endParam) {
    const usage = await getCurrentMonthUsage(c.env, apiKey.id);
    return c.json(usage);
  }

  const now = new Date();
  const startDate = startParam || getFirstOfMonth(now);
  const endDate = endParam || getDateKey(now);

  if (!isValidDateFormat(startDate)) {
    return c.json(
      { error: { message: "Invalid start date format. Use YYYY-MM-DD." } },
      400,
    );
  }

  if (!isValidDateFormat(endDate)) {
    return c.json(
      { error: { message: "Invalid end date format. Use YYYY-MM-DD." } },
      400,
    );
  }

  if (new Date(startDate) > new Date(endDate)) {
    return c.json(
      { error: { message: "Start date cannot be after end date." } },
      400,
    );
  }

  const daysDiff = Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_DAY,
  );
  if (daysDiff > MAX_DATE_RANGE_DAYS) {
    return c.json(
      { error: { message: "Date range cannot exceed 90 days." } },
      400,
    );
  }

  const usage = await getUsageSummary(c.env, apiKey.id, startDate, endDate);
  return c.json(usage);
});

usageRouter.get("/current", async (c) => {
  const apiKey = c.get("apiKey") as ApiKey;
  const usage = await getCurrentMonthUsage(c.env, apiKey.id);
  return c.json(usage);
});
