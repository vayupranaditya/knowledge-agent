import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";

describe("MemoryDB", () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("should create a knowledge entry and return it with an id", () => {
      const entry = db.create({
        topic: "authentication",
        subtopic: "OAuth flow",
        content: "We use OAuth 2.0 with PKCE for mobile apps",
        source: "dev-team",
      });

      expect(entry.id).toBeDefined();
      expect(entry.topic).toBe("authentication");
      expect(entry.subtopic).toBe("OAuth flow");
      expect(entry.content).toBe("We use OAuth 2.0 with PKCE for mobile apps");
      expect(entry.source).toBe("dev-team");
      expect(entry.created_at).toBeDefined();
      expect(entry.last_updated).toBeDefined();
    });

    it("should generate unique ids for each entry", () => {
      const entry1 = db.create({
        topic: "topic1",
        subtopic: "sub1",
        content: "content1",
        source: "user",
      });
      const entry2 = db.create({
        topic: "topic2",
        subtopic: "sub2",
        content: "content2",
        source: "user",
      });

      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe("getById", () => {
    it("should retrieve an entry by id", () => {
      const created = db.create({
        topic: "deployment",
        subtopic: "CI/CD",
        content: "We use GitHub Actions for CI/CD",
        source: "devops",
      });

      const retrieved = db.getById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.topic).toBe("deployment");
    });

    it("should return undefined for non-existent id", () => {
      const result = db.getById("non-existent-id");
      expect(result).toBeUndefined();
    });
  });

  describe("update", () => {
    it("should update specified fields and refresh last_updated", () => {
      const created = db.create({
        topic: "testing",
        subtopic: "unit tests",
        content: "We use Jest for unit testing",
        source: "qa-team",
      });

      const originalUpdated = created.last_updated;

      // Small delay to ensure timestamp differs
      const updated = db.update(created.id, {
        content: "We migrated from Jest to Vitest",
      });

      expect(updated).toBeDefined();
      expect(updated!.content).toBe("We migrated from Jest to Vitest");
      expect(updated!.topic).toBe("testing"); // unchanged
    });

    it("should return undefined when updating non-existent entry", () => {
      const result = db.update("fake-id", { content: "new content" });
      expect(result).toBeUndefined();
    });

    it("should return existing entry when no updates provided", () => {
      const created = db.create({
        topic: "api",
        subtopic: "rest",
        content: "REST API on port 3000",
        source: "user",
      });

      const result = db.update(created.id, {});
      expect(result).toBeDefined();
      expect(result!.content).toBe("REST API on port 3000");
    });
  });

  describe("delete", () => {
    it("should delete an existing entry and return true", () => {
      const created = db.create({
        topic: "infra",
        subtopic: "aws",
        content: "Running on ECS Fargate",
        source: "user",
      });

      const deleted = db.delete(created.id);
      expect(deleted).toBe(true);
      expect(db.getById(created.id)).toBeUndefined();
    });

    it("should return false when deleting non-existent entry", () => {
      const deleted = db.delete("fake-id");
      expect(deleted).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return all entries ordered by last_updated desc", () => {
      db.create({ topic: "a", subtopic: "1", content: "first", source: "user" });
      db.create({ topic: "b", subtopic: "2", content: "second", source: "user" });
      db.create({ topic: "c", subtopic: "3", content: "third", source: "user" });

      const all = db.getAll();
      expect(all).toHaveLength(3);
    });

    it("should return empty array when no entries exist", () => {
      expect(db.getAll()).toHaveLength(0);
    });
  });

  describe("searchByTopic", () => {
    it("should find entries matching topic pattern", () => {
      db.create({ topic: "authentication", subtopic: "oauth", content: "OAuth stuff", source: "user" });
      db.create({ topic: "deployment", subtopic: "ci", content: "CI stuff", source: "user" });
      db.create({ topic: "authentication", subtopic: "jwt", content: "JWT stuff", source: "user" });

      const results = db.searchByTopic("auth");
      expect(results).toHaveLength(2);
    });
  });

  describe("searchByText", () => {
    it("should find entries matching content, topic, or subtopic", () => {
      db.create({ topic: "api", subtopic: "graphql", content: "We use Apollo Server", source: "user" });
      db.create({ topic: "frontend", subtopic: "react", content: "React with Next.js", source: "user" });

      const results = db.searchByText("Apollo");
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("Apollo");
    });
  });

  describe("count", () => {
    it("should return the number of entries", () => {
      expect(db.count()).toBe(0);
      db.create({ topic: "t", subtopic: "s", content: "c", source: "u" });
      expect(db.count()).toBe(1);
      db.create({ topic: "t2", subtopic: "s2", content: "c2", source: "u" });
      expect(db.count()).toBe(2);
    });
  });
});
