import type { ConnectionStatus } from "../types/chat";

interface RawChunk {
  content?: string;
  final?: boolean;
  error?: string;
  status?: ConnectionStatus;
}

export interface StreamChunk {
  content: string;
  final: boolean;
  error?: string;
}

/** Openclaw sends cumulative text — each chunk is the full response so far.
 *  Slices off the already-displayed prefix so callers receive only the delta. */
function toDelta(content: string, prevText: string): string {
  if (!content) return "";
  return content.startsWith(prevText) ? content.slice(prevText.length) : content;
}

export function openSession(
  sessionId: string,
  onChunk: (chunk: StreamChunk) => void,
  onStatus: (status: ConnectionStatus) => void,
  onError: () => void,
): () => void {
  let prevText = "";
  const source = new EventSource(
    `${import.meta.env.VITE_API_URL}/chat/stream?sessionId=${sessionId}`,
  );

  source.onmessage = (e) => {
    const raw = JSON.parse(e.data as string) as RawChunk;

    if (raw.status) {
      onStatus(raw.status);
      return;
    }

    if (raw.error) {
      onChunk({ content: "", final: true, error: raw.error });
      prevText = "";
      return;
    }

    if (raw.final) {
      onChunk({ content: "", final: true });
      prevText = "";
      return;
    }

    const delta = toDelta(raw.content ?? "", prevText);
    prevText = raw.content ?? "";
    if (delta) onChunk({ content: delta, final: false });
  };

  source.onerror = () => onError();

  return () => source.close();
}

interface RawHistoryMessage {
  role: "user" | "assistant";
  content: { type: "text" | "thinking"; text?: string }[];
  timestamp: number;
}

export async function fetchHistory(): Promise<{ role: "sent" | "received"; content: string; timestamp: Date }[]> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/chat/history`);
  if (!res.ok) throw new Error(`History request failed: ${res.status}`);
  const data = await res.json() as { messages: RawHistoryMessage[] };
  return data.messages.flatMap((m) => {
    const role = m.role === "user" ? "sent" : "received";
    const text = m.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text) return [];
    return [{ role, content: text, timestamp: new Date(m.timestamp) }];
  });
}

export async function postChat(
  message: string,
  sessionId: string,
): Promise<void> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}
