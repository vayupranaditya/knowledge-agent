import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryDB } from "../src/db/memory-db.js";

describe("MemoryDB - Device Identity", () => {
  let db: MemoryDB;

  beforeEach(() => {
    db = new MemoryDB(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("linkDeviceToPersonId", () => {
    it("should link a device key to a person id", () => {
      const person = db.createPerson({ name: "Alice", role: "dev", tags: ["backend"] });
      db.linkDeviceToPersonId("device-abc-123", person.id);

      const personId = db.getPersonIdByDeviceKey("device-abc-123");
      expect(personId).toBe(person.id);
    });

    it("should overwrite existing link for the same device key", () => {
      const alice = db.createPerson({ name: "Alice", role: "dev", tags: [] });
      const bob = db.createPerson({ name: "Bob", role: "pm", tags: [] });

      db.linkDeviceToPersonId("device-abc-123", alice.id);
      db.linkDeviceToPersonId("device-abc-123", bob.id);

      const personId = db.getPersonIdByDeviceKey("device-abc-123");
      expect(personId).toBe(bob.id);
    });
  });

  describe("getPersonIdByDeviceKey", () => {
    it("should return undefined for unknown device key", () => {
      const personId = db.getPersonIdByDeviceKey("unknown-device");
      expect(personId).toBeUndefined();
    });

    it("should return the person id for a known device key", () => {
      const person = db.createPerson({ name: "Charlie", role: "qa", tags: ["testing"] });
      db.linkDeviceToPersonId("my-laptop-key", person.id);

      expect(db.getPersonIdByDeviceKey("my-laptop-key")).toBe(person.id);
    });
  });

  describe("unlinkDevice", () => {
    it("should remove a device link", () => {
      const person = db.createPerson({ name: "Alice", role: "dev", tags: [] });
      db.linkDeviceToPersonId("device-key", person.id);

      const removed = db.unlinkDevice("device-key");
      expect(removed).toBe(true);
      expect(db.getPersonIdByDeviceKey("device-key")).toBeUndefined();
    });

    it("should return false for non-existent device key", () => {
      expect(db.unlinkDevice("nope")).toBe(false);
    });
  });
});
