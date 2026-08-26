/**
 * ATMS warehouses (คลังสินค้า) — the single source of truth for both server and
 * client. Kept free of any `mongodb` import on purpose so a client component
 * can import it directly; that is what killed the old arrangement, where
 * `lib/price-benchmark.ts` and `components/branch-filter.tsx` each carried
 * their own hand-maintained copy of the list.
 *
 * Mirrors cost_saving_project/atms_inventories.py (the extractor's copy).
 * Scraped from the report form's <select name="inventory_id"> on 2026-08-26.
 */

export type Warehouse = { id: string; name: string }

/** Functional grouping — drives the section headings in the branch filter. */
export const WAREHOUSE_GROUPS: { label: string; items: Warehouse[] }[] = [
  {
    label: "อะไหล่/สต็อกหลัก",
    items: [
      { id: "4",  name: "คลังลาดกระบัง" },
      { id: "3",  name: "คลังสระบุรี" },
      { id: "11", name: "คลังขอนแก่น" },
      { id: "24", name: "คลัง DIST" },
    ],
  },
  {
    label: "HR",
    items: [
      { id: "5",  name: "คลัง HR กรุงเทพ" },
      { id: "6",  name: "คลัง HR ลาดกระบัง" },
      { id: "7",  name: "คลัง HR สระบุรี" },
      { id: "26", name: "คลัง DIST HR สระบุรี" },
      { id: "37", name: "คลัง HR-ศูนย์จัดส่งบางปะกง" },
    ],
  },
  {
    label: "จป.",
    items: [
      { id: "8",  name: "คลัง จป.สระบุรี" },
      { id: "9",  name: "คลัง จป.ลาดกระบัง" },
      { id: "16", name: "คลัง จป. ขอนแก่น" },
      { id: "25", name: "คลัง DIST จป.สระบุรี" },
      { id: "31", name: "คลัง DIST จป.ขอนแก่น" },
    ],
  },
  {
    label: "ทรัพย์สิน",
    items: [
      { id: "10", name: "คลังทรัพย์สิน" },
      { id: "17", name: "คลังทรัพย์สินลาดกระบัง" },
      { id: "18", name: "คลังทรัพย์สินสระบุรี" },
    ],
  },
  {
    label: "จัดส่ง",
    items: [
      { id: "23", name: "คลังจัดส่ง ลาดกระบัง" },
      { id: "32", name: "คลัง DIST จัดส่ง ขอนแก่น" },
      { id: "38", name: "คลังจัดส่ง (บางปะกง)" },
      { id: "40", name: "คลังจัดส่่ง (สระบุรี)" },   // sic — ATMS label has a double ่
    ],
  },
  {
    label: "ไม่มีสต๊อก",
    items: [
      { id: "15", name: "คลังไม่มีสต๊อก ลาดกระบัง" },
      { id: "21", name: "คลังไม่มีสต๊อก สระบุรี" },
      { id: "22", name: "คลังไม่มีสต๊อก กรุงเทพฯ" },
    ],
  },
  {
    label: "หน่วยงานสนับสนุน",
    items: [
      { id: "12", name: "คลัง IT" },
      { id: "13", name: "คลังฝ่ายขาย" },
      { id: "35", name: "คลัง OPS" },
      { id: "36", name: "คลังฝ่ายสำนักเลขา" },
      { id: "39", name: "คลัง บัญชีการเงิน สกท." },
    ],
  },
  {
    label: "อื่น ๆ",
    items: [
      { id: "33", name: "คลัง DIST ขอนแก่น (SB)" },
      { id: "34", name: "คลัง TDM" },
      // Present in movement rows but with no resolvable ATMS inventory_id, so
      // both carry a synthetic id from a reserved 900+ range — see RETIRED in
      // the Python copy. 901 was deleted from ATMS; 902 is still active but
      // absent from the report form's dropdown.
      { id: "901", name: "คลัง DIST ขอนแก่น" },
      { id: "902", name: "คลังฝ่ายขายและรถร่วม" },
    ],
  },
]

/** Every warehouse name, in group order. */
export const WAREHOUSE_NAMES: string[] =
  WAREHOUSE_GROUPS.flatMap((g) => g.items.map((w) => w.name))

/**
 * The four spare-parts warehouses the extractor pulled before 2026-08-26.
 *
 * Every consumer other than /price-benchmark is calibrated on these — the
 * stock-onhand and dead-stock KPI bands, /cost/*, and dw_stockmovement — so
 * they pin to this list and their numbers do not move now that the other 28
 * warehouses are in stockmovement_v5.
 */
export const LEGACY_WAREHOUSES = [
  "คลังลาดกระบัง",
  "คลังสระบุรี",
  "คลังขอนแก่น",
  "คลัง DIST",
]
