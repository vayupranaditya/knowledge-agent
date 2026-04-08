import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../src/api/server.js";
import { ChatService } from "../src/service/chat-service.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";
import { MemoryDB } from "../src/db/memory-db.js";
import { LLMProvider, LLMMessage, LLMResponse } from "../src/llm/provider.js";
import type { Express } from "express";

class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  public mockResponse: string = "Mock LLM response";

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    return { content: this.mockResponse };
  }
}

/**
 * Lightweight request helper that uses the Express app directly
 * without needing supertest. We start a real server on a random port.
 */
async function request(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const addr = server.address() as { port: number };
        const url = `http://127.0.0.1:${addr.port}${path}`;
        const options: RequestInit = {
          method,
          headers: { "Content-Type": "application/json" },
        };
        if (body) {
          options.body = JSON.stringify(body);
        }
        const res = await fetch(url, options);
        const json = await res.json().catch(() => null);
        resolve({ status: res.status, body: json });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

describe("API Server", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;
  let mockLLM: MockLLMProvider;
  let service: ChatService;
  let app: Express;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
    mockLLM = new MockLLMProvider();
    service = new ChatService(mockLLM, manager);
    app = createApp(service, manager, db);
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /health", () => {
    it("should return ok status", async () => {
      const res = await request(app, "GET", "/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });
  });

  describe("POST /chat", () => {
    it("should return reply and sessionId", async () => {
      mockLLM.mockResponse = "Hello from the bot!";
      const res = await request(app, "POST", "/chat", { message: "Hello" });

      expect(res.status).toBe(200);
      expect(res.body.reply).toBe("Hello from the bot!");
      expect(res.body.sessionId).toBeDefined();
    });

    it("should maintain conversation with existing sessionId", async () => {
      mockLLM.mockResponse = "First reply";
      const first = await request(app, "POST", "/chat", { message: "Hello" });

      mockLLM.mockResponse = "Second reply";
      const second = await request(app, "POST", "/chat", {
        message: "Follow up",
        sessionId: first.body.sessionId,
      });

      expect(second.body.sessionId).toBe(first.body.sessionId);
      expect(second.body.reply).toBe("Second reply");
    });

    it("should return 400 when message is missing", async () => {
      const res = await request(app, "POST", "/chat", {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("POST /identify", () => {
    it("should identify user via /iam command", async () => {
      db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });

      // First create a session
      const chatRes = await request(app, "POST", "/chat", { message: "Hello" });
      const sessionId = chatRes.body.sessionId;

      const res = await request(app, "POST", "/identify", {
        name: "Alice",
        sessionId,
      });

      expect(res.status).toBe(200);
      expect(res.body.reply).toContain("Alice");
      expect(res.body.user).toBe("Alice");
    });

    it("should return 400 when name is missing", async () => {
      const res = await request(app, "POST", "/identify", { sessionId: "abc" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /stats", () => {
    it("should return knowledge base stats", async () => {
      const res = await request(app, "GET", "/stats");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalEntries");
      expect(res.body).toHaveProperty("topics");
      expect(res.body).toHaveProperty("totalPeople");
      expect(res.body).toHaveProperty("totalUnverified");
    });
  });

  describe("GET /people", () => {
    it("should return people array", async () => {
      db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });
      db.createPerson({ name: "Bob", role: "designer", tags: ["ui"] });

      const res = await request(app, "GET", "/people");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe("GET /search", () => {
    it("should return search results", async () => {
      manager.store({
        topic: "authentication",
        subtopic: "OAuth",
        content: "OAuth 2.0 with PKCE for mobile apps",
        source: "security-team",
      });

      const res = await request(app, "GET", "/search?q=OAuth");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app, "GET", "/search");
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
});
