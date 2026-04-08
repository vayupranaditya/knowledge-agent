import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";

describe("MemoryDB - People", () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("createPerson", () => {
    it("should create a person with name, role, and tags", () => {
      const person = db.createPerson({
        name: "Alice",
        role: "backend engineer",
        tags: ["authentication", "API", "Node.js"],
      });

      expect(person.id).toBeDefined();
      expect(person.name).toBe("Alice");
      expect(person.role).toBe("backend engineer");
      expect(person.tags).toEqual(["authentication", "API", "Node.js"]);
      expect(person.created_at).toBeDefined();
    });

    it("should generate unique ids for each person", () => {
      const p1 = db.createPerson({ name: "Alice", role: "dev", tags: [] });
      const p2 = db.createPerson({ name: "Bob", role: "pm", tags: [] });
      expect(p1.id).not.toBe(p2.id);
    });

    it("should handle empty tags", () => {
      const person = db.createPerson({ name: "Charlie", role: "intern", tags: [] });
      expect(person.tags).toEqual([]);
    });
  });

  describe("getPersonByName", () => {
    it("should find a person by name (case-insensitive)", () => {
      db.createPerson({ name: "Alice", role: "engineer", tags: ["backend"] });

      const found = db.getPersonByName("alice");
      expect(found).toBeDefined();
      expect(found!.name).toBe("Alice");
    });

    it("should return undefined for unknown person", () => {
      const found = db.getPersonByName("nobody");
      expect(found).toBeUndefined();
    });
  });

  describe("getPersonById", () => {
    it("should retrieve person by id", () => {
      const created = db.createPerson({ name: "Bob", role: "QA", tags: ["testing"] });
      const found = db.getPersonById(created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Bob");
    });
  });

  describe("updatePerson", () => {
    it("should update role and tags", () => {
      const person = db.createPerson({ name: "Alice", role: "junior dev", tags: ["frontend"] });

      const updated = db.updatePerson(person.id, {
        role: "senior dev",
        tags: ["frontend", "backend", "architecture"],
      });

      expect(updated).toBeDefined();
      expect(updated!.role).toBe("senior dev");
      expect(updated!.tags).toEqual(["frontend", "backend", "architecture"]);
    });

    it("should return undefined for non-existent person", () => {
      const result = db.updatePerson("fake-id", { role: "new role" });
      expect(result).toBeUndefined();
    });
  });

  describe("getAllPeople", () => {
    it("should return all people", () => {
      db.createPerson({ name: "Alice", role: "dev", tags: [] });
      db.createPerson({ name: "Bob", role: "pm", tags: [] });

      const all = db.getAllPeople();
      expect(all).toHaveLength(2);
    });

    it("should return empty array when no people exist", () => {
      expect(db.getAllPeople()).toHaveLength(0);
    });
  });

  describe("hasAuthorityOver", () => {
    it("should grant authority when person's tags match the topic", () => {
      db.createPerson({
        name: "Alice",
        role: "backend engineer",
        tags: ["authentication", "API"],
      });

      const person = db.getPersonByName("Alice")!;
      expect(db.hasAuthorityOver(person, "authentication")).toBe(true);
      expect(db.hasAuthorityOver(person, "API")).toBe(true);
    });

    it("should not grant authority for unrelated topics", () => {
      db.createPerson({
        name: "Bob",
        role: "frontend dev",
        tags: ["React", "CSS"],
      });

      const person = db.getPersonByName("Bob")!;
      expect(db.hasAuthorityOver(person, "authentication")).toBe(false);
    });

    it("should be case-insensitive for tag matching", () => {
      db.createPerson({
        name: "Alice",
        role: "dev",
        tags: ["Authentication"],
      });

      const person = db.getPersonByName("Alice")!;
      expect(db.hasAuthorityOver(person, "authentication")).toBe(true);
    });
  });
});
