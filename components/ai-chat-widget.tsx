"use client"

import { useEffect, useRef, useState } from "react"
import { Bot, Send, X, Loader2, RotateCcw, Database } from "lucide-react"
import { useAiContext } from "@/lib/ai-context"

type Role = "user" | "assistant"

interface Message {
  id: string
  role: Role
  content: string
  error?: boolean
}

function BotAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
      <Bot size={14} />
    </div>
  )
}

function UserAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 text-[11px] font-semibold">
      U
    </div>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

const WELCOME = "สวัสดีครับ! ผมเป็น AI Assistant ของ MENA Transport\n\nค้นหาข้อมูลบนหน้าที่ต้องการก่อน แล้วถามผมได้เลยครับ เช่น:\n• \"ค่าใช้จ่ายรวมเดือนนี้เท่าไหร่?\"\n• \"กลุ่มไหนค่าใช้จ่ายสูงสุด?\"\n• \"เปรียบเทียบกับปีที่แล้วเป็นอย่างไร?\""

// Stable session ID per browser tab (server manages history by this ID)
function getSessionId(): string {
  if (typeof window === "undefined") return "default"
  let id = sessionStorage.getItem("ai_session_id")
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem("ai_session_id", id)
  }
  return id
}

export function AiChatWidget() {
  const { pageContext, pageLabel, triggerQuestion, clearTriggerQuestion } = useAiContext()

  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", content: WELCOME }])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)
  const sessionId               = useRef<string>("")

  useEffect(() => {
    sessionId.current = getSessionId()
  }, [])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [open, messages])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Respond to question chips clicked in AiInsightsPanel
  useEffect(() => {
    if (!triggerQuestion) return
    setOpen(true)
    clearTriggerQuestion()
    // Small delay so panel opens before auto-sending
    const t = setTimeout(() => sendMessage(triggerQuestion), 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerQuestion])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId.current,
          pageContext,
          pageLabel,
        }),
      })

      const reply = await res.text()
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: reply || "(no response)", error: !res.ok },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "เชื่อมต่อไม่ได้ กรุณาตรวจสอบว่า AI backend กำลังทำงานอยู่", error: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  function send() { sendMessage(input) }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function reset() {
    // New session ID clears server-side history too
    sessionId.current = crypto.randomUUID()
    sessionStorage.setItem("ai_session_id", sessionId.current)
    setMessages([{ id: "welcome", role: "assistant", content: WELCOME }])
    setInput("")
  }

  const hasContext = Boolean(pageContext)

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition-all hover:scale-105 active:scale-95"
          aria-label="Open AI Chat"
        >
          <Bot size={22} />
          {hasContext && (
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-[#0a0a10]" />
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-50 flex w-[380px] flex-col rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f1117] shadow-2xl overflow-hidden"
          style={{ height: "560px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-emerald-600">
            <div className="flex items-center gap-2.5">
              <Bot size={18} className="text-white" />
              <div>
                <p className="text-[13px] font-semibold text-white leading-tight">MENA AI Assistant</p>
                <p className="text-[10px] text-emerald-200 leading-tight">qwen2.5:7b · Ask about fleet & costs</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={reset} title="New conversation" className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-100 hover:bg-emerald-500 transition-colors">
                <RotateCcw size={13} />
              </button>
              <button onClick={() => setOpen(false)} title="Close" className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-100 hover:bg-emerald-500 transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Context badge */}
          {hasContext && (
            <div className="flex items-center gap-1.5 border-b border-gray-100 dark:border-white/6 bg-blue-50 dark:bg-blue-950/30 px-4 py-2">
              <Database size={11} className="text-blue-500 shrink-0" />
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate">
                ข้อมูลพร้อม: {pageLabel}
              </p>
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "assistant" ? <BotAvatar /> : <UserAvatar />}
                <div className={`
                  max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap
                  ${msg.role === "user"
                    ? "bg-emerald-600 text-white rounded-tr-sm"
                    : msg.error
                      ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-tl-sm"
                      : "bg-gray-100 dark:bg-white/6 text-gray-800 dark:text-gray-100 rounded-tl-sm"
                  }
                `}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <BotAvatar />
                <div className="rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-white/6 px-3 py-2">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-white/8 p-3">
            {!hasContext && (
              <p className="mb-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
                ค้นหาข้อมูลบนหน้าก่อน แล้วถามได้เลย
              </p>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/4 px-3 py-2">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasContext ? `ถามเกี่ยวกับ ${pageLabel}...` : "ถามเกี่ยวกับข้อมูลฝูงรถ..."}
                disabled={loading}
                className="flex-1 resize-none bg-transparent text-[13px] text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none leading-relaxed max-h-[100px] disabled:opacity-50"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-gray-400 dark:text-gray-600">
              Enter ส่ง · Shift+Enter ขึ้นบรรทัด
            </p>
          </div>
        </div>
      )}
    </>
  )
}
