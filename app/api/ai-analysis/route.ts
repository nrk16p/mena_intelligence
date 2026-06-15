import { NextRequest } from "next/server"

const API_URL = process.env.AI_CHAT_API_URL ?? ""
const API_KEY = process.env.AI_CHAT_API_KEY ?? ""

export async function POST(req: NextRequest) {
  try {
    const { pageContext, pageLabel } = await req.json()

    if (!pageContext) return new Response("pageContext required", { status: 400 })
    if (!API_URL)    return new Response("AI_CHAT_API_URL not configured", { status: 503 })

    // Hard limit at 1800 chars — keeps prompt small enough for qwen2.5:7b to answer within 60s
    const trimmedContext = pageContext.length > 1800
      ? pageContext.slice(0, 1800) + "\n[...ย่อ]"
      : pageContext

    const system = `You are a senior fleet-cost analyst for MENA Transport (Thailand).
Produce EXACTLY this 3-section report. Use specific THB numbers and percentages every time.

EXECUTIVE SUMMARY
[2 Thai sentences: overall cost situation and biggest single finding]

KEY FINDINGS
• [most important finding with number]
• [second finding with number]
• [third finding with number]

ACTIONS
• HIGH: [immediate action — specific]
• MEDIUM: [30-day action — specific]

Rules: Thai language, real numbers, no markdown, no extra text outside the 3 sections`

    const message = `วิเคราะห์ข้อมูล "${pageLabel}":\n\n${trimmedContext}`

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
          session_id: `analysis_${Date.now()}`,
          system,
          model: "qwen2.5:7b",
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (e: any) {
      const msg = e?.name === "TimeoutError"
        ? "AI ใช้เวลานานเกินไป ลองกด ↺ อีกครั้ง"
        : "Cannot reach AI backend"
      return new Response(msg, { status: 503 })
    }

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "")
      return new Response(`Backend error: ${body}`, { status: upstream.status })
    }

    const data = await upstream.json()
    return new Response(data.reply ?? "", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (err: any) {
    return new Response(err.message ?? "Unknown error", { status: 500 })
  }
}
