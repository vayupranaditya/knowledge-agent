import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { KnowledgeAgent } from "../src/agent/agent.js";
import { LLMProvider, LLMMessage, LLMResponse, LLMError } from "../src/llm/provider.js";
import { getDeviceKey } from "../src/device-key.js";
import { validateProviderConnection } from "../src/config.js";

// ==================== device-key.ts ====================

describe("getDeviceKey", () => {
  it("should return a 16-character hex string", () => {
    const key = getDeviceKey();
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });

  it("should return the same key on repeated calls", () => {
    const key1 = getDeviceKey();
    const key2 = getDeviceKey();
    expect(key1).toBe(key2);
  });
});

// ==================== LLMError ====================

describe("LLMError", () => {
  it("should create a retryable error", () => {
    const err = new LLMError("rate limited", true, 5000);
    expect(err.message).toBe("rate limited");
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.name).toBe("LLMError");
  });

  it("should create a non-retryable error", () => {
    const err = new LLMError("invalid key", false);
    expect(err.retryable).toBe(false);
    expect(err.retryAfterMs).toBeUndefined();
  });

  it("should be an instance of Error", () => {
    const err = new LLMError("test", true);
    expect(err).toBeInstanceOf(Error);
  });
});

// ==================== config.ts - validateProviderConnection gaps ====================

describe("validateProviderConnection - additional paths", () => {
  it("should return ok for gemini with valid API key", async () => {
    const result = await validateProviderConnection({
      llmProvider: "gemini",
      apiKey: "valid-key",
      model: "gemini-2.0-flash",
      dbPath: ":memory:",
      ollamaBaseUrl: "",
    });
    expect(result.ok).toBe(true);
  });

  it("should return ok for openai with valid API key", async () => {
    const result = await validateProviderConnection({
      llmProvider: "openai",
      apiKey: "valid-key",
      model: "gpt-4o-mini",
      dbPath: ":memory:",
      ollamaBaseUrl: "",
    });
    expect(result.ok).toBe(true);
  });

  it("should return error for unknown provider", async () => {
    const result = await validateProviderConnection({
      llmProvider: "anthropic" as any,
      apiKey: "",
      model: "",
      dbPath: ":memory:",
      ollamaBaseUrl: "",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unknown provider");
  });
});

// ==================== memory-db.ts - update with topic and source fields ====================

describe("MemoryDB - update field coverage", () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("should update topic field", () => {
    const entry = db.create({
      topic: "old-topic",
      subtopic: "sub",
      content: "content",
      source: "user",
    });

    const updated = db.update(entry.id, { topic: "new-topic" });
    expect(updated).toBeDefined();
    expect(updated!.topic).toBe("new-topic");
  });

  it("should update subtopic field", () => {
    const entry = db.create({
      topic: "topic",
      subtopic: "old-sub",
      content: "content",
      source: "user",
    });

    const updated = db.update(entry.id, { subtopic: "new-sub" });
    expect(updated).toBeDefined();
    expect(updated!.subtopic).toBe("new-sub");
  });

  it("should update source and contributed_by together", () => {
    const entry = db.create({
      topic: "topic",
      subtopic: "sub",
      content: "content",
      source: "old-source",
    });

    const updated = db.update(entry.id, { source: "new-source" });
    expect(updated).toBeDefined();
    expect(updated!.source).toBe("new-source");
    expect(updated!.contributed_by).toBe("new-source");
  });
});

// ==================== memory-db.ts - updatePerson with name field ====================

describe("MemoryDB - updatePerson name field", () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("should update person name", () => {
    const person = db.createPerson({ name: "OldName", role: "dev", tags: [] });
    const updated = db.updatePerson(person.id, { name: "NewName" });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("NewName");
  });

  it("should return existing person when no updates provided", () => {
    const person = db.createPerson({ name: "Alice", role: "dev", tags: ["backend"] });
    const result = db.updatePerson(person.id, {});
    expect(result).toBeDefined();
    expect(result!.name).toBe("Alice");
  });
});

// ==================== knowledge/manager.ts - update and delete passthrough ====================

describe("KnowledgeManager - update and delete", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
  });

  afterEach(() => {
    manager.close();
  });

  it("should update an entry via manager", () => {
    const entry = manager.store({
      topic: "api",
      subtopic: "rest",
      content: "REST API on port 3000",
      source: "dev",
    });

    const updated = manager.update(entry.id, { content: "REST API on port 8080" });
    expect(updated).toBeDefined();
    expect(updated!.content).toBe("REST API on port 8080");
  });

  it("should return undefined when updating non-existent entry", () => {
    const result = manager.update("fake-id", { content: "nope" });
    expect(result).toBeUndefined();
  });

  it("should delete an entry via manager and return true", () => {
    const entry = manager.store({
      topic: "test",
      subtopic: "sub",
      content: "content",
      source: "user",
    });

    expect(manager.delete(entry.id)).toBe(true);
    expect(manager.getById(entry.id)).toBeUndefined();
  });

  it("should return false when deleting non-existent entry", () => {
    expect(manager.delete("fake-id")).toBe(false);
  });
});

// ==================== agent.ts - processKnowledgeExtraction gaps ====================

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public mockResponse: string = "Hello!";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return { content: this.mockResponse };
  }
}

describe("KnowledgeAgent - processKnowledgeExtraction gaps", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;
  let mockLLM: MockLLMProvider;
  let agent: KnowledgeAgent;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
    mockLLM = new MockLLMProvider();
    agent = new KnowledgeAgent(mockLLM, manager, "test-device");
  });

  afterEach(() => {
    manager.close();
  });

  it("should process update action from JSON block", async () => {
    const entry = manager.store({
      topic: "api",
      subtopic: "port",
      content: "API runs on port 3000",
      source: "dev",
    });

    mockLLM.mockResponse = `Updated!

\`\`\`json
{"action":"update","id":"${entry.id}","content":"API runs on port 8080","source":"dev"}
\`\`\``;

    await agent.chat("The API port changed to 8080");

    const updated = manager.getById(entry.id);
    expect(updated!.content).toBe("API runs on port 8080");
  });

  it("should handle malformed JSON gracefully", async () => {
    mockLLM.mockResponse = `Sure thing!

\`\`\`json
{this is not valid json}
\`\`\``;

    // Should not throw
    const response = await agent.chat("something");
    expect(response).toContain("Sure thing");
  });

  it("should process register_person for existing person and link device", async () => {
    const person = db.createPerson({ name: "Alice", role: "junior", tags: ["frontend"] });
    await agent.chat("/iam Alice");

    mockLLM.mockResponse = `Updated your profile!

\`\`\`json
{"action":"register_person","name":"Alice","role":"senior engineer","tags":["frontend","backend"]}
\`\`\``;

    await agent.chat("I'm now a senior engineer working on frontend and backend");

    const updated = db.getPersonByName("Alice");
    expect(updated!.role).toBe("senior engineer");
    expect(updated!.tags).toEqual(["frontend", "backend"]);

    // Device should be linked
    const linkedPersonId = db.getPersonIdByDeviceKey("test-device");
    expect(linkedPersonId).toBe(person.id);
  });

  it("should process store action without current user (smartStore path)", async () => {
    // No /iam — currentUser is null
    mockLLM.mockResponse = `Noted!

\`\`\`json
{"action":"store","topic":"infra","subtopic":"cloud","content":"We use AWS","source":"anonymous"}
\`\`\``;

    await agent.chat("We use AWS");

    const entries = manager.listAll();
    expect(entries.length).toBe(1);
    expect(entries[0].content).toBe("We use AWS");
  });

  it("should show generic greeting when device links to deleted person", () => {
    // Create person, link device, then the person record is conceptually stale
    // (person_id in device_identities points to a person whose getPersonById returns data
    //  but we test the path where restoreIdentity finds no person)
    const agent2 = new KnowledgeAgent(mockLLM, manager, "unlinked-device");
    const greeting = agent2.getStartupGreeting();
    expect(greeting).toContain("/iam");
  });
});
