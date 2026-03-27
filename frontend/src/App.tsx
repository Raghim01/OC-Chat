import { useState, useRef, useEffect } from "react";
import { MessageBubble } from "./components/MessageBubble";
import { ToastContainer, useToast } from "./components/Toast";
import { Settings } from "./components/Settings";
import type { ChatMessage, ConnectionStatus } from "./types/chat";
import { ChatInputField } from "./components/Chat/InputField";
import { openSession, postChat, fetchHistory } from "./api/chat";
import "./index.css";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting...",
  connected: "Connected",
  disconnected: "Reconnecting...",
};

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
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
          addToast(chunk.error);
          setMessages((prev) => {
            const aiMsg = prev.find((m) => m.id === aiId);
            if (!aiMsg?.text) return prev.filter((m) => m.id !== aiId);
            return prev.map((m) =>
              m.id === aiId ? { ...m, streaming: false } : m,
            );
          });
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
      (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          fetchHistory()
            .then((history) =>
              setMessages(
                history.map((m, i) => ({
                  id: i,
                  role: m.role,
                  text: m.content,
                  timestamp: m.timestamp,
                })),
              ),
            )
            .catch(() => addToast("Could not load chat history."))
            .finally(() => setIsLoadingHistory(false));
        }
      },
      () => {
        const aiId = currentAiId.current;
        addToast("Connection lost. Please try again.");
        if (aiId !== null) {
          setMessages((prev) => {
            const aiMsg = prev.find((m) => m.id === aiId);
            if (!aiMsg?.text) return prev.filter((m) => m.id !== aiId);
            return prev.map((m) =>
              m.id === aiId ? { ...m, streaming: false } : m,
            );
          });
          currentAiId.current = null;
          setIsStreaming(false);
        }
      },
    );

    return cleanup;
  }, [addToast]);

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
      addToast("Could not send message. The gateway may be unavailable.");
      setMessages((prev) => prev.filter((m) => m.id !== aiId));
      currentAiId.current = null;
      setIsStreaming(false);
    }
  };

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <span className="chat-title">OpenClawChat</span>
        <div className="chat-header-right">
          <div className={`connection-status ${connectionStatus}`}>
            <span className="connection-dot" />
            {STATUS_LABEL[connectionStatus]}
          </div>
          <button
            className="settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="chat-messages">
        {isLoadingHistory ? (
          <div className="history-loading">
            <div className="typing-indicator"><span /><span /><span /></div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </main>

      <ChatInputField
        onSendMessage={handleSendMessage}
        disabled={isStreaming || isLoadingHistory || connectionStatus !== "connected"}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSuccess={addToast}
        onError={addToast}
      />
    </div>
  );
}
