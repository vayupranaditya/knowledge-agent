import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";

describe("KnowledgeManager - Authority & Flagging", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
  });

  afterEach(() => {
    manager.close();
  });

  describe("authorityAwareStore", () => {
    it("should store directly when person has authority over the topic", () => {
      db.createPerson({
        name: "Alice",
        role: "backend engineer",
        tags: ["database", "PostgreSQL"],
      });

      const result = manager.authorityAwareStore(
        {
          topic: "database",
          subtopic: "PostgreSQL",
          content: "We use PostgreSQL 16 with connection pooling via PgBouncer",
          source: "Alice",
        },
        "Alice"
      );

      expect(result.outcome).toBe("trusted");
      expect(result.entry).toBeDefined();
      expect(result.entry!.content).toContain("PgBouncer");
    });

    it("should store directly when no contradicting knowledge exists (even without authority)", () => {
      db.createPerson({
        name: "Bob",
        role: "intern",
        tags: ["frontend"],
      });

      const result = manager.authorityAwareStore(
        {
          topic: "onboarding",
          subtopic: "process",
          content: "New hires get a buddy assigned on day one",
          source: "Bob",
        },
        "Bob"
      );

      // No existing knowledge to contradict, so it goes in trusted
      expect(result.outcome).toBe("trusted");
    });

    it("should raise yellow flag when knowledge contradicts existing and person lacks authority", () => {
      // Store existing trusted knowledge
      manager.store({
        topic: "deployment",
        subtopic: "strategy",
        content: "We use blue-green deployment strategy for production releases",
        source: "DevOps Lead",
      });

      db.createPerson({
        name: "Charlie",
        role: "junior dev",
        tags: ["frontend", "React"],
      });

      const result = manager.authorityAwareStore(
        {
          topic: "deployment",
          subtopic: "strategy",
          content: "We use canary deployment strategy for production releases",
          source: "Charlie",
        },
        "Charlie"
      );

      expect(result.outcome).toBe("yellow_flag");
      expect(result.contradicts).toBeDefined();
    });

    it("should store directly when person has authority even if contradicting", () => {
      manager.store({
        topic: "deployment",
        subtopic: "strategy",
        content: "We use blue-green deployment strategy",
        source: "old-info",
      });

      db.createPerson({
        name: "Diana",
        role: "DevOps Lead",
        tags: ["deployment", "infrastructure", "CI/CD"],
      });

      const result = manager.authorityAwareStore(
        {
          topic: "deployment",
          subtopic: "strategy",
          content: "We switched to canary deployment strategy",
          source: "Diana",
        },
        "Diana"
      );

      expect(result.outcome).toBe("trusted");
    });

    it("should handle unknown person by treating as no authority", () => {
      manager.store({
        topic: "api",
        subtopic: "protocol",
        content: "We use REST for all APIs",
        source: "architect",
      });

      const result = manager.authorityAwareStore(
        {
          topic: "api",
          subtopic: "protocol",
          content: "We use GraphQL for all APIs",
          source: "unknown-person",
        },
        "unknown-person"
      );

      expect(result.outcome).toBe("yellow_flag");
    });
  });

  describe("escalateToRedFlag", () => {
    it("should move knowledge to unverified set", () => {
      manager.store({
        topic: "testing",
        subtopic: "coverage",
        content: "We require 80% code coverage",
        source: "QA Lead",
      });

      const existing = manager.listAll()[0];

      const unverified = manager.escalateToRedFlag({
        topic: "testing",
        subtopic: "coverage",
        content: "We don't have any coverage requirements",
        source: "new-dev",
      }, existing.id);

      expect(unverified).toBeDefined();
      expect(unverified.content).toContain("don't have any coverage");

      // Original trusted knowledge should still be there
      expect(manager.getById(existing.id)).toBeDefined();

      // Unverified count should be 1
      expect(db.countUnverified()).toBe(1);
    });
  });

  describe("promoteUnverified", () => {
    it("should promote unverified knowledge to trusted when confirmed by authority", () => {
      const unverified = db.createUnverified({
        topic: "api",
        subtopic: "rate-limiting",
        content: "API rate limit is 1000 req/min",
        source: "dev1",
        contradicts_entry_id: null,
      });

      db.createPerson({
        name: "API Lead",
        role: "tech lead",
        tags: ["api", "backend"],
      });

      const promoted = manager.promoteUnverified(unverified.id, "API Lead");
      expect(promoted).toBeDefined();
      expect(promoted!.topic).toBe("api");

      // Should be gone from unverified
      expect(db.getUnverifiedById(unverified.id)).toBeUndefined();
    });

    it("should promote when corroboration count reaches threshold", () => {
      const unverified = db.createUnverified({
        topic: "process",
        subtopic: "standup",
        content: "Standup is at 9:30 AM",
        source: "dev1",
        contradicts_entry_id: null,
      });

      // Corroborate by multiple people
      db.corroborate(unverified.id, "dev2");
      db.corroborate(unverified.id, "dev3");

      const promoted = manager.promoteByCorroboration(unverified.id, 3);
      expect(promoted).toBeDefined();
    });

    it("should not promote when corroboration count is below threshold", () => {
      const unverified = db.createUnverified({
        topic: "process",
        subtopic: "standup",
        content: "Standup is at 9:30 AM",
        source: "dev1",
        contradicts_entry_id: null,
      });

      db.corroborate(unverified.id, "dev2");

      const promoted = manager.promoteByCorroboration(unverified.id, 3);
      expect(promoted).toBeNull();
    });
  });

  describe("getUnverifiedKnowledge", () => {
    it("should list all unverified entries", () => {
      db.createUnverified({
        topic: "a", subtopic: "b", content: "c", source: "u1", contradicts_entry_id: null,
      });
      db.createUnverified({
        topic: "d", subtopic: "e", content: "f", source: "u2", contradicts_entry_id: null,
      });

      const unverified = manager.getUnverifiedKnowledge();
      expect(unverified).toHaveLength(2);
    });
  });
});
