import { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { question, context, model = "llama3.2", history = [] } = await req.json()

    const system = `You are a data analyst for a fleet vehicle maintenance cost dashboard.
Answer ONLY from the data given in each message. Never use general knowledge.
Answer in the same language as the question (Thai or English).`

    // Embed context directly into the user message so small models can't ignore it
    const userMessageWithContext = `ข้อมูล Dashboard (ใช้ข้อมูลนี้เท่านั้น):
${context}

คำถาม: ${question}`

    const messages = [
      ...history,
      { role: "user", content: userMessageWithContext },
    ]

    let ollamaRes: Response
    try {
      ollamaRes = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        model,
        system,
        messages,
        stream: true,
        options: { num_ctx: 16384 },  // larger context for full dashboard data
      }),
      })
    } catch {
      // fetch itself threw — Ollama is not reachable at all
      return new Response(
        "Ollama is not running.\n\nStart it with:\n  ollama serve\n\nThen pull a model:\n  ollama pull llama3.2",
        { status: 503 }
      )
    }

    if (!ollamaRes.ok || !ollamaRes.body) {
      const body = await ollamaRes.text().catch(() => "")
      const err = ollamaRes.status === 404
        ? `Model "${model}" not found.\n\nPull it with:\n  ollama pull ${model}`
        : `Ollama error (${ollamaRes.status}): ${body}`
      return new Response(err, { status: 503 })
    }

    // Transform Ollama NDJSON stream → plain text stream
    const reader = ollamaRes.body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) { controller.close(); break }

          for (const line of decoder.decode(value).split("\n")) {
            if (!line.trim()) continue
            try {
              const json = JSON.parse(line)
              const chunk = json.message?.content ?? ""
              if (chunk) controller.enqueue(encoder.encode(chunk))
              if (json.done) { controller.close(); return }
            } catch {}
          }
        }
      },
    })

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (err: any) {
    return new Response(err.message ?? "Unknown error", { status: 500 })
  }
}
