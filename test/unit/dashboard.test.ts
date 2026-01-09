import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { dashboardRouter } from "../../src/routes/dashboard";

describe("Dashboard Route", () => {
  const app = new Hono();
  app.route("/dashboard", dashboardRouter);

  it("serves the dashboard HTML at /dashboard", async () => {
    const res = await app.request("/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("contains required dashboard elements", async () => {
    const res = await app.request("/dashboard");
    const html = await res.text();

    // Check for key dashboard elements
    expect(html).toContain("Helios Dashboard");
    expect(html).toContain("apiKeyInput");
    expect(html).toContain("tasksPanel");
    expect(html).toContain("usagePanel");
  });

  it("includes API connection functionality", async () => {
    const res = await app.request("/dashboard");
    const html = await res.text();

    // Check for API connection code
    expect(html).toContain("setApiKey");
    expect(html).toContain("Authorization");
    expect(html).toContain("Bearer");
  });

  it("includes task viewing functionality", async () => {
    const res = await app.request("/dashboard");
    const html = await res.text();

    // Check for task functions
    expect(html).toContain("viewTask");
    expect(html).toContain("cancelTask");
    expect(html).toContain("viewLogs");
    expect(html).toContain("viewDiff");
  });

  it("includes usage tracking functionality", async () => {
    const res = await app.request("/dashboard");
    const html = await res.text();

    // Check for usage functions
    expect(html).toContain("loadUsage");
    expect(html).toContain("usageChart");
    expect(html).toContain("estimatedCost");
  });

  it("includes proper styling", async () => {
    const res = await app.request("/dashboard");
    const html = await res.text();

    // Check for dark theme styling
    expect(html).toContain("background:");
    expect(html).toContain("color:");
    expect(html).toContain(".status-badge");
    expect(html).toContain(".stat-card");
  });

  it("stores API key in localStorage", async () => {
    const res = await app.request("/dashboard");
    const html = await res.text();

    // Check for localStorage usage
    expect(html).toContain("localStorage.getItem");
    expect(html).toContain("localStorage.setItem");
    expect(html).toContain("helios_api_key");
  });
});
