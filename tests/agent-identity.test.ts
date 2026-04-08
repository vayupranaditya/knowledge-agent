import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeAgent } from "../src/agent/agent.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { MemoryDB } from "../src/db/memory-db.js";
import { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider.js";

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public lastMessages: LLMMessage[] = [];
  public mockResponse: string = "Hello!";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    this.lastMessages = messages;
    return { content: this.mockResponse };
  }
}

describe("KnowledgeAgent - Identity & People", () => {
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

  describe("identity tracking", () => {
    it("should start with no current user", () => {
      expect(agent.getCurrentUser()).toBeNull();
    });

    it("should set current user via /iam command", async () => {
      // Person doesn't exist yet, agent should ask LLM to greet
      mockLLM.mockResponse = "Nice to meet you! What's your role on the team?";
      const response = await agent.chat("/iam Alice");
      expect(response).toContain("role");
    });

    it("should recognize returning user via /iam command", async () => {
      db.createPerson({ name: "Alice", role: "backend engineer", tags: ["API"] });

      const response = await agent.chat("/iam Alice");
      expect(response).toContain("Alice");
      expect(agent.getCurrentUser()).toBe("Alice");
    });
  });

  describe("/people command", () => {
    it("should list all known people", async () => {
      db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });
      db.createPerson({ name: "Bob", role: "PM", tags: ["product"] });

      const response = await agent.chat("/people");
      expect(response).toContain("Alice");
      expect(response).toContain("Bob");
      expect(response).toContain("engineer");
      expect(response).toContain("PM");
    });

    it("should show message when no people registered", async () => {
      const response = await agent.chat("/people");
      expect(response).toContain("No team members");
    });
  });

  describe("/unverified command", () => {
    it("should list unverified knowledge entries", async () => {
      db.createUnverified({
        topic: "api",
        subtopic: "versioning",
        content: "We use header-based versioning",
        source: "someone",
        contradicts_entry_id: null,
      });

      const response = await agent.chat("/unverified");
      expect(response).toContain("header-based versioning");
    });

    it("should show message when no unverified entries exist", async () => {
      const response = await agent.chat("/unverified");
      expect(response).toContain("No unverified");
    });
  });

  describe("updated /help command", () => {
    it("should include new commands in help", async () => {
      const response = await agent.chat("/help");
      expect(response).toContain("/iam");
      expect(response).toContain("/people");
      expect(response).toContain("/unverified");
    });
  });

  describe("updated /stats command", () => {
    it("should include people and unverified counts", async () => {
      db.createPerson({ name: "Alice", role: "dev", tags: [] });
      db.createUnverified({
        topic: "t", subtopic: "s", content: "c", source: "u",
        contradicts_entry_id: null,
      });
      manager.store({ topic: "a", subtopic: "b", content: "c", source: "u" });

      const response = await agent.chat("/stats");
      expect(response).toContain("Team members: 1");
      expect(response).toContain("Unverified entries: 1");
    });
  });

  describe("context prompt includes current user info", () => {
    it("should include current user identity in LLM context", async () => {
      db.createPerson({ name: "Alice", role: "backend engineer", tags: ["API", "database"] });
      agent.chat("/iam Alice");

      mockLLM.mockResponse = "Sure, I can help with that.";
      await agent.chat("Tell me about our API");

      const systemMsg = mockLLM.lastMessages.find((m) => m.role === "system");
      expect(systemMsg).toBeDefined();
      expect(systemMsg!.content).toContain("Alice");
      expect(systemMsg!.content).toContain("backend engineer");
    });
  });

  describe("knowledge extraction with authority", () => {
    it("should process store action with authority check via JSON block", async () => {
      db.createPerson({ name: "Alice", role: "DBA", tags: ["database"] });
      await agent.chat("/iam Alice");

      mockLLM.mockResponse = `Got it, storing that.

\`\`\`json
{"action":"store","topic":"database","subtopic":"indexing","content":"We use partial indexes on large tables","source":"Alice"}
\`\`\``;

      await agent.chat("We use partial indexes on large tables");

      // Should be stored as trusted since Alice has authority over database
      const entries = manager.listAll();
      expect(entries.length).toBe(1);
      expect(entries[0].content).toContain("partial indexes");
    });

    it("should handle red flag action from JSON block", async () => {
      manager.store({
        topic: "testing",
        subtopic: "coverage",
        content: "We require 80% code coverage",
        source: "QA Lead",
      });

      const existing = manager.listAll()[0];

      mockLLM.mockResponse = `Hmm, that's quite different from what I know. Let me flag this for review.

\`\`\`json
{"action":"red_flag","topic":"testing","subtopic":"coverage","content":"No coverage requirements exist","source":"someone","contradicts_entry_id":"${existing.id}"}
\`\`\``;

      await agent.chat("We don't have any coverage requirements");

      // Should be in unverified
      const unverified = db.getAllUnverified();
      expect(unverified.length).toBe(1);

      // Original should still be trusted
      expect(manager.getById(existing.id)).toBeDefined();
    });
  });
});
