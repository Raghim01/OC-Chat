import { useState, useRef, useEffect } from "react";
import { MessageBubble } from "./components/MessageBubble";
import type { ChatMessage } from "./types/chat";
import { ChatInputField } from "./components/Chat/InputField";
import { streamChat } from "./api/chat";
import "./index.css";

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "sent",
      text,
      timestamp: new Date(),
    };

    const aiId = Date.now() + 1;
    const aiMsg: ChatMessage = {
      id: aiId,
      role: "received",
      text: "",
      streaming: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setIsStreaming(true);

    try {
      for await (const chunk of streamChat(text)) {
        if (chunk.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId
                ? { ...m, text: `Error: ${chunk.error}`, streaming: false }
                : m,
            ),
          );
          return;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? {
                  ...m,
                  text: chunk.final ? m.text : chunk.content,
                  streaming: !chunk.final,
                }
              : m,
          ),
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiId
            ? {
                ...m,
                text: "Could not connect to the server.",
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
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
