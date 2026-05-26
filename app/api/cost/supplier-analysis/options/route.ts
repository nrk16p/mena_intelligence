import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const client = await clientPromise
    const col    = client.db("atms").collection("stockmovement_v5")

    const [suppliers, warehouses] = await Promise.all([
      col.distinct("ซัพพลายเออร์", { รับ: { $gt: 0 }, WD: { $in: [null, ""] } }),
      col.distinct("คลังสินค้า",   { รับ: { $gt: 0 }, WD: { $in: [null, ""] } }),
    ])

    const cleanSuppliers = (suppliers as (string | null)[])
      .filter((s): s is string => !!s && s.trim() !== "")
      .sort((a, b) => a.localeCompare(b, "th"))

    const cleanWarehouses = (warehouses as (string | null)[])
      .filter((w): w is string => !!w && w.trim() !== "")
      .sort((a, b) => a.localeCompare(b, "th"))

    return NextResponse.json({ success: true, suppliers: cleanSuppliers, warehouses: cleanWarehouses })
  } catch (error: any) {
    console.error("supplier-analysis/options error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
