import { useState, useRef, useEffect } from 'react'
import { MOCK_MESSAGES } from './data/mock.data'
import { MessageBubble } from './components/MessageBubble'
import type { ChatMessage } from './types/chat'
import { ChatInputField } from './components/Chat/InputField'
import './index.css'

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES)
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = {
      id: Date.now(),
      role: 'sent',
      text,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setIsTyping(true)

    // Simulate AI response
    // TODO: Replace with real WebSocket send via backend
    setTimeout(() => {
      setIsTyping(false)
      const aiMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'received',
        text: "I received your message! WebSocket integration with the OpenClaw backend is coming soon. 🦞",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMsg])
    }, 1500)
  }

  return (
    <div className="chat-layout">
      {/* Messages */}
      <main className="chat-messages">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {isTyping && (
          <div className="message-row received">
            <span className="message-sender">Clawd 🦞</span>
            <div className="message-bubble">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <ChatInputField onSendMessage={handleSendMessage} disabled={isTyping} />
    </div>
  )
}
