"use client"

interface Props {
  onFileSelect: (file: File) => void
}

export function FuelUpload({ onFileSelect }: Props) {
  return (
    <input
      type="file"
      className="border rounded-md px-3 py-2 text-sm"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onFileSelect(file)
      }}
    />
  )
}