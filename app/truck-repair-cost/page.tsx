"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"

type Row = {
  plate: string
  year: number
  cost: number
  months: number
  vehicle_type: string
  model_year: number | null
  ownership: string
  fleet_no: string
  brand: string
  warehouse: string
  is_trailer: boolean
}

const BASE_YEARS = [2023, 2024, 2025]
const CUR = 2026
const MIN_TRUCK_MONTHS = 24 // กลุ่มที่เดือนรวมน้อยกว่านี้ ตัวเลขแกว่ง แสดงเป็นสีจาง
const DEFAULT_OWNERSHIP = ["รถมีนา", "รถขายแล้ว"]

type Agg = { cost: number; months: number; trucks: number; perYear: number | null }
function agg(rows: Row[]): Agg {
  const cost = rows.reduce((s, r) => s + r.cost, 0)
  const months = rows.reduce((s, r) => s + r.months, 0)
  const trucks = new Set(rows.map((r) => r.plate)).size
  return { cost, months, trucks, perYear: months > 0 ? (cost / months) * 12 : null }
}
const baht = (v: number | null) => (v == null ? "–" : `฿${Math.round(v).toLocaleString()}`)
const pct = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / b) * 100)
function PctTag({ v }: { v: number | null }) {
  if (v == null) return <span className="text-gray-300">–</span>
  const up = v > 0
  return (
    <span className={`tabular-nums font-medium ${up ? "text-red-600" : "text-emerald-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%
    </span>
  )
}

export default function TruckRepairCostPage() {
  const [data, setData] = useState<Row[]>([])
  const [through, setThrough] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [owners, setOwners] = useState<Set<string>>(new Set(DEFAULT_OWNERSHIP))
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [noTrailer, setNoTrailer] = useState(false)

  useEffect(() => {
    fetch("/api/truck-repair-cost", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.error || "โหลดข้อมูลไม่สำเร็จ")
        setData(j.data); setThrough(j.data_through)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const allOwners = useMemo(() => {
    const m = new Map<string, number>()
    data.forEach((r) => m.set(r.ownership, (m.get(r.ownership) ?? 0) + r.cost))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [data])

  const base = useMemo(
    () => data.filter((r) => owners.has(r.ownership) && !(noTrailer && r.is_trailer)),
    [data, owners, noTrailer],
  )
  const allTypes = useMemo(() => {
    const m = new Map<string, number>()
    base.forEach((r) => m.set(r.vehicle_type, (m.get(r.vehicle_type) ?? 0) + r.cost))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }, [base])
  const rows = useMemo(() => (types.size ? base.filter((r) => types.has(r.vehicle_type)) : base), [base, types])

  const byYear = useMemo(() => {
    const o: Record<number, Agg> = {}
    for (const y of [...BASE_YEARS, CUR]) o[y] = agg(rows.filter((r) => r.year === y))
    return o
  }, [rows])
  const avg3 = useMemo(() => agg(rows.filter((r) => BASE_YEARS.includes(r.year))), [rows])

  // แยกตามประเภทรถ
  const typeTable = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.vehicle_type))]
    return names
      .map((t) => {
        const rs = rows.filter((r) => r.vehicle_type === t)
        const y: Record<number, Agg> = {}
        for (const yy of [...BASE_YEARS, CUR]) y[yy] = agg(rs.filter((r) => r.year === yy))
        const a3 = agg(rs.filter((r) => BASE_YEARS.includes(r.year)))
        return { type: t, y, a3, change: pct(y[CUR].perYear, a3.perYear) }
      })
      .sort((a, b) => b.y[CUR].cost - a.y[CUR].cost)
  }, [rows])

  // แยกตามอายุรถ ณ ปีนั้น (เทียบรถอายุเท่ากัน)
  const ageChart = useMemo(() => {
    const bucket = (a: number) => (a <= 2 ? "0–2" : a <= 5 ? "3–5" : a <= 8 ? "6–8" : a <= 11 ? "9–11" : a <= 14 ? "12–14" : "15+")
    const order = ["0–2", "3–5", "6–8", "9–11", "12–14", "15+"]
    const withAge = rows.filter((r) => r.model_year != null).map((r) => ({ ...r, b: bucket(r.year - (r.model_year as number)) }))
    return order.map((b) => {
      const rs = withAge.filter((r) => r.b === b)
      const a3 = agg(rs.filter((r) => BASE_YEARS.includes(r.year)))
      const c = agg(rs.filter((r) => r.year === CUR))
      return { age: `${b} ปี`, avg3: a3.perYear ? Math.round(a3.perYear) : 0, cur: c.perYear ? Math.round(c.perYear) : 0, n3: a3.months, nc: c.months }
    })
  }, [rows])

  // รายคัน: ปีนี้แพงสุด เทียบค่าเฉลี่ย 3 ปีของคันเดียวกัน
  const topTrucks = useMemo(() => {
    const plates = [...new Set(rows.filter((r) => r.year === CUR).map((r) => r.plate))]
    return plates
      .map((p) => {
        const rs = rows.filter((r) => r.plate === p)
        const c = agg(rs.filter((r) => r.year === CUR))
        const a3 = agg(rs.filter((r) => BASE_YEARS.includes(r.year)))
        const r0 = rs[0]
        return { plate: p, fleet_no: r0.fleet_no, type: r0.vehicle_type, model_year: r0.model_year, cur: c, a3, change: pct(c.perYear, a3.perYear) }
      })
      .filter((t) => t.cur.months >= 3)
      .sort((a, b) => (b.cur.perYear ?? 0) - (a.cur.perYear ?? 0))
      .slice(0, 20)
  }, [rows])

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const t = typeTable.map((r) => ({
      ประเภทรถ: r.type,
      "จำนวนคัน 2026": r.y[CUR].trucks,
      ...Object.fromEntries(BASE_YEARS.map((y) => [`ต่อคันต่อปี ${y}`, r.y[y].perYear ? Math.round(r.y[y].perYear!) : null])),
      "เฉลี่ย 2023–2025": r.a3.perYear ? Math.round(r.a3.perYear) : null,
      "ต่อคันต่อปี 2026": r.y[CUR].perYear ? Math.round(r.y[CUR].perYear!) : null,
      "2026 เทียบเฉลี่ย 3 ปี (%)": r.change == null ? null : Number(r.change.toFixed(1)),
      "เดือนใช้งานรวม 2023–2025": r.a3.months,
      "เดือนใช้งาน 2026": r.y[CUR].months,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(t), "ตามประเภทรถ")
    const p = rows.map((r) => ({
      ทะเบียน: r.plate, เลขรถ: r.fleet_no, ประเภทรถ: r.vehicle_type, ปีรถ: r.model_year, กรรมสิทธิ์: r.ownership,
      ปี: r.year, ค่าซ่อม: Math.round(r.cost), เดือนใช้งาน: r.months, ต่อคันต่อปี: r.months ? Math.round((r.cost / r.months) * 12) : null,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(p), "รายคันรายปี")
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `ค่าซ่อมต่อคัน_2023-2026.xlsx`)
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); setter(n)
  }
  const chg = pct(byYear[CUR]?.perYear ?? null, avg3.perYear)
  const thLabel = through ? `${through.slice(5)}/${through.slice(0, 4)}` : "–"

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">ค่าซ่อมต่อคัน 2023–2025 เทียบ 2026</h1>
          <p className="text-sm text-muted-foreground">ค่าซ่อมแซมเฉลี่ยต่อคันต่อปี แยกประเภทรถและอายุรถ</p>
        </div>
        <button onClick={exportExcel} disabled={!rows.length}
          className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40">
          ส่งออก Excel
        </button>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs leading-relaxed text-blue-700">
        นับเฉพาะใบเบิกกลุ่มซ่อมแซม (ซ่อม · CM-งานซ่อม · ค่าซ่อมรถร่วม · อะไหล่/วัสดุสิ้นเปลือง) ไม่รวมยาง PM อุบัติเหตุ และน้ำมัน ·
        ต่อคันต่อปี = ค่าซ่อม ÷ เดือนที่รถใช้งาน × 12 ปี 2026 มีข้อมูลถึง {thLabel} จึงคิดเต็มปีด้วยวิธีเดียวกัน ·
        เดือนใช้งาน = ตั้งแต่ใบเบิกแรกถึงใบเบิกสุดท้ายของคันนั้น · ที่มา ATMS stockmovement + ทะเบียนรถ ATMS
      </div>

      {/* ตัวกรอง */}
      <div className="space-y-4 rounded-xl border bg-white p-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">กรรมสิทธิ์รถ</span>
          <div className="flex flex-wrap gap-2">
            {allOwners.map((o) => (
              <Chip key={o} on={owners.has(o)} onClick={() => toggle(owners, setOwners, o)}>{o}</Chip>
            ))}
          </div>
          <p className="text-xs text-gray-400">ค่าเริ่มต้นคือรถมีนา รวมคันที่ขายไปแล้ว เพราะปีก่อน ๆ ยังวิ่งอยู่</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">ประเภทรถ</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={noTrailer} onChange={(e) => setNoTrailer(e.target.checked)} /> ไม่รวมหาง
              </label>
              {types.size > 0 && (
                <button onClick={() => setTypes(new Set())} className="text-xs text-gray-500 underline hover:text-black">
                  ล้าง ({types.size})
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {allTypes.map((t) => (
              <Chip key={t} on={types.has(t)} onClick={() => toggle(types, setTypes, t)}>{t}</Chip>
            ))}
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400">กำลังโหลด…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {/* การ์ด */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {BASE_YEARS.map((y) => (
              <Card key={y} label={`ต่อคันต่อปี ${y}`} value={baht(byYear[y]?.perYear ?? null)}
                sub={`${byYear[y]?.trucks ?? 0} คัน · ${(byYear[y]?.months ?? 0).toLocaleString()} เดือนใช้งาน`} />
            ))}
            <Card label="เฉลี่ย 2023–2025" value={baht(avg3.perYear)} sub="รวม 3 ปี ถ่วงตามเดือนใช้งาน" strong />
            <Card label={`ปี ${CUR} (ถึง ${thLabel})`} value={baht(byYear[CUR]?.perYear ?? null)}
              sub={<>เทียบเฉลี่ย 3 ปี <PctTag v={chg} /></>} strong accent />
          </div>

          {/* อายุรถ */}
          <div className="space-y-3 rounded-xl border bg-white p-5">
            <div>
              <h2 className="text-base font-bold">ต่อคันต่อปี แยกตามอายุรถ</h2>
              <p className="text-xs text-gray-400">อายุ = ปีที่เกิดค่าซ่อม − ปีรถ เทียบรถอายุเท่ากันข้ามปี · แท่งเทา = เฉลี่ย 2023–2025 · แท่งน้ำเงิน = 2026</p>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageChart} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="age" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}K`} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => `฿${Number(v).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="avg3" name="เฉลี่ย 2023–2025" fill="#9ca3af" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cur" name={`${CUR}`} fill="#2563eb" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ตามประเภทรถ */}
          <div className="overflow-x-auto rounded-xl border bg-white">
            <div className="px-5 pt-4">
              <h2 className="text-base font-bold">ตามประเภทรถ</h2>
              <p className="text-xs text-gray-400">เรียงตามค่าซ่อมรวมปี {CUR} · แถวจาง = เดือนใช้งานรวมไม่ถึง {MIN_TRUCK_MONTHS} เดือน ตัวเลขยังแกว่ง</p>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead className="border-y bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">ประเภทรถ</th>
                  <th className="px-3 py-2 text-right">คัน {CUR}</th>
                  {BASE_YEARS.map((y) => <th key={y} className="px-3 py-2 text-right">{y}</th>)}
                  <th className="px-3 py-2 text-right">เฉลี่ย 3 ปี</th>
                  <th className="px-3 py-2 text-right">{CUR}</th>
                  <th className="px-4 py-2 text-right">เทียบเฉลี่ย</th>
                </tr>
              </thead>
              <tbody>
                {typeTable.map((r) => {
                  const thin = r.y[CUR].months < MIN_TRUCK_MONTHS || r.a3.months < MIN_TRUCK_MONTHS
                  return (
                    <tr key={r.type} className={`border-b last:border-0 ${thin ? "text-gray-400" : ""}`}>
                      <td className="px-4 py-2">{r.type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.y[CUR].trucks || "–"}</td>
                      {BASE_YEARS.map((y) => <td key={y} className="px-3 py-2 text-right tabular-nums">{baht(r.y[y].perYear)}</td>)}
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(r.a3.perYear)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{baht(r.y[CUR].perYear)}</td>
                      <td className="px-4 py-2 text-right">{thin ? <span>–</span> : <PctTag v={r.change} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* รายคัน */}
          <div className="overflow-x-auto rounded-xl border bg-white">
            <div className="px-5 pt-4">
              <h2 className="text-base font-bold">20 คันที่ค่าซ่อมปี {CUR} สูงสุด</h2>
              <p className="text-xs text-gray-400">คิดต่อปีแล้ว เทียบกับค่าเฉลี่ย 3 ปีของคันเดียวกัน · เฉพาะคันที่ใช้งานปีนี้อย่างน้อย 3 เดือน</p>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead className="border-y bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">ทะเบียน</th>
                  <th className="px-3 py-2 text-left">เลขรถ</th>
                  <th className="px-3 py-2 text-left">ประเภทรถ</th>
                  <th className="px-3 py-2 text-right">ปีรถ</th>
                  <th className="px-3 py-2 text-right">ค่าซ่อม {CUR}</th>
                  <th className="px-3 py-2 text-right">ต่อปี {CUR}</th>
                  <th className="px-3 py-2 text-right">เฉลี่ย 3 ปี</th>
                  <th className="px-4 py-2 text-right">เทียบ</th>
                </tr>
              </thead>
              <tbody>
                {topTrucks.map((t) => (
                  <tr key={t.plate} className="border-b last:border-0">
                    <td className="px-4 py-2">{t.plate}</td>
                    <td className="px-3 py-2 text-gray-500">{t.fleet_no || "–"}</td>
                    <td className="px-3 py-2">{t.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.model_year ?? "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(t.cur.cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{baht(t.cur.perYear)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{baht(t.a3.perYear)}</td>
                    <td className="px-4 py-2 text-right"><PctTag v={t.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"}`}>
      {children}
    </button>
  )
}

function Card({ label, value, sub, strong, accent }: { label: string; value: string; sub: React.ReactNode; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent ? "border-blue-200 bg-blue-50" : strong ? "bg-gray-50" : "bg-white"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ? "text-blue-700" : "text-gray-900"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  )
}
