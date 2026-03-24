"use client"

import { useState } from "react"

interface Props {
  plates: string[]
  value: string
  onChange: (val: string) => void
}

export function PlateSelector({ plates, value, onChange }: Props) {
  const [search, setSearch] = useState("")

  const filtered = plates.filter((p) =>
    p.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="w-64">
      <input
        placeholder="🔍 Search plate..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border p-2 w-full mb-2"
      />

      <div className="border max-h-48 overflow-auto">
        {filtered.map((p) => (
          <div
            key={p}
            onClick={() => {
              onChange(p)
              setSearch(p)
            }}
            className={`p-2 cursor-pointer hover:bg-gray-100 ${
              value === p ? "bg-gray-200 font-semibold" : ""
            }`}
          >
            {p}
          </div>
        ))}
      </div>
    </div>
  )
}