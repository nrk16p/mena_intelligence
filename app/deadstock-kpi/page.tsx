"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { GroupFilter } from "@/components/kpi-group-filter"

// ─────────────────────────────────────────────────────────────────────────────
// KPI: มูลค่าสินค้าคงคลัง >12 เดือน (Dead Stock) — ไม่เกิน 2% ของยอดควบคุม
// นิยาม (proxy): ยังมีคงเหลือ แต่ไม่มีการเคลื่อนไหว >=12 เดือน · ยิ่งน้อยยิ่งดี
// ─────────────────────────────────────────────────────────────────────────────

const PV = { blue: "#2563EB", ink: "#111827", sub: "#6B7280", border: "#E5E7EB", bg: "#F9FAFB", surface: "#FFFFFF" }
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

type MonthRow = { ym: string; value: number; grade: number; score: number }
type Center = {
  key: string
  label: string
  target: number
  bands: { grade4: number; grade3: number; grade2: number }
  warehouses: string[]
  months: MonthRow[]
}
type ApiData = { success: boolean; years: number[]; centers: Center[]; error?: string }

type BdCenter = { key: string; months: string[]; productGroups: { name: string; cells: Record<string, number> }[] }
type BdData = { success: boolean; years: number[]; centers: BdCenter[] }
const TOP_N = 12

const GRADE_STYLE: Record<number, { bg: string; fg: string; label: string }> = {
  4: { bg: "#DCFCE7", fg: "#15803D", label: "เกรด 4" },
  3: { bg: "#ECFCCB", fg: "#4D7C0F", label: "เกรด 3" },
  2: { bg: "#FEF3C7", fg: "#B45309", label: "เกรด 2" },
  0: { bg: "#FEE2E2", fg: "#B91C1C", label: "ตก (0 คะแนน)" },
}
const baht = (n: number) => Math.round(n).toLocaleString("en-US")
const monthIdx = (ym: string) => Number(ym.slice(5, 7)) - 1
const gradeLocal = (b: { grade4: number; grade3: number; grade2: number }, v: number) =>
  v <= b.grade4 ? 4 : v <= b.grade3 ? 3 : v <= b.grade2 ? 2 : 0

export default function DeadstockKpiPage() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [bd, setBd] = useState<BdData | null>(null)
  const [selected, setSelected] = useState<Set<string> | null>(null)

  useEffect(() => {
    fetch("/api/deadstock-kpi")
      .then((r) => r.json())
      .then((d: ApiData) => {
        if (!d.success) throw new Error(d.error || "load failed")
        setData(d)
        setYear(d.years[d.years.length - 1] ?? null)
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
    fetch("/api/deadstock-kpi/breakdown")
      .then((r) => r.json())
      .then((d: BdData) => {
        if (!d.success) return
        setBd(d)
        const all = new Set<string>()
        for (const c of d.centers) for (const p of c.productGroups) all.add(p.name)
        setSelected(all)
      })
      .catch(() => {})
  }, [])

  const allGroups = useMemo(() => {
    if (!bd) return [] as string[]
    const s = new Set<string>()
    for (const c of bd.centers) for (const p of c.productGroups) s.add(p.name)
    return [...s].sort()
  }, [bd])

  // ยอด KPI คิดใหม่จาก breakdown ตามกลุ่มสินค้าที่เลือก (Σ selected pg) — filter กระทบ KPI ด้วย
  const viewCenters = useMemo<Center[]>(() => {
    if (!data) return []
    if (!bd) return data.centers
    const sel = selected ?? new Set(allGroups)
    return bd.centers.map((bc) => {
      const spec = data.centers.find((c) => c.key === bc.key)!
      const months = bc.months.map((ym) => {
        const value = bc.productGroups.reduce((s, pg) => s + (sel.has(pg.name) ? pg.cells[ym] ?? 0 : 0), 0)
        const grade = gradeLocal(spec.bands, value)
        return { ym, value: Math.round(value), grade, score: grade * 3 }
      })
      return { ...spec, months }
    })
  }, [data, bd, selected, allGroups])

  const yearMonths = useMemo(() => {
    if (year == null) return [] as string[]
    const s = new Set<string>()
    for (const c of viewCenters) for (const m of c.months) if (Number(m.ym.slice(0, 4)) === year) s.add(m.ym)
    return [...s].sort()
  }, [viewCenters, year])

  const rowByYm = (c: Center) => new Map(c.months.map((m) => [m.ym, m]))
  const sel = selected ?? new Set(allGroups)
  const pgParam = sel.size > 0 && sel.size < allGroups.length ? `&pg=${encodeURIComponent([...sel].join(","))}` : ""

  const exportExcel = () => {
    if (!data || year == null) return
    const monthLabels = yearMonths.map((ym) => TH_MONTHS[monthIdx(ym)])
    const aoa: (string | number)[][] = [
      [`KPI มูลค่าสินค้าคงคลัง >12 เดือน — ปี ${year}`],
      ["ไม่เกิน 2% ของยอดควบคุมในแต่ละศูนย์ · วัดรายเดือน · ยิ่งน้อยยิ่งดี"],
      [],
      ["ตัวชี้วัด", "เป้าหมาย", "น้ำหนัก", "คะแนนเต็ม", "Min (เกรด 2)", "Target (เกรด 3)", "Max (เกรด 4)", "ความถี่"],
    ]
    for (const c of data.centers)
      aoa.push([c.label, c.target, 3, 12, c.bands.grade2, c.bands.grade3, c.bands.grade4, "รายเดือน"])
    aoa.push([], ["ตัวชี้วัด", ...monthLabels])
    for (const c of viewCenters) {
      const map = rowByYm(c)
      aoa.push([`${c.key} · เป้า ${c.target}`])
      aoa.push(["มูลค่า (บาท)", ...yearMonths.map((ym) => { const m = map.get(ym); return m ? m.value : "" })])
      aoa.push(["เกรด", ...yearMonths.map((ym) => { const m = map.get(ym); return m ? m.grade : "" })])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 50 }, ...monthLabels.map(() => ({ wch: 12 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `DeadStock ${year}`)
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `KPI_deadstock_${year}.xlsx`)
  }

  if (loading) return <Shell><div style={{ padding: 40, color: PV.sub }}>กำลังโหลดข้อมูล…</div></Shell>
  if (err) return <Shell><div style={{ padding: 40, color: "#B91C1C" }}>เกิดข้อผิดพลาด: {err}</div></Shell>
  if (!data || year == null) return <Shell><div style={{ padding: 40 }}>ไม่มีข้อมูล</div></Shell>

  return (
    <Shell>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'Red Hat Display', sans-serif", fontWeight: 900, fontSize: 26, color: PV.ink, margin: 0 }}>
          KPI มูลค่าสินค้าคงคลัง &gt;12 เดือน (Dead Stock)
        </h1>
        <p style={{ color: PV.sub, margin: "6px 0 0", fontSize: 14 }}>
          ไม่เกิน 2% ของยอดควบคุมในแต่ละศูนย์ · วัดรายเดือน · ยิ่งน้อยยิ่งดี
        </p>
      </div>

      {/* note about proxy */}
      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, marginBottom: 20 }}>
        ⚠️ คำนวณจาก movement (ยังมีคงเหลือ + ไม่เคลื่อนไหว ≥12 เดือน)
      </div>

      {/* spec scorecard */}
      <div style={{ overflowX: "auto", background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 14, marginBottom: 22 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#1F4E78", color: "#fff" }}>
              {["ตัวชี้วัด", "เป้าหมาย", "น้ำหนัก", "คะแนนเต็ม", "Min (เกรด 2)", "Target (เกรด 3)", "Max (เกรด 4)", "ความถี่"].map((h) => (
                <th key={h} style={{ padding: "9px 8px", fontWeight: 700, whiteSpace: "nowrap", textAlign: h === "ตัวชี้วัด" ? "left" : "center" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.centers.map((c) => (
              <tr key={c.key} style={{ borderBottom: `1px solid ${PV.border}` }}>
                <td style={{ padding: "9px 8px", fontWeight: 500 }}>{c.label}</td>
                {[c.target, 3, 12, c.bands.grade2, c.bands.grade3, c.bands.grade4].map((v, i) => (
                  <td key={i} style={{ padding: "9px 8px", textAlign: "center", fontFamily: "'Fira Code', monospace" }}>{typeof v === "number" && v >= 100 ? baht(v) : v}</td>
                ))}
                <td style={{ padding: "9px 8px", textAlign: "center" }}>รายเดือน</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* year selector + filter + export */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: PV.sub, marginRight: 4 }}>ปี:</span>
        {data.years.map((y) => (
          <button key={y} onClick={() => setYear(y)} style={{ padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: `1px solid ${y === year ? PV.blue : PV.border}`, background: y === year ? PV.blue : PV.surface, color: y === year ? "#fff" : PV.ink }}>{y}</button>
        ))}
        {bd && <span style={{ marginLeft: "auto" }}><GroupFilter allGroups={allGroups} selected={sel} onChange={setSelected} /></span>}
        <button onClick={exportExcel} style={{ marginLeft: bd ? 0 : "auto", padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", background: "#16A34A", color: "#fff" }}>⬇ Export Excel</button>
      </div>

      {sel.size < allGroups.length && (
        <div style={{ fontSize: 12.5, color: "#1E3A8A", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "6px 12px", marginBottom: 12 }}>
          กำลังกรอง {sel.size}/{allGroups.length} กลุ่มสินค้า — ยอด KPI + เกรด + breakdown + raw คิดเฉพาะกลุ่มที่เลือก
        </div>
      )}

      {/* monthly pivot */}
      <div style={{ overflowX: "auto", background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: "#F3F4F6" }}>
              <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: "#F3F4F6", minWidth: 150 }}>ตัวชี้วัด</th>
              {yearMonths.map((ym) => <th key={ym} style={{ ...thStyle, minWidth: 88 }}>{TH_MONTHS[monthIdx(ym)]}</th>)}
            </tr>
          </thead>
          <tbody>
            {viewCenters.map((c) => {
              const rm = rowByYm(c)
              return <CenterRows key={c.key} center={c} yearMonths={yearMonths} rowMap={rm} />
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap", fontSize: 12, color: PV.sub }}>
        {[4, 3, 2, 0].map((g) => (
          <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: GRADE_STYLE[g].bg, border: `1px solid ${PV.border}` }} />
            {GRADE_STYLE[g].label}
          </span>
        ))}
      </div>

      {bd && year != null && <DsBreakdownSection bd={bd} year={year} selected={sel} />}

      {/* raw data download */}
      <div style={{ marginTop: 24, background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: PV.ink, marginBottom: 4 }}>ดาวน์โหลดข้อมูลดิบ (Raw Data)</div>
        <div style={{ fontSize: 13, color: PV.sub, marginBottom: 12 }}>
          movement รายรายการ (รับ/จ่าย/ราคาทุน/รหัสสินค้า) ของปี {year} เป็นไฟล์ CSV{sel.size < allGroups.length ? " · เฉพาะกลุ่มสินค้าที่เลือก" : ""}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {["all", ...data.centers.map((c) => c.key)].map((g) => (
            <a key={g}
              href={`/api/stock-onhand-kpi/raw?year=${year}&group=${encodeURIComponent(g)}${pgParam}`}
              style={{ padding: "8px 16px", borderRadius: 8, background: PV.blue, color: "#fff", fontWeight: 600, fontSize: 13, textDecoration: "none" }}
            >⬇ {g === "all" ? "ทุกศูนย์" : g}</a>
          ))}
        </div>
      </div>
    </Shell>
  )
}

function pillStyle(active: boolean, activeColor = PV.blue): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? activeColor : PV.border}`,
    background: active ? activeColor : PV.surface, color: active ? "#fff" : PV.ink,
  }
}

function DsBreakdownSection({ bd, year, selected }: { bd: BdData; year: number; selected: Set<string> }) {
  const [cKey, setCKey] = useState<string>(bd.centers[0]?.key ?? "")
  const center = bd.centers.find((c) => c.key === cKey) ?? bd.centers[0]
  const months = useMemo(() => center.months.filter((m) => Number(m.slice(0, 4)) === year), [center, year])

  const { rows, totals } = useMemo(() => {
    const val = (pg: BdCenter["productGroups"][number], ym: string) => pg.cells[ym] ?? 0
    const pgs = center.productGroups.filter((pg) => selected.has(pg.name))
    const ranked = pgs
      .map((pg) => ({ pg, score: months.reduce((s, ym) => s + Math.abs(val(pg, ym)), 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    const top = ranked.slice(0, TOP_N).map((x) => x.pg)
    const rest = ranked.slice(TOP_N).map((x) => x.pg)
    const rows: { name: string; byMonth: Record<string, number> }[] = top.map((pg) => ({
      name: pg.name,
      byMonth: Object.fromEntries(months.map((ym) => [ym, val(pg, ym)])),
    }))
    if (rest.length)
      rows.push({ name: `อื่นๆ (${rest.length} กลุ่ม)`, byMonth: Object.fromEntries(months.map((ym) => [ym, rest.reduce((s, pg) => s + val(pg, ym), 0)])) })
    const totals: Record<string, number> = Object.fromEntries(months.map((ym) => [ym, pgs.reduce((s, pg) => s + val(pg, ym), 0)]))
    return { rows, totals }
  }, [center, months, selected])

  const exportBd = () => {
    const header = ["กลุ่มสินค้า", ...months.flatMap((ym) => { const l = TH_MONTHS[monthIdx(ym)]; return [`${l} (บาท)`, `${l} %`] })]
    const aoa: (string | number)[][] = [
      [`Dead Stock แตกตามกลุ่มสินค้า — ${cKey}`],
      [`ปี ${year} · ตัวเลข (บาท) + สัดส่วน % ต่อเดือน`],
      [],
      header,
    ]
    for (const r of rows) {
      const line: (string | number)[] = [r.name]
      for (const ym of months) {
        const v = r.byMonth[ym] ?? 0
        const tot = totals[ym] || 0
        line.push(Math.round(v), Number((tot !== 0 ? (v / tot) * 100 : 0).toFixed(1)))
      }
      aoa.push(line)
    }
    const totalLine: (string | number)[] = ["รวม"]
    for (const ym of months) totalLine.push(Math.round(totals[ym] || 0), 100)
    aoa.push(totalLine)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 26 }, ...months.flatMap(() => [{ wch: 13 }, { wch: 7 }])]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `DeadStock ${cKey}`.slice(0, 31))
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `KPI_deadstock_breakdown_${cKey.replace(/\./g, "")}_${year}.xlsx`)
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Red Hat Display', sans-serif", fontWeight: 800, fontSize: 19, color: PV.ink, margin: 0 }}>
            Dead Stock แตกตามกลุ่มสินค้า
          </h2>
          <div style={{ fontSize: 13, color: PV.sub, marginTop: 2 }}>ปี {year} · ตัวเลข (บาท) + สัดส่วน % ต่อเดือน</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {bd.centers.map((c) => (
            <button key={c.key} onClick={() => setCKey(c.key)} style={pillStyle(c.key === cKey)}>{c.key}</button>
          ))}
          <span style={{ width: 1, height: 22, background: PV.border, margin: "0 2px" }} />
          <button onClick={exportBd} style={{ ...pillStyle(false), background: "#16A34A", color: "#fff", border: "none" }}>⬇ Excel</button>
        </div>
      </div>

      <div style={{ overflowX: "auto", background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#F3F4F6" }}>
              <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: "#F3F4F6", minWidth: 180 }}>กลุ่มสินค้า</th>
              {months.map((ym) => <th key={ym} style={{ ...thStyle, minWidth: 92 }}>{TH_MONTHS[monthIdx(ym)]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={labelCell}>{r.name}</td>
                {months.map((ym) => {
                  const v = r.byMonth[ym] ?? 0
                  const tot = totals[ym] || 0
                  const pct = tot !== 0 ? (v / tot) * 100 : 0
                  return (
                    <td key={ym} style={tdBase}>
                      <div style={{ fontWeight: 600, fontFamily: "'Fira Code', monospace", color: PV.ink }}>{baht(v)}</div>
                      <div style={{ fontSize: 11, color: PV.sub }}>{pct.toFixed(1)}%</div>
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr style={{ background: "#EEF2FF" }}>
              <td style={{ ...labelCell, background: "#EEF2FF", fontWeight: 800, color: "#1E3A8A" }}>รวม</td>
              {months.map((ym) => (
                <td key={ym} style={{ ...tdBase, fontWeight: 700, fontFamily: "'Fira Code', monospace", color: "#1E3A8A" }}>{baht(totals[ym] || 0)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#374151", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }
const tdBase: React.CSSProperties = { padding: "8px", textAlign: "center", borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap" }
const labelCell: React.CSSProperties = { ...tdBase, textAlign: "left", position: "sticky", left: 0, background: "#fff", fontWeight: 500 }

function CenterRows({ center, yearMonths, rowMap }: { center: Center; yearMonths: string[]; rowMap: Map<string, MonthRow> }) {
  return (
    <>
      <tr style={{ background: "#EEF2FF" }}>
        <td style={{ ...labelCell, background: "#EEF2FF", fontWeight: 800, color: "#1E3A8A" }}>{center.key} · เป้า ฿{baht(center.target)}</td>
        {yearMonths.map((ym) => <td key={ym} style={{ ...tdBase, background: "#EEF2FF" }} />)}
      </tr>
      <tr>
        <td style={labelCell}>มูลค่า (บาท)</td>
        {yearMonths.map((ym) => {
          const m = rowMap.get(ym)
          if (!m) return <td key={ym} style={tdBase}>–</td>
          const gs = GRADE_STYLE[m.grade]
          return <td key={ym} style={{ ...tdBase, background: gs.bg, color: gs.fg, fontWeight: 700, fontFamily: "'Fira Code', monospace" }}>{baht(m.value)}</td>
        })}
      </tr>
      <tr>
        <td style={labelCell}>เกรด</td>
        {yearMonths.map((ym) => {
          const m = rowMap.get(ym)
          if (!m) return <td key={ym} style={tdBase}>–</td>
          const gs = GRADE_STYLE[m.grade]
          return <td key={ym} style={{ ...tdBase, color: gs.fg, fontWeight: 700 }}>{m.grade}</td>
        })}
      </tr>
    </>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: PV.bg, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 60px" }}>{children}</div>
    </div>
  )
}
