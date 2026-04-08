import { describe, it, expect } from "vitest";
import { createLLMProvider } from "../src/llm/factory.js";
import { AppConfig } from "../src/config.js";
import { OllamaProvider } from "../src/llm/ollama.js";

describe("Ollama Provider", () => {
  it("should be created by factory with provider type ollama", () => {
    const config: AppConfig = {
      llmProvider: "ollama",
      apiKey: "",
      model: "llama3",
      dbPath: ":memory:",
      ollamaBaseUrl: "http://localhost:11434",
    };

    const provider = createLLMProvider(config);
    expect(provider.name).toBe("ollama");
  });

  it("should use default base URL when not specified", () => {
    const provider = new OllamaProvider("llama3");
    expect(provider.name).toBe("ollama");
  });

  it("should accept custom base URL", () => {
    const provider = new OllamaProvider("llama3", "http://192.168.1.100:11434");
    expect(provider.name).toBe("ollama");
  });
});
