import { describe, it, expect, vi } from "vitest";
import { withRetry, LLMError } from "../src/llm/provider.js";

describe("withRetry", () => {
  it("should return result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on rate limit (429) and succeed", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on quota exceeded and succeed", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("You exceeded your current quota"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should throw after max retries on persistent rate limit", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("429 Too Many Requests"));

    await expect(withRetry(fn, 2, 10)).rejects.toThrow("429");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("should not retry on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Invalid API key"));

    await expect(withRetry(fn, 3, 10)).rejects.toThrow("Invalid API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should parse retry delay from error message", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 Too Many Requests. Please retry in 0.01s."))
      .mockResolvedValue("ok");

    const start = Date.now();
    await withRetry(fn, 3, 10);
    // Should have waited roughly 10ms (0.01s parsed from error)
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on transient 503 errors", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
