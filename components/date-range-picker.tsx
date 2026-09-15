"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type DateRange = { start: string; end: string }

// ── Date helpers (UTC-anchored so YYYY-MM-DD never shifts by timezone) ────────

const DAY_MS = 86_400_000

export function parseISO(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

export function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number) {
  return toISO(new Date(parseISO(iso).getTime() + n * DAY_MS))
}

/** Calendar-month arithmetic, clamped: 2026-03-31 minus 1 month → 2026-02-28. */
export function addMonths(iso: string, n: number) {
  const d = parseISO(iso)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return toISO(target)
}

export function daysInRange(r: DateRange) {
  return Math.round((parseISO(r.end).getTime() - parseISO(r.start).getTime()) / DAY_MS) + 1
}

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]
const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]
const TH_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]

/** 2026-08-31 → "31 ส.ค. 2026" */
export function dateLabel(iso: string) {
  if (!iso) return ""
  const d = parseISO(iso)
  return `${d.getUTCDate()} ${TH_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function rangeLabel(r: DateRange) {
  if (!r.start || !r.end) return "เลือกช่วงวันที่"
  if (r.start === r.end) return dateLabel(r.start)
  return `${dateLabel(r.start)} – ${dateLabel(r.end)}`
}

// ── Presets ───────────────────────────────────────────────────────────────────

/**
 * Anchored to the newest day that actually has data, not to the browser's today:
 * vendor ETL runs a day or two behind, so "7 วันล่าสุด" off the wall clock would
 * routinely include empty days and under-report every truck.
 */
export const PRESETS: { key: string; label: string; from: (anchor: string) => string }[] = [
  { key: "7d",  label: "7 วันล่าสุด",   from: (a) => addDays(a, -6) },
  { key: "15d", label: "15 วันล่าสุด",  from: (a) => addDays(a, -14) },
  { key: "1m",  label: "1 เดือนล่าสุด", from: (a) => addDays(addMonths(a, -1), 1) },
]

export function presetRange(key: string, anchor: string): DateRange | null {
  const p = PRESETS.find((x) => x.key === key)
  return p ? { start: p.from(anchor), end: anchor } : null
}

/** Which preset (if any) the current range matches — keeps the shortcut list in
 *  sync when the range was set by hand. */
function matchPreset(range: DateRange, anchor: string) {
  return PRESETS.find((p) => range.end === anchor && range.start === p.from(anchor))?.key ?? ""
}

// ── Calendar grid ─────────────────────────────────────────────────────────────

function monthGrid(year: number, month: number) {
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= total; d++) cells.push(toISO(new Date(Date.UTC(year, month, d))))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function MonthView({
  year,
  month,
  range,
  pending,
  hover,
  min,
  max,
  onPick,
  onHover,
}: {
  year: number
  month: number
  range: DateRange
  pending: string
  hover: string
  min?: string
  max?: string
  onPick: (iso: string) => void
  onHover: (iso: string) => void
}) {
  const cells = useMemo(() => monthGrid(year, month), [year, month])

  // While picking the second day, preview against the hovered cell instead of
  // the committed range.
  const [lo, hi] = pending ? [pending, hover || pending].sort() : [range.start, range.end]

  return (
    <div className="w-[15.5rem]">
      <div className="mb-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-200">
        {TH_MONTHS[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {TH_WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium text-gray-400">{w}</div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} />
          const disabled = Boolean((min && iso < min) || (max && iso > max))
          const inRange = Boolean(lo && hi && iso >= lo && iso <= hi)
          const isEdge = iso === lo || iso === hi

          return (
            <div
              key={iso}
              className={cn(
                "flex justify-center",
                inRange && !isEdge && "bg-cyan-50 dark:bg-cyan-500/10",
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso)}
                onMouseEnter={() => onHover(iso)}
                className={cn(
                  "h-7 w-7 rounded-lg text-[11px] tabular-nums transition",
                  disabled && "cursor-not-allowed text-gray-300 dark:text-gray-700",
                  !disabled && !inRange && "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10",
                  !disabled && inRange && !isEdge && "text-cyan-700 dark:text-cyan-300",
                  !disabled && isEdge && "bg-cyan-600 font-semibold text-white hover:bg-cyan-700",
                )}
              >
                {parseISO(iso).getUTCDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Picker ────────────────────────────────────────────────────────────────────

/**
 * Calendar range picker with "last N days" shortcuts.
 *
 * Emits only complete ranges: onChange fires once the second day is picked (or a
 * shortcut is clicked), never mid-selection, so callers can react to every change.
 */
export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
}: {
  value: DateRange
  onChange: (r: DateRange) => void
  min?: string
  max?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState("")
  const [hover, setHover] = useState("")
  const [cursor, setCursor] = useState(() => value.start || max || toISO(new Date()))
  const boxRef = useRef<HTMLDivElement>(null)

  const anchor = max || toISO(new Date())
  const activePreset = value.start && value.end ? matchPreset(value, anchor) : ""

  // Reopening should land on the range in force, not wherever it was left.
  useEffect(() => {
    if (!open) return
    setCursor(value.start || anchor)
    setPending("")
    setHover("")
  }, [open, value.start, anchor])

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const cur = parseISO(cursor)
  const y = cur.getUTCFullYear()
  const m = cur.getUTCMonth()
  const next = new Date(Date.UTC(y, m + 1, 1))

  function pick(iso: string) {
    if (!pending) {
      setPending(iso)
      setHover(iso)
      return
    }
    const [start, end] = [pending, iso].sort()
    setPending("")
    onChange({ start, end })
    setOpen(false)
  }

  function applyPreset(key: string) {
    const r = presetRange(key, anchor)
    if (!r) return
    // A shortcut may reach back further than the data goes; clamp rather than
    // query days that cannot exist.
    onChange({ start: min && r.start < min ? min : r.start, end: r.end })
    setOpen(false)
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-700 outline-none transition hover:border-cyan-500 disabled:opacity-40 dark:border-white/10 dark:text-white"
      >
        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
        <span className="tabular-nums">{rangeLabel(value)}</span>
        {value.start && value.end && (
          <span className="text-[10px] text-gray-400">({daysInRange(value)} วัน)</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl sm:flex-row dark:border-white/10 dark:bg-[#1a1d27]">
          {/* Shortcuts */}
          <div className="flex flex-row gap-1 sm:w-32 sm:flex-col sm:border-r sm:border-gray-100 sm:pr-3 dark:sm:border-white/10">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-left text-[11px] whitespace-nowrap transition",
                  activePreset === p.key
                    ? "bg-cyan-600 font-semibold text-white"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendars */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCursor(addMonths(cursor, -1))}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[10px] text-gray-400">
                {pending ? "เลือกวันสิ้นสุด" : "เลือกวันเริ่มต้น"}
              </span>
              <button
                type="button"
                onClick={() => setCursor(addMonths(cursor, 1))}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-4" onMouseLeave={() => setHover(pending)}>
              <MonthView
                year={y} month={m}
                range={value} pending={pending} hover={hover}
                min={min} max={max}
                onPick={pick} onHover={setHover}
              />
              <div className="hidden sm:block">
                <MonthView
                  year={next.getUTCFullYear()} month={next.getUTCMonth()}
                  range={value} pending={pending} hover={hover}
                  min={min} max={max}
                  onPick={pick} onHover={setHover}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
