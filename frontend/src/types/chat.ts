export type MessageRole = 'sent' | 'received';

export interface ChatMessage {
  id: number;
  role: MessageRole;
  text: string;
  timestamp: Date;
}
