import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { KnowledgeAgent } from "../src/agent/agent.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { MemoryDB } from "../src/db/memory-db.js";
import { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider.js";

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public lastMessages: LLMMessage[] = [];
  public mockResponse: string = "I understand. Let me help you with that.";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    this.lastMessages = messages;
    return { content: this.mockResponse };
  }
}

describe("KnowledgeAgent", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;
  let mockLLM: MockLLMProvider;
  let agent: KnowledgeAgent;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
    mockLLM = new MockLLMProvider();
    agent = new KnowledgeAgent(mockLLM, manager);
  });

  afterEach(() => {
    manager.close();
  });

  describe("commands", () => {
    it("should handle /help command", async () => {
      const response = await agent.chat("/help");
      expect(response).toContain("Available commands");
      expect(response).toContain("/db");
      expect(response).toContain("/prompt");
      expect(response).toContain("/stats");
      expect(response).toContain("/search");
    });

    it("should handle /db command with empty database", async () => {
      const response = await agent.chat("/db");
      expect(response).toContain("empty");
    });

    it("should handle /db command with entries", async () => {
      manager.store({
        topic: "auth",
        subtopic: "oauth",
        content: "We use OAuth 2.0",
        source: "user",
      });

      const response = await agent.chat("/inspect db");
      expect(response).toContain("auth");
      expect(response).toContain("oauth");
      expect(response).toContain("OAuth 2.0");
    });

    it("should handle /prompt command", async () => {
      const response = await agent.chat("/prompt");
      // Should return the system prompt content
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should handle /stats command", async () => {
      manager.store({ topic: "auth", subtopic: "jwt", content: "JWT tokens", source: "user" });
      manager.store({ topic: "deploy", subtopic: "k8s", content: "K8s cluster", source: "user" });

      const response = await agent.chat("/stats");
      expect(response).toContain("Total entries: 2");
      expect(response).toContain("auth");
      expect(response).toContain("deploy");
    });

    it("should handle /search command", async () => {
      manager.store({
        topic: "authentication",
        subtopic: "OAuth",
        content: "OAuth 2.0 with PKCE for mobile apps",
        source: "security",
      });

      const response = await agent.chat("/search OAuth");
      expect(response).toContain("OAuth");
    });

    it("should handle /search with no results", async () => {
      const response = await agent.chat("/search nonexistent");
      expect(response).toContain("No results");
    });

    it("should handle /store command", async () => {
      const response = await agent.chat("/store");
      expect(response).toContain("tell me something");
    });
  });

  describe("chat with LLM", () => {
    it("should send user message to LLM and return response", async () => {
      mockLLM.mockResponse = "That's interesting, I'll remember that.";

      const response = await agent.chat("Our API uses GraphQL with Apollo Server");
      expect(response).toBe("That's interesting, I'll remember that.");
      expect(mockLLM.lastMessages.length).toBeGreaterThan(0);
    });

    it("should include knowledge context in LLM messages", async () => {
      manager.store({
        topic: "api",
        subtopic: "graphql",
        content: "GraphQL API with Apollo Server",
        source: "backend",
      });

      mockLLM.mockResponse = "Based on the knowledge base, you use GraphQL.";

      await agent.chat("What API technology do we use?");

      // The system message should contain knowledge context
      const systemMsg = mockLLM.lastMessages.find((m) => m.role === "system");
      expect(systemMsg).toBeDefined();
      expect(systemMsg!.content).toContain("GraphQL");
    });

    it("should extract and store knowledge from LLM response with JSON block", async () => {
      mockLLM.mockResponse = `Got it, I'll store that information about your database setup.

\`\`\`json
{"action":"store","topic":"database","subtopic":"PostgreSQL","content":"PostgreSQL 16 with pgvector","source":"user"}
\`\`\``;

      await agent.chat("We use PostgreSQL 16 with pgvector for vector search");

      // Knowledge should have been stored
      const entries = manager.listAll();
      expect(entries.length).toBe(1);
      expect(entries[0].topic).toBe("database");
      expect(entries[0].content).toBe("PostgreSQL 16 with pgvector");
    });

    it("should maintain conversation history", async () => {
      mockLLM.mockResponse = "First response";
      await agent.chat("First message");

      mockLLM.mockResponse = "Second response";
      await agent.chat("Second message");

      // Should have both user messages and assistant responses in history
      const userMessages = mockLLM.lastMessages.filter((m) => m.role === "user");
      expect(userMessages.length).toBe(2);
    });
  });

  describe("getSystemPrompt", () => {
    it("should return the system prompt", () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe("string");
    });
  });

  describe("resetConversation", () => {
    it("should clear conversation history", async () => {
      mockLLM.mockResponse = "response";
      await agent.chat("message 1");
      await agent.chat("message 2");

      agent.resetConversation();

      await agent.chat("fresh message");

      const userMessages = mockLLM.lastMessages.filter((m) => m.role === "user");
      expect(userMessages.length).toBe(1);
      expect(userMessages[0].content).toBe("fresh message");
    });
  });
});
