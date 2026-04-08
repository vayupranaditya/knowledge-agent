import { describe, it, expect } from "vitest";
import { cosineSimilarity, rankBySimilarity } from "../src/knowledge/embeddings.js";

describe("Embeddings", () => {
  describe("cosineSimilarity", () => {
    it("should return 1 for identical texts", () => {
      const score = cosineSimilarity("hello world", "hello world");
      expect(score).toBeCloseTo(1, 1);
    });

    it("should return 0 for completely different texts", () => {
      const score = cosineSimilarity("apple banana cherry", "xyz quantum physics");
      expect(score).toBe(0);
    });

    it("should return higher score for similar texts", () => {
      const similar = cosineSimilarity(
        "OAuth authentication flow for mobile apps",
        "authentication using OAuth for mobile applications"
      );
      const different = cosineSimilarity(
        "OAuth authentication flow for mobile apps",
        "Kubernetes deployment with Helm charts"
      );

      expect(similar).toBeGreaterThan(different);
    });

    it("should handle empty strings", () => {
      expect(cosineSimilarity("", "hello")).toBe(0);
      expect(cosineSimilarity("hello", "")).toBe(0);
      expect(cosineSimilarity("", "")).toBe(0);
    });

    it("should be case insensitive", () => {
      const score1 = cosineSimilarity("Hello World", "hello world");
      expect(score1).toBeCloseTo(1, 1);
    });
  });

  describe("rankBySimilarity", () => {
    it("should rank documents by relevance to query", () => {
      const docs = [
        { id: "1", text: "Kubernetes deployment on AWS EKS" },
        { id: "2", text: "OAuth 2.0 authentication with PKCE" },
        { id: "3", text: "JWT token authentication for REST API" },
      ];

      const ranked = rankBySimilarity("how does authentication work", docs);

      expect(ranked[0].id).toBe("2"); // or "3" — both are auth-related
      expect(["2", "3"]).toContain(ranked[0].id);
      // Kubernetes should rank lowest for an auth query
      const k8sRank = ranked.findIndex((r) => r.id === "1");
      expect(k8sRank).toBe(2);
    });

    it("should return scores between 0 and 1", () => {
      const docs = [
        { id: "1", text: "some text about programming" },
        { id: "2", text: "completely unrelated content about cooking" },
      ];

      const ranked = rankBySimilarity("programming languages", docs);
      for (const r of ranked) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it("should handle empty documents array", () => {
      const ranked = rankBySimilarity("query", []);
      expect(ranked).toHaveLength(0);
    });
  });
});
