"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Info, RefreshCw } from "lucide-react"

// ── Snapshot shape (written by mena-backend-services job `budget-control`) ──
type Category = "ซ่อม" | "PM" | "ยาง"
type Row = { group: string; category: Category; budget: number; wd: number; wd_yesterday: number; dd_open: number; pr_open: number; pr_approved: number; pr_pending: number }
type Pending = { code: string; date: string; plate: string; group: string; category: Category; total: number; levels_done: number; requester: string; note: string }
type OpenLine = { group: string; category: Category; plate: string; dd: string; pr: string; received: string; item: string; qty: number; open_qty: number; open_amount: number }
type PlateRow = { plate: string; group: string; wd: number; dd_open: number; pr_open: number; pr_pending: number }
type Snapshot = {
  branch: string; month: string; cut: string; computed_at: string; pace: number
  sources: { wd_at: string | null; pr_at: string | null; po_at: string | null; dd_at: string | null; budget_at: string | null; plates_from: string | null; daily_to?: string | null; budget_lines: number }
  rows: Row[]; pending_prs: Pending[]; dd_open_lines: OpenLine[]; by_plate: PlateRow[]
  owner_switched?: Switched[]
}
type Switched = { plate: string; changes: { from: string; group: string }[] }

const CATS: Category[] = ["ซ่อม", "PM", "ยาง"]
const CAT_LABEL: Record<Category, string> = { ซ่อม: "ซ่อม/อะไหล่", PM: "PM", ยาง: "ยาง" }
const GROUP_LABEL: Record<string, string> = { "ML|บริษัท": "ML บริษัท", "MS|บริษัท": "MS บริษัท", "ML|ร่วม": "ML ร่วม", "MS|ร่วม": "MS ร่วม", "อื่น": "ทะเบียนนอก GPM โม่" }
const GROUP_ORDER = ["ML|บริษัท", "MS|บริษัท", "ML|ร่วม", "MS|ร่วม", "อื่น"]
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

const fmt = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US")
const short = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : ""
  return a >= 1e6 ? `${s}${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${s}${Math.round(a / 1e3)}k` : `${s}${Math.round(a)}`
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
  const [month, setMonth] = useState<string>("")
  const [months, setMonths] = useState<string[]>([])
  const [data, setData] = useState<Snapshot | null>(null)
  const [state, setState] = useState<"loading" | "ok" | "error">("loading")
  const [error, setError] = useState("")
  const [tab, setTab] = useState<"pivot" | "pending" | "dd" | "plate">("pivot")
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
        setData(j.data)
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-[40px] items-center rounded-full border border-gray-200 bg-white px-4 text-[14px] dark:border-white/10 dark:bg-[#0d0f18]">ศลบ</span>
          <label className="sr-only" htmlFor="bc-month">เดือน</label>
          <select id="bc-month" value={data?.month ?? month} onChange={(e) => { setState("loading"); setMonth(e.target.value) }}
            className="min-h-[40px] rounded-full border border-gray-200 bg-white px-4 text-[14px] dark:border-white/10 dark:bg-[#0d0f18] dark:text-white">
            {(months.length ? months : data ? [data.month] : []).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {data && (
            <div className="relative">
              <button type="button" onClick={() => setSrcOpen((o) => !o)} aria-expanded={srcOpen}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-[13px] text-gray-700 dark:border-white/10 dark:bg-[#0d0f18] dark:text-gray-300">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
                {stale ? `ข้อมูลค้าง ${Math.floor(ageH(computed))} ชม.` : `อัปเดตล่าสุด ${hhmm(computed)}`}
                {data.pace < 1 && !stale && <span className="text-gray-500">· ทุก 1 ชม.</span>}
                <ChevronRight size={13} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${srcOpen ? "rotate-90" : ""}`} />
              </button>
              {srcOpen && <SourcePanel data={data} computed={computed} />}
            </div>
          )}
        </div>
      </header>

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
          <div role="tablist" aria-label="มุมมอง" className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl bg-gray-100 p-1 dark:bg-white/5">
            {([
              ["pivot", "ตามกลุ่ม"],
              ["pending", `PR รออนุมัติ · ${data.pending_prs.length}`],
              ["dd", `รับของแล้วรอเบิก · ${data.dd_open_lines.length}`],
              ["plate", "รายคัน"],
            ] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`min-h-[36px] rounded-lg px-3.5 text-[13px] ${tab === k ? "bg-white font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-[#14161f] dark:text-emerald-300 dark:ring-emerald-800/50" : "text-gray-600 dark:text-gray-400"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "pivot" && <Pivot rows={data.rows} />}
          {tab === "pending" && <PendingTable data={data} />}
          {tab === "dd" && <DdTable lines={data.dd_open_lines} />}
          {tab === "plate" && <PlateTable rows={data.by_plate} switched={data.owner_switched ?? []} />}
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
  const [closed, setClosed] = useState<Record<string, boolean>>({ "อื่น": true, "ML|ร่วม": true, "MS|ร่วม": true })
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
  if (!data.pending_prs.length) return <Empty>ไม่มี PR รออนุมัติ</Empty>
  return (
    <TableBox minW={980} head={["PR", "วันที่", "ทะเบียน", "กลุ่ม", "ประเภท", "ยอด", "อนุมัติแล้ว", "คงเหลือกลุ่มนี้ → ถ้าอนุมัติใบนี้"]} alignRightFrom={5}>
      {data.pending_prs.map((p) => {
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
  )
}

function DdTable({ lines }: { lines: OpenLine[] }) {
  if (!lines.length) return <Empty>ไม่มีของค้างเบิก</Empty>
  return (
    <TableBox minW={1040} head={["ทะเบียน", "กลุ่ม", "รายการ", "DD", "PR", "รับเมื่อ", "รับ", "ค้างเบิก", "ยอดค้าง"]} alignRightFrom={6}>
      {lines.map((l, i) => (
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
  )
}

function PlateTable({ rows, switched }: { rows: PlateRow[]; switched: Switched[] }) {
  const [q, setQ] = useState("")
  const shown = rows.filter((r) => !q || r.plate.replace(/\s/g, "").includes(q.replace(/\s/g, "")))
  return (
    <div className="space-y-3">
      <label className="flex max-w-xs items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 dark:border-white/10 dark:bg-[#0d0f18]">
        <span className="sr-only">ค้นหาทะเบียน</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาทะเบียน เช่น 71-3911" className="h-10 flex-1 bg-transparent text-[14px] outline-none dark:text-white" />
      </label>
      {!shown.length ? <Empty>ไม่พบทะเบียนนี้</Empty> : (
        <TableBox minW={820} head={["ทะเบียน", "กลุ่ม", "ตัดจ่ายแล้ว", "รับของแล้วรอเบิก", "PR อนุมัติ", "รวมใช้ไป", "PR รออนุมัติ"]} alignRightFrom={2}>
          {shown.slice(0, 300).map((r) => (
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
      )}
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
