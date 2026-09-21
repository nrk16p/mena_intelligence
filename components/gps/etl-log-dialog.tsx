"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, Inbox, RefreshCw, RotateCcw, X } from "lucide-react"
import { sourceColor } from "@/lib/gps-labels"

// ── Types (ตรงกับ /api/gps/etl-log) ──────────────────────────────────────────

export type EtlLogRow = {
  id: string
  source: string
  dateKey: string
  etlMonth: string
  status: string
  stage: string
  startedAt: string | null
  finishedAt: string | null
  durationSeconds: number | null
  errorType: string | null
  errorMessage: string | null
  isEmpty: boolean | null
  collections: string[]
  /** เวลาที่มี success ของ source+วันเดียวกันตามมาทีหลัง = error แถวนี้ถูกแก้แล้ว */
  resolvedAt: string | null
}

/** สถานะการกด "ดึงข้อมูลใหม่" ของแต่ละแถว — เก็บแยกจาก rows เพื่อให้รอดการ reload */
type RetryState = {
  phase: "sending" | "queued" | "failed"
  message?: string
  runsUrl?: string
}

type SourceSummary = {
  source: string
  runs: number
  errors: number
  /** error ที่ยังไม่มี success ตามมา — ตัวเลขที่บอกว่า "ยังต้องตามแก้" จริงๆ */
  openErrors: number
  lastStatus: string
  lastDateKey: string
  lastRunAt: string | null
}

// ── Date helpers (ตรึงเป็นเวลาไทยเสมอ ไม่ให้เพี้ยนตามเครื่องผู้ใช้) ──────────

const TZ = "Asia/Bangkok"
const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

/** ชิ้นส่วนวันที่ตามเวลาไทย — Intl เป็นทางเดียวที่แปลง timezone ได้โดยไม่ต้องพึ่ง lib */
function bkkParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ""
  return {
    y: get("year"), m: get("month"), d: get("day"),
    hh: get("hour"), mm: get("minute"), ss: get("second"),
  }
}

/** 2026-09-15T01:00Z → "15 ก.ย. 2026" (เวลาไทย) */
function dayLabel(isoTs: string) {
  const { y, m, d } = bkkParts(new Date(isoTs))
  return `${Number(d)} ${TH_MONTHS_SHORT[Number(m) - 1]} ${y}`
}

/** คีย์จัดกลุ่มรายวันตามเวลาไทย */
function dayKey(isoTs: string) {
  const { y, m, d } = bkkParts(new Date(isoTs))
  return `${y}-${m}-${d}`
}

function timeLabel(isoTs: string) {
  const { hh, mm, ss } = bkkParts(new Date(isoTs))
  return `${hh}:${mm}:${ss}`
}

/** date_key เก็บเป็น YYYY-MM-DD อยู่แล้ว — ไม่ต้องแปลง timezone ซ้ำ */
function dateKeyLabel(key: string) {
  const [y, m, d] = key.split("-")
  if (!y || !m || !d) return key || "—"
  return `${Number(d)} ${TH_MONTHS_SHORT[Number(m) - 1]} ${y}`
}

function agoLabel(isoTs: string, now: number) {
  const diff = Math.max(0, now - Date.parse(isoTs))
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "เมื่อครู่นี้"
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days} วันที่แล้ว` : dayLabel(isoTs)
}

function durationLabel(sec: number | null) {
  if (sec === null) return "—"
  if (sec < 1) return `${Math.round(sec * 1000)} ms`
  if (sec < 60) return `${sec.toFixed(1)} วิ`
  return `${Math.floor(sec / 60)} นาที ${Math.round(sec % 60)} วิ`
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${tone || "text-gray-900 dark:text-white"}`}>
        {value}
      </p>
    </div>
  )
}

function StatusDot({ status, resolved = false }: { status: string; resolved?: boolean }) {
  const ok = status === "success"
  // error ที่แก้แล้วไม่ควรเป็นจุดแดงเท่าเดิม — ยังอยู่ในประวัติ แต่ไม่ใช่เรื่องที่ต้องรีบ
  const tone = ok ? "bg-emerald-500" : resolved ? "bg-gray-300 dark:bg-white/20" : "bg-rose-500"
  return (
    <span
      title={ok ? "สำเร็จ" : resolved ? "ผิดพลาด (แก้แล้ว)" : "ผิดพลาด"}
      className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${tone}`}
    />
  )
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${sourceColor(source)}`}>
      {source}
    </span>
  )
}

// ── Dialog ────────────────────────────────────────────────────────────────────

export function EtlLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  const [rows, setRows] = useState<EtlLogRow[]>([])
  const [bySource, setBySource] = useState<SourceSummary[]>([])
  const [matched, setMatched] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [now, setNow] = useState(() => Date.now())

  const [canRetry, setCanRetry] = useState(false)
  const [retries, setRetries] = useState<Map<string, RetryState>>(new Map())

  const [hideResolved, setHideResolved] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all")
  const [sourceFilter, setSourceFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const qs = new URLSearchParams({ limit: "300" })
      if (statusFilter !== "all") qs.set("status", statusFilter)
      if (sourceFilter) qs.set("source", sourceFilter)
      const r = await fetch(`/api/gps/etl-log?${qs}`, { cache: "no-store" })
      const j = await r.json()
      if (!j.success) throw new Error(j.message ?? "โหลดไม่สำเร็จ")
      setRows(j.rows ?? [])
      setBySource(j.summary?.bySource ?? [])
      setMatched(j.matched ?? 0)
      setTruncated(Boolean(j.truncated))
      setCanRetry(Boolean(j.canRetry))
      setNow(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดประวัติ ETL ไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, sourceFilter])

  /**
   * สั่ง GitHub Actions ให้ดึงข้อมูลของ source + วันนั้นใหม่อีกครั้ง
   *
   * ยืนยันก่อนเสมอ — ปุ่มนี้ไม่ได้แค่โหลดหน้าใหม่ แต่ไปรัน job จริงที่ยิง API ของผู้ให้บริการ
   * (DTC จำกัด 3 requests/นาที/IP) จึงไม่ควรกดพลาดได้
   *
   * ผลลัพธ์จริงของรอบใหม่จะโผล่ใน etl_log ก็ต่อเมื่อ job รันจบ ซึ่งกินเวลาเป็นนาที —
   * จึงโหลดรายการซ้ำให้ครั้งเดียวหลัง 30 วิ แล้วปล่อยให้ผู้ใช้กดรีเฟรชเองถ้าอยากดูต่อ
   */
  const retry = useCallback(async (row: EtlLogRow) => {
    const label = `${row.source} · ${dateKeyLabel(row.dateKey)}`
    const ok = window.confirm(
      `สั่งดึงข้อมูล ${label} ใหม่อีกครั้ง?

` +
      `ระบบจะรัน GitHub Actions ของ ${row.source} ซึ่งจะเรียก API ของผู้ให้บริการจริง`
    )
    if (!ok) return

    const mark = (state: RetryState) =>
      setRetries((m) => new Map(m).set(row.id, state))

    mark({ phase: "sending" })
    try {
      const r = await fetch("/api/gps/etl-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: row.source, dateKey: row.dateKey }),
      })
      const j = await r.json()
      if (!j.success) {
        mark({ phase: "failed", message: j.message ?? "สั่งดึงใหม่ไม่สำเร็จ", runsUrl: j.runsUrl })
        return
      }
      mark({ phase: "queued", runsUrl: j.runsUrl })
      window.setTimeout(() => { if (ref.current?.open) load() }, 30_000)
    } catch (e) {
      mark({ phase: "failed", message: e instanceof Error ? e.message : "สั่งดึงใหม่ไม่สำเร็จ" })
    }
  }, [load])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  // โหลดใหม่ตอนเปิด และเมื่อเปลี่ยนตัวกรอง (เฉพาะขณะเปิดอยู่)
  useEffect(() => {
    if (open) load()
  }, [open, load])

  // เปิดใหม่ = เริ่มนับหนึ่ง ไม่ให้ป้าย "เข้าคิวแล้ว" ของรอบก่อนค้างมาหลอกตา
  useEffect(() => {
    if (open) setRetries(new Map())
  }, [open])

  // ตัวเลขสรุปมาจาก bySource ซึ่ง API คิดจากทั้ง collection เสมอ
  // จึงไม่ขยับตามตัวกรองที่ผู้ใช้เลือกดูอยู่
  const totals = useMemo(() => {
    const runs = bySource.reduce((s, x) => s + x.runs, 0)
    const errors = bySource.reduce((s, x) => s + x.errors, 0)
    const open = bySource.reduce((s, x) => s + (x.openErrors ?? 0), 0)
    return { runs, errors, open, fixed: errors - open, ok: runs - errors }
  }, [bySource])

  const lastRunAt = useMemo(
    () => bySource.map((s) => s.lastRunAt).filter(Boolean).sort().at(-1) ?? null,
    [bySource]
  )

  // error ที่ถูกแก้ไปแล้วคือเรื่องที่จบแล้ว — ซ่อนเป็นค่าเริ่มต้นไม่ให้บังของที่ยังค้างจริง
  const visibleRows = useMemo(
    () => (hideResolved ? rows.filter((r) => !r.resolvedAt) : rows),
    [rows, hideResolved]
  )
  const resolvedHidden = rows.length - visibleRows.length

  // จัดกลุ่มรายวัน — หลายร้อยแถวเรียงติดกันอ่านยากถ้าไม่มีหัววัน
  const groups = useMemo(() => {
    const map = new Map<string, EtlLogRow[]>()
    for (const r of visibleRows) {
      const k = r.startedAt ? dayKey(r.startedAt) : "unknown"
      map.set(k, [...(map.get(k) ?? []), r])
    }
    return [...map.entries()]
  }, [visibleRows])

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
      active
        ? "border-cyan-600 bg-cyan-600 text-white"
        : "border-gray-200 text-gray-500 hover:border-gray-400 dark:border-white/10 dark:text-gray-400"
    }`

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto w-[min(860px,94vw)] rounded-2xl border border-gray-200 bg-white p-0 text-gray-700 backdrop:bg-black/50 dark:border-white/10 dark:bg-[#1a1d27] dark:text-gray-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/8">
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">ประวัติการโหลดข้อมูล (ETL)</p>
          <p className="mt-0.5 text-xs text-gray-400">
            รอบการดึงข้อมูลของผู้ให้บริการ GPS แต่ละเจ้า — เรียงจากล่าสุดก่อน
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            disabled={loading}
            title="โหลดใหม่"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-white/8 dark:hover:text-white"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/8 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="themed-scroll max-h-[74vh] overflow-y-auto px-5 pb-5">
        {/* สรุปภาพรวม */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="รอบทั้งหมด" value={totals.runs.toLocaleString("en-US")} />
          <Stat label="สำเร็จ" value={totals.ok.toLocaleString("en-US")} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat
            label={totals.fixed > 0 ? `ผิดพลาด (แก้แล้ว ${totals.fixed})` : "ผิดพลาด"}
            value={totals.open.toLocaleString("en-US")}
            tone={totals.open ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}
          />
          <Stat label="รอบล่าสุด" value={lastRunAt ? agoLabel(lastRunAt, now) : "—"} />
        </div>

        {/* สถานะล่าสุดรายเจ้า — กดเพื่อกรอง */}
        <p className="mt-5 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
          สถานะล่าสุดของแต่ละผู้ให้บริการ
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {bySource.map((s) => (
            <button
              key={s.source}
              onClick={() => setSourceFilter(sourceFilter === s.source ? "" : s.source)}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                sourceFilter === s.source
                  ? "border-cyan-500 bg-cyan-50/60 dark:bg-cyan-500/8"
                  : "border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <StatusDot status={s.lastStatus} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <SourceBadge source={s.source} />
                    {s.openErrors > 0 ? (
                      <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                        ค้าง {s.openErrors}
                      </span>
                    ) : s.errors > 0 ? (
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        แก้แล้วครบ
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-gray-400">
                    ข้อมูลถึง {dateKeyLabel(s.lastDateKey)} · {s.runs} รอบ
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-gray-400">
                {s.lastRunAt ? agoLabel(s.lastRunAt, now) : "—"}
              </span>
            </button>
          ))}
        </div>

        {/* ตัวกรอง */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-white/8">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">สถานะ</span>
          <button onClick={() => setStatusFilter("all")} className={chip(statusFilter === "all")}>ทั้งหมด</button>
          <button onClick={() => setStatusFilter("success")} className={chip(statusFilter === "success")}>สำเร็จ</button>
          <button onClick={() => setStatusFilter("error")} className={chip(statusFilter === "error")}>ผิดพลาด</button>
          {sourceFilter && (
            <button
              onClick={() => setSourceFilter("")}
              className="ml-1 rounded-full border border-cyan-600 bg-cyan-600 px-2.5 py-0.5 text-[11px] font-medium text-white"
            >
              {sourceFilter} ✕
            </button>
          )}
          <button
            onClick={() => setHideResolved((v) => !v)}
            title="error ที่มี success ของวันเดียวกันตามมาทีหลัง"
            className={chip(hideResolved)}
          >
            {hideResolved ? "ซ่อนที่แก้แล้ว" : "แสดงที่แก้แล้ว"}
            {resolvedHidden > 0 && ` (${resolvedHidden})`}
          </button>

          <span className="ml-auto text-[11px] text-gray-400">
            {matched.toLocaleString("en-US")} รายการ
            {truncated && ` (แสดง ${rows.length.toLocaleString("en-US")} ล่าสุด)`}
          </span>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
            {error}
          </p>
        )}

        {loading && visibleRows.length === 0 && (
          <p className="py-10 text-center text-xs text-gray-400">กำลังโหลด…</p>
        )}

        {!error && !loading && visibleRows.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Inbox size={22} />
            <p className="text-xs">
              {resolvedHidden > 0
                ? `แก้ครบแล้วทั้ง ${resolvedHidden} รายการ`
                : "ไม่มีรายการตามเงื่อนไขที่เลือก"}
            </p>
          </div>
        )}

        {/* ไทม์ไลน์ */}
        <div className={loading ? "opacity-50 transition" : "transition"}>
          {groups.map(([day, items]) => (
            <div key={day} className="mt-4">
              <div className="sticky top-0 z-10 -mx-5 bg-white/90 px-5 py-1.5 backdrop-blur dark:bg-[#1a1d27]/90">
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  {items[0].startedAt ? dayLabel(items[0].startedAt) : "ไม่ทราบเวลา"}
                  <span className="ml-2 font-normal text-gray-400">{items.length} รอบ</span>
                </p>
              </div>

              <ul className="mt-1 space-y-1">
                {items.map((r) => {
                  const rt = retries.get(r.id)
                  return (
                  <li
                    key={r.id}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 ${
                      r.status === "error" && !r.resolvedAt
                        ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/15"
                        : "border-gray-100 dark:border-white/8"
                    }`}
                  >
                    <StatusDot status={r.status} resolved={Boolean(r.resolvedAt)} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SourceBadge source={r.source} />
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                          {dateKeyLabel(r.dateKey)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">{r.stage}</span>
                        {r.isEmpty && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            ไม่มีข้อมูล
                          </span>
                        )}
                        {r.status === "success" ? (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        ) : (
                          <AlertTriangle
                            size={12}
                            className={r.resolvedAt ? "text-gray-400" : "text-rose-500"}
                          />
                        )}
                        {r.resolvedAt && (
                          <span
                            title={`มีข้อมูลเข้ามาเมื่อ ${dayLabel(r.resolvedAt)} ${timeLabel(r.resolvedAt)}`}
                            className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          >
                            <CheckCircle2 size={9} />
                            แก้แล้ว · {agoLabel(r.resolvedAt, now)}
                          </span>
                        )}
                      </div>

                      {r.errorMessage && (
                        <p className={`mt-1 break-words text-[11px] ${
                          r.resolvedAt ? "text-gray-400" : "text-rose-600 dark:text-rose-400"
                        }`}>
                          {r.errorType ? `${r.errorType}: ` : ""}
                          {r.errorMessage}
                        </p>
                      )}

                      {r.collections.length > 0 && (
                        <p className="mt-0.5 truncate text-[10px] text-gray-400">
                          → {r.collections.join(", ")}
                        </p>
                      )}

                      {canRetry && r.status === "error" && !r.resolvedAt && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => retry(r)}
                            disabled={rt?.phase === "sending" || rt?.phase === "queued"}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-0.5 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/30"
                          >
                            <RotateCcw size={11} className={rt?.phase === "sending" ? "animate-spin" : ""} />
                            {rt?.phase === "sending" ? "กำลังสั่ง…" : "ดึงข้อมูลใหม่"}
                          </button>

                          {rt?.phase === "queued" && (
                            <span className="font-medium text-[11px] text-emerald-600 dark:text-emerald-400">
                              เข้าคิวแล้ว · รอ GitHub Actions รัน
                            </span>
                          )}

                          {rt?.phase === "failed" && (
                            <span className="text-[11px] text-rose-600 dark:text-rose-400">{rt.message}</span>
                          )}

                          {rt?.runsUrl && (
                            <a
                              href={rt.runsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
                            >
                              ดูบน GitHub <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                        {r.startedAt ? timeLabel(r.startedAt) : "—"}
                      </p>
                      <p className="text-[10px] tabular-nums text-gray-400">
                        {durationLabel(r.durationSeconds)}
                      </p>
                    </div>
                  </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[10px] text-gray-400">
          เวลาแสดงตามเขตเวลาไทย (Asia/Bangkok) · ที่มา{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-white/10">gps.etl_log</code>
        </p>
      </div>
    </dialog>
  )
}
