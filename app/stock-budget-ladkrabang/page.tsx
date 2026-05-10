"use client"

import { useEffect, useMemo, useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ActualRow = {
  คลังสินค้า?: string
  จุดประสงค์ในการเบิก?: string
  กลุ่มสินค้า?: string
  month_year?: string
  ประเภทยานพาหนะ?: string
  ประเภทรถร่วม?: string
  total_cost?: number
}

type StockRawRow = {
  วันที่?: string
  WD?: string
  คลังสินค้า?: string
  จุดประสงค์ในการเบิก?: string
  รหัสสินค้า?: string
  ชื่อสินค้า?: string
  กลุ่มสินค้า?: string
  เลขรถ?: string
  ทะเบียน?: string
  ราคาทุน?: number
  sum_receive?: number
  sum_issue?: number
  actual_issue?: number
  total_cost?: number
  year?: number
  month?: number
  month_year?: string
  ประเภทรถร่วม?: string
  ประเภทยานพาหนะ?: string
  สาขา?: string
  ฟลีท?: string
}

type BudgetRow = {
  id: string
  คลังสินค้า: string
  จุดประสงค์การเบิก: string
  AccName: string
  ประเภทรถร่วม: string
  ประเภทยานพาหนะ: string
  monthlyBudget: number[]
}

type ControlStatus = "excellent" | "within_budget" | "over_budget"

type ProductGroupBreakdown = {
  กลุ่มสินค้า: string
  total_cost: number
  percentage: number
}

type ProductItemDetail = {
  รหัสสินค้า: string
  ชื่อสินค้า: string
  actual_issue: number
  total_cost: number
  row_count: number
}

type ProductTransactionBreakdown = {
  วันที่: string
  ทะเบียน: string
  total_cost: number
  actual_issue: number
  row_count: number
  percentage: number
  items?: ProductItemDetail[]
}

type ProductCodeSummary = {
  รหัสสินค้า: string
  ชื่อสินค้า: string
  count_product_code: number
  total_cost: number
  actual_issue: number
  transaction_count: number
  percentage: number
}

type CompareRow = {
  id: string
  month: string
  monthLabel: string
  คลังสินค้า: string
  จุดประสงค์การเบิก: string
  AccName: string
  ประเภทรถร่วม: string
  ประเภทยานพาหนะ: string
  budget: number
  targetCost: number
  targetSaving: number
  actualCost: number
  savingFromBudget: number
  overBudgetAmount: number
  gapToSavingTarget: number
  savingAchievedPercent: number
  status: ControlStatus
  breakdownByProductGroup: ProductGroupBreakdown[]
}

type ParetoItem = {
  name: string
  total_cost: number
  percentage: number
  cumulative: number
  isTop80: boolean
}

type CategoryBudgetChartRow = {
  name: string
  budget: number
  targetCost: number
  actualCost: number
  savingFromBudget: number
  overBudgetAmount: number
  status: ControlStatus
}

const YEAR = 2026
const WAREHOUSE = "ลาดกระบัง"

const MONTHS = [
  { key: "2026-01", label: "Jan" },
  { key: "2026-02", label: "Feb" },
  { key: "2026-03", label: "Mar" },
  { key: "2026-04", label: "Apr" },
  { key: "2026-05", label: "May" },
  { key: "2026-06", label: "Jun" },
  { key: "2026-07", label: "Jul" },
  { key: "2026-08", label: "Aug" },
  { key: "2026-09", label: "Sep" },
  { key: "2026-10", label: "Oct" },
  { key: "2026-11", label: "Nov" },
  { key: "2026-12", label: "Dec" },
]

const BUDGET_DATA: BudgetRow[] = [
  {
    id: "repair-ml",
    คลังสินค้า: "ลาดกระบัง",
    จุดประสงค์การเบิก: "ซ่อม or อะไหล่/วัสดุสิ้นเปลือง",
    AccName: "ค่าซ่อมแซม/อะไหล่ - บริการ ML",
    ประเภทรถร่วม: "รถมีนา",
    ประเภทยานพาหนะ: "Mixer 10 ล้อ",
    monthlyBudget: [
      2531964.82, 2800001.52, 2859083.06, 2306553.54, 2633994.17,
      2881811.4, 2681682.02, 2627737.93, 2640990.94, 2700624.69,
      2856349.15, 2921000.67,
    ],
  },
  {
    id: "repair-ms",
    คลังสินค้า: "ลาดกระบัง",
    จุดประสงค์การเบิก: "ซ่อม or อะไหล่/วัสดุสิ้นเปลือง",
    AccName: "ค่าซ่อมแซม/อะไหล่ - บริการ MS",
    ประเภทรถร่วม: "รถมีนา",
    ประเภทยานพาหนะ: "Mixer 6 ล้อ",
    monthlyBudget: [
      744510.6, 744510.6, 744510.6, 744510.6, 744510.6, 744510.6,
      744510.6, 744510.6, 744510.6, 744510.6, 744510.6, 744510.6,
    ],
  },
  {
    id: "tire-ml",
    คลังสินค้า: "ลาดกระบัง",
    จุดประสงค์การเบิก: "ยาง",
    AccName: "ค่ายาง - บริการ ML",
    ประเภทรถร่วม: "รถมีนา",
    ประเภทยานพาหนะ: "Mixer 10 ล้อ",
    monthlyBudget: [
      1085581.81, 1198752.86, 1223698.4, 990408.16, 1128660.87,
      1233294.81, 1148795.74, 1126019.35, 1131615.06, 1156793.76,
      1222544.09, 1249841.39,
    ],
  },
  {
    id: "tire-ms",
    คลังสินค้า: "ลาดกระบัง",
    จุดประสงค์การเบิก: "ยาง",
    AccName: "ค่ายาง - บริการ MS",
    ประเภทรถร่วม: "รถมีนา",
    ประเภทยานพาหนะ: "Mixer 6 ล้อ",
    monthlyBudget: [
      148902.12, 148902.12, 148902.12, 148902.12, 148902.12, 148902.12,
      148902.12, 148902.12, 148902.12, 148902.12, 148902.12, 148902.12,
    ],
  },
  {
    id: "pm-ml",
    คลังสินค้า: "ลาดกระบัง",
    จุดประสงค์การเบิก: "PM น้ำมันเครื่อง or PM ช่วงล่าง or PM ความเเย็น",
    AccName: "ค่า PM - บริการ ML",
    ประเภทรถร่วม: "รถมีนา",
    ประเภทยานพาหนะ: "Mixer 10 ล้อ",
    monthlyBudget: [
      196930.6, 217777.9, 222373.13, 179398.61, 204866.21, 224140.89,
      208575.27, 204379.62, 205410.41, 210048.59, 222160.49, 227188.94,
    ],
  },
  {
    id: "pm-ms",
    คลังสินค้า: "ลาดกระบัง",
    จุดประสงค์การเบิก: "PM น้ำมันเครื่อง or PM ช่วงล่าง or PM ความเเย็น",
    AccName: "ค่า PM - บริการ MS",
    ประเภทรถร่วม: "รถมีนา",
    ประเภทยานพาหนะ: "Mixer 6 ล้อ",
    monthlyBudget: [
      49634.04, 49634.04, 49634.04, 49634.04, 49634.04, 49634.04,
      49634.04, 49634.04, 49634.04, 49634.04, 49634.04, 49634.04,
    ],
  },
]

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateOnly(value?: string) {
  if (!value) return "ไม่ระบุวันที่"
  const text = String(value)
  if (text.includes("T")) return text.split("T")[0]
  if (text.includes(" ")) return text.split(" ")[0]
  return text
}

function getMonthIndex(monthKey: string) {
  return MONTHS.findIndex((month) => month.key === monthKey)
}

function normalizeText(value?: string) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/\u00a0/g, "")
    .toLowerCase()
}

function getControlStatus(
  actualCost: number,
  budget: number,
  targetCost: number
): ControlStatus {
  if (actualCost <= targetCost) return "excellent"
  if (actualCost <= budget) return "within_budget"
  return "over_budget"
}

function getStatusLabel(status: ControlStatus) {
  if (status === "excellent") return "ดีมาก ลดได้ตามเป้า 15%"
  if (status === "within_budget") return "อยู่ในงบ แต่ยังลดไม่ถึง 15%"
  return "เกินงบ ต้องคุมค่าใช้จ่าย"
}

function getStatusShortLabel(status: ControlStatus) {
  if (status === "excellent") return "ดีมาก"
  if (status === "within_budget") return "อยู่ในงบ"
  return "เกินงบ"
}

function getStatusClass(status: ControlStatus) {
  if (status === "excellent") return "border-green-200 bg-green-50 text-green-700"
  if (status === "within_budget") return "border-yellow-200 bg-yellow-50 text-yellow-700"
  return "border-red-200 bg-red-50 text-red-700"
}

function getBadgeClass(status: ControlStatus) {
  if (status === "excellent") return "bg-green-100 text-green-700"
  if (status === "within_budget") return "bg-yellow-100 text-yellow-700"
  return "bg-red-100 text-red-700"
}

function getActualCategory(row: ActualRow | StockRawRow) {
  const issue = normalizeText(row.จุดประสงค์ในการเบิก)
  const group = normalizeText(row.กลุ่มสินค้า)
  const combined = `${issue}${group}`

  if (combined.includes("ยาง") || combined.includes("tire")) return "tire"

  if (
    combined.includes("pm") ||
    combined.includes("น้ำมันเครื่อง") ||
    combined.includes("ช่วงล่าง") ||
    combined.includes("ความเย็น") ||
    combined.includes("ความเเย็น")
  ) {
    return "pm"
  }

  if (
    combined.includes("ซ่อม") ||
    combined.includes("อะไหล่") ||
    combined.includes("วัสดุสิ้นเปลือง")
  ) {
    return "repair"
  }

  return "other"
}

function getBudgetCategory(row: BudgetRow) {
  const text = normalizeText(row.จุดประสงค์การเบิก)

  if (text.includes("ยาง")) return "tire"
  if (text.includes("pm")) return "pm"
  if (text.includes("ซ่อม") || text.includes("อะไหล่")) return "repair"

  return "other"
}

function getVehicleBucket(value?: string) {
  const text = normalizeText(value)

  if (text.includes("10") || text.includes("ml") || text.includes("mixer10")) {
    return "ml"
  }

  if (text.includes("6") || text.includes("ms") || text.includes("mixer6")) {
    return "ms"
  }

  return "other"
}

function matchActualToBudget(actual: ActualRow | StockRawRow, budget: BudgetRow) {
  const actualCategory = getActualCategory(actual)
  const budgetCategory = getBudgetCategory(budget)

  const actualVehicle = getVehicleBucket(actual.ประเภทยานพาหนะ)
  const budgetVehicle = getVehicleBucket(budget.ประเภทยานพาหนะ)

  return actualCategory === budgetCategory && actualVehicle === budgetVehicle
}

function buildProductGroupBreakdown(
  actualRows: ActualRow[]
): ProductGroupBreakdown[] {
  const map = new Map<string, number>()

  actualRows.forEach((row) => {
    const productGroup = row.กลุ่มสินค้า || "ไม่ระบุกลุ่มสินค้า"
    const cost = Number(row.total_cost || 0)
    map.set(productGroup, (map.get(productGroup) || 0) + cost)
  })

  const totalCost = Array.from(map.values()).reduce(
    (sum, value) => sum + value,
    0
  )

  return Array.from(map.entries())
    .map(([กลุ่มสินค้า, total_cost]) => ({
      กลุ่มสินค้า,
      total_cost,
      percentage: totalCost > 0 ? (total_cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost)
}

function buildProductTransactionBreakdown(
  rows: StockRawRow[]
): ProductTransactionBreakdown[] {
  const transactionMap = new Map<
    string,
    {
      วันที่: string
      ทะเบียน: string
      total_cost: number
      actual_issue: number
      row_count: number
      itemMap: Map<
        string,
        {
          รหัสสินค้า: string
          ชื่อสินค้า: string
          actual_issue: number
          total_cost: number
          row_count: number
        }
      >
    }
  >()

  rows.forEach((row) => {
    const date = formatDateOnly(row.วันที่)
    const plate = String(row.ทะเบียน || "ไม่ระบุทะเบียน")
    const productCode = String(row.รหัสสินค้า || "ไม่ระบุรหัสสินค้า")
    const productName = String(row.ชื่อสินค้า || "ไม่ระบุชื่อสินค้า")
    const actualIssue = Number(row.actual_issue || 0)
    const totalCost = Number(row.total_cost || 0)

    const transactionKey = `${date}__${plate}`

    if (!transactionMap.has(transactionKey)) {
      transactionMap.set(transactionKey, {
        วันที่: date,
        ทะเบียน: plate,
        total_cost: 0,
        actual_issue: 0,
        row_count: 0,
        itemMap: new Map(),
      })
    }

    const transaction = transactionMap.get(transactionKey)!

    transaction.total_cost += totalCost
    transaction.actual_issue += actualIssue
    transaction.row_count += 1

    const itemKey = `${productCode}__${productName}`

    if (!transaction.itemMap.has(itemKey)) {
      transaction.itemMap.set(itemKey, {
        รหัสสินค้า: productCode,
        ชื่อสินค้า: productName,
        actual_issue: 0,
        total_cost: 0,
        row_count: 0,
      })
    }

    const item = transaction.itemMap.get(itemKey)!

    item.actual_issue += actualIssue
    item.total_cost += totalCost
    item.row_count += 1
  })

  const grandTotalCost = Array.from(transactionMap.values()).reduce(
    (sum, transaction) => sum + transaction.total_cost,
    0
  )

  return Array.from(transactionMap.values())
    .map((transaction) => ({
      วันที่: transaction.วันที่,
      ทะเบียน: transaction.ทะเบียน,
      total_cost: transaction.total_cost,
      actual_issue: transaction.actual_issue,
      row_count: transaction.row_count,
      percentage:
        grandTotalCost > 0
          ? (transaction.total_cost / grandTotalCost) * 100
          : 0,
      items: Array.from(transaction.itemMap.values()).sort(
        (a, b) => b.total_cost - a.total_cost
      ),
    }))
    .sort((a, b) => b.total_cost - a.total_cost)
}

function buildProductCodeSummary(
  transactions: ProductTransactionBreakdown[]
): ProductCodeSummary[] {
  const map = new Map<
    string,
    {
      รหัสสินค้า: string
      ชื่อสินค้า: string
      count_product_code: number
      total_cost: number
      actual_issue: number
      transactionKeys: Set<string>
    }
  >()

  transactions.forEach((transaction) => {
    const transactionKey = `${transaction.วันที่}__${transaction.ทะเบียน}`
    const items = transaction.items || []

    items.forEach((item) => {
      const productCode = item.รหัสสินค้า || "ไม่ระบุรหัสสินค้า"
      const productName = item.ชื่อสินค้า || "ไม่ระบุชื่อสินค้า"
      const key = `${productCode}__${productName}`

      if (!map.has(key)) {
        map.set(key, {
          รหัสสินค้า: productCode,
          ชื่อสินค้า: productName,
          count_product_code: 0,
          total_cost: 0,
          actual_issue: 0,
          transactionKeys: new Set(),
        })
      }

      const summary = map.get(key)!

      summary.count_product_code += Number(item.row_count || 0)
      summary.total_cost += Number(item.total_cost || 0)
      summary.actual_issue += Number(item.actual_issue || 0)
      summary.transactionKeys.add(transactionKey)
    })
  })

  const totalCost = Array.from(map.values()).reduce(
    (sum, item) => sum + item.total_cost,
    0
  )

  return Array.from(map.values())
    .map((item) => ({
      รหัสสินค้า: item.รหัสสินค้า,
      ชื่อสินค้า: item.ชื่อสินค้า,
      count_product_code: item.count_product_code,
      total_cost: item.total_cost,
      actual_issue: item.actual_issue,
      transaction_count: item.transactionKeys.size,
      percentage: totalCost > 0 ? (item.total_cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost)
}

function buildPareto(rows: CompareRow[], key: keyof CompareRow): ParetoItem[] {
  const map = new Map<string, number>()

  rows.forEach((row) => {
    const name = String(row[key] || "ไม่ระบุ")
    const total = Number(row.actualCost || 0)
    map.set(name, (map.get(name) || 0) + total)
  })

  const totalCost = Array.from(map.values()).reduce(
    (sum, value) => sum + value,
    0
  )

  let cumulative = 0

  return Array.from(map.entries())
    .map(([name, total_cost]) => ({ name, total_cost }))
    .sort((a, b) => b.total_cost - a.total_cost)
    .map((item) => {
      const percentage =
        totalCost > 0 ? (item.total_cost / totalCost) * 100 : 0

      const previousCumulative = cumulative
      cumulative += percentage

      return {
        ...item,
        percentage,
        cumulative,
        isTop80: previousCumulative < 80,
      }
    })
}

function ParetoChart({ data, title }: { data: ParetoItem[]; title: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          ใช้ดูว่า Cost หลักมาจากหมวดไหน เพื่อโฟกัสการคุมงบก่อน
        </p>
      </div>

      {data.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 20, right: 20, bottom: 90, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                interval={0}
                height={100}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => Number(v).toLocaleString()}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (name === "total_cost") {
                    return [formatNumber(Number(value)), "Actual Cost"]
                  }
                  if (name === "cumulative") {
                    return [`${Number(value).toFixed(1)}%`, "Cumulative %"]
                  }
                  return [value, name]
                }}
              />
              <Bar yAxisId="left" dataKey="total_cost" radius={[6, 6, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isTop80 ? "#111827" : "#D1D5DB"}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                stroke="#DC2626"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={() => 80}
                stroke="#F59E0B"
                strokeDasharray="5 5"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function LadkrabangBudgetDashboardPage() {
  const [actualData, setActualData] = useState<ActualRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [selectedMonth, setSelectedMonth] = useState("2026-05")
  const [selectedVehicle, setSelectedVehicle] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")

  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [selectedDetailTitle, setSelectedDetailTitle] = useState("")
  const [selectedDetailRows, setSelectedDetailRows] = useState<
    ProductTransactionBreakdown[]
  >([])

  const [openBreakdownCards, setOpenBreakdownCards] = useState<
    Record<string, boolean>
  >({})

  function toggleBreakdown(cardId: string) {
    setOpenBreakdownCards((prev) => ({
      ...prev,
      [cardId]: !prev[cardId],
    }))
  }

  async function fetchActualData() {
    try {
      setLoading(true)
      setError("")

      const params = new URLSearchParams()
      params.append("year", String(YEAR))
      params.append("warehouse", WAREHOUSE)

      const response = await fetch(
        `/api/stock-result-summary?${params.toString()}`,
        { cache: "no-store" }
      )

      const result = await response.json()

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Failed to fetch stock result summary")
      }

      setActualData(result.data || [])
    } catch (err: any) {
      setError(err.message || "Something went wrong")
      setActualData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchActualData()
  }, [])

  const compareRows = useMemo<CompareRow[]>((() => {
    const rows: CompareRow[] = []

    BUDGET_DATA.forEach((budget) => {
      MONTHS.forEach((month, monthIndex) => {
        const budgetValue = Number(budget.monthlyBudget[monthIndex] || 0)
        const targetCost = budgetValue * 0.85
        const targetSaving = budgetValue * 0.15

        const matchedActualRows = actualData
          .filter((actual) => actual.month_year === month.key)
          .filter((actual) => matchActualToBudget(actual, budget))

        const actualCost = matchedActualRows.reduce(
          (sum, actual) => sum + Number(actual.total_cost || 0),
          0
        )

        const breakdownByProductGroup =
          buildProductGroupBreakdown(matchedActualRows)

        const savingFromBudget = budgetValue - actualCost
        const overBudgetAmount = Math.max(actualCost - budgetValue, 0)
        const gapToSavingTarget = Math.max(actualCost - targetCost, 0)
        const savingAchievedPercent =
          targetSaving > 0 ? (savingFromBudget / targetSaving) * 100 : 0

        const status = getControlStatus(actualCost, budgetValue, targetCost)

        rows.push({
          id: `${budget.id}-${month.key}`,
          month: month.key,
          monthLabel: month.label,
          คลังสินค้า: budget.คลังสินค้า,
          จุดประสงค์การเบิก: budget.จุดประสงค์การเบิก,
          AccName: budget.AccName,
          ประเภทรถร่วม: budget.ประเภทรถร่วม,
          ประเภทยานพาหนะ: budget.ประเภทยานพาหนะ,
          budget: budgetValue,
          targetCost,
          targetSaving,
          actualCost,
          savingFromBudget,
          overBudgetAmount,
          gapToSavingTarget,
          savingAchievedPercent,
          status,
          breakdownByProductGroup,
        })
      })
    })

    return rows
  }) as () => CompareRow[], [actualData])

  const filteredRows = useMemo(() => {
    return compareRows
      .filter((row) => row.month === selectedMonth)
      .filter((row) => !selectedVehicle || row.ประเภทยานพาหนะ === selectedVehicle)
      .filter((row) => !selectedCategory || row.จุดประสงค์การเบิก === selectedCategory)
  }, [compareRows, selectedMonth, selectedVehicle, selectedCategory])

  const monthlySummary = useMemo(() => {
    return MONTHS.map((month) => {
      const rows = compareRows.filter((row) => row.month === month.key)

      const budget = rows.reduce((sum, row) => sum + row.budget, 0)
      const targetCost = rows.reduce((sum, row) => sum + row.targetCost, 0)
      const actualCost = rows.reduce((sum, row) => sum + row.actualCost, 0)
      const savingFromBudget = budget - actualCost
      const targetSaving = budget * 0.15
      const overBudgetAmount = Math.max(actualCost - budget, 0)
      const gapToSavingTarget = Math.max(actualCost - targetCost, 0)
      const savingAchievedPercent =
        targetSaving > 0 ? (savingFromBudget / targetSaving) * 100 : 0

      return {
        month: month.key,
        monthLabel: month.label,
        budget,
        targetCost,
        actualCost,
        savingFromBudget,
        targetSaving,
        overBudgetAmount,
        gapToSavingTarget,
        savingAchievedPercent,
        status: getControlStatus(actualCost, budget, targetCost),
      }
    })
  }, [compareRows])

  const selectedMonthSummary = useMemo(() => {
    const budget = filteredRows.reduce((sum, row) => sum + row.budget, 0)
    const targetCost = filteredRows.reduce((sum, row) => sum + row.targetCost, 0)
    const actualCost = filteredRows.reduce((sum, row) => sum + row.actualCost, 0)

    const targetSaving = budget * 0.15
    const savingFromBudget = budget - actualCost
    const overBudgetAmount = Math.max(actualCost - budget, 0)
    const gapToSavingTarget = Math.max(actualCost - targetCost, 0)
    const savingAchievedPercent =
      targetSaving > 0 ? (savingFromBudget / targetSaving) * 100 : 0

    return {
      budget,
      targetCost,
      actualCost,
      savingFromBudget,
      targetSaving,
      overBudgetAmount,
      gapToSavingTarget,
      savingAchievedPercent,
      status: getControlStatus(actualCost, budget, targetCost),
    }
  }, [filteredRows])

  const yearToMonthSummary = useMemo(() => {
    const selectedIndex = getMonthIndex(selectedMonth)
    const ytmRows = monthlySummary.filter((_, index) => index <= selectedIndex)

    const budget = ytmRows.reduce((sum, row) => sum + row.budget, 0)
    const targetCost = ytmRows.reduce((sum, row) => sum + row.targetCost, 0)
    const actualCost = ytmRows.reduce((sum, row) => sum + row.actualCost, 0)

    const targetSaving = budget * 0.15
    const savingFromBudget = budget - actualCost
    const overBudgetAmount = Math.max(actualCost - budget, 0)
    const gapToSavingTarget = Math.max(actualCost - targetCost, 0)
    const savingAchievedPercent =
      targetSaving > 0 ? (savingFromBudget / targetSaving) * 100 : 0

    return {
      budget,
      targetCost,
      actualCost,
      targetSaving,
      savingFromBudget,
      overBudgetAmount,
      gapToSavingTarget,
      savingAchievedPercent,
      status: getControlStatus(actualCost, budget, targetCost),
      period: `Jan - ${MONTHS[selectedIndex]?.label || ""} ${YEAR}`,
    }
  }, [monthlySummary, selectedMonth])

  const cardAnalysis = useMemo(() => {
    const excellentRows = filteredRows.filter((row) => row.status === "excellent")
    const withinBudgetRows = filteredRows.filter((row) => row.status === "within_budget")
    const overBudgetRows = filteredRows.filter((row) => row.status === "over_budget")

    const passRows = filteredRows.filter((row) => row.status !== "over_budget")
    const totalCards = filteredRows.length
    const passRate = totalCards > 0 ? (passRows.length / totalCards) * 100 : 0

    const overBudgetAmount = overBudgetRows.reduce(
      (sum, row) => sum + row.overBudgetAmount,
      0
    )

    const needMoreSaving = withinBudgetRows.reduce(
      (sum, row) => sum + row.gapToSavingTarget,
      0
    )

    return {
      totalCards,
      excellentRows,
      withinBudgetRows,
      overBudgetRows,
      passRows,
      notPassRows: overBudgetRows,
      passRate,
      overBudgetAmount,
      needMoreSaving,
    }
  }, [filteredRows])

  const overallBudgetChartData = useMemo(() => {
    return [
      {
        name: selectedMonth,
        Budget: selectedMonthSummary.budget,
        "Target Cost": selectedMonthSummary.targetCost,
        "Actual Cost": selectedMonthSummary.actualCost,
      },
    ]
  }, [selectedMonth, selectedMonthSummary])

  const categoryBudgetChartData = useMemo<CategoryBudgetChartRow[]>(() => {
    return filteredRows
      .map((row) => ({
        name: row.AccName,
        budget: row.budget,
        targetCost: row.targetCost,
        actualCost: row.actualCost,
        savingFromBudget: row.savingFromBudget,
        overBudgetAmount: row.overBudgetAmount,
        status: row.status,
      }))
      .sort((a, b) => {
        if (b.overBudgetAmount !== a.overBudgetAmount) {
          return b.overBudgetAmount - a.overBudgetAmount
        }

        return b.actualCost - a.actualCost
      })
  }, [filteredRows])

  const overBudgetRanking = useMemo(() => {
    return categoryBudgetChartData.filter((row) => row.overBudgetAmount > 0)
  }, [categoryBudgetChartData])

  const detailStats = useMemo(() => {
    const uniquePlates = new Set<string>()
    const uniqueProductCodes = new Set<string>()

    let totalCost = 0
    let totalRows = 0

    selectedDetailRows.forEach((transaction) => {
      uniquePlates.add(transaction.ทะเบียน)
      totalCost += Number(transaction.total_cost || 0)
      totalRows += Number(transaction.row_count || 0)

      const items = transaction.items || []
      items.forEach((item) => {
        uniqueProductCodes.add(item.รหัสสินค้า)
      })
    })

    return {
      uniquePlateCount: uniquePlates.size,
      uniqueProductCodeCount: uniqueProductCodes.size,
      productCodeCount: totalRows,
      totalCost,
    }
  }, [selectedDetailRows])

  const productCodeSummary = useMemo(() => {
    return buildProductCodeSummary(selectedDetailRows)
  }, [selectedDetailRows])

  const vehicleOptions = useMemo(() => {
    return Array.from(
      new Set(BUDGET_DATA.map((row) => row.ประเภทยานพาหนะ))
    ).sort()
  }, [])

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(BUDGET_DATA.map((row) => row.จุดประสงค์การเบิก))
    ).sort()
  }, [])

  const paretoByCategory = useMemo(() => {
    return buildPareto(filteredRows, "จุดประสงค์การเบิก")
  }, [filteredRows])

  async function openProductGroupDetail(
    row: CompareRow,
    item: ProductGroupBreakdown
  ) {
    try {
      setDetailLoading(true)
      setDetailError("")
      setSelectedDetailTitle(`${row.AccName} / ${item.กลุ่มสินค้า}`)
      setSelectedDetailRows([])

      const monthNumber = Number(row.month.split("-")[1])

      const params = new URLSearchParams()
      params.append("year", String(YEAR))
      params.append("month", String(monthNumber))
      params.append("warehouse", WAREHOUSE)
      params.append("product_group", item.กลุ่มสินค้า)
      params.append("vehicle_type", row.ประเภทยานพาหนะ)

      const response = await fetch(`/api/stock-result?${params.toString()}`, {
        cache: "no-store",
      })

      const result = await response.json()

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Failed to fetch product detail")
      }

      const rawRows: StockRawRow[] = result.data || []

      const matchedRows = rawRows.filter((actual) =>
        matchActualToBudget(actual, {
          id: row.id,
          คลังสินค้า: row.คลังสินค้า,
          จุดประสงค์การเบิก: row.จุดประสงค์การเบิก,
          AccName: row.AccName,
          ประเภทรถร่วม: row.ประเภทรถร่วม,
          ประเภทยานพาหนะ: row.ประเภทยานพาหนะ,
          monthlyBudget: [],
        })
      )

      setSelectedDetailRows(buildProductTransactionBreakdown(matchedRows))
    } catch (err: any) {
      setDetailError(err.message || "Something went wrong")
      setSelectedDetailRows([])
    } finally {
      setDetailLoading(false)
    }
  }

  function downloadExcel() {
    const summaryData = filteredRows.map((row) => ({
      month: row.month,
      คลังสินค้า: row.คลังสินค้า,
      จุดประสงค์การเบิก: row.จุดประสงค์การเบิก,
      AccName: row.AccName,
      ประเภทรถร่วม: row.ประเภทรถร่วม,
      ประเภทยานพาหนะ: row.ประเภทยานพาหนะ,
      budget: row.budget,
      target_cost_after_15_percent_reduce: row.targetCost,
      target_saving_15_percent: row.targetSaving,
      actual_cost: row.actualCost,
      saving_from_budget: row.savingFromBudget,
      over_budget_amount: row.overBudgetAmount,
      gap_to_saving_target: row.gapToSavingTarget,
      saving_achieved_percent: row.savingAchievedPercent,
      status: getStatusLabel(row.status),
    }))

    const breakdownData = filteredRows.flatMap((row) =>
      row.breakdownByProductGroup.map((item) => ({
        month: row.month,
        คลังสินค้า: row.คลังสินค้า,
        จุดประสงค์การเบิก: row.จุดประสงค์การเบิก,
        AccName: row.AccName,
        ประเภทรถร่วม: row.ประเภทรถร่วม,
        ประเภทยานพาหนะ: row.ประเภทยานพาหนะ,
        กลุ่มสินค้า: item.กลุ่มสินค้า,
        total_cost: item.total_cost,
        percentage_of_card_actual_cost: item.percentage,
      }))
    )

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(summaryData),
      "Budget VS Actual"
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(breakdownData),
      "Product Breakdown"
    )

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    })

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    saveAs(blob, `ladkrabang_budget_vs_actual_${selectedMonth}.xlsx`)
  }

  function downloadProductDetailExcel() {
    if (!selectedDetailRows.length) return

    const transactionData = selectedDetailRows.flatMap((transaction) => {
      const items = transaction.items || []

      return items.map((item) => ({
        วันที่: transaction.วันที่,
        ทะเบียน: transaction.ทะเบียน,
        transaction_total_cost: transaction.total_cost,
        transaction_actual_issue: transaction.actual_issue,
        transaction_row_count: transaction.row_count,
        รหัสสินค้า: item.รหัสสินค้า,
        ชื่อสินค้า: item.ชื่อสินค้า,
        item_actual_issue: item.actual_issue,
        item_total_cost: item.total_cost,
        item_row_count: item.row_count,
        percentage_of_group: transaction.percentage,
      }))
    })

    const productSummaryData = productCodeSummary.map((item) => ({
      รหัสสินค้า: item.รหัสสินค้า,
      ชื่อสินค้า: item.ชื่อสินค้า,
      count_product_code: item.count_product_code,
      transaction_count: item.transaction_count,
      actual_issue: item.actual_issue,
      total_cost: item.total_cost,
      percentage: item.percentage,
    }))

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(productSummaryData),
      "Product Code Summary"
    )

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(transactionData),
      "Transaction Detail"
    )

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    })

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    saveAs(blob, `product_detail_${selectedMonth}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold">
            Ladkrabang Procurement Cost Control 2026
          </h1>
          <p className="text-sm text-muted-foreground">
            คลังสินค้า: {WAREHOUSE} | หลักการ: ยิ่งใช้ต่ำกว่า Budget ยิ่งดี และเป้าหมายสูงสุดคือประหยัดให้ได้ 15%
          </p>
        </div>

        <button
          onClick={fetchActualData}
          disabled={loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold">วิธีอ่าน Dashboard</h2>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="font-bold text-green-700">ดีมาก</p>
            <p className="text-sm text-muted-foreground">
              Actual ต่ำกว่า Target Cost หลังลด 15% แปลว่าคุมงบและลด Cost ได้ตามเป้า
            </p>
          </div>

          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <p className="font-bold text-yellow-700">อยู่ในงบ</p>
            <p className="text-sm text-muted-foreground">
              Actual ยังไม่เกิน Budget แต่ยังลด Cost ไม่ถึงเป้า 15%
            </p>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="font-bold text-red-700">เกินงบ</p>
            <p className="text-sm text-muted-foreground">
              Actual มากกว่า Budget ต้องรีบคุมค่าใช้จ่าย เพราะยิ่งเกินงบยิ่งแย่
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border bg-white p-4 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {MONTHS.map((month) => (
              <option key={month.key} value={month.key}>
                {month.key}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">ประเภทยานพาหนะ</label>
          <select
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">ทั้งหมด</option>
            {vehicleOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">จุดประสงค์การเบิก</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">ทั้งหมด</option>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={downloadExcel}
            className="w-full rounded-md bg-green-600 px-4 py-2 text-sm text-white"
          >
            Download Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Budget</p>
          <p className="text-2xl font-bold">
            {formatNumber(selectedMonthSummary.budget)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Target Cost หลังลด 15%</p>
          <p className="text-2xl font-bold">
            {formatNumber(selectedMonthSummary.targetCost)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Actual Cost</p>
          <p className="text-2xl font-bold">
            {formatNumber(selectedMonthSummary.actualCost)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">ประหยัดจาก Budget</p>
          <p
            className={`text-2xl font-bold ${
              selectedMonthSummary.savingFromBudget >= 0
                ? "text-green-700"
                : "text-red-700"
            }`}
          >
            {formatNumber(selectedMonthSummary.savingFromBudget)}
          </p>

          {selectedMonthSummary.overBudgetAmount > 0 ? (
            <p className="text-xs text-red-700">
              เกินงบ {formatNumber(selectedMonthSummary.overBudgetAmount)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              เป้าประหยัด 15%: {formatNumber(selectedMonthSummary.targetSaving)}
            </p>
          )}
        </div>

        <div
          className={`rounded-xl border p-4 ${getStatusClass(
            selectedMonthSummary.status
          )}`}
        >
          <p className="text-sm text-muted-foreground">Budget Control Status</p>
          <p className="text-2xl font-bold">
            {getStatusShortLabel(selectedMonthSummary.status)}
          </p>
          <p className="text-xs">{getStatusLabel(selectedMonthSummary.status)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 md:col-span-2">
          <p className="text-sm text-muted-foreground">Year to Month Budget</p>
          <p className="text-2xl font-bold">
            {formatNumber(yearToMonthSummary.budget)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Period: {yearToMonthSummary.period}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            YTM saving target 15%: {formatNumber(yearToMonthSummary.targetSaving)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 md:col-span-2">
          <p className="text-sm text-muted-foreground">Year to Month Actual Cost</p>
          <p className="text-2xl font-bold">
            {formatNumber(yearToMonthSummary.actualCost)}
          </p>
          <p
            className={`mt-1 text-xs ${
              yearToMonthSummary.savingFromBudget >= 0
                ? "text-green-700"
                : "text-red-700"
            }`}
          >
            YTM saving from budget:{" "}
            {formatNumber(yearToMonthSummary.savingFromBudget)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Target cost after 15% reduction:{" "}
            {formatNumber(yearToMonthSummary.targetCost)}
          </p>
        </div>

        <div
          className={`rounded-xl border p-4 ${getStatusClass(
            yearToMonthSummary.status
          )}`}
        >
          <p className="text-sm text-muted-foreground">YTM Budget Control</p>
          <p className="text-2xl font-bold">
            {getStatusShortLabel(yearToMonthSummary.status)}
          </p>
          <p className="mt-1 text-xs">{getStatusLabel(yearToMonthSummary.status)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Overall Budget vs Actual</h2>
            <p className="text-sm text-muted-foreground">
              ดูภาพรวมเดือนที่เลือก ว่า Actual เกิน Budget หรือยังอยู่ในงบ
            </p>
          </div>

          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={overallBudgetChartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => Number(value).toLocaleString()} />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    formatNumber(Number(value)),
                    name,
                  ]}
                />

                <Bar dataKey="Budget" fill="#D1D5DB" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Target Cost" fill="#111827" radius={[6, 6, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="Actual Cost"
                  stroke="#DC2626"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 rounded-lg border bg-gray-50 p-3 text-sm">
            {selectedMonthSummary.actualCost > selectedMonthSummary.budget ? (
              <p className="text-red-700">
                ภาพรวมเดือนนี้เกินงบ{" "}
                <span className="font-bold">
                  {formatNumber(selectedMonthSummary.overBudgetAmount)}
                </span>{" "}
                ต้องดูหมวดที่เกินงบด้านขวา
              </p>
            ) : selectedMonthSummary.actualCost <= selectedMonthSummary.targetCost ? (
              <p className="text-green-700">
                ภาพรวมเดือนนี้ดีมาก Actual ต่ำกว่า Target Cost หลังลด 15%
              </p>
            ) : (
              <p className="text-yellow-700">
                ภาพรวมเดือนนี้ยังอยู่ใน Budget แต่ยังลด Cost ไม่ถึงเป้า 15%
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Which Category Makes Over Budget?</h2>
            <p className="text-sm text-muted-foreground">
              เรียงจากหมวดที่เกินงบมากที่สุด เพื่อเห็นตัวที่ทำให้บริษัท Over Budget
            </p>
          </div>

          {overBudgetRanking.length === 0 ? (
            <div className="flex h-[360px] items-center justify-center rounded-lg border bg-green-50 text-sm text-green-700">
              ไม่มีหมวดที่เกิน Budget ในเดือนนี้
            </div>
          ) : (
            <div className="space-y-3">
              {overBudgetRanking.map((row, index) => (
                <div
                  key={`${row.name}-${index}`}
                  className="rounded-lg border border-red-200 bg-red-50 p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-red-700">
                        #{index + 1} {row.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Actual เกิน Budget อยู่ {formatNumber(row.overBudgetAmount)}
                      </p>
                    </div>

                    <p className="shrink-0 text-sm font-bold text-red-700">
                      {formatNumber(row.overBudgetAmount)}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-white p-2">
                      <p className="text-muted-foreground">Budget</p>
                      <p className="font-bold">{formatNumber(row.budget)}</p>
                    </div>

                    <div className="rounded-md bg-white p-2">
                      <p className="text-muted-foreground">Actual</p>
                      <p className="font-bold">{formatNumber(row.actualCost)}</p>
                    </div>

                    <div className="rounded-md bg-white p-2">
                      <p className="text-muted-foreground">Over</p>
                      <p className="font-bold text-red-700">
                        {formatNumber(row.overBudgetAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Budget vs Actual by รายหมวด</h2>
          <p className="text-sm text-muted-foreground">
            เปรียบเทียบ Budget, Target Cost และ Actual Cost ของแต่ละหมวด
          </p>
        </div>

        <div className="h-[520px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={categoryBudgetChartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis
                dataKey="name"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={130}
                tick={{ fontSize: 11 }}
              />

              <YAxis tickFormatter={(value) => Number(value).toLocaleString()} />

              <Tooltip
                formatter={(value: any, name: any) => [
                  formatNumber(Number(value)),
                  name,
                ]}
              />

              <Bar dataKey="budget" name="Budget" fill="#D1D5DB" radius={[6, 6, 0, 0]} />
              <Bar
                dataKey="targetCost"
                name="Target Cost หลังลด 15%"
                fill="#111827"
                radius={[6, 6, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="actualCost"
                name="Actual Cost"
                stroke="#DC2626"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Over Budget Amount by รายหมวด</h2>
          <p className="text-sm text-muted-foreground">
            ยิ่งแท่งสูง แปลว่าหมวดนั้นเป็นตัวทำให้บริษัทเกินงบมากที่สุด
          </p>
        </div>

        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={categoryBudgetChartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis
                dataKey="name"
                angle={-35}
                textAnchor="end"
                interval={0}
                height={130}
                tick={{ fontSize: 11 }}
              />

              <YAxis tickFormatter={(value) => Number(value).toLocaleString()} />

              <Tooltip
                formatter={(value: any, name: any) => [
                  formatNumber(Number(value)),
                  name,
                ]}
              />

              <Bar
                dataKey="overBudgetAmount"
                name="Over Budget Amount"
                radius={[6, 6, 0, 0]}
              >
                {categoryBudgetChartData.map((entry, index) => (
                  <Cell
                    key={`over-budget-${index}`}
                    fill={entry.overBudgetAmount > 0 ? "#DC2626" : "#D1D5DB"}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Card Pass / Not Pass Analysis</h2>
          <p className="text-sm text-muted-foreground">
            วิเคราะห์จาก Card รายหมวดว่าอันไหนคุมงบได้ และอันไหนต้องรีบแก้ไข
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="text-sm text-muted-foreground">Total Cards</p>
            <p className="text-2xl font-bold">{cardAnalysis.totalCards}</p>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-700">ดีมาก</p>
            <p className="text-2xl font-bold text-green-700">
              {cardAnalysis.excellentRows.length}
            </p>
            <p className="text-xs text-green-700">ลดได้ตามเป้า 15%</p>
          </div>

          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-700">อยู่ในงบ</p>
            <p className="text-2xl font-bold text-yellow-700">
              {cardAnalysis.withinBudgetRows.length}
            </p>
            <p className="text-xs text-yellow-700">
              ยังต้องลดเพิ่ม {formatNumber(cardAnalysis.needMoreSaving)}
            </p>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">เกินงบ</p>
            <p className="text-2xl font-bold text-red-700">
              {cardAnalysis.overBudgetRows.length}
            </p>
            <p className="text-xs text-red-700">
              เกินงบรวม {formatNumber(cardAnalysis.overBudgetAmount)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Pass Rate</p>
            <p className="text-sm font-bold">
              {cardAnalysis.passRate.toFixed(1)}%
            </p>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-green-700"
              style={{
                width: `${Math.min(cardAnalysis.passRate, 100)}%`,
              }}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Pass = Card ที่ไม่เกิน Budget รวมทั้ง “ดีมาก” และ “อยู่ในงบ”
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ParetoChart
          data={paretoByCategory}
          title="Pareto by จุดประสงค์การเบิก"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {filteredRows.map((row) => (
          <div
            key={row.id}
            className={`rounded-xl border bg-white p-4 ${
              row.status === "excellent"
                ? "border-green-200"
                : row.status === "within_budget"
                  ? "border-yellow-200"
                  : "border-red-200"
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  {row.จุดประสงค์การเบิก}
                </p>
                <h3 className="text-lg font-bold">{row.AccName}</h3>
                <p className="text-sm text-muted-foreground">
                  {row.ประเภทรถร่วม} | {row.ประเภทยานพาหนะ}
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${getBadgeClass(
                  row.status
                )}`}
              >
                {getStatusShortLabel(row.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-muted-foreground">Budget</p>
                <p className="font-bold">{formatNumber(row.budget)}</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-muted-foreground">Target Cost</p>
                <p className="font-bold">{formatNumber(row.targetCost)}</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="font-bold">{formatNumber(row.actualCost)}</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-muted-foreground">Saving / Over</p>
                <p
                  className={`font-bold ${
                    row.savingFromBudget >= 0 ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {formatNumber(row.savingFromBudget)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border bg-gray-50 p-3">
              <p className="text-sm font-semibold">Card Analysis</p>

              {row.status === "excellent" && (
                <p className="mt-1 text-sm text-green-700">
                  ผ่านดีมาก: Actual ต่ำกว่า Target Cost แล้ว ประหยัดได้ตามเป้า 15%
                </p>
              )}

              {row.status === "within_budget" && (
                <p className="mt-1 text-sm text-yellow-700">
                  ผ่านงบ แต่ยังไม่ถึงเป้าลด 15%: ต้องลดเพิ่มอีก{" "}
                  {formatNumber(row.gapToSavingTarget)}
                </p>
              )}

              {row.status === "over_budget" && (
                <p className="mt-1 text-sm text-red-700">
                  ไม่ผ่าน: Actual เกิน Budget อยู่{" "}
                  {formatNumber(row.overBudgetAmount)} ต้องรีบคุมค่าใช้จ่าย
                </p>
              )}
            </div>

            <div className="mt-5 rounded-lg border bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Breakdown by กลุ่มสินค้า</p>
                  <p className="text-xs text-muted-foreground">
                    กดเพื่อดู Cost แยกตามกลุ่มสินค้า และ drill down ถึง Transaction
                  </p>
                </div>

                <button
                  onClick={() => toggleBreakdown(row.id)}
                  className="rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-gray-100"
                >
                  {openBreakdownCards[row.id] ? "Hide" : "View Breakdown"}
                </button>
              </div>

              {openBreakdownCards[row.id] && (
                <div className="mt-3">
                  {row.breakdownByProductGroup.length === 0 ? (
                    <div className="rounded-md border bg-white p-3 text-center text-sm text-muted-foreground">
                      No actual cost breakdown
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {row.breakdownByProductGroup.map((item) => (
                        <button
                          key={item.กลุ่มสินค้า}
                          onClick={() => openProductGroupDetail(row, item)}
                          className="w-full rounded-md border bg-white p-3 text-left transition hover:border-black hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-medium">
                                {item.กลุ่มสินค้า}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.percentage.toFixed(1)}% of card actual cost
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Click to drill down
                              </p>
                            </div>

                            <p className="shrink-0 text-sm font-bold">
                              {formatNumber(item.total_cost)}
                            </p>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-black"
                              style={{
                                width: `${Math.min(item.percentage, 100)}%`,
                              }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {(selectedDetailTitle || detailLoading || detailError) && (
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h2 className="text-lg font-semibold">Product Detail Breakdown</h2>
              <p className="text-sm text-muted-foreground">
                {selectedDetailTitle || "Select product group"}
              </p>
              <p className="text-xs text-muted-foreground">
                Group by transaction: วันที่ + ทะเบียน
              </p>
            </div>

            <div className="flex gap-2">
              {selectedDetailRows.length > 0 && (
                <button
                  onClick={downloadProductDetailExcel}
                  className="rounded-md bg-green-600 px-3 py-2 text-sm text-white"
                >
                  Download Detail
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedDetailTitle("")
                  setSelectedDetailRows([])
                  setDetailError("")
                }}
                className="rounded-md border px-3 py-2 text-sm"
              >
                Clear Detail
              </button>
            </div>
          </div>

          {detailLoading && (
            <p className="text-sm text-muted-foreground">Loading detail...</p>
          )}

          {detailError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {detailError}
            </div>
          )}

          {!detailLoading && !detailError && selectedDetailRows.length === 0 && (
            <div className="rounded-md border bg-gray-50 p-6 text-center text-sm text-muted-foreground">
              No product detail
            </div>
          )}

          {!detailLoading && selectedDetailRows.length > 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Unique ทะเบียน
                  </p>
                  <p className="text-2xl font-bold">
                    {detailStats.uniquePlateCount.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Unique รหัสสินค้า
                  </p>
                  <p className="text-2xl font-bold">
                    {detailStats.uniqueProductCodeCount.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Count รหัสสินค้า
                  </p>
                  <p className="text-2xl font-bold">
                    {detailStats.productCodeCount.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg border bg-gray-50 p-4">
                  <p className="text-sm text-muted-foreground">
                    Total Cost
                  </p>
                  <p className="text-2xl font-bold">
                    {formatNumber(detailStats.totalCost)}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border bg-white">
                <div className="border-b bg-gray-50 p-4">
                  <h3 className="font-semibold">
                    Summary by รหัสสินค้า
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    รวม total_cost และจำนวนครั้งของแต่ละรหัสสินค้า
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr className="border-b">
                        <th className="whitespace-nowrap px-4 py-3 text-left">
                          รหัสสินค้า
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-left">
                          ชื่อสินค้า
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          Count รหัสสินค้า
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          จำนวน Transaction
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          actual_issue
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          total_cost
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">
                          %
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {productCodeSummary.map((item, index) => (
                        <tr
                          key={`${item.รหัสสินค้า}-${item.ชื่อสินค้า}-${index}`}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            {item.รหัสสินค้า}
                          </td>
                          <td className="px-4 py-3">
                            {item.ชื่อสินค้า}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {item.count_product_code.toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {item.transaction_count.toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {formatNumber(item.actual_issue)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold">
                            {formatNumber(item.total_cost)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {item.percentage.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                {selectedDetailRows.map((transaction, transactionIndex) => {
                  const items = transaction.items || []

                  return (
                    <div
                      key={`${transaction.วันที่}-${transaction.ทะเบียน}-${transactionIndex}`}
                      className="overflow-hidden rounded-lg border bg-white"
                    >
                      <div className="flex flex-col justify-between gap-3 border-b bg-gray-50 p-4 md:flex-row md:items-center">
                        <div>
                          <p className="text-sm text-muted-foreground">
                            Transaction
                          </p>
                          <h3 className="text-base font-bold">
                            {transaction.วันที่} | {transaction.ทะเบียน}
                          </h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-right md:grid-cols-4">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Total Cost
                            </p>
                            <p className="font-bold">
                              {formatNumber(transaction.total_cost)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              Actual Issue
                            </p>
                            <p className="font-bold">
                              {formatNumber(transaction.actual_issue)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">Rows</p>
                            <p className="font-bold">
                              {transaction.row_count.toLocaleString()}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-muted-foreground">
                              % of Group
                            </p>
                            <p className="font-bold">
                              {transaction.percentage.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>

                      {items.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No items in this transaction
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-white">
                              <tr className="border-b">
                                <th className="whitespace-nowrap px-4 py-3 text-left">
                                  รหัสสินค้า
                                </th>
                                <th className="whitespace-nowrap px-4 py-3 text-left">
                                  ชื่อสินค้า
                                </th>
                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                  actual_issue
                                </th>
                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                  total_cost
                                </th>
                                <th className="whitespace-nowrap px-4 py-3 text-right">
                                  จำนวนรายการ
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {items.map((item, itemIndex) => (
                                <tr
                                  key={`${transaction.วันที่}-${transaction.ทะเบียน}-${item.รหัสสินค้า}-${item.ชื่อสินค้า}-${itemIndex}`}
                                  className="border-b hover:bg-gray-50"
                                >
                                  <td className="whitespace-nowrap px-4 py-3">
                                    {item.รหัสสินค้า}
                                  </td>

                                  <td className="px-4 py-3">{item.ชื่อสินค้า}</td>

                                  <td className="whitespace-nowrap px-4 py-3 text-right">
                                    {formatNumber(item.actual_issue)}
                                  </td>

                                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold">
                                    {formatNumber(item.total_cost)}
                                  </td>

                                  <td className="whitespace-nowrap px-4 py-3 text-right">
                                    {item.row_count.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-4">
          <h2 className="font-semibold">Budget VS Actual Table</h2>
          <p className="text-sm text-muted-foreground">
            {WAREHOUSE} | {selectedMonth}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="whitespace-nowrap px-4 py-3 text-left">Month</th>
                <th className="whitespace-nowrap px-4 py-3 text-left">AccName</th>
                <th className="whitespace-nowrap px-4 py-3 text-left">
                  ประเภทยานพาหนะ
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Budget</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Target Cost
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Actual</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  Saving / Over
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left">Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">{row.month}</td>
                  <td className="whitespace-nowrap px-4 py-3">{row.AccName}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.ประเภทยานพาหนะ}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {formatNumber(row.budget)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {formatNumber(row.targetCost)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {formatNumber(row.actualCost)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right ${
                      row.savingFromBudget >= 0 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {formatNumber(row.savingFromBudget)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {getStatusLabel(row.status)}
                  </td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}