"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Copy, Save, CheckCircle } from "lucide-react"
import { todayISO, garageToTemplateVars, renderTemplate } from "@/lib/repair-daily"
import type { GarageRecord } from "@/lib/repair-daily"

const INPUT_CLS = "w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
const LABEL_CLS = "block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
const SECTION_CLS = "rounded-xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-5"

function NumInput({ label, value, onChange, disabled }: { label: string; value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={e => onChange?.(Number(e.target.value))}
        disabled={disabled}
        className={INPUT_CLS}
      />
    </div>
  )
}

function GarageFormInner() {
  const searchParams = useSearchParams()
  const urlDate = searchParams.get("date")

  const [date, setDate] = useState(urlDate ?? todayISO())
  const [openingBacklog, setOpeningBacklog] = useState(0)
  const [receivedToday, setReceivedToday] = useState(0)
  const [completedToday, setCompletedToday] = useState(0)
  const [waitingQueue, setWaitingQueue] = useState(0)
  const [inRepair, setInRepair] = useState(0)
  const [waitingParts, setWaitingParts] = useState(0)
  const [waitingQc, setWaitingQc] = useState(0)
  const [onHold, setOnHold] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [targetComplete, setTargetComplete] = useState(0)
  const [urgentClose, setUrgentClose] = useState(0)
  const [urgentParts, setUrgentParts] = useState(0)
  const [teamReallocation, setTeamReallocation] = useState(0)
  const [supportNeeded, setSupportNeeded] = useState("")
  const [template, setTemplate] = useState("")
  const [lineText, setLineText] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)

  const closingBacklog = openingBacklog + receivedToday - completedToday
  const backlogChange = closingBacklog - openingBacklog
  const statusSum = waitingQueue + inRepair + waitingParts + waitingQc + onHold

  const loadRecord = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/repair-daily/garage?from=${d}&to=${d}`)
      const json = await res.json()
      if (json.success && json.data.length > 0) {
        const r: GarageRecord = json.data[0]
        setOpeningBacklog(r.opening_backlog)
        setReceivedToday(r.received_today)
        setCompletedToday(r.completed_today)
        setWaitingQueue(r.status.waiting_queue)
        setInRepair(r.status.in_repair)
        setWaitingParts(r.status.waiting_parts)
        setWaitingQc(r.status.waiting_qc)
        setOnHold(r.status.on_hold)
        setOverdueCount(r.overdue_count)
        setTargetComplete(r.next_day.target_complete)
        setUrgentClose(r.next_day.urgent_close)
        setUrgentParts(r.next_day.urgent_parts)
        setTeamReallocation(r.next_day.team_reallocation)
        setSupportNeeded(r.next_day.support_needed ?? "")
        setIsEdit(true)
      } else {
        setOpeningBacklog(0); setReceivedToday(0); setCompletedToday(0)
        setWaitingQueue(0); setInRepair(0); setWaitingParts(0)
        setWaitingQc(0); setOnHold(0); setOverdueCount(0)
        setTargetComplete(0); setUrgentClose(0); setUrgentParts(0)
        setTeamReallocation(0); setSupportNeeded("")
        setIsEdit(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRecord(date) }, [date, loadRecord])

  useEffect(() => {
    fetch("/api/repair-daily/templates")
      .then(r => r.json())
      .then(j => { if (j.success) setTemplate(j.garage) })
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const record: GarageRecord = {
        date,
        opening_backlog: openingBacklog,
        received_today: receivedToday,
        completed_today: completedToday,
        closing_backlog: closingBacklog,
        backlog_change: backlogChange,
        status: { waiting_queue: waitingQueue, in_repair: inRepair, waiting_parts: waitingParts, waiting_qc: waitingQc, on_hold: onHold },
        overdue_count: overdueCount,
        next_day: { target_complete: targetComplete, urgent_close: urgentClose, urgent_parts: urgentParts, team_reallocation: teamReallocation, support_needed: supportNeeded },
      }
      const res = await fetch("/api/repair-daily/garage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      })
      if (!res.ok) return
      const text = renderTemplate(template, garageToTemplateVars(record))
      setLineText(text)
      setIsEdit(true)
    } finally {
      setSaving(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(lineText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">สรุปงานอู่ใน</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {isEdit ? "แก้ไขรายการที่มีอยู่" : "บันทึกรายการใหม่"}
          </p>
        </div>
        <div>
          <label className={LABEL_CLS}>วันที่</label>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); setLineText("") }}
            className={INPUT_CLS + " w-44"}
          />
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔷 สรุปงานอู่ใน</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="คงค้างอู่ในต้นวัน (คัน)" value={openingBacklog} onChange={setOpeningBacklog} />
          <NumInput label="รับเข้าอู่ในวันนี้ (คัน)" value={receivedToday} onChange={setReceivedToday} />
          <NumInput label="ซ่อมเสร็จส่งมอบวันนี้ (คัน)" value={completedToday} onChange={setCompletedToday} />
          <div>
            <label className={LABEL_CLS}>คงค้างอู่ในสิ้นวัน (AUTO)</label>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {closingBacklog} คัน {backlogChange !== 0 && <span className={backlogChange < 0 ? "text-green-600" : "text-red-500"}>({backlogChange > 0 ? "+" : ""}{backlogChange})</span>}
            </div>
          </div>
        </div>
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔧 สถานะรถคงค้างอู่ใน</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="รอขึ้นซ่อม (คัน)" value={waitingQueue} onChange={setWaitingQueue} />
          <NumInput label="กำลังซ่อม (คัน)" value={inRepair} onChange={setInRepair} />
          <NumInput label="รออะไหล่ (คัน)" value={waitingParts} onChange={setWaitingParts} />
          <NumInput label="รอ QC / รอส่งมอบ (คัน)" value={waitingQc} onChange={setWaitingQc} />
          <NumInput label="ชะลอซ่อม (คัน)" value={onHold} onChange={setOnHold} />
        </div>
        {statusSum !== closingBacklog && closingBacklog > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠️ ผลรวมสถานะ ({statusSum}) ≠ คงค้างสิ้นวัน ({closingBacklog})</p>
        )}
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">⏰ เกินกำหนด & แผนวันถัดไป</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="งานเกินกำหนดอู่ใน (คัน)" value={overdueCount} onChange={setOverdueCount} />
          <NumInput label="เป้าซ่อมเสร็จส่งมอบ (คัน)" value={targetComplete} onChange={setTargetComplete} />
          <NumInput label="งานที่ต้องเร่งปิด (คัน)" value={urgentClose} onChange={setUrgentClose} />
          <NumInput label="งานที่ต้องเร่งอะไหล่ (คัน)" value={urgentParts} onChange={setUrgentParts} />
          <NumInput label="งานที่ต้องจัดช่าง/โยกทีม (คัน)" value={teamReallocation} onChange={setTeamReallocation} />
        </div>
        <div className="mt-4">
          <label className={LABEL_CLS}>เรื่องที่ต้องขอ Support</label>
          <textarea
            value={supportNeeded}
            onChange={e => setSupportNeeded(e.target.value)}
            rows={2}
            className={INPUT_CLS}
            placeholder="………………………………………"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
      >
        <Save size={15} />
        {saving ? "กำลังบันทึก..." : "บันทึก & สร้าง LINE Text"}
      </button>

      {lineText && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">LINE Text พร้อมคัดลอก</p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-emerald-900/30 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
              {copied ? "คัดลอกแล้ว!" : "คัดลอก"}
            </button>
          </div>
          <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{lineText}</pre>
        </div>
      )}
    </div>
  )
}

export default function GaragePage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">กำลังโหลด...</div>}>
      <GarageFormInner />
    </Suspense>
  )
}
