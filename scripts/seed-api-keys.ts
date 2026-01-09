#!/usr/bin/env tsx
/**
 * Seed API Keys Script
 *
 * Generates a new Helios API key and stores it in Cloudflare KV.
 *
 * Usage:
 *   npm run seed-keys                    # Generate key for production
 *   npm run seed-keys -- --env staging   # Generate key for staging
 *   npm run seed-keys -- --name "My Key" # Custom key name
 */

import { execSync } from "child_process";
import { createHash, randomBytes } from "crypto";

interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  createdAt: string;
  rateLimit: number;
  enabled: boolean;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  // Generate 24 random bytes and encode as base64url
  const randomPart = randomBytes(24).toString("base64url");
  return `hlx_${randomPart}`;
}

function parseArgs(): { env?: string; name?: string } {
  const args = process.argv.slice(2);
  const result: { env?: string; name?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) {
      result.env = args[i + 1];
      i++;
    } else if (args[i] === "--name" && args[i + 1]) {
      result.name = args[i + 1];
      i++;
    }
  }

  return result;
}

async function seedApiKeys() {
  const { env, name } = parseArgs();

  console.log("\n🔑 Generating Helios API Key...\n");

  // Generate the API key
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyId = `key_${Date.now()}`;

  const keyData: ApiKey = {
    id: keyId,
    name: name || `API Key ${new Date().toISOString().split("T")[0]}`,
    keyHash,
    createdAt: new Date().toISOString(),
    rateLimit: 60, // 60 requests per minute
    enabled: true,
  };

  // Build wrangler command
  const envFlag = env ? `--env ${env}` : "";
  const keyDataJson = JSON.stringify(keyData);

  // Use wrangler to store the key in KV
  // The key hash is used as the KV key (matching auth middleware lookup)
  const command =
    `npx wrangler kv key put "${keyHash}" '${keyDataJson}' --binding=API_KEYS --remote ${envFlag}`.trim();

  console.log(`Environment: ${env || "production"}`);
  console.log(`Key ID: ${keyId}`);
  console.log(`Key Name: ${keyData.name}`);
  console.log(`Rate Limit: ${keyData.rateLimit} requests/minute`);
  console.log("\nStoring key in Cloudflare KV...\n");

  try {
    execSync(command, { stdio: "inherit" });

    console.log("\n" + "=".repeat(50));
    console.log("           HELIOS API KEY CREATED");
    console.log("=".repeat(50));
    console.log("");
    console.log(`  API Key: ${apiKey}`);
    console.log(`  Key ID:  ${keyId}`);
    console.log("");
    console.log("  ⚠️  Store this securely - it cannot be retrieved later!");
    console.log("");
    console.log("=".repeat(50));
    console.log("");

    // Print usage example
    const baseUrl =
      env === "staging"
        ? "https://helios-staging.getelysium.workers.dev"
        : "https://helios.getelysium.workers.dev";

    console.log("Test with:");
    console.log(
      `  curl -H "Authorization: Bearer ${apiKey}" ${baseUrl}/health`
    );
    console.log("");
  } catch (error) {
    console.error("\n❌ Failed to store API key in KV");
    console.error("Make sure you are logged in to wrangler:");
    console.error("  npx wrangler login");
    console.error("");
    process.exit(1);
  }
}

seedApiKeys().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
