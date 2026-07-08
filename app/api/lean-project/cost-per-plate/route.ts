import clientPromise from "@/lib/mongo";
import { getCostGroup } from "@/lib/cost-groups";
import { NextResponse } from "next/server";

// คลังสินค้า → warehouse bucket (unexpected values fall into อื่น ๆ)
const WAREHOUSE_GROUPS: Record<string, string> = {
  "คลังลาดกระบัง": "ลาดกระบัง + ขอนแก่น",
  "คลังขอนแก่น":   "ลาดกระบัง + ขอนแก่น",
  "คลังสระบุรี":    "สระบุรี + DIST",
  "คลัง DIST":     "สระบุรี + DIST",
};

type PivotRow = {
  warehouse_group: string;
  cost_group: string;
  year: string;
  total_cost: number;
};

export async function GET() {
  try {
    const client = await clientPromise;
    const col = client.db("datawarehouse").collection("dw_stockmovement");

    const raw = await col
      .aggregate([
        {
          $group: {
            _id: {
              year: { $substrCP: ["$month_year", 0, 4] },
              purpose: "$จุดประสงค์ในการเบิก",
              warehouse: "$คลังสินค้า",
            },
            total_cost: { $sum: "$total_cost" },
          },
        },
      ])
      .toArray();

    const acc = new Map<string, PivotRow>();
    for (const r of raw) {
      const warehouse_group =
        WAREHOUSE_GROUPS[(r._id.warehouse ?? "").trim()] ?? "อื่น ๆ";
      const cost_group = getCostGroup(r._id.purpose || "");
      const year = r._id.year;
      const key = `${warehouse_group}|${cost_group}|${year}`;
      const cur = acc.get(key);
      if (cur) cur.total_cost += r.total_cost;
      else acc.set(key, { warehouse_group, cost_group, year, total_cost: r.total_cost });
    }

    return NextResponse.json({ success: true, data: [...acc.values()] });
  } catch (error: any) {
    console.error("lean-project/cost-per-plate API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
