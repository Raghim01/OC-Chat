# Changelog

## 2026-03-27 — Exception handling & toast notifications

### Added

- `ServiceUnavailableException` (503) thrown from `send()` and `sendRaw()` when OpenClaw is not authenticated or WS is not open — propagates correctly through NestJS exception filter on all HTTP request paths
- `getHistory()` now rejects the Promise on send failure, preventing orphaned entries in `pendingRequests` map
- `handleChallenge()` wraps `sendRaw` in try/catch — WS event handlers are not in HTTP context so throws are caught and logged locally
- Toast notification system (`Toast.tsx`, `useToast` hook) — transient error messages auto-dismiss after 5 seconds, positioned top-left
- WS `error` events emit `{ error }` to all SSE sessions, surfacing gateway-level errors as toasts on the frontend
- `health` event handler — logs a warning if `payload.ok` is false
- `chat` event error state handler — `state: 'error'` emits error message to all sessions (billing errors, gateway errors)

### Refactored

- Frontend error paths (stream error, SSE drop, `postChat` failure, history load failure) replaced inline-in-bubble error text with `addToast` calls
- Empty AI bubble removed on error; partial bubble (with streamed text) frozen in place instead

---

## 2026-03-26 — Chat history, connection status, infra hardening

### Added

- `GET /chat/history` endpoint — backend proxies `chat.history` WS request to OpenClaw and returns aggregated messages
- Pending-request map correlates async WS responses to HTTP requests by request ID
- Connection status indicator in the frontend header (animated dot: connecting / connected / disconnected)
- Input gating — send button and textarea disabled until SSE reports `connected`
- Loading state while history fetches on connect (typing-indicator dots)
- Docker healthchecks: backend (`wget /health/openclaw`), startup order enforced via `service_healthy`
- `.env.example` with all required variables grouped by service
- `openclaw_config/openclaw.json` gateway config

### Refactored

- Extracted `toBase64Url` → `utils/encoding.ts`, key derivation → `utils/crypto.ts`, connect request builder → `utils/auth.ts`
- Removed `messageHandlers[]` array — replaced with direct emit loop over `sessions` Map
- Split `handleFrame` into `handleConnectionFrame` + `handleChatFrame`
- Auth status (`{ status }`) pushed via SSE on hello-ok, WS close, and session registration
- `ws.interfaces.ts` simplified — removed unused generics, intermediary type aliases, and single-use wrapper interfaces
- Docker Compose ports switched from hard-coded values to env vars

---

## 2026-03-25 — Live streaming & SSE architecture

### Added

- `OpenClawService`: authenticated WebSocket connection to OpenClaw gateway (challenge/response auth, reconnect on pairing failure)
- `POST /chat` streams responses as Server-Sent Events (`text/event-stream`)
- `GET /chat/stream` — persistent SSE session registered per `sessionId`; chunks pushed as they arrive from OpenClaw
- `ws.interfaces.ts` — TypeScript types for all OpenClaw WS frames
- `react-markdown` for rendering AI responses
- Streaming state in `ChatMessage` — animated typing dots while content accumulates

### Refactored

- Session state moved from `AppController` into `OpenClawService`; controller reduced to pure routing
- Frontend switched from per-request fetch+ReadableStream to a single persistent `EventSource` opened on mount
- `toDelta()` converts OpenClaw's cumulative chunks into true deltas
- docker-cli added to backend Dockerfile for sibling-container `docker exec` calls

---

## 2026-03-24

### Fixed

- Docker Compose race condition between openclaw-gateway and backend containers

---

## 2026-03-23 — Initial scaffold

### Added

- NestJS backend (port 8000), React + Vite frontend (port 3000), OpenClaw gateway Docker service
- Frontend migrated from JSX to TypeScript; state lifted to `App.tsx`
- Shared `ChatMessage` type, `MessageBubble` component, `ChatInputField` component
- Mock conversation data for UI development
- `docker-compose.yml` wiring all three services
