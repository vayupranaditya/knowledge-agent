# Knowledge Bot — Software Design Document

This document describes the architecture, components, data model, and key design decisions of Knowledge Bot. It is the starting point for any AI agent or developer working on this codebase.

## 1. Purpose

Knowledge Bot is an AI-powered chat application that removes knowledge silos within a team. Team members share knowledge through natural conversation, and the bot stores it in a centralized, semantically searchable SQLite database. The bot uses an LLM to understand context, extract knowledge from conversation, and handle contradictions through an authority-based flagging system.

The bot is available through three interfaces: a CLI TUI, an HTTP API, and a Chainlit web UI.

## 2. Architecture Overview

The system follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────┐
│              Presentation Layer                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ TUI      │  │ HTTP API │  │ Chainlit UI   │  │
│  │ chat.ts  │  │ server.ts│  │ (Python)      │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │           │
├───────┼──────────────┼────────────────┼──────────┤
│       │         Service Layer         │           │
│       │    ┌─────────────────┐        │           │
│       │    │  ChatService    │←───────┘           │
│       │    │  (session mgmt) │                    │
│       │    └────────┬────────┘                    │
│       │             │                             │
│       │    ┌────────────────┐                     │
│       │    │IntentValidator │                     │
│       │    └────────────────┘                     │
├───────┼─────────────┼────────────────────────────┤
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

## 3. Entry Points and Startup Flows

### 3.1 TUI Entry Point (`src/index.ts`)

1. Parse CLI flags (`--inspect-db`, `--inspect-people`, `--inspect-unverified`, `--inspect-prompt`)
2. Load config from `.env` via `loadConfig()`
3. Validate provider connection via `validateProviderConnection()`
4. Ensure the `data/` directory exists
5. Initialize `MemoryDB` → `KnowledgeManager` → generate device key → create `KnowledgeAgent`
6. Launch the TUI chat via `startChat(agent)`

### 3.2 HTTP API Entry Point (`src/api/start-server.ts`)

1. Load config from `.env` via `loadConfig()`
2. Ensure the `data/` directory exists
3. Initialize `MemoryDB` → `KnowledgeManager` → create LLM provider
4. Create `ChatService` (manages session→agent mapping)
5. Create Express app via `createApp()`
6. Listen on configured port (default 3000)

### 3.3 Chainlit UI (`chainlit_app/chainlit_app.py`)

- Python Chainlit app that connects to the HTTP API backend
- Manages session IDs in Chainlit's user session
- Sends messages to `POST /chat` and displays replies

## 4. Component Details

### 4.1 Configuration (`src/config.ts`)

Loads environment variables via `dotenv`:

- `LLM_PROVIDER`: `"gemini"` | `"openai"` | `"ollama"` (default: `"ollama"`)
- `GEMINI_API_KEY` / `OPENAI_API_KEY`: required for cloud providers
- `LLM_MODEL`: optional override (defaults: `llama3`, `gemini-2.0-flash`, `gpt-4o-mini`)
- `OLLAMA_BASE_URL`: Ollama server URL (default: `http://localhost:11434`)
- `DB_PATH`: SQLite file path (default: `./data/knowledge.db`)
- `PORT`: HTTP API server port (default: `3000`)

Key exports:

- `AppConfig` — the config type (includes `port: number`)
- `loadConfig()` — reads `.env`, validates provider and API key presence, returns `AppConfig`
- `createTestConfig()` — returns an in-memory config for tests
- `validateProviderConnection()` — pre-startup check

### 4.2 Database Layer (`src/db/`)

#### Schema (`src/db/schema.ts`)

Defines TypeScript interfaces and SQL DDL for five tables:

| Table | Purpose | Key Columns |
| --- | --- | --- |
| `knowledge` | Trusted knowledge entries | id, topic, subtopic, content, source, contributed_by, created_at, last_updated |
| `people` | Registered team members | id, name, role, tags (JSON array), created_at |
| `unverified_knowledge` | Red-flagged entries | id, topic, subtopic, content, source, contradicts_entry_id, corroboration_count, corroborated_by (JSON array), created_at |
| `device_identities` | Device-to-person links | device_key (PK), person_id (FK → people), linked_at |
| `sessions` | HTTP API sessions | session_id (PK), person_id (FK → people, nullable), created_at, last_active |

Indexes exist on: `knowledge.topic`, `knowledge.subtopic`, `knowledge.last_updated`, `people.name`, `unverified_knowledge.topic`, `device_identities.person_id`, `sessions.person_id`.

#### MemoryDB (`src/db/memory-db.ts`)

SQLite wrapper using `better-sqlite3` with WAL journal mode. Provides:

- Knowledge CRUD: `create()`, `getById()`, `update()`, `delete()`, `getAll()`, `searchByTopic()`, `searchByText()`, `count()`
- People CRUD: `createPerson()`, `getPersonById()`, `getPersonByName()`, `updatePerson()`, `getAllPeople()`
- Authority check: `hasAuthorityOver(person, topic)`
- Unverified CRUD: `createUnverified()`, `getUnverifiedById()`, `getAllUnverified()`, `corroborate()`, `promoteToTrusted()`, `deleteUnverified()`, `countUnverified()`
- Device identity: `linkDeviceToPersonId()`, `getPersonIdByDeviceKey()`, `unlinkDevice()`
- Sessions: `linkSession()`, `getPersonIdBySession()`, `touchSession()`

### 4.3 LLM Layer (`src/llm/`)

#### Provider Interface (`src/llm/provider.ts`)

```typescript
interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse>;
}
```

`withRetry(fn, maxRetries=3, baseDelayMs=2000)`: wraps any async function with exponential backoff.

#### Factory (`src/llm/factory.ts`)

`createLLMProvider(config)` — switches on `config.llmProvider` to instantiate the correct provider.

#### Providers

| Provider | File | SDK | Notes |
| --- | --- | --- | --- |
| `GeminiProvider` | `gemini.ts` | `@google/generative-ai` | Uses `systemInstruction` for system prompt |
| `OpenAIProvider` | `openai.ts` | `openai` | Standard chat completions API |
| `OllamaProvider` | `ollama.ts` | `openai` | Reuses OpenAI SDK against Ollama's `/v1` endpoint |

### 4.4 Knowledge Layer (`src/knowledge/`)

#### Embeddings (`src/knowledge/embeddings.ts`)

TF-IDF cosine similarity for semantic search. No external embedding API required.

#### KnowledgeManager (`src/knowledge/manager.ts`)

Central domain logic layer. Key operations:

- `store(input)` — direct insert into trusted knowledge
- `search(query, limit=10)` — semantic search using cosine similarity, threshold 0.15
- `smartStore(input)` — finds related entry via similarity (threshold 0.4); updates if related, creates if not
- `authorityAwareStore(input, personName)` — the core flagging logic (see section 5)
- `escalateToRedFlag(input, contradictsEntryId)` — moves knowledge to unverified set
- `promoteUnverified(unverifiedId, confirmedByName)` — promotes if confirmer has authority
- `promoteByCorroboration(unverifiedId, threshold)` — promotes if corroboration count meets threshold
- `getStats()` — returns entry count, topics, people count, unverified count

### 4.5 Agent Layer (`src/agent/agent.ts`)

`KnowledgeAgent` is the top-level orchestrator. It:

1. Loads the system prompt from `agent.md`
2. Restores user identity from device key on construction
3. Manages conversation history (`LLMMessage[]`)
4. Parses slash commands before sending to LLM
5. Builds a context prompt with knowledge base state and action instructions
6. Sends messages to the LLM
7. Extracts JSON action blocks from LLM responses and processes them
8. Strips action blocks from the response before returning to the user

The `processKnowledgeExtraction` method is `protected` to allow subclass override for intent validation.

### 4.6 Service Layer (`src/service/`)

#### ChatService (`src/service/chat-service.ts`)

Headless agent service for the HTTP API. Manages a `Map<string, KnowledgeAgent>` for session→agent mapping.

- `handleChat(req: ChatRequest)` → `ChatResponse`
  1. If no `sessionId`, generates a UUID and creates a new `KnowledgeAgent` with the session ID as device key
  2. If `sessionId` exists, looks up the agent from the map (or creates a new one)
  3. Calls `agent.chat(req.message)`
  4. Returns `{ reply, sessionId, metadata }` where metadata includes `user` and `isNewSession`
- `getAgent(sessionId)` — returns the agent for a session (used by `/identify` endpoint)

Session IDs act as device keys — this reuses the existing `device_identities` infrastructure without any changes to the agent.

#### Intent Validator (`src/service/intent-validator.ts`)

Validates LLM action intents with field-level checks:

- `store`: requires topic, subtopic, content, source (all non-empty strings)
- `update`: requires id, content
- `red_flag`: requires topic, subtopic, content, source
- `register_person`: requires name, role
- Rejects unknown or missing action types

Returns `ValidatedIntent` with `intent`, `valid`, `data`, and `reason` fields.

### 4.7 HTTP API (`src/api/`)

#### Server (`src/api/server.ts`)

Express app created via `createApp(chatService, knowledge, db)`:

| Method | Path | Handler |
| --- | --- | --- |
| `GET` | `/health` | Returns `{ status: "ok" }` |
| `POST` | `/chat` | Calls `chatService.handleChat()` |
| `POST` | `/identify` | Calls `chatService.handleChat()` with `/iam <name>` |
| `GET` | `/search?q=` | Calls `knowledge.search()` |
| `GET` | `/people` | Calls `db.getAllPeople()` |
| `GET` | `/stats` | Calls `knowledge.getStats()` |

CORS enabled, JSON body parsing.

#### Start Server (`src/api/start-server.ts`)

Entry point that wires: config → DB → KnowledgeManager → LLM → ChatService → Express → listen.

### 4.8 Device Identity (`src/device-key.ts`)

Generates a stable device fingerprint: `SHA-256(username@hostname)` truncated to 16 hex characters.

### 4.9 TUI (`src/tui/chat.ts`)

React/Ink terminal chat interface. Displays last 20 messages, color-coded, with "Thinking..." indicator.

### 4.10 Chainlit UI (`chainlit_app/`)

Python Chainlit app that connects to the HTTP API:
- On chat start: initializes session with no session ID
- On message: sends to `POST /chat` with session ID, stores returned session ID for continuity

## 5. Knowledge Authority and Flagging System

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
            (Bot asks for clarification naturally)
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

### Key Design Rule

The bot never exposes internal mechanics (authority, flags, trust levels, verification) to the user.

## 6. Data Flow: Chat Message Lifecycle

### TUI Flow
```
1. User types message in TUI
2. TUI calls agent.chat(userMessage)
3. Agent checks for slash command → if match, return command result
4. Agent searches knowledge base for relevant entries (top 5)
5. Agent builds context prompt
6. Agent sends [system context + conversation history] to LLM
7. LLM responds with conversational text + optional JSON action block
8. Agent processes JSON action block (store/update/flag/register)
9. Agent strips JSON action blocks from response
10. Cleaned response returned to TUI → displayed to user
```

### HTTP API Flow
```
1. Client sends POST /chat with { message, sessionId? }
2. ChatService creates/reuses session and agent
3. Agent processes message (same as TUI steps 3-9)
4. ChatService returns { reply, sessionId, metadata }
5. Client receives JSON response
```

### Chainlit Flow
```
1. User types message in Chainlit web UI
2. Chainlit sends POST /chat to HTTP API with session ID
3. HTTP API processes via ChatService → Agent (same as above)
4. Chainlit displays the reply
```

## 7. Tech Stack

| Component | Technology |
| --- | --- |
| Language | TypeScript (strict, ES2022, ESNext modules, bundler resolution) |
| Runtime | Node.js 18+ |
| Module system | ESM (`"type": "module"`, `.js` import extensions) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| LLM SDKs | `@google/generative-ai` (Gemini), `openai` (OpenAI + Ollama) |
| HTTP API | Express + cors |
| Web UI | Chainlit (Python) + httpx |
| TUI | Ink 5 + React 18 (`react-jsx` transform) |
| Config | `dotenv` |
| IDs | `uuid` v4 |
| Testing | Vitest 2 + `@vitest/coverage-v8` |
| Build | `tsc` → `dist/` |
| Dev runner | `tsx` |

## 8. Project Structure

```
├── agent.md                    # System prompt (loaded at runtime, editable)
├── .env                        # Runtime config
├── src/
│   ├── index.ts                # TUI entry point
│   ├── config.ts               # AppConfig, loadConfig(), createTestConfig(), validateProviderConnection()
│   ├── device-key.ts           # Device fingerprint
│   ├── agent/
│   │   └── agent.ts            # KnowledgeAgent
│   ├── db/
│   │   ├── schema.ts           # Types + SQL DDL for 5 tables
│   │   └── memory-db.ts        # MemoryDB: all SQLite CRUD
│   ├── knowledge/
│   │   ├── manager.ts          # KnowledgeManager
│   │   └── embeddings.ts       # TF-IDF cosine similarity
│   ├── llm/
│   │   ├── provider.ts         # LLMProvider interface, LLMError, withRetry()
│   │   ├── factory.ts          # createLLMProvider() factory
│   │   ├── gemini.ts           # GeminiProvider
│   │   ├── openai.ts           # OpenAIProvider
│   │   └── ollama.ts           # OllamaProvider
│   ├── service/
│   │   ├── chat-service.ts     # ChatService: session→agent mapping
│   │   └── intent-validator.ts # LLM action intent validation
│   ├── api/
│   │   ├── server.ts           # Express HTTP API
│   │   └── start-server.ts     # API server entry point
│   └── tui/
│       └── chat.ts             # Ink/React terminal chat UI
├── chainlit_app/
│   ├── chainlit_app.py         # Chainlit web UI
│   └── requirements.txt        # Python deps
├── tests/                      # 20 test files, 194+ tests
├── data/                       # SQLite DB files at runtime
└── agent-documentation/        # summary.md, changelog.md, design.md
```

## 9. Testing Strategy

- Framework: Vitest 2 with v8 coverage provider
- Environment: Node
- All tests use in-memory SQLite (`:memory:`)
- LLM provider is mocked in agent/service tests
- Coverage excludes `src/index.ts` (TUI entry point), `src/tui/` (UI layer), `src/api/start-server.ts` (API entry point)

Test areas:

- Database CRUD for all 5 tables
- Knowledge manager: search, smart store, authority-aware store, flagging, promotion
- Agent: command parsing, identity tracking, device restore, LLM integration, action extraction, output stripping
- Embeddings: cosine similarity correctness, ranking behavior
- Config: provider loading, validation, connection checks
- LLM factory: correct provider instantiation
- Retry logic: rate limit handling, transient errors, exponential backoff
- Startup: auto-identify from device key, greeting logic
- Chat service: session creation/reuse, identity tracking, conversation continuity
- API server: all HTTP endpoints (chat, identify, search, people, stats, health)
- Intent validator: field-level validation for all action types

Run: `npm test` | Coverage: `npm run test:coverage`

## 10. Key Design Decisions

1. **TF-IDF over external embeddings**: Local TF-IDF cosine similarity keeps the system self-contained.

2. **Authority via tag matching**: Simple substring matching between person tags and knowledge topics.

3. **Hidden internal mechanics**: The bot never mentions authority, flags, trust levels, or verification to users.

4. **JSON action blocks in LLM output**: Structured JSON blocks for knowledge operations, processed then stripped.

5. **Device-based identity**: Hash of `username@hostname` for auto-identification. Session IDs serve as device keys for the HTTP API.

6. **Ollama via OpenAI SDK**: Reuses the `openai` npm package against Ollama's `/v1` endpoint.

7. **All SQL in MemoryDB**: No raw SQL outside `src/db/`.

8. **System prompt as a file**: `agent.md` loaded from disk at runtime.

9. **Session = Device Key**: The HTTP API reuses the existing `device_identities` infrastructure by treating session IDs as device keys. No separate session-to-identity mapping needed — the agent's existing identity restore logic works transparently.

10. **ChatService as headless agent**: The service layer manages session→agent mapping in memory, allowing multiple concurrent conversations. Each session gets its own `KnowledgeAgent` instance with independent conversation history.

11. **Intent validator as safety layer**: Validates LLM action intents at the field level before they're processed, providing an audit trail and catching malformed actions.

12. **Express for HTTP API**: Lightweight, well-known, minimal setup. CORS enabled for cross-origin access from the Chainlit UI or any other frontend.
