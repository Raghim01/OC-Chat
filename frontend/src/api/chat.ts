interface RawChunk {
  content: string;
  final: boolean;
  error?: string;
}

export interface StreamChunk {
  content: string;
  final: boolean;
  error?: string;
}

/** Openclaw sends cumulative text — each chunk is the full response so far.
 *  Slices off the already-displayed prefix so callers receive only the delta. */
function toDelta(raw: RawChunk, prevText: string): string {
  if (!raw.content) return "";
  return raw.content.startsWith(prevText)
    ? raw.content.slice(prevText.length)
    : raw.content;
}

export function openSession(
  sessionId: string,
  onChunk: (chunk: StreamChunk) => void,
  onError: () => void,
): () => void {
  let prevText = "";
  const source = new EventSource(
    `${import.meta.env.VITE_API_URL}/chat/stream?sessionId=${sessionId}`,
  );

  source.onmessage = (e) => {
    const raw = JSON.parse(e.data as string) as RawChunk;

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

    const delta = toDelta(raw, prevText);
    prevText = raw.content;
    if (delta) onChunk({ content: delta, final: false });
  };

  source.onerror = () => onError();

  return () => source.close();
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
