# Changelog

## 2026-04-08 ~21:00 — Initial Project Scaffolding

Created the knowledge-bot project from scratch. Set up TypeScript, Vitest, Ink (TUI), SQLite (better-sqlite3), and LLM integrations.

Core features implemented:
- SQLite-backed knowledge database with CRUD operations (topic, subtopic, content, source, timestamps)
- TF-IDF cosine similarity for semantic search across knowledge entries
- Smart store: auto-decides whether to update an existing entry or create a new one based on content drift
- Configurable LLM provider (Gemini default, OpenAI swappable via `.env`)
- Gemini and OpenAI provider implementations
- Agent orchestration with system prompt loaded from `agent.md`
- TUI chat interface using Ink (React-based terminal UI)
- Slash commands: `/db`, `/prompt`, `/stats`, `/search`, `/store`, `/help`, `/quit`
- CLI inspect flags: `--inspect-db`, `--inspect-prompt`
- 59 tests passing, 86.58% coverage

Initial role: the bot acted as a Product Owner (PO) for business and technical knowledge.

---

## 2026-04-08 ~21:10 — Role Change + People Database + Authority & Flagging System

Changed the bot's role from PO to a team assistant that serves everyone.

New features:
- People database: stores team members with name, role, and tags (specialization, skill, topic)
- Identity tracking: `/iam <name>` command to identify yourself; bot greets new people naturally and asks about their role
- Authority system: person's tags determine expertise over topics; authority affects how knowledge is stored
- Yellow flag: when knowledge contradicts existing entries and the person lacks authority, the bot asks for clarification naturally — never mentions authority, flags, or verification to the user
- Red flag: if clarification still doesn't resolve the contradiction, knowledge goes to a separate unverified set
- Promotion: unverified knowledge becomes trusted when confirmed by someone with authority or corroborated by multiple people
- New commands: `/iam <name>`, `/people`, `/unverified`
- New CLI flags: `--inspect-people`, `--inspect-unverified`
- Updated `agent.md` system prompt to reflect team assistant role and contradiction handling guidelines
- Updated `/stats` to include team member and unverified entry counts
- 104 tests passing, 89.4% coverage

---

## 2026-04-08 ~21:15 — Summary Documentation

Created `agent-documentation/summary.md` documenting the full project: features, commands, configuration, and test suite.

---

## 2026-04-08 ~21:25 — Retry Logic + Error Handling

Added automatic retry with exponential backoff for LLM API calls after hitting Gemini free tier quota limits (429 Too Many Requests).

Changes:
- Added `withRetry` helper in `provider.ts` — retries up to 3 times for rate limits (429), quota exceeded, and transient errors (503, 500, ECONNRESET)
- Parses `retry in Xs` hints from error messages for smarter backoff timing
- Non-retryable errors (e.g., invalid API key) fail immediately without retry
- Both Gemini and OpenAI providers wrapped with retry logic
- Added `LLMError` class for structured error handling
- 7 new retry tests
- 111 tests passing

---

## 2026-04-08 ~21:43 — Ollama Provider + Output Stripping + README

Three changes in this session:

### Output stripping
- Bot no longer shows internal JSON action blocks (store, update, red_flag, register_person) to the user
- Actions are processed before stripping, so knowledge storage still works
- Added `stripActionBlocks` method in agent
- 4 new output stripping tests

### Ollama provider (local LLM)
- Added `OllamaProvider` using Ollama's OpenAI-compatible `/v1` API endpoint
- No API key required — runs locally
- Configurable via `LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL`, and `LLM_MODEL` in `.env`
- Default model: `llama3`, default URL: `http://localhost:11434`
- Updated `AppConfig` type to include `ollamaBaseUrl` field
- Updated config to skip API key validation for ollama provider
- Updated factory to create Ollama provider
- Updated `.env.example` with ollama as default provider
- 3 new ollama provider tests, 2 new config tests

### README
- Created `knowledge-bot/README.md` with setup instructions, configuration table, commands reference

### Test suite
- Fixed config tests leaking `LLM_MODEL` from real `.env` file
- 120 tests passing across 13 test files, 86% coverage

---

## 2026-04-08 ~21:50 — Documentation Update

- Updated `agent-documentation/summary.md` to reflect all changes
- Created `documentation/changelog.md` tracing the full development history

---

## 2026-04-08 ~22:10 — Design Document

Created `agent-documentation/design.md` — a comprehensive software design document covering architecture, all components, data model, data flows, the authority/flagging system, tech stack, project structure, testing strategy, and key design decisions.

---

## 2026-04-08 ~22:00 — Config Validation + Device-Based Identity + Startup Auto-Restore

Three features addressing startup reliability and identity persistence.

### Config validation on startup
- Added `validateProviderConnection()` in `config.ts`
- For Ollama: pings `{baseUrl}/api/tags` with a 5s timeout
- For Gemini/OpenAI: checks that the API key is present
- 3 new config validation tests

### Device-based identity (auto-identification)
- New `device_identities` table: maps `device_key` → `person_id`
- `device-key.ts`: generates stable device key from `SHA-256(username@hostname)`
- On startup, agent checks device key → auto-sets `currentUser`
- When `/iam <name>` matches a registered person, device key is linked
- When `register_person` action creates a new person, device key is also linked
- 6 new device identity DB tests

### Startup greeting
- `agent.getStartupGreeting()` returns personalized welcome or generic prompt
- 7 new startup/auto-restore tests

### Summary
- 136 tests passing across 16 test files, 86% coverage

---

## 2026-04-09 ~00:10 — Service Architecture: HTTP API + Chainlit UI

Transformed Knowledge Bot from a CLI-only TUI app into a service-based architecture with HTTP API and Chainlit UI, while preserving the existing TUI.

### New dependencies
- `express` + `cors` for HTTP API server
- `@types/express` + `@types/cors` for type definitions

### Database changes
- Added `sessions` table to schema (`session_id`, `person_id`, `created_at`, `last_active`)
- Added `idx_sessions_person` index
- Added session methods to MemoryDB: `linkSession()`, `getPersonIdBySession()`, `touchSession()`

### Service layer (`src/service/`)
- `ChatService`: headless agent service managing session→agent mapping via `Map<string, KnowledgeAgent>`
  - `handleChat(req)`: creates/reuses sessions, generates UUID session IDs, delegates to KnowledgeAgent
  - Session ID acts as device key — reuses existing `device_identities` infrastructure
- `intent-validator.ts`: validates LLM action intents (store, update, red_flag, register_person) with field-level checks

### HTTP API (`src/api/`)
- `server.ts`: Express app with CORS, JSON parsing, and routes:
  - `POST /chat` — chat with the bot (creates/reuses sessions)
  - `POST /identify` — identify user via `/iam` command
  - `GET /search?q=` — semantic search
  - `GET /people` — list team members
  - `GET /stats` — knowledge base statistics
  - `GET /health` — health check
- `start-server.ts`: entry point that wires config → DB → KnowledgeManager → LLM → ChatService → Express

### Chainlit UI (`chainlit_app/`)
- `chainlit_app.py`: Chainlit frontend that talks to the HTTP API
- `requirements.txt`: chainlit, httpx

### Configuration
- Added `port` field to `AppConfig` (default 3000 from `PORT` env var)
- Updated `.env.example` with `PORT=3000`
- Updated `vitest.config.ts` to exclude `src/api/start-server.ts` from coverage

### Agent change
- Changed `processKnowledgeExtraction` from `private` to `protected` in `agent.ts` (enables subclass override for intent validation)

### Package.json scripts
- `npm run server` — start HTTP API server
- `npm run server:dev` — start with file watching

### Test suite
- 3 new test files: `chat-service.test.ts` (10 tests), `api-server.test.ts` (10 tests), `intent-validator.test.ts` (16 tests)
- 194 tests passing across 20 test files, 90.38% coverage
- All 158 original tests continue to pass unchanged

### Manual verification

Start the API server:
```bash
npm run server
```

Test health endpoint:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

Chat with the bot:
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello, what can you do?"}'
# → {"reply":"...","sessionId":"<uuid>","metadata":{"isNewSession":true}}
```

Continue a conversation:
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me more","sessionId":"<uuid-from-above>"}'
```

Identify yourself:
```bash
curl -X POST http://localhost:3000/identify \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","sessionId":"<uuid>"}'
```

Search knowledge:
```bash
curl "http://localhost:3000/search?q=OAuth"
```

Get stats:
```bash
curl http://localhost:3000/stats
```

Get people:
```bash
curl http://localhost:3000/people
```

Start Chainlit UI (requires Python):
```bash
cd chainlit_app
pip install -r requirements.txt
chainlit run chainlit_app.py
```
