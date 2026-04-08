import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, createTestConfig } from "../src/config.js";

describe("Config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadConfig", () => {
    it("should load gemini config when GEMINI_API_KEY is set", () => {
      process.env.LLM_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "test-gemini-key";
      delete process.env.LLM_MODEL;

      const config = loadConfig();
      expect(config.llmProvider).toBe("gemini");
      expect(config.apiKey).toBe("test-gemini-key");
      expect(config.model).toBe("gemini-2.0-flash");
    });

    it("should load openai config when provider is openai", () => {
      process.env.LLM_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "test-openai-key";
      delete process.env.LLM_MODEL;

      const config = loadConfig();
      expect(config.llmProvider).toBe("openai");
      expect(config.apiKey).toBe("test-openai-key");
      expect(config.model).toBe("gpt-4o-mini");
    });

    it("should use custom model when LLM_MODEL is set", () => {
      process.env.LLM_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "key";
      process.env.LLM_MODEL = "gemini-1.5-pro";

      const config = loadConfig();
      expect(config.model).toBe("gemini-1.5-pro");
    });

    it("should use custom DB path when DB_PATH is set", () => {
      process.env.LLM_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = "key";
      process.env.DB_PATH = "/custom/path.db";

      const config = loadConfig();
      expect(config.dbPath).toBe("/custom/path.db");
    });

    it("should load ollama config without requiring API key", () => {
      process.env.LLM_PROVIDER = "ollama";
      delete process.env.LLM_MODEL;

      const config = loadConfig();
      expect(config.llmProvider).toBe("ollama");
      expect(config.apiKey).toBe("");
      expect(config.model).toBe("llama3");
      expect(config.ollamaBaseUrl).toBe("http://localhost:11434");
    });

    it("should use custom OLLAMA_BASE_URL when set", () => {
      process.env.LLM_PROVIDER = "ollama";
      process.env.OLLAMA_BASE_URL = "http://192.168.1.50:11434";

      const config = loadConfig();
      expect(config.ollamaBaseUrl).toBe("http://192.168.1.50:11434");
    });

    it("should throw on unsupported provider", () => {
      process.env.LLM_PROVIDER = "anthropic";
      expect(() => loadConfig()).toThrow("Unsupported LLM provider");
    });

    it("should throw when API key is missing for cloud providers", () => {
      process.env.LLM_PROVIDER = "gemini";
      delete process.env.GEMINI_API_KEY;

      expect(() => loadConfig()).toThrow("Missing API key");
    });
  });

  describe("createTestConfig", () => {
    it("should return default test config", () => {
      const config = createTestConfig();
      expect(config.llmProvider).toBe("gemini");
      expect(config.apiKey).toBe("test-key");
      expect(config.dbPath).toBe(":memory:");
    });

    it("should allow overrides", () => {
      const config = createTestConfig({ llmProvider: "openai", model: "gpt-4" });
      expect(config.llmProvider).toBe("openai");
      expect(config.model).toBe("gpt-4");
      expect(config.dbPath).toBe(":memory:"); // default preserved
    });
  });
});
