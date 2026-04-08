export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Retry wrapper with exponential backoff for LLM API calls.
 * Handles rate limits (429) and transient errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 2000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = message.includes("429") || message.includes("Too Many Requests") || message.includes("quota");
      const isTransient = message.includes("503") || message.includes("500") || message.includes("ECONNRESET");

      if (attempt === maxRetries || (!isRateLimit && !isTransient)) {
        break;
      }

      // Parse retry delay from error if available
      const retryMatch = message.match(/retry in (\d+(?:\.\d+)?)s/i);
      const retryDelaySec = retryMatch ? parseFloat(retryMatch[1]) : 0;
      const delayMs = retryDelaySec > 0
        ? retryDelaySec * 1000
        : baseDelayMs * Math.pow(2, attempt);

      const waitSec = (delayMs / 1000).toFixed(1);
      console.error(`Rate limited. Retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
