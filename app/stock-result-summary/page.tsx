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

type StockSummaryRow = {
  คลังสินค้า?: string
  จุดประสงค์ในการเบิก?: string
  กลุ่มสินค้า?: string
  month_year?: string
  ประเภทยานพาหนะ?: string
  ประเภทรถร่วม?: string
  total_cost?: number
}

type WarehouseSummary = {
  warehouse: string
  total_cost: number
  row_count: number
}

type ProductGroupSummary = {
  product_group: string
  total_cost: number
}

type IssuePurposeSummary = {
  issue_purpose: string
  total_cost: number
  product_groups: ProductGroupSummary[]
}

type ParetoItem = {
  name: string
  total_cost: number
  percentage: number
  cumulative: number
  isTop80: boolean
}

function getCurrentYearMonth() {
  const now = new Date()

  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    monthYear: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  }
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function buildPareto(
  rows: StockSummaryRow[],
  key: keyof StockSummaryRow
): ParetoItem[] {
  const map = new Map<string, number>()

  rows.forEach((row) => {
    const name = String(row[key] || "ไม่ระบุ")
    const total = Number(row.total_cost || 0)

    map.set(name, (map.get(name) || 0) + total)
  })

  const totalCost = Array.from(map.values()).reduce(
    (sum, value) => sum + value,
    0
  )

  let cumulative = 0

  return Array.from(map.entries())
    .map(([name, total_cost]) => ({
      name,
      total_cost,
    }))
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

function ParetoChartSection({
  title,
  subtitle,
  data,
}: {
  title: string
  subtitle: string
  data: ParetoItem[]
}) {
  const chartData = data.map((item) => ({
    name: item.name,
    total_cost: Number(item.total_cost || 0),
    percentage: Number(item.percentage || 0),
    cumulative: Number(item.cumulative || 0),
    isTop80: item.isTop80,
  }))

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {chartData.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No data
        </div>
      ) : (
        <>
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{
                  top: 20,
                  right: 20,
                  left: 20,
                  bottom: 90,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis
                  dataKey="name"
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{
                    fontSize: 11,
                  }}
                />

                <YAxis
                  yAxisId="left"
                  tickFormatter={(value) => Number(value).toLocaleString()}
                  tick={{
                    fontSize: 11,
                  }}
                />

                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{
                    fontSize: 11,
                  }}
                />

                <Tooltip
                  formatter={(value: any, name: any) => {
                    if (name === "total_cost") {
                      return [
                        Number(value).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                        "Total Cost",
                      ]
                    }

                    if (name === "cumulative") {
                      return [`${Number(value).toFixed(1)}%`, "Cumulative %"]
                    }

                    return [value, name]
                  }}
                  labelFormatter={(label) => `รายการ: ${label}`}
                />

                <Bar
                  yAxisId="left"
                  dataKey="total_cost"
                  radius={[6, 6, 0, 0]}
                >
                  {chartData.map((entry, index) => (
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
                  dot={{
                    r: 4,
                  }}
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

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-black" />
              <span>Top 80% cost driver</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-gray-300" />
              <span>Remaining items</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-red-600" />
              <span>Cumulative %</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 border-t border-dashed border-yellow-500" />
              <span>80% line</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function StockResultSummaryPage() {
  const defaultDate = getCurrentYearMonth()

  const [data, setData] = useState<StockSummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [year, setYear] = useState(defaultDate.year)
  const [month, setMonth] = useState(defaultDate.month)

  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("")

  const totalCost = useMemo(() => {
    return data.reduce((sum, row) => sum + Number(row.total_cost || 0), 0)
  }, [data])

  const warehouseSummaries = useMemo<WarehouseSummary[]>(() => {
    const map = new Map<string, WarehouseSummary>()

    data.forEach((row) => {
      const warehouse = row.คลังสินค้า || "ไม่ระบุคลังสินค้า"
      const total = Number(row.total_cost || 0)

      if (!map.has(warehouse)) {
        map.set(warehouse, {
          warehouse,
          total_cost: 0,
          row_count: 0,
        })
      }

      const item = map.get(warehouse)!

      item.total_cost += total
      item.row_count += 1
    })

    return Array.from(map.values()).sort(
      (a, b) => b.total_cost - a.total_cost
    )
  }, [data])

  const filteredData = useMemo(() => {
    if (!selectedWarehouse) return data

    return data.filter((row) => {
      return (row.คลังสินค้า || "ไม่ระบุคลังสินค้า") === selectedWarehouse
    })
  }, [data, selectedWarehouse])

  const filteredTotalCost = useMemo(() => {
    return filteredData.reduce(
      (sum, row) => sum + Number(row.total_cost || 0),
      0
    )
  }, [filteredData])

  const issuePurposeSummaries = useMemo<IssuePurposeSummary[]>(() => {
    const issueMap = new Map<
      string,
      {
        issue_purpose: string
        total_cost: number
        productMap: Map<string, number>
      }
    >()

    filteredData.forEach((row) => {
      const issuePurpose =
        row.จุดประสงค์ในการเบิก || "ไม่ระบุจุดประสงค์"
      const productGroup = row.กลุ่มสินค้า || "ไม่ระบุกลุ่มสินค้า"
      const total = Number(row.total_cost || 0)

      if (!issueMap.has(issuePurpose)) {
        issueMap.set(issuePurpose, {
          issue_purpose: issuePurpose,
          total_cost: 0,
          productMap: new Map<string, number>(),
        })
      }

      const issueItem = issueMap.get(issuePurpose)!

      issueItem.total_cost += total

      issueItem.productMap.set(
        productGroup,
        (issueItem.productMap.get(productGroup) || 0) + total
      )
    })

    return Array.from(issueMap.values())
      .map((item) => ({
        issue_purpose: item.issue_purpose,
        total_cost: item.total_cost,
        product_groups: Array.from(item.productMap.entries())
          .map(([product_group, total_cost]) => ({
            product_group,
            total_cost,
          }))
          .sort((a, b) => b.total_cost - a.total_cost),
      }))
      .sort((a, b) => b.total_cost - a.total_cost)
  }, [filteredData])

  const paretoByIssuePurpose = useMemo(() => {
    return buildPareto(filteredData, "จุดประสงค์ในการเบิก")
  }, [filteredData])

  const paretoByProductGroup = useMemo(() => {
    return buildPareto(filteredData, "กลุ่มสินค้า")
  }, [filteredData])

  async function fetchData() {
    try {
      setLoading(true)
      setError("")
      setSelectedWarehouse("")

      const params = new URLSearchParams()

      if (start && end) {
        params.append("start", start)
        params.append("end", end)
      } else {
        if (year) params.append("year", year)
        if (month) params.append("month", month)
      }

      const response = await fetch(
        `/api/stock-result-summary?${params.toString()}`,
        {
          cache: "no-store",
        }
      )

      const result = await response.json()

      if (!response.ok || result.success === false) {
        throw new Error(result.error || "Failed to fetch data")
      }

      setData(result.data || [])
    } catch (err: any) {
      setError(err.message || "Something went wrong")
      setData([])
    } finally {
      setLoading(false)
    }
  }

  function clearFilter() {
    const current = getCurrentYearMonth()

    setYear(current.year)
    setMonth(current.month)
    setStart("")
    setEnd("")
    setSelectedWarehouse("")
  }

  function downloadExcel() {
    if (!filteredData.length) return

    const exportData = filteredData.map((row) => ({
      month_year: row.month_year || "",
      คลังสินค้า: row.คลังสินค้า || "",
      จุดประสงค์ในการเบิก: row.จุดประสงค์ในการเบิก || "",
      กลุ่มสินค้า: row.กลุ่มสินค้า || "",
      ประเภทยานพาหนะ: row.ประเภทยานพาหนะ || "",
      ประเภทรถร่วม: row.ประเภทรถร่วม || "",
      total_cost: Number(row.total_cost || 0),
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Summary")

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    })

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    saveAs(blob, `stock_result_summary_${Date.now()}.xlsx`)
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock Result Summary</h1>
        <p className="text-sm text-muted-foreground">
          Summary total cost by warehouse, issue purpose and product group.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border bg-white p-4 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Year</label>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2026"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Month</label>
          <input
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            placeholder="5"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Start Month</label>
          <input
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="2026-01"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Use with End Month.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">End Month</label>
          <input
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="2026-05"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Override Year/Month.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2 md:col-span-4">
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Loading..." : "Search"}
          </button>

          <button
            onClick={clearFilter}
            disabled={loading}
            className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          >
            Clear
          </button>

          {filteredData.length > 0 && (
            <button
              onClick={downloadExcel}
              className="rounded-md bg-green-600 px-4 py-2 text-sm text-white"
            >
              Download Excel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Total Rows</p>
          <p className="text-2xl font-bold">
            {data.length.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Total Cost</p>
          <p className="text-2xl font-bold">{formatNumber(totalCost)}</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Selected Cost</p>
          <p className="text-2xl font-bold">
            {formatNumber(filteredTotalCost)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Current Period</p>
          <p className="text-sm font-medium">
            {start && end
              ? `${start} to ${end}`
              : `${year}-${String(month).padStart(2, "0")}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedWarehouse || "All warehouses"}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">Processing...</p>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">คลังสินค้า</h2>
            <p className="text-sm text-muted-foreground">
              Click card to filter dashboard by warehouse.
            </p>
          </div>

          {selectedWarehouse && (
            <button
              onClick={() => setSelectedWarehouse("")}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Show All
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {warehouseSummaries.map((item) => {
            const isActive = selectedWarehouse === item.warehouse
            const percent =
              totalCost > 0 ? (item.total_cost / totalCost) * 100 : 0

            return (
              <button
                key={item.warehouse}
                onClick={() => setSelectedWarehouse(item.warehouse)}
                className={`rounded-xl border bg-white p-4 text-left transition hover:shadow-md ${
                  isActive ? "border-black ring-2 ring-black" : ""
                }`}
              >
                <p className="text-sm text-muted-foreground">คลังสินค้า</p>

                <h3 className="mt-1 line-clamp-1 text-lg font-bold">
                  {item.warehouse}
                </h3>

                <p className="mt-3 text-2xl font-bold">
                  {formatNumber(item.total_cost)}
                </p>

                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-black"
                    style={{
                      width: `${Math.min(percent, 100)}%`,
                    }}
                  />
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {percent.toFixed(1)}% of total |{" "}
                  {item.row_count.toLocaleString()} rows
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Pareto Analysis</h2>
          <p className="text-sm text-muted-foreground">
            {selectedWarehouse
              ? `80/20 analysis filtered by: ${selectedWarehouse}`
              : "80/20 analysis from all warehouses"}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ParetoChartSection
            title="Pareto by จุดประสงค์ในการเบิก"
            subtitle="Bar = total_cost, Line = cumulative %, เส้นประ = 80%"
            data={paretoByIssuePurpose}
          />

          <ParetoChartSection
            title="Pareto by กลุ่มสินค้า"
            subtitle="ดูว่ากลุ่มสินค้าใดเป็น cost driver หลัก"
            data={paretoByProductGroup}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">จุดประสงค์ในการเบิก</h2>
          <p className="text-sm text-muted-foreground">
            {selectedWarehouse
              ? `Filtered by: ${selectedWarehouse}`
              : "Showing all warehouses"}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {issuePurposeSummaries.map((issue) => (
            <div
              key={issue.issue_purpose}
              className="rounded-xl border bg-white p-4"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">
                    จุดประสงค์ในการเบิก
                  </p>
                  <h3 className="line-clamp-2 text-lg font-bold">
                    {issue.issue_purpose}
                  </h3>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm text-muted-foreground">Total Cost</p>
                  <p className="text-xl font-bold">
                    {formatNumber(issue.total_cost)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {issue.product_groups.map((product) => {
                  const percent =
                    issue.total_cost > 0
                      ? (product.total_cost / issue.total_cost) * 100
                      : 0

                  return (
                    <div
                      key={product.product_group}
                      className="rounded-lg border bg-gray-50 p-3"
                    >
                      <p className="line-clamp-2 text-sm font-medium">
                        {product.product_group}
                      </p>

                      <p className="mt-2 text-lg font-bold">
                        {formatNumber(product.total_cost)}
                      </p>

                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-black"
                          style={{
                            width: `${Math.min(percent, 100)}%`,
                          }}
                        />
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {percent.toFixed(1)}% of issue purpose
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {issuePurposeSummaries.length === 0 && !loading && (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
              No data
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b p-4">
          <h2 className="font-semibold">Raw Summary Table</h2>
          <p className="text-sm text-muted-foreground">
            {selectedWarehouse
              ? `Filtered by ${selectedWarehouse}`
              : "All warehouses"}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  month_year
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  คลังสินค้า
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  จุดประสงค์ในการเบิก
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  กลุ่มสินค้า
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  ประเภทยานพาหนะ
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                  ประเภทรถร่วม
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  total_cost
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredData.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No data
                  </td>
                </tr>
              )}

              {filteredData.map((row, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.month_year || "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {row.คลังสินค้า || "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {row.จุดประสงค์ในการเบิก || "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {row.กลุ่มสินค้า || "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {row.ประเภทยานพาหนะ || "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3">
                    {row.ประเภทรถร่วม || "-"}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    {formatNumber(Number(row.total_cost || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}