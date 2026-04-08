import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeAgent } from "../src/agent/agent.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { MemoryDB } from "../src/db/memory-db.js";
import { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider.js";

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public mockResponse: string = "Hello!";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return { content: this.mockResponse };
  }
}

describe("Startup - Device Identity Auto-Restore", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;
  let mockLLM: MockLLMProvider;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
    mockLLM = new MockLLMProvider();
  });

  afterEach(() => {
    manager.close();
  });

  it("should auto-identify user from device key on construction", () => {
    const person = db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });
    db.linkDeviceToPersonId("test-device-key", person.id);

    const agent = new KnowledgeAgent(mockLLM, manager, "test-device-key");

    expect(agent.getCurrentUser()).toBe("Alice");
  });

  it("should not set current user when device key has no link", () => {
    const agent = new KnowledgeAgent(mockLLM, manager, "unknown-device");

    expect(agent.getCurrentUser()).toBeNull();
  });

  it("should not set current user when no device key is provided", () => {
    const agent = new KnowledgeAgent(mockLLM, manager);

    expect(agent.getCurrentUser()).toBeNull();
  });

  it("should link device to person when /iam is used for a new person who then gets registered", async () => {
    const agent = new KnowledgeAgent(mockLLM, manager, "my-device-key");

    // Person doesn't exist yet — /iam sets currentUser but can't link yet
    await agent.chat("/iam Bob");
    expect(agent.getCurrentUser()).toBe("Bob");

    // No link yet because Bob isn't in the DB
    expect(db.getPersonIdByDeviceKey("my-device-key")).toBeUndefined();

    // Simulate LLM registering Bob via register_person action
    mockLLM.mockResponse = `Nice to meet you, Bob!

\`\`\`json
{"action":"register_person","name":"Bob","role":"developer","tags":["frontend"]}
\`\`\``;

    await agent.chat("I'm a frontend developer");

    // Now Bob is registered AND device should be linked
    const person = db.getPersonByName("Bob");
    expect(person).toBeDefined();
    const personId = db.getPersonIdByDeviceKey("my-device-key");
    expect(personId).toBe(person!.id);
  });

  it("should link device to existing person when /iam matches a known person", async () => {
    const person = db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });
    const agent = new KnowledgeAgent(mockLLM, manager, "device-xyz");

    await agent.chat("/iam Alice");

    expect(agent.getCurrentUser()).toBe("Alice");
    expect(db.getPersonIdByDeviceKey("device-xyz")).toBe(person.id);
  });

  it("should show welcome message with identity on startup when auto-identified", () => {
    const person = db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });
    db.linkDeviceToPersonId("device-key", person.id);

    const agent = new KnowledgeAgent(mockLLM, manager, "device-key");

    const greeting = agent.getStartupGreeting();
    expect(greeting).toContain("Alice");
  });

  it("should show generic greeting when not auto-identified", () => {
    const agent = new KnowledgeAgent(mockLLM, manager, "unknown-device");

    const greeting = agent.getStartupGreeting();
    expect(greeting).toContain("/iam");
  });
});
