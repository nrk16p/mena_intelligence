"use client"

// Detect date keys by name or value pattern
const DATE_KEY_RE  = /date|วัน|Date/i
const DATE_VAL_RE  = /^\d{4}-\d{2}-\d{2}$/

function formatDate(val: string): string {
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return val
  const [, , mm, dd] = m
  // DD/M/YYYY (no leading zero on month)
  return `${parseInt(dd)}/${parseInt(mm)}/${m[1]}`
}

function formatCell(key: string, val: unknown): string {
  const s = String(val ?? "")
  if (DATE_KEY_RE.test(key) && DATE_VAL_RE.test(s)) return formatDate(s)
  if (DATE_VAL_RE.test(s)) return formatDate(s)
  return s
}

// Number formatting for columns that look numeric
function isNumericKey(key: string) {
  return /liter|litre|amount|price|cost|น้ำมัน|ราคา|จำนวน|baht|thb|km|dist/i.test(key)
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]
}

export function FuelTable({ data }: Props) {
  if (!data.length) return null

  const keys = Object.keys(data[0])

  // Summary stats
  const rowCount = data.length
  const numericKeys = keys.filter(k => isNumericKey(k))

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-4 py-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">รายการทั้งหมด</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{rowCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-4 py-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">คอลัมน์</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{keys.length}</span>
        </div>
        {numericKeys.slice(0, 2).map(k => {
          const sum = data.reduce((acc, row) => acc + (parseFloat(String(row[k])) || 0), 0)
          return (
            <div key={k} className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2">
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{k} รวม</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {sum.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-white/4 border-b border-gray-200 dark:border-white/8">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-10">#</th>
                {keys.map(key => (
                  <th key={key} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-50 dark:border-white/4 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors"
                >
                  <td className="px-4 py-2 text-[11px] text-gray-400 dark:text-gray-600 tabular-nums">{i + 1}</td>
                  {keys.map(key => {
                    const raw  = row[key]
                    const cell = formatCell(key, raw)
                    const isNum = !isNaN(Number(raw)) && raw !== "" && raw !== null
                    return (
                      <td
                        key={key}
                        className={`px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 ${isNum ? "text-right tabular-nums" : ""}`}
                      >
                        {cell}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
