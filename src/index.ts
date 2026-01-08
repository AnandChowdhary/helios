import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", cors());
app.use("*", logger());

// Health check (public)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// TODO: Add auth middleware and routes
app.get("/", (c) => {
  return c.json({
    name: "Helios",
    description: "Cloud Claude Code API Service",
    version: "0.1.0",
    docs: "https://github.com/AnandChowdhary/helios",
  });
});

export default app;
