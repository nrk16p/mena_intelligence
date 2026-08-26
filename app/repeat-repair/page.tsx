"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

// ─────────────────────────────────────────────────────────────────────────────
// KPI ซ่อมซ้ำ (Repeat Repair Rate)
// ซ่อมซ้ำ = ทะเบียนเดียวกัน + ประเภทงานซ่อมเดียวกัน + คนละใบ
//           แจ้งซ่อมใหม่ภายใน 30 วัน นับจาก "วันซ่อมเสร็จ" ของใบก่อนหน้า
// ─────────────────────────────────────────────────────────────────────────────

const PV = {
  blue: "#2563EB",
  red: "#DC2626",
  amber: "#D97706",
  green: "#16A34A",
  ink: "#111827",
  sub: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  surface: "#FFFFFF",
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const monthLabel = (ym: string) => `${TH_MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`
const pct = (n: number) => `${n.toFixed(1)}%`
const num = (n: number) => n.toLocaleString("en-US")
const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—")

type Agg = { key: string; events: number; repeats: number; rate: number }
type MatrixRow = { branch: string; repairType: string; events: number; repeats: number; rate: number }
type Ev = {
  requestId: number; requestCode: string; truck: string; vehicleNo: string
  repairType: string; branch: string; reportedAt: string; finishAt: string | null
  ym: string; gapDays: number | null; prevCode: string | null; prevFinishAt: string | null
  prevType: string | null
  prevDescription: string | null
  description: string
}
type Api = {
  success: boolean
  error?: string
  windowDays: number
  options: { years: string[]; branches: string[]; types: string[] }
  total: number; repeats: number; rate: number
  monthly: Agg[]; byType: Agg[]; byBranch: Agg[]; matrix: MatrixRow[]
  maturity: { ym: string; pct: number }[]
  repeatEvents: Ev[]
}

const rateColor = (r: number) => (r >= 35 ? PV.red : r >= 25 ? PV.amber : PV.green)

export default function RepeatRepairPage() {
  const [data, setData] = useState<Api | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [year, setYear] = useState("2026")
  const [windowDays, setWindowDays] = useState(30)
  const [planned, setPlanned] = useState(false)
  const [branches, setBranches] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [limit, setLimit] = useState(100)

  const qs = useMemo(() => {
    const p = new URLSearchParams({ year, window: String(windowDays) })
    if (planned) p.set("planned", "1")
    if (branches.size) p.set("branches", [...branches].join(","))
    if (types.size) p.set("types", [...types].join(","))
    return p.toString()
  }, [year, windowDays, planned, branches, types])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/repeat-repair?${qs}`)
      .then((r) => r.json())
      .then((j: Api) => {
        if (!alive) return
        if (!j.success) setErr(j.error ?? "โหลดข้อมูลไม่สำเร็จ")
        else { setData(j); setErr(null) }
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [qs])

  const toggle = (set: Set<string>, v: string, fn: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(v) ? next.delete(v) : next.add(v)
    fn(next)
  }

  const filteredEvents = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.repeatEvents
    return data.repeatEvents.filter((e) =>
      [e.truck, e.requestCode, e.repairType, e.branch, e.prevCode ?? "", e.description, e.prevDescription ?? ""]
        .join(" ").toLowerCase().includes(q)
    )
  }, [data, search])

  // สาขา/ประเภท ที่มีข้อมูลจริงในผลลัพธ์ (ไว้ทำ matrix)
  const matrixBranches = useMemo(() => {
    if (!data) return []
    return data.byBranch.filter((b) => b.events >= 20).map((b) => b.key)
  }, [data])
  const matrixTypes = useMemo(() => (data ? data.byType.slice(0, 14).map((t) => t.key) : []), [data])
  const matrixLookup = useMemo(() => {
    const m = new Map<string, MatrixRow>()
    data?.matrix.forEach((r) => m.set(`${r.branch}|${r.repairType}`, r))
    return m
  }, [data])

  const exportExcel = () => {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["KPI ซ่อมซ้ำ (Repeat Repair Rate)", ""],
      ["ปี", year], ["ช่วงนับซ้ำ (วัน)", windowDays],
      ["รวมงานที่ไม่สะท้อนคุณภาพซ่อม (PM/ยาง/อุปกรณ์เสริม/อุบัติเหตุ ฯลฯ)", planned ? "รวม" : "ไม่รวม"],
      [], ["งานซ่อมทั้งหมด", data.total], ["งานซ่อมซ้ำ", data.repeats], ["Rate %", Number(data.rate.toFixed(1))],
      [], ["นิยาม", "ซ่อมซ้ำ = ทะเบียนเดียวกัน + ประเภทงานซ่อมเดียวกัน + คนละใบ แจ้งใหม่ภายใน N วันนับจากวันซ่อมเสร็จของใบก่อนหน้า"],
    ]), "สรุป")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.monthly.map((m) => ({ เดือน: m.key, งานซ่อม: m.events, ซ่อมซ้ำ: m.repeats, "Rate %": Number(m.rate.toFixed(1)) }))
    ), "รายเดือน")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.byType.map((t) => ({ ประเภทงานซ่อม: t.key, งานซ่อม: t.events, ซ่อมซ้ำ: t.repeats, "Rate %": Number(t.rate.toFixed(1)) }))
    ), "ตามประเภท")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.byBranch.map((b) => ({ สาขา: b.key, งานซ่อม: b.events, ซ่อมซ้ำ: b.repeats, "Rate %": Number(b.rate.toFixed(1)) }))
    ), "ตามสาขา")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      data.repeatEvents.map((e) => ({
        วันแจ้งซ่อม: fmtDate(e.reportedAt), เลขที่ใบ: e.requestCode, ทะเบียน: e.truck,
        ประเภทงานซ่อม: e.repairType, สาขา: e.branch, "ใบก่อนหน้า": e.prevCode,
        "ประเภทใบก่อน": e.prevType, "วันเสร็จใบก่อน": fmtDate(e.prevFinishAt),
        "ห่าง (วัน)": e.gapDays, "อาการรอบก่อน": e.prevDescription, "อาการรอบนี้": e.description,
      }))
    ), "รายการซ่อมซ้ำ")
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([out], { type: "application/octet-stream" }), `KPI_repeat_repair_${year}.xlsx`)
  }

  const latestMaturity = data?.maturity.at(-1)

  return (
    <div style={{ background: PV.bg, minHeight: "100vh", padding: "24px 28px", color: PV.ink }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>KPI ซ่อมซ้ำ (Repeat Repair Rate)</h1>
          <p style={{ color: PV.sub, margin: "6px 0 0", fontSize: 14, lineHeight: 1.6 }}>
            <b>งานซ่อม</b> = 1 (ใบแจ้งซ่อม × ทะเบียน × ประเภทงานซ่อม) ·{" "}
            <b>ซ่อมซ้ำ</b> = ทะเบียนเดียวกัน + ประเภทงานซ่อมเดียวกัน + คนละใบ
            และแจ้งซ่อมใหม่ภายใน {windowDays} วัน นับจาก<b>วันซ่อมเสร็จ</b>ของใบก่อนหน้า
            <br />
            ตัดทะเบียนหลอก (สบ.0000) ออก · ค่าเริ่มต้นไม่รวมงานที่ไม่สะท้อนคุณภาพซ่อม (PM/ยาง/อุปกรณ์เสริม/เคสอุบัติเหตุ/ทำความสะอาด/วัสดุสิ้นเปลือง)
          </p>
        </header>

        {/* ── ตัวกรอง ─────────────────────────────────────────── */}
        <section style={card()}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
            <Field label="ปี">
              <select value={year} onChange={(e) => setYear(e.target.value)} style={input()}>
                {(data?.options.years ?? ["2026"]).map((y) => <option key={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="ช่วงนับซ้ำ (วัน)">
              <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} style={input()}>
                {[7, 14, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} วัน</option>)}
              </select>
            </Field>
            <Field label="งานที่ไม่สะท้อนคุณภาพซ่อม (PM/ยาง/อุบัติเหตุ ฯลฯ)">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, height: 36 }}>
                <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} />
                รวมในการคำนวณ
              </label>
            </Field>
            <div style={{ flex: 1 }} />
            <button onClick={exportExcel} style={btn(PV.green)} disabled={!data}>⬇ Excel</button>
            <a href={`/api/repeat-repair/raw?${qs}&only=repeat`} style={{ ...btn(PV.blue), textDecoration: "none" }}>
              ⬇ CSV เฉพาะซ้ำ
            </a>
            <a href={`/api/repeat-repair/raw?${qs}`} style={{ ...btn(PV.sub), textDecoration: "none" }}>
              ⬇ CSV ทั้งหมด
            </a>
          </div>

          <ChipRow label="สาขา" all={data?.options.branches ?? []} sel={branches}
                   onToggle={(v) => toggle(branches, v, setBranches)} onClear={() => setBranches(new Set())} />
          <SearchSelect label="ประเภทงานซ่อม" all={data?.options.types ?? []} sel={types}
                        placeholder="พิมพ์เพื่อค้นหาประเภท เช่น เบรค, อู่นอก, PM…"
                        onToggle={(v) => toggle(types, v, setTypes)} onClear={() => setTypes(new Set())} />
        </section>

        {err && <div style={{ ...card(), color: PV.red }}>เกิดข้อผิดพลาด: {err}</div>}
        {loading && <div style={{ ...card(), color: PV.sub }}>กำลังโหลด…</div>}

        {data && !loading && (
          <>
            {/* ── การ์ดสรุป ──────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 16 }}>
              <Stat label="Repeat Repair Rate" value={pct(data.rate)} color={rateColor(data.rate)}
                    sub={`${num(data.repeats)} จาก ${num(data.total)} งานซ่อม`} />
              <Stat label="งานซ่อมทั้งหมด" value={num(data.total)} sub={`ปี ${year}`} />
              <Stat label="งานซ่อมซ้ำ" value={num(data.repeats)} sub={`ภายใน ${windowDays} วันหลังซ่อมเสร็จ`} />
              <Stat label="ใบที่ระบุวันเสร็จแล้ว" value={latestMaturity ? pct(latestMaturity.pct) : "—"}
                    sub={`เดือนล่าสุด (${latestMaturity ? monthLabel(latestMaturity.ym) : "—"})`}
                    color={latestMaturity && latestMaturity.pct < 60 ? PV.amber : undefined} />
            </div>

            {latestMaturity && latestMaturity.pct < 60 && (
              <div style={{ ...card(), background: "#FFFBEB", borderColor: "#FDE68A", color: "#92400E", fontSize: 13.5 }}>
                ⚠️ เดือนล่าสุดยังปิดใบไม่ครบ (ระบุวันซ่อมเสร็จแล้ว {pct(latestMaturity.pct)}) —
                ตัวเลข 1–2 เดือนท้ายจะ<b>ต่ำกว่าความจริง</b> และจะไต่ขึ้นย้อนหลังเมื่อ ATMS ทยอยปิดใบ
                จึงควรอ่าน KPI ทางการโดยตัดท้าย 30–45 วันออก
              </div>
            )}

            {/* ── แนวโน้มรายเดือน ────────────────────────────── */}
            <section style={card()}>
              <h2 style={h2()}>แนวโน้มรายเดือน</h2>
              <div style={{ height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.key) }))}
                             margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PV.border} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="l" tick={{ fontSize: 12 }} unit="%" />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v, n) =>
                      n === "Rate %" ? pct(Number(v)) : num(Number(v))} />
                    <Legend />
                    <Bar yAxisId="r" dataKey="events" name="งานซ่อม" fill="#DBEAFE" isAnimationActive={false} />
                    <Bar yAxisId="r" dataKey="repeats" name="งานซ่อมซ้ำ" fill="#93C5FD" isAnimationActive={false} />
                    <Line yAxisId="l" type="monotone" dataKey="rate" name="Rate %" stroke={PV.red}
                          strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* ── ตามประเภท + ตามสาขา ───────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
              <section style={card()}>
                <h2 style={h2()}>ตามประเภทงานซ่อม</h2>
                <div style={{ height: 340 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.byType.slice(0, 12).map((t) => ({ ...t, short: t.key.length > 16 ? t.key.slice(0, 15) + "…" : t.key }))}
                              layout="vertical" margin={{ left: 96, right: 24, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={PV.border} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} unit="%" />
                      <YAxis type="category" dataKey="short" width={96} tick={{ fontSize: 11.5 }} />
                      <Tooltip formatter={(v, _n, item) => {
                        const p = (item as { payload?: Agg }).payload
                        return [`${pct(Number(v))}${p ? ` (ซ้ำ ${num(p.repeats)}/${num(p.events)})` : ""}`, "Rate"]
                      }} />
                      <Bar dataKey="rate" isAnimationActive={false} radius={[0, 4, 4, 0]}>
                        {data.byType.slice(0, 12).map((t) => <Cell key={t.key} fill={rateColor(t.rate)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section style={card()}>
                <h2 style={h2()}>ตามสาขา (คลังสินค้า)</h2>
                <table style={table()}>
                  <thead><tr>{["สาขา", "งานซ่อม", "ซ้ำ", "Rate"].map((h, i) =>
                    <th key={h} style={th(i === 0 ? "left" : "right")}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.byBranch.map((b) => (
                      <tr key={b.key}>
                        <td style={td()}>{b.key}</td>
                        <td style={td("right")}>{num(b.events)}</td>
                        <td style={td("right")}>{num(b.repeats)}</td>
                        <td style={{ ...td("right"), fontWeight: 700, color: rateColor(b.rate) }}>
                          {b.events >= 20 ? pct(b.rate) : <span style={{ color: PV.sub, fontWeight: 400 }}>{pct(b.rate)}*</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 12, color: PV.sub, marginTop: 8 }}>* งานน้อยกว่า 20 รายการ — % ผันผวนสูง</p>
              </section>
            </div>

            {/* ── matrix สาขา × ประเภท ──────────────────────── */}
            <section style={card()}>
              <h2 style={h2()}>Rate % ตามสาขา × ประเภทงานซ่อม</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={table()}>
                  <thead>
                    <tr>
                      <th style={th("left")}>ประเภทงานซ่อม</th>
                      {matrixBranches.map((b) => <th key={b} style={th("right")}>{b}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixTypes.map((t) => (
                      <tr key={t}>
                        <td style={{ ...td(), whiteSpace: "nowrap" }}>{t}</td>
                        {matrixBranches.map((b) => {
                          const cell = matrixLookup.get(`${b}|${t}`)
                          if (!cell || cell.events < 10)
                            return <td key={b} style={{ ...td("right"), color: "#D1D5DB" }}>—</td>
                          return (
                            <td key={b} style={{ ...td("right"), background: heat(cell.rate) }}>
                              <b style={{ color: rateColor(cell.rate) }}>{pct(cell.rate)}</b>
                              <div style={{ fontSize: 11, color: PV.sub }}>{cell.repeats}/{cell.events}</div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: PV.sub, marginTop: 8 }}>
                แสดงเฉพาะช่องที่มีงานซ่อม ≥ 10 รายการ · สาขาที่มีงาน ≥ 20 รายการ
              </p>
            </section>

            {/* ── raw detail ────────────────────────────────── */}
            <section style={card()}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ ...h2(), margin: 0 }}>รายการงานซ่อมซ้ำ (raw data)</h2>
                <span style={{ color: PV.sub, fontSize: 13 }}>
                  {num(filteredEvents.length)} รายการ
                </span>
                <div style={{ flex: 1 }} />
                <input placeholder="ค้นหา ทะเบียน / เลขที่ใบ / ประเภท / อาการ…" value={search}
                       onChange={(e) => { setSearch(e.target.value); setLimit(100) }}
                       style={{ ...input(), width: 320 }} />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={table()}>
                  <thead>
                    <tr>
                      {["วันแจ้งซ่อม", "เลขที่ใบ", "ทะเบียน", "ประเภทงานซ่อม", "สาขา",
                        "ใบก่อนหน้า", "ประเภทใบก่อน", "วันเสร็จใบก่อน", "ห่าง (วัน)",
                        "อาการรอบก่อน", "อาการรอบนี้"].map((h) =>
                        <th key={h} style={th(h === "ห่าง (วัน)" ? "right" : "left")}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.slice(0, limit).map((e) => (
                      <tr key={`${e.requestId}-${e.repairType}`}>
                        <td style={{ ...td(), whiteSpace: "nowrap" }}>{fmtDate(e.reportedAt)}</td>
                        <td style={{ ...td(), fontFamily: "ui-monospace,monospace", fontSize: 12.5 }}>{e.requestCode}</td>
                        <td style={{ ...td(), whiteSpace: "nowrap", fontWeight: 600 }}>{e.truck}</td>
                        <td style={td()}>{e.repairType}</td>
                        <td style={td()}>{e.branch}</td>
                        <td style={{ ...td(), fontFamily: "ui-monospace,monospace", fontSize: 12.5, color: PV.sub }}>{e.prevCode}</td>
                        {/* ตรงกับคอลัมน์ "ประเภทงานซ่อม" เสมอ — นั่นคือกฎที่ตารางนี้ยืนยัน
                            ถ้าวันไหนไม่ตรง แปลว่าตรรกะจับคู่พัง */}
                        <td style={{ ...td(), color: PV.sub }}>{e.prevType}</td>
                        <td style={{ ...td(), whiteSpace: "nowrap", color: PV.sub }}>{fmtDate(e.prevFinishAt)}</td>
                        <td style={{ ...td("right"), fontWeight: 700, color: (e.gapDays ?? 99) <= 7 ? PV.red : PV.ink }}>
                          {e.gapDays?.toFixed(1)}
                        </td>
                        {/* วางติดกันเรียงตามเวลา ก่อน → นี้ เพื่อกวาดตาเทียบอาการได้ในแถวเดียว */}
                        <td style={{ ...td(), maxWidth: 320, fontSize: 12.5, color: PV.sub }}>{e.prevDescription}</td>
                        <td style={{ ...td(), maxWidth: 320, fontSize: 12.5 }}>{e.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredEvents.length > limit && (
                <div style={{ textAlign: "center", marginTop: 12 }}>
                  <button onClick={() => setLimit((l) => l + 200)} style={btn(PV.blue)}>
                    แสดงเพิ่ม (เหลืออีก {num(filteredEvents.length - limit)})
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: PV.sub, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card(), margin: 0, padding: 16 }}>
      <div style={{ fontSize: 13, color: PV.sub }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: color ?? PV.ink, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: PV.sub }}>{sub}</div>}
    </div>
  )
}

/**
 * Multi-select with a type-ahead filter. Same (all / sel / onToggle / onClear)
 * contract as ChipRow so the two are interchangeable — reach for this one once
 * the option list is too long to scan.
 */
function SearchSelect({ label, all, sel, onToggle, onClear, placeholder }: {
  label: string; all: string[]; sel: Set<string>
  onToggle: (v: string) => void; onClear: () => void; placeholder?: string
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter((v) => v.toLowerCase().includes(needle))
  }, [all, q])

  // clicking anywhere else closes the list; without this it stays open behind
  // the rest of the filters and swallows clicks
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  if (!all.length) return null

  const pick = (v: string) => {
    onToggle(v)
    setQ("")          // ready for the next term; the list stays open for multi-select
    setHi(0)
    setOpen(true)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); return }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHi((i) => {
        const n = matches.length
        if (!n) return 0
        return e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n
      })
      return
    }
    if (e.key === "Enter" && open && matches[hi]) { e.preventDefault(); pick(matches[hi]) }
  }

  return (
    <div style={{ marginTop: 14 }} ref={boxRef}>
      <div style={{ fontSize: 12, color: PV.sub, marginBottom: 6 }}>
        {label} {sel.size > 0 ? (
          <button onClick={onClear} style={{ ...btn(PV.sub), padding: "1px 8px", fontSize: 11, marginLeft: 6 }}>
            ล้าง ({sel.size})
          </button>
        ) : <span style={{ color: "#9CA3AF" }}>— ทั้งหมด ({all.length} ประเภท)</span>}
      </div>

      {/* selected values stay visible as removable chips */}
      {sel.size > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {[...sel].map((v) => (
            <button key={v} onClick={() => onToggle(v)} title="คลิกเพื่อเอาออก"
              style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${PV.blue}`, background: "#EFF6FF", color: PV.blue, fontWeight: 600,
              }}>
              {v} <span style={{ opacity: 0.6 }}>×</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ position: "relative", maxWidth: 460 }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder ?? "พิมพ์เพื่อค้นหา…"}
          style={{ ...input(), width: "100%" }}
        />
        {open && (
          <div style={{
            position: "absolute", zIndex: 20, top: 40, left: 0, right: 0,
            maxHeight: 260, overflowY: "auto", background: PV.surface,
            border: `1px solid ${PV.border}`, borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.08)",
          }}>
            {matches.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: PV.sub }}>ไม่พบประเภทที่ตรงกับ “{q}”</div>
            )}
            {matches.map((v, i) => {
              const on = sel.has(v)
              return (
                <div key={v}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(v) }}
                  style={{
                    padding: "7px 12px", fontSize: 13.5, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                    background: i === hi ? "#F3F4F6" : "transparent",
                    color: on ? PV.blue : PV.ink, fontWeight: on ? 600 : 400,
                  }}>
                  <span style={{ width: 12 }}>{on ? "✓" : ""}</span>{v}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ChipRow({ label, all, sel, onToggle, onClear }: {
  label: string; all: string[]; sel: Set<string>
  onToggle: (v: string) => void; onClear: () => void
}) {
  if (!all.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: PV.sub, marginBottom: 6 }}>
        {label} {sel.size > 0 && (
          <button onClick={onClear} style={{ ...btn(PV.sub), padding: "1px 8px", fontSize: 11, marginLeft: 6 }}>
            ล้าง ({sel.size})
          </button>
        )}
        {sel.size === 0 && <span style={{ color: "#9CA3AF" }}>— ทั้งหมด</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {all.map((v) => {
          const on = sel.has(v)
          return (
            <button key={v} onClick={() => onToggle(v)}
              style={{
                padding: "4px 10px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${on ? PV.blue : PV.border}`,
                background: on ? "#EFF6FF" : PV.surface, color: on ? PV.blue : PV.ink,
                fontWeight: on ? 600 : 400,
              }}>
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const card = (): React.CSSProperties => ({
  background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 12,
  padding: 18, marginBottom: 16,
})
const h2 = (): React.CSSProperties => ({ fontSize: 16, fontWeight: 700, margin: "0 0 12px" })
const input = (): React.CSSProperties => ({
  border: `1px solid ${PV.border}`, borderRadius: 8, padding: "8px 10px",
  fontSize: 14, background: PV.surface, height: 36,
})
const btn = (c: string): React.CSSProperties => ({
  background: c, color: "#fff", border: "none", borderRadius: 8,
  padding: "8px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
  display: "inline-block", lineHeight: 1.4,
})
const table = (): React.CSSProperties => ({ width: "100%", borderCollapse: "collapse", fontSize: 13.5 })
const th = (align: "left" | "right" = "left"): React.CSSProperties => ({
  textAlign: align, padding: "8px 10px", borderBottom: `2px solid ${PV.border}`,
  color: PV.sub, fontWeight: 600, fontSize: 12.5, whiteSpace: "nowrap",
})
const td = (align: "left" | "right" = "left"): React.CSSProperties => ({
  textAlign: align, padding: "7px 10px", borderBottom: `1px solid ${PV.border}`, verticalAlign: "top",
})
const heat = (rate: number) =>
  rate >= 35 ? "#FEF2F2" : rate >= 25 ? "#FFFBEB" : rate > 0 ? "#F0FDF4" : PV.surface
