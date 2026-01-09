import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import { validateBody } from "../../src/middleware/validate";
import { errorHandler, ErrorCodes } from "../../src/utils/errors";

interface ErrorBody {
  error: { code: string; message: string };
}

interface SuccessBody {
  success: boolean;
  data: { name: string; age: number; email?: string };
}

describe("validateBody middleware", () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().min(0),
    email: z.string().email().optional(),
  });

  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.onError(errorHandler);
    app.post("/test", validateBody(TestSchema), (c) => {
      const body = c.get("validatedBody");
      return c.json({ success: true, data: body });
    });
  });

  it("validates correct input and passes to handler", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "John", age: 30 }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ name: "John", age: 30 });
  });

  it("validates optional fields", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "John",
          age: 30,
          email: "john@example.com",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.data.email).toBe("john@example.com");
  });

  it("rejects invalid JSON", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_INVALID_JSON);
  });

  it("rejects missing required fields", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "John" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("rejects invalid field types", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "John", age: "not a number" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("rejects empty required string", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", age: 30 }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("rejects invalid email format", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "John", age: 30, email: "not-an-email" }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("rejects negative numbers when min is 0", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "John", age: -5 }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe(ErrorCodes.VALIDATION_FAILED);
  });

  it("handles empty body", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(400);
  });

  it("stores validated data in context", async () => {
    const res = await app.fetch(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Jane", age: 25 }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuccessBody;
    expect(body.data).toEqual({ name: "Jane", age: 25 });
  });
});
