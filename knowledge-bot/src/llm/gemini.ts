import { GoogleGenerativeAI } from "@google/generative-ai";
import { LLMProvider, LLMMessage, LLMResponse, withRetry } from "./provider.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-2.0-flash") {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return withRetry(async () => {
      const genModel = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
      });

      const history = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const lastMessage = history.pop();
      if (!lastMessage) {
        throw new Error("No messages provided");
      }

      const chat = genModel.startChat({ history });
      const result = await chat.sendMessage(lastMessage.parts);
      const response = result.response;

      return {
        content: response.text(),
        usage: response.usageMetadata
          ? {
              inputTokens: response.usageMetadata.promptTokenCount ?? 0,
              outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
            }
          : undefined,
      };
    });
  }
}
