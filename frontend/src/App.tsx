import { useState, useRef, useEffect } from "react";
import { MessageBubble } from "./components/MessageBubble";
import type { ChatMessage } from "./types/chat";
import { ChatInputField } from "./components/Chat/InputField";
import { openSession, postChat } from "./api/chat";
import "./index.css";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(crypto.randomUUID());
  const currentAiId = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const cleanup = openSession(
      sessionId.current,
      (chunk) => {
        const aiId = currentAiId.current;
        if (aiId === null) return;

        if (chunk.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId
                ? { ...m, text: `Error: ${chunk.error}`, streaming: false }
                : m,
            ),
          );
          currentAiId.current = null;
          setIsStreaming(false);
          return;
        }

        if (chunk.final) {
          setMessages((prev) =>
            prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
          );
          currentAiId.current = null;
          setIsStreaming(false);
          return;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, text: m.text + chunk.content } : m,
          ),
        );
      },
      () => {
        const aiId = currentAiId.current;
        if (aiId === null) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? { ...m, text: m.text || "Connection failed.", streaming: false }
              : m,
          ),
        );
        currentAiId.current = null;
        setIsStreaming(false);
      },
    );

    return cleanup;
  }, []);

  const handleSendMessage = async (text: string) => {
    const aiId = Date.now() + 1;
    currentAiId.current = aiId;

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "sent", text, timestamp: new Date() },
      { id: aiId, role: "received", text: "", streaming: true, timestamp: new Date() },
    ]);
    setIsStreaming(true);

    try {
      await postChat(text, sessionId.current);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId
            ? { ...m, text: "Could not send message.", streaming: false }
            : m,
        ),
      );
      currentAiId.current = null;
      setIsStreaming(false);
    }
  };

  return (
    <div className="chat-layout">
      <main className="chat-messages">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </main>

      <ChatInputField
        onSendMessage={handleSendMessage}
        disabled={isStreaming}
      />
    </div>
  );
}
