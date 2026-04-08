<!-- Project structure for Knowledge Bot -->

# Project structure

```
├── agent.md                  # System prompt loaded at runtime (editable)
├── .env                      # Runtime config (LLM provider, API keys, DB path)
├── src/
│   ├── index.ts              # Entry point: config loading, startup validation, CLI flags, launches TUI
│   ├── config.ts             # AppConfig type, loadConfig(), createTestConfig(), validateProviderConnection()
│   ├── device-key.ts         # Generates stable device fingerprint from hostname + username
│   ├── agent/
│   │   └── agent.ts          # KnowledgeAgent: chat orchestration, slash commands, identity, action extraction
│   ├── db/
│   │   ├── schema.ts         # TypeScript types and SQL DDL for all tables (knowledge, people, unverified, device_identities)
│   │   └── memory-db.ts      # MemoryDB: all SQLite CRUD operations
│   ├── knowledge/
│   │   ├── manager.ts        # KnowledgeManager: search, smart store, authority-aware store, flagging, promotion
│   │   └── embeddings.ts     # TF-IDF cosine similarity for semantic search
│   ├── llm/
│   │   ├── provider.ts       # LLMProvider interface, LLMError, withRetry helper
│   │   ├── factory.ts        # createLLMProvider() factory
│   │   ├── gemini.ts         # GeminiProvider
│   │   ├── openai.ts         # OpenAIProvider
│   │   └── ollama.ts         # OllamaProvider (uses OpenAI-compatible /v1 endpoint)
│   └── tui/
│       └── chat.ts           # Ink/React TUI chat interface
├── tests/                    # Vitest test files (*.test.ts)
├── data/                     # SQLite DB files at runtime
└── agent-documentation/      # Auto-maintained docs: summary.md, changelog.md
```

# Layer responsibilities

- **agent**: top-level orchestration, user-facing commands, LLM interaction, action block processing
- **knowledge**: domain logic for storing, searching, and validating knowledge; authority and flagging rules
- **db**: data access layer; all SQL lives here; schema definitions and CRUD
- **llm**: provider abstraction; each backend implements `LLMProvider` interface; retry logic shared
- **tui**: presentation layer; Ink-based terminal chat UI
- **config**: environment loading and provider connection validation
