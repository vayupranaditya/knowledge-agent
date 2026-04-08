import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { ChatService } from "../service/chat-service.js";
import { KnowledgeManager } from "../knowledge/manager.js";
import { MemoryDB } from "../db/memory-db.js";

export function createApp(
  chatService: ChatService,
  knowledge: KnowledgeManager,
  db: MemoryDB,
): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/chat", async (req: Request, res: Response) => {
    const { message, sessionId } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required and must be a string" });
      return;
    }

    try {
      const result = await chatService.handleChat({ message, sessionId });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/identify", async (req: Request, res: Response) => {
    const { name, sessionId } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required and must be a string" });
      return;
    }

    try {
      const result = await chatService.handleChat({
        message: `/iam ${name}`,
        sessionId,
      });
      const agent = chatService.getAgent(result.sessionId);
      const user = agent?.getCurrentUser() ?? undefined;
      res.json({ reply: result.reply, sessionId: result.sessionId, user });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/search", (req: Request, res: Response) => {
    const q = req.query.q as string | undefined;
    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "q query parameter is required" });
      return;
    }

    const results = knowledge.search(q, 10);
    res.json(results);
  });

  app.get("/people", (_req: Request, res: Response) => {
    const people = db.getAllPeople();
    res.json(people);
  });

  app.get("/stats", (_req: Request, res: Response) => {
    const stats = knowledge.getStats();
    res.json(stats);
  });

  return app;
}
