import clientPromise from "@/lib/mongo"
import { NextResponse } from "next/server"

function parseMulti(param: string | null): string[] {
  if (!param) return []
  return param.split(",").map(s => s.trim()).filter(Boolean)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const branches    = parseMulti(searchParams.get("branch"))
    const sources     = parseMulti(searchParams.get("source"))
    const garages     = parseMulti(searchParams.get("garage"))
    const partsGroups = parseMulti(searchParams.get("partsGroup"))

    const client = await clientPromise
    const col = client.db("atms").collection("repair-analysis")

    // Base match — fields that are not affected by the source correction
    const matchBase: Record<string, unknown> = {}
    if (branches.length)    matchBase["branch"]      = branches.length === 1    ? branches[0]    : { $in: branches }
    if (garages.length)     matchBase["อู่"]          = garages.length === 1     ? garages[0]     : { $in: garages }
    if (partsGroups.length) matchBase["parts_group"] = partsGroups.length === 1 ? partsGroups[0] : { $in: partsGroups }

    // Correct แหล่งอะไหล่: parts_group = ยาง is always อะไหล่คลัง
    const correctSource = {
      $addFields: {
        "แหล่งอะไหล่": {
          $cond: {
            if:   { $eq: ["$parts_group", "ยาง"] },
            then: "อะไหล่คลัง",
            else: "$แหล่งอะไหล่",
          },
        },
      },
    }

    // Source filter applied after correction so ยาง rows are reclassified first
    const sourceStages = sources.length > 0
      ? [{ $match: { "แหล่งอะไหล่": sources.length === 1 ? sources[0] : { $in: sources } } }]
      : []

    // Month-year field: "02/01/2026 21:55" → sortKey "2026/01", label "01/2026"
    const addMonthYear = {
      $addFields: {
        _my_sort: {
          $concat: [
            { $substr: ["$reported_at", 6, 4] },
            "/",
            { $substr: ["$reported_at", 3, 2] },
          ],
        },
        _my_label: {
          $concat: [
            { $substr: ["$reported_at", 3, 2] },
            "/",
            { $substr: ["$reported_at", 6, 4] },
          ],
        },
      },
    }

    const searchTerm = searchParams.get("search")?.trim() ?? ""
    const searchStages = searchTerm
      ? [{
          $match: {
            $or: [
              { plate_no:     { $regex: searchTerm, $options: "i" } },
              { request_code: { $regex: searchTerm, $options: "i" } },
              { mechanic:     { $regex: searchTerm, $options: "i" } },
              { part:         { $regex: searchTerm, $options: "i" } },
              { parts_group:  { $regex: searchTerm, $options: "i" } },
              { remark:       { $regex: searchTerm, $options: "i" } },
            ],
          },
        }]
      : []

    const base = [{ $match: matchBase }, correctSource, ...sourceStages, ...searchStages]

    const [rows, countResult, summary, pivotCost, pivotCount, priceComp, laborPivot] = await Promise.all([
      // Row table (limited to 2000 for display)
      col.aggregate([
        ...base,
        { $sort: { reported_at: -1 } },
        { $limit: 2000 },
        { $project: { _id: 0 } },
      ]).toArray(),

      // Real total matching the filter (not capped)
      col.aggregate([
        ...base,
        { $count: "total" },
      ]).toArray(),

      // Overall summary by แหล่งอะไหล่
      col.aggregate([
        ...base,
        { $group: { _id: "$แหล่งอะไหล่", total_cost: { $sum: "$total" }, count: { $sum: 1 } } },
        { $sort: { total_cost: -1 } },
      ]).toArray(),

      // Pivot: sum total by month-year × แหล่งอะไหล่
      col.aggregate([
        ...base,
        addMonthYear,
        {
          $group: {
            _id: { sortKey: "$_my_sort", label: "$_my_label", source: "$แหล่งอะไหล่" },
            total: { $sum: "$total" },
          },
        },
        { $sort: { "_id.sortKey": 1 } },
      ]).toArray(),

      // Pivot: count unique request_id by month-year × อู่ (ปิด only)
      col.aggregate([
        ...base,
        { $match: { step: "ปิด" } },
        addMonthYear,
        { $group: { _id: { sortKey: "$_my_sort", label: "$_my_label", garage: "$อู่", rid: "$request_id" } } },
        { $group: { _id: { sortKey: "$_id.sortKey", label: "$_id.label", garage: "$_id.garage" }, count: { $sum: 1 } } },
        { $sort: { "_id.sortKey": 1 } },
      ]).toArray(),

      // Price comparison: weighted avg price by parts_group × part × source (คลัง vs ศูนย์/อู่นอก only)
      col.aggregate([
        ...base,
        { $match: { "แหล่งอะไหล่": { $in: ["อะไหล่คลัง", "อะไหล่ศูนย์/อู่นอก"] } } },
        {
          $group: {
            _id:        { parts_group: "$parts_group", part: "$part", source: "$แหล่งอะไหล่" },
            total_cost: { $sum: "$total" },
            total_qty:  { $sum: "$qty" },
            count:      { $sum: 1 },
          },
        },
        { $sort: { "_id.parts_group": 1, "_id.part": 1 } },
      ]).toArray(),

      // Labor pivot: ค่าแรงอู่นอก by branch × parts_group × part × month-year
      col.aggregate([
        ...base,
        { $match: { "แหล่งอะไหล่": "ค่าแรง" } },
        addMonthYear,
        {
          $group: {
            _id:   { sortKey: "$_my_sort", label: "$_my_label", branch: "$branch", parts_group: "$parts_group", part: "$part" },
            total: { $sum: "$total" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.sortKey": 1, "_id.branch": 1, "_id.parts_group": 1, "_id.part": 1 } },
      ]).toArray(),
    ])

    const totalCount = (countResult[0] as { total?: number } | undefined)?.total ?? 0

    const [branchList, sourceList, garageList, partsGroupList] = await Promise.all([
      col.distinct("branch"),
      col.distinct("แหล่งอะไหล่"),
      col.distinct("อู่"),
      col.distinct("parts_group"),
    ])

    return NextResponse.json({
      success: true,
      count: rows.length,
      totalCount,
      summary,
      pivotCost,
      pivotCount,
      priceComp,
      laborPivot,
      filters: {
        branches:    branchList.filter(Boolean).sort(),
        sources:     sourceList.filter(Boolean).sort(),
        garages:     garageList.filter(Boolean).sort(),
        partsGroups: partsGroupList.filter(Boolean).sort(),
      },
      data: rows,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
