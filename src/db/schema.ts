// --- Knowledge Entries (trusted) ---

export interface KnowledgeEntry {
  id: string;
  topic: string;
  subtopic: string;
  content: string;
  source: string;
  contributed_by: string;
  created_at: string;
  last_updated: string;
}

export interface KnowledgeInput {
  topic: string;
  subtopic: string;
  content: string;
  source: string;
}

export interface SearchResult {
  entry: KnowledgeEntry;
  relevanceScore: number;
}

// --- People ---

export interface Person {
  id: string;
  name: string;
  role: string;
  tags: string[];
  created_at: string;
}

export interface PersonInput {
  name: string;
  role: string;
  tags: string[];
}

// --- Unverified Knowledge (red flag) ---

export interface UnverifiedEntry {
  id: string;
  topic: string;
  subtopic: string;
  content: string;
  source: string;
  contradicts_entry_id: string | null;
  corroboration_count: number;
  corroborated_by: string;
  created_at: string;
}

export interface UnverifiedInput {
  topic: string;
  subtopic: string;
  content: string;
  source: string;
  contradicts_entry_id: string | null;
}

// --- Authority-aware store result ---

export type StoreOutcome = "trusted" | "yellow_flag" | "red_flag";

export interface AuthorityStoreResult {
  outcome: StoreOutcome;
  entry?: KnowledgeEntry;
  unverifiedEntry?: UnverifiedEntry;
  contradicts?: KnowledgeEntry;
  message?: string;
}

// --- SQL ---

export const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    subtopic TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'unknown',
    contributed_by TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_PEOPLE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_UNVERIFIED_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS unverified_knowledge (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    subtopic TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'unknown',
    contradicts_entry_id TEXT,
    corroboration_count INTEGER NOT NULL DEFAULT 1,
    corroborated_by TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export const CREATE_DEVICE_IDENTITY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS device_identities (
    device_key TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    linked_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (person_id) REFERENCES people(id)
  )
`;

export const CREATE_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON knowledge(topic)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_subtopic ON knowledge(subtopic)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_last_updated ON knowledge(last_updated)`,
  `CREATE INDEX IF NOT EXISTS idx_people_name ON people(name)`,
  `CREATE INDEX IF NOT EXISTS idx_unverified_topic ON unverified_knowledge(topic)`,
  `CREATE INDEX IF NOT EXISTS idx_device_person ON device_identities(person_id)`,
];
