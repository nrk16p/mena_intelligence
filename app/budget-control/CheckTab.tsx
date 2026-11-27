"use client"

import { useState } from "react"
import { Check, Copy, Loader2, X } from "lucide-react"
import { be, type Category, type CheckLine } from "@/lib/budget-check"

// เช็กงบจากเลข PR: type a PR number, the API reads it live from ATMS and compares it with the buy leg
// (PR approved this month) of the budget-control snapshot. Results stay on screen until the page closes.
type Ok = {
  success: true
  kind: "PR" | "WD"
  doc: { code: string; date: string; plate: string; department: string; total: number; by: string; approved: boolean; levelsDone: number }
  readAt: string
  base: { month: string; computedAt: string; cut: string; prAt: string | null } | null
  group: string | null
  lines: CheckLine[]
  otherLeg: { category: Category; before: number }[]
  notice: { code: string; message: string } | null
  fleet: { name: string; lines: CheckLine[]; reason: string | null } | null
}
type Card = { key: string; code: string; data?: Ok; error?: string }

const CARD = "rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]"
const fmt = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US")
const hhmm = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "—"
const CAT_LABEL: Record<Category, string> = { ซ่อม: "ซ่อม/อะไหล่", PM: "PM", ยาง: "ยาง" }

export default function CheckTab() {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [cards, setCards] = useState<Card[]>([])

  async function check() {
    const c = code.trim().toUpperCase()
    if (!c || busy) return
    setBusy(true)
    let card: Card
    try {
      const res = await fetch(`/api/budget-control/check?doc=${encodeURIComponent(c)}`, { cache: "no-store" })
      const json = await res.json().catch(() => null)
      card = json?.success ? { key: `${c}-${Date.now()}`, code: c, data: json as Ok } : { key: `${c}-${Date.now()}`, code: c, error: json?.error ?? "เช็กไม่สำเร็จ ลองกดใหม่อีกครั้ง" }
    } catch {
      card = { key: `${c}-${Date.now()}`, code: c, error: "ต่อเซิร์ฟเวอร์ไม่ได้ ลองกดใหม่อีกครั้ง" }
    }
    setCards((prev) => [card, ...prev.filter((x) => x.code !== c)])
    setBusy(false)
  }

  return (
    <div className="grid gap-4">
      <section className={`${CARD} grid gap-3 p-4 sm:p-5`}>
        <label htmlFor="doc-code" className="text-[15px] font-semibold text-gray-900 dark:text-white">พิมพ์เลข PR แล้วกดเช็กงบ</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="doc-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") check() }}
            placeholder="เช่น LBPR26110482"
            autoComplete="off"
            className="min-h-[40px] w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 font-mono text-[15px] uppercase tracking-wide outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 dark:border-white/15 dark:bg-[#0d0f18] dark:focus:ring-emerald-900/40"
          />
          <button type="button" onClick={check} disabled={busy || !code.trim()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-gray-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {busy ? "กำลังอ่านจาก ATMS" : "เช็กงบ"}
          </button>
        </div>
        <p className="text-[13px] text-gray-500 dark:text-gray-400">
          อ่าน PR ใบนั้นจาก ATMS ตอนกด แล้วเทียบกับงบซื้อของเดือน (PR ที่อนุมัติแล้ว) ได้หมายเหตุไปวางต่อท้ายหมายเหตุเดิมใน PR ก่อนส่งอนุมัติ ตอนนี้เช็กได้เฉพาะ PR ยานยนต์ ลาดกระบัง ใบเบิก WD ยังไม่เปิดใช้
        </p>
      </section>

      {cards.map((c) => (
        <ResultCard key={c.key} card={c} onClose={() => setCards((prev) => prev.filter((x) => x.key !== c.key))} />
      ))}
    </div>
  )
}

function ResultCard({ card, onClose }: { card: Card; onClose: () => void }) {
  const d = card.data
  const all = [...(d?.lines ?? []), ...(d?.fleet?.lines ?? [])]
  const worst = all.some((l) => l.state === "over") ? "over" : all.some((l) => l.state === "ok_pending_over") ? "ok_pending_over" : all.length ? "ok" : null
  const border = worst === "over" ? "border-red-300 dark:border-red-800/60" : "border-gray-200 dark:border-white/8"
  return (
    <article className={`rounded-xl border bg-white p-4 sm:p-5 dark:bg-[#0d0f18] ${border}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">
            <span className="text-amber-700 dark:text-amber-400">PR · งบซื้อ</span>
            <span className="ml-3 font-mono">{card.code}</span>
          </p>
          {d && (
            <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">
              ออก {be(d.doc.date)} · {d.doc.plate || "ไม่มีทะเบียน"} · {d.group?.replace("|", " ") ?? "—"} · ยอด {fmt(d.doc.total)} ·{" "}
              {d.doc.approved ? "อนุมัติครบแล้ว" : d.doc.levelsDone ? `รออนุมัติ ผ่านแล้ว ${d.doc.levelsDone} ขั้น` : "รออนุมัติ ยังไม่มีใครกด"} · เปิดโดย {d.doc.by}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {worst && <StatePill state={worst} lines={all} />}
          <button type="button" onClick={onClose} aria-label={`ปิดผลของ ${card.code}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {card.error && <p className="mt-3 text-[14px] text-red-700 dark:text-red-400">{card.error}</p>}
      {d?.notice && <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[14px] text-gray-800 dark:bg-white/5 dark:text-gray-200">{d.notice.message}</p>}

      {d?.lines.map((l) => (
        <div key={l.category} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="grid gap-3">
            <Remark text={l.remark} over={l.state === "over"} />
            <Bar line={l} />
          </div>
          <div className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            <p className="font-semibold text-gray-900 dark:text-white">{l.state === "over" ? "ทำอะไรต่อ" : "รู้ไว้ก่อนกดอนุมัติ"}</p>
            {l.state === "over" && <p>ลดยอดหรือเลื่อนได้ไหม ถ้าได้ แก้ PR แล้วเช็กใหม่ ถ้าต้องซื้อ วางหมายเหตุนี้ เขียนเหตุผล ให้เจ้าของงบตัดสิน</p>}
            <p>ยอดอนุมัตินับถึง {hhmm(d.base?.prAt ?? d.base?.computedAt)} · เช็กเมื่อ {hhmm(d.readAt)}</p>
            {l.othersPending > 0 && (
              <p className={l.state === "ok_pending_over" ? "text-red-700 dark:text-red-400" : ""}>
                มีใบอื่นรออนุมัติในงบนี้ {fmt(l.othersPending)} ถ้าอนุมัติครบ{l.after - l.othersPending < 0 ? `จะเกิน ${fmt(l.othersPending - l.after)}` : `จะเหลือ ${fmt(l.after - l.othersPending)}`}
              </p>
            )}
            {d.otherLeg.filter((o) => o.category === l.category).map((o) => (
              <p key={o.category}>งบใช้ของ {d.group?.split("|")[0]} {CAT_LABEL[o.category]} เหลือ {fmt(o.before)} ดูประกอบ ไม่เอามารวม</p>
            ))}
          </div>
        </div>
      ))}

      {d?.fleet && (
        <section className="mt-5 border-t border-gray-100 pt-4 dark:border-white/5">
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">งบรายฟลีท · {d.fleet.name}</h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">งบจากแท็บงบรายฟลีท (ซ่อมปันตามอายุรถ PM กับยางปันตามจำนวนคัน) เทียบกับ PR ที่อนุมัติแล้วของรถในฟลีทนี้</p>
          {d.fleet.reason && <p className="mt-2 text-[13px] text-gray-700 dark:text-gray-300">{d.fleet.reason}</p>}
          {d.fleet.lines.map((l) => (
            <div key={l.category} className="mt-3 grid gap-3">
              <Remark text={l.remark} over={l.state === "over"} />
              <Bar line={l} />
              {l.othersPending > 0 && (
                <p className={`text-[13px] ${l.state === "ok_pending_over" ? "text-red-700 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}>
                  มีใบอื่นของฟลีทนี้รออนุมัติ {fmt(l.othersPending)} ถ้าอนุมัติครบ{l.after - l.othersPending < 0 ? `จะเกิน ${fmt(l.othersPending - l.after)}` : `จะเหลือ ${fmt(l.after - l.othersPending)}`}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    </article>
  )
}

function StatePill({ state, lines }: { state: "ok" | "ok_pending_over" | "over"; lines: CheckLine[] }) {
  const over = Math.max(0, ...lines.map((l) => -l.after))
  const [text, cls] =
    state === "over" ? [`เกินงบ ${fmt(over)}`, "border-red-300 text-red-700 dark:border-red-800 dark:text-red-400"]
      : state === "ok_pending_over" ? ["ไม่เกิน แต่มีใบอื่นรอ", "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300"]
        : ["ไม่เกิน", "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300"]
  return <span className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${cls}`}>{text}</span>
}

function Remark({ text, over }: { text: string; over: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-stretch gap-2">
      <p className={`min-w-0 flex-1 rounded-lg border px-3 py-2 font-medium text-[14px] break-words ${over ? "border-red-300 dark:border-red-800/60" : "border-gray-300 dark:border-white/15"}`}>{text}</p>
      <button type="button"
        onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/15 dark:text-gray-200 dark:hover:bg-white/5">
        {done ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {done ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </div>
  )
}

function Bar({ line }: { line: CheckLine }) {
  const total = Math.max(line.budget, line.used + line.amount)
  const pct = (v: number) => `${Math.max(0, (v / total) * 100)}%`
  const inBudget = Math.max(0, Math.min(line.amount, line.budget - line.used))
  const overAmt = Math.max(0, line.used + line.amount - line.budget)
  return (
    <div className="grid gap-1">
      <p className="text-[12px] text-gray-500 dark:text-gray-400">งบซื้อ {CAT_LABEL[line.category]} ทั้งเดือน {fmt(line.budget)}</p>
      <div className="flex h-6 overflow-hidden rounded-md border border-gray-300 text-[11px] font-semibold dark:border-white/15" role="img"
        aria-label={`อนุมัติแล้ว ${fmt(line.used)} PR นี้ ${fmt(line.amount)} หลังอนุมัติเหลือ ${fmt(line.after)}`}>
        <div className="flex items-center bg-amber-700 px-1.5 text-white" style={{ width: pct(Math.min(line.used, line.budget)) }}>{line.used ? `อนุมัติแล้ว ${fmt(line.used)}` : ""}</div>
        <div className="bg-amber-100 dark:bg-amber-900/40" style={{ width: pct(inBudget) }} />
        {overAmt > 0 && <div className="bg-red-600" style={{ width: pct(overAmt) }} />}
        <div className="flex flex-1 items-center justify-end px-1.5 text-gray-600 dark:text-gray-300">{line.after >= 0 ? `เหลือ ${fmt(line.after)}` : ""}</div>
      </div>
      <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">PR นี้ {fmt(line.amount)}{line.after < 0 ? ` · เกิน ${fmt(-line.after)}` : ""}</p>
    </div>
  )
}
