"use client"

import { useRef, useState } from "react"
import { Upload, X, FileSpreadsheet } from "lucide-react"

interface Props {
  onFileSelect: (file: File) => void
}

export function FuelUpload({ onFileSelect }: Props) {
  const inputRef           = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    onFileSelect(file)
  }

  function clear() {
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        ไฟล์ Excel
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-white/15 bg-white dark:bg-[#0f1117] px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        >
          <Upload size={14} />
          {fileName ? (
            <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <FileSpreadsheet size={13} className="text-emerald-500" />
              <span className="max-w-[160px] truncate text-xs">{fileName}</span>
            </span>
          ) : (
            <span>เลือกไฟล์...</span>
          )}
        </button>
        {fileName && (
          <button onClick={clear} className="text-gray-400 hover:text-red-500 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
