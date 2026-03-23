import { Paperclip, Send } from 'lucide-react';
import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';

interface ChatInputFieldProps {
    onSendMessage: (text: string) => void;
    disabled?: boolean;
}

export function ChatInputField({ onSendMessage, disabled }: ChatInputFieldProps) {
    const [input, setInput] = useState<string>('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }, [input]);

    const handleSend = () => {
        const text = input.trim();
        if (!text || disabled) return;

        onSendMessage(text);
        setInput('');
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    };

    const handleAttach = () => {
        alert('File attachment coming soon!');
    };

    return (
        <footer className="chat-input-area">
            <div className={`chat-input-wrapper ${disabled ? 'disabled' : ''}`}>
                <textarea
                    ref={textareaRef}
                    className="chat-input"
                    placeholder="Message Clawd…"
                    value={input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    rows={1}
                />
                <button
                    className="input-btn btn-attach"
                    onClick={handleAttach}
                    title="Attach file"
                    disabled={disabled}
                >
                    <Paperclip size={18} />
                </button>
                <button
                    className="input-btn btn-send"
                    onClick={handleSend}
                    disabled={!input.trim() || disabled}
                    title="Send message"
                >
                    <Send size={17} />
                </button>
            </div>
            <p className="input-hint">
                {disabled ? 'Clawd is thinking...' : 'Press Enter to send · Shift+Enter for new line'}
            </p>
        </footer>
    );
}