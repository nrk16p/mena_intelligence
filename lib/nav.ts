import {
  BarChart3, Calculator, ClipboardList, FileText, Fuel, History, MapPin, PackageSearch,
  Search, Settings2, Shield, TrendingUp, Trophy, Truck, Users, Warehouse, Wrench,
  type LucideIcon,
} from "lucide-react"

/**
 * One menu config for the sidebar, the ⌘K palette and the home page.
 * Sections are departments; inside, pages are grouped by analysis type. A page's name starts
 * with a word that tells its type (ภาพรวม/ควบคุม = ติดตาม, KPI, วิเคราะห์, ค้นหา, บันทึก/ปันส่วน/คำนวณ/ตั้งค่า).
 * `perm` is the existing permission group the page's layout checks — unchanged, so access stays the same.
 */
export type PageType = "ติดตาม" | "KPI" | "สาเหตุ" | "ค้นหา" | "เครื่องมือ"

export type NavPage = {
  href: string
  label: string
  type: PageType
  perm: string
  icon: LucideIcon
  /** old English name and other words people search with */
  aka?: string
}

export type NavSection = { key: string; label: string; icon: LucideIcon; pages: NavPage[] }

export const PAGE_TYPES: PageType[] = ["ติดตาม", "KPI", "สาเหตุ", "ค้นหา", "เครื่องมือ"]

export const TYPE_HINT: Record<PageType, string> = {
  ติดตาม: "ดูทุกวัน มีอะไรผิดปกติ",
  KPI: "เทียบเป้ารายเดือน",
  สาเหตุ: "เจาะหาสาเหตุ คันไหน อู่ไหน",
  ค้นหา: "หาเอกสาร หรือรถคันเดียว",
  เครื่องมือ: "คำนวณ บันทึก ตั้งค่า",
}

/** Types shown open in the sidebar by default; the rest start folded. */
export const OPEN_TYPES: PageType[] = ["ติดตาม", "KPI"]

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "exec", label: "ผู้บริหาร", icon: BarChart3, pages: [
      { href: "/budget-control", label: "ควบคุมงบประมาณ", type: "ติดตาม", perm: "budget", icon: Calculator, aka: "Budget Control งบ PR WD DD" },
      { href: "/fleet-report", label: "ภาพรวมฟลีท", type: "ติดตาม", perm: "vehicle", icon: FileText, aka: "Fleet Report" },
      { href: "/cost-report", label: "รายงานประจำเดือน (MM)", type: "สาเหตุ", perm: "ops", icon: BarChart3, aka: "MM Report cost group" },
    ],
  },
  {
    key: "repair", label: "ยานยนต์ / ซ่อมบำรุง", icon: Wrench, pages: [
      { href: "/cost", label: "ภาพรวมค่าซ่อมบำรุง", type: "ติดตาม", perm: "ops", icon: Warehouse, aka: "Cost Monitor ต้นทุนซ่อม" },
      { href: "/repeat-repair", label: "KPI งานซ่อมซ้ำ", type: "KPI", perm: "ops", icon: History, aka: "repeat repair ซ่อมซ้ำ" },
      { href: "/breakdown-rate", label: "KPI รถเสียระหว่างงาน", type: "KPI", perm: "vehicle", icon: Wrench, aka: "Breakdown Rate" },
      { href: "/truck-repair-cost", label: "วิเคราะห์ค่าซ่อมรายคัน", type: "สาเหตุ", perm: "vehicle", icon: Truck, aka: "Repair Cost per truck ค่าซ่อมต่อคัน" },
      { href: "/truck-year-cost", label: "วิเคราะห์ค่าซ่อมรายปี", type: "สาเหตุ", perm: "vehicle", icon: BarChart3, aka: "Truck Year Cost" },
      { href: "/repair-analysis", label: "วิเคราะห์ใบแจ้งซ่อม (MR)", type: "สาเหตุ", perm: "ops", icon: BarChart3, aka: "Repair Analysis" },
      { href: "/pm-cost", label: "วิเคราะห์ต้นทุน PM", type: "สาเหตุ", perm: "ops", icon: Wrench, aka: "PM Cost" },
      { href: "/pm-cost-main", label: "วิเคราะห์ต้นทุน PM ตามใบ MR", type: "สาเหตุ", perm: "ops", icon: History, aka: "PM Cost MR" },
      { href: "/pm-mixer", label: "วิเคราะห์ PM มิกเซอร์ ลาดกระบัง", type: "สาเหตุ", perm: "ops", icon: Truck, aka: "PM mixer LB" },
      { href: "/pc-cost", label: "วิเคราะห์ราคาต่อหน่วยอะไหล่", type: "สาเหตุ", perm: "ops", icon: ClipboardList, aka: "PC Cost" },
      { href: "/workshop-summary", label: "วิเคราะห์อู่ใน / อู่นอก", type: "สาเหตุ", perm: "ops", icon: Wrench, aka: "workshop garage" },
      { href: "/transaction-detail", label: "ค้นหารายการเบิก", type: "ค้นหา", perm: "ops", icon: FileText, aka: "Transactions transaction detail WD" },
      { href: "/repair-daily/history", label: "ค้นหาประวัติซ่อม", type: "ค้นหา", perm: "maintenance", icon: History, aka: "Repair daily history" },
      { href: "/repair-daily/vs", label: "บันทึกงานซ่อม VS", type: "เครื่องมือ", perm: "maintenance", icon: Wrench, aka: "Daily Log VS" },
      { href: "/repair-daily/garage", label: "บันทึกงานซ่อมอู่", type: "เครื่องมือ", perm: "maintenance", icon: Wrench, aka: "Daily Log Garage" },
      { href: "/repair-daily/settings", label: "ตั้งค่าเทมเพลตบันทึกซ่อม", type: "เครื่องมือ", perm: "maintenance", icon: Settings2, aka: "Templates" },
      { href: "/repair-cost", label: "ปันส่วนค่าซ่อมตามฟลีท", type: "เครื่องมือ", perm: "ops", icon: Calculator, aka: "Repair Cost allocate upload" },
      { href: "/pm-mapping", label: "ตั้งค่ารหัสงาน PM", type: "เครื่องมือ", perm: "ops", icon: Settings2, aka: "PM Mapping" },
    ],
  },
  {
    key: "delivery", label: "จัดส่ง", icon: Truck, pages: [
      { href: "/truck_utilize_analysis", label: "ภาพรวมการใช้งานรถ", type: "ติดตาม", perm: "vehicle", icon: TrendingUp, aka: "Utilization" },
      { href: "/truck-distance", label: "วิเคราะห์ระยะทางวิ่ง (ตั๋ว)", type: "สาเหตุ", perm: "vehicle", icon: Truck, aka: "Truck Distance ticket" },
      { href: "/gps/distance", label: "วิเคราะห์ระยะทางวิ่ง (GPS)", type: "สาเหตุ", perm: "gps", icon: MapPin, aka: "GPS Distance" },
      { href: "/asia-plant-analysis", label: "วิเคราะห์ผลงานรายแพลนท์", type: "สาเหตุ", perm: "mixer", icon: BarChart3, aka: "Plant Analysis Asia SCCO" },
      { href: "/asia-incentive", label: "คำนวณ Incentive พขร. (Asia)", type: "เครื่องมือ", perm: "mixer", icon: Trophy, aka: "Asia Incentive driver" },
    ],
  },
  {
    key: "fuel", label: "เชื้อเพลิง", icon: Fuel, pages: [
      { href: "/fuel", label: "ภาพรวมการใช้เชื้อเพลิง", type: "ติดตาม", perm: "fuel", icon: Fuel, aka: "Fuel Management น้ำมัน" },
    ],
  },
  {
    key: "purchasing", label: "จัดซื้อ", icon: PackageSearch, pages: [
      { href: "/price-benchmark", label: "วิเคราะห์ราคาเทียบราคากลาง", type: "สาเหตุ", perm: "procurement", icon: TrendingUp, aka: "Price Benchmark ราคากลาง" },
      { href: "/supplier-analysis", label: "วิเคราะห์ผู้ขาย", type: "สาเหตุ", perm: "procurement", icon: Users, aka: "Suppliers supplier" },
      { href: "/procurement-search", label: "ค้นหาเอกสารจัดซื้อ (PR / PO)", type: "ค้นหา", perm: "procurement", icon: Search, aka: "Procurement Search PR PO" },
    ],
  },
  {
    key: "store", label: "สโตร์ / คลัง", icon: Warehouse, pages: [
      { href: "/stock-budget-ladkrabang", label: "ควบคุมงบเบิกสโตร์", type: "ติดตาม", perm: "procurement", icon: PackageSearch, aka: "Stock Budget ลาดกระบัง" },
      { href: "/stock-onhand-kpi", label: "KPI สต๊อกคงเหลือ", type: "KPI", perm: "procurement", icon: Warehouse, aka: "stock onhand" },
      { href: "/deadstock-kpi", label: "KPI Dead Stock", type: "KPI", perm: "procurement", icon: Warehouse, aka: "dead stock" },
    ],
  },
  {
    key: "admin", label: "ตั้งค่าระบบ", icon: Shield, pages: [
      { href: "/admin/users", label: "ตั้งค่าผู้ใช้", type: "เครื่องมือ", perm: "admin", icon: Users, aka: "Users" },
      { href: "/admin/groups", label: "ตั้งค่ากลุ่มสิทธิ์", type: "เครื่องมือ", perm: "admin", icon: Shield, aka: "Groups permission" },
    ],
  },
]

export const ALL_PAGES: NavPage[] = NAV_SECTIONS.flatMap((s) => s.pages)

/** Sections with only the pages this user may open; empty sections dropped. */
export function visibleSections(allowedGroups: string[]): NavSection[] {
  const allowed = new Set(allowedGroups)
  return NAV_SECTIONS
    .map((s) => ({ ...s, pages: s.pages.filter((p) => allowed.has(p.perm)) }))
    .filter((s) => s.pages.length > 0)
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}

/** The page and section the user is on, if any. */
export function findActive(pathname: string): { section: NavSection; page: NavPage } | null {
  for (const section of NAV_SECTIONS) {
    const page = section.pages.find((p) => isActivePath(pathname, p.href))
    if (page) return { section, page }
  }
  return null
}

const norm = (s: string) => s.toLowerCase().replace(/[\s()/_-]+/g, "")

/** Pages matching every word of the query (Thai name, old English name or path), best first. */
export function searchPages(query: string, pages: NavPage[]): NavPage[] {
  const words = query.trim().split(/\s+/).map(norm).filter(Boolean)
  if (!words.length) return pages
  const scored: { p: NavPage; score: number }[] = []
  for (const p of pages) {
    const label = norm(p.label)
    const hay = label + " " + norm(p.aka ?? "") + " " + norm(p.href)
    if (!words.every((w) => hay.includes(w))) continue
    const score = label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2
    scored.push({ p, score })
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.p)
}

export function sectionOf(href: string): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.pages.some((p) => p.href === href))
}
