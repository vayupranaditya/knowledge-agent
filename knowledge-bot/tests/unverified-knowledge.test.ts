import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";

describe("MemoryDB - Unverified Knowledge", () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("createUnverified", () => {
    it("should create an unverified knowledge entry with red flag", () => {
      const entry = db.createUnverified({
        topic: "deployment",
        subtopic: "rollback",
        content: "We never do rollbacks, we always push forward",
        source: "new-intern",
        contradicts_entry_id: null,
      });

      expect(entry.id).toBeDefined();
      expect(entry.topic).toBe("deployment");
      expect(entry.content).toContain("never do rollbacks");
      expect(entry.source).toBe("new-intern");
      expect(entry.corroboration_count).toBe(1);
      expect(entry.created_at).toBeDefined();
    });
  });

  describe("getUnverifiedById", () => {
    it("should retrieve unverified entry by id", () => {
      const created = db.createUnverified({
        topic: "testing",
        subtopic: "e2e",
        content: "We don't do e2e tests",
        source: "someone",
        contradicts_entry_id: null,
      });

      const found = db.getUnverifiedById(created.id);
      expect(found).toBeDefined();
      expect(found!.content).toContain("don't do e2e");
    });

    it("should return undefined for non-existent id", () => {
      expect(db.getUnverifiedById("fake")).toBeUndefined();
    });
  });

  describe("getAllUnverified", () => {
    it("should return all unverified entries", () => {
      db.createUnverified({
        topic: "a",
        subtopic: "b",
        content: "c",
        source: "user1",
        contradicts_entry_id: null,
      });
      db.createUnverified({
        topic: "d",
        subtopic: "e",
        content: "f",
        source: "user2",
        contradicts_entry_id: null,
      });

      expect(db.getAllUnverified()).toHaveLength(2);
    });
  });

  describe("corroborate", () => {
    it("should increment corroboration count and add the person as corroborator", () => {
      const entry = db.createUnverified({
        topic: "api",
        subtopic: "versioning",
        content: "We use URL-based API versioning",
        source: "dev1",
        contradicts_entry_id: null,
      });

      const updated = db.corroborate(entry.id, "dev2");
      expect(updated).toBeDefined();
      expect(updated!.corroboration_count).toBe(2);
      expect(updated!.corroborated_by).toContain("dev2");
    });

    it("should not double-count the same person", () => {
      const entry = db.createUnverified({
        topic: "api",
        subtopic: "versioning",
        content: "content",
        source: "dev1",
        contradicts_entry_id: null,
      });

      db.corroborate(entry.id, "dev1");
      const updated = db.corroborate(entry.id, "dev1");
      expect(updated!.corroboration_count).toBe(1);
    });
  });

  describe("promoteToTrusted", () => {
    it("should move unverified entry to trusted knowledge and delete from unverified", () => {
      const unverified = db.createUnverified({
        topic: "database",
        subtopic: "migration",
        content: "We use Flyway for DB migrations",
        source: "dba",
        contradicts_entry_id: null,
      });

      const promoted = db.promoteToTrusted(unverified.id);
      expect(promoted).toBeDefined();
      expect(promoted!.topic).toBe("database");
      expect(promoted!.content).toContain("Flyway");

      // Should be gone from unverified
      expect(db.getUnverifiedById(unverified.id)).toBeUndefined();

      // Should exist in trusted knowledge
      const trusted = db.getById(promoted!.id);
      expect(trusted).toBeDefined();
    });

    it("should return undefined for non-existent unverified entry", () => {
      expect(db.promoteToTrusted("fake")).toBeUndefined();
    });
  });

  describe("deleteUnverified", () => {
    it("should delete an unverified entry", () => {
      const entry = db.createUnverified({
        topic: "t",
        subtopic: "s",
        content: "c",
        source: "u",
        contradicts_entry_id: null,
      });

      expect(db.deleteUnverified(entry.id)).toBe(true);
      expect(db.getUnverifiedById(entry.id)).toBeUndefined();
    });
  });

  describe("countUnverified", () => {
    it("should return count of unverified entries", () => {
      expect(db.countUnverified()).toBe(0);
      db.createUnverified({ topic: "t", subtopic: "s", content: "c", source: "u", contradicts_entry_id: null });
      expect(db.countUnverified()).toBe(1);
    });
  });
});
