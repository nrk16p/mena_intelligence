// app/repair-daily/history/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Edit2, Copy, CheckCircle } from "lucide-react"
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { vsToTemplateVars, garageToTemplateVars, renderTemplate, toThaiDate } from "@/lib/repair-daily"
import type { VSRecord, GarageRecord } from "@/lib/repair-daily"

function monthRange(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const last = new Date(y, d.getMonth() + 1, 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${last}`, label: `${m}/${y}` }
}

export default function HistoryPage() {
  const router = useRouter()
  const [tab, setTab] = useState<"vs" | "garage">("vs")
  const [monthOffset, setMonthOffset] = useState(0)
  const [vsData, setVsData] = useState<VSRecord[]>([])
  const [garageData, setGarageData] = useState<GarageRecord[]>([])
  const [templates, setTemplates] = useState({ vs: "", garage: "" })
  const [copiedDate, setCopiedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const range = monthRange(monthOffset)

  useEffect(() => {
    fetch("/api/repair-daily/templates")
      .then(r => r.json())
      .then(j => { if (j.success) setTemplates({ vs: j.vs, garage: j.garage }) })
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/repair-daily/vs?from=${range.from}&to=${range.to}`).then(r => r.json()),
      fetch(`/api/repair-daily/garage?from=${range.from}&to=${range.to}`).then(r => r.json()),
    ]).then(([vs, garage]) => {
      if (vs.success) setVsData([...vs.data].sort((a: VSRecord, b: VSRecord) => a.date.localeCompare(b.date)))
      if (garage.success) setGarageData([...garage.data].sort((a: GarageRecord, b: GarageRecord) => a.date.localeCompare(b.date)))
    }).finally(() => setLoading(false))
  }, [range.from, range.to])

  function copyLine(record: VSRecord | GarageRecord, type: "vs" | "garage") {
    const vars = type === "vs" ? vsToTemplateVars(record as VSRecord) : garageToTemplateVars(record as GarageRecord)
    const text = renderTemplate(type === "vs" ? templates.vs : templates.garage, vars)
    navigator.clipboard.writeText(text)
    setCopiedDate(record.date)
    setTimeout(() => setCopiedDate(null), 2000)
  }

  const chartData = tab === "vs"
    ? vsData.map(r => ({ label: toThaiDate(r.date).slice(0, 5), closing_backlog: r.closing_backlog, completed_today: r.completed_today }))
    : garageData.map(r => ({ label: toThaiDate(r.date).slice(0, 5), closing_backlog: r.closing_backlog, completed_today: r.completed_today }))

  const TAB_ACTIVE = "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
  const TAB_IDLE = "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-white"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">ประวัติรายงานซ่อม</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset(o => o - 1)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors">‹</button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-20 text-center">{range.label}</span>
          <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors disabled:opacity-40" disabled={monthOffset >= 0}>›</button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-1 w-fit">
        {(["vs", "garage"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? TAB_ACTIVE : TAB_IDLE}`}>
            {t === "vs" ? "VS (ภาพรวม)" : "อู่ใน"}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      {chartData.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">📈 คงค้างสิ้นวัน (Backlog Trend)</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="closing_backlog" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="คงค้าง" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">📊 ซ่อมเสร็จต่อวัน</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="completed_today" fill="#059669" radius={[4, 4, 0, 0]} name="เสร็จ" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/8">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">วันที่</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ต้นวัน</th>
              {tab === "vs" ? (
                <>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รับใหม่</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">เสร็จ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สิ้นวัน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">อู่ใน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">อู่นอก</th>
                </>
              ) : (
                <>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รับเข้า</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">เสร็จ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สิ้นวัน</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">เกินกำหนด</th>
                </>
              )}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(tab === "vs" ? vsData : garageData).length === 0 && !loading && (
              <tr><td colSpan={tab === "vs" ? 8 : 7} className="text-center py-8 text-sm text-gray-400">ไม่มีข้อมูลในเดือนนี้</td></tr>
            )}
            {tab === "vs" && [...vsData].reverse().map(r => (
              <tr key={r.date} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{toThaiDate(r.date)}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.opening_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.new_repairs}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.completed_today}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{r.closing_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.garage_in_count}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.garage_out_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => router.push(`/repair-daily/vs?date=${r.date}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="แก้ไข"><Edit2 size={13} /></button>
                    <button onClick={() => copyLine(r, "vs")} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="คัดลอก LINE">
                      {copiedDate === r.date ? <CheckCircle size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tab === "garage" && [...garageData].reverse().map(r => (
              <tr key={r.date} className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{toThaiDate(r.date)}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.opening_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.received_today}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.completed_today}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{r.closing_backlog}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{r.overdue_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => router.push(`/repair-daily/garage?date=${r.date}`)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="แก้ไข"><Edit2 size={13} /></button>
                    <button onClick={() => copyLine(r, "garage")} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-white/8 transition-colors" title="คัดลอก LINE">
                      {copiedDate === r.date ? <CheckCircle size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
