"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Copy, Save, CheckCircle } from "lucide-react"
import { todayISO, vsToTemplateVars, renderTemplate, toThaiDate } from "@/lib/repair-daily"
import type { VSRecord } from "@/lib/repair-daily"

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

function VSFormInner() {
  const searchParams = useSearchParams()
  const urlDate = searchParams.get("date")

  const [date, setDate] = useState(urlDate ?? todayISO())
  const [openingBacklog, setOpeningBacklog] = useState(0)
  const [newRepairs, setNewRepairs] = useState(0)
  const [completedToday, setCompletedToday] = useState(0)
  const [completedIn, setCompletedIn] = useState(0)
  const [completedOut, setCompletedOut] = useState(0)
  const [garageInCount, setGarageInCount] = useState(0)
  const [garageOutCount, setGarageOutCount] = useState(0)
  const [waitingAssessment, setWaitingAssessment] = useState(0)
  const [waitingApproval, setWaitingApproval] = useState(0)
  const [waitingParts, setWaitingParts] = useState(0)
  const [inProgress, setInProgress] = useState(0)
  const [outCompleted, setOutCompleted] = useState(0)
  const [vsFollowup, setVsFollowup] = useState(0)
  const [notes, setNotes] = useState("")
  const [template, setTemplate] = useState("")
  const [lineText, setLineText] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(false)

  const closingBacklog = openingBacklog + newRepairs - completedToday
  const backlogChange = closingBacklog - openingBacklog

  const loadRecord = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/repair-daily/vs?from=${d}&to=${d}`)
      const json = await res.json()
      if (json.success && json.data.length > 0) {
        const r: VSRecord = json.data[0]
        setOpeningBacklog(r.opening_backlog)
        setNewRepairs(r.new_repairs)
        setCompletedToday(r.completed_today)
        setCompletedIn(r.completed_in)
        setCompletedOut(r.completed_out)
        setGarageInCount(r.garage_in_count)
        setGarageOutCount(r.garage_out_count)
        setWaitingAssessment(r.garage_out_status.waiting_assessment)
        setWaitingApproval(r.garage_out_status.waiting_approval)
        setWaitingParts(r.garage_out_status.waiting_parts)
        setInProgress(r.garage_out_status.in_progress)
        setOutCompleted(r.garage_out_status.completed)
        setVsFollowup(r.vs_followup_count)
        setNotes(r.notes ?? "")
        setIsEdit(true)
      } else {
        setOpeningBacklog(0); setNewRepairs(0); setCompletedToday(0)
        setCompletedIn(0); setCompletedOut(0); setGarageInCount(0)
        setGarageOutCount(0); setWaitingAssessment(0); setWaitingApproval(0)
        setWaitingParts(0); setInProgress(0); setOutCompleted(0)
        setVsFollowup(0); setNotes("")
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
      .then(j => { if (j.success) setTemplate(j.vs) })
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const record: VSRecord = {
        date,
        opening_backlog: openingBacklog,
        new_repairs: newRepairs,
        completed_today: completedToday,
        closing_backlog: closingBacklog,
        backlog_change: backlogChange,
        completed_in: completedIn,
        completed_out: completedOut,
        garage_in_count: garageInCount,
        garage_out_count: garageOutCount,
        garage_out_status: {
          waiting_assessment: waitingAssessment,
          waiting_approval: waitingApproval,
          waiting_parts: waitingParts,
          in_progress: inProgress,
          completed: outCompleted,
        },
        vs_followup_count: vsFollowup,
        notes,
      }
      await fetch("/api/repair-daily/vs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) })
      const text = renderTemplate(template, vsToTemplateVars(record))
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
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">รายงานสรุปการแจ้งซ่อม (VS)</h1>
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
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔷 สรุปภาพรวมงานแจ้งซ่อม</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="คงค้างต้นวัน (คัน)" value={openingBacklog} onChange={setOpeningBacklog} />
          <NumInput label="รับแจ้งซ่อมใหม่วันนี้ (คัน)" value={newRepairs} onChange={setNewRepairs} />
          <NumInput label="ซ่อมเสร็จส่งมอบวันนี้ (คัน)" value={completedToday} onChange={setCompletedToday} />
          <div>
            <label className={LABEL_CLS}>คงค้างสิ้นวันรวม (AUTO)</label>
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {closingBacklog} คัน {backlogChange !== 0 && <span className={backlogChange < 0 ? "text-green-600" : "text-red-500"}>({backlogChange > 0 ? "+" : ""}{backlogChange})</span>}
            </div>
          </div>
          <NumInput label="อู่ในเสร็จ (คัน)" value={completedIn} onChange={setCompletedIn} />
          <NumInput label="อู่นอกเสร็จ (คัน)" value={completedOut} onChange={setCompletedOut} />
        </div>
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🔧 แยกคงค้างสิ้นวัน</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="🏭 อู่ใน (คัน)" value={garageInCount} onChange={setGarageInCount} />
          <NumInput label="↗️ อู่นอก (คัน)" value={garageOutCount} onChange={setGarageOutCount} />
        </div>
        {garageInCount + garageOutCount !== closingBacklog && closingBacklog > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠️ อู่ใน + อู่นอก ({garageInCount + garageOutCount}) ≠ คงค้างสิ้นวัน ({closingBacklog})</p>
        )}
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">↗️ สถานะอู่นอก</p>
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="รอประเมิน (คัน)" value={waitingAssessment} onChange={setWaitingAssessment} />
          <NumInput label="รออนุมัติซ่อม (คัน)" value={waitingApproval} onChange={setWaitingApproval} />
          <NumInput label="รออะไหล่ (คัน)" value={waitingParts} onChange={setWaitingParts} />
          <NumInput label="อยู่ระหว่างซ่อม (คัน)" value={inProgress} onChange={setInProgress} />
          <NumInput label="เสร็จ (คัน)" value={outCompleted} onChange={setOutCompleted} />
        </div>
      </div>

      <div className={SECTION_CLS}>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">🎯 แผนติดตามวันถัดไป</p>
        <NumInput label="งานอู่นอกที่ต้องเร่งติดตาม (คัน)" value={vsFollowup} onChange={setVsFollowup} />
        <div className="mt-4">
          <label className={LABEL_CLS}>หมายเหตุ</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className={INPUT_CLS}
            placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
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

export default function VSPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">กำลังโหลด...</div>}>
      <VSFormInner />
    </Suspense>
  )
}
