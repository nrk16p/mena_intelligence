"use client"

import { useEffect, useState } from "react"
import { Save, CheckCircle } from "lucide-react"
import { renderTemplate } from "@/lib/repair-daily"

const PREVIEW_VARS: Record<string, string> = {
  date_thai: "25/6/2569",
  opening_backlog: "69", new_repairs: "9", completed_today: "16",
  closing_backlog: "62", backlog_change: "-7", backlog_change_abs: "7",
  completed_in: "2", completed_out: "14",
  garage_in_count: "27", garage_out_count: "35",
  waiting_assessment: "9", waiting_approval: "4", waiting_parts: "6",
  in_progress: "16", out_completed: "14", vs_followup_count: "7",
  notes: "",
  received_today: "5", waiting_queue: "3", in_repair: "10",
  waiting_qc: "4", on_hold: "2", overdue_count: "3",
  target_complete: "5", urgent_close: "2", urgent_parts: "3",
  team_reallocation: "1", support_needed: "ขออะไหล่เพิ่มเติม",
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"vs" | "garage">("vs")
  const [vsTemplate, setVsTemplate] = useState("")
  const [garageTemplate, setGarageTemplate] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await fetch("/api/repair-daily/templates")
        if (!response.ok) {
          console.error("Failed to fetch templates")
          return
        }
        const data = await response.json()
        if (data.success) {
          setVsTemplate(data.vs)
          setGarageTemplate(data.garage)
        }
      } catch (error) {
        console.error("Error loading templates:", error)
      }
    }
    loadTemplates()
  }, [])

  const current = tab === "vs" ? vsTemplate : garageTemplate
  const preview = renderTemplate(current, PREVIEW_VARS)

  async function handleSave() {
    setSaving(true)
    try {
      const response = await fetch("/api/repair-daily/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, template_text: current }),
      })
      if (response.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const TAB_ACTIVE = "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
  const TAB_IDLE = "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-900 dark:hover:text-white"

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">ตั้งค่า LINE Template</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">แก้ไข template โดยใช้ <code className="bg-gray-100 dark:bg-white/10 px-1 rounded text-xs">{"{{variable}}"}</code> แทนค่าตัวเลข</p>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-1 w-fit">
        {(["vs", "garage"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? TAB_ACTIVE : TAB_IDLE}`}>
            {t === "vs" ? "VS (ภาพรวม)" : "อู่ใน"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Template Editor</p>
          <textarea
            value={current}
            onChange={e => tab === "vs" ? setVsTemplate(e.target.value) : setGarageTemplate(e.target.value)}
            rows={28}
            className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {saved ? <CheckCircle size={15} /> : <Save size={15} />}
            {saved ? "บันทึกแล้ว!" : saving ? "กำลังบันทึก..." : "บันทึก Template"}
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Preview (ข้อมูลตัวอย่าง)</p>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-4 min-h-[420px]">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{preview}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}
