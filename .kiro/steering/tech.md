<!-- Tech stack and build commands for Knowledge Bot -->

# Tech stack

- **Language**: TypeScript (strict mode, ES2022 target, ESNext modules, bundler module resolution)
- **Runtime**: Node.js 18+
- **Package type**: ESM (`"type": "module"` in package.json) — all local imports use `.js` extensions
- **Database**: SQLite via `better-sqlite3` with WAL mode
- **LLM SDKs**: `@google/generative-ai` (Gemini), `openai` (OpenAI and Ollama via OpenAI-compatible API)
- **TUI**: Ink 5 + React 18 (React-based terminal UI with `react-jsx` JSX transform)
- **Config**: `dotenv` for `.env` loading
- **IDs**: `uuid` v4 for all entity IDs
- **Testing**: Vitest 2 with `@vitest/coverage-v8`, globals enabled, node environment
- **Build**: `tsc` (TypeScript compiler), output to `dist/`
- **Dev runner**: `tsx` for direct TypeScript execution

# Common commands

```bash
npm run build          # Compile TypeScript to dist/
npm run chat           # Start the TUI chat (tsx src/index.ts)
npm test               # Run all tests (vitest run)
npm run test:coverage  # Run tests with V8 coverage
```

# Code conventions

- All source imports use `.js` extension (ESM requirement)
- Provider pattern for LLM backends: common `LLMProvider` interface, factory function in `src/llm/factory.ts`
- Database operations are centralized in `MemoryDB` class; no raw SQL outside `src/db/`
- Knowledge logic (search, authority, flagging) lives in `KnowledgeManager`; agent orchestration in `KnowledgeAgent`
- Retry logic with exponential backoff wraps all LLM API calls via `withRetry` helper
- Tests use in-memory SQLite (`:memory:`) via `createTestConfig()` helper
