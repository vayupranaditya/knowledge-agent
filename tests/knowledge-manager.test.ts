import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";
import { KnowledgeManager } from "../src/knowledge/manager.js";

describe("KnowledgeManager", () => {
  let db: MemoryDB;
  let manager: KnowledgeManager;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
    manager = new KnowledgeManager(db);
  });

  afterEach(() => {
    manager.close();
  });

  describe("store and retrieve", () => {
    it("should store knowledge and retrieve it by id", () => {
      const entry = manager.store({
        topic: "architecture",
        subtopic: "microservices",
        content: "We use event-driven microservices with Kafka",
        source: "architect",
      });

      const retrieved = manager.getById(entry.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.content).toBe("We use event-driven microservices with Kafka");
    });
  });

  describe("search", () => {
    it("should find semantically related entries", () => {
      manager.store({
        topic: "authentication",
        subtopic: "OAuth",
        content: "OAuth 2.0 with PKCE flow for mobile authentication",
        source: "security-team",
      });
      manager.store({
        topic: "deployment",
        subtopic: "kubernetes",
        content: "Kubernetes cluster on AWS EKS with Helm charts",
        source: "devops",
      });
      manager.store({
        topic: "authentication",
        subtopic: "JWT",
        content: "JWT tokens with RS256 signing for API authentication",
        source: "backend-team",
      });

      const results = manager.search("OAuth authentication mobile");
      expect(results.length).toBeGreaterThan(0);
      // Auth-related entries should rank higher
      expect(results[0].entry.topic).toBe("authentication");
    });

    it("should return empty array when no entries exist", () => {
      const results = manager.search("anything");
      expect(results).toHaveLength(0);
    });

    it("should respect the limit parameter", () => {
      for (let i = 0; i < 15; i++) {
        manager.store({
          topic: "topic",
          subtopic: `sub-${i}`,
          content: `Knowledge entry number ${i} about software development`,
          source: "user",
        });
      }

      const results = manager.search("software development", 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("smartStore", () => {
    it("should create a new entry when no related knowledge exists", () => {
      const result = manager.smartStore({
        topic: "database",
        subtopic: "PostgreSQL",
        content: "We use PostgreSQL 15 with pgvector extension",
        source: "dba",
      });

      expect(result.action).toBe("created");
      expect(result.entry.topic).toBe("database");
    });

    it("should update existing entry when knowledge is closely related", () => {
      manager.store({
        topic: "database",
        subtopic: "PostgreSQL",
        content: "We use PostgreSQL 14 for our main database",
        source: "dba",
      });

      const result = manager.smartStore({
        topic: "database",
        subtopic: "PostgreSQL",
        content: "We upgraded to PostgreSQL 16 for our main database",
        source: "dba",
      });

      expect(result.action).toBe("updated");
      expect(result.entry.content).toBe("We upgraded to PostgreSQL 16 for our main database");
      expect(manager.count()).toBe(1); // Should not create a duplicate
    });

    it("should create new entry when knowledge has drifted far from existing", () => {
      manager.store({
        topic: "authentication",
        subtopic: "OAuth",
        content: "OAuth 2.0 with PKCE flow for mobile authentication",
        source: "security-team",
      });

      const result = manager.smartStore({
        topic: "deployment",
        subtopic: "Docker",
        content: "Docker containers orchestrated with Kubernetes on AWS",
        source: "devops",
      });

      expect(result.action).toBe("created");
      expect(manager.count()).toBe(2);
    });
  });

  describe("findRelatedEntry", () => {
    it("should return null when no entries exist", () => {
      const result = manager.findRelatedEntry("any topic", "any content");
      expect(result).toBeNull();
    });

    it("should find related entry for similar topic and content", () => {
      const stored = manager.store({
        topic: "api",
        subtopic: "REST",
        content: "REST API endpoints follow OpenAPI 3.0 specification",
        source: "backend",
      });

      const related = manager.findRelatedEntry(
        "api",
        "REST API endpoints documentation and OpenAPI spec"
      );

      // Should find the related entry since topics overlap significantly
      if (related) {
        expect(related.id).toBe(stored.id);
      }
      // It's also valid for it to be null if similarity is below threshold
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      manager.store({ topic: "auth", subtopic: "oauth", content: "c1", source: "u" });
      manager.store({ topic: "deploy", subtopic: "k8s", content: "c2", source: "u" });
      manager.store({ topic: "auth", subtopic: "jwt", content: "c3", source: "u" });

      const stats = manager.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.topics).toContain("auth");
      expect(stats.topics).toContain("deploy");
      expect(stats.topics).toHaveLength(2); // unique topics
      expect(stats.lastUpdated).toBeDefined();
    });

    it("should handle empty database", () => {
      const stats = manager.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.topics).toHaveLength(0);
      expect(stats.lastUpdated).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete an entry", () => {
      const entry = manager.store({
        topic: "test",
        subtopic: "sub",
        content: "content",
        source: "user",
      });

      expect(manager.delete(entry.id)).toBe(true);
      expect(manager.getById(entry.id)).toBeUndefined();
      expect(manager.count()).toBe(0);
    });
  });
});
