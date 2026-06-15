import { NextRequest } from "next/server"

const API_URL = process.env.AI_CHAT_API_URL ?? ""
const API_KEY = process.env.AI_CHAT_API_KEY ?? ""

export async function POST(req: NextRequest) {
  try {
    const { pageContext, pageLabel } = await req.json()

    if (!pageContext) return new Response("pageContext required", { status: 400 })
    if (!API_URL)    return new Response("AI_CHAT_API_URL not configured", { status: 503 })

    // Keep only the first ~2500 chars so qwen2.5:7b doesn't time out.
    // Definitions + overview are always at the top, so this trims product detail
    // (hundreds of lines) while preserving the most useful summary data.
    const trimmedContext = pageContext.length > 2500
      ? pageContext.slice(0, 2500) + "\n[...ข้อมูลถูกย่อเพื่อประสิทธิภาพ]"
      : pageContext

    const system = `You are a senior fleet operations analyst for MENA Transport (Thailand).
Analyze the dashboard data and produce EXACTLY this output (no extra text):

INSIGHTS
• [concise finding in Thai, include specific numbers, max 25 words]
• [finding 2]
• [finding 3]
• [finding 4]
• [finding 5]
QUESTIONS
• [management question in Thai that needs urgent attention]
• [question 2]
• [question 3]
• [question 4]

Rules:
- INSIGHTS = observations with numbers (what IS happening)
- QUESTIONS = actionable things management should investigate
- Thai language throughout
- No markdown, no headers other than INSIGHTS / QUESTIONS`

    const message = `วิเคราะห์ข้อมูลหน้า "${pageLabel}":\n\n${trimmedContext}`

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
          session_id: `insights_${Date.now()}`,
          system,
          model: "qwen2.5:7b",
          stream: false,
        }),
        signal: AbortSignal.timeout(50_000), // 50s — qwen2.5 can be slow on big prompts
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
