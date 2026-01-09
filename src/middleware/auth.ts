import { createMiddleware } from "hono/factory";
import type { Env, ApiKey } from "../types";
import { createError, ErrorCodes } from "../utils/errors";

declare module "hono" {
  interface ContextVariableMap {
    apiKey: ApiKey;
  }
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const authMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw createError(ErrorCodes.AUTH_MISSING_KEY);
    }

    const apiKey = authHeader.slice(7);
    const keyHash = await hashApiKey(apiKey);

    const keyData = await c.env.API_KEYS.get<ApiKey>(keyHash, "json");

    if (!keyData) {
      throw createError(ErrorCodes.AUTH_INVALID_KEY);
    }

    if (!keyData.enabled) {
      throw createError(ErrorCodes.AUTH_DISABLED_KEY);
    }

    c.set("apiKey", keyData);

    await next();
  },
);

export { hashApiKey };
