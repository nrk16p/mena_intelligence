"use client"

import { useState } from "react"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"

import { FuelUpload } from "@/components/fuel/fuel-upload"
import { FuelProviderSelect } from "@/components/fuel/fuel-provider-select"
import { FuelTable } from "@/components/fuel/fuel-table"

export default function FuelPage() {

  const [file, setFile] = useState<File | null>(null)
  const [provider, setProvider] = useState("ppt")
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function upload() {

    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    setLoading(true)

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL_API_FUEL}/fuel/${provider}`,
      {
        method: "POST",
        body: formData,
      }
    )

    const result = await response.json()

    setData(result)
    setLoading(false)
  }

  function downloadExcel() {

    if (!data.length) return

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
    <div className="space-y-6">

      <h1 className="text-2xl font-bold">
        Fuel Data Transform
      </h1>

      <div className="flex gap-4 items-center">

        <FuelProviderSelect
          value={provider}
          onChange={setProvider}
        />

        <FuelUpload
          onFileSelect={(file) => setFile(file)}
        />

        <button
          onClick={upload}
          className="bg-black text-white px-4 py-2 rounded-md"
        >
          Upload
        </button>

        {data.length > 0 && (
          <button
            onClick={downloadExcel}
            className="bg-green-600 text-white px-4 py-2 rounded-md"
          >
            Download Excel
          </button>
        )}

      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">
          Processing...
        </p>
      )}

      <FuelTable data={data} />

    </div>
  )
}