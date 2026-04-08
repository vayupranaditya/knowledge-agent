import dotenv from "dotenv";

dotenv.config();

export type LLMProviderType = "gemini" | "openai" | "ollama";

export interface AppConfig {
  llmProvider: LLMProviderType;
  apiKey: string;
  model: string;
  dbPath: string;
  ollamaBaseUrl: string;
  port: number;
}

const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  ollama: "llama3",
};

const SUPPORTED_PROVIDERS: LLMProviderType[] = ["gemini", "openai", "ollama"];

export function loadConfig(): AppConfig {
  const provider = (process.env.LLM_PROVIDER || "gemini") as LLMProviderType;

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported LLM provider: ${provider}. Use one of: ${SUPPORTED_PROVIDERS.join(", ")}`
    );
  }

  // Ollama runs locally — no API key needed
  let apiKey = "";
  if (provider === "gemini") {
    apiKey = process.env.GEMINI_API_KEY || "";
  } else if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY || "";
  }

  if ((provider === "gemini" || provider === "openai") && !apiKey) {
    throw new Error(
      `Missing API key. Set ${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} in .env`
    );
  }

  const model = process.env.LLM_MODEL || DEFAULT_MODELS[provider];
  const dbPath = process.env.DB_PATH || "./data/knowledge.db";
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const port = parseInt(process.env.PORT || "3000", 10);

  return { llmProvider: provider, apiKey, model, dbPath, ollamaBaseUrl, port };
}

export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    llmProvider: "gemini",
    apiKey: "test-key",
    model: "test-model",
    dbPath: ":memory:",
    ollamaBaseUrl: "http://localhost:11434",
    port: 3000,
    ...overrides,
  };
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate that the configured LLM provider is reachable before starting the app.
 */
export async function validateProviderConnection(config: AppConfig): Promise<ValidationResult> {
  if (config.llmProvider === "ollama") {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        return { ok: false, error: `Could not reach ollama at ${config.ollamaBaseUrl} (HTTP ${res.status})` };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: `Could not reach ollama at ${config.ollamaBaseUrl}. Is Ollama running?` };
    }
  }

  if (config.llmProvider === "gemini" || config.llmProvider === "openai") {
    if (!config.apiKey) {
      return { ok: false, error: `Missing API key for ${config.llmProvider}` };
    }
    return { ok: true };
  }

  return { ok: false, error: `Unknown provider: ${config.llmProvider}` };
}
