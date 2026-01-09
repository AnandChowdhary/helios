import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  eslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        crypto: "readonly",
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
        Date: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Uint8Array: "readonly",
        Array: "readonly",
        JSON: "readonly",
        Map: "readonly",
        Promise: "readonly",
        Error: "readonly",
        KVNamespace: "readonly",
        R2Bucket: "readonly",
        Queue: "readonly",
        RequestInit: "readonly",
        MessageBatch: "readonly",
        Message: "readonly",
        DurableObjectNamespace: "readonly",
        DurableObjectStub: "readonly",
        setTimeout: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
        WebSocketPair: "readonly",
        ArrayBuffer: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-unused-vars": "off",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "coverage/"],
  },
];
