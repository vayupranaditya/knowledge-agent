import { existsSync, mkdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { loadConfig, validateProviderConnection } from "./config.js";
import { MemoryDB } from "./db/memory-db.js";
import { KnowledgeManager } from "./knowledge/manager.js";
import { createLLMProvider } from "./llm/factory.js";
import { KnowledgeAgent } from "./agent/agent.js";
import { startChat } from "./tui/chat.js";
import { getDeviceKey } from "./device-key.js";

async function main() {
  const args = process.argv.slice(2);

  // Handle inspect flags before loading full config
  if (args.includes("--inspect-prompt")) {
    try {
      const prompt = readFileSync(resolve(process.cwd(), "agent.md"), "utf-8");
      console.log(prompt);
    } catch {
      console.error("Could not read agent.md");
    }
    process.exit(0);
  }

  const config = loadConfig();

  // Validate provider connection before proceeding
  const validation = await validateProviderConnection(config);
  if (!validation.ok) {
    console.error(`Config error: ${validation.error}`);
    process.exit(1);
  }

  // Ensure data directory exists
  if (config.dbPath !== ":memory:") {
    const dataDir = resolve(config.dbPath, "..");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  const db = new MemoryDB(config.dbPath);
  const knowledge = new KnowledgeManager(db);

  if (args.includes("--inspect-db")) {
    const entries = knowledge.listAll();
    if (entries.length === 0) {
      console.log("Knowledge base is empty.");
    } else {
      console.log(`Knowledge Base (${entries.length} entries):\n`);
      for (const e of entries) {
        console.log(`[${e.id.slice(0, 8)}] ${e.topic} > ${e.subtopic}`);
        console.log(`  ${e.content.slice(0, 150)}${e.content.length > 150 ? "..." : ""}`);
        console.log(`  Source: ${e.source} | Updated: ${e.last_updated}\n`);
      }
    }
    knowledge.close();
    process.exit(0);
  }

  if (args.includes("--inspect-people")) {
    const people = db.getAllPeople();
    if (people.length === 0) {
      console.log("No team members registered.");
    } else {
      console.log(`Team Members (${people.length}):\n`);
      for (const p of people) {
        console.log(`  ${p.name} — ${p.role}${p.tags.length > 0 ? ` [${p.tags.join(", ")}]` : ""}`);
      }
    }
    knowledge.close();
    process.exit(0);
  }

  if (args.includes("--inspect-unverified")) {
    const entries = db.getAllUnverified();
    if (entries.length === 0) {
      console.log("No unverified knowledge entries.");
    } else {
      console.log(`Unverified Knowledge (${entries.length} entries):\n`);
      for (const e of entries) {
        console.log(`[${e.id.slice(0, 8)}] ${e.topic} > ${e.subtopic}`);
        console.log(`  ${e.content.slice(0, 150)}${e.content.length > 150 ? "..." : ""}`);
        console.log(`  Source: ${e.source} | Corroborations: ${e.corroboration_count}\n`);
      }
    }
    knowledge.close();
    process.exit(0);
  }

  const deviceKey = getDeviceKey();
  const llm = createLLMProvider(config);
  const agent = new KnowledgeAgent(llm, knowledge, deviceKey);

  console.log(`Using ${config.llmProvider} (${config.model})`);
  startChat(agent);
}

main();
