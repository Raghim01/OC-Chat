import type { ChatMessage } from '../types/chat';

export const MOCK_MESSAGES: ChatMessage[] = [
    {
        id: 1,
        role: 'received',
        text: "Hey! I'm Clawd 🦞 — your AI assistant. How can I help you today?",
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
    {
        id: 2,
        role: 'sent',
        text: 'Can you help me understand how Docker networking works between containers?',
        timestamp: new Date(Date.now() - 1000 * 60 * 4),
    },
    {
        id: 3,
        role: 'received',
        text: "Absolutely! In Docker, containers on the same Compose network can reach each other using the **service name** as a hostname. For example, your backend can connect to the OpenClaw gateway via `ws://openclaw-gateway:18789` — no IP needed.",
        timestamp: new Date(Date.now() - 1000 * 60 * 3),
    },
]