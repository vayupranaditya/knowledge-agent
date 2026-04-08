import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { loadConfig } from "../config.js";
import { MemoryDB } from "../db/memory-db.js";
import { KnowledgeManager } from "../knowledge/manager.js";
import { createLLMProvider } from "../llm/factory.js";
import { ChatService } from "../service/chat-service.js";
import { createApp } from "./server.js";

async function main() {
  const config = loadConfig();
  const port = config.port;

  // Ensure data directory exists
  if (config.dbPath !== ":memory:") {
    const dataDir = resolve(config.dbPath, "..");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  const db = new MemoryDB(config.dbPath);
  const knowledge = new KnowledgeManager(db);
  const llm = createLLMProvider(config);
  const chatService = new ChatService(llm, knowledge);
  const app = createApp(chatService, knowledge, db);

  app.listen(port, () => {
    console.log(`Knowledge Bot API running on http://localhost:${port}`);
    console.log(`Using ${config.llmProvider} (${config.model})`);
  });
}

main();
