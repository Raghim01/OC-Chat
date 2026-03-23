import type { ChatMessage } from "../types/chat";
import { formatTime } from "../utils/format-time";

interface MessageBubbleProps {
    msg: ChatMessage;
}

export function MessageBubble({ msg }: MessageBubbleProps) {
    return (
        <div className={`message-row ${msg.role}`}>
            {msg.role === 'received' && (
                <span className="message-sender">Clawd 🦞</span>
            )}
            <div className="message-bubble">
                {msg.text}
            </div>
            <span className="message-time">{formatTime(msg.timestamp)}</span>
        </div>
    )
}