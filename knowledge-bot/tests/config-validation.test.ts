import { describe, it, expect } from "vitest";
import { validateProviderConnection } from "../src/config.js";

describe("Config - Provider Connection Validation", () => {
  it("should return error for ollama when server is not reachable", async () => {
    const result = await validateProviderConnection({
      llmProvider: "ollama",
      apiKey: "",
      model: "llama3",
      dbPath: ":memory:",
      ollamaBaseUrl: "http://localhost:99999",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("ollama");
  });

  it("should return error for gemini with invalid API key", async () => {
    const result = await validateProviderConnection({
      llmProvider: "gemini",
      apiKey: "",
      model: "gemini-2.0-flash",
      dbPath: ":memory:",
      ollamaBaseUrl: "",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API key");
  });

  it("should return error for openai with invalid API key", async () => {
    const result = await validateProviderConnection({
      llmProvider: "openai",
      apiKey: "",
      model: "gpt-4o-mini",
      dbPath: ":memory:",
      ollamaBaseUrl: "",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API key");
  });
});
