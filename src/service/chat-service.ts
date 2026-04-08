import { v4 as uuidv4 } from "uuid";
import { KnowledgeAgent } from "../agent/agent.js";
import { KnowledgeManager } from "../knowledge/manager.js";
import { LLMProvider } from "../llm/provider.js";

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  reply: string;
  sessionId: string;
  metadata?: { user?: string; isNewSession?: boolean };
}

export class ChatService {
  private agents: Map<string, KnowledgeAgent> = new Map();
  private llm: LLMProvider;
  private knowledge: KnowledgeManager;

  constructor(llm: LLMProvider, knowledge: KnowledgeManager) {
    this.llm = llm;
    this.knowledge = knowledge;
  }

  async handleChat(req: ChatRequest): Promise<ChatResponse> {
    let isNewSession = false;
    let sessionId = req.sessionId;

    if (!sessionId || !this.agents.has(sessionId)) {
      if (!sessionId) {
        sessionId = uuidv4();
      }
      // sessionId acts as deviceKey for the agent — reuses existing device_identities infrastructure
      const agent = new KnowledgeAgent(this.llm, this.knowledge, sessionId);
      this.agents.set(sessionId, agent);
      if (!req.sessionId) {
        isNewSession = true;
      }
    }

    const agent = this.agents.get(sessionId)!;
    const reply = await agent.chat(req.message);
    const user = agent.getCurrentUser() ?? undefined;

    const metadata: ChatResponse["metadata"] = {};
    if (user) metadata.user = user;
    if (isNewSession) metadata.isNewSession = true;

    return {
      reply,
      sessionId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  getAgent(sessionId: string): KnowledgeAgent | undefined {
    return this.agents.get(sessionId);
  }
}
