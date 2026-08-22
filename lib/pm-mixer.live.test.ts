/** ตรวจเลขจาก computePmMixer กับผลวิเคราะห์ที่ทำด้วย pandas — รันเมื่อ PM_MIXER_LIVE=1 เท่านั้น */
import { describe, it, expect } from "vitest"
import { MongoClient } from "mongodb"
import { computePmMixer } from "./pm-mixer"

const live = process.env.PM_MIXER_LIVE === "1"
describe.runIf(live)("computePmMixer (live)", () => {
  it("matches the pandas baseline", async () => {
    const client = new MongoClient(process.env.MONGO_URI!)
    await client.connect()
    const p = await computePmMixer(client.db("atms"), {
      year: 2026, monthTo: 7, asOf: new Date(2026, 7, 21),
    })
    const [prev, cur] = p.overview
    console.log("meta      ", p.meta)
    console.log("2025      ", { pmMrs: prev.pmMrs, platesPm: prev.platesPm, platesAll: prev.platesAll,
      coverage: prev.coverage.toFixed(1), cost: Math.round(prev.cost), perMr: Math.round(prev.perMr) })
    console.log("2026      ", { pmMrs: cur.pmMrs, platesPm: cur.platesPm, platesAll: cur.platesAll,
      coverage: cur.coverage.toFixed(1), cost: Math.round(cur.cost), perMr: Math.round(cur.perMr) })
    console.log("byType    ", p.byType.map(r => `${r.key}: ${r.prev.pmTrucks}→${r.cur.pmTrucks} งาน, ฿${Math.round(r.prev.cost).toLocaleString()}→฿${Math.round(r.cur.cost).toLocaleString()}`))
    console.log("byAge     ", p.byAge.map(r => `${r.key}: cov ${(r.prev.pmTrucks/r.prev.trucks*100).toFixed(0)}%→${(r.cur.pmTrucks/r.cur.trucks*100).toFixed(0)}% | ใบ ${r.prev.pmMrs}→${r.cur.pmMrs}`))
    console.log("byFleet   ", p.byFleet.slice(0,8).map(r => `${r.key}: ${(r.prev.pmTrucks/r.prev.trucks*100).toFixed(0)}%→${(r.cur.pmTrucks/r.cur.trucks*100).toFixed(0)}%`))
    console.log("interval  ", p.interval.map(r => `${r.year}: ${r.medianDays}d / ${r.medianKm}km | >15k ${r.over15k.toFixed(1)}% >20k ${r.over20k.toFixed(1)}%`))
    console.log("basket    ", p.basket.map(r => `${r.year} ${r.repairType}: ${r.mrs} ใบ, avg ${r.avgItems.toFixed(2)}, oil ${r.items.engineOil.toFixed(1)}%, gear ${r.items.gearOil.toFixed(1)}%, diff ${r.items.diffOil.toFixed(1)}%, labor ${r.laborPct.toFixed(1)}%, noParts ${r.noPartsPct.toFixed(1)}%`))
    console.log("risk      ", p.riskSummary)
    console.log("monthly   ", p.monthly.filter(m=>m.month<=8).map(m => `${m.month}: ${m.prevMrs}→${m.curMrs}`))

    expect(prev.pmMrs).toBe(1006)
    expect(cur.pmMrs).toBe(777)
    expect(prev.platesPm).toBe(551)
    expect(cur.platesPm).toBe(489)
    expect(prev.platesAll).toBe(589)
    expect(cur.platesAll).toBe(586)
    expect(Math.round(prev.cost)).toBe(4169044)
    expect(Math.round(cur.cost)).toBe(3870536)
    await client.close()
  }, 180_000)
})
