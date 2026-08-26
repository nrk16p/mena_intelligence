import clientPromise from "@/lib/mongo"

// ─────────────────────────────────────────────────────────────────────────────
// KPI ซ่อมซ้ำ (Repeat Repair Rate)
//
// งานซ่อม  = 1 (ใบแจ้งซ่อม × ทะเบียน × ประเภทงานซ่อม)
//            ใบเดียวหลายประเภท = นับแยก · ประเภทเดียวหลายบรรทัด = นับครั้งเดียว
// ซ่อมซ้ำ  = ทะเบียนเดียวกัน + ประเภทงานซ่อมเดียวกัน + คนละใบ และแจ้งซ่อมใหม่
//            ภายใน WINDOW วัน นับจาก "วันซ่อมเสร็จ" ของใบก่อนหน้า
//            (ซ่อมเสร็จเมื่อ; ไม่มีใช้ ปิดเมื่อ) — ใบที่ยังไม่เสร็จไม่เป็นฐานนับซ้ำ
// Rate %   = งานซ่อมซ้ำ ÷ งานซ่อมทั้งหมด × 100 (จัดเดือน/สาขาตามใบใหม่)
// ─────────────────────────────────────────────────────────────────────────────

export const DB = "atms"
export const DEFAULT_WINDOW = 30
export const REPORT_FROM = "2026-01" // ธ.ค. 2025 ใช้เป็น lookback เท่านั้น

/**
 * งานที่ซ้ำโดยธรรมชาติ ไม่ใช่ "เสียซ้ำ" — ตัดออกจาก KPI ทางการ
 * (checkbox "รวมในการคำนวณ" / ?planned=1 ดึงกลับเข้ามาได้)
 *
 * ยาง อยู่ในลิสต์นี้ด้วยแม้ไม่ใช่งานตามแผน: รถคันเดียวเปลี่ยนยางคนละเส้น
 * คนละใบภายใน 30 วันเป็นเรื่องปกติ ไม่ใช่ซ่อมแล้วเสียซ้ำ นับรวมแล้วดัน rate
 * ขึ้นโดยไม่ได้สะท้อนคุณภาพงานซ่อม
 */
export const NATURAL_REPEAT_TYPES = [
  "PMช่างมีนา",
  "PMศูนย์บริการ",
  "ระบบบำรุงรักษา",
  "ทำความสะอาด",
  "วัสดุสิ้นเปลือง",
  "น้ำมันเชื้อเพลิง",
  "ต่อภาษี",
  "ตรวจสภาพถังก๊าซ NGV ( ประจำปี )",
  "ยาง",
]

/** ทะเบียนหลอก (งานเบิกเข้าสต็อก ไม่ใช่รถจริง) */
const isDummyPlate = (t: string) => t.includes("0000")

export type RepairEvent = {
  requestId: number
  requestCode: string
  truck: string
  vehicleNo: string
  repairType: string
  branch: string
  ownerType: string
  /** วันแจ้งซ่อม (ISO) */
  reportedAt: string
  /** วันซ่อมเสร็จ/ปิดของใบนี้ (ISO) — null = ยังไม่เสร็จ */
  finishAt: string | null
  ym: string
  isRepeat: boolean
  /** วันห่างจาก "ซ่อมเสร็จ" ของใบก่อนหน้า */
  gapDays: number | null
  prevCode: string | null
  prevFinishAt: string | null
  /** ประเภทงานซ่อมของใบก่อนหน้า — เท่ากับ repairType เสมอโดยโครงสร้าง (จับคู่
   *  ภายในกลุ่ม ทะเบียน|ประเภท) แต่เก็บค่าจริงจากใบที่แมตช์ ไม่ใช่ก๊อปมา
   *  เพื่อให้ตารางตรวจสอบกฎนี้ได้จริง ไม่ใช่แค่ยืนยันตัวเอง */
  prevType: string | null
  description: string
}

type HeaderDoc = {
  request_id: number
  request_code?: string
  plate_no?: string
  vehicle_no?: string
  reported_at?: string
  branch?: string
  owner_type?: string
}
type TaskDoc = { request_id: number; repair_type?: string; description?: string }
type TimingDoc = { request_id: number; garage_finish_at?: string; closed_at?: string }

/** "DD/MM/YYYY HH:MM" (ATMS) → Date | null */
function parseThai(s?: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s.trim())
  if (!m) return null
  const [, d, mo, y, hh, mm] = m
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0))
  return Number.isNaN(dt.getTime()) ? null : dt
}

const p2 = (n: number) => String(n).padStart(2, "0")
const ymOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}`

/** "YYYY-MM-DDTHH:mm" ตามเวลาที่อ่านได้จาก ATMS — ห้ามใช้ toISOString()
 *  (จะแปลงเป็น UTC ทำให้ใบที่แจ้งช่วงเช้ามืดเลื่อนไปวันก่อนหน้า และผลต่างกัน
 *  ระหว่างเครื่อง dev เวลาไทยกับ server ที่รันเป็น UTC) */
const localIso = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`

// ── raw-data cache (ข้อมูล MR เปลี่ยนวันละครั้งจาก cron 02:00) ────────────────
type RawBundle = { headers: HeaderDoc[]; tasks: TaskDoc[]; timing: TimingDoc[]; at: number }
let cache: RawBundle | null = null
const TTL_MS = 10 * 60 * 1000

async function loadRaw(): Promise<RawBundle> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache
  const db = (await clientPromise).db(DB)
  const [headers, tasks, timing] = await Promise.all([
    db.collection<HeaderDoc>("maint_header")
      .find({}, {
        projection: {
          _id: 0, request_id: 1, request_code: 1, plate_no: 1, vehicle_no: 1,
          reported_at: 1, branch: 1, owner_type: 1,
        },
      }).toArray(),
    db.collection<TaskDoc>("maint_tasks")
      .find({}, { projection: { _id: 0, request_id: 1, repair_type: 1, description: 1 } })
      .toArray(),
    db.collection<TimingDoc>("maint_timing")
      .find({}, { projection: { _id: 0, request_id: 1, garage_finish_at: 1, closed_at: 1 } })
      .toArray(),
  ])
  cache = { headers, tasks, timing, at: Date.now() }
  return cache
}

export type BuildOpts = {
  windowDays?: number
  /** true = รวมงานตามแผน (PM ฯลฯ) ไว้ด้วย — ค่าเริ่มต้น false = KPI ทางการ */
  includePlanned?: boolean
}

/** สร้าง event ทั้งหมด (รวมช่วง lookback) พร้อม flag ซ่อมซ้ำ */
export async function buildEvents(opts: BuildOpts = {}): Promise<RepairEvent[]> {
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW
  const { headers, tasks, timing } = await loadRaw()

  const finishById = new Map<number, Date | null>()
  for (const t of timing) {
    finishById.set(t.request_id, parseThai(t.garage_finish_at) ?? parseThai(t.closed_at))
  }

  type H = {
    code: string; truck: string; vehicleNo: string; branch: string; ownerType: string
    ts: Date; finish: Date | null
  }
  const hById = new Map<number, H>()
  for (const h of headers) {
    const ts = parseThai(h.reported_at)
    if (!ts) continue
    const truck = (h.plate_no || "").trim() || (h.vehicle_no || "").trim()
    if (!truck || isDummyPlate(truck)) continue
    hById.set(h.request_id, {
      code: h.request_code || "",
      truck,
      vehicleNo: (h.vehicle_no || "").trim(),
      branch: (h.branch || "").trim() || "ไม่ระบุ",
      ownerType: (h.owner_type || "").trim(),
      ts,
      finish: finishById.get(h.request_id) ?? null,
    })
  }

  const planned = new Set(NATURAL_REPEAT_TYPES)
  // 1 event ต่อ (ใบ × ประเภท) — ประเภทเดียวกันหลายบรรทัดในใบเดียวนับครั้งเดียว
  const seen = new Set<string>()
  const events: RepairEvent[] = []
  for (const t of tasks) {
    const type = (t.repair_type || "").trim()
    if (!type) continue
    if (!opts.includePlanned && planned.has(type)) continue
    const h = hById.get(t.request_id)
    if (!h) continue
    const key = `${t.request_id}|${type}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({
      requestId: t.request_id,
      requestCode: h.code,
      truck: h.truck,
      vehicleNo: h.vehicleNo,
      repairType: type,
      branch: h.branch,
      ownerType: h.ownerType,
      reportedAt: localIso(h.ts),
      finishAt: h.finish ? localIso(h.finish) : null,
      ym: ymOf(h.ts),
      isRepeat: false,
      gapDays: null,
      prevCode: null,
      prevFinishAt: null,
      prevType: null,
      description: (t.description || "").trim(),
    })
  }

  // จัดกลุ่ม ทะเบียน+ประเภท แล้วหาใบก่อนหน้าที่ "ซ่อมเสร็จล่าสุด" ก่อนวันแจ้งใบนี้
  const groups = new Map<string, RepairEvent[]>()
  for (const e of events) {
    const k = `${e.truck}|${e.repairType}`
    const g = groups.get(k)
    if (g) g.push(e)
    else groups.set(k, [e])
  }
  const MS_DAY = 86_400_000
  for (const g of groups.values()) {
    g.sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
    for (let i = 0; i < g.length; i++) {
      const cur = g[i]
      const curTs = Date.parse(cur.reportedAt)
      let best: RepairEvent | null = null
      for (let j = 0; j < i; j++) {
        const p = g[j]
        if (p.requestId === cur.requestId || !p.finishAt) continue
        const pf = Date.parse(p.finishAt)
        if (pf > curTs) continue // ยังไม่เสร็จ ณ วันแจ้งใบนี้
        if (!best || pf > Date.parse(best.finishAt!)) best = p
      }
      if (!best) continue
      const gap = (curTs - Date.parse(best.finishAt!)) / MS_DAY
      if (gap > windowDays) continue
      cur.isRepeat = true
      cur.gapDays = Math.round(gap * 10) / 10
      cur.prevCode = best.requestCode
      cur.prevFinishAt = best.finishAt
      cur.prevType = best.repairType
    }
  }

  return events
}

export type Filters = { branches?: string[]; types?: string[]; year?: string }

export function applyFilters(events: RepairEvent[], f: Filters): RepairEvent[] {
  const br = f.branches?.length ? new Set(f.branches) : null
  const ty = f.types?.length ? new Set(f.types) : null
  return events.filter((e) => {
    if (e.ym < REPORT_FROM) return false // ตัดช่วง lookback ออกจากรายงาน
    if (f.year && e.ym.slice(0, 4) !== f.year) return false
    if (br && !br.has(e.branch)) return false
    if (ty && !ty.has(e.repairType)) return false
    return true
  })
}

type Agg = { key: string; events: number; repeats: number; rate: number }

function aggregate(events: RepairEvent[], keyOf: (e: RepairEvent) => string): Agg[] {
  const m = new Map<string, { events: number; repeats: number }>()
  for (const e of events) {
    const k = keyOf(e)
    const cur = m.get(k) ?? { events: 0, repeats: 0 }
    cur.events++
    if (e.isRepeat) cur.repeats++
    m.set(k, cur)
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, ...v, rate: v.events ? (v.repeats / v.events) * 100 : 0 }))
    .sort((a, b) => b.repeats - a.repeats)
}

export function summarize(events: RepairEvent[]) {
  const total = events.length
  const repeats = events.filter((e) => e.isRepeat).length
  const monthly = aggregate(events, (e) => e.ym).sort((a, b) => a.key.localeCompare(b.key))
  const byType = aggregate(events, (e) => e.repairType)
  const byBranch = aggregate(events, (e) => e.branch)
  // ตัวคั่นห้ามเป็นช่องว่าง — ทั้งสาขา ("คลัง DIST") และประเภท ("ระบบแอร์ ไฟ") มีช่องว่างในตัว
  const matrix = aggregate(events, (e) => `${e.branch}\u0000${e.repairType}`).map((r) => {
    const [branch, repairType] = r.key.split("\u0000")
    return { branch, repairType, events: r.events, repeats: r.repeats, rate: r.rate }
  })

  // ความสุกของข้อมูล — ใบที่ระบุวันเสร็จแล้วคิดเป็นกี่ % (เดือนล่าสุดมักต่ำ → rate ต่ำเทียม)
  const finishedByMonth = new Map<string, { n: number; finished: number }>()
  for (const e of events) {
    const cur = finishedByMonth.get(e.ym) ?? { n: 0, finished: 0 }
    cur.n++
    if (e.finishAt) cur.finished++
    finishedByMonth.set(e.ym, cur)
  }
  const maturity = [...finishedByMonth.entries()]
    .map(([ym, v]) => ({ ym, pct: v.n ? (v.finished / v.n) * 100 : 0 }))
    .sort((a, b) => a.ym.localeCompare(b.ym))

  return {
    total,
    repeats,
    rate: total ? (repeats / total) * 100 : 0,
    monthly,
    byType,
    byBranch,
    matrix,
    maturity,
  }
}

/** รายการ dropdown (จากข้อมูลจริงทั้งหมด ไม่ขึ้นกับ filter ปัจจุบัน) */
export function optionsOf(events: RepairEvent[]) {
  const inRange = events.filter((e) => e.ym >= REPORT_FROM)
  const years = [...new Set(inRange.map((e) => e.ym.slice(0, 4)))].sort()
  const branches = [...new Set(inRange.map((e) => e.branch))].sort()
  const types = [...new Set(inRange.map((e) => e.repairType))].sort()
  return { years, branches, types }
}
