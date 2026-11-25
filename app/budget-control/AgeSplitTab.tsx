"use client"

import { useEffect, useState } from "react"
import { ChevronRight, RefreshCw } from "lucide-react"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

// ── Doc shape (written by mena-backend-services job `budget-age-split`) ──
type AgeSplitRow = {
  fleet: string; customer: string; age_band: string
  cost_3y: number; truck_months: number; share: number
  budget_year: number; budget_ytd: number; actual_ytd: number; ratio: number | null; per_truck_year: number
}
type AgeSplitDoc = {
  branch: string; year: number; cut: string; computed_at: string
  window?: { from: string; to: string }
  rows?: AgeSplitRow[]
  coverage?: { matched: number; partner: number; unmatched: number }
  age_source?: Record<string, number>
  missing_age?: { plate: string; cost: number }[]
  missing_checked_at?: string
}

const FLEETS = ["ML", "MS", "TR-SCCC", "TR-SC", "TR-FEED", "BOX-9.5", "BOX-7.5"]
const MIXERS = ["ML", "MS"]
// สสบ groups follow the budget accounts 624101 / 624110 / 624114 / 624112 / 624113; they have no customer level
const FLEET_LABEL: Record<string, string> = {
  ML: "ML บริษัท", MS: "MS บริษัท",
  "TR-SCCC": "Trailer SCCC ปูนผง", "TR-SC": "Trailer Side curtain", "TR-FEED": "Trailer อาหารสัตว์ BTG/TFG",
  "BOX-9.5": "รถตู้เย็น 9.5 ม.", "BOX-7.5": "รถตู้เย็น 7.5 ม.",
}
const CUSTOMERS = ["Scco", "Cpac", "Asia", "อื่น", "ไม่ระบุ"]
const BANDS = ["0–5", "6–10", "11–15", "16+"]
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const AGE_SOURCE: Record<string, string> = { gpm: "GPM", gpm_other_month: "GPM เดือนอื่น", atms: "ปีรถใน ATMS", override: "แก้มือ" }

const fmt = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US")
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const monthLabel = (m: string) => `${TH_MONTH[Number(m.slice(5, 7)) - 1]} ${String(Number(m.slice(0, 4)) + 543).slice(2)}`
const dayLabel = (d: string) => `${Number(d.slice(8, 10))} ${TH_MONTH[Number(d.slice(5, 7)) - 1]} ${String(Number(d.slice(0, 4)) + 543).slice(2)}`

type Sum = { cost: number; tm: number; share: number; budYear: number; budYtd: number; actual: number }
const sum = (rows: AgeSplitRow[]): Sum => rows.reduce((a, r) => ({
  cost: a.cost + r.cost_3y, tm: a.tm + r.truck_months, share: a.share + r.share,
  budYear: a.budYear + r.budget_year, budYtd: a.budYtd + r.budget_ytd, actual: a.actual + r.actual_ytd,
}), { cost: 0, tm: 0, share: 0, budYear: 0, budYtd: 0, actual: 0 })

export default function AgeSplitTab() {
  const [doc, setDoc] = useState<AgeSplitDoc | null>(null)
  const [state, setState] = useState<"loading" | "ok" | "error">("loading")
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    fetch(`/api/budget-control/age-split?branch=${encodeURIComponent("ศลบ")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (!j.success) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ")
        setDoc(j.data)
        setState("ok")
      })
      .catch((e: Error) => { if (alive) { setError(e.message); setState("error") } })
    return () => { alive = false }
  }, [reload])

  if (state === "loading") {
    return (
      <div aria-busy="true" className="space-y-4">
        <div className="h-80 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
      </div>
    )
  }
  if (state === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
        โหลดข้อมูลปันงบไม่ได้: {error}
        <button type="button" onClick={() => { setState("loading"); setReload((n) => n + 1) }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-[13px] dark:border-red-800"><RefreshCw size={13} /> ลองอีกครั้ง</button>
      </div>
    )
  }
  const rows = doc?.rows ?? []
  if (!doc || (!rows.length && !doc.missing_age?.length)) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-[14px] text-gray-600 dark:border-white/15 dark:text-gray-400">
        ยังไม่มีข้อมูล รอ job รันรอบแรก (ทุกคืน 02:40)
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!!doc.missing_age?.length && <MissingAge doc={doc} hasRows={rows.length > 0} />}
      {rows.length > 0 && (
        <>
          <SourceLine doc={doc} rows={rows} />
          <AgePivot rows={rows} cut={doc.cut} />
          <PerTruckChart rows={rows} />
        </>
      )}
    </div>
  )
}

function MissingAge({ doc, hasRows }: { doc: AgeSplitDoc; hasRows: boolean }) {
  const list = doc.missing_age ?? []
  return (
    <section role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[14px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold">
        มีทะเบียนที่ยังไม่มีอายุรถ {list.length} คัน
        {hasRows ? ` ตัวเลขด้านล่างเป็นรอบ ${dayLabel(doc.cut)}` : " เลยยังปันงบรอบแรกไม่ได้"}
      </p>
      <p className="mt-1 text-[13px]">เติมอายุให้คันเหล่านี้ใน vehicle_age_override แล้วรอบคืนถัดไปจะปันงบใหม่ให้เอง</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {list.slice(0, 40).map((m) => <li key={m.plate}>{m.plate} · {fmt(m.cost)}</li>)}
        {list.length > 40 && <li>และอีก {list.length - 40} คัน</li>}
      </ul>
    </section>
  )
}

function SourceLine({ doc, rows }: { doc: AgeSplitDoc; rows: AgeSplitRow[] }) {
  const mixer = rows.filter((r) => MIXERS.includes(r.fleet))
  const total = mixer.reduce((a, r) => a + r.cost_3y, 0)
  const known = mixer.filter((r) => r.customer !== "ไม่ระบุ").reduce((a, r) => a + r.cost_3y, 0)
  const src = Object.entries(doc.age_source ?? {}).filter(([, n]) => n > 0)
  const nSrc = src.reduce((a, [, n]) => a + n, 0)
  return (
    <p className="text-[13px] text-gray-600 dark:text-gray-400">
      ค่าซ่อม/อะไหล่ รถบริษัท{doc.window ? ` ย้อน 3 ปี ${monthLabel(doc.window.from)} – ${monthLabel(doc.window.to)}` : ""}
      {" · "}โม่จับคู่ลูกค้าได้ {total ? pct(known / total) : "—"}
      {src.length > 0 && <> · อายุรถจาก {src.map(([k, n]) => `${AGE_SOURCE[k] ?? k} ${Math.round((n / nSrc) * 100)}%`).join(", ")}</>}
      {" · "}ตัดถึง {dayLabel(doc.cut)}
    </p>
  )
}

const TH = "px-3.5 py-2.5 text-right font-semibold"
const TD = "px-3.5 py-2 text-right"

function Line_({ label, s, kind, open, onToggle }: { label: string; s: Sum; kind: "fleet" | "customer" | "band"; open?: boolean; onToggle?: () => void }) {
  const used = s.budYtd > 0 ? s.actual / s.budYtd : null
  const over = used !== null && used > 1
  const pad = kind === "fleet" ? "" : kind === "customer" ? "pl-8" : "pl-16 font-normal text-gray-600 dark:text-gray-300"
  return (
    <tr className={`${kind === "band" ? "border-t border-gray-100 dark:border-white/5" : "border-t-2 border-gray-200 dark:border-white/10"} ${kind === "fleet" ? "bg-gray-50 font-semibold dark:bg-white/3" : kind === "customer" ? "font-medium" : ""} hover:bg-gray-50 dark:hover:bg-white/5`}>
      <th scope="row" className={`px-3.5 py-1.5 text-left ${pad}`}>
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex min-h-[32px] items-center gap-1.5">
            <ChevronRight size={14} aria-hidden="true" className={`text-gray-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
            {label}
          </button>
        ) : label}
      </th>
      <td className={TD}>{fmt(s.cost)}</td>
      <td className={TD}>{pct(s.share)}</td>
      <td className={TD}>{fmt(s.budYear)}</td>
      <td className={TD}>{fmt(s.budYtd)}</td>
      <td className={TD}>{fmt(s.actual)}</td>
      <td className={TD}>
        <span className="inline-flex items-center gap-2">
          <span className="relative inline-block h-1.5 w-[72px] overflow-hidden rounded bg-gray-200 dark:bg-white/10">
            <span className="absolute inset-y-0 left-0" style={{ width: `${used === null ? 0 : Math.min(used * 100, 100)}%`, background: over ? "repeating-linear-gradient(45deg,#B42318 0 2px,#F6C9C4 2px 4px)" : "#047857" }} />
          </span>
          <span className={`min-w-[44px] ${over ? "text-red-700 dark:text-red-400" : ""}`}>{used === null ? "—" : `${Math.round(used * 100)}%`}</span>
        </span>
      </td>
    </tr>
  )
}

function AgePivot({ rows, cut }: { rows: AgeSplitRow[]; cut: string }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setClosed((c) => ({ ...c, [k]: !c[k] }))
  const ytd = TH_MONTH[Number(cut.slice(5, 7)) - 1]
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]">
      <table className="w-full min-w-[960px] border-collapse text-[14px] text-gray-800 dark:text-gray-200">
        <thead>
          <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
            <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">ฟลีท / ลูกค้า / อายุรถ</th>
            <th scope="col" className={TH}>ค่าซ่อม 3 ปี</th>
            <th scope="col" className={TH}>สัดส่วน</th>
            <th scope="col" className={TH}>งบปันได้ทั้งปี</th>
            <th scope="col" className={TH}>งบถึง {ytd}</th>
            <th scope="col" className={TH}>ใช้จริง</th>
            <th scope="col" className={TH}>ใช้ไป</th>
          </tr>
        </thead>
        <tbody>
          {FLEETS.filter((f) => rows.some((r) => r.fleet === f)).map((f) => {
            const fr = rows.filter((r) => r.fleet === f)
            const fOpen = !closed[f]
            return (
              <Rows key={f}>
                <Line_ label={FLEET_LABEL[f] ?? f} s={sum(fr)} kind="fleet" open={fOpen} onToggle={() => toggle(f)} />
                {fOpen && !MIXERS.includes(f) && BANDS.map((b) => {
                  const br = fr.filter((r) => r.age_band === b)
                  return br.length ? <Line_ key={b} label={`${b} ปี`} s={sum(br)} kind="customer" /> : null
                })}
                {fOpen && MIXERS.includes(f) && CUSTOMERS.filter((c) => fr.some((r) => r.customer === c)).map((c) => {
                  const cr = fr.filter((r) => r.customer === c)
                  const key = `${f}|${c}`
                  const cOpen = !closed[key]
                  return (
                    <Rows key={key}>
                      <Line_ label={c} s={sum(cr)} kind="customer" open={cOpen} onToggle={() => toggle(key)} />
                      {cOpen && BANDS.map((b) => {
                        const br = cr.filter((r) => r.age_band === b)
                        return br.length ? <Line_ key={b} label={`${b} ปี`} s={sum(br)} kind="band" /> : null
                      })}
                    </Rows>
                  )
                })}
              </Rows>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
function Rows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function PerTruckChart({ rows }: { rows: AgeSplitRow[] }) {
  const data = BANDS.map((b) => {
    const p: Record<string, string | number | null> = { band: `${b} ปี` }
    const lines: [string, (f: string) => boolean][] = [["ML", (f) => f === "ML"], ["MS", (f) => f === "MS"], ["Trailer", (f) => f.startsWith("TR-")], ["ตู้เย็น", (f) => f.startsWith("BOX-")]]
    for (const [key, on] of lines) {
      const s = sum(rows.filter((r) => on(r.fleet) && r.age_band === b))
      p[key] = s.tm > 0 ? Math.round((s.cost / s.tm) * 12) : null
    }
    return p
  })
  return (
    <section aria-label="ค่าซ่อมเฉลี่ยต่อคันต่อปี ตามอายุรถ" className="rounded-xl border border-gray-200 bg-white p-5 dark:border-white/8 dark:bg-[#0d0f18]">
      <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">ค่าซ่อมเฉลี่ยต่อคันต่อปี ตามอายุรถ</h2>
      <p className="mb-3 text-[13px] text-gray-500 dark:text-gray-400">ค่าซ่อม 3 ปี ÷ คัน-เดือนที่วิ่ง × 12</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-gray-200 dark:text-white/10" />
            <XAxis dataKey="band" tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-600 dark:text-gray-400" />
            <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tick={{ fontSize: 12, fill: "currentColor" }} className="text-gray-600 dark:text-gray-400" width={48} />
            <Tooltip formatter={(v) => (typeof v === "number" ? fmt(v) : "—")} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ML" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="MS" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            {rows.some((r) => r.fleet.startsWith("TR-")) && <Line type="monotone" dataKey="Trailer" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
            {rows.some((r) => r.fleet.startsWith("BOX-")) && <Line type="monotone" dataKey="ตู้เย็น" stroke="#A78BFA" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
