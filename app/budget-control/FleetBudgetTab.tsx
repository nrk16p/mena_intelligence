"use client"

import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import snapshot from "./fleet-budget-2569.json"

// งบรายฟลีท: snapshot built by scripts/budget-fleet-snapshot.py (truck_year_cost + ATMS + KPI 2026).
// Repair/parts is split by truck age (cost per truck per year by type × model year); PM and tyres by truck count.
type Group = {
  id: string; label: string; branch: string; trucks: number; trend_priced: number
  repair: number[]; pm: number[]; tyre: number[]
  bands: { band: string; trucks: number; share: number }[]
  fleets: { fleet: string; trucks: number; avg_age: number; repair_share: number }[]
}
type TypeRow = { year: number; age: number; trucks: number; per_month: number }
const DATA = snapshot as { year: number; as_of: string; groups: Group[]; types: { type: string; rows: TypeRow[] }[] }

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const BRANCH = { all: "ทั้งสองสาขา", "ศลบ": "ลาดกระบัง (ศลบ)", "สสบ": "สระบุรี (สสบ)" } as const
type BranchKey = keyof typeof BRANCH
const BANDS = ["0–5", "6–10", "11–15", "16+"]
const fmt = (n: number) => Math.round(n).toLocaleString("en-US")
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const mil = (n: number) => `${(n / 1e6).toFixed(2)}M`
const thYear = String(DATA.year + 543).slice(2)
const asOf = `${Number(DATA.as_of.slice(8, 10))} ${TH_MONTH[Number(DATA.as_of.slice(5, 7)) - 1]} ${String(Number(DATA.as_of.slice(0, 4)) + 543).slice(2)}`
const tint = (s: number) =>
  s >= 0.4 ? "bg-emerald-600 text-white" : s >= 0.2 ? "bg-emerald-300 text-emerald-950 dark:bg-emerald-700 dark:text-white"
    : s >= 0.08 ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100" : s > 0 ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" : ""

const CARD = "rounded-xl border border-gray-200 bg-white dark:border-white/8 dark:bg-[#0d0f18]"
const TH = "px-3.5 py-2.5 text-right font-semibold"
const TD = "px-3.5 py-2 text-right"

export default function FleetBudgetTab() {
  const [m, setM] = useState(11)
  const [branch, setBranch] = useState<BranchKey>("all")
  const groups = DATA.groups.filter((g) => branch === "all" || g.branch === branch)
  const tot = groups.reduce((a, g) => ({ n: a.n + g.trucks, rep: a.rep + g.repair[m], pm: a.pm + g.pm[m], ty: a.ty + g.tyre[m] }), { n: 0, rep: 0, pm: 0, ty: 0 })

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-gray-600 dark:text-gray-400">
        ตัวอย่าง ณ {asOf} · ซ่อม/อะไหล่ปันตามอายุรถ จากค่าซ่อมต่อคันในหน้า truck-year-cost · PM กับยางปันตามจำนวนคัน · งบจาก KPI 2026 · รถจากรายงานความพร้อมใช้รถ ATMS · ยังไม่อัปเดตเอง
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="fb-month">เดือนของงบ</label>
        <select id="fb-month" value={m} onChange={(e) => setM(Number(e.target.value))}
          className="min-h-[40px] rounded-full border border-gray-200 bg-white px-4 text-[14px] dark:border-white/10 dark:bg-[#0d0f18] dark:text-white">
          {TH_MONTH.map((t, i) => <option key={t} value={i}>งบ {t} {thYear}</option>)}
        </select>
        <div role="radiogroup" aria-label="สาขา" className="inline-flex flex-wrap gap-0.5 rounded-full bg-gray-100 p-1 dark:bg-white/5">
          {(Object.keys(BRANCH) as BranchKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={branch === k} onClick={() => setBranch(k)}
              className={`min-h-[32px] rounded-full px-3.5 text-[13px] ${branch === k ? "bg-white font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-[#14161f] dark:text-emerald-300 dark:ring-emerald-800/50" : "text-gray-600 dark:text-gray-400"}`}>
              {BRANCH[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`งบรวม ${TH_MONTH[m]} ${thYear}`} value={mil(tot.rep + tot.pm + tot.ty)} sub={`${fmt(tot.n)} คัน · ${groups.length} กลุ่มงบ`} strong />
        <Kpi label="ซ่อม/อะไหล่" value={mil(tot.rep)} sub="ปันตามอายุรถ" />
        <Kpi label="PM" value={mil(tot.pm)} sub="ปันตามจำนวนคัน" />
        <Kpi label="ยาง" value={mil(tot.ty)} sub="ปันตามจำนวนคัน" />
      </div>

      <FleetTable groups={groups} m={m} />
      <BandTable groups={groups} />
      <TypeTable />
    </div>
  )
}

function Kpi({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[13px] text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-[26px] font-bold leading-tight ${strong ? "text-emerald-700 dark:text-emerald-400" : "text-gray-900 dark:text-white"}`}>{value}</p>
      <p className="text-[12px] text-gray-500 dark:text-gray-400">{sub}</p>
    </div>
  )
}

function FleetTable({ groups, m }: { groups: Group[]; m: number }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const branches = ["ศลบ", "สสบ"].filter((b) => groups.some((g) => g.branch === b))
  const sum = (gs: Group[]) => gs.reduce((a, g) => ({ n: a.n + g.trucks, rep: a.rep + g.repair[m], pm: a.pm + g.pm[m], ty: a.ty + g.tyre[m] }), { n: 0, rep: 0, pm: 0, ty: 0 })
  const all = sum(groups)
  return (
    <section aria-label="งบรายฟลีท" className={`${CARD} overflow-x-auto`}>
      <div className="px-4 pt-4">
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">งบ {TH_MONTH[m]} {thYear} รายฟลีท</h2>
        <p className="text-[13px] text-gray-500 dark:text-gray-400">ซ่อมต่อคัน = งบซ่อมของฟลีท ÷ จำนวนรถ รถเก่าได้มากกว่า</p>
      </div>
      <table className="mt-2 w-full min-w-[900px] border-collapse text-[14px] text-gray-800 dark:text-gray-200">
        <thead>
          <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
            <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">กลุ่มงบ / ฟลีท</th>
            <th scope="col" className={TH}>รถ</th>
            <th scope="col" className={TH}>อายุเฉลี่ย</th>
            <th scope="col" className={TH}>ซ่อม/อะไหล่</th>
            <th scope="col" className={TH}>PM</th>
            <th scope="col" className={TH}>ยาง</th>
            <th scope="col" className={TH}>รวม</th>
            <th scope="col" className={TH}>ซ่อมต่อคัน</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => {
            const bg = groups.filter((g) => g.branch === b)
            const s = sum(bg)
            return (
              <Frag key={b}>
                {branches.length > 1 && (
                  <tr className="border-t-2 border-gray-300 bg-emerald-50/60 font-semibold dark:border-white/15 dark:bg-emerald-950/20">
                    <th scope="row" className="px-3.5 py-2 text-left">{BRANCH[b as BranchKey]}</th>
                    <td className={TD}>{fmt(s.n)}</td><td className={TD} />
                    <td className={TD}>{fmt(s.rep)}</td><td className={TD}>{fmt(s.pm)}</td><td className={TD}>{fmt(s.ty)}</td>
                    <td className={TD}>{fmt(s.rep + s.pm + s.ty)}</td><td className={TD} />
                  </tr>
                )}
                {bg.map((g) => {
                  const open = !closed[g.id]
                  const age = g.fleets.reduce((a, f) => a + f.avg_age * f.trucks, 0) / g.trucks
                  return (
                    <Frag key={g.id}>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold hover:bg-gray-100 dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/5">
                        <th scope="row" className="px-3.5 py-1.5 text-left">
                          {g.fleets.length > 1 ? (
                            <button type="button" onClick={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))} aria-expanded={open}
                              className="inline-flex min-h-[32px] items-center gap-1.5">
                              <ChevronRight size={14} aria-hidden="true" className={`text-gray-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
                              {g.label}
                            </button>
                          ) : <span className="inline-flex min-h-[32px] items-center pl-5">{g.label}</span>}
                        </th>
                        <td className={TD}>{fmt(g.trucks)}</td>
                        <td className={TD}>{age.toFixed(1)}</td>
                        <td className={TD}>{fmt(g.repair[m])}</td>
                        <td className={TD}>{fmt(g.pm[m])}</td>
                        <td className={TD}>{fmt(g.tyre[m])}</td>
                        <td className={TD}>{fmt(g.repair[m] + g.pm[m] + g.tyre[m])}</td>
                        <td className={TD}>{fmt(g.repair[m] / g.trucks)}</td>
                      </tr>
                      {open && g.fleets.length > 1 && g.fleets.map((f) => {
                        const rep = g.repair[m] * f.repair_share
                        const pm = (g.pm[m] * f.trucks) / g.trucks
                        const ty = (g.tyre[m] * f.trucks) / g.trucks
                        return (
                          <tr key={f.fleet} className="border-t border-gray-100 hover:bg-gray-50 dark:border-white/5 dark:hover:bg-white/5">
                            <th scope="row" className="py-1.5 pl-12 pr-3.5 text-left font-normal">{f.fleet}</th>
                            <td className={TD}>{fmt(f.trucks)}</td>
                            <td className={TD}>{f.avg_age.toFixed(1)}</td>
                            <td className={TD}>{fmt(rep)}</td>
                            <td className={TD}>{fmt(pm)}</td>
                            <td className={TD}>{fmt(ty)}</td>
                            <td className={`${TD} font-medium`}>{fmt(rep + pm + ty)}</td>
                            <td className={`${TD} text-gray-600 dark:text-gray-400`}>{fmt(rep / f.trucks)}</td>
                          </tr>
                        )
                      })}
                    </Frag>
                  )
                })}
              </Frag>
            )
          })}
          <tr className="border-t-2 border-gray-400 font-bold dark:border-white/20">
            <th scope="row" className="px-3.5 py-2.5 text-left">รวม</th>
            <td className={TD}>{fmt(all.n)}</td><td className={TD} />
            <td className={TD}>{fmt(all.rep)}</td><td className={TD}>{fmt(all.pm)}</td><td className={TD}>{fmt(all.ty)}</td>
            <td className={TD}>{fmt(all.rep + all.pm + all.ty)}</td><td className={TD} />
          </tr>
        </tbody>
      </table>
      <p className="px-4 pb-4 pt-2 text-[12px] text-gray-500 dark:text-gray-400">
        ยาง 620501 (ขนส่ง) แบ่ง SCCC กับ Side curtain ตามจำนวนคัน · รถตู้เย็นใช้งบ สสบ · นับหัวรถบริษัททุกคันที่อยู่ในรายงานเดือนนั้น รวมคันที่จอดซ่อม ไม่นับหาง รถร่วม และทะเบียนหลอก
      </p>
    </section>
  )
}

function BandTable({ groups }: { groups: Group[] }) {
  const yr = (g: Group) => g.repair.reduce((a, b) => a + b, 0)
  const total = groups.reduce((a, g) => a + yr(g), 0)
  return (
    <section aria-label="งบซ่อมทั้งปีตามช่วงอายุรถ" className={`${CARD} overflow-x-auto`}>
      <div className="px-4 pt-4">
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">งบซ่อม/อะไหล่ทั้งปี {thYear} แยกตามอายุรถ</h2>
        <p className="text-[13px] text-gray-500 dark:text-gray-400">งบช่วงอายุ = งบกลุ่ม × ค่าซ่อมต่อคันของรถในช่วงนั้นรวมกัน ÷ ของรถทั้งกลุ่ม</p>
      </div>
      <table className="mt-2 w-full min-w-[900px] border-collapse text-[14px] text-gray-800 dark:text-gray-200">
        <thead>
          <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
            <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">กลุ่มงบ</th>
            <th scope="col" className={TH}>รถ</th>
            <th scope="col" className={TH}>งบทั้งปี</th>
            {BANDS.map((b) => <th key={b} scope="col" className={`${TH} text-center`}>{b} ปี</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} className="border-t border-gray-100 dark:border-white/5">
              <th scope="row" className="px-3.5 py-2 text-left font-medium">{g.label}</th>
              <td className={TD}>{fmt(g.trucks)}</td>
              <td className={`${TD} font-semibold`}>{mil(yr(g))}</td>
              {g.bands.map((b) => (
                <td key={b.band} className="px-2 py-1.5 text-center">
                  {b.trucks ? (
                    <span className={`inline-flex min-w-[124px] items-baseline justify-center gap-1.5 rounded-md px-2 py-1 ${tint(b.share)}`}>
                      <span className="font-semibold">{mil(yr(g) * b.share)}</span><span className="text-[12px] opacity-80">{pct(b.share)}</span>
                    </span>
                  ) : <span className="text-gray-300 dark:text-gray-600">–</span>}
                  <span className="sr-only"> {b.trucks} คัน</span>
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gray-400 font-bold dark:border-white/20">
            <th scope="row" className="px-3.5 py-2.5 text-left">รวม</th>
            <td className={TD}>{fmt(groups.reduce((a, g) => a + g.trucks, 0))}</td>
            <td className={TD}>{mil(total)}</td>
            {BANDS.map((b) => {
              const v = groups.reduce((a, g) => a + yr(g) * (g.bands.find((x) => x.band === b)?.share ?? 0), 0)
              return <td key={b} className="px-2 py-2 text-center">{mil(v)} <span className="text-[12px] font-normal text-gray-500">{total ? pct(v / total) : ""}</span></td>
            })}
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function TypeTable() {
  const [t, setT] = useState(DATA.types[0].type)
  const { rows, calc } = useMemo(() => {
    const rows = DATA.types.find((x) => x.type === t)?.rows ?? []
    const est = rows.map((r) => r.per_month * 12 * r.trucks)
    const total = est.reduce((a, b) => a + b, 0)
    const pm = rows.reduce((a, r) => a + r.per_month, 0)
    return { rows, calc: { est, total, pm } }
  }, [t])
  return (
    <section aria-label="ค่าซ่อมต่อคันตามอายุรถ แยกประเภทรถ" className={`${CARD} overflow-x-auto`}>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">ค่าซ่อมต่อคันตามอายุรถ</h2>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">จาก truck-year-cost ม.ค. 66–พ.ค. 69 · % ต่อคัน คือน้ำหนักที่ใช้ปันงบ · ปีรถที่มีไม่ถึง 5 คันใช้เส้นแนวโน้มแทน</p>
        </div>
        <label className="sr-only" htmlFor="fb-type">ประเภทรถ</label>
        <select id="fb-type" value={t} onChange={(e) => setT(e.target.value)}
          className="min-h-[40px] max-w-full rounded-full border border-gray-200 bg-white px-4 text-[14px] dark:border-white/10 dark:bg-[#0d0f18] dark:text-white">
          {DATA.types.map((x) => <option key={x.type} value={x.type}>{x.type}</option>)}
        </select>
      </div>
      <table className="mt-2 w-full min-w-[760px] border-collapse text-[14px] text-gray-800 dark:text-gray-200">
        <thead>
          <tr className="bg-gray-50 text-[12px] text-gray-600 dark:bg-white/3 dark:text-gray-400">
            <th scope="col" className="px-3.5 py-2.5 text-left font-semibold">อายุรถ (ปีรถ)</th>
            <th scope="col" className={TH}>คัน</th>
            <th scope="col" className={TH}>เฉลี่ย/คัน/เดือน</th>
            <th scope="col" className={TH}>ประมาณการ/ปี × คัน</th>
            <th scope="col" className={TH}>% ของยอดรวม</th>
            <th scope="col" className={TH}>% ต่อคัน</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.year} className={`border-t border-gray-100 dark:border-white/5 ${r.trucks < 5 ? "text-gray-400 dark:text-gray-500" : ""}`}>
              <th scope="row" className="px-3.5 py-1.5 text-left font-medium">{r.age} ปี <span className="font-normal text-gray-500">({r.year})</span></th>
              <td className={TD}>{fmt(r.trucks)}</td>
              <td className={TD}>{fmt(r.per_month)}</td>
              <td className={TD}>{fmt(calc.est[i])}</td>
              <td className={TD}>{calc.total ? pct(calc.est[i] / calc.total) : "—"}</td>
              <td className={`${TD} font-semibold ${r.trucks < 5 ? "" : "text-emerald-700 dark:text-emerald-400"}`}>{calc.pm ? pct(r.per_month / calc.pm) : "—"}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-400 font-bold dark:border-white/20">
            <th scope="row" className="px-3.5 py-2.5 text-left">รวม</th>
            <td className={TD}>{fmt(rows.reduce((a, r) => a + r.trucks, 0))}</td>
            <td className={TD} />
            <td className={TD}>{fmt(calc.total)}</td>
            <td className={TD}>100%</td><td className={TD}>100%</td>
          </tr>
        </tbody>
      </table>
      <div className="h-4" />
    </section>
  )
}

function Frag({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
