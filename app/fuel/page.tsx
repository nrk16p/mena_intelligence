"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { Upload, Download, Loader2, Fuel } from "lucide-react"

import { FuelUpload }         from "@/components/fuel/fuel-upload"
import { FuelProviderSelect } from "@/components/fuel/fuel-provider-select"
import { FuelTable }          from "@/components/fuel/fuel-table"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function FuelPage() {

  const [file,     setFile]     = useState<File | null>(null)
  const [provider, setProvider] = useState("ppt")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data,     setData]     = useState<any[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function upload() {
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)
    setLoading(true)
    setError(null)
    try {
      const res    = await fetch(`${process.env.NEXT_PUBLIC_URL_API_FUEL}/fuel/${provider}`, { method: "POST", body: formData })
      const result = await res.json()
      setData(result)
    } catch {
      setError("ไม่สามารถเชื่อมต่อ API ได้ กรุณาลองใหม่")
    } finally {
      setLoading(false)
    }
  }

  function downloadExcel() {
    if (!data.length) return
    const ws  = XLSX.utils.json_to_sheet(data)
    const wb  = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Fuel")
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `fuel_${provider}_${Date.now()}.xlsx`)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40">
              <Fuel size={16} className="text-orange-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Fuel Data Transform</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            อัปโหลดไฟล์ Excel จากผู้ให้บริการน้ำมัน เพื่อแปลงข้อมูลให้เป็นมาตรฐาน
          </p>
        </div>
      </div>

      {/* Action card */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] p-5">
        <div className="flex flex-wrap items-end gap-4">

          <FuelProviderSelect value={provider} onChange={setProvider} />
          <FuelUpload onFileSelect={setFile} />

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider opacity-0 select-none">
              action
            </label>
            <button
              onClick={upload}
              disabled={!file || loading}
              className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {loading ? "กำลังประมวลผล..." : "Upload"}
            </button>
          </div>

          {data.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium opacity-0 select-none">action</label>
              <button
                onClick={downloadExcel}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
              >
                <Download size={14} />
                Download Excel
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>
        )}
      </div>

      {/* Empty state */}
      {!loading && !data.length && !error && (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/8 bg-gray-50/50 dark:bg-white/2 py-16 text-center">
          <Fuel size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-700" />
          <p className="text-sm font-medium text-gray-400 dark:text-gray-600">เลือกผู้ให้บริการและอัปโหลดไฟล์</p>
          <p className="text-xs text-gray-400 dark:text-gray-700 mt-1">รองรับไฟล์ .xlsx, .xls, .csv</p>
        </div>
      )}

      {/* Table */}
      {!loading && <FuelTable data={data} />}

    </div>
  )
}
