/**
 * Simple TF-IDF-like text similarity for semantic search.
 * This avoids needing an external embedding API for the core search.
 * Can be swapped for real embeddings (e.g., Gemini embedding API) later.
 */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  // Normalize
  for (const [key, value] of freq) {
    freq.set(key, value / tokens.length);
  }
  return freq;
}

export function cosineSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const tfA = termFrequency(tokensA);
  const tfB = termFrequency(tokensB);

  const allTerms = new Set([...tfA.keys(), ...tfB.keys()]);

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const term of allTerms) {
    const a = tfA.get(term) || 0;
    const b = tfB.get(term) || 0;
    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

export function rankBySimilarity(
  query: string,
  documents: { id: string; text: string }[]
): { id: string; score: number }[] {
  return documents
    .map((doc) => ({
      id: doc.id,
      score: cosineSimilarity(query, doc.text),
    }))
    .sort((a, b) => b.score - a.score);
}
