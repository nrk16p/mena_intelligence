"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { FileSpreadsheet, Upload, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"

type FileKey = "ldt_file" | "gpm_file" | "cost_file"

const FILE_CONFIGS: { key: FileKey; label: string; description: string }[] = [
  { key: "ldt_file", label: "LDT File", description: "ไฟล์ผลดารจัดส่ง" },
  { key: "gpm_file", label: "GPM File", description: "ไฟล์ GPM" },
  { key: "cost_file", label: "Cost File", description: "ไฟล์ค่าซ่อม" },
]

function FileDropZone({
  label,
  description,
  file,
  onFileChange,
  disabled,
}: {
  label: string
  description: string
  file: File | null
  onFileChange: (file: File | null) => void
  disabled: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const dropped = e.dataTransfer.files[0]
      if (dropped) onFileChange(dropped)
    },
    [onFileChange]
  )

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-lg border-2 border-dashed p-4 transition-all",
        isDragging && "border-primary bg-primary/5 scale-[1.01]",
        file ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      <label className="flex cursor-pointer items-center gap-4">
        <input
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />

        {/* Icon */}
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          file ? "bg-green-100 text-green-600 dark:bg-green-900/40" : "bg-muted text-muted-foreground"
        )}>
          {file
            ? <CheckCircle2 className="h-5 w-5" />
            : <FileSpreadsheet className="h-5 w-5" />
          }
        </div>

        {/* Text */}
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium leading-none">{label}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {file ? file.name : description}
          </p>
          {file && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
        </div>

        {/* Upload hint or clear */}
        {!file && (
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Upload className="h-3 w-3" />
            <span>Browse</span>
          </div>
        )}
      </label>

      {/* Clear button */}
      {file && !disabled && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onFileChange(null) }}
          className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function FileUploadForm() {
  const [files, setFiles] = useState<Record<FileKey, File | null>>({
    ldt_file: null,
    gpm_file: null,
    cost_file: null,
  })
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const allFilesSelected = Object.values(files).every(Boolean)
  const selectedCount = Object.values(files).filter(Boolean).length

  const setFile = (key: FileKey) => (file: File | null) =>
    setFiles((prev) => ({ ...prev, [key]: file }))

  const handleSubmit = async () => {
    if (!allFilesSelected) return

    setStatus("loading")
    setError(null)

    // Simulate incremental progress since we can't track real upload progress easily
    let tick = 0
    const interval = setInterval(() => {
      tick += 1
      setProgress(Math.min(10 + tick * 7, 85))
    }, 400)

    try {
      const formData = new FormData()
      for (const [key, file] of Object.entries(files)) {
        formData.append(key, file as File)
      }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_URL_API_ALLOCATION}/allocation/upload`,
      {
        method: "POST",
        body: formData,
      }
    )

      clearInterval(interval)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Server error: ${response.status}`)
      }

      setProgress(100)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "allocation_result.xlsx"
      a.click()
      URL.revokeObjectURL(url)

      setStatus("success")
    } catch (err) {
      clearInterval(interval)
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
      setStatus("error")
      setProgress(0)
    }
  }

  const handleReset = () => {
    setFiles({ ldt_file: null, gpm_file: null, cost_file: null })
    setStatus("idle")
    setError(null)
    setProgress(0)
  }

  const isLoading = status === "loading"

  return (
    <Card className="w-full max-w-lg shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Allocation Calculator</CardTitle>
        <CardDescription>
          Upload your three data files to generate the allocation report.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* File drop zones */}
        {FILE_CONFIGS.map(({ key, label, description }) => (
          <FileDropZone
            key={key}
            label={label}
            description={description}
            file={files[key]}
            onFileChange={setFile(key)}
            disabled={isLoading}
          />
        ))}

        {/* Progress */}
        {isLoading && (
          <div className="space-y-1.5">
            <Progress value={progress} className="h-1.5" />
            <p className="text-center text-xs text-muted-foreground">
              Processing your files…
            </p>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Download started successfully.
          </div>
        )}

        {/* Error */}
        {status === "error" && error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={isLoading || !allFilesSelected}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Calculate Allocation
              </>
            )}
          </Button>

          {(status === "success" || status === "error") && (
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>

        {/* File count hint */}
        {status === "idle" && !allFilesSelected && (
          <p className="text-center text-xs text-muted-foreground">
            {selectedCount} of 3 files selected
          </p>
        )}
      </CardContent>
    </Card>
  )
}