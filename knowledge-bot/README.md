# Knowledge Bot

<!-- Write your project description here -->

## Getting Started

### Prerequisites

- Node.js 18+
- One of the following LLM backends:
  - [Ollama](https://ollama.com) (local, no API key needed)
  - Google Gemini API key
  - OpenAI API key

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` to set your provider:

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

### Using Ollama (local)

```bash
# Install Ollama: https://ollama.com
ollama pull llama3
npm run chat
```

### Run

```bash
npm run chat
```

## Chat Commands

| Command | Description |
|---|---|
| `/iam <name>` | Identify yourself to the bot |
| `/db` | Show all trusted knowledge entries |
| `/unverified` | Show unverified entries |
| `/people` | Show registered team members |
| `/prompt` | Show the system prompt |
| `/stats` | Knowledge base statistics |
| `/search <query>` | Semantic search |
| `/help` | Show all commands |
| `/quit` | Exit |

## CLI Inspect

```bash
npm run inspect:db
npm run inspect:people
npm run inspect:unverified
npm run inspect:prompt
```

## Tests

```bash
npm test
npm run test:coverage
```

## License

<!-- Add your license here -->
