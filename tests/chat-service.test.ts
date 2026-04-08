import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChatService } from "../src/service/chat-service.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { MemoryDB } from "../src/db/memory-db.js";
import { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider.js";

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public mockResponse: string = "I understand. Let me help you with that.";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return { content: this.mockResponse };
  }
}

describe("ChatService", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;
  let mockLLM: MockLLMProvider;
  let service: ChatService;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
    mockLLM = new MockLLMProvider();
    service = new ChatService(mockLLM, manager);
  });

  afterEach(() => {
    db.close();
  });

  describe("handleChat", () => {
    it("should create a new session when no sessionId is provided", async () => {
      const result = await service.handleChat({ message: "Hello" });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.length).toBeGreaterThan(0);
      expect(result.reply).toBe("I understand. Let me help you with that.");
      expect(result.metadata?.isNewSession).toBe(true);
    });

    it("should reuse session when sessionId is provided", async () => {
      const first = await service.handleChat({ message: "Hello" });
      const second = await service.handleChat({
        message: "Follow up",
        sessionId: first.sessionId,
      });

      expect(second.sessionId).toBe(first.sessionId);
      expect(second.metadata?.isNewSession).toBeUndefined();
    });

    it("should return reply from agent", async () => {
      mockLLM.mockResponse = "That's a great question about databases!";

      const result = await service.handleChat({ message: "Tell me about our DB" });

      expect(result.reply).toBe("That's a great question about databases!");
    });

    it("should preserve conversation history across calls with same sessionId", async () => {
      mockLLM.mockResponse = "First response";
      const first = await service.handleChat({ message: "First message" });

      mockLLM.mockResponse = "Second response referencing first";
      const second = await service.handleChat({
        message: "Second message",
        sessionId: first.sessionId,
      });

      expect(second.reply).toBe("Second response referencing first");
    });

    it("should create a new agent for unknown sessionId", async () => {
      const result = await service.handleChat({
        message: "Hello",
        sessionId: "non-existent-session-id",
      });

      // Should create a new session with the provided ID
      expect(result.sessionId).toBe("non-existent-session-id");
      expect(result.reply).toBeDefined();
    });

    it("should handle /iam command through chat service", async () => {
      // First create a person in the DB
      db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });

      const result = await service.handleChat({ message: "/iam Alice" });

      expect(result.reply).toContain("Alice");
      expect(result.metadata?.user).toBe("Alice");
    });

    it("should track user identity across messages in same session", async () => {
      db.createPerson({ name: "Bob", role: "dev", tags: ["frontend"] });

      const first = await service.handleChat({ message: "/iam Bob" });
      expect(first.metadata?.user).toBe("Bob");

      mockLLM.mockResponse = "Got it, Bob!";
      const second = await service.handleChat({
        message: "What do I work on?",
        sessionId: first.sessionId,
      });

      expect(second.metadata?.user).toBe("Bob");
    });

    it("should handle multiple concurrent sessions independently", async () => {
      mockLLM.mockResponse = "Response for session A";
      const sessionA = await service.handleChat({ message: "Hello from A" });

      mockLLM.mockResponse = "Response for session B";
      const sessionB = await service.handleChat({ message: "Hello from B" });

      expect(sessionA.sessionId).not.toBe(sessionB.sessionId);
    });
  });

  describe("getAgent", () => {
    it("should return undefined for unknown session", () => {
      const agent = service.getAgent("unknown");
      expect(agent).toBeUndefined();
    });

    it("should return agent for known session", async () => {
      const result = await service.handleChat({ message: "Hello" });
      const agent = service.getAgent(result.sessionId);
      expect(agent).toBeDefined();
    });
  });
});
