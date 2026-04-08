import { readFileSync } from "fs";
import { resolve } from "path";
import { LLMProvider, LLMMessage } from "../llm/provider.js";
import { KnowledgeManager } from "../knowledge/manager.js";
import { SearchResult, Person } from "../db/schema.js";
import { MemoryDB } from "../db/memory-db.js";

export class KnowledgeAgent {
  private llm: LLMProvider;
  private knowledge: KnowledgeManager;
  private db: MemoryDB;
  private systemPrompt: string;
  private conversationHistory: LLMMessage[] = [];
  private currentUser: string | null = null;
  private deviceKey: string | null = null;

  constructor(llm: LLMProvider, knowledge: KnowledgeManager, deviceKey?: string) {
    this.llm = llm;
    this.knowledge = knowledge;
    this.db = (knowledge as any).db as MemoryDB;
    this.deviceKey = deviceKey ?? null;
    this.systemPrompt = this.loadSystemPrompt();
    this.restoreIdentity();
  }

  private loadSystemPrompt(): string {
    try {
      const agentMdPath = resolve(process.cwd(), "agent.md");
      return readFileSync(agentMdPath, "utf-8");
    } catch {
      return "You are a helpful knowledge management assistant for the team.";
    }
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  getCurrentUser(): string | null {
    return this.currentUser;
  }

  /**
   * Restore identity from device key on startup.
   */
  private restoreIdentity(): void {
    if (!this.deviceKey) return;

    const personId = this.db.getPersonIdByDeviceKey(this.deviceKey);
    if (!personId) return;

    const person = this.db.getPersonById(personId);
    if (person) {
      this.currentUser = person.name;
    }
  }

  /**
   * Returns a startup greeting based on whether the user was auto-identified.
   */
  getStartupGreeting(): string {
    if (this.currentUser) {
      const person = this.db.getPersonByName(this.currentUser);
      if (person) {
        return `Welcome back, ${person.name}! (${person.role}${person.tags.length > 0 ? ` — ${person.tags.join(", ")}` : ""})`;
      }
      return `Welcome back, ${this.currentUser}!`;
    }
    return "Knowledge Bot ready. Type /iam <name> to identify yourself, or /help for commands.";
  }

  async chat(userMessage: string): Promise<string> {
    const command = this.parseCommand(userMessage);
    if (command) return command;

    const searchResults = this.knowledge.search(userMessage, 5);
    const stats = this.knowledge.getStats();
    const currentPerson = this.currentUser
      ? this.db.getPersonByName(this.currentUser) ?? null
      : null;

    const contextPrompt = this.buildContextPrompt(searchResults, stats, currentPerson);

    this.conversationHistory.push({ role: "user", content: userMessage });

    const messages: LLMMessage[] = [
      { role: "system", content: contextPrompt },
      ...this.conversationHistory,
    ];

    const response = await this.llm.chat(messages, contextPrompt);

    // Process actions from JSON blocks before stripping them
    await this.processKnowledgeExtraction(userMessage, response.content);

    // Strip JSON action blocks so the user never sees internal actions
    const cleanResponse = this.stripActionBlocks(response.content);

    this.conversationHistory.push({
      role: "assistant",
      content: cleanResponse,
    });

    return cleanResponse;
  }

  private parseCommand(input: string): string | null {
    const trimmed = input.trim().toLowerCase();

    if (trimmed === "/inspect db" || trimmed === "/db") {
      return this.inspectDB();
    }
    if (trimmed === "/inspect prompt" || trimmed === "/prompt") {
      return this.systemPrompt;
    }
    if (trimmed === "/people") {
      return this.inspectPeople();
    }
    if (trimmed === "/unverified") {
      return this.inspectUnverified();
    }
    if (trimmed === "/stats") {
      return this.showStats();
    }
    if (trimmed === "/help") {
      return this.showHelp();
    }
    if (trimmed.startsWith("/search ")) {
      const query = input.trim().slice(8);
      return this.searchKnowledge(query);
    }
    if (trimmed.startsWith("/store")) {
      return "To store knowledge, just tell me something. For example:\n" +
        '"Our authentication uses OAuth 2.0 with PKCE flow for the mobile app."';
    }
    if (trimmed.startsWith("/iam ")) {
      const name = input.trim().slice(5).trim();
      return this.handleIdentify(name);
    }

    return null;
  }

  private handleIdentify(name: string): string {
    const person = this.db.getPersonByName(name);

    if (person) {
      this.currentUser = person.name;
      if (this.deviceKey) {
        this.db.linkDeviceToPersonId(this.deviceKey, person.id);
      }
      return `Welcome back, ${person.name}! (${person.role}${person.tags.length > 0 ? ` — ${person.tags.join(", ")}` : ""})`;
    }

    // New person — we need to ask about their role
    this.currentUser = name;
    return `Hey ${name}, nice to meet you! I don't think we've talked before. What's your role on the team, and what areas do you work on? This helps me understand your expertise.`;
  }

  private inspectDB(): string {
    const entries = this.knowledge.listAll();
    if (entries.length === 0) {
      return "Knowledge base is empty. Start sharing knowledge with me.";
    }

    const lines = entries.map((e) =>
      [
        `[${e.id.slice(0, 8)}] ${e.topic} > ${e.subtopic}`,
        `  ${e.content.slice(0, 120)}${e.content.length > 120 ? "..." : ""}`,
        `  Source: ${e.source} | Updated: ${e.last_updated}`,
      ].join("\n")
    );

    return `Knowledge Base (${entries.length} entries):\n\n${lines.join("\n\n")}`;
  }

  private inspectPeople(): string {
    const people = this.db.getAllPeople();
    if (people.length === 0) {
      return "No team members registered yet. Use /iam <name> to introduce yourself.";
    }

    const lines = people.map(
      (p) => `  ${p.name} — ${p.role}${p.tags.length > 0 ? ` [${p.tags.join(", ")}]` : ""}`
    );

    return `Team Members (${people.length}):\n\n${lines.join("\n")}`;
  }

  private inspectUnverified(): string {
    const entries = this.db.getAllUnverified();
    if (entries.length === 0) {
      return "No unverified knowledge entries. Everything is trusted.";
    }

    const lines = entries.map((e) => {
      const corroborators = JSON.parse(e.corroborated_by);
      return [
        `[${e.id.slice(0, 8)}] ${e.topic} > ${e.subtopic}`,
        `  ${e.content.slice(0, 120)}${e.content.length > 120 ? "..." : ""}`,
        `  Source: ${e.source} | Corroborations: ${e.corroboration_count} (${corroborators.join(", ")})`,
        e.contradicts_entry_id ? `  Contradicts: ${e.contradicts_entry_id.slice(0, 8)}` : "",
      ].filter(Boolean).join("\n");
    });

    return `Unverified Knowledge (${entries.length} entries):\n\n${lines.join("\n\n")}`;
  }

  private showStats(): string {
    const stats = this.knowledge.getStats();
    return [
      `Knowledge Base Stats:`,
      `  Total entries: ${stats.totalEntries}`,
      `  Topics: ${stats.topics.join(", ") || "none"}`,
      `  Last updated: ${stats.lastUpdated || "never"}`,
      `  Team members: ${stats.totalPeople}`,
      `  Unverified entries: ${stats.totalUnverified}`,
    ].join("\n");
  }

  private showHelp(): string {
    return [
      "Available commands:",
      "  /iam <name>           - Identify yourself to the bot",
      "  /db or /inspect db    - Show all knowledge entries",
      "  /unverified           - Show unverified (red flag) entries",
      "  /people               - Show all team members",
      "  /prompt or /inspect prompt - Show the system prompt",
      "  /stats                - Show knowledge base statistics",
      "  /search <query>       - Search the knowledge base",
      "  /store                - Manually store knowledge (guided)",
      "  /help                 - Show this help message",
      "  /quit or /exit        - Exit the bot",
    ].join("\n");
  }

  private searchKnowledge(query: string): string {
    const results = this.knowledge.search(query, 10);
    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    const lines = results.map(
      (r) =>
        `[${(r.relevanceScore * 100).toFixed(0)}%] ${r.entry.topic} > ${r.entry.subtopic}\n  ${r.entry.content.slice(0, 150)}${r.entry.content.length > 150 ? "..." : ""}`
    );

    return `Search results for "${query}":\n\n${lines.join("\n\n")}`;
  }

  private buildContextPrompt(
    results: SearchResult[],
    stats: { totalEntries: number; topics: string[]; totalPeople: number; totalUnverified: number },
    currentPerson: Person | null
  ): string {
    let context = this.systemPrompt;

    // Current user context
    context += `\n\n## Current User\n`;
    if (currentPerson) {
      context += `Name: ${currentPerson.name}\n`;
      context += `Role: ${currentPerson.role}\n`;
      context += `Expertise: ${currentPerson.tags.join(", ") || "not specified"}\n`;
      context += `This person has authority over topics matching their expertise tags.\n`;
    } else if (this.currentUser) {
      context += `Name: ${this.currentUser} (new team member, role not yet registered)\n`;
    } else {
      context += `No one has identified themselves yet. If this seems like a new person, ask who they are naturally.\n`;
    }

    context += `\n## Current Knowledge Base State\n`;
    context += `Trusted entries: ${stats.totalEntries}\n`;
    context += `Unverified entries: ${stats.totalUnverified}\n`;
    context += `Team members: ${stats.totalPeople}\n`;
    context += `Topics: ${stats.topics.join(", ") || "none yet"}\n`;

    if (results.length > 0) {
      context += `\n## Relevant Knowledge Found\n`;
      for (const r of results) {
        context += `\n### [${r.entry.topic} > ${r.entry.subtopic}] (relevance: ${(r.relevanceScore * 100).toFixed(0)}%)\n`;
        context += `${r.entry.content}\n`;
        context += `Source: ${r.entry.source} | Last updated: ${r.entry.last_updated}\n`;
      }
    }

    context += `\n## Instructions for this response\n`;
    context += `- If the user is sharing new knowledge, respond with a JSON block to store it:\n`;
    context += '  ```json\n  {"action":"store","topic":"...","subtopic":"...","content":"...","source":"<person name>"}\n  ```\n';
    context += `- If updating existing knowledge, use:\n`;
    context += '  ```json\n  {"action":"update","id":"...","content":"...","source":"<person name>"}\n  ```\n';
    context += `- If the new knowledge contradicts existing knowledge and you're unsure, ask for clarification naturally. Do NOT mention authority, flags, or verification processes.\n`;
    context += `- If after clarification the info still contradicts existing knowledge, use:\n`;
    context += '  ```json\n  {"action":"red_flag","topic":"...","subtopic":"...","content":"...","source":"<person name>","contradicts_entry_id":"..."}\n  ```\n';
    context += `- If a new person introduces themselves with role/expertise, register them:\n`;
    context += '  ```json\n  {"action":"register_person","name":"...","role":"...","tags":["tag1","tag2"]}\n  ```\n';
    context += `- Include the JSON block at the END of your response, after your conversational reply.\n`;
    context += `- If the user is just asking a question, do NOT include a JSON block.\n`;
    context += `- NEVER mention "authority", "flags", "verification", or "trust levels" to the user. These are internal mechanisms.\n`;

    return context;
  }

  private stripActionBlocks(response: string): string {
    return response
      .replace(/\n*```json\s*\{[\s\S]*?\}\s*```\n*/g, "")
      .trim();
  }

  protected async processKnowledgeExtraction(
    userMessage: string,
    llmResponse: string
  ): Promise<void> {
    const jsonMatch = llmResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) return;

    try {
      const action = JSON.parse(jsonMatch[1]);
      const source = action.source || this.currentUser || "unknown";

      if (action.action === "store") {
        if (this.currentUser) {
          const result = this.knowledge.authorityAwareStore(
            {
              topic: action.topic,
              subtopic: action.subtopic,
              content: action.content,
              source,
            },
            this.currentUser
          );
          // If yellow flag, the LLM already asked for clarification in its response
          // If trusted, it's stored
        } else {
          this.knowledge.smartStore({
            topic: action.topic,
            subtopic: action.subtopic,
            content: action.content,
            source,
          });
        }
      } else if (action.action === "update" && action.id) {
        this.knowledge.update(action.id, {
          content: action.content,
          source,
        });
      } else if (action.action === "red_flag") {
        this.knowledge.escalateToRedFlag(
          {
            topic: action.topic,
            subtopic: action.subtopic,
            content: action.content,
            source,
          },
          action.contradicts_entry_id || ""
        );
      } else if (action.action === "register_person") {
        const existing = this.db.getPersonByName(action.name);
        if (!existing) {
          const newPerson = this.db.createPerson({
            name: action.name,
            role: action.role || "",
            tags: action.tags || [],
          });
          if (this.deviceKey && this.currentUser === action.name) {
            this.db.linkDeviceToPersonId(this.deviceKey, newPerson.id);
          }
        } else {
          this.db.updatePerson(existing.id, {
            role: action.role || existing.role,
            tags: action.tags || existing.tags,
          });
          if (this.deviceKey && this.currentUser === action.name) {
            this.db.linkDeviceToPersonId(this.deviceKey, existing.id);
          }
        }
      }
    } catch {
      // JSON parsing failed — that's fine
    }
  }

  resetConversation(): void {
    this.conversationHistory = [];
  }
}
