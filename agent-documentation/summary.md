# Knowledge Bot — Summary

An AI-powered CLI chat bot that removes knowledge silos by compiling knowledge from everyone on the team into a centralized, semantically searchable knowledge base.

## What It Does

- Acts as a team assistant — anyone can ask questions or share knowledge.
- Stores knowledge in a SQLite database with metadata: topic, subtopic, source, timestamps.
- Bridges the gap between stored information and what people are looking for via TF-IDF cosine similarity search.
- Configurable LLM backend — Ollama (local, default), Gemini, or OpenAI, swappable via `.env`.
- Internal actions (JSON blocks for knowledge storage/flagging) are stripped from bot output — users only see the conversational response.
- Validates provider connection on startup before entering chat.

## Device-Based Identity

- On startup, the bot generates a device key from the machine's hostname and OS username (SHA-256 hash).
- If the device key is linked to a known person in the DB, the bot auto-identifies the user — no `/iam` needed on repeat sessions.
- When a user runs `/iam <name>` and matches a registered person, the device key is linked to that person for future sessions.
- When a new person is registered via the LLM's `register_person` action, the device key is also linked.
- Device links are stored in a `device_identities` table (device_key → person_id).

## People & Authority

- Maintains a people database (name, role, tags for specialization/skill/topic).
- When the bot meets someone new, it asks who they are and what they do — naturally, like a colleague.
- Tags determine authority: a person's tags are matched against knowledge topics.
- Higher authority = knowledge is stored directly as trusted.
- Lower authority = if the knowledge contradicts existing entries, the bot asks for clarification (yellow flag) without mentioning authority or flagging.

## Flagging System

- **Yellow flag**: Knowledge seems off compared to what's already stored. The bot asks for clarification in a friendly, natural way. No internal mechanics are exposed to the user.
- **Red flag**: After clarification, if the info still contradicts existing knowledge, it goes into a separate unverified knowledge set.
- **Promotion**: Unverified knowledge becomes trusted when:
  - Someone with authority over the topic confirms it, OR
  - Multiple people corroborate it (configurable threshold).

## TUI Chat Commands

| Command | Description |
|---|---|
| `/iam <name>` | Identify yourself to the bot |
| `/db` or `/inspect db` | Show all trusted knowledge entries |
| `/unverified` | Show red-flagged (unverified) entries |
| `/people` | Show all registered team members |
| `/prompt` or `/inspect prompt` | Show the system prompt (agent.md) |
| `/stats` | Knowledge base statistics (entries, people, unverified) |
| `/search <query>` | Semantic search across the knowledge base |
| `/store` | Guided knowledge storage |
| `/help` | Show all commands |
| `/quit` or `/exit` | Exit the bot |

## CLI Inspect Flags

```bash
npm run chat                    # Start TUI chat
npm run inspect:db              # Inspect trusted knowledge from CLI
npm run inspect:people          # Inspect registered team members
npm run inspect:unverified      # Inspect red-flagged knowledge
npm run inspect:prompt          # View the system prompt (agent.md)
```

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Description | Default |
|---|---|---|
| `LLM_PROVIDER` | `ollama`, `gemini`, or `openai` | `ollama` |
| `GEMINI_API_KEY` | Gemini API key (cloud only) | — |
| `OPENAI_API_KEY` | OpenAI API key (cloud only) | — |
| `LLM_MODEL` | Model name override | per-provider default |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `DB_PATH` | SQLite database path | `./data/knowledge.db` |

Default models per provider:

| Provider | Default Model |
|---|---|
| `ollama` | `llama3` |
| `gemini` | `gemini-2.0-flash` |
| `openai` | `gpt-4o-mini` |

## Error Handling

- LLM API calls have automatic retry with exponential backoff (up to 3 retries).
- Handles rate limits (429), quota exceeded, and transient errors (503, 500, ECONNRESET).
- Parses `retry in Xs` hints from error messages when available.
- Non-retryable errors (e.g., invalid API key) fail immediately.
- Provider connection is validated on startup — Ollama reachability check, API key presence for cloud providers.

## Project Structure

```
knowledge-bot/
├── agent.md                    # System prompt (inspectable, editable)
├── README.md                   # Project readme
├── src/
│   ├── index.ts                # Entry point — TUI chat + CLI flags + startup validation
│   ├── config.ts               # LLM provider config + connection validation
│   ├── device-key.ts           # Device fingerprint generation (hostname + username hash)
│   ├── db/
│   │   ├── schema.ts           # Types + SQL for knowledge, people, unverified, device_identities
│   │   └── memory-db.ts        # SQLite operations (knowledge, people, unverified, device links)
│   ├── llm/
│   │   ├── provider.ts         # LLM provider interface + retry logic
│   │   ├── gemini.ts           # Gemini implementation
│   │   ├── openai.ts           # OpenAI implementation
│   │   ├── ollama.ts           # Ollama implementation (local, OpenAI-compatible API)
│   │   └── factory.ts          # Provider factory
│   ├── knowledge/
│   │   ├── manager.ts          # Knowledge CRUD, authority-aware store, flagging, promotion
│   │   └── embeddings.ts       # TF-IDF cosine similarity for semantic search
│   ├── agent/
│   │   └── agent.ts            # Agent orchestration, identity tracking, device restore, commands
│   └── tui/
│       └── chat.ts             # Ink-based TUI chat interface
├── tests/                      # 136 tests, ~86% coverage
└── data/                       # SQLite DB at runtime
```

## Test Suite

136 tests across 16 test files covering:
- Memory DB operations (knowledge, people, unverified, device identity CRUD)
- Knowledge manager (search, smart store, authority-aware store, flagging, promotion)
- Agent (commands, identity tracking, device restore, LLM integration, knowledge extraction, output stripping)
- Embeddings (cosine similarity, ranking)
- Config (provider loading, validation, ollama support, connection validation)
- LLM provider factory (gemini, openai, ollama)
- Retry logic (rate limits, transient errors, backoff)
- Startup (auto-identify from device key, device linking on /iam, startup greeting)

Run tests: `npm test`
Run with coverage: `npm run test:coverage`
