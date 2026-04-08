import { describe, it, expect } from "vitest";
import { createLLMProvider } from "../src/llm/factory.js";
import { AppConfig } from "../src/config.js";

describe("LLM Provider Factory", () => {
  it("should create a Gemini provider", () => {
    const config: AppConfig = {
      llmProvider: "gemini",
      apiKey: "test-key",
      model: "gemini-2.0-flash",
      dbPath: ":memory:",
    };

    const provider = createLLMProvider(config);
    expect(provider.name).toBe("gemini");
  });

  it("should create an OpenAI provider", () => {
    const config: AppConfig = {
      llmProvider: "openai",
      apiKey: "test-key",
      model: "gpt-4o-mini",
      dbPath: ":memory:",
    };

    const provider = createLLMProvider(config);
    expect(provider.name).toBe("openai");
  });

  it("should throw for unsupported provider", () => {
    const config = {
      llmProvider: "unsupported" as any,
      apiKey: "test-key",
      model: "model",
      dbPath: ":memory:",
    };

    expect(() => createLLMProvider(config)).toThrow("Unsupported LLM provider");
  });
});
