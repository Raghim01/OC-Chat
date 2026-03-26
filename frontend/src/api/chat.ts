export interface StreamChunk {
  content: string;
  final: boolean;
  error?: string;
}

interface RawChunk {
  content: string;
  final: boolean;
  error?: string;
}

/** Openclaw sends cumulative text — each chunk is the full response so far.
 *  This adapter slices off the already-displayed prefix so callers receive
 *  only the new characters added by each chunk. */
function toDelta(raw: RawChunk, prevText: string): string {
  if (!raw.content) return "";
  return raw.content.startsWith(prevText)
    ? raw.content.slice(prevText.length)
    : raw.content;
}

export async function* streamChat(
  message: string,
): AsyncGenerator<StreamChunk> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let prevText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const raw = JSON.parse(line.slice(6)) as RawChunk;

      if (raw.error) {
        yield { content: "", final: true, error: raw.error };
        return;
      }

      if (raw.final) {
        yield { content: "", final: true };
        return;
      }

      const delta = toDelta(raw, prevText);
      prevText = raw.content;

      if (delta) yield { content: delta, final: false };
    }
  }
}
