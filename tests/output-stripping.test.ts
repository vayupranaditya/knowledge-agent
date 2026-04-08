import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeAgent } from "../src/agent/agent.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { MemoryDB } from "../src/db/memory-db.js";
import { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider.js";

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public mockResponse: string = "";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return { content: this.mockResponse };
  }
}

describe("Output Stripping", () => {
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

  it("should strip JSON action blocks from bot response", async () => {
    mockLLM.mockResponse = `Got it, I'll remember that your API uses GraphQL.

\`\`\`json
{"action":"store","topic":"api","subtopic":"graphql","content":"API uses GraphQL with Apollo","source":"user"}
\`\`\``;

    const response = await agent.chat("Our API uses GraphQL with Apollo");
    expect(response).not.toContain("```json");
    expect(response).not.toContain('"action"');
    expect(response).toContain("Got it");
  });

  it("should strip JSON block but preserve all other content", async () => {
    mockLLM.mockResponse = `Here's what I know about that topic.

Some detailed explanation here.

\`\`\`json
{"action":"store","topic":"test","subtopic":"sub","content":"c","source":"u"}
\`\`\``;

    const response = await agent.chat("Tell me something");
    expect(response).toContain("Here's what I know");
    expect(response).toContain("Some detailed explanation");
    expect(response).not.toContain("```json");
  });

  it("should return response as-is when no JSON block present", async () => {
    mockLLM.mockResponse = "Just a normal response with no actions.";

    const response = await agent.chat("Hello");
    expect(response).toBe("Just a normal response with no actions.");
  });

  it("should still process the action even though it strips the output", async () => {
    mockLLM.mockResponse = `Noted!

\`\`\`json
{"action":"store","topic":"database","subtopic":"engine","content":"PostgreSQL 16","source":"user"}
\`\`\``;

    await agent.chat("We use PostgreSQL 16");

    // Action should have been processed
    const entries = manager.listAll();
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe("PostgreSQL 16");
  });
});
