import React, { useState, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { KnowledgeAgent } from "../agent/agent.js";

interface Message {
  role: "user" | "bot" | "system";
  content: string;
}

interface ChatProps {
  agent: KnowledgeAgent;
}

function Chat({ agent }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: agent.getStartupGreeting(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { exit } = useApp();

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed.toLowerCase() === "/quit" || trimmed.toLowerCase() === "/exit") {
        exit();
        return;
      }

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setIsProcessing(true);

      try {
        const response = await agent.chat(trimmed);
        setMessages((prev) => [...prev, { role: "bot", content: response }]);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Error: ${errorMsg}` },
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    [agent, exit]
  );

  return React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    // Header
    React.createElement(
      Box,
      { marginBottom: 1 },
      React.createElement(
        Text,
        { color: "cyan", bold: true },
        "🧠 Knowledge Bot"
      ),
      React.createElement(Text, { color: "gray" }, "  |  AI-powered knowledge base")
    ),
    // Messages
    React.createElement(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      ...messages.slice(-20).map((msg, i) =>
        React.createElement(
          Box,
          { key: i, marginBottom: 0 },
          msg.role === "user"
            ? React.createElement(
                Text,
                null,
                React.createElement(Text, { color: "green", bold: true }, "You: "),
                React.createElement(Text, null, msg.content)
              )
            : msg.role === "bot"
              ? React.createElement(
                  Text,
                  null,
                  React.createElement(Text, { color: "blue", bold: true }, "Bot: "),
                  React.createElement(Text, null, msg.content)
                )
              : React.createElement(Text, { color: "yellow", dimColor: true }, msg.content)
        )
      )
    ),
    // Processing indicator
    isProcessing
      ? React.createElement(
          Text,
          { color: "yellow" },
          "⏳ Thinking..."
        )
      : null,
    // Input
    React.createElement(
      Box,
      null,
      React.createElement(Text, { color: "green", bold: true }, "> "),
      React.createElement(TextInput, {
        value: input,
        onChange: setInput,
        onSubmit: handleSubmit,
      })
    )
  );
}

export function startChat(agent: KnowledgeAgent): void {
  render(React.createElement(Chat, { agent }));
}
