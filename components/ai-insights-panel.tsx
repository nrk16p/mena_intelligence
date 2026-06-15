"use client"

import { useState } from "react"
import { Sparkles, RefreshCw, AlertCircle, ChevronRight } from "lucide-react"
import { useAiContext } from "@/lib/ai-context"

interface InsightsData {
  insights: string[]
  questions: string[]
}

function parseResponse(text: string): InsightsData {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const insights: string[] = []
  const questions: string[] = []
  let section: "insights" | "questions" | null = null

  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower === "insights" || lower.startsWith("insight")) { section = "insights"; continue }
    if (lower === "questions" || lower.startsWith("question") || lower.includes("คำถาม")) { section = "questions"; continue }

    // Remove bullet prefix and trailing Chinese/fullwidth punctuation
    const cleaned = line
      .replace(/^[•\-\*\d+\.\)．]\s*/, "")
      .replace(/[，。、！？！？，]+$/, "")
      .trim()
    if (!cleaned || cleaned.length < 4) continue

    if (section === "insights") insights.push(cleaned)
    else if (section === "questions") questions.push(cleaned)
    else if (insights.length === 0) insights.push(cleaned)
  }

  return { insights: insights.slice(0, 6), questions: questions.slice(0, 4) }
}

function SkeletonLine({ w = "full" }: { w?: string }) {
  return <div className={`h-3 w-${w} rounded bg-gray-100 dark:bg-white/6 animate-pulse`} />
}

export function AiInsightsPanel() {
  const { pageContext, pageLabel, fireTriggerQuestion } = useAiContext()
  const [data, setData]       = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  async function generate() {
    if (!pageContext) return
    setLoading(true); setError(""); setData(null)
    try {
      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageContext, pageLabel }),
      })
      const text = await res.text()
      if (!res.ok) { setError(text); return }
      setData(parseResponse(text))
    } catch (e: any) {
      setError(e.message ?? "Failed to generate insights")
    } finally {
      setLoading(false)
    }
  }

  if (!pageContext) return null

  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-800/40 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-[#0f1117] px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white">
            <Sparkles size={14} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white">AI Insights</p>
            <p className="text-[10px] text-violet-500 dark:text-violet-400">
              {pageLabel ? `จาก ${pageLabel}` : "วิเคราะห์โดย qwen2.5:7b"}
            </p>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          title="Regenerate insights"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-600 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Idle state — not yet generated */}
      {!loading && !data && !error && (
        <button
          onClick={generate}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-violet-200 dark:border-violet-700/40 bg-violet-50/50 dark:bg-violet-950/10 py-3 text-[12px] text-violet-500 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:border-violet-300 dark:hover:border-violet-600 transition-all"
        >
          <Sparkles size={13} />
          วิเคราะห์ข้อมูลนี้ด้วย AI
        </button>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">กำลังวิเคราะห์...</p>
            <div className="space-y-2.5">
              {[0,1,2,3,4].map((i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-violet-200 animate-pulse" />
                  <SkeletonLine w={["full","3/4","5/6","full","2/3"][i]} />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">คำถามสำคัญ...</p>
            <div className="space-y-2">
              {[0,1,2,3].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
          <AlertCircle size={13} className="text-red-500 shrink-0" />
          <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Insights */}
          {data.insights.length > 0 && (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-violet-500 dark:text-violet-400">
                ข้อสังเกตสำคัญ
              </p>
              <ul className="space-y-2">
                {data.insights.map((insight, i) => (
                  <li key={i} className="flex gap-2.5 items-start">
                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-[9px] font-bold text-violet-600 dark:text-violet-400">
                      {i + 1}
                    </span>
                    <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{insight}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions */}
          {data.questions.length > 0 && (
            <div>
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-blue-500 dark:text-blue-400">
                คำถามที่ควรสำรวจ
              </p>
              <div className="space-y-2">
                {data.questions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => fireTriggerQuestion(q)}
                    className="flex w-full items-center gap-2 rounded-xl border border-blue-100 dark:border-blue-800/30 bg-white dark:bg-blue-950/10 px-3 py-2 text-left text-[12px] text-blue-700 dark:text-blue-300 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all group"
                  >
                    <ChevronRight size={12} className="shrink-0 text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300" />
                    <span className="leading-relaxed">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
