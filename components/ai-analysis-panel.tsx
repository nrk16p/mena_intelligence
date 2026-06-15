"use client"

import { useEffect, useRef, useState } from "react"
import { Brain, RefreshCw, AlertCircle, Building2, BarChart3, AlertTriangle, Zap, Sparkles } from "lucide-react"
import { useAiContext } from "@/lib/ai-context"

type SectionKey = "summary" | "workshop" | "costgroup" | "concerns" | "actions"

interface AnalysisData {
  summary:   string[]
  workshop:  string[]
  costgroup: string[]
  concerns:  string[]
  actions:   string[]
}

const SECTION_HEADERS: Record<string, SectionKey> = {
  "executive summary": "summary",
  "workshop analysis": "workshop",
  "cost group analysis": "costgroup",
  "top concerns":      "concerns",
  "key findings":      "concerns",
  "actions":           "actions",
}

function parseAnalysis(text: string): AnalysisData {
  const result: AnalysisData = { summary: [], workshop: [], costgroup: [], concerns: [], actions: [] }
  let current: SectionKey | null = null

  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue

    // Match section header
    const lower = line.toLowerCase().replace(/[：:]/g, "").trim()
    const matched = Object.keys(SECTION_HEADERS).find(k => lower.startsWith(k))
    if (matched) { current = SECTION_HEADERS[matched]; continue }

    if (!current) continue

    const cleaned = line
      .replace(/^[•\-\*\d+\.\)．]\s*/, "")
      .replace(/[，。、！？！？，]+$/, "")
      .trim()
    if (!cleaned || cleaned.length < 4) continue

    result[current].push(cleaned)
  }

  return result
}

function ActionBadge({ text }: { text: string }) {
  const upper = text.toUpperCase()
  if (upper.startsWith("HIGH:") || upper.startsWith("HIGH :")) {
    const body = text.replace(/^HIGH\s*:\s*/i, "")
    return (
      <div className="flex gap-2 items-start">
        <span className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">HIGH</span>
        <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{body}</p>
      </div>
    )
  }
  if (upper.startsWith("MEDIUM:") || upper.startsWith("MEDIUM :")) {
    const body = text.replace(/^MEDIUM\s*:\s*/i, "")
    return (
      <div className="flex gap-2 items-start">
        <span className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">MED</span>
        <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{body}</p>
      </div>
    )
  }
  if (upper.startsWith("LOW:") || upper.startsWith("LOW :")) {
    const body = text.replace(/^LOW\s*:\s*/i, "")
    return (
      <div className="flex gap-2 items-start">
        <span className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">LOW</span>
        <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{body}</p>
      </div>
    )
  }
  return <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{text}</p>
}

function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-gray-100 dark:bg-white/6 animate-pulse" style={{ width: ["100%", "85%", "92%", "78%", "95%"][i % 5] }} />
      ))}
    </div>
  )
}

interface SectionCardProps {
  icon: React.ReactNode
  title: string
  accent: string
  children: React.ReactNode
}
function SectionCard({ icon, title, accent, children }: SectionCardProps) {
  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-gray-500 dark:text-gray-400">{icon}</div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{title}</p>
      </div>
      {children}
    </div>
  )
}

export function AiSectionQuestions({ questions, label }: { questions: string[]; label?: string }) {
  const { fireTriggerQuestion } = useAiContext()
  if (!questions.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {label && <span className="text-[10px] text-gray-400 mr-0.5">{label}</span>}
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => fireTriggerQuestion(q)}
          className="flex items-center gap-1 rounded-lg border border-indigo-100 dark:border-indigo-800/30 bg-indigo-50 dark:bg-indigo-950/20 px-2 py-0.5 text-[11px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
        >
          <Sparkles size={9} className="shrink-0" />
          {q}
        </button>
      ))}
    </div>
  )
}

export function AiAnalysisPanel() {
  const { pageContext, pageLabel, fireTriggerQuestion } = useAiContext()
  const [data, setData]       = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const lastContext           = useRef("")

  async function generate(ctx: string, label: string) {
    setLoading(true); setError(""); setData(null)
    try {
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageContext: ctx, pageLabel: label }),
      })
      const text = await res.text()
      if (!res.ok) { setError(text); return }
      setData(parseAnalysis(text))
    } catch (e: any) {
      setError(e.message ?? "Failed to generate analysis")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!pageContext || pageContext === lastContext.current) return
    lastContext.current = pageContext
    generate(pageContext, pageLabel)
  }, [pageContext, pageLabel])

  if (!pageContext && !loading) return null

  const hasData = data && !loading

  return (
    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/40 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-[#0f1117] px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Brain size={14} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white">Senior DA Analysis</p>
            <p className="text-[10px] text-indigo-500 dark:text-indigo-400">
              {pageLabel ? `วิเคราะห์: ${pageLabel}` : "วิเคราะห์โดย qwen2.5:7b"}
            </p>
          </div>
        </div>
        <button
          onClick={() => generate(pageContext, pageLabel)}
          disabled={loading}
          title="Regenerate analysis"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
          <AlertCircle size={13} className="text-red-500 shrink-0" />
          <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {/* Summary skeleton */}
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800/20 bg-indigo-50/50 dark:bg-indigo-950/10 p-4">
            <div className="h-2.5 w-32 rounded bg-indigo-100 dark:bg-indigo-900/30 animate-pulse mb-3" />
            <SkeletonLines count={2} />
          </div>
          {/* Grid skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0,1,2,3].map(i => (
              <div key={i} className="rounded-xl border border-gray-100 dark:border-white/6 p-4">
                <div className="h-2.5 w-24 rounded bg-gray-100 dark:bg-white/6 animate-pulse mb-3" />
                <SkeletonLines count={3} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {hasData && (
        <div className="space-y-3">
          {/* Executive Summary — full width prominent */}
          {data.summary.length > 0 && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-700/40 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
                สรุปผู้บริหาร
              </p>
              <div className="space-y-1.5">
                {data.summary.map((s, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-indigo-900 dark:text-indigo-100 font-medium">{s}</p>
                ))}
              </div>
            </div>
          )}

          {/* 2-column grid for middle sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Workshop Analysis */}
            {data.workshop.length > 0 && (
              <SectionCard
                icon={<Building2 size={13} />}
                title="Workshop Analysis"
                accent="border-sky-100 dark:border-sky-800/20 bg-sky-50/50 dark:bg-sky-950/10"
              >
                <ul className="space-y-2">
                  {data.workshop.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                      <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{b}</p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {/* Cost Group Analysis */}
            {data.costgroup.length > 0 && (
              <SectionCard
                icon={<BarChart3 size={13} />}
                title="Cost Group Analysis"
                accent="border-violet-100 dark:border-violet-800/20 bg-violet-50/50 dark:bg-violet-950/10"
              >
                <ul className="space-y-2">
                  {data.costgroup.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                      <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{b}</p>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {/* Top Concerns */}
            {data.concerns.length > 0 && (
              <SectionCard
                icon={<AlertTriangle size={13} />}
                title="Top Concerns"
                accent="border-orange-100 dark:border-orange-800/20 bg-orange-50/50 dark:bg-orange-950/10"
              >
                <ul className="space-y-2">
                  {data.concerns.map((b, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40 text-[9px] font-bold text-orange-600 dark:text-orange-400">
                        {i + 1}
                      </span>
                      <button
                        onClick={() => fireTriggerQuestion(b)}
                        className="text-left text-[12px] leading-relaxed text-gray-700 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                      >
                        {b}
                      </button>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {/* Actions */}
            {data.actions.length > 0 && (
              <SectionCard
                icon={<Zap size={13} />}
                title="Actions"
                accent="border-emerald-100 dark:border-emerald-800/20 bg-emerald-50/50 dark:bg-emerald-950/10"
              >
                <div className="space-y-2">
                  {data.actions.map((a, i) => (
                    <ActionBadge key={i} text={a} />
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
