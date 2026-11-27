"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { isBiUser } from "@/lib/bi"
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Info, RefreshCw, Search } from "lucide-react"
import AgeSplitTab from "./AgeSplitTab"
import CheckTab from "./CheckTab"
import FleetBudgetTab from "./FleetBudgetTab"
import PrBudgetTab from "./PrBudgetTab"
import fleetBudget from "./fleet-budget-2569.json"
import { CATEGORIES, fleetPivot, type FleetBudgetFile, type FleetCellIn } from "@/lib/budget-check"

// ── Snapshot shape (written by mena-backend-services job `budget-control`) ──
type Category = "ซ่อม" | "PM" | "ยาง"
type Row = { group: string; category: Category; budget: number; wd: number; wd_yesterday: number; dd_open: number; pr_open: number; pr_approved: number; pr_pending: number }
type Pending = { code: string; date: string; plate: string; group: string; category: Category; total: number; levels_done: number; requester: string; note: string }
type OpenLine = { group: string; category: Category; plate: string; dd: string; pr: string; received: string; item: string; qty: number; open_qty: number; open_amount: number }
type PlateRow = { plate: string; group: string; wd: number; dd_open: number; pr_open: number; pr_pending: number; fleet?: string | null }
type Snapshot = {
  branch: string; month: string; cut: string; computed_at: string; pace: number
  sources: { wd_at: string | null; pr_at: string | null; po_at: string | null; dd_at: string | null; budget_at: string | null; plates_from: string | null; daily_to?: string | null; budget_lines: number }
  rows: Row[]; pending_prs: Pending[]; dd_open_lines: OpenLine[]; by_plate: PlateRow[]; by_fleet?: FleetCellIn[]
  owner_switched?: Switched[]
}
type Switched = { plate: string; changes: { from: string; group: string }[] }

const CATS: Category[] = ["ซ่อม", "PM", "ยาง"]
const CAT_LABEL: Record<Category, string> = { ซ่อม: "ซ่อม/อะไหล่", PM: "PM", ยาง: "ยาง" }
const GROUP_LABEL: Record<string, string> = { "ML|บริษัท": "ML บริษัท", "MS|บริษัท": "MS บริษัท", "ML|ร่วม": "ML ร่วม", "MS|ร่วม": "MS ร่วม",  }
const GROUP_ORDER = ["ML|บริษัท", "MS|บริษัท", "ML|ร่วม", "MS|ร่วม"]
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

const fmt = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US")
const short = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : ""
  return a >= 1e6 ? `${s}${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${s}${Math.round(a / 1e3)}k` : `${s}${Math.round(a)}`
}
/** Plates outside the GPM mixer list (group "อื่น") are not shown anywhere on this page. */
const dropOutside = (s: Snapshot | null): Snapshot | null => {
  if (!s) return s
  const keep = <T extends { group: string }>(a: T[]) => a.filter((x) => x.group !== "อื่น")
  return { ...s, rows: keep(s.rows), pending_prs: keep(s.pending_prs), dd_open_lines: keep(s.dd_open_lines), by_plate: keep(s.by_plate),
    owner_switched: s.owner_switched?.map((w) => ({ ...w, changes: w.changes.filter((c) => c.group !== "อื่น") })).filter((w) => w.changes.length > 1) }
}
const PAGE = 50
const glabel = (g: string) => GROUP_LABEL[g] ?? g
const PR_TEXT = (p: Pending) => `${p.code} ${p.plate} ${glabel(p.group)} ${p.requester} ${p.note}`
const DD_TEXT = (l: OpenLine) => `${l.plate} ${glabel(l.group)} ${l.item} ${l.dd} ${l.pr}`
const PLATE_TEXT = (r: PlateRow) => `${r.plate} ${glabel(r.group)}`
const squash = (v: string) => v.replace(/\s/g, "").toLowerCase()
/** Search + paging shared by the list tabs. */
function usePaged<T>(items: T[], text: (x: T) => string) {
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)
  const hit = useMemo(() => { const k = squash(q); return k ? items.filter((x) => squash(text(x)).includes(k)) : items }, [items, q, text])
  const pages = Math.max(1, Math.ceil(hit.length / PAGE))
  const p = Math.min(page, pages - 1)
  return { q, setQ: (v: string) => { setQ(v); setPage(0) }, hit, rows: hit.slice(p * PAGE, p * PAGE + PAGE), page: p, pages, setPage }
}
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 dark:border-white/10 dark:bg-[#0d0f18]">
      <Search size={16} aria-hidden="true" className="text-gray-400" />
      <span className="sr-only">ค้นหา</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 flex-1 bg-transparent text-[14px] outline-none dark:text-white" />
    </label>
  )
}
function Pager({ page, pages, total, setPage }: { page: number; pages: number; total: number; setPage: (n: number) => void }) {
  if (total <= PAGE) return <p className="text-[13px] text-gray-500 dark:text-gray-400">{total} รายการ</p>
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-gray-200 px-2 text-[13px] disabled:opacity-40 dark:border-white/10"
  return (
    <nav aria-label="หน้า" className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-600 dark:text-gray-400">
      <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} จาก {total}</span>
      <span className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="ก่อนหน้า"><ChevronLeft size={16} /></button>
        <span className="px-2">หน้า {page + 1} / {pages}</span>
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="ถัดไป"><ChevronRight size={16} /></button>
      </span>
    </nav>
  )
}
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const monthLabel = (m: string) => `${TH_MONTH[Number(m.slice(5, 7)) - 1]} ${String(Number(m.slice(0, 4)) + 543).slice(2)}`
/** Source stamps are naive UTC strings ('YYYY-MM-DD HH:MM:SS'); show Bangkok time. */
function bkk(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(/[zZ+]/.test(v.slice(10)) ? v : v.replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime()) ? null : d
}
const hhmm = (d: Date | null) => (d ? d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) : "—")
const dayTime = (d: Date | null) => (d ? d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")
const ageH = (d: Date | null) => (d ? (Date.now() - d.getTime()) / 3600_000 : Infinity)

type Cell = { budget: number; wd: number; dd: number; pr: number; pend: number }
const sumCells = (rows: Row[]): Cell => rows.reduce((a, r) => ({ budget: a.budget + r.budget, wd: a.wd + r.wd, dd: a.dd + r.dd_open, pr: a.pr + r.pr_open, pend: a.pend + r.pr_pending }), { budget: 0, wd: 0, dd: 0, pr: 0, pend: 0 })

// ── Page ───────────────────────────────────────────────────────
export default function BudgetControlPage() {
  // open on this month (Bangkok); a later month may already have a snapshot (budget only) but is not the default
  const [month, setMonth] = useState<string>(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7))
  const [months, setMonths] = useState<string[]>([])
  const [data, setData] = useState<Snapshot | null>(null)
  const [state, setState] = useState<"loading" | "ok" | "error">("loading")
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"overview" | "legs" | "pending" | "dd" | "plate" | "age" | "fleet" | "prsum" | "check">("overview")
  const [view, setView] = useState<"group" | "fleet">("group")
  const { data: session } = useSession()
  const bi = isBiUser(session?.user?.email) // BI preview: new views only for the BI team until opened to everyone
  const [srcOpen, setSrcOpen] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    fetch(`/api/budget-control?branch=${encodeURIComponent("ศลบ")}${month ? `&month=${month}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (!j.success) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ")
        setMonths(j.months ?? [])
        // no snapshot for this month yet (e.g. the 1st before 07:25): show the newest one instead
        if (!j.data && j.months?.length && !j.months.includes(month)) { setMonth(j.months[0]); return }
        setData(dropOutside(j.data))
        setState("ok")
      })
      .catch((e: Error) => { if (alive) { setError(e.message); setState("error") } })
    return () => { alive = false }
  }, [month, reload])

  const computed = bkk(data?.computed_at ?? null)
  const stale = data && data.pace < 1 && ageH(computed) > 2

  return (
    <div className="mx-auto max-w-[1376px] space-y-4 pb-16 tabular-nums">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="ตำแหน่ง" className="text-[13px] text-gray-500 dark:text-gray-400">
            <Link href="/" className="hover:text-gray-800 dark:hover:text-gray-200">หน้าแรก</Link> / ผู้บริหาร
          </nav>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ควบคุมงบประมาณ</h1>
        </div>
      </header>

      <section aria-label="ตัวกรอง" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/8 dark:bg-[#0d0f18]">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500 dark:text-gray-400">สาขา</span>
          <div role="radiogroup" aria-label="สาขา" className="inline-flex gap-0.5 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
            <span role="radio" aria-checked="true" className="rounded-lg bg-white px-3.5 py-1.5 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-[#14161f] dark:text-emerald-300 dark:ring-emerald-800/50">ลาดกระบัง · ศลบ</span>
            <span role="radio" aria-checked="false" aria-disabled="true" title="job คุมงบยังคำนวณแค่ ศลบ" className="cursor-not-allowed px-3.5 py-1.5 text-[13px] text-gray-400 dark:text-gray-500">สระบุรี · สสบ <span className="text-[11px]">ยังไม่มีข้อมูล</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span id="bc-month-label" className="text-[12px] text-gray-500 dark:text-gray-400">เดือน</span>
          <MonthStepper value={data?.month ?? month} months={months.length ? months : data ? [data.month] : []} onChange={(m) => { setState("loading"); setMonth(m) }} />
        </div>
        <div className="flex-1" />
        {data && (
          <div className="relative">
            <button type="button" onClick={() => setSrcOpen((o) => !o)} aria-expanded={srcOpen}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-[13px] text-gray-700 dark:border-white/10 dark:bg-[#0d0f18] dark:text-gray-300">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
              {stale ? `ข้อมูลค้าง ${Math.floor(ageH(computed))} ชม.` : `อัปเดต ${hhmm(computed)}`}
              {data.pace < 1 && !stale && <span className="text-gray-500">· ทุก 1 ชม.</span>}
              <ChevronRight size={13} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${srcOpen ? "rotate-90" : ""}`} />
            </button>
            {srcOpen && <SourcePanel data={data} computed={computed} />}
          </div>
        )}
      </section>

      {state === "loading" && <Skeleton />}
      {state === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          โหลดข้อมูลไม่ได้: {error}
          <button type="button" onClick={() => { setState("loading"); setReload((n) => n + 1) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-[13px] dark:border-red-800"><RefreshCw size={13} /> ลองอีกครั้ง</button>
        </div>
      )}
      {state === "ok" && !data && (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-[14px] text-gray-600 dark:border-white/15 dark:text-gray-400">
          ยังไม่มีข้อมูล รอ job ควบคุมงบประมาณรันรอบแรก (ทุกชั่วโมง 07:25–20:25)
        </div>
      )}
      {state === "ok" && data && (
        <>
          {stale && (
            <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
              ตัวเลขนี้คำนวณเมื่อ {dayTime(computed)} รอบล่าสุดยังไม่สำเร็จ อย่าใช้ตัดสินอนุมัติ PR จนกว่าจะอัปเดต
            </p>
          )}
          <Summary data={data} />
          <nav aria-label="มุมมอง" className="overflow-x-auto border-b border-gray-200 dark:border-white/10">
            <div role="tablist" className="flex min-w-max items-end gap-6 px-1">
              {([
                ["ภาพรวม", [["overview", "งบคงเหลือ", null], ["legs", "ซื้อ · ใช้ · สต๊อก", "bi"]]],
                ["ขาซื้อ · PR", [["pending", "รออนุมัติ", { n: data.pending_prs.length, tone: "amber" }], ["prsum", "สรุปงบจาก PR", null], ["check", "เช็กงบจากเลข PR", "bi"]]],
                ["ขาใช้ · ของ / รถ", [["dd", "รับของแล้วรอเบิก", { n: data.dd_open_lines.length, tone: "gray" }], ["plate", "รายคัน", null]]],
                ["ตั้งงบ", [["age", "ปันตามอายุรถ", null], ["fleet", "งบรายฟลีท", "bi"]]],
              ] as const).map(([cap, all], gi) => [cap, all.filter((it) => bi || it[2] !== "bi"), gi] as const).filter(([, items]) => items.length).map(([cap, items, gi]) => (
                <div key={cap} className={`flex flex-col ${gi ? "border-l border-gray-200 pl-6 dark:border-white/10" : ""}`}>
                  <span className="mb-0.5 text-[11px] font-semibold tracking-wide text-gray-400 dark:text-gray-500">{cap}</span>
                  <div className="flex gap-1">
                    {items.map(([k, label, badge]) => (
                      <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className={`-mb-px inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[14px] ${tab === k ? "border-emerald-700 font-semibold text-emerald-800 dark:border-emerald-400 dark:text-emerald-300" : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`}>
                        {label}
                        {badge === "bi" && <span className="rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">BI</span>}
                        {badge && badge !== "bi" && badge.n > 0 && (
                          <span className={`rounded-full px-1.5 text-[11px] font-semibold ${badge.tone === "amber" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300"}`}>{badge.n}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>
          {tab === "overview" && bi && (
            <div className="flex flex-wrap items-center gap-3">
              <div role="radiogroup" aria-label="แบ่งตาม" className="inline-flex gap-0.5 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
                {([["group", "ตามกลุ่ม"], ["fleet", "ตามฟลีท"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}
                    className={`min-h-[34px] rounded-lg px-3.5 text-[13px] ${view === k ? "bg-white font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-[#14161f] dark:text-emerald-300 dark:ring-emerald-800/50" : "text-gray-600 dark:text-gray-400"}`}>{label}</button>
                ))}
              </div>
              <span className="text-[13px] text-gray-500 dark:text-gray-400">{view === "group" ? "ML / MS บริษัท และรถร่วม" : "รถบริษัทแยกตามฟลีทใน ATMS เช่น Asia ML, Scco ML"}</span>
            </div>
          )}
          {tab === "overview" && (view === "group" || !bi) && <Pivot rows={data.rows} />}
          {tab === "overview" && bi && view === "fleet" && <FleetPivot cells={data.by_fleet} month={data.month} />}
          {tab === "legs" && <TwoLegs cells={data.by_fleet} month={data.month} />}
          {tab === "pending" && <PendingTable data={data} />}
          {tab === "prsum" && <PrBudgetTab month={data.month} cut={data.cut} rows={data.rows} pending={data.pending_prs} />}
          {tab === "check" && <CheckTab />}
          {tab === "dd" && <DdTable lines={data.dd_open_lines} />}
          {tab === "plate" && <PlateTable rows={data.by_plate} switched={data.owner_switched ?? []} />}
          {tab === "age" && <AgeSplitTab />}
          {tab === "fleet" && <FleetBudgetTab />}
        </>
      )}
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="h-40 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
      <div className="h-80 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
    </div>
  )
}

function SourcePanel({ data, computed }: { data: Snapshot; computed: Date | null }) {
  const s = data.sources
  const items: [string, string, string, boolean][] = [
    ["PR อนุมัติ / รออนุมัติ", dayTime(bkk(s.pr_at)), "ATMS ทุก 1 ชม. 07:15–20:15", ageH(bkk(s.pr_at)) > 2],
    ["PO", dayTime(bkk(s.po_at)), "ATMS ทุก 4 ชม.", ageH(bkk(s.po_at)) > 5],
    ["รับของ (DD) ล่าสุด", dayTime(bkk(s.dd_at)), "ใบรับของใบล่าสุดที่ดึงมาได้", false],
    ["ตัดจ่ายแล้ว (WD)", dayTime(bkk(s.wd_at)), "datawarehouse รอบโหลดล่าสุด", ageH(bkk(s.wd_at)) > 26],
    ["งบ 2569", dayTime(bkk(s.budget_at)), `${s.budget_lines} บรรทัด`, false],
    s.daily_to
      ? ["รถบริษัท / รถร่วม", `รถรายวันถึง ${ddmm(s.daily_to)}`, `คนขับ พจร. = รถร่วม ตามวันของแต่ละรายการ · ไม่อยู่ในรายงานใช้ GPM ${s.plates_from ? monthLabel(s.plates_from) : ""}`, false]
      : ["ทะเบียน ML / MS / ร่วม", s.plates_from ? `GPM ${monthLabel(s.plates_from)}` : "—", "เดือนล่าสุดที่มีไฟล์", false],
  ]
  return (
    <div role="dialog" aria-label="แหล่งข้อมูล"
      className="absolute right-0 top-12 z-20 w-[min(360px,calc(100vw-32px))] rounded-xl bg-gray-900 p-4 text-[13px] text-gray-100 shadow-xl">
      <div className="mb-2 flex justify-between gap-3">
        <span className="font-semibold">คำนวณล่าสุด {dayTime(computed)}</span>
        <span className="text-gray-400">ตัดถึง {data.cut.slice(8)}/{data.cut.slice(5, 7)}</span>
      </div>
      {items.map(([name, at, every, old]) => (
        <div key={name} className="flex justify-between gap-3 border-t border-white/10 py-2">
          <span className="flex items-center gap-2"><span aria-hidden="true" className={`h-2 w-2 rounded-full ${old ? "bg-amber-400" : "bg-emerald-400"}`} />{name}</span>
          <span className="text-right"><span className="font-semibold">{at}</span><br /><span className="text-[12px] text-gray-400">{every}</span></span>
        </div>
      ))}
    </div>
  )
}

function Summary({ data }: { data: Snapshot }) {
  const c = sumCells(data.rows.filter((r) => r.group.endsWith("บริษัท")))
  const used = c.wd + c.dd + c.pr
  const rem = c.budget - used
  const pct = c.budget ? used / c.budget : 0
  const scale = Math.max(c.budget, used) || 1
  const w = (v: number) => `${(v / scale) * 100}%`
  const budgetAt = (c.budget / scale) * 100
  return (
    <section aria-label="สรุปรถบริษัท" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-white/8 dark:bg-[#0d0f18]">
      <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
        <div title="งบ − ตัดจ่ายแล้ว − รับของแล้วรอเบิก − PR อนุมัติ (ยังไม่รับของ)">
          <p className="text-[13px] text-gray-500 dark:text-gray-400">คงเหลือ · รถบริษัท ML+MS</p>
          <p className={`text-[40px] font-bold leading-tight ${rem < 0 ? "text-red-700 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{fmt(rem)}</p>
          <p className="text-[13px] text-gray-600 dark:text-gray-300">
            ใช้ <strong className={pct > 1 ? "text-red-700 dark:text-red-400" : ""}>{Math.round(pct * 100)}%</strong>
            {data.pace < 1 && <> · ควรอยู่ {Math.round(data.pace * 100)}%</>}
          </p>
        </div>
        <dl className="flex flex-wrap gap-8">
          {[
            ["งบ", short(c.budget), fmt(c.budget), ""],
            ["ใช้ไป", short(used), `ตัดจ่าย ${fmt(c.wd)} + รับของรอเบิก ${fmt(c.dd)} + PR อนุมัติ ${fmt(c.pr)}`, ""],
            ["PR รออนุมัติ", short(c.pend), fmt(c.pend), "text-amber-700 dark:text-amber-400"],
            ["ถ้าผ่าน", short(rem - c.pend), fmt(rem - c.pend), rem - c.pend < 0 ? "text-red-700 dark:text-red-400" : ""],
          ].map(([k, v, tip, cls]) => (
            <div key={k} title={tip}>
              <dt className="text-[13px] text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className={`text-xl font-semibold text-gray-900 dark:text-white ${cls}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="space-y-1.5">
        <div role="img" aria-label={`ใช้ไป ${Math.round(pct * 100)}% ของงบ`} className="relative flex h-4 overflow-hidden rounded-md bg-gray-100 dark:bg-white/8">
          <div style={{ width: w(c.wd) }} className="bg-emerald-800" />
          <div style={{ width: w(c.dd) }} className="border-l-2 border-white bg-emerald-500 dark:border-[#0d0f18]" />
          <div style={{ width: w(c.pr), background: "repeating-linear-gradient(135deg,#2F8F6B 0 3px,#D6EEE4 3px 6px)" }} className="border-l-2 border-white dark:border-[#0d0f18]" />
          {used > c.budget && <div style={{ left: `${budgetAt}%`, background: "repeating-linear-gradient(45deg,rgba(180,35,24,.85) 0 3px,rgba(255,255,255,.5) 3px 6px)" }} className="absolute inset-y-0 right-0" />}
          <div style={{ left: `calc(${budgetAt}% - 1px)` }} className="absolute inset-y-0 w-[3px] bg-gray-900 dark:bg-white" />
          {data.pace < 1 && <div style={{ left: `${budgetAt * data.pace}%` }} className="absolute inset-y-0 border-l-2 border-dashed border-white" />}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-600 dark:text-gray-400">
          <Legend swatch="bg-emerald-800">ตัดจ่ายแล้ว</Legend>
          <Legend swatch="bg-emerald-500">รับของแล้วรอเบิก</Legend>
          <Legend style={{ background: "repeating-linear-gradient(135deg,#2F8F6B 0 2px,#D6EEE4 2px 4px)" }}>PR อนุมัติ</Legend>
          <Legend swatch="bg-gray-900 dark:bg-white" thin>งบ</Legend>
          {data.pace < 1 && <span className="inline-flex items-center gap-1.5"><span className="h-3 border-l-2 border-dashed border-gray-500" />วันนี้</span>}
          {used > c.budget && <Legend style={{ background: "repeating-linear-gradient(45deg,#B42318 0 2px,#fff 2px 4px)" }}><span className="text-red-700 dark:text-red-400">เกินงบ</span></Legend>}
        </div>
      </div>
    </section>
  )
}

function Legend({ swatch = "", style, thin, children }: { swatch?: string; style?: React.CSSProperties; thin?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span style={style} className={`${thin ? "h-3 w-[3px]" : "h-2.5 w-2.5 rounded-sm"} ${swatch}`} />
      {children}
    </span>
  )
}

const TH = "px-3.5 py-2.5 text-right font-semibold"
const TD = "px-3.5 py-2 text-right"
const neg = (v: number) => (v < 0 ? "text-red-700 dark:text-red-400" : "")

function PivotLine({ label, c, kind, open, onToggle }: { label: string; c: Cell; kind: "group" | "child" | "total"; open?: boolean; onToggle?: () => void }) {
  const hasB = c.budget !== 0
  const used = c.wd + c.dd + c.pr
  const rem = c.budget - used
  const pct = hasB ? Math.round((used / c.budget) * 100) : null
  return (
    <tr className={`${kind === "child" ? "border-t border-gray-100 dark:border-white/5" : "border-t-2 border-gray-200 dark:border-white/10"} ${kind === "group" ? "bg-gray-50 font-semibold dark:bg-white/3" : kind === "total" ? "bg-emerald-50/60 font-bold dark:bg-emerald-950/20" : ""} hover:bg-gray-50 dark:hover:bg-white/5`}>
      <th scope="row" className={`px-3.5 py-1.5 text-left ${kind === "child" ? "pl-11 font-normal text-gray-600 dark:text-gray-300" : ""}`}>
        {kind === "group" ? (
          <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex min-h-[32px] items-center gap-1.5">
            <ChevronRight size={14} aria-hidden="true" className={`text-gray-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
            {label}
          </button>
        ) : label}
      </th>
      <td className={TD}>{hasB ? fmt(c.budget) : "—"}</td>
      <td className={TD}>{fmt(c.wd)}</td>
      <td className={TD}>{fmt(c.dd)}</td>
      <td className={TD}>{fmt(c.pr)}</td>
      <td className={`${TD} bg-emerald-50/50 font-semibold dark:bg-emerald-950/20 ${hasB ? neg(rem) : ""}`}>{hasB ? fmt(rem) : "—"}</td>
      <td className={`${TD} text-amber-700 dark:text-amber-400`}>{c.pend ? fmt(c.pend) : "—"}</td>
      <td className={`${TD} ${hasB ? neg(rem - c.pend) : ""}`}>{hasB ? fmt(rem - c.pend) : "—"}</td>
      <td className={TD}>
        <span className="inline-flex items-center gap-2">
          <span className="relative inline-block h-1.5 w-[72px] overflow-hidden rounded bg-gray-200 dark:bg-white/10">
            <span className="absolute inset-y-0 left-0" style={{ width: `${pct === null ? 0 : Math.min(pct, 100)}%`, background: pct !== null && pct > 100 ? "repeating-linear-gradient(45deg,#B42318 0 2px,#F6C9C4 2px 4px)" : "#047857" }} />
          </span>
          <span className={`min-w-[40px] ${pct !== null && pct > 100 ? "text-red-700 dark:text-red-400" : ""}`}>{pct === null ? "—" : `${pct}%`}</span>
        </span>
      </td>
    </tr>
  )
}

function Pivot({ rows }: { rows: Row[] }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({ "ML|ร่วม": true, "MS|ร่วม": true })
  const groups = GROUP_ORDER.filter((g) => rows.some((r) => r.group === g))
  const company = groups.filter((g) => g.endsWith("บริษัท"))
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]">
      <table className="w-full min-w-[1080px] border-collapse text-[14px]">
        <thead>
          <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
            <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">กลุ่ม / ประเภท</th>
            <th scope="col" className={TH}>งบ</th>
            <th scope="col" className={TH}>ตัดจ่ายแล้ว (WD)</th>
            <th scope="col" className={TH}>รับของแล้วรอเบิก (DD)</th>
            <th scope="col" className={TH}>PR อนุมัติ</th>
            <th scope="col" className={`${TH} bg-emerald-50/60 dark:bg-emerald-950/20`}>
              <span title="งบ − ตัดจ่ายแล้ว − รับของแล้วรอเบิก − PR อนุมัติ · เงินแต่ละก้อนอยู่ได้ช่องเดียว (PR → PO → DD → WD) · ไม่นับ PR เข้าสต๊อก และน้ำมันเชื้อเพลิง" className="inline-flex items-center gap-1">
                คงเหลือ <Info size={12} aria-hidden="true" />
              </span>
            </th>
            <th scope="col" className={TH}>PR รออนุมัติ</th>
            <th scope="col" className={TH}>ถ้า PR รอผ่าน</th>
            <th scope="col" className={TH}>ใช้ไป</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const gr = rows.filter((r) => r.group === g)
            const open = !closed[g]
            return (
              <FragmentRows key={g}>
                <PivotLine label={GROUP_LABEL[g] ?? g} c={sumCells(gr)} kind="group" open={open} onToggle={() => setClosed({ ...closed, [g]: open })} />
                {open && CATS.map((cat) => {
                  const r = gr.filter((x) => x.category === cat)
                  return r.length ? <PivotLine key={cat} label={CAT_LABEL[cat]} c={sumCells(r)} kind="child" /> : null
                })}
                {g === company[company.length - 1] && <PivotLine label="รวมรถบริษัท" c={sumCells(rows.filter((r) => r.group.endsWith("บริษัท")))} kind="total" />}
              </FragmentRows>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
function FleetPivot({ cells, month }: { cells: FleetCellIn[] | undefined; month: string }) {
  const rows = useMemo(() => fleetPivot(cells ?? [], fleetBudget as FleetBudgetFile, month), [cells, month])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (!cells) {
    return <p className="rounded-xl border border-gray-200 bg-white p-4 text-[14px] text-gray-700 dark:border-white/8 dark:bg-[#0d0f18] dark:text-gray-300">ยอดรายฟลีทยังไม่พร้อม รอรอบคำนวณถัดไป (ทุกชั่วโมง 07:25–20:25)</p>
  }
  const cellOf = (r: (typeof rows)[number]) => CATEGORIES.reduce((a, c) => ({ budget: a.budget + r.cats[c].budget, wd: a.wd + r.cats[c].wd, dd: a.dd + r.cats[c].dd, pr: a.pr + r.cats[c].pr, pend: a.pend + r.cats[c].pend }), { budget: 0, wd: 0, dd: 0, pr: 0, pend: 0 })
  const groups = [...new Set(rows.map((r) => r.groupId))]
  return (
    <div className="grid gap-2">
      <p className="text-[12px] text-gray-500 dark:text-gray-400">งบจากแท็บงบรายฟลีท (ซ่อมปันตามอายุรถ PM กับยางปันตามจำนวนคัน) · วิธีคิดเหมือนตามกลุ่ม</p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]">
        <table className="w-full min-w-[1080px] border-collapse text-[14px]">
          <thead>
            <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
              <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">ฟลีท / ประเภท</th>
              <th scope="col" className={TH}>งบ</th>
              <th scope="col" className={TH}>ตัดจ่ายแล้ว (WD)</th>
              <th scope="col" className={TH}>รับของแล้วรอเบิก (DD)</th>
              <th scope="col" className={TH}>PR อนุมัติ</th>
              <th scope="col" className={`${TH} bg-emerald-50/60 dark:bg-emerald-950/20`}>คงเหลือ</th>
              <th scope="col" className={TH}>PR รออนุมัติ</th>
              <th scope="col" className={TH}>ถ้า PR รอผ่าน</th>
              <th scope="col" className={TH}>ใช้ไป</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const gr = rows.filter((r) => r.groupId === g)
              return (
                <FragmentRows key={g}>
                  {gr.map((r) => {
                    const k = `${g}|${r.fleet}`
                    return (
                      <FragmentRows key={k}>
                        <PivotLine label={r.fleet} c={cellOf(r)} kind="group" open={!!open[k]} onToggle={() => setOpen({ ...open, [k]: !open[k] })} />
                        {open[k] && CATEGORIES.map((c) => <PivotLine key={c} label={CAT_LABEL[c]} c={r.cats[c]} kind="child" />)}
                      </FragmentRows>
                    )
                  })}
                  <PivotLine label={`รวม ${g} บริษัท`} c={gr.reduce((a, r) => { const x = cellOf(r); return { budget: a.budget + x.budget, wd: a.wd + x.wd, dd: a.dd + x.dd, pr: a.pr + x.pr, pend: a.pend + x.pend } }, { budget: 0, wd: 0, dd: 0, pr: 0, pend: 0 })} kind="total" />
                </FragmentRows>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
/** สองขา: buy (PR approved this month) and use (WD) each against the same monthly budget, never added together;
 *  stock = received (DD) but not yet issued to a truck. Per fleet, totals per group. */
function TwoLegs({ cells, month }: { cells: FleetCellIn[] | undefined; month: string }) {
  const rows = useMemo(() => fleetPivot(cells ?? [], fleetBudget as FleetBudgetFile, month, true), [cells, month])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  // a month with no transactions yet has no cells at all: that is ready (budget only), not "missing"
  if (!cells || (cells.length > 0 && !cells.some((c) => c.pr_approved !== undefined))) {
    return <p className="rounded-xl border border-gray-200 bg-white p-4 text-[14px] text-gray-700 dark:border-white/8 dark:bg-[#0d0f18] dark:text-gray-300">ยอดซื้อรายฟลีทยังไม่พร้อม รอรอบคำนวณถัดไป (ทุกชั่วโมง 07:25–20:25)</p>
  }
  type C = { budget: number; buy: number; wd: number; dd: number }
  const add = (a: C, b: C): C => ({ budget: a.budget + b.budget, buy: a.buy + b.buy, wd: a.wd + b.wd, dd: a.dd + b.dd })
  const zero: C = { budget: 0, buy: 0, wd: 0, dd: 0 }
  const ofRow = (r: (typeof rows)[number]) => CATEGORIES.reduce((a, c) => add(a, r.cats[c]), zero)
  const groups = [...new Set(rows.map((r) => r.groupId))]
  const left = (b: number, v: number) => (
    <td className={`${TD} font-semibold ${b ? (b - v < 0 ? "text-red-700 dark:text-red-400" : "text-emerald-800 dark:text-emerald-300") : ""}`}>{b ? `${b - v < 0 ? "เกิน " : "เหลือ "}${fmt(Math.abs(b - v))}` : "—"}</td>
  )
  const pct = (b: number, v: number) => (b ? `${Math.round((v / b) * 100)}%` : "—")
  const Line = ({ label, c, kind, k }: { label: string; c: C; kind: "group" | "child" | "total"; k?: string }) => (
    <tr className={`${kind === "child" ? "border-t border-gray-100 dark:border-white/5" : "border-t-2 border-gray-200 dark:border-white/10"} ${kind === "group" ? "bg-gray-50 font-semibold dark:bg-white/3" : kind === "total" ? "bg-emerald-50/60 font-bold dark:bg-emerald-950/20" : ""}`}>
      <th scope="row" className={`px-3.5 py-1.5 text-left ${kind === "child" ? "pl-11 font-normal text-gray-600 dark:text-gray-300" : ""}`}>
        {kind === "group" && k ? (
          <button type="button" onClick={() => setOpen({ ...open, [k]: !open[k] })} aria-expanded={!!open[k]} className="inline-flex min-h-[32px] items-center gap-1.5">
            <ChevronRight size={14} aria-hidden="true" className={`text-gray-400 transition-transform motion-reduce:transition-none ${open[k] ? "rotate-90" : ""}`} />{label}
          </button>
        ) : label}
      </th>
      <td className={TD}>{c.budget ? fmt(c.budget) : "—"}</td>
      <td className={`${TD} border-l border-gray-100 dark:border-white/5`}>{fmt(c.buy)} <span className="text-[12px] text-gray-500">{pct(c.budget, c.buy)}</span></td>
      {left(c.budget, c.buy)}
      <td className={`${TD} border-l border-gray-100 dark:border-white/5`}>{fmt(c.wd)} <span className="text-[12px] text-gray-500">{pct(c.budget, c.wd)}</span></td>
      {left(c.budget, c.wd)}
      <td className={`${TD} border-l border-gray-100 dark:border-white/5`}>{c.dd ? fmt(c.dd) : "—"}</td>
    </tr>
  )
  return (
    <div className="grid gap-2">
      <p className="text-[13px] text-gray-600 dark:text-gray-400">
        งบเดือนเดียวกันเทียบสองขา ไม่เอามาบวกกัน · <b className="text-amber-700 dark:text-amber-400">ซื้อ</b> = PR ที่อนุมัติในเดือน (PR → PO → DD) · <b className="text-emerald-700 dark:text-emerald-400">ใช้</b> = WD เบิกใส่รถ · <b>ของรอเบิก</b> = รับเข้าคลังแล้ว (DD) ยังไม่ได้ทำ WD ถ้าโตขึ้นเรื่อย ๆ แปลว่าสต๊อกบวม
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]">
        <table className="w-full min-w-[980px] border-collapse text-[14px]">
          <thead>
            <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
              <th scope="col" rowSpan={2} className="px-3.5 py-2.5 text-left font-semibold">ฟลีท / ประเภท</th>
              <th scope="col" rowSpan={2} className={TH}>งบเดือน</th>
              <th scope="colgroup" colSpan={2} className="border-l border-gray-200 px-3.5 pt-2.5 text-center font-semibold text-amber-800 dark:border-white/10 dark:text-amber-300">งบซื้อ · นับจาก PR</th>
              <th scope="colgroup" colSpan={2} className="border-l border-gray-200 px-3.5 pt-2.5 text-center font-semibold text-emerald-800 dark:border-white/10 dark:text-emerald-300">งบใช้ · นับจาก WD</th>
              <th scope="colgroup" className="border-l border-gray-200 px-3.5 pt-2.5 text-center font-semibold dark:border-white/10">สต๊อก</th>
            </tr>
            <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
              <th scope="col" className={`${TH} border-l border-gray-200 dark:border-white/10`}>ซื้อแล้ว</th>
              <th scope="col" className={TH}>เหลือ / เกิน</th>
              <th scope="col" className={`${TH} border-l border-gray-200 dark:border-white/10`}>ใช้แล้ว</th>
              <th scope="col" className={TH}>เหลือ / เกิน</th>
              <th scope="col" className={`${TH} border-l border-gray-200 dark:border-white/10`}>ของรอเบิก (DD ค้าง)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const gr = rows.filter((r) => r.groupId === g)
              return (
                <FragmentRows key={g}>
                  {gr.map((r) => {
                    const k = `${g}|${r.fleet}`
                    return (
                      <FragmentRows key={k}>
                        <Line label={r.fleet} c={ofRow(r)} kind="group" k={k} />
                        {open[k] && CATEGORIES.map((c) => <Line key={c} label={CAT_LABEL[c]} c={r.cats[c]} kind="child" />)}
                      </FragmentRows>
                    )
                  })}
                  <Line label={g.endsWith("ร่วม") ? `รวม ${g} (ไม่มีงบ ดูยอดอย่างเดียว)` : `รวม ${g} บริษัท`} c={gr.reduce((a, r) => add(a, ofRow(r)), zero)} kind="total" />
                </FragmentRows>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function MonthStepper({ value, months, onChange }: { value: string; months: string[]; onChange: (m: string) => void }) {
  const list = [...new Set(months)].sort() // oldest → newest
  const i = list.indexOf(value)
  const prev = i > 0 ? list[i - 1] : null
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null
  const btn = "grid h-[38px] w-[36px] place-items-center text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:bg-white/5 dark:disabled:text-gray-600"
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0d0f18]">
      <button type="button" className={btn} disabled={!prev} onClick={() => prev && onChange(prev)} aria-label={prev ? `เดือนก่อนหน้า ${monthLabel(prev)}` : "ไม่มีเดือนก่อนหน้า"}><ChevronLeft size={16} aria-hidden="true" /></button>
      <select aria-labelledby="bc-month-label" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-[38px] appearance-none border-x border-gray-200 bg-transparent px-3.5 text-center text-[14px] font-semibold text-gray-900 dark:border-white/10 dark:text-white">
        {[...list].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <button type="button" className={btn} disabled={!next} onClick={() => next && onChange(next)} aria-label={next ? `เดือนถัดไป ${monthLabel(next)}` : "ไม่มีเดือนถัดไป"}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  )
}
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function PendingTable({ data }: { data: Snapshot }) {
  // remaining per group × category before any pending PR, then each PR's effect if approved alone
  const remain = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of data.rows) m.set(`${r.group}|${r.category}`, r.budget - r.wd - r.dd_open - r.pr_open)
    return m
  }, [data.rows])
  const pg = usePaged(data.pending_prs, PR_TEXT)
  if (!data.pending_prs.length) return <Empty>ไม่มี PR รออนุมัติ</Empty>
  return (
    <div className="space-y-3">
    <SearchBox value={pg.q} onChange={pg.setQ} placeholder="ค้นหา PR ทะเบียน ผู้ขอ หรือหมายเหตุ" />
    {!pg.hit.length ? <Empty>ไม่พบรายการที่ค้นหา</Empty> : <>
    <TableBox minW={980} head={["PR", "วันที่", "ทะเบียน", "กลุ่ม", "ประเภท", "ยอด", "อนุมัติแล้ว", "คงเหลือกลุ่มนี้ → ถ้าอนุมัติใบนี้"]} alignRightFrom={5}>
      {pg.rows.map((p) => {
        const before = remain.get(`${p.group}|${p.category}`)
        const company = p.group.endsWith("บริษัท")
        return (
          <tr key={p.code} className="border-t border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5" title={p.note}>
            <td className="px-3.5 py-2 font-medium">{p.code}</td>
            <td className="px-3.5 py-2">{p.date.slice(8)}/{p.date.slice(5, 7)}</td>
            <td className="px-3.5 py-2">{p.plate}</td>
            <td className="px-3.5 py-2">{GROUP_LABEL[p.group] ?? p.group}</td>
            <td className="px-3.5 py-2">{CAT_LABEL[p.category]}</td>
            <td className={TD}>{fmt(p.total)}</td>
            <td className={TD}>{p.levels_done} ขั้น</td>
            <td className={TD}>
              {company && before !== undefined
                ? <><span className={neg(before)}>{fmt(before)}</span> → <strong className={neg(before - p.total)}>{fmt(before - p.total)}</strong></>
                : <span className="text-gray-500">ไม่มีงบ</span>}
            </td>
          </tr>
        )
      })}
    </TableBox>
    <Pager page={pg.page} pages={pg.pages} total={pg.hit.length} setPage={pg.setPage} />
    </>}
    </div>
  )
}

function DdTable({ lines }: { lines: OpenLine[] }) {
  const pg = usePaged(lines, DD_TEXT)
  if (!lines.length) return <Empty>ไม่มีของค้างเบิก</Empty>
  return (
    <div className="space-y-3">
    <SearchBox value={pg.q} onChange={pg.setQ} placeholder="ค้นหาทะเบียน รายการ DD หรือ PR" />
    {!pg.hit.length ? <Empty>ไม่พบรายการที่ค้นหา</Empty> : <>
    <TableBox minW={1040} head={["ทะเบียน", "กลุ่ม", "รายการ", "DD", "PR", "รับเมื่อ", "รับ", "ค้างเบิก", "ยอดค้าง"]} alignRightFrom={6}>
      {pg.rows.map((l, i) => (
        <tr key={`${l.dd}-${i}`} className="border-t border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5">
          <td className="px-3.5 py-2 font-medium">{l.plate}</td>
          <td className="px-3.5 py-2">{GROUP_LABEL[l.group] ?? l.group}</td>
          <td className="max-w-[360px] truncate px-3.5 py-2" title={l.item}>{l.item}</td>
          <td className="px-3.5 py-2">{l.dd}</td>
          <td className="px-3.5 py-2">{l.pr}</td>
          <td className="px-3.5 py-2">{l.received.slice(8)}/{l.received.slice(5, 7)}</td>
          <td className={TD}>{l.qty}</td>
          <td className={TD}>{l.open_qty}</td>
          <td className={`${TD} font-semibold`}>{fmt(l.open_amount)}</td>
        </tr>
      ))}
    </TableBox>
    <Pager page={pg.page} pages={pg.pages} total={pg.hit.length} setPage={pg.setPage} />
    </>}
    </div>
  )
}

function PlateTable({ rows, switched }: { rows: PlateRow[]; switched: Switched[] }) {
  const pg = usePaged(rows, PLATE_TEXT)
  return (
    <div className="space-y-3">
      <SearchBox value={pg.q} onChange={pg.setQ} placeholder="ค้นหาทะเบียน เช่น 71-3911 หรือกลุ่ม ML" />
      {!pg.hit.length ? <Empty>ไม่พบทะเบียนนี้</Empty> : (<>
        <TableBox minW={820} head={["ทะเบียน", "กลุ่ม", "ตัดจ่ายแล้ว", "รับของแล้วรอเบิก", "PR อนุมัติ", "รวมใช้ไป", "PR รออนุมัติ"]} alignRightFrom={2}>
          {pg.rows.map((r) => (
            <tr key={r.plate} className="border-t border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5">
              <td className="px-3.5 py-2 font-medium">{r.plate}</td>
              <td className="px-3.5 py-2">{GROUP_LABEL[r.group] ?? r.group}</td>
              <td className={TD}>{fmt(r.wd)}</td>
              <td className={TD}>{fmt(r.dd_open)}</td>
              <td className={TD}>{fmt(r.pr_open)}</td>
              <td className={`${TD} font-semibold`}>{fmt(r.wd + r.dd_open + r.pr_open)}</td>
              <td className={`${TD} text-amber-700 dark:text-amber-400`}>{r.pr_pending ? fmt(r.pr_pending) : "—"}</td>
            </tr>
          ))}
        </TableBox>
        <Pager page={pg.page} pages={pg.pages} total={pg.hit.length} setPage={pg.setPage} />
      </>)}
      {switched.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-3.5 text-[14px] dark:border-white/8 dark:bg-[#0d0f18]">
          <summary className="cursor-pointer font-semibold text-gray-800 dark:text-gray-200">รถที่เปลี่ยนบริษัท/ร่วมกลางเดือน · {switched.length} คัน</summary>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">ยอดแบ่งตามวันจริง · คนขับ พจร. วันเดียวนับเป็นรถบริษัท</p>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
            {switched.map((s) => (
              <li key={s.plate} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="w-28 font-medium">{s.plate}</span>
                <span className="text-gray-600 dark:text-gray-400">{s.changes.map((c) => `${ddmm(c.from)} ${GROUP_LABEL[c.group] ?? c.group}`).join(" → ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function TableBox({ head, children, minW, alignRightFrom }: { head: string[]; children: React.ReactNode; minW: number; alignRightFrom: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]">
      <table className="w-full border-collapse text-[14px] text-gray-800 dark:text-gray-200" style={{ minWidth: minW }}>
        <thead>
          <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
            {head.map((h, i) => <th key={h} scope="col" className={`px-3.5 py-2.5 font-semibold ${i >= alignRightFrom ? "text-right" : "text-left"}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-300 p-6 text-[14px] text-gray-600 dark:border-white/15 dark:text-gray-400">{children}</p>
}
