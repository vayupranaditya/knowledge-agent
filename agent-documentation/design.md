# Knowledge Bot — Software Design Document

This document describes the architecture, components, data model, and key design decisions of Knowledge Bot. It is the starting point for any AI agent or developer working on this codebase.

## 1. Purpose

Knowledge Bot is an AI-powered CLI chat application that removes knowledge silos within a team. Team members share knowledge through natural conversation, and the bot stores it in a centralized, semantically searchable SQLite database. The bot uses an LLM to understand context, extract knowledge from conversation, and handle contradictions through an authority-based flagging system.

## 2. Architecture Overview

The system follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────┐
│                   TUI Layer                      │
│              src/tui/chat.ts                     │
│         (Ink/React terminal interface)           │
├─────────────────────────────────────────────────┤
│                 Agent Layer                       │
│            src/agent/agent.ts                    │
│  (Chat orchestration, commands, action blocks)   │
├──────────────────┬──────────────────────────────┤
│  Knowledge Layer │         LLM Layer             │
│  src/knowledge/  │       src/llm/                │
│  (Search, store, │  (Provider interface,         │
│   authority,     │   factory, retry,             │
│   flagging)      │   Gemini/OpenAI/Ollama)       │
├──────────────────┴──────────────────────────────┤
│               Database Layer                     │
│                src/db/                            │
│     (MemoryDB, schema, all SQL operations)       │
├─────────────────────────────────────────────────┤
│             Config & Identity                    │
│       src/config.ts, src/device-key.ts           │
│   (.env loading, provider validation, device ID) │
└─────────────────────────────────────────────────┘
```

## 3. Entry Point and Startup Flow

File: `src/index.ts`

The startup sequence:

1. Parse CLI flags (`--inspect-db`, `--inspect-people`, `--inspect-unverified`, `--inspect-prompt`)
2. Load config from `.env` via `loadConfig()`
3. Validate provider connection via `validateProviderConnection()` — pings Ollama or checks API key presence
4. Ensure the `data/` directory exists for the SQLite database
5. Initialize `MemoryDB` → `KnowledgeManager` → generate device key → create `KnowledgeAgent`
6. Launch the TUI chat via `startChat(agent)`

If any CLI inspect flag is present, the app prints the requested data and exits without starting the chat.

## 4. Component Details

### 4.1 Configuration (`src/config.ts`)

Loads environment variables via `dotenv`:

- `LLM_PROVIDER`: `"gemini"` | `"openai"` | `"ollama"` (default: `"ollama"`)
- `GEMINI_API_KEY` / `OPENAI_API_KEY`: required for cloud providers
- `LLM_MODEL`: optional override (defaults: `llama3`, `gemini-2.0-flash`, `gpt-4o-mini`)
- `OLLAMA_BASE_URL`: Ollama server URL (default: `http://localhost:11434`)
- `DB_PATH`: SQLite file path (default: `./data/knowledge.db`)

Key exports:

- `AppConfig` — the config type
- `loadConfig()` — reads `.env`, validates provider and API key presence, returns `AppConfig`
- `createTestConfig()` — returns an in-memory config for tests
- `validateProviderConnection()` — pre-startup check: pings Ollama `/api/tags` with 5s timeout, or verifies API key exists for cloud providers

### 4.2 Database Layer (`src/db/`)

#### Schema (`src/db/schema.ts`)

Defines TypeScript interfaces and SQL DDL for four tables:

| Table | Purpose | Key Columns |
| --- | --- | --- |
| `knowledge` | Trusted knowledge entries | id, topic, subtopic, content, source, contributed_by, created_at, last_updated |
| `people` | Registered team members | id, name, role, tags (JSON array), created_at |
| `unverified_knowledge` | Red-flagged entries | id, topic, subtopic, content, source, contradicts_entry_id, corroboration_count, corroborated_by (JSON array), created_at |
| `device_identities` | Device-to-person links | device_key (PK), person_id (FK → people), linked_at |

Indexes exist on: `knowledge.topic`, `knowledge.subtopic`, `knowledge.last_updated`, `people.name`, `unverified_knowledge.topic`, `device_identities.person_id`.

Key TypeScript types: `KnowledgeEntry`, `KnowledgeInput`, `SearchResult`, `Person`, `PersonInput`, `UnverifiedEntry`, `UnverifiedInput`, `AuthorityStoreResult`, `StoreOutcome`.

#### MemoryDB (`src/db/memory-db.ts`)

SQLite wrapper using `better-sqlite3` with WAL journal mode. All SQL lives in this file. Provides:

- Knowledge CRUD: `create()`, `getById()`, `update()`, `delete()`, `getAll()`, `searchByTopic()`, `searchByText()`, `count()`
- People CRUD: `createPerson()`, `getPersonById()`, `getPersonByName()`, `updatePerson()`, `getAllPeople()`
- Authority check: `hasAuthorityOver(person, topic)` — matches person tags against topic string (case-insensitive substring match)
- Unverified CRUD: `createUnverified()`, `getUnverifiedById()`, `getAllUnverified()`, `corroborate()`, `promoteToTrusted()`, `deleteUnverified()`, `countUnverified()`
- Device identity: `linkDeviceToPersonId()`, `getPersonIdByDeviceKey()`, `unlinkDevice()`

Design rule: no raw SQL outside `src/db/`. All other layers go through `MemoryDB`.

### 4.3 LLM Layer (`src/llm/`)

#### Provider Interface (`src/llm/provider.ts`)

```typescript
interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse>;
}
```

- `LLMMessage`: `{ role: "system" | "user" | "assistant", content: string }`
- `LLMResponse`: `{ content: string, usage?: { inputTokens, outputTokens } }`
- `LLMError`: custom error class with `retryable` and `retryAfterMs` fields

`withRetry(fn, maxRetries=3, baseDelayMs=2000)`: wraps any async function with exponential backoff. Retries on rate limits (429, quota) and transient errors (503, 500, ECONNRESET). Parses `retry in Xs` hints from error messages. Non-retryable errors fail immediately.

#### Factory (`src/llm/factory.ts`)

`createLLMProvider(config)` — switches on `config.llmProvider` to instantiate the correct provider.

#### Providers

| Provider | File | SDK | Notes |
| --- | --- | --- | --- |
| `GeminiProvider` | `gemini.ts` | `@google/generative-ai` | Uses `systemInstruction` for system prompt, chat history API |
| `OpenAIProvider` | `openai.ts` | `openai` | Standard chat completions API |
| `OllamaProvider` | `ollama.ts` | `openai` | Reuses OpenAI SDK against Ollama's `/v1` endpoint, no API key needed |

All providers wrap their API call with `withRetry()`.

### 4.4 Knowledge Layer (`src/knowledge/`)

#### Embeddings (`src/knowledge/embeddings.ts`)

TF-IDF cosine similarity for semantic search. No external embedding API required.

- `cosineSimilarity(textA, textB)` — tokenizes, computes term frequency, returns cosine similarity score (0–1)
- `rankBySimilarity(query, documents)` — ranks documents by similarity to query, sorted descending

Tokenization: lowercase, strip non-word characters, split on whitespace, filter tokens with length > 1.

#### KnowledgeManager (`src/knowledge/manager.ts`)

Central domain logic layer. Key operations:

- `store(input)` — direct insert into trusted knowledge
- `search(query, limit=10)` — semantic search using cosine similarity, threshold 0.15
- `smartStore(input)` — finds related entry via similarity (threshold 0.4); updates if related, creates if not
- `findRelatedEntry(topic, content)` — returns the most similar existing entry above drift threshold (0.4)
- `authorityAwareStore(input, personName)` — the core flagging logic (see section 5)
- `escalateToRedFlag(input, contradictsEntryId)` — moves knowledge to unverified set
- `promoteUnverified(unverifiedId, confirmedByName)` — promotes if confirmer has authority
- `promoteByCorroboration(unverifiedId, threshold)` — promotes if corroboration count meets threshold
- `getStats()` — returns entry count, topics, people count, unverified count

Thresholds:

- `SIMILARITY_THRESHOLD = 0.15` — minimum score for search results
- `DRIFT_THRESHOLD = 0.4` — minimum score to consider entries "related" for smart store/authority checks

### 4.5 Agent Layer (`src/agent/agent.ts`)

`KnowledgeAgent` is the top-level orchestrator. It:

1. Loads the system prompt from `agent.md` at the project root
2. Restores user identity from device key on construction
3. Manages conversation history (`LLMMessage[]`)
4. Parses slash commands before sending to LLM
5. Builds a context prompt with: system prompt + current user info + knowledge base stats + relevant search results + JSON action instructions
6. Sends messages to the LLM
7. Extracts JSON action blocks from LLM responses and processes them
8. Strips action blocks from the response before returning to the user

#### Slash Commands

| Command | Handler | Description |
| --- | --- | --- |
| `/iam <name>` | `handleIdentify()` | Links device key, sets current user |
| `/db`, `/inspect db` | `inspectDB()` | Lists all trusted knowledge |
| `/unverified` | `inspectUnverified()` | Lists red-flagged entries |
| `/people` | `inspectPeople()` | Lists team members |
| `/prompt`, `/inspect prompt` | returns `systemPrompt` | Shows agent.md content |
| `/stats` | `showStats()` | Knowledge base statistics |
| `/search <query>` | `searchKnowledge()` | Semantic search |
| `/store` | returns guidance text | Guided knowledge storage |
| `/help` | `showHelp()` | Lists all commands |

#### JSON Action Blocks

The LLM is instructed (via the context prompt) to append JSON blocks to its response for knowledge operations. The agent processes these before stripping them:

- `{"action":"store", "topic":"...", "subtopic":"...", "content":"...", "source":"..."}` — stores new knowledge via `authorityAwareStore()`
- `{"action":"update", "id":"...", "content":"...", "source":"..."}` — updates existing entry
- `{"action":"red_flag", "topic":"...", "subtopic":"...", "content":"...", "source":"...", "contradicts_entry_id":"..."}` — escalates to unverified
- `{"action":"register_person", "name":"...", "role":"...", "tags":[...]}` — registers or updates a team member

The `stripActionBlocks()` method removes these blocks via regex so the user never sees internal mechanics.

### 4.6 Device Identity (`src/device-key.ts`)

Generates a stable device fingerprint: `SHA-256(username@hostname)` truncated to 16 hex characters. This allows auto-identification on repeat sessions without requiring `/iam` each time.

Flow:

1. On startup, `getDeviceKey()` generates the key
2. `KnowledgeAgent` constructor calls `restoreIdentity()` — looks up device key in `device_identities` table
3. If found, sets `currentUser` and shows a personalized greeting
4. When `/iam <name>` matches a known person, the device key is linked via `linkDeviceToPersonId()`
5. When `register_person` action creates a new person, the device key is also linked

### 4.7 TUI (`src/tui/chat.ts`)

React/Ink terminal chat interface. Components:

- `Chat` — main component with message list, input field, processing indicator
- Displays last 20 messages, color-coded: green (user), blue (bot), yellow (system)
- Shows "Thinking..." indicator during LLM calls
- Handles `/quit` and `/exit` to exit the app

## 5. Knowledge Authority and Flagging System

This is the core domain logic that governs how knowledge is validated and stored.

### Flow Diagram

```
User shares knowledge
        │
        ▼
  LLM extracts JSON action block
        │
        ▼
  authorityAwareStore(input, personName)
        │
        ├─── Person has authority (tags match topic)?
        │         │
        │        YES → smartStore() → TRUSTED
        │
        ├─── No related/contradicting entry exists?
        │         │
        │        YES → create() → TRUSTED
        │
        └─── Related entry exists + no authority
                  │
                  ▼
            YELLOW FLAG
            (Bot asks for clarification naturally,
             never mentions authority/flags)
                  │
                  ▼
         Still contradicts after clarification?
                  │
                 YES → escalateToRedFlag() → UNVERIFIED
                  │
                  ▼
            RED FLAG (in unverified_knowledge table)
                  │
                  ├─── Authority confirms → promoteToTrusted() → TRUSTED
                  └─── Corroboration threshold met → promoteToTrusted() → TRUSTED
```

### Authority Determination

`MemoryDB.hasAuthorityOver(person, topic)`: returns `true` if any of the person's tags (case-insensitive) is a substring of the topic, or the topic is a substring of any tag.

Example: Person with tags `["auth", "security"]` has authority over topic `"authentication"` because `"auth"` is a substring of `"authentication"`.

### Key Design Rule

The bot never exposes internal mechanics (authority, flags, trust levels, verification) to the user. All contradiction handling appears as natural, friendly conversation.

## 6. Data Flow: Chat Message Lifecycle

```
1. User types message in TUI
2. TUI calls agent.chat(userMessage)
3. Agent checks for slash command → if match, return command result
4. Agent searches knowledge base for relevant entries (top 5)
5. Agent builds context prompt:
   - System prompt (agent.md)
   - Current user info (name, role, tags)
   - Knowledge base stats
   - Relevant search results with scores
   - JSON action instructions for the LLM
6. Agent appends user message to conversation history
7. Agent sends [system context + conversation history] to LLM
8. LLM responds with conversational text + optional JSON action block
9. Agent processes JSON action block (store/update/flag/register)
10. Agent strips JSON action blocks from response
11. Agent appends cleaned response to conversation history
12. Cleaned response returned to TUI → displayed to user
```

## 7. Tech Stack

| Component | Technology |
| --- | --- |
| Language | TypeScript (strict, ES2022, ESNext modules, bundler resolution) |
| Runtime | Node.js 18+ |
| Module system | ESM (`"type": "module"`, `.js` import extensions) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| LLM SDKs | `@google/generative-ai` (Gemini), `openai` (OpenAI + Ollama) |
| TUI | Ink 5 + React 18 (`react-jsx` transform) |
| Config | `dotenv` |
| IDs | `uuid` v4 |
| Testing | Vitest 2 + `@vitest/coverage-v8` |
| Build | `tsc` → `dist/` |
| Dev runner | `tsx` |

## 8. Project Structure

```
├── agent.md                    # System prompt (loaded at runtime, editable)
├── .env                        # Runtime config (LLM provider, API keys, DB path)
├── src/
│   ├── index.ts                # Entry point: CLI flags, config, startup validation, TUI launch
│   ├── config.ts               # AppConfig, loadConfig(), createTestConfig(), validateProviderConnection()
│   ├── device-key.ts           # Device fingerprint: SHA-256(username@hostname)
│   ├── agent/
│   │   └── agent.ts            # KnowledgeAgent: orchestration, commands, identity, action extraction
│   ├── db/
│   │   ├── schema.ts           # TypeScript types + SQL DDL for all 4 tables
│   │   └── memory-db.ts        # MemoryDB: all SQLite CRUD operations
│   ├── knowledge/
│   │   ├── manager.ts          # KnowledgeManager: search, smart store, authority, flagging, promotion
│   │   └── embeddings.ts       # TF-IDF cosine similarity
│   ├── llm/
│   │   ├── provider.ts         # LLMProvider interface, LLMError, withRetry()
│   │   ├── factory.ts          # createLLMProvider() factory
│   │   ├── gemini.ts           # GeminiProvider
│   │   ├── openai.ts           # OpenAIProvider
│   │   └── ollama.ts           # OllamaProvider (OpenAI-compatible /v1 endpoint)
│   └── tui/
│       └── chat.ts             # Ink/React terminal chat UI
├── tests/                      # 18 test files, 136+ tests
├── data/                       # SQLite DB files at runtime
└── agent-documentation/        # summary.md, changelog.md, design.md
```

## 9. Testing Strategy

- Framework: Vitest 2 with v8 coverage provider
- Environment: Node
- All tests use in-memory SQLite (`:memory:`) via `createTestConfig()`
- LLM provider is mocked in agent tests
- Coverage excludes `src/index.ts` (entry point) and `src/tui/` (UI layer)

Test areas:

- Database CRUD for all 4 tables (knowledge, people, unverified, device_identities)
- Knowledge manager: search, smart store, authority-aware store, flagging, promotion
- Agent: command parsing, identity tracking, device restore, LLM integration, action extraction, output stripping
- Embeddings: cosine similarity correctness, ranking behavior
- Config: provider loading, validation, connection checks
- LLM factory: correct provider instantiation
- Retry logic: rate limit handling, transient errors, exponential backoff
- Startup: auto-identify from device key, greeting logic

Run: `npm test` | Coverage: `npm run test:coverage`

## 10. Key Design Decisions

1. **TF-IDF over external embeddings**: Semantic search uses local TF-IDF cosine similarity instead of an external embedding API. This keeps the system self-contained and avoids additional API costs. Can be swapped for real embeddings later.

2. **Authority via tag matching**: Simple substring matching between person tags and knowledge topics. Lightweight but effective for team-scale usage.

3. **Hidden internal mechanics**: The bot never mentions authority, flags, trust levels, or verification to users. All contradiction handling is surfaced as natural conversation. This is enforced in the system prompt and the agent's context prompt instructions.

4. **JSON action blocks in LLM output**: The LLM is instructed to append structured JSON blocks for knowledge operations. The agent processes these then strips them before showing the response. This keeps the LLM's conversational output clean while enabling structured data extraction.

5. **Device-based identity**: Uses a hash of `username@hostname` for auto-identification. Simple, no login required, works across restarts on the same machine.

6. **Ollama via OpenAI SDK**: The Ollama provider reuses the `openai` npm package against Ollama's OpenAI-compatible `/v1` endpoint, avoiding a separate Ollama client dependency.

7. **All SQL in MemoryDB**: No raw SQL outside `src/db/`. This centralizes data access and makes it easy to change the storage layer.

8. **System prompt as a file**: `agent.md` is loaded from disk at runtime, making it editable without code changes.
