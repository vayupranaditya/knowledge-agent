<!-- Product overview for Knowledge Bot -->

# Knowledge Bot

An AI-powered CLI chat bot that removes knowledge silos within a team. Team members share knowledge through natural conversation, and the bot stores it in a searchable, centralized knowledge base backed by SQLite.

## Core concepts

- **Knowledge entries**: structured facts stored with topic, subtopic, content, source, and timestamps
- **People & authority**: team members register with a role and expertise tags; tags determine authority over topics
- **Flagging system**: contradictions are handled through yellow flags (ask for clarification) and red flags (unverified set); unverified knowledge can be promoted by authority or corroboration
- **Device identity**: a stable device key (SHA-256 of username@hostname) auto-identifies returning users without needing `/iam` each session
- **Semantic search**: TF-IDF cosine similarity ranks knowledge entries by relevance to a query

## Key behaviors

- The bot never exposes internal mechanics (authority, flags, trust levels) to users
- LLM responses may contain JSON action blocks for knowledge storage; these are processed then stripped before showing the user
- The system prompt lives in `agent.md` at the project root and is loaded at runtime
- Configuration is via `.env` with support for Ollama (local), Gemini, and OpenAI as LLM backends
