export type MessageRole = "sent" | "received";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ChatMessage {
  id: number;
  role: MessageRole;
  text: string;
  timestamp: Date;
  streaming?: boolean;
}
