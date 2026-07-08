import clientPromise from "@/lib/mongo";
import { getCostGroup } from "@/lib/cost-groups";
import { NextResponse } from "next/server";

// Source: atms.stockmovement_v5 (2023-01+), processed with the SAME rules the
// ext_WD_data ETL uses to build dw_stockmovement (the /cost source):
//   1. only rows with a WD (withdrawal document)
//   2. group by WD+date+item+plate+price+supplier, net returns against issues:
//      actual_issue = max(sum จ่าย - sum รับ, 0)
//   3. total_cost = actual_issue × ราคาทุน
// dw itself additionally filters month_year to 2025|2026 — we skip that filter,
// which is what gives this page 2023+ history with /cost-identical semantics.

// คลังสินค้า → warehouse bucket (unexpected values fall into อื่น ๆ)
const WAREHOUSE_GROUPS: Record<string, string> = {
  "คลังลาดกระบัง": "ลาดกระบัง + ขอนแก่น",
  "คลังขอนแก่น":   "ลาดกระบัง + ขอนแก่น",
  "คลังสระบุรี":    "สระบุรี + DIST",
  "คลัง DIST":     "สระบุรี + DIST",
};

// v5 has no partner_flag column; plate → flag comes from dw_stockmovement
const FLEET_FLAGS: Record<string, string[]> = {
  mena:    ["รถมีนา"],
  partner: ["รถร่วมมีนา", "รถร่วมMC", "รถร่วมภายนอกบริษัท"],
};

type PivotRow = {
  warehouse_group: string;
  cost_group: string;
  year: string;
  total_cost: number;
  plate_count: number;
};

type PlateCount = { warehouse_group?: string; year: string; plate_count: number };

function addTo(map: Map<string, Set<string>>, key: string, plates: string[]) {
  let s = map.get(key);
  if (!s) { s = new Set(); map.set(key, s); }
  for (const p of plates) s.add(p);
}

// Dummy plates (e.g. สบ.00000) carry cost but are not real trucks — keep their
// cost in totals, exclude them from unique-plate counts.
function isRealPlate(p: string): boolean {
  return !!p && !p.includes("00000");
}

// Recomputing takes 15-30s (two-stage aggregation over ~450k rows), so results
// are snapshotted per fleet in Mongo. Normal loads read the snapshot; ?refresh=1
// recomputes and overwrites it.
export const maxDuration = 60;

const SNAPSHOT_COLLECTION = "lean_cost_per_plate_snapshot";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fleet = searchParams.get("fleet") || "all"; // all | mena | partner
    const refresh = searchParams.get("refresh") === "1";

    const client = await clientPromise;
    const snapshots = client.db("datawarehouse").collection(SNAPSHOT_COLLECTION);

    if (!refresh) {
      const snap = await snapshots.findOne({ fleet });
      if (snap?.payload) {
        return NextResponse.json({ ...snap.payload, generated_at: snap.generated_at });
      }
    }

    const payload = await computePayload(client, fleet);
    const generated_at = new Date();
    await snapshots.replaceOne({ fleet }, { fleet, payload, generated_at }, { upsert: true });

    return NextResponse.json({ ...payload, generated_at });
  } catch (error: any) {
    console.error("lean-project/cost-per-plate API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

async function computePayload(client: Awaited<typeof clientPromise>, fleet: string) {
  {
    const v5 = client.db("atms").collection("stockmovement_v5");

    // Mirror the ETL exactly: WD.notna() + pandas groupby dropping rows where
    // any groupby key is NaN (supplier is the only key the ETL fills first).
    const match: Record<string, any> = {
      WD: { $ne: null },
      วันที่: { $ne: null },
      คลังสินค้า: { $ne: null },
      จุดประสงค์ในการเบิก: { $ne: null },
      รหัสสินค้า: { $ne: null },
      ชื่อสินค้า: { $ne: null },
      กลุ่มสินค้า: { $ne: null },
      เลขรถ: { $ne: null },
      ทะเบียน: { $ne: null },
    };

    if (fleet && FLEET_FLAGS[fleet]) {
      const flagRows = await client
        .db("datawarehouse")
        .collection("dw_stockmovement")
        .aggregate([
          { $match: { ทะเบียน: { $nin: [null, ""] }, partner_flag: { $in: FLEET_FLAGS[fleet] } } },
          { $group: { _id: "$ทะเบียน" } },
        ])
        .toArray();
      match.ทะเบียน = { $in: flagRows.map((r) => r._id) };
    }

    const raw = await v5
      .aggregate(
        [
          { $match: match },
          // Stage 1: WD+item granularity (mirrors the ETL's groupby), netting
          // receipts (returns) against issues within each group.
          {
            $group: {
              _id: {
                date: "$วันที่",
                wd: "$WD",
                warehouse: "$คลังสินค้า",
                purpose: "$จุดประสงค์ในการเบิก",
                sku: "$รหัสสินค้า",
                sku_name: "$ชื่อสินค้า",
                sku_group: "$กลุ่มสินค้า",
                truck_no: "$เลขรถ",
                plate: "$ทะเบียน",
                price: { $ifNull: ["$ราคาทุน", 0] },
                supplier: { $ifNull: ["$ซัพพลายเออร์", ""] },
              },
              sum_receive: { $sum: { $ifNull: ["$รับ", 0] } },
              sum_issue: { $sum: { $ifNull: ["$จ่าย", 0] } },
            },
          },
          {
            $project: {
              year: { $dateToString: { format: "%Y", date: "$_id.date" } },
              month: { $dateToString: { format: "%Y-%m", date: "$_id.date" } },
              purpose: "$_id.purpose",
              warehouse: "$_id.warehouse",
              plate: "$_id.plate",
              line_cost: {
                $multiply: [
                  { $max: [{ $subtract: ["$sum_issue", "$sum_receive"] }, 0] },
                  { $ifNull: ["$_id.price", 0] },
                ],
              },
            },
          },
          // Stage 2: roll up to year × purpose × warehouse for the pivot
          {
            $group: {
              _id: { year: "$year", purpose: "$purpose", warehouse: "$warehouse" },
              total_cost: { $sum: "$line_cost" },
              plates: { $addToSet: "$plate" },
              months: { $addToSet: "$month" },
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray();

    // Costs are summed; unique plates merged as sets at row / bucket / year level
    const costAcc = new Map<string, Omit<PivotRow, "plate_count">>();
    const rowPlates    = new Map<string, Set<string>>(); // bucket|cg|year
    const cgPlates     = new Map<string, Set<string>>(); // bucket|cg (all years)
    const yearMonths   = new Map<string, Set<string>>(); // year → distinct months
    const bucketPlates = new Map<string, Set<string>>(); // bucket|year
    const bucketAll    = new Map<string, Set<string>>(); // bucket (all years)
    const yearPlates   = new Map<string, Set<string>>(); // year
    const grandAll     = new Set<string>();

    for (const r of raw) {
      const warehouse_group =
        WAREHOUSE_GROUPS[(r._id.warehouse ?? "").trim()] ?? "อื่น ๆ";
      const cost_group = getCostGroup(r._id.purpose || "");
      const year = r._id.year;
      const plates: string[] = (r.plates ?? []).filter(isRealPlate);

      const key = `${warehouse_group}|${cost_group}|${year}`;
      const cur = costAcc.get(key);
      if (cur) cur.total_cost += r.total_cost;
      else costAcc.set(key, { warehouse_group, cost_group, year, total_cost: r.total_cost });

      addTo(rowPlates, key, plates);
      addTo(cgPlates, `${warehouse_group}|${cost_group}`, plates);
      addTo(yearMonths, year, (r.months ?? []).filter(Boolean));
      addTo(bucketPlates, `${warehouse_group}|${year}`, plates);
      addTo(bucketAll, warehouse_group, plates);
      addTo(yearPlates, year, plates);
      for (const p of plates) grandAll.add(p);
    }

    const data: PivotRow[] = [...costAcc.entries()].map(([key, row]) => ({
      ...row,
      plate_count: rowPlates.get(key)?.size ?? 0,
    }));

    const cg_total_plate_counts = [...cgPlates.entries()].map(([key, s]) => {
      const [warehouse_group, cost_group] = key.split("|");
      return { warehouse_group, cost_group, plate_count: s.size };
    });
    const months_per_year = [...yearMonths.entries()].map(([year, s]) => ({
      year,
      months: s.size,
    }));

    const bucket_plate_counts: PlateCount[] = [...bucketPlates.entries()].map(([key, s]) => {
      const [warehouse_group, year] = key.split("|");
      return { warehouse_group, year, plate_count: s.size };
    });
    const bucket_total_plate_counts = [...bucketAll.entries()].map(([warehouse_group, s]) => ({
      warehouse_group,
      plate_count: s.size,
    }));
    const year_plate_counts: PlateCount[] = [...yearPlates.entries()].map(([year, s]) => ({
      year,
      plate_count: s.size,
    }));

    return {
      success: true,
      data,
      cg_total_plate_counts,
      months_per_year,
      bucket_plate_counts,
      bucket_total_plate_counts,
      year_plate_counts,
      total_plate_count: grandAll.size,
    };
  }
}
