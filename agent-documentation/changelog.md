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

Created `agent-documentation/summary.md` documenting the full project: features, commands, configuration, project structure, and test suite.

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
- Created `knowledge-bot/README.md` with setup instructions, configuration table, commands reference, and placeholder sections for project description and license

### Test suite
- Fixed config tests leaking `LLM_MODEL` from real `.env` file
- 120 tests passing across 13 test files, 86% coverage

---

## 2026-04-08 ~21:50 — Documentation Update

- Updated `agent-documentation/summary.md` to reflect all changes: Ollama provider, output stripping, retry logic, updated test counts and coverage, updated config table and project structure
- Created `documentation/changelog.md` tracing the full development history from this chat session

---

## 2026-04-08 ~22:00 — Config Validation + Device-Based Identity + Startup Auto-Restore

Three features addressing startup reliability and identity persistence.

### Config validation on startup

- Added `validateProviderConnection()` in `config.ts`
- For Ollama: pings `{baseUrl}/api/tags` with a 5s timeout to verify the server is running
- For Gemini/OpenAI: checks that the API key is present
- App exits with a clear error message if validation fails
- `index.ts` now calls validation before entering chat
- 3 new config validation tests

### Device-based identity (auto-identification)

- New `device_identities` table in SQLite: maps `device_key` (TEXT PK) → `person_id` (FK to people)
- `device-key.ts`: generates a stable device key from `SHA-256(username@hostname)`, truncated to 16 chars
- On startup, the agent checks if the current device key is linked to a known person — if so, auto-sets `currentUser`
- No `/iam` needed on repeat sessions from the same machine
- When `/iam <name>` matches a registered person, the device key is linked for future sessions
- When a new person is registered via the LLM's `register_person` action, the device key is also linked
- New DB methods: `linkDeviceToPersonId()`, `getPersonIdByDeviceKey()`, `unlinkDevice()`
- 6 new device identity DB tests

### Startup greeting

- `agent.getStartupGreeting()` returns a personalized welcome if auto-identified, or a generic prompt to use `/iam` if not
- TUI chat now uses the agent's startup greeting instead of a hardcoded message
- 7 new startup/auto-restore tests

### Summary

- `KnowledgeAgent` constructor now accepts optional `deviceKey` parameter
- `index.ts` generates device key via `getDeviceKey()` and passes it to the agent
- 136 tests passing across 16 test files, 86% coverage
- Updated `agent-documentation/summary.md` with device identity docs, updated project structure, and test counts
