"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"

interface Props {
  provider: string
  onDataLoaded: (data: any[]) => void
}

export function FuelUpload({ provider, onDataLoaded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleUpload = async () => {
    if (!file) return

    setLoading(true)

    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL_API_FUEL}/fuel/${provider}`,
      {
        method: "POST",
        body: formData,
      }
    )

    const result = await response.json()

    setData(result)
    onDataLoaded(result)

    setLoading(false)
  }

  const downloadExcel = (data: any[]) => {
    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(workbook, worksheet, "Fuel")

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    })

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    saveAs(blob, `fuel_transform_${Date.now()}.xlsx`)
  }

  return (
    <div className="flex items-center gap-3">

      {/* Choose File */}
      <input
        type="file"
        className="border rounded-md px-3 py-2 text-sm"
        onChange={(e) => {
          const selected = e.target.files?.[0]
          if (selected) setFile(selected)
        }}
      />

      {/* Upload */}
      <button
        onClick={handleUpload}
        className="bg-black text-white px-4 py-2 rounded"
      >
        {loading ? "Processing..." : "Upload"}
      </button>

      {/* Download */}
      {data.length > 0 && (
        <button
          onClick={() => downloadExcel(data)}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Download Excel
        </button>
      )}

    </div>
  )
}