"use client"

import { useMemo, useState } from "react"
import { Check, Copy, Search } from "lucide-react"
import { remarkLine } from "@/lib/budget-check"

// สรุปงบจาก PR: per group × category, Available = Budget − Committed (PR/PO not received) − Actual (DD received),
// plus the remark line to paste into each pending PR. Same snapshot as the rest of /budget-control.
type Category = "ซ่อม" | "PM" | "ยาง"
type Row = { group: string; category: Category; budget: number; wd: number; dd_open: number; pr_open: number; pr_pending: number }
type Pending = { code: string; date: string; plate: string; group: string; category: Category; total: number; levels_done: number; requester: string; note: string }
type Props = { month: string; cut: string; rows: Row[]; pending: Pending[] }

const CATS: Category[] = ["ซ่อม", "PM", "ยาง"]
const CAT_LABEL: Record<Category, string> = { ซ่อม: "ซ่อม/อะไหล่", PM: "PM", ยาง: "ยาง" }
const fmt = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US")
const be = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${String(Number(iso.slice(0, 4)) + 543).slice(2)}`
const neg = (v: number) => (v < 0 ? "text-red-700 dark:text-red-400" : "")
const CARD = "rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]"
const TH = "px-3.5 py-2.5 text-right font-semibold"
const TD = "px-3.5 py-2 text-right"
const squash = (v: string) => v.replace(/\s/g, "").toLowerCase()

export default function PrBudgetTab({ month, cut, rows, pending }: Props) {
  const { company, avail } = useMemo(() => {
    const company = rows.filter((r) => r.group.endsWith("บริษัท"))
    const avail = new Map<string, number>()
    for (const r of company) avail.set(`${r.group}|${r.category}`, r.budget - r.pr_open - (r.wd + r.dd_open))
    return { company, avail }
  }, [rows])
  const fleets = [...new Set(company.map((r) => r.group))]

  return (
    <div className="space-y-4">
      <Stages />
      <section aria-label="สรุปงบคงเหลือ" className={`${CARD} overflow-x-auto`}>
        <div className="px-4 pt-4">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">งบคงเหลือ รถบริษัท · 01/{month.slice(5, 7)} – {be(cut)}</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">คงเหลือ = งบตั้ง − กันไว้ (PR/PO ยังไม่รับของ) − ใช้จริง (DD รับของแล้ว) · WD แสดงไว้ดูว่าเบิกไปแล้วเท่าไหร่ ไม่ได้ตัดซ้ำ</p>
        </div>
        <table className="mt-2 w-full min-w-[980px] border-collapse text-[14px] text-gray-800 dark:text-gray-200">
          <thead>
            <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
              <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">กลุ่ม / ประเภท</th>
              <th scope="col" className={TH}>งบตั้ง<br /><span className="font-normal">Budget</span></th>
              <th scope="col" className={TH}>กันไว้ PR/PO<br /><span className="font-normal">Committed</span></th>
              <th scope="col" className={TH}>ใช้จริง DD<br /><span className="font-normal">Actual</span></th>
              <th scope="col" className={`${TH} text-gray-500`}>ในนั้นเบิกแล้ว WD<br /><span className="font-normal">Consumption</span></th>
              <th scope="col" className={`${TH} bg-emerald-50/60 dark:bg-emerald-950/20`}>คงเหลือ<br /><span className="font-normal">Available</span></th>
              <th scope="col" className={TH}>PR รออนุมัติ</th>
              <th scope="col" className={TH}>ถ้าอนุมัติทั้งหมด</th>
            </tr>
          </thead>
          <tbody>
            {fleets.map((g) => CATS.map((c, i) => {
              const r = company.find((x) => x.group === g && x.category === c)
              if (!r) return null
              const actual = r.wd + r.dd_open
              const a = r.budget - r.pr_open - actual
              return (
                <tr key={`${g}|${c}`} className={`${i === 0 ? "border-t-2 border-gray-200 dark:border-white/10" : "border-t border-gray-100 dark:border-white/5"} hover:bg-gray-50 dark:hover:bg-white/5`}>
                  <th scope="row" className="px-3.5 py-2 text-left font-medium">{g.split("|")[0]} · {CAT_LABEL[c]}</th>
                  <td className={TD}>{fmt(r.budget)}</td>
                  <td className={TD}>{fmt(r.pr_open)}</td>
                  <td className={TD}>{fmt(actual)}</td>
                  <td className={`${TD} text-gray-500 dark:text-gray-400`}>{fmt(r.wd)}</td>
                  <td className={`${TD} bg-emerald-50/50 font-semibold dark:bg-emerald-950/20 ${neg(a)}`}>{fmt(a)}</td>
                  <td className={`${TD} text-amber-700 dark:text-amber-400`}>{r.pr_pending ? fmt(r.pr_pending) : "—"}</td>
                  <td className={`${TD} ${neg(a - r.pr_pending)}`}>{fmt(a - r.pr_pending)}</td>
                </tr>
              )
            }))}
          </tbody>
        </table>
        <div className="h-3" />
      </section>
      <PrList month={month} cut={cut} pending={pending} avail={avail} />
    </div>
  )
}

function Stages() {
  const items: [string, string, string][] = [
    ["1 · PR → PO", "กันงบไว้ก่อน (Commitment)", "ยังไม่ได้จ่ายจริง แต่กันไว้ไม่ให้ใช้ซ้ำ ถ้า PO ต่ำกว่า PR ส่วนต่างคืนกลับเข้างบ"],
    ["2 · DD", "ตัดงบจริง (Actual spend)", "รับของเข้าแล้ว ย้ายจากยอดกันไว้มาเป็นยอดใช้จริง"],
    ["3 · WD", "สรุปการใช้ (Consumption report)", "ดูว่าใช้กับรถคันไหน ฟลีทไหน ไม่ได้เอามาตัดงบซ้ำ"],
  ]
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {items.map(([k, h, d]) => (
        <li key={k} className={`${CARD} p-4`}>
          <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">{k}</p>
          <p className="mt-0.5 text-[15px] font-semibold text-gray-900 dark:text-white">{h}</p>
          <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-400">{d}</p>
        </li>
      ))}
    </ol>
  )
}

function PrList({ month, cut, pending, avail }: { month: string; cut: string; pending: Pending[]; avail: Map<string, number> }) {
  const [q, setQ] = useState("")
  const [overOnly, setOverOnly] = useState(false)
  const [copied, setCopied] = useState("")
  const items = useMemo(() => pending.map((p) => {
    const before = avail.get(`${p.group}|${p.category}`)
    const fleet = p.group.split("|")[0]
    return { p, before, line: before === undefined ? null : remarkLine(month, cut, fleet, p.category, before, p.total) }
  }), [pending, avail, month, cut])
  const k = squash(q)
  const shown = items
    .filter((x) => !k || squash(`${x.p.code} ${x.p.plate} ${x.p.requester} ${x.p.note}`).includes(k))
    .filter((x) => !overOnly || (x.before !== undefined && x.before - x.p.total < 0))
  const nOver = items.filter((x) => x.before !== undefined && x.before - x.p.total < 0).length
  const copy = (code: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(code); setTimeout(() => setCopied(""), 1500) }).catch(() => {})
  }

  return (
    <section aria-label="หมายเหตุสำหรับ PR รออนุมัติ" className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">หมายเหตุใส่ใน PR · รออนุมัติ {pending.length} ใบ</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">คงเหลือคิดถึง {be(cut)} หลังอนุมัติเหลือ = คงเหลือ − PR ใบนี้ (คิดทีละใบ) · กดคัดลอกแล้ววางในหมายเหตุ PR</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 dark:border-white/10 dark:bg-[#0d0f18]">
            <Search size={16} aria-hidden="true" className="text-gray-400" />
            <span className="sr-only">ค้นหา PR</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลข PR ทะเบียน ผู้ขอ" className="h-10 flex-1 bg-transparent text-[14px] outline-none dark:text-white" />
          </label>
          <button type="button" aria-pressed={overOnly} onClick={() => setOverOnly((v) => !v)}
            className={`min-h-[40px] rounded-lg border px-3 text-[13px] ${overOnly ? "border-red-300 bg-red-50 font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" : "border-gray-200 text-gray-700 dark:border-white/10 dark:text-gray-300"}`}>
            เกินงบ · {nOver}
          </button>
        </div>
      </div>
      {!shown.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-[14px] text-gray-600 dark:border-white/15 dark:text-gray-400">
          {pending.length ? "ไม่พบ PR ที่ค้นหา" : "ไม่มี PR รออนุมัติ"}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-white/5">
          {shown.slice(0, 60).map(({ p, before, line }) => {
            const after = before === undefined ? null : before - p.total
            return (
              <li key={p.code} className="grid gap-2 py-3 md:grid-cols-[220px_1fr]">
                <div className="text-[13px]">
                  <p className="text-[14px] font-semibold text-gray-900 dark:text-white">{p.code}</p>
                  <p className="text-gray-600 dark:text-gray-400">{be(p.date)} · {p.plate} · {p.group.replace("|", " ")} · {CAT_LABEL[p.category]}</p>
                  <p className="text-gray-500 dark:text-gray-500">{p.requester} · อนุมัติแล้ว {p.levels_done} ขั้น</p>
                </div>
                {line ? (
                  <div className="flex min-w-0 items-start gap-2">
                    <p className={`min-w-0 flex-1 break-words rounded-lg px-3 py-2 font-mono text-[13px] leading-relaxed ${after !== null && after < 0 ? "bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/60" : "bg-gray-50 text-gray-800 dark:bg-white/5 dark:text-gray-200"}`}>
                      {line}
                    </p>
                    <button type="button" onClick={() => copy(p.code, line)} aria-label={`คัดลอกหมายเหตุ ${p.code}`}
                      className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-[13px] text-gray-700 dark:border-white/10 dark:text-gray-300">
                      {copied === p.code ? <><Check size={14} aria-hidden="true" /> คัดลอกแล้ว</> : <><Copy size={14} aria-hidden="true" /> คัดลอก</>}
                    </button>
                  </div>
                ) : (
                  <p className="self-center text-[13px] text-gray-500">รถร่วม ไม่มีงบให้คุม · PR นี้ {fmt(p.total)}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {shown.length > 60 && <p className="pt-2 text-[13px] text-gray-500">แสดง 60 จาก {shown.length} ใบ ค้นหาเพื่อดูใบอื่น</p>}
    </section>
  )
}
