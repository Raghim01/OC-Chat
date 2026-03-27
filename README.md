# OpenClawChat

A chat interface that connects to the [OpenClaw](https://github.com/openclaw/openclaw) AI gateway. React frontend streams responses via a NestJS backend that proxies to the OpenClaw WebSocket gateway.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- An [OpenRouter](https://openrouter.ai/) API key

## Setup

- Clone the repo:

```bash
git clone <repo-url>
```

- Open the project folder, create a `.env` file in root folder

- Fill in the required values in `.env`:

| Variable             | Required | Description                                                             |
| -------------------- | -------- | ----------------------------------------------------------------------- |
| `AUTH_TOKEN`         | Yes      | Token used to authenticate with the OpenClaw gateway                    |
| `OPENROUTER_API_KEY` | Yes      | Your OpenRouter API key                                                 |
| `OPENROUTER_MODEL`   | Yes      | Model identifier, e.g. `openrouter/openai/gpt-4o`                       |
| `DEVICE_SECRET`      | Yes      | Stable seed for device identity                                         |
| `OPENCLAW_WS_URL`    | No       | WebSocket URL of the gateway (default: `ws://openclaw-gateway:18789`)   |
| `PORT`               | No       | Backend port (default: `8000`)                                          |
| `OPENCLAW_PORT`      | No       | Exposed port for the gateway (default: `18789`)                         |
| `FRONTEND_PORT`      | No       | Exposed port for the frontend (default: `3000`)                         |
| `VITE_API_URL`       | No       | Backend base URL seen by the browser (default: `http://localhost:8000`) |

## Running

Run the whole project with one command in the root folder:

```bash
docker-compose up --build
```

Startup order: OpenClaw gateway → backend (waits for gateway to be healthy) → frontend (waits for backend to be healthy).

## Start sending messages

Open `http://localhost:3000`, or on the specified port, once all services are up.
