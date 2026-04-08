import OpenAI from "openai";
import { LLMProvider, LLMMessage, LLMResponse, withRetry } from "./provider.js";

/**
 * Ollama provider using the OpenAI-compatible API.
 * Ollama serves at /v1 with the same chat completions format.
 * No API key required for local usage.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  private client: OpenAI;
  private model: string;

  constructor(model: string = "llama3", baseUrl: string = "http://localhost:11434") {
    this.client = new OpenAI({
      apiKey: "ollama",
      baseURL: `${baseUrl}/v1`,
    });
    this.model = model;
  }

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return withRetry(async () => {
      const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        allMessages.push({ role: "system", content: systemPrompt });
      }

      for (const msg of messages) {
        if (msg.role === "system") continue;
        allMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages,
      });

      const choice = response.choices[0];
      return {
        content: choice?.message?.content || "",
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens ?? 0,
            }
          : undefined,
      };
    });
  }
}
