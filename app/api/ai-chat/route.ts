import { NextRequest } from "next/server"

const API_URL = process.env.AI_CHAT_API_URL ?? ""
const API_KEY = process.env.AI_CHAT_API_KEY ?? ""

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId = "default", pageContext = "", pageLabel = "" } = await req.json()

    if (!message?.trim()) {
      return new Response("Message is required", { status: 400 })
    }
    if (!API_URL) {
      return new Response("AI_CHAT_API_URL not configured", { status: 503 })
    }

    // Trim context to avoid token overflows on qwen2.5:7b
    const trimmedContext = pageContext.length > 4000
      ? pageContext.slice(0, 4000) + "\n[...ข้อมูลถูกย่อ]"
      : pageContext

    // Build system prompt — embed page data so the model answers from current dashboard
    const system = trimmedContext
      ? [
          "You are an AI assistant for MENA Transport fleet management.",
          "Answer ONLY from the data provided below. Answer in the same language as the question (Thai or English).",
          "",
          `Current page: ${pageLabel}`,
          "---",
          trimmedContext,
          "---",
        ].join("\n")
      : "You are an AI assistant for MENA Transport fleet management. Answer in the same language as the question (Thai or English)."

    let upstream: Response
    try {
      upstream = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          message,
          session_id: sessionId,
          system,
          model: "qwen2.5:7b",
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e: any) {
      const msg = e?.name === "TimeoutError"
        ? "AI ใช้เวลานานเกินไป กรุณาลองใหม่"
        : "Cannot reach AI backend. Make sure the ngrok tunnel is running."
      return new Response(msg, { status: 503 })
    }

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "")
      const isNgrokOffline = body.includes("ERR_NGROK_3200") || body.includes("ngrok-free") && body.includes("offline")
      if (isNgrokOffline) {
        return new Response("AI backend offline. กรุณาเปิด ngrok tunnel ก่อนครับ", { status: 503 })
      }
      return new Response(`Backend error (${upstream.status}): ${body}`, { status: upstream.status })
    }

    const data = await upstream.json()
    return new Response(data.reply ?? "", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (err: any) {
    return new Response(err.message ?? "Unknown error", { status: 500 })
  }
}
