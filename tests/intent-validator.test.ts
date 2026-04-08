import { describe, it, expect } from "vitest";
import { validateIntent } from "../src/service/intent-validator.js";

describe("Intent Validator", () => {
  describe("store intent", () => {
    it("should validate store intent with all required fields", () => {
      const result = validateIntent({
        action: "store",
        topic: "auth",
        subtopic: "oauth",
        content: "We use OAuth 2.0",
        source: "Alice",
      });
      expect(result.valid).toBe(true);
      expect(result.intent).toBe("store_knowledge");
      expect(result.data).toEqual({
        action: "store",
        topic: "auth",
        subtopic: "oauth",
        content: "We use OAuth 2.0",
        source: "Alice",
      });
    });

    it("should reject store intent with missing topic", () => {
      const result = validateIntent({
        action: "store",
        subtopic: "oauth",
        content: "We use OAuth 2.0",
        source: "Alice",
      });
      expect(result.valid).toBe(false);
      expect(result.intent).toBe("store_knowledge");
      expect(result.reason).toBeDefined();
    });

    it("should reject store intent with missing content", () => {
      const result = validateIntent({
        action: "store",
        topic: "auth",
        subtopic: "oauth",
        source: "Alice",
      });
      expect(result.valid).toBe(false);
    });

    it("should reject store intent with empty string fields", () => {
      const result = validateIntent({
        action: "store",
        topic: "",
        subtopic: "oauth",
        content: "We use OAuth 2.0",
        source: "Alice",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("topic");
    });

    it("should reject store intent with missing source", () => {
      const result = validateIntent({
        action: "store",
        topic: "auth",
        subtopic: "oauth",
        content: "We use OAuth 2.0",
      });
      expect(result.valid).toBe(false);
    });

    it("should reject store intent with missing subtopic", () => {
      const result = validateIntent({
        action: "store",
        topic: "auth",
        content: "We use OAuth 2.0",
        source: "Alice",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("update intent", () => {
    it("should validate update intent with id and content", () => {
      const result = validateIntent({
        action: "update",
        id: "abc-123",
        content: "Updated content",
      });
      expect(result.valid).toBe(true);
      expect(result.intent).toBe("update_knowledge");
    });

    it("should reject update intent with missing id", () => {
      const result = validateIntent({
        action: "update",
        content: "Updated content",
      });
      expect(result.valid).toBe(false);
      expect(result.intent).toBe("update_knowledge");
    });

    it("should reject update intent with missing content", () => {
      const result = validateIntent({
        action: "update",
        id: "abc-123",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("red_flag intent", () => {
    it("should validate red_flag intent with all required fields", () => {
      const result = validateIntent({
        action: "red_flag",
        topic: "auth",
        subtopic: "oauth",
        content: "Actually we use SAML",
        source: "Bob",
      });
      expect(result.valid).toBe(true);
      expect(result.intent).toBe("red_flag");
    });

    it("should reject red_flag intent with missing fields", () => {
      const result = validateIntent({
        action: "red_flag",
        topic: "auth",
      });
      expect(result.valid).toBe(false);
      expect(result.intent).toBe("red_flag");
    });
  });

  describe("register_person intent", () => {
    it("should validate register_person intent with name and role", () => {
      const result = validateIntent({
        action: "register_person",
        name: "Alice",
        role: "engineer",
      });
      expect(result.valid).toBe(true);
      expect(result.intent).toBe("register_person");
    });

    it("should reject register_person intent with missing name", () => {
      const result = validateIntent({
        action: "register_person",
        role: "engineer",
      });
      expect(result.valid).toBe(false);
      expect(result.intent).toBe("register_person");
    });

    it("should reject register_person intent with missing role", () => {
      const result = validateIntent({
        action: "register_person",
        name: "Alice",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("unknown/missing action", () => {
    it("should reject unknown action type", () => {
      const result = validateIntent({
        action: "delete_everything",
        topic: "auth",
      });
      expect(result.valid).toBe(false);
      expect(result.intent).toBe("none");
      expect(result.reason).toContain("Unknown");
    });

    it("should reject when action field is missing", () => {
      const result = validateIntent({
        topic: "auth",
        content: "something",
      });
      expect(result.valid).toBe(false);
      expect(result.intent).toBe("none");
    });
  });
});
