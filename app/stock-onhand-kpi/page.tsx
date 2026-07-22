"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { GroupFilter } from "@/components/kpi-group-filter"
import { defaultKeptGroups } from "@/lib/kpi-excluded-groups"

// ─────────────────────────────────────────────────────────────────────────────
// KPI ควบคุมสต็อคคงเหลือ (Stock On-hand) — ศลบ. / สสบ.
// คงเหลือสิ้นเดือน = running balance = Σ(รับ−จ่าย)×ราคาทุน สะสมจาก 2023-01
// ยิ่งน้อยยิ่งดี · แสดงตั้งแต่ปี 2025 · ดูทีละปี (pivot) · โหลด raw ได้
// ─────────────────────────────────────────────────────────────────────────────

const PV = {
  blue: "#2563EB",
  ink: "#111827",
  sub: "#6B7280",
  border: "#E5E7EB",
  bg: "#F9FAFB",
  surface: "#FFFFFF",
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

type MonthRow = { ym: string; monthNet: number; balance: number; grade: number; score: number }
type Group = {
  key: string
  label: string
  target: number
  bands: { grade4: number; grade3: number; grade2: number }
  warehouses: string[]
  months: MonthRow[]
}
type ApiData = { success: boolean; years: number[]; groups: Group[]; error?: string }

type BdCell = { recv: number; issue: number; balance: number }
type BdGroup = { key: string; months: string[]; productGroups: { name: string; cells: Record<string, BdCell> }[] }
type BdData = { success: boolean; years: number[]; groups: BdGroup[] }
type BdMetric = "balance" | "recv" | "issue"
const BD_METRICS: { key: BdMetric; label: string }[] = [
  { key: "balance", label: "คงเหลือ" },
  { key: "recv", label: "ยอดรับ" },
  { key: "issue", label: "ยอดเบิก" },
]
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

export default function StockOnhandKpiPage() {
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [rawGroup, setRawGroup] = useState<string>("all")
  const [bd, setBd] = useState<BdData | null>(null)
  const [selected, setSelected] = useState<Set<string> | null>(null)

  useEffect(() => {
    fetch("/api/stock-onhand-kpi")
      .then((r) => r.json())
      .then((d: ApiData) => {
        if (!d.success) throw new Error(d.error || "load failed")
        setData(d)
        setYear(d.years[d.years.length - 1] ?? null)
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
    fetch("/api/stock-onhand-kpi/breakdown")
      .then((r) => r.json())
      .then((d: BdData) => {
        if (!d.success) return
        setBd(d)
        const all = new Set<string>()
        for (const g of d.groups) for (const p of g.productGroups) all.add(p.name)
        setSelected(new Set(defaultKeptGroups([...all]))) // default = เฉพาะอะไหล่ (ตัด 26 กลุ่ม)
      })
      .catch(() => {})
  }, [])

  const allGroups = useMemo(() => {
    if (!bd) return [] as string[]
    const s = new Set<string>()
    for (const g of bd.groups) for (const p of g.productGroups) s.add(p.name)
    return [...s].sort()
  }, [bd])

  // ยอด KPI (คงเหลือ) คิดใหม่จาก breakdown ตามกลุ่มสินค้าที่เลือก — filter กระทบ KPI ด้วย
  const viewGroups = useMemo<Group[]>(() => {
    if (!data) return []
    if (!bd) return data.groups
    const sel = selected ?? new Set(allGroups)
    return bd.groups.map((bg) => {
      const spec = data.groups.find((g) => g.key === bg.key)!
      const months: MonthRow[] = bg.months.map((ym) => {
        const balance = bg.productGroups.reduce((s, pg) => s + (sel.has(pg.name) ? pg.cells[ym]?.balance ?? 0 : 0), 0)
        const grade = gradeLocal(spec.bands, balance)
        return { ym, monthNet: 0, balance: Math.round(balance), grade, score: grade * 4 }
      })
      return { ...spec, months }
    })
  }, [data, bd, selected, allGroups])

  const yearMonths = useMemo(() => {
    if (year == null) return [] as string[]
    const s = new Set<string>()
    for (const g of viewGroups) for (const m of g.months) if (Number(m.ym.slice(0, 4)) === year) s.add(m.ym)
    return [...s].sort()
  }, [viewGroups, year])

  const rowByYm = (g: Group) => {
    const map = new Map<string, MonthRow>()
    for (const m of g.months) map.set(m.ym, m)
    return map
  }
  const sel = selected ?? new Set(allGroups)
  const pgParam = sel.size > 0 && sel.size < allGroups.length ? `&pg=${encodeURIComponent([...sel].join(","))}` : ""

  // export pivot ตัวชี้วัด ของปีที่เลือก เป็น Excel
  const exportExcel = () => {
    if (!data || year == null) return
    const monthLabels = yearMonths.map((ym) => TH_MONTHS[monthIdx(ym)])
    const aoa: (string | number)[][] = [
      [`KPI ควบคุมสต็อคคงเหลือ — ปี ${year}`],
      ["มูลค่าสต็อคคงค้าง ณ วันที่ 5 ของเดือนถัดไป (ระบบ ATMS) · ยิ่งน้อยยิ่งดี"],
      [],
      ["ตัวชี้วัด", "เป้าหมาย", "น้ำหนัก", "คะแนนเต็ม", "Min (เกรด 2)", "Target (เกรด 3)", "Max (เกรด 4)", "ความถี่"],
    ]
    for (const g of data.groups)
      aoa.push([g.label, g.target, 4, 16, g.bands.grade2, g.bands.grade3, g.bands.grade4, "รายเดือน"])
    aoa.push([], ["ตัวชี้วัด", ...monthLabels])
    for (const g of viewGroups) {
      const map = rowByYm(g)
      aoa.push([`${g.key} · เป้า ${g.target}`])
      aoa.push(["คงเหลือ (บาท)", ...yearMonths.map((ym) => { const m = map.get(ym); return m ? Math.round(m.balance) : "" })])
      aoa.push(["เกรด", ...yearMonths.map((ym) => { const m = map.get(ym); return m ? m.grade : "" })])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 46 }, ...monthLabels.map(() => ({ wch: 12 }))]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `KPI ${year}`)
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `KPI_stock_onhand_${year}.xlsx`)
  }

  if (loading)
    return <Shell><div style={{ padding: 40, color: PV.sub }}>กำลังโหลดข้อมูล…</div></Shell>
  if (err)
    return <Shell><div style={{ padding: 40, color: "#B91C1C" }}>เกิดข้อผิดพลาด: {err}</div></Shell>
  if (!data || year == null) return <Shell><div style={{ padding: 40 }}>ไม่มีข้อมูล</div></Shell>

  return (
    <Shell>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Red Hat Display', sans-serif", fontWeight: 900, fontSize: 26, color: PV.ink, margin: 0 }}>
          KPI ควบคุมสต็อคคงเหลือ
        </h1>
        <p style={{ color: PV.sub, margin: "6px 0 0", fontSize: 14 }}>
          มูลค่าสต็อคคงค้าง ณ วันที่ 5 ของเดือนถัดไป (ระบบ ATMS) · วัดรายเดือน · ยิ่งน้อยยิ่งดี (คุมทุนจม)
        </p>
      </div>

      {/* Year selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: PV.sub, marginRight: 4 }}>ปี:</span>
        {data.years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${y === year ? PV.blue : PV.border}`,
              background: y === year ? PV.blue : PV.surface, color: y === year ? "#fff" : PV.ink,
            }}
          >{y}</button>
        ))}
        {bd && <span style={{ marginLeft: "auto" }}><GroupFilter allGroups={allGroups} selected={sel} onChange={setSelected} defaultGroups={defaultKeptGroups(allGroups)} /></span>}
        <button
          onClick={exportExcel}
          style={{
            marginLeft: bd ? 0 : "auto", padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: "pointer", border: "none", background: "#16A34A", color: "#fff",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >⬇ Export Excel</button>
      </div>

      {sel.size < allGroups.length && (
        <div style={{ fontSize: 12.5, color: "#1E3A8A", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "6px 12px", marginBottom: 12 }}>
          กำลังกรอง {sel.size}/{allGroups.length} กลุ่มสินค้า — ยอด KPI + เกรด + breakdown + raw คิดเฉพาะกลุ่มที่เลือก
        </div>
      )}

      {/* Pivot table */}
      <div style={{ overflowX: "auto", background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: "#F3F4F6" }}>
              <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: "#F3F4F6", minWidth: 150 }}>ตัวชี้วัด</th>
              {yearMonths.map((ym) => (
                <th key={ym} style={{ ...thStyle, minWidth: 88 }}>{TH_MONTHS[monthIdx(ym)]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {viewGroups.map((g) => {
              const rm = rowByYm(g)
              return (
                <GroupRows key={g.key} group={g} yearMonths={yearMonths} rowMap={rm} />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap", fontSize: 12, color: PV.sub }}>
        {[4, 3, 2, 0].map((g) => (
          <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: GRADE_STYLE[g].bg, border: `1px solid ${PV.border}` }} />
            {GRADE_STYLE[g].label}
          </span>
        ))}
      </div>

      {/* Breakdown by product group */}
      {bd && year != null && <BreakdownSection bd={bd} year={year} selected={sel} />}

      {/* Raw data download */}
      <div style={{ marginTop: 24, background: PV.surface, border: `1px solid ${PV.border}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: PV.ink, marginBottom: 4 }}>ดาวน์โหลดข้อมูลดิบ (Raw Data)</div>
        <div style={{ fontSize: 13, color: PV.sub, marginBottom: 12 }}>movement รายรายการ (รับ/จ่าย/ราคาทุน/รหัสสินค้า) ของปี {year} เป็นไฟล์ CSV{sel.size < allGroups.length ? " · เฉพาะกลุ่มสินค้าที่เลือก" : ""}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={rawGroup} onChange={(e) => setRawGroup(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${PV.border}`, fontSize: 14 }}>
            <option value="all">ทุกกลุ่ม</option>
            {data.groups.map((g) => <option key={g.key} value={g.key}>{g.key} ({g.warehouses.join("+")})</option>)}
          </select>
          <a
            href={`/api/stock-onhand-kpi/raw?year=${year}&group=${encodeURIComponent(rawGroup)}${pgParam}`}
            style={{ padding: "8px 18px", borderRadius: 8, background: PV.blue, color: "#fff", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >⬇ ดาวน์โหลด CSV</a>
        </div>
      </div>
    </Shell>
  )
}

const thStyle: React.CSSProperties = {
  padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "#374151",
  borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap",
}
const tdBase: React.CSSProperties = {
  padding: "8px", textAlign: "center", borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap",
}
const labelCell: React.CSSProperties = {
  ...tdBase, textAlign: "left", position: "sticky", left: 0, background: "#fff", fontWeight: 500,
}

function GroupRows({ group, yearMonths, rowMap }: { group: Group; yearMonths: string[]; rowMap: Map<string, MonthRow> }) {
  return (
    <>
      {/* group header */}
      <tr style={{ background: "#EEF2FF" }}>
        <td style={{ ...labelCell, background: "#EEF2FF", fontWeight: 800, color: "#1E3A8A" }}>
          {group.key} · เป้า ฿{baht(group.target)}
        </td>
        {yearMonths.map((ym) => <td key={ym} style={{ ...tdBase, background: "#EEF2FF" }} />)}
      </tr>
      {/* คงเหลือ */}
      <tr>
        <td style={labelCell}>คงเหลือ (บาท)</td>
        {yearMonths.map((ym) => {
          const m = rowMap.get(ym)
          if (!m) return <td key={ym} style={tdBase}>–</td>
          const gs = GRADE_STYLE[m.grade]
          return <td key={ym} style={{ ...tdBase, background: gs.bg, color: gs.fg, fontWeight: 700, fontFamily: "'Fira Code', monospace" }}>{baht(m.balance)}</td>
        })}
      </tr>
      {/* เกรด */}
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

// บรรทัด MoM (เทียบเดือนก่อน) — ▲ เพิ่ม (แดง) / ▼ ลด (เขียว) เพราะยิ่งน้อยยิ่งดี
function MomLine({ m }: { m: number | null }) {
  if (m == null) return <div style={{ fontSize: 10, color: "#CBD5E1" }}>–</div>
  const up = m > 0.05, down = m < -0.05
  const color = up ? "#B91C1C" : down ? "#15803D" : "#94A3B8"
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color }}>
      {up ? "▲" : down ? "▼" : "="}{Math.abs(m).toFixed(1)}%
    </div>
  )
}

function pillStyle(active: boolean, activeColor = PV.blue): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? activeColor : PV.border}`,
    background: active ? activeColor : PV.surface, color: active ? "#fff" : PV.ink,
  }
}

function BreakdownSection({ bd, year, selected }: { bd: BdData; year: number; selected: Set<string> }) {
  const [gKey, setGKey] = useState<string>(bd.groups[0]?.key ?? "")
  const [metric, setMetric] = useState<BdMetric>("balance")

  const group = bd.groups.find((g) => g.key === gKey) ?? bd.groups[0]
  const months = useMemo(
    () => group.months.filter((m) => Number(m.slice(0, 4)) === year),
    [group, year]
  )

  const { rows, totals, totalsMom } = useMemo(() => {
    const val = (pg: BdGroup["productGroups"][number], ym: string) => pg.cells[ym]?.[metric] ?? 0
    const fullMonths = group.months // ทุกเดือน 2025+ (ใช้หา prev แม้ ม.ค. ของปีที่เลือก)
    const prevOf = (ym: string) => { const i = fullMonths.indexOf(ym); return i > 0 ? fullMonths[i - 1] : null }
    const mom = (cur: number, prev: number | null): number | null =>
      prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100

    const pgs = group.productGroups.filter((pg) => selected.has(pg.name))
    const ranked = pgs
      .map((pg) => ({ pg, score: months.reduce((s, ym) => s + Math.abs(val(pg, ym)), 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    const top = ranked.slice(0, TOP_N).map((x) => x.pg)
    const rest = ranked.slice(TOP_N).map((x) => x.pg)
    const sumRest = (ym: string) => rest.reduce((s, pg) => s + val(pg, ym), 0)

    type Row = { name: string; byMonth: Record<string, number>; momByMonth: Record<string, number | null> }
    const rows: Row[] = top.map((pg) => ({
      name: pg.name,
      byMonth: Object.fromEntries(months.map((ym) => [ym, val(pg, ym)])),
      momByMonth: Object.fromEntries(months.map((ym) => { const p = prevOf(ym); return [ym, p ? mom(val(pg, ym), val(pg, p)) : null] })),
    }))
    if (rest.length)
      rows.push({
        name: `อื่นๆ (${rest.length} กลุ่ม)`,
        byMonth: Object.fromEntries(months.map((ym) => [ym, sumRest(ym)])),
        momByMonth: Object.fromEntries(months.map((ym) => { const p = prevOf(ym); return [ym, p ? mom(sumRest(ym), sumRest(p)) : null] })),
      })
    const totalAt = (ym: string) => pgs.reduce((s, pg) => s + val(pg, ym), 0)
    const totals: Record<string, number> = Object.fromEntries(months.map((ym) => [ym, totalAt(ym)]))
    const totalsMom: Record<string, number | null> = Object.fromEntries(months.map((ym) => { const p = prevOf(ym); return [ym, p ? mom(totalAt(ym), totalAt(p)) : null] }))
    return { rows, totals, totalsMom }
  }, [group, months, metric, selected])

  const metricLabel = BD_METRICS.find((m) => m.key === metric)!.label

  // export breakdown ปัจจุบัน (กลุ่มคลัง + metric + ปี) เป็น Excel — มีทั้งบาท + %
  const exportBd = () => {
    const header = ["กลุ่มสินค้า", ...months.flatMap((ym) => {
      const l = TH_MONTHS[monthIdx(ym)]
      return [`${l} (บาท)`, `${l} %`, `${l} MoM%`]
    })]
    const aoa: (string | number)[][] = [
      [`รายละเอียดตามกลุ่มสินค้า — ${metricLabel} — ${gKey}`],
      [`ปี ${year} · ตัวเลข (บาท) + สัดส่วน % + MoM (เทียบเดือนก่อน) ต่อเดือน`],
      [],
      header,
    ]
    for (const r of rows) {
      const line: (string | number)[] = [r.name]
      for (const ym of months) {
        const v = r.byMonth[ym] ?? 0
        const tot = totals[ym] || 0
        const m = r.momByMonth[ym]
        line.push(Math.round(v), Number((tot !== 0 ? (v / tot) * 100 : 0).toFixed(1)), m == null ? "" : Number(m.toFixed(1)))
      }
      aoa.push(line)
    }
    const totalLine: (string | number)[] = ["รวม"]
    for (const ym of months) { const m = totalsMom[ym]; totalLine.push(Math.round(totals[ym] || 0), 100, m == null ? "" : Number(m.toFixed(1))) }
    aoa.push(totalLine)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws["!cols"] = [{ wch: 26 }, ...months.flatMap(() => [{ wch: 13 }, { wch: 7 }, { wch: 8 }])]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${gKey} ${metricLabel}`.slice(0, 31))
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/octet-stream" }),
      `KPI_breakdown_${gKey.replace(/\./g, "")}_${metric}_${year}.xlsx`)
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Red Hat Display', sans-serif", fontWeight: 800, fontSize: 19, color: PV.ink, margin: 0 }}>
            รายละเอียดตามกลุ่มสินค้า — {metricLabel}
          </h2>
          <div style={{ fontSize: 13, color: PV.sub, marginTop: 2 }}>ปี {year} · บาท + สัดส่วน % + MoM (เทียบเดือนก่อน) ต่อเดือน</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {bd.groups.map((g) => (
            <button key={g.key} onClick={() => setGKey(g.key)} style={pillStyle(g.key === gKey)}>{g.key}</button>
          ))}
          <span style={{ width: 1, height: 22, background: PV.border, margin: "0 2px" }} />
          {BD_METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)} style={pillStyle(m.key === metric, "#16A34A")}>{m.label}</button>
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
                      <div style={{ fontWeight: 600, fontFamily: "'Fira Code', monospace", color: v < 0 ? "#B91C1C" : PV.ink }}>{baht(v)}</div>
                      <div style={{ fontSize: 11, color: PV.sub }}>{pct.toFixed(1)}%</div>
                      <MomLine m={r.momByMonth[ym]} />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr style={{ background: "#EEF2FF" }}>
              <td style={{ ...labelCell, background: "#EEF2FF", fontWeight: 800, color: "#1E3A8A" }}>รวม</td>
              {months.map((ym) => (
                <td key={ym} style={{ ...tdBase, fontWeight: 700, fontFamily: "'Fira Code', monospace", color: "#1E3A8A" }}>
                  <div>{baht(totals[ym] || 0)}</div>
                  <MomLine m={totalsMom[ym]} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: PV.bg, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 60px" }}>{children}</div>
    </div>
  )
}
