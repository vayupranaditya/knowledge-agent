import OpenAI from "openai";
import { LLMProvider, LLMMessage, LLMResponse, withRetry } from "./provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
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
