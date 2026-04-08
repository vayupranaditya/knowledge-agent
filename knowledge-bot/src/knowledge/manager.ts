import { MemoryDB } from "../db/memory-db.js";
import {
  KnowledgeEntry,
  KnowledgeInput,
  SearchResult,
  UnverifiedEntry,
  AuthorityStoreResult,
} from "../db/schema.js";
import { rankBySimilarity } from "./embeddings.js";

const SIMILARITY_THRESHOLD = 0.15;
const DRIFT_THRESHOLD = 0.4;
const CONTRADICTION_THRESHOLD = 0.3;

export class KnowledgeManager {
  private db: MemoryDB;

  constructor(db: MemoryDB) {
    this.db = db;
  }

  store(input: KnowledgeInput): KnowledgeEntry {
    return this.db.create(input);
  }

  getById(id: string): KnowledgeEntry | undefined {
    return this.db.getById(id);
  }

  update(id: string, updates: Partial<KnowledgeInput>): KnowledgeEntry | undefined {
    return this.db.update(id, updates);
  }

  delete(id: string): boolean {
    return this.db.delete(id);
  }

  listAll(): KnowledgeEntry[] {
    return this.db.getAll();
  }

  count(): number {
    return this.db.count();
  }

  search(query: string, limit: number = 10): SearchResult[] {
    const allEntries = this.db.getAll();
    if (allEntries.length === 0) return [];

    const documents = allEntries.map((entry) => ({
      id: entry.id,
      text: `${entry.topic} ${entry.subtopic} ${entry.content}`,
    }));

    const ranked = rankBySimilarity(query, documents);

    return ranked
      .filter((r) => r.score >= SIMILARITY_THRESHOLD)
      .slice(0, limit)
      .map((r) => ({
        entry: allEntries.find((e) => e.id === r.id)!,
        relevanceScore: r.score,
      }));
  }

  findRelatedEntry(topic: string, content: string): KnowledgeEntry | null {
    const allEntries = this.db.getAll();
    if (allEntries.length === 0) return null;

    const queryText = `${topic} ${content}`;
    const documents = allEntries.map((entry) => ({
      id: entry.id,
      text: `${entry.topic} ${entry.subtopic} ${entry.content}`,
    }));

    const ranked = rankBySimilarity(queryText, documents);
    const topMatch = ranked[0];

    if (topMatch && topMatch.score >= DRIFT_THRESHOLD) {
      return allEntries.find((e) => e.id === topMatch.id) || null;
    }

    return null;
  }

  smartStore(input: KnowledgeInput): { action: "created" | "updated"; entry: KnowledgeEntry } {
    const related = this.findRelatedEntry(input.topic, input.content);

    if (related) {
      const updated = this.db.update(related.id, {
        content: input.content,
        source: input.source,
        subtopic: input.subtopic,
      });
      return { action: "updated", entry: updated! };
    }

    const created = this.db.create(input);
    return { action: "created", entry: created };
  }

  // ==================== Authority-Aware Operations ====================

  /**
   * Store knowledge with authority checks.
   *
   * - If person has authority over the topic → store directly as trusted.
   * - If no contradicting knowledge exists → store directly as trusted.
   * - If contradicting knowledge exists and person lacks authority → yellow flag.
   */
  authorityAwareStore(input: KnowledgeInput, personName: string): AuthorityStoreResult {
    const person = this.db.getPersonByName(personName);
    const hasAuthority = person ? this.db.hasAuthorityOver(person, input.topic) : false;

    // Find potentially contradicting existing knowledge
    const related = this.findRelatedEntry(input.topic, input.content);

    // If person has authority, always trust them
    if (hasAuthority) {
      const result = this.smartStore(input);
      return { outcome: "trusted", entry: result.entry };
    }

    // If no related/contradicting knowledge exists, store as trusted
    if (!related) {
      const entry = this.db.create(input);
      return { outcome: "trusted", entry };
    }

    // Related knowledge exists and person lacks authority → yellow flag
    return {
      outcome: "yellow_flag",
      contradicts: related,
      message: "This seems different from what I currently know. Could you tell me more about this?",
    };
  }

  /**
   * Escalate knowledge to red flag (unverified set).
   * Called when yellow flag clarification still doesn't resolve the contradiction.
   */
  escalateToRedFlag(input: KnowledgeInput, contradictsEntryId: string): UnverifiedEntry {
    return this.db.createUnverified({
      topic: input.topic,
      subtopic: input.subtopic,
      content: input.content,
      source: input.source,
      contradicts_entry_id: contradictsEntryId,
    });
  }

  /**
   * Promote unverified knowledge to trusted when confirmed by someone with authority.
   */
  promoteUnverified(unverifiedId: string, confirmedByName: string): KnowledgeEntry | undefined {
    const person = this.db.getPersonByName(confirmedByName);
    const unverified = this.db.getUnverifiedById(unverifiedId);
    if (!unverified) return undefined;

    const hasAuthority = person ? this.db.hasAuthorityOver(person, unverified.topic) : false;
    if (!hasAuthority) return undefined;

    return this.db.promoteToTrusted(unverifiedId);
  }

  /**
   * Promote unverified knowledge when enough people corroborate it.
   */
  promoteByCorroboration(unverifiedId: string, threshold: number): KnowledgeEntry | null {
    const unverified = this.db.getUnverifiedById(unverifiedId);
    if (!unverified) return null;

    if (unverified.corroboration_count >= threshold) {
      return this.db.promoteToTrusted(unverifiedId) || null;
    }

    return null;
  }

  getUnverifiedKnowledge(): UnverifiedEntry[] {
    return this.db.getAllUnverified();
  }

  getStats(): {
    totalEntries: number;
    topics: string[];
    lastUpdated: string | null;
    totalPeople: number;
    totalUnverified: number;
  } {
    const all = this.db.getAll();
    const topics = [...new Set(all.map((e) => e.topic))];
    const lastUpdated = all.length > 0 ? all[0].last_updated : null;
    const totalPeople = this.db.getAllPeople().length;
    const totalUnverified = this.db.countUnverified();
    return { totalEntries: all.length, topics, lastUpdated, totalPeople, totalUnverified };
  }

  close(): void {
    this.db.close();
  }
}
