import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import {
  KnowledgeEntry,
  KnowledgeInput,
  Person,
  PersonInput,
  UnverifiedEntry,
  UnverifiedInput,
  CREATE_TABLE_SQL,
  CREATE_PEOPLE_TABLE_SQL,
  CREATE_UNVERIFIED_TABLE_SQL,
  CREATE_DEVICE_IDENTITY_TABLE_SQL,
  CREATE_SESSIONS_TABLE_SQL,
  CREATE_INDEX_SQL,
} from "./schema.js";

export class MemoryDB {
  private db: Database.Database;

  constructor(dbPath: string = "./data/knowledge.db") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(CREATE_TABLE_SQL);
    this.db.exec(CREATE_PEOPLE_TABLE_SQL);
    this.db.exec(CREATE_UNVERIFIED_TABLE_SQL);
    this.db.exec(CREATE_DEVICE_IDENTITY_TABLE_SQL);
    this.db.exec(CREATE_SESSIONS_TABLE_SQL);
    for (const sql of CREATE_INDEX_SQL) {
      this.db.exec(sql);
    }
  }

  // ==================== Knowledge CRUD ====================

  create(input: KnowledgeInput): KnowledgeEntry {
    const id = uuidv4();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO knowledge (id, topic, subtopic, content, source, contributed_by, created_at, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.topic, input.subtopic, input.content, input.source, input.source, now, now);
    return this.getById(id)!;
  }

  getById(id: string): KnowledgeEntry | undefined {
    const stmt = this.db.prepare("SELECT * FROM knowledge WHERE id = ?");
    return stmt.get(id) as KnowledgeEntry | undefined;
  }

  update(id: string, updates: Partial<KnowledgeInput>): KnowledgeEntry | undefined {
    const existing = this.getById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.topic !== undefined) {
      fields.push("topic = ?");
      values.push(updates.topic);
    }
    if (updates.subtopic !== undefined) {
      fields.push("subtopic = ?");
      values.push(updates.subtopic);
    }
    if (updates.content !== undefined) {
      fields.push("content = ?");
      values.push(updates.content);
    }
    if (updates.source !== undefined) {
      fields.push("source = ?");
      values.push(updates.source);
      fields.push("contributed_by = ?");
      values.push(updates.source);
    }

    if (fields.length === 0) return existing;

    fields.push("last_updated = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE knowledge SET ${fields.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM knowledge WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getAll(): KnowledgeEntry[] {
    const stmt = this.db.prepare("SELECT * FROM knowledge ORDER BY last_updated DESC");
    return stmt.all() as KnowledgeEntry[];
  }

  searchByTopic(topic: string): KnowledgeEntry[] {
    const stmt = this.db.prepare(
      "SELECT * FROM knowledge WHERE topic LIKE ? ORDER BY last_updated DESC"
    );
    return stmt.all(`%${topic}%`) as KnowledgeEntry[];
  }

  searchByText(query: string): KnowledgeEntry[] {
    const stmt = this.db.prepare(
      `SELECT * FROM knowledge
       WHERE content LIKE ? OR topic LIKE ? OR subtopic LIKE ?
       ORDER BY last_updated DESC`
    );
    const pattern = `%${query}%`;
    return stmt.all(pattern, pattern, pattern) as KnowledgeEntry[];
  }

  count(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM knowledge");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  // ==================== People CRUD ====================

  createPerson(input: PersonInput): Person {
    const id = uuidv4();
    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(input.tags);
    const stmt = this.db.prepare(`
      INSERT INTO people (id, name, role, tags, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, input.name, input.role, tagsJson, now);
    return this.getPersonById(id)!;
  }

  getPersonById(id: string): Person | undefined {
    const stmt = this.db.prepare("SELECT * FROM people WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return { ...row, tags: JSON.parse(row.tags) };
  }

  getPersonByName(name: string): Person | undefined {
    const stmt = this.db.prepare("SELECT * FROM people WHERE LOWER(name) = LOWER(?)");
    const row = stmt.get(name) as any;
    if (!row) return undefined;
    return { ...row, tags: JSON.parse(row.tags) };
  }

  updatePerson(id: string, updates: Partial<PersonInput>): Person | undefined {
    const existing = this.getPersonById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.role !== undefined) {
      fields.push("role = ?");
      values.push(updates.role);
    }
    if (updates.tags !== undefined) {
      fields.push("tags = ?");
      values.push(JSON.stringify(updates.tags));
    }

    if (fields.length === 0) return existing;

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE people SET ${fields.join(", ")} WHERE id = ?`
    );
    stmt.run(...values);
    return this.getPersonById(id);
  }

  getAllPeople(): Person[] {
    const stmt = this.db.prepare("SELECT * FROM people ORDER BY name");
    const rows = stmt.all() as any[];
    return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) }));
  }

  /**
   * Check if a person has authority over a topic based on their tags.
   */
  hasAuthorityOver(person: Person, topic: string): boolean {
    const lowerTopic = topic.toLowerCase();
    return person.tags.some((tag) => lowerTopic.includes(tag.toLowerCase()) || tag.toLowerCase().includes(lowerTopic));
  }

  // ==================== Unverified Knowledge CRUD ====================

  createUnverified(input: UnverifiedInput): UnverifiedEntry {
    const id = uuidv4();
    const now = new Date().toISOString();
    const corroboratedBy = JSON.stringify([input.source]);
    const stmt = this.db.prepare(`
      INSERT INTO unverified_knowledge (id, topic, subtopic, content, source, contradicts_entry_id, corroboration_count, corroborated_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    stmt.run(id, input.topic, input.subtopic, input.content, input.source, input.contradicts_entry_id, corroboratedBy, now);
    return this.getUnverifiedById(id)!;
  }

  getUnverifiedById(id: string): UnverifiedEntry | undefined {
    const stmt = this.db.prepare("SELECT * FROM unverified_knowledge WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return { ...row, corroborated_by: row.corroborated_by };
  }

  getAllUnverified(): UnverifiedEntry[] {
    const stmt = this.db.prepare("SELECT * FROM unverified_knowledge ORDER BY created_at DESC");
    return stmt.all() as UnverifiedEntry[];
  }

  corroborate(id: string, personName: string): UnverifiedEntry | undefined {
    const existing = this.getUnverifiedById(id);
    if (!existing) return undefined;

    const corroborators: string[] = JSON.parse(existing.corroborated_by);
    if (corroborators.includes(personName)) return existing;

    corroborators.push(personName);
    const stmt = this.db.prepare(`
      UPDATE unverified_knowledge
      SET corroboration_count = ?, corroborated_by = ?
      WHERE id = ?
    `);
    stmt.run(corroborators.length, JSON.stringify(corroborators), id);
    return this.getUnverifiedById(id);
  }

  promoteToTrusted(unverifiedId: string): KnowledgeEntry | undefined {
    const unverified = this.getUnverifiedById(unverifiedId);
    if (!unverified) return undefined;

    const entry = this.create({
      topic: unverified.topic,
      subtopic: unverified.subtopic,
      content: unverified.content,
      source: unverified.source,
    });

    this.deleteUnverified(unverifiedId);
    return entry;
  }

  deleteUnverified(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM unverified_knowledge WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  countUnverified(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM unverified_knowledge");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  // ==================== Device Identity ====================

  linkDeviceToPersonId(deviceKey: string, personId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO device_identities (device_key, person_id, linked_at)
      VALUES (?, ?, ?)
      ON CONFLICT(device_key) DO UPDATE SET person_id = ?, linked_at = ?
    `);
    const now = new Date().toISOString();
    stmt.run(deviceKey, personId, now, personId, now);
  }

  getPersonIdByDeviceKey(deviceKey: string): string | undefined {
    const stmt = this.db.prepare("SELECT person_id FROM device_identities WHERE device_key = ?");
    const row = stmt.get(deviceKey) as { person_id: string } | undefined;
    return row?.person_id;
  }

  unlinkDevice(deviceKey: string): boolean {
    const stmt = this.db.prepare("DELETE FROM device_identities WHERE device_key = ?");
    const result = stmt.run(deviceKey);
    return result.changes > 0;
  }

  // ==================== Sessions ====================

  linkSession(sessionId: string, personId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_id, person_id, last_active)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET person_id = ?, last_active = datetime('now')
    `);
    stmt.run(sessionId, personId, personId);
  }

  getPersonIdBySession(sessionId: string): string | undefined {
    const stmt = this.db.prepare("SELECT person_id FROM sessions WHERE session_id = ?");
    const row = stmt.get(sessionId) as { person_id: string } | undefined;
    return row?.person_id ?? undefined;
  }

  touchSession(sessionId: string): void {
    const stmt = this.db.prepare("UPDATE sessions SET last_active = datetime('now') WHERE session_id = ?");
    stmt.run(sessionId);
  }

  close(): void {
    this.db.close();
  }
}
