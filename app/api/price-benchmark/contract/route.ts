import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import clientPromise from "@/lib/mongo"
import { CONTRACT_COLLECTION, escapeRegex, isValidMonth } from "@/lib/price-benchmark"

export const maxDuration = 60

const pad = (n: number) => String(n).padStart(2, "0")

/** Normalise a start/end cell (Date, Excel date, YYYY-MM, พ.ศ. …) to "YYYY-MM" or null. */
function toMonth(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}`
  const s = String(v).trim()
  const norm = (y: number, m: number) => `${y > 2400 ? y - 543 : y}-${pad(m)}` // พ.ศ. → ค.ศ.
  let m = s.match(/(\d{4})[-/.](\d{1,2})/)        // YYYY-MM(-DD)
  if (m) return norm(+m[1], +m[2])
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/)          // MM-YYYY
  if (m) return norm(+m[2], +m[1])
  m = s.match(/^(\d{4})(\d{2})$/)                  // YYYYMM
  if (m) return norm(+m[1], +m[2])
  return null
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const n = Number(String(v ?? "").replace(/[,\s฿]/g, ""))
  return Number.isFinite(n) ? n : null
}

// header alias → canonical field
const HEADERS: Record<string, string[]> = {
  code:     ["รหัสสินค้า", "รหัส", "code", "product_code", "sku"],
  name:     ["ชื่อสินค้า", "ชื่อ", "name", "product_name"],
  supplier: ["ซัพพลายเออร์", "ผู้ขาย", "supplier", "vendor"],
  price:    ["ราคาสัญญา", "ราคา", "contract_price", "price"],
  start:    ["เริ่ม", "วันเริ่ม", "มีผลตั้งแต่", "effective_start", "start", "from"],
  end:      ["สิ้นสุด", "วันสิ้นสุด", "ถึง", "effective_end", "end", "to"],
  note:     ["หมายเหตุ", "note", "remark"],
}

function pick(row: Record<string, unknown>, field: string): unknown {
  const aliases = HEADERS[field]
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase()
    if (aliases.some(a => a.toLowerCase() === k)) return row[key]
  }
  return undefined
}

/** GET: list contracts, optionally filtered by product_code / supplier / effective month. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const productCode = searchParams.get("product_code")?.trim()
    const supplier    = searchParams.get("supplier")?.trim()
    const month       = searchParams.get("month")?.trim()

    const client = await clientPromise
    const col = client.db("atms").collection(CONTRACT_COLLECTION)

    const match: Record<string, unknown> = {}
    if (productCode) match["รหัสสินค้า"]   = { $regex: escapeRegex(productCode), $options: "i" }
    if (supplier)    match["ซัพพลายเออร์"] = { $regex: escapeRegex(supplier), $options: "i" }
    if (month && isValidMonth(month)) {
      match["effective_start"] = { $lte: month }
      match["$or"] = [{ effective_end: null }, { effective_end: { $gte: month } }]
    }

    const data = await col.find(match, { projection: { _id: 0 } })
      .sort({ รหัสสินค้า: 1, effective_start: -1 })
      .toArray()

    return NextResponse.json({ success: true, count: data.length, data })
  } catch (error: any) {
    console.error("price-benchmark/contract GET error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}

/** POST: upload negotiated contract prices from an Excel/CSV file (multipart form, field `file`). */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file")
    const uploadedBy = String(form.get("uploaded_by") ?? "").trim() || "-"

    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "แนบไฟล์ Excel/CSV ในฟิลด์ file" }, { status: 400 })
    }

    const buf = new Uint8Array(await (file as Blob).arrayBuffer())
    const wb = XLSX.read(buf, { type: "array", cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })

    const uploaded_at = new Date()
    const errors: { row: number; reason: string }[] = []
    const ops: any[] = []

    raw.forEach((r, i) => {
      const rowNo = i + 2 // header is row 1
      const code     = String(pick(r, "code") ?? "").trim()
      const supplier = String(pick(r, "supplier") ?? "").trim()
      const price    = toNumber(pick(r, "price"))
      const start    = toMonth(pick(r, "start"))
      const end      = toMonth(pick(r, "end"))
      const name     = String(pick(r, "name") ?? "").trim()
      const note     = String(pick(r, "note") ?? "").trim()

      if (!code)             { errors.push({ row: rowNo, reason: "ไม่มีรหัสสินค้า" }); return }
      if (!supplier)         { errors.push({ row: rowNo, reason: "ไม่มีซัพพลายเออร์" }); return }
      if (price === null)    { errors.push({ row: rowNo, reason: "ราคาสัญญาไม่ถูกต้อง" }); return }
      if (!start)            { errors.push({ row: rowNo, reason: "วันเริ่มมีผลไม่ถูกต้อง (YYYY-MM)" }); return }
      if (end && end < start){ errors.push({ row: rowNo, reason: "วันสิ้นสุดก่อนวันเริ่ม" }); return }

      ops.push({
        updateOne: {
          filter: { รหัสสินค้า: code, ซัพพลายเออร์: supplier, effective_start: start },
          update: {
            $set: {
              ชื่อสินค้า: name,
              contract_price: price,
              effective_end: end,
              note,
              uploaded_by: uploadedBy,
              uploaded_at,
            },
            $setOnInsert: { รหัสสินค้า: code, ซัพพลายเออร์: supplier, effective_start: start },
          },
          upsert: true,
        },
      })
    })

    let upserted = 0, modified = 0
    if (ops.length > 0) {
      const client = await clientPromise
      const res = await client.db("atms").collection(CONTRACT_COLLECTION).bulkWrite(ops, { ordered: false })
      upserted = res.upsertedCount
      modified = res.modifiedCount
    }

    return NextResponse.json({
      success: true,
      total_rows: raw.length,
      accepted: ops.length,
      upserted,
      modified,
      error_count: errors.length,
      errors: errors.slice(0, 50),
    })
  } catch (error: any) {
    console.error("price-benchmark/contract POST error:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
