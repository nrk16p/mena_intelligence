"use client"

interface Props {
  value: string
  onChange: (value: string) => void
}

const PROVIDERS = [
  { value: "ppt",      label: "PTT" },
  { value: "bangchak", label: "Bangchak" },
  { value: "caltex",   label: "Caltex" },
  { value: "saraburi", label: "Saraburi" },
  { value: "rayong",   label: "Rayong" },
]

export function FuelProviderSelect({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        ผู้ให้บริการ
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f1117] text-sm px-3 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 min-w-[140px]"
      >
        {PROVIDERS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
    </div>
  )
}
