# Architecture

OpenClawChat is a three-tier system: a React frontend talks to a NestJS backend, which proxies to the OpenClaw AI gateway. The core constraint that shaped most decisions is that the Gateway mainly speaks WebSocket — the backend's job is to communicate to OpenClaw through Gateway Protocol, and return the response data to frontend.

---

## 1. SSE over WebSocket for FE→BE

The browser uses `EventSource` (SSE) to receive streaming chunks and a plain `POST /chat` to send messages.

**Evolution:** the first implementation tied the SSE stream to the POST request lifetime — the response body was a stream, and when the response ended, the stream ended. This worked for delivering one reply, but nothing else.

**Why it changed:** a persistent connection opened on mount and reused across all messages lets the backend push events that aren't tied to any specific request — auth status when the gateway connects or disconnects, history loading state. These are unsolicited from the browser's perspective and can't be delivered over a per-request stream.

**Trade-off:** SSE is unidirectional, so the FE still needs a separate POST to send messages. This is a deliberate split: receiving is a long-lived connection, sending is a fire-and-forget HTTP call. A full WebSocket between browser and backend would unify them, but adds complexity (handshake, framing, reconnect logic) that isn't justified for a chat interface.

---

## 2. Sessions Map with direct emit functions

Each open SSE connection is stored in `sessions: Map<string, (data) => void>` — the value is the emit function that pushes data to that connection's `Observable`.

**Evolution:** early code used a `messageHandlers: MessageHandler[]` observer array. Handlers were pushed on subscribe and spliced out on disconnect.

**Why it changed:** the array was indirection without benefit. There's a 1:1 relationship between a session ID and its SSE subscriber, so a Map keyed by session ID is the natural structure. Cleanup is explicit (`Map.delete` on disconnect) and there's no risk of stale handlers accumulating.

**Trade-off:** no fan-out to multiple independent consumers per session. Acceptable since the only consumer is the SSE endpoint.

---

## 3. Cumulative chunk normalization

OpenClaw sends the full accumulated response text with each chunk — chunk 3 contains everything from chunks 1, 2, and 3. `toDelta()` in `frontend/src/api/chat.ts` slices off the already-displayed prefix so the caller only receives the newly added characters.

**Why:** React state updates by appending a delta are simpler to reason about than replacing the full string on every chunk. The component doesn't need to know it's receiving cumulative data.

**Trade-off:** correctness depends on in-order delivery, which WebSocket guarantees. If a chunk ever arrives out of order (which the protocol doesn't allow), `toDelta` would return the full chunk as a delta rather than failing silently.

---

## 4. Docker startup ordering

`openclaw-gateway` starts first. `backend` waits for the gateway's healthcheck before starting. `frontend` waits for the backend's healthcheck.

**Evolution:** the initial Compose file had no ordering for `backend` → `frontend` startup. The frontend would attempt its EventSource connection immediately on startup, which triggered the `backend` to request the `openclaw` before the connection was established, which triggered an error because the gateway wasn't ready.

**Why the ordering matters:** the backend connects to the gateway in `onModuleInit` — there's no process-level retry loop, only WS-level reconnect after a successful initial connection. If the gateway isn't ready at startup, the connection is never established until the backend is restarted. Healthcheck-based ordering eliminates that class of failure.

**Trade-off:** cold start takes longer. All three containers must pass their healthchecks sequentially before the stack is fully available.

---

## 5. Two error propagation paths

The service has two distinct error contexts that require different handling:

**HTTP request context** (`sendMessageStream`, `getHistory`) — called by the controller during an active HTTP request. Errors here throw `ServiceUnavailableException`, which NestJS's exception filter catches and converts to a 503 response. No try/catch needed in the controller.

**WS event handler context** (`handleChallenge`, `ws.on('error')`, frame handlers) — called from WebSocket callbacks with no HTTP request in scope. Throwing here would propagate into the Node.js event loop and crash the process or go unhandled. Instead: errors are caught locally and logged, or emitted to SSE sessions via `emitToAllSessions({ error })` so the frontend can surface them as toasts.

**Why this matters:** `send()` and `sendRaw()` are called from both contexts. They throw unconditionally. Any WS-context caller (`handleChallenge`) must wrap those calls in try/catch. Any HTTP-context caller (`sendMessageStream`, `getHistory`) lets the throw propagate — NestJS handles it. This is the reason `handleChallenge` has a try/catch while the public API methods do not.
