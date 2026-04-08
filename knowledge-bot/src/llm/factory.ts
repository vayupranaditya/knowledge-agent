import { AppConfig } from "../config.js";
import { LLMProvider } from "./provider.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAIProvider } from "./openai.js";
import { OllamaProvider } from "./ollama.js";

export function createLLMProvider(config: AppConfig): LLMProvider {
  switch (config.llmProvider) {
    case "gemini":
      return new GeminiProvider(config.apiKey, config.model);
    case "openai":
      return new OpenAIProvider(config.apiKey, config.model);
    case "ollama":
      return new OllamaProvider(config.model, config.ollamaBaseUrl);
    default:
      throw new Error(`Unsupported LLM provider: ${config.llmProvider}`);
  }
}
